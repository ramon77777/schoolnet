// SCHOOLNET S4-D.3l — CREATE A FRESH DISPOSABLE LOCAL LAB ONLY.
// Uses Docker CLI and the dedicated supabase test config. NEVER hosted API.
// If local fixtures already exist, refuse rather than resetting/destroying data.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT=fileURLToPath(new URL("../",import.meta.url));
const FIX=join(ROOT,"tests","s4c3c35-supabase-ci");
const expected="schoolnet_s4c3c35_full_auth_http_ci";
const ENV_FILE=join(ROOT,".env.s4d3l.local");
const CRED_FILE=join(ROOT,"tests","s4d3l",".lab-credentials.local");
const API="http://127.0.0.1:55421";
const read=path=>readFileSync(join(ROOT,path),"utf8");
function run(binary,args,opts={}){
 const r=spawnSync(binary,args,{
  cwd:opts.cwd||ROOT,encoding:"utf8",input:opts.input,
  timeout:120_000,maxBuffer:8_000_000,
  ...(process.platform==="win32"&&/\.cmd$/.test(binary)?{shell:true}:{}),
 });
 if(r.error||r.status!==0)
  throw new Error("Local tool unavailable or failed: "+binary+" "+
    args.filter(x=>!x.includes("=")).slice(0,5).join(" ")+
    ". Verify Docker Desktop, CLI and a fresh disposable instance.");
 return r.stdout||"";
}
function supabase(args){
 try{return run(process.platform==="win32"?"supabase.exe":"supabase",args,{cwd:FIX});}
 catch{return run(process.platform==="win32"?"npx.cmd":"npx",
  ["--yes","supabase@2.122.1",...args],{cwd:FIX});}
}
function parseEnv(source){
 const result={};
 for(const line of source.split(/\r?\n/)){
  const m=line.match(/^([A-Z_]+)=["']?(.*?)["']?$/);
  if(m)result[m[1]]=m[2];
 }
 return result;
}
const d=read("tests/s4c3c35-supabase-ci/supabase/config.toml");
if(!d.includes('project_id = "'+expected+'"')||
   !d.includes("port = 55421")||!d.includes("port = 55422"))
 throw Error("Unexpected Supabase config. Refusing to set up the laboratory.");
if(existsSync(ENV_FILE)||existsSync(CRED_FILE))
 throw Error("Existing S4-D.3l laboratory configuration. Refusing to overwrite it.");

const status=parseEnv(supabase(["status","-o","env"]));
if(status.API_URL!==API||!status.ANON_KEY||!status.SERVICE_ROLE_KEY)
 throw Error("Supabase must be the dedicated local instance on port 55421.");
const names=run("docker",["ps","--format","{{.Names}}"])
 .split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const container="supabase_db_"+expected;
if(!names.includes(container))
 throw Error("Expected isolated Docker database "+container+" not running.");
const callSql=(sql,vars={})=>{
 const entries=Object.entries(vars).flatMap(([name,value])=>["-v",name+"="+value]);
 return run("docker",[
  "exec","-i",container,"psql","-X","-U","postgres","-d","postgres",
  "-v","ON_ERROR_STOP=1",...entries,"-f","-",
 ],{input:sql});
};

// Fail closed BEFORE creating any accounts or tables in an existing database.
const clean=callSql("SELECT CASE WHEN to_regclass('public.profiles') IS NULL"+
 " AND to_regclass('public.schoolnet_schools') IS NULL"+
 " AND (SELECT count(*) FROM auth.users)=0 THEN 'PRISTINE' ELSE 'NOT_PRISTINE' END;");
if(!clean.includes("PRISTINE")||clean.includes("NOT_PRISTINE"))
 throw Error("This local database is not fresh. Do not overwrite existing data.");

const schemaFiles=[
 "tests/s4c3c35-supabase-ci/fixtures/official-averages-auth-schema.sql",
 "supabase/proposals/s4c3c3_official_curriculum_and_general_average_kernel.sql",
 "supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql",
 "supabase/proposals/s4d3b_school_report_card_authorized_preview.sql",
 "tests/s4d3k/disposable-bulletin-workflow.sql",
];
for(const path of schemaFiles){
 callSql(read(path));
 console.log("Local fixture installed: "+path.split("/").at(-1));
}
const namesForAccounts=[
 "admin_a","admin_b","teacher_a","teacher_b","parent_a",
 "student_a1","student_a2","student_a3","student_b1","student_transfer",
 "approver_a",
];
const people={};
async function http(path,token,body,method="POST"){
 const resp=await fetch(API+path,{
  method,
  headers:{apikey:status.ANON_KEY,Authorization:"Bearer "+token,
   "Content-Type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(25_000),
 });
 const data=await resp.json().catch(()=>null);
 if(!resp.ok)throw Error("Local Auth/RPC failed: "+path+" HTTP "+resp.status);
 return data;
}
for(const name of namesForAccounts){
 const email="schoolnet-s4d3l-"+name+"@example.test";
 const password=randomBytes(18).toString("hex");
 const data=await http("/auth/v1/admin/users",status.SERVICE_ROLE_KEY,
  {email,password,email_confirm:true});
 if(!data.id)throw Error("Local user creation failed: "+name);
 people[name]={id:data.id,email,password};
}
const vars=Object.fromEntries(Object.entries(people).map(([k,v])=>[k,v.id]));
callSql(read("tests/s4c3c35-supabase-ci/fixtures/official-averages-auth-seed.sql"),vars);
async function setCurriculum(name,school,period,cls,subjects){
 const {email,password}=people[name];
 const session=await http("/auth/v1/token?grant_type=password",
  status.ANON_KEY,{email,password});
 const jwt=session.access_token;
 if(!jwt)throw Error("Local password session unavailable for "+name);
 for(const action of ["set","approve"]){
  const result=await http("/rest/v1/rpc/schoolnet_school_official_curriculum",jwt,{
   p_school_id:school,p_period_id:period,p_class_id:cls,
   p_action:action,p_subject_ids:action==="set"?subjects:null,
  });
  if(action==="approve"&&result?.status!=="approved")
   throw Error("Local fictional curriculum approval failed");
 }
}
await setCurriculum("admin_a",
 "00000000-0000-4000-8000-000000000010",
 "00000000-0000-4000-8000-000000000040",
 "00000000-0000-4000-8000-000000000030",
 ["00000000-0000-4000-8000-000000000050",
  "00000000-0000-4000-8000-000000000051"]);
await setCurriculum("admin_b",
 "00000000-0000-4000-8000-000000000011",
 "00000000-0000-4000-8000-000000000041",
 "00000000-0000-4000-8000-000000000031",
 ["00000000-0000-4000-8000-000000000050"]);
callSql(read("tests/s4d3k/disposable-seed.sql"),vars);
callSql(read("tests/s4d3l/disposable-case-read-and-login.sql"));
callSql("NOTIFY pgrst, 'reload schema';");

const env=[
 "# S4-D.3l — intentionally LOCAL and disposable. Do not use hosted secrets.",
 "VITE_SUPABASE_URL="+API,
 "VITE_SUPABASE_ANON_KEY="+status.ANON_KEY,
 "VITE_SCHOOLNET_S4D3L_LAB=1",
 "",
].join("\n");
writeFileSync(ENV_FILE,env,{flag:"wx",mode:0o600});
const credentials={
 apiUrl:API,
 requester:{email:people.admin_a.email,password:people.admin_a.password},
 decisionMaker:{email:people.approver_a.email,password:people.approver_a.password},
};
writeFileSync(CRED_FILE,JSON.stringify(credentials,null,2)+"\n",
 {flag:"wx",mode:0o600});
console.log("\nS4-D.3l LOCAL SUPABASE READY. No hosted database was contacted.");
console.log("Local credentials written to tests/s4d3l/.lab-credentials.local (gitignored).");
console.log("Run: npm run dev -- --mode s4d3l --port 5174");
console.log("Open http://localhost:5174/app/school/official-documents?schoolnet_s4d3l_lab=1");
console.log("Login with requester then switch to decisionMaker (see local credentials file).");
