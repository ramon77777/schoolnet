// SCHOOLNET Lot 5D-N - REAL HTTP Gateway verify_jwt=true + GoTrue + Edge.
// Only disposable local Supabase CLI Docker, synthetic families, no hosted IO.
import assert from "node:assert/strict";
import {test} from "node:test";
import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

const url=process.env.SCHOOLNET_K_LOCAL_URL??"";
const dbUrl=process.env.SCHOOLNET_K_LOCAL_DB_URL??"";
const anon=process.env.SCHOOLNET_K_LOCAL_ANON_KEY??"";
const secret=process.env.SCHOOLNET_K_LOCAL_SERVICE_KEY??"";
const scratch=process.env.SCHOOLNET_N_STACK_DIR??"";
const runner=process.env.RUNNER_TEMP??"";
let api,db;
try{api=new URL(url);db=new URL(dbUrl);}
catch{throw Error("N: missing disposable local Supabase stack");}
if(process.env.CI!=="true"||!runner||
   resolve(scratch)!==resolve(runner,"schoolnet-5dn-stack")||
   api.protocol!=="http:"||api.hostname!=="127.0.0.1"||
   api.port!=="54321"||api.pathname!=="/"||
   (db.protocol!=="postgres:"&&db.protocol!=="postgresql:")||
   db.hostname!=="127.0.0.1"||db.port!=="54322"||
   db.pathname!=="/postgres"||!anon||!secret)
 throw Error("N: local-only CI preflight refused");
for(const name of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL",
 "SUPABASE_PROJECT_ID","VITE_SUPABASE_URL"]){
 if(process.env[name])throw Error("N: hosted credential environment forbidden");
}
const endpoint=url.replace(/\/$/,"")+
  "/functions/v1/schoolnet-parent-current-class";
const ORIGIN="http://127.0.0.1:54321";
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const service=createClient(url,secret,opts);
const client=()=>createClient(url,anon,opts);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pwd="schoolnet-5dn-local-fixture!2026";
const user={},email={},sessions={},clients={},years={},classes={};
const unwrap=(r,label)=>{if(r.error)throw Error(label+": "+r.error.message);return r.data;};
function sql(q){
 return execFileSync("psql",[dbUrl,"-X","-q","-t","-A",
   "-v","ON_ERROR_STOP=1","-c",q],{
   encoding:"utf8",timeout:15000,env:{...process.env,PGCONNECT_TIMEOUT:"5"},
 }).trim();
}
function count(id){
 assert.match(id,UUID);
 return Number(sql("SELECT COALESCE((SELECT request_count FROM "+
  "schoolnet_private.parent_read_rate_windows WHERE actor_id='"+
  id+"'::uuid),0)"));
}
async function call({bearer=null,includeApikey=true,origin=ORIGIN,
 method="POST",body={action:"list_current_classes"},
 contentType="application/json"}={}){
 const headers={origin};
 if(includeApikey)headers.apikey=anon;
 if(bearer!==null)headers.authorization="Bearer "+bearer;
 if(contentType)headers["content-type"]=contentType;
 const response=await fetch(endpoint,{
  method,headers,body:method==="POST" ?
   (typeof body==="string"?body:JSON.stringify(body)) : undefined,
  redirect:"error",signal:AbortSignal.timeout(20000),
 });
 const text=await response.text();
 let json=null;try{json=JSON.parse(text);}catch{}
 return {status:response.status,headers:response.headers,json,text};
}
async function makeUser(name,role,tag){
 email[name]="lot5dn-"+name.toLowerCase()+"-"+tag+"@example.test";
 const r=await service.auth.admin.createUser({email:email[name],
   password:pwd,email_confirm:true});
 const v=unwrap(r,"create fake local auth user").user;
 assert.match(v.id,UUID);user[name]=v.id;
 return {id:v.id,role,full_name:name+" (fictif)"};
}
async function signIn(name){
 const c=client();
 const r=unwrap(await c.auth.signInWithPassword({
   email:email[name],password:pwd}),"real sign-in");
 assert.equal(r.user.id,user[name]);sessions[name]=r.session;clients[name]=c;
 return r.session.access_token;
}
test("5D-N - JWT gateway ON on real disposable Supabase local Edge",async t=>{
 await t.test("N01 - actual scratch function explicitly enables JWT at gateway",async()=>{
   const cfg=await readFile(join(scratch,"supabase/config.toml"),"utf8");
   const section=cfg.split("[functions.schoolnet-parent-current-class]")[1];
   assert.ok(section,"local function config must exist");
   assert.match(section,/verify_jwt = true/);
   assert.doesNotMatch(section,/verify_jwt = false/);
   const edge=await readFile(join(scratch,"supabase/functions/schoolnet-parent-current-class/index.ts"),"utf8");
   assert.match(edge,/SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP/);
 });
 await t.test("N02 - real Auth and local PostgreSQL are healthy",async()=>{
   const r=await fetch(url+"auth/v1/health");
   assert.equal(r.ok,true);
   assert.equal(sql("SELECT current_database()"),"postgres");
   assert.equal(sql("SELECT to_regprocedure('public.schoolnet_parent_read_gate(uuid,uuid)') IS NOT NULL"),"t");
 });
 await t.test("N03 - create five synthetic Auth accounts and isolated school years",async()=>{
   const tag=randomUUID().slice(0,8);
   const profiles=[];
   for(const [name,role] of [["parentA","parent"],["parentB","parent"],
    ["studentA","student"],["studentB","student"],["admin","admin"]]){
    profiles.push(await makeUser(name,role,tag));
   }
   unwrap(await service.from("profiles").insert(profiles),"synthetic profiles");
   unwrap(await service.from("parent_links").insert([
     {parent_id:user.parentA,student_id:user.studentA},
     {parent_id:user.parentB,student_id:user.studentB},
   ]),"family links");
   years.old=unwrap(await service.from("school_years")
     .insert({name:"2025-2026",is_current:false})
     .select("id").single(),"history year").id;
   years.current=unwrap(await service.from("school_years")
     .insert({name:"2026-2027",is_current:true})
     .select("id").single(),"current fake year").id;
   const cls=unwrap(await service.from("classes").insert([
    {name:"6e A",school_year_id:years.old},
    {name:"5e B",school_year_id:years.current},
    {name:"4e C",school_year_id:years.current},
   ]).select("id,name"),"synthetic classes");
   for(const x of cls)classes[x.name]=x.id;
   unwrap(await service.from("student_enrollments").insert([
    {student_id:user.studentA,school_year_id:years.old,class_id:classes["6e A"],status:"completed"},
    {student_id:user.studentA,school_year_id:years.current,class_id:classes["5e B"],status:"active"},
    {student_id:user.studentB,school_year_id:years.current,class_id:classes["4e C"],status:"active"},
   ]),"annual records");
   assert.equal(sql("SELECT count(*) FROM public.student_enrollments"),"3");
 });
 await t.test("N04 - GoTrue signs four real session JWTs",async()=>{
   for(const name of ["parentA","parentB","studentA","admin"]){
     const jwt=await signIn(name);assert.ok(jwt.length>50);
     const auth=await service.auth.getUser(jwt);
     assert.ifError(auth.error);assert.equal(auth.data.user.id,user[name]);
   }
 });
 await t.test("N05 - valid signed JWT reaches Edge and malformed JSON returns Edge 400",async()=>{
   const r=await call({bearer:sessions.parentA.access_token,body:"{"});
   assert.equal(r.status,400,"Gateway must accept valid signed user token");
   assert.equal(r.json?.ok,false);
 });
 await t.test("N06 - no bearer and no API key is denied at perimeter",async()=>{
   const r=await call({includeApikey:false,body:"{"});
   assert.equal(r.status,401);
   assert.notEqual(r.json?.children?.length,1);
 });
 await t.test("N07 - forged JWT without API key is denied before malformed body",async()=>{
   const original=sessions.parentA.access_token;
   const pieces=original.split(".");
   const claims=JSON.parse(Buffer.from(pieces[1],"base64url").toString());
   claims.sub=user.parentB;
   const forged=[pieces[0],Buffer.from(JSON.stringify(claims)).toString("base64url"),pieces[2]].join(".");
   const r=await call({bearer:forged,includeApikey:false,body:"{"});
   assert.equal(r.status,401);
   assert.equal(r.json?.children,undefined);
 });
 await t.test("N08 - random invalid bearer without API key is denied",async()=>{
   const r=await call({bearer:"invalid.fake.signature",includeApikey:false,body:"{"});
   assert.equal(r.status,401);
 });
 await t.test("N09 - missing bearer even with legacy anon API key never reads family",async()=>{
   const r=await call();
   assert.equal(r.status,401);
   assert.equal(r.json?.children,undefined);
 });
 await t.test("N10 - genuine Parent A JWT returns only student A current class",async()=>{
   const r=await call({bearer:sessions.parentA.access_token});
   assert.equal(r.status,200);
   assert.equal(r.json?.school_year_id,years.current);
   assert.deepEqual(r.json?.children,[{student_id:user.studentA,state:"current",class_name:"5e B"}]);
   assert.equal(JSON.stringify(r.json).includes(user.studentB),false);
   assert.equal(JSON.stringify(r.json).includes("6e A"),false);
   assert.equal(r.headers.get("cache-control"),"no-store, max-age=0");
 });
 await t.test("N11 - genuine Parent B JWT never exposes other family",async()=>{
   const r=await call({bearer:sessions.parentB.access_token});
   assert.equal(r.status,200);
   assert.deepEqual(r.json?.children,[{student_id:user.studentB,state:"current",class_name:"4e C"}]);
   assert.equal(JSON.stringify(r.json).includes(user.studentA),false);
 });
 await t.test("N12 - signed Admin identity rejected by Edge role check",async()=>{
   const r=await call({bearer:sessions.admin.access_token});
   assert.equal(r.status,403);assert.equal(r.json?.children,undefined);
 });
 await t.test("N13 - signed Student identity rejected by Edge role check",async()=>{
   const r=await call({bearer:sessions.studentA.access_token});
   assert.equal(r.status,403);assert.equal(r.json?.children,undefined);
 });
 await t.test("N14 - foreign Origin is denied even with genuine JWT",async()=>{
   const r=await call({bearer:sessions.parentA.access_token,
     origin:"https://attacker.invalid"});
   assert.equal(r.status,403);
   assert.equal(count(user.parentA),1);
 });
 await t.test("N15 - forged parent_id body fails before reading family",async()=>{
   const r=await call({bearer:sessions.parentA.access_token,
     body:{action:"list_current_classes",parent_id:user.parentB}});
   assert.equal(r.status,400);
   assert.equal(count(user.parentA),1);
 });
 await t.test("N16 - invalid JWT with well-formed body is denied",async()=>{
   const r=await call({bearer:"invalid.fake.signature"});
   assert.equal(r.status,401);assert.equal(r.json?.children,undefined);
   assert.equal(count(user.parentA),1);
 });
 await t.test("N17 - per-Parent quota is still enforced via real HTTP with gateway ON",async()=>{
   for(let i=0;i<11;i++){
     const r=await call({bearer:sessions.parentA.access_token});
     assert.equal(r.status,200,"HTTP user token "+i);
   }
   assert.equal((await call({bearer:sessions.parentA.access_token})).status,429);
   assert.equal(count(user.parentA),12);
   assert.equal((await call({bearer:sessions.parentB.access_token})).status,200);
   assert.equal(count(user.parentB),2);
 });
 await t.test("N18 - second signed session cannot bypass first Parent's quota",async()=>{
   const c=client();
   const fresh=unwrap(await c.auth.signInWithPassword({
     email:email.parentA,password:pwd}),"second valid Parent login");
   const r=await call({bearer:fresh.session.access_token});
   assert.equal(r.status,429);assert.equal(count(user.parentA),12);
 });
 await t.test("N19 - signOut revokes still-signed JWT at private SQL session gate",async()=>{
   const old=sessions.parentB.access_token;
   unwrap(await clients.parentB.auth.signOut(),"actual local signOut");
   const r=await call({bearer:old});
   assert.equal(r.status,401);
   assert.equal(r.json?.children,undefined);
   assert.equal(count(user.parentB),2);
 });
 await t.test("N20 - role downgrade to Teacher blocks a new signed-in session",async()=>{
   const fresh=await signIn("parentB");
   unwrap(await service.from("profiles").update({role:"teacher"})
     .eq("id",user.parentB),"synthetic role change");
   const r=await call({bearer:fresh});
   assert.equal(r.status,403);
   assert.equal(count(user.parentB),2);
 });
 await t.test("N21 - private SQL gate outage denies with HTTP 503",async()=>{
   sql("REVOKE EXECUTE ON FUNCTION public.schoolnet_parent_read_gate(uuid,uuid) FROM service_role");
   try {
     const r=await call({bearer:sessions.parentA.access_token});
     assert.equal(r.status,503);
     assert.equal(r.json?.children,undefined);
   } finally {
     sql("GRANT EXECUTE ON FUNCTION public.schoolnet_parent_read_gate(uuid,uuid) TO service_role");
   }
 });
 await t.test("N22 - fake history and enrolments are not modified by reads",async()=>{
   assert.equal(sql("SELECT count(*) FROM public.profiles"),"5");
   assert.equal(sql("SELECT count(*) FROM public.parent_links"),"2");
   assert.equal(sql("SELECT count(*) FROM public.school_years"),"2");
   assert.equal(sql("SELECT count(*) FROM public.student_enrollments"),"3");
   assert.equal(sql("SELECT count(*) FROM public.school_years WHERE is_current"),"1");
   assert.equal(sql("SELECT count(*) FROM public.student_enrollment_documents"),"0");
 });
});
