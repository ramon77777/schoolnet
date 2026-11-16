// SCHOOLNET Lot 5.C — sandbox-only negative+concurrent transaction acceptance.
// One-time, branch-bound GitHub Actions OIDC. Never deploy to production.
// Synthetic Auth via Admin API, no real email/SMS, no passwords or tokens logged.
// This program has deliberately NO retry/cleanup of partially created Auth users.
import {createClient} from "npm:@supabase/supabase-js@2.90.1";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";

const PROJECT="https://onqlsvphmrqhelislpry.supabase.co";
const REPO="ramon77777/schoolnet";
const REF="refs/heads/feature/schoolnet-lot5c-fiche-compacte-finalisation";
const WORKFLOW=REPO+"/.github/workflows/schoolnet-lot5c-negative-sandbox-once.yml@"+REF;
const AUDIENCE="schoolnet-lot5c-negative-once";
const ISSUER="https://token.actions.githubusercontent.com";
const JWKS=createRemoteJWKSet(new URL(ISSUER+"/.well-known/jwks"));
const ORIG="DEM-L5C-SBX-TEST01";
const PHONE="+2250700000066";
const OPTIONS={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const CASES=[
 {kind:"inactive",ref:"DEM-L5C-NG-01"},
 {kind:"mismatch",ref:"DEM-L5C-NG-02"},
 {kind:"rejected",ref:"DEM-L5C-NG-03"},
 {kind:"marker",ref:"DEM-L5C-NG-04"},
 {kind:"conflict",ref:"DEM-L5C-NG-05"},
 {kind:"concurrent",ref:"DEM-L5C-NG-06"},
] as const;
type Kind=typeof CASES[number]["kind"];
type Fixture={
 kind:Kind;ref:string;requestId:string;
 parentEmail:string;parentId:string;parentPwd:string;
 studentEmail:string;studentId:string;studentPwd:string;codeHash:string;
};
function respond(status:number,payload:Record<string,unknown>){
 return new Response(JSON.stringify(payload),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","x-content-type-options":"nosniff"
 }});
}
function fail(stage:string,status=409){
 return respond(status,{ok:false,sandbox_only:true,stage,do_not_retry:true});
}
async function allowed(req:Request){
 const value=req.headers.get("authorization")??"";
 if(!value.startsWith("Bearer ")||value.length>7000)return false;
 try{
  const {payload}=await jwtVerify(value.slice(7),JWKS,{
   issuer:ISSUER,audience:AUDIENCE,algorithms:["RS256"],maxTokenAge:"5m"
  });
  return payload.repository===REPO&&payload.ref===REF&&
    payload.workflow_ref===WORKFLOW&&payload.event_name==="push"&&
    payload.sub==="repo:"+REPO+":ref:"+REF&&typeof payload.run_id==="string";
 }catch{return false;}
}
function newPassword(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return "T!8g"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
async function hmac(){
 const secret=crypto.getRandomValues(new Uint8Array(32));
 const key=await crypto.subtle.importKey("raw",secret,
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const opaque=crypto.randomUUID();
 const signed=new Uint8Array(await crypto.subtle.sign("HMAC",key,
   new TextEncoder().encode("schoolnet/student-code/v1:"+opaque)));
 return Array.from(signed,v=>v.toString(16).padStart(2,"0")).join("");
}
async function count(client:ReturnType<typeof createClient>,table:string){
 const {count,error}=await client.from(table).select("*",{head:true,count:"exact"});
 if(error||count===null)throw Error("Unable to inspect baseline");
 return count;
}
function anonClient(url:string,key:string,accessToken?:string){
 return createClient(url,key,{
  ...OPTIONS,
  ...(accessToken?{global:{headers:{Authorization:"Bearer "+accessToken}}}:{}),
 });
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return fail("method",405);
 if(!(await allowed(req)))return fail("oidc_required",401);
 if(Deno.env.get("SUPABASE_URL")!==PROJECT)return fail("wrong_project",503);
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const anonKey=Deno.env.get("SUPABASE_ANON_KEY")??"";
 if(!serviceKey||!anonKey)return fail("sandbox_keys_absent",503);
 let mode="";
 try{
  const raw=await req.text();
  if(raw.length>80)throw Error("oversized");
  const x=JSON.parse(raw);
  mode=x&&Object.keys(x).length===1&&(x.mode==="preflight"||x.mode==="run")?x.mode:"";
 }catch{return fail("invalid_request",400);}
 if(!mode)return fail("invalid_mode",400);
 const srv=createClient(PROJECT,serviceKey,OPTIONS);
 let stage="preflight";
 try{
  const [users,profiles,requests,registry,invites,links,positive]=await Promise.all([
   srv.auth.admin.listUsers({page:1,perPage:100}),
   count(srv,"profiles"),count(srv,"public_enrollment_requests"),
   count(srv,"schoolnet_student_no_email_requests"),
   count(srv,"schoolnet_family_invitation_records"),count(srv,"parent_links"),
   srv.from("public_enrollment_requests").select("id,reference").eq("reference",ORIG).single(),
  ]);
  if(users.error||users.data?.users.length!==7||
     profiles!==3||requests!==1||registry!==1||invites!==1||links!==1||
     positive.error||!positive.data)
   return fail("baseline_changed");
  const first=await srv.from("schoolnet_student_no_email_requests")
    .select("status").eq("request_id",positive.data.id).single();
  if(first.error||first.data?.status!=="enabled")return fail("first_success_missing");
  const adminUser=users.data.users.filter(u=>
   u.app_metadata?.schoolnet_lot5c_fixture===true);
  if(adminUser.length!==3)return fail("auth_fixture_baseline");
  const admins=await srv.from("profiles").select("id").eq("role","admin");
  if(admins.error||admins.data?.length!==1||
     !adminUser.some(u=>u.id===admins.data[0].id))return fail("fixture_admin_missing");
  const adminId=admins.data[0].id;
  if(mode==="preflight")return respond(200,{
   ok:true,sandbox_only:true,baseline_auth:7,baseline_profiles:3,
   baseline_requests:1,baseline_family_links:1,ready_for_negative_cohort:true
  });

  stage="create_auth_fixtures";
  const fixtures:Fixture[]=[];
  for(let i=0;i<CASES.length;i++){
   const spec=CASES[i];
   const requestId=crypto.randomUUID();
   const parentEmail="sn-l5c-neg-p"+(i+1)+"@schoolnet.invalid";
   const studentEmail="sn-"+requestId.replaceAll("-","")+"@schoolnet.invalid";
   const parentPwd=newPassword(),studentPwd=newPassword();
   const madeParent=await srv.auth.admin.createUser({
    email:parentEmail,password:parentPwd,email_confirm:true,
    app_metadata:{schoolnet_lot5c_negative_fixture:true,
      schoolnet_family_invitation:true}
   });
   if(madeParent.error||!madeParent.data?.user?.id||
      !madeParent.data.user.email_confirmed_at)return fail("create_parent_"+(i+1));
   const madeStudent=await srv.auth.admin.createUser({
    email:studentEmail,password:studentPwd,email_confirm:true,
    app_metadata:{schoolnet_lot5c_negative_fixture:true,
      schoolnet_no_email_student:true,
      schoolnet_no_email_request_id:spec.kind==="marker"?crypto.randomUUID():requestId},
    ...(spec.kind==="marker"?{user_metadata:{schoolnet_no_email_request_id:requestId}}:{})
   });
   if(madeStudent.error||!madeStudent.data?.user?.id||
      !madeStudent.data.user.email_confirmed_at)return fail("create_student_"+(i+1));
   fixtures.push({...spec,requestId,parentEmail,parentPwd,
    parentId:madeParent.data.user.id,studentEmail,studentPwd,
    studentId:madeStudent.data.user.id,codeHash:await hmac()});
  }

  stage="create_synthetic_profiles";
  const profilesData=fixtures.flatMap(f=>[
   {id:f.parentId,role:"parent",full_name:"TEST Parent "+f.kind,child_ids:[]},
   {id:f.studentId,role:"student",full_name:"TEST Enfant "+f.kind,child_ids:[]},
  ]);
  const createdProfiles=await srv.from("profiles").insert(profilesData).select("id");
  if(createdProfiles.error||createdProfiles.data?.length!==12)return fail(stage);

  stage="create_synthetic_requests";
  const requestRows=fixtures.map(f=>({
   id:f.requestId,reference:f.ref,request_type:"student_enrollment",
   student_full_name:"TEST Enfant "+f.kind,student_gender:"male",
   requested_level:"4e",guardian_full_name:"TEST Parent "+f.kind,
   guardian_relationship:"father",guardian_phone:PHONE,
   guardian_email:f.kind==="mismatch"?"other-guardian-l5c@schoolnet.invalid":f.parentEmail,
   student_email:null,status:f.kind==="rejected"?"rejected":"new"
  }));
  const insertedRequests=await srv.from("public_enrollment_requests").insert(requestRows).select("id");
  if(insertedRequests.error||insertedRequests.data?.length!==6)return fail(stage);

  stage="create_parent_invitation_proofs";
  const invRows=fixtures.map(f=>{
   const activated=f.kind!=="inactive";
   return {request_id:f.requestId,recipient:"parent",expected_role:"parent",
    email:f.parentEmail,user_id:f.parentId,prepared_by:adminId,last_action_by:adminId,
    verification_note:"Famille totalement fictive pour recette Lot 5.C.",
    generation_count:1,status:activated?"activated":"prepared",
    ...(activated?{
      sent_declared_at:new Date().toISOString(),sent_declared_by:adminId
    }:{})
   };
  });
  const insertedInv=await srv.from("schoolnet_family_invitation_records")
   .insert(invRows).select("request_id");
  if(insertedInv.error||insertedInv.data?.length!==6)return fail(stage);

  stage="seed_prior_child_ids_conflict";
  // Seed the *child_ids branch* of the conflict detector before its no-email
  // reservation is inserted, then remove it immediately after the rejection.
  // No pre-activation parent_links is created or retained.
  const conflict=fixtures.find(f=>f.kind==="conflict")!;
  const concurrent=fixtures.find(f=>f.kind==="concurrent")!;
  const seed=await srv.from("profiles").update({child_ids:[conflict.studentId]})
    .eq("id",concurrent.parentId).select("child_ids").single();
  if(seed.error||seed.data?.child_ids?.length!==1)return fail(stage);

  stage="create_student_reservations";
  const regRows=fixtures.map(f=>({
   request_id:f.requestId,parent_id:f.parentId,
   student_auth_user_id:f.studentId,technical_email:f.studentEmail,
   family_phone_e164:PHONE,student_code_hmac:f.codeHash,
   verification_note:"Verification administrative fictive Lot 5.C.",
   prepared_by:adminId,last_action_by:adminId,status:"sent_declared",
   sent_at:new Date().toISOString()
  }));
  const insertedReg=await srv.from("schoolnet_student_no_email_requests")
    .insert(regRows).select("request_id,status");
  if(insertedReg.error||insertedReg.data?.length!==6)return fail(stage);

  const outcomes:Record<string,boolean>={};
  const expectedError:Record<string,string>={
   inactive:"SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED",
   mismatch:"SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED",
   rejected:"SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED",
   marker:"SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED",
   conflict:"SCHOOLNET_AUTOLINK_FAMILY_CONFLICT"
  };
  for(const fixture of fixtures.filter(f=>f.kind!=="concurrent")){
   stage="reject_"+fixture.kind;
   const call=await srv.rpc("schoolnet_no_email_activate_after_password",{
    p_user_id:fixture.studentId,p_phone_e164:PHONE,p_code_hmac:fixture.codeHash
   });
   if(!call.error || !call.error.message?.includes(expectedError[fixture.kind])||
      call.error.code!=="23514")return fail(stage);
   const [row,relation,primaryProfile]=await Promise.all([
    srv.from("schoolnet_student_no_email_requests").select("status,activated_at")
      .eq("request_id",fixture.requestId).single(),
    srv.from("parent_links").select("parent_id").eq("student_id",fixture.studentId),
    srv.from("profiles").select("child_ids").eq("id",fixture.parentId).single()
   ]);
   if(row.error||row.data?.status!=="sent_declared"||row.data.activated_at!==null||
      relation.error||relation.data?.length!==0||
      primaryProfile.error||
      (primaryProfile.data?.child_ids??[]).includes(fixture.studentId))
    return fail("rollback_failed_"+fixture.kind);
   outcomes[fixture.kind]=true;
  }

  stage="remove_temporary_child_id_conflict";
  const clear=await srv.from("profiles").update({child_ids:[]})
    .eq("id",concurrent.parentId).select("child_ids").single();
  if(clear.error||clear.data?.child_ids?.length!==0)return fail(stage);

  stage="reject_unsigned_rpc";
  const publicCall=await anonClient(PROJECT,anonKey).rpc(
   "schoolnet_no_email_activate_after_password",{
    p_user_id:concurrent.studentId,p_phone_e164:PHONE,p_code_hmac:concurrent.codeHash
   });
  if(!publicCall.error || publicCall.data===true)return fail(stage);

  stage="authenticate_concurrent_student";
  const auth=await anonClient(PROJECT,anonKey).auth.signInWithPassword({
   email:concurrent.studentEmail,password:concurrent.studentPwd
  });
  if(auth.error||!auth.data?.session||auth.data.user?.id!==concurrent.studentId)
   return fail(stage);
  const verified=await anonClient(PROJECT,anonKey)
    .auth.getUser(auth.data.session.access_token);
  if(verified.error||verified.data.user?.id!==concurrent.studentId)return fail(stage);

  stage="concurrent_activation";
  // Send two independent PostgREST RPCs concurrently. The database must admit
  // exactly one transition sent_declared -> enabled; the other returns false.
  const [callA,callB]=await Promise.all([
   srv.rpc("schoolnet_no_email_activate_after_password",{
    p_user_id:concurrent.studentId,p_phone_e164:PHONE,p_code_hmac:concurrent.codeHash}),
   srv.rpc("schoolnet_no_email_activate_after_password",{
    p_user_id:concurrent.studentId,p_phone_e164:PHONE,p_code_hmac:concurrent.codeHash})
  ]);
  if(callA.error||callB.error||![callA.data,callB.data].includes(true)||
    ![callA.data,callB.data].includes(false))return fail(stage);
  const [studentState,allLinks,claimedParent,unclaimedParent]=await Promise.all([
   srv.from("schoolnet_student_no_email_requests").select("status,activated_at")
    .eq("request_id",concurrent.requestId).single(),
   srv.from("parent_links").select("parent_id,student_id")
    .eq("student_id",concurrent.studentId),
   srv.from("profiles").select("child_ids").eq("id",concurrent.parentId).single(),
   srv.from("profiles").select("child_ids").eq("id",conflict.parentId).single()
  ]);
  if(studentState.error||studentState.data?.status!=="enabled"||
     !studentState.data.activated_at||allLinks.error||
     allLinks.data?.length!==1||
     allLinks.data?.[0]?.parent_id!==concurrent.parentId||
     claimedParent.error||claimedParent.data?.child_ids?.length!==1||
     claimedParent.data.child_ids[0]!==concurrent.studentId||
     unclaimedParent.error||unclaimedParent.data?.child_ids?.length!==0)
   return fail("atomic_result_invalid");

  stage="check_rls_cross_family";
  const [validParent,unrelated]=await Promise.all([
   anonClient(PROJECT,anonKey).auth.signInWithPassword({
    email:concurrent.parentEmail,password:concurrent.parentPwd}),
   anonClient(PROJECT,anonKey).auth.signInWithPassword({
    email:conflict.parentEmail,password:conflict.parentPwd})
  ]);
  if(validParent.error||unrelated.error||
     !validParent.data.session||!unrelated.data.session)
   return fail(stage);
  const own=anonClient(PROJECT,anonKey,validParent.data.session.access_token),
        other=anonClient(PROJECT,anonKey,unrelated.data.session.access_token);
  const [visible,hidden,visibleLink,hiddenLink]=await Promise.all([
   own.from("profiles").select("id").eq("id",concurrent.studentId).maybeSingle(),
   other.from("profiles").select("id").eq("id",concurrent.studentId).maybeSingle(),
   own.from("parent_links").select("student_id").eq("student_id",concurrent.studentId),
   other.from("parent_links").select("student_id").eq("student_id",concurrent.studentId)
  ]);
  if(visible.error||visible.data?.id!==concurrent.studentId||
     hidden.error||hidden.data!==null||visibleLink.error||
     visibleLink.data?.length!==1||hiddenLink.error||
     hiddenLink.data?.length!==0)return fail(stage);

  stage="final_counts_and_prior_success";
  const [usersFinal,profileCount,requestCount,regCount,linkCount,
         allStatuses,old]=await Promise.all([
   srv.auth.admin.listUsers({page:1,perPage:100}),
   count(srv,"profiles"),count(srv,"public_enrollment_requests"),
   count(srv,"schoolnet_student_no_email_requests"),count(srv,"parent_links"),
   srv.from("schoolnet_student_no_email_requests").select("status")
     .in("request_id",fixtures.map(f=>f.requestId)),
   srv.from("schoolnet_student_no_email_requests").select("status")
     .eq("request_id",positive.data.id).single()
  ]);
  if(usersFinal.error||usersFinal.data?.users.length!==19||profileCount!==15||
     requestCount!==7||regCount!==7||linkCount!==2||
     allStatuses.error||allStatuses.data?.filter(r=>r.status==="enabled").length!==1||
     allStatuses.data?.filter(r=>r.status==="sent_declared").length!==5||
     old.error||old.data?.status!=="enabled")
   return fail(stage);
  return respond(200,{
   ok:true,sandbox_only:true,
   created_synthetic_auth_accounts:12,created_negative_requests:6,
   inactive_parent_rejected:outcomes.inactive,
   guardian_identity_mismatch_rejected:outcomes.mismatch,
   rejected_application_blocked:outcomes.rejected,
   forged_user_metadata_ignored:outcomes.marker,
   conflicting_parent_child_id_rejected:outcomes.conflict,
   failed_activations_rolled_back:true,
   unauthenticated_rpc_forbidden:true,
   concurrent_calls_result:"one_true_one_false",
   concurrent_family_links:1,
   real_parent_jwt_can_read_child:true,
   unrelated_parent_jwt_cannot_read_child:true,
   original_success_unchanged:true,
   no_annual_school_record_required:true,
   no_real_emails_sent:true,
  });
 }catch{return fail(stage,503);}
});
