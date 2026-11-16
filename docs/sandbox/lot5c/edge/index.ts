// SCHOOLNET 5.C — préparation de fixtures Auth + SQL, SANDBOX SEULEMENT.
// Une seule exécution depuis un workflow GitHub Actions précis.
// Ne délivre aucun mot de passe, jeton ou invitation. Aucun appel à la production.
// Aucun rattachement/activation ; la recette transactionnelle est un lot séparé.
import {createClient} from "npm:@supabase/supabase-js@2.90.1";
import {createRemoteJWKSet, jwtVerify} from "npm:jose@6.1.0";

const PROJECT_URL="https://onqlsvphmrqhelislpry.supabase.co";
const REPO="ramon77777/schoolnet";
const BRANCH="refs/heads/feature/schoolnet-lot5c-fiche-compacte-finalisation";
const WORKFLOW=REPO+"/.github/workflows/schoolnet-lot5c-sandbox-prepare-once.yml@"+BRANCH;
const AUDIENCE="schoolnet-lot5c-sandbox-prepare";
const ISSUER="https://token.actions.githubusercontent.com";
const JWKS=createRemoteJWKSet(new URL(ISSUER+"/.well-known/jwks"));
const TEST_REFERENCE="DEM-L5C-SBX-TEST01";
const PARENT_EMAIL="schoolnet-lot5c-parent-01@example.test";
const ADMIN_EMAIL="schoolnet-lot5c-admin-01@example.test";
const TEST_PHONE="+2250700000044";
const TEST_CODE="SN-ABCD-EFGH-JKLM";
const CLIENT_OPTIONS={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};

function json(status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
 }});
}
function fail(stage:string,status=409){
 return json(status,{ok:false,sandbox_only:true,stage,stop_without_retry:true});
}
function password(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return "T!9s"+Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");
}
async function codeHmac(pepper:string){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pepper),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const value=new TextEncoder().encode("schoolnet/student-code/v1:"+TEST_CODE);
 const signed=new Uint8Array(await crypto.subtle.sign("HMAC",key,value));
 return Array.from(signed,v=>v.toString(16).padStart(2,"0")).join("");
}
async function authorized(req:Request):Promise<boolean>{
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer ")||bearer.length>7000)return false;
 try{
  const {payload}=await jwtVerify(bearer.slice(7),JWKS,{
   issuer:ISSUER,audience:AUDIENCE,algorithms:["RS256"],maxTokenAge:"5m"
  });
  return payload.repository===REPO && payload.ref===BRANCH &&
   payload.event_name==="push" && payload.workflow_ref===WORKFLOW &&
   payload.sub==="repo:"+REPO+":ref:"+BRANCH &&
   typeof payload.run_id==="string";
 }catch{return false;}
}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return fail("method",405);
 // This is not a public administrative endpoint. GitHub OIDC is mandatory.
 if(!(await authorized(req)))return fail("oidc_required",401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const pepper=Deno.env.get("SCHOOLNET_STUDENT_CODE_PEPPER")||"";
 if(url!==PROJECT_URL||!serviceKey||!anonKey||
    new TextEncoder().encode(pepper).length<32)return fail("sandbox_config",503);
 let mode:string;
 try{
  const raw=await req.text();
  if(raw.length>80)throw Error("large");
  const obj=JSON.parse(raw);
  mode=obj&&Object.keys(obj).length===1&&
   (obj.mode==="preflight"||obj.mode==="prepare")?obj.mode:"";
 }catch{return fail("invalid_body",400);}
 if(!mode)return fail("invalid_mode",400);

 const service=createClient(url,serviceKey,CLIENT_OPTIONS);
 const users=await service.auth.admin.listUsers({page:1,perPage:100});
 if(users.error||!users.data||users.data.users.length!==4)
  return fail("auth_baseline_changed",409);
 if(users.data.users.some(x=>x.email===ADMIN_EMAIL||x.email===PARENT_EMAIL||
   x.email?.startsWith("sn-")&&x.app_metadata?.schoolnet_lot5c_fixture===true))
  return fail("fixture_auth_already_exists",409);
 const [profiles,requests,reg,inv,links]=await Promise.all([
  service.from("profiles").select("id",{head:true,count:"exact"}),
  service.from("public_enrollment_requests").select("id",{head:true,count:"exact"}),
  service.from("schoolnet_student_no_email_requests").select("request_id",{head:true,count:"exact"}),
  service.from("schoolnet_family_invitation_records").select("request_id",{head:true,count:"exact"}),
  service.from("parent_links").select("id",{head:true,count:"exact"}),
 ]);
 if([profiles,requests,reg,inv,links].some(x=>x.error||x.count!==0))
  return fail("fixture_tables_not_empty");
 if(mode==="preflight")
  return json(200,{ok:true,sandbox_only:true,auth_baseline:4,empty_fixture_tables:true,
   ready_for_one_time_preparation:true});

 let stage="auth_admin";
 try{
  const requestId=crypto.randomUUID();
  const studentEmail="sn-"+requestId.replaceAll("-","")+"@schoolnet.invalid";
  const hashedCode=await codeHmac(pepper);
  const actors=[
   {email:ADMIN_EMAIL,role:"admin",name:"TEST Lot5C Administrateur",
    app:{schoolnet_lot5c_fixture:true}},
   {email:PARENT_EMAIL,role:"parent",name:"TEST Lot5C Parent",
    app:{schoolnet_lot5c_fixture:true,schoolnet_family_invitation:true}},
   {email:studentEmail,role:"student",name:"TEST Lot5C Apprenant",
    app:{schoolnet_lot5c_fixture:true,schoolnet_no_email_student:true,
      schoolnet_no_email_request_id:requestId}},
  ] as const;
  const ids:string[]=[];
  const passwords:string[]=[];
  for(const actor of actors){
   stage="create_auth_"+actor.role;
   const secret=password();
   const created=await service.auth.admin.createUser({
    email:actor.email,password:secret,email_confirm:true,app_metadata:actor.app,
   });
   if(created.error||!created.data?.user||
      created.data.user.email!==actor.email||
      !created.data.user.email_confirmed_at)return fail(stage);
   ids.push(created.data.user.id);
   passwords.push(secret);
  }

  stage="verify_auth_passwords";
  for(let i=0;i<actors.length;i++){
   const publicAuth=createClient(url,anonKey,CLIENT_OPTIONS);
   const login=await publicAuth.auth.signInWithPassword({
    email:actors[i].email,password:passwords[i]
   });
   if(login.error||login.data.user?.id!==ids[i]||!login.data.session)
    return fail(stage);
  }
  // Drop plaintext secrets from any further operations; never persist or return.
  passwords.fill("");

  stage="profiles";
  const inserted=await service.from("profiles").insert(actors.map((a,i)=>({
   id:ids[i],role:a.role,full_name:a.name,child_ids:[],
  }))).select("id,role");
  if(inserted.error||inserted.data?.length!==3)return fail(stage);

  stage="public_request";
  const newRequest=await service.from("public_enrollment_requests").insert({
   id:requestId,reference:TEST_REFERENCE,
   request_type:"student_enrollment",student_full_name:"TEST Lot5C Apprenant",
   student_gender:"male",requested_level:"4e",
   guardian_full_name:"TEST Lot5C Parent",guardian_relationship:"father",
   guardian_phone:TEST_PHONE,guardian_email:PARENT_EMAIL,student_email:null,
   status:"new",
  }).select("id").single();
  if(newRequest.error||newRequest.data?.id!==requestId)return fail(stage);

  stage="parent_invitation_prepared";
  const parentRecord=await service.from("schoolnet_family_invitation_records").insert({
   request_id:requestId,recipient:"parent",expected_role:"parent",
   email:PARENT_EMAIL,user_id:ids[1],verification_note:"Famille fictive : verification sandbox 5.C.",
   prepared_by:ids[0],last_action_by:ids[0],
   generation_count:1,status:"prepared"
  }).select("request_id,status").single();
  if(parentRecord.error||parentRecord.data?.status!=="prepared")return fail(stage);

  stage="student_prepared";
  const studentRecord=await service.from("schoolnet_student_no_email_requests").insert({
   request_id:requestId,parent_id:ids[1],student_auth_user_id:ids[2],
   technical_email:studentEmail,family_phone_e164:TEST_PHONE,
   student_code_hmac:hashedCode,status:"prepared",
   verification_note:"Test Lot 5C : preuve fictive de verification.",
   prepared_by:ids[0],last_action_by:ids[0],
  }).select("request_id,status").single();
  if(studentRecord.error||studentRecord.data?.status!=="prepared")return fail(stage);

  stage="verify_no_activation";
  const [family,profile,records]=await Promise.all([
   service.from("parent_links").select("id",{head:true,count:"exact"}).eq("parent_id",ids[1]),
   service.from("profiles").select("child_ids").eq("id",ids[1]).single(),
   service.from("schoolnet_student_no_email_requests").select("status,activated_at,sent_at")
    .eq("request_id",requestId).single(),
  ]);
  if(family.error||family.count!==0||profile.error||
   !Array.isArray(profile.data?.child_ids)||profile.data.child_ids.length!==0||
   records.error||records.data?.status!=="prepared"||
   records.data?.activated_at!==null||records.data?.sent_at!==null)return fail(stage);

  return json(200,{ok:true,sandbox_only:true,
   created_auth_accounts:3,
   passwords_verified_with_supabase_auth:true,
   new_public_requests:1,parent_invitation_state:"prepared",
   student_state:"prepared",family_links:0,activated_students:0,
   email_delivery_requested:false,students_without_class:true,
  });
 }catch{
  return fail(stage,503);
 }
});
