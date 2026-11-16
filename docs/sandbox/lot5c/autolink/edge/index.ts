// SCHOOLNET Lot 5.C — SANDBOX ONLY / recette du rattachement Auth->Famille.
// Autorisation: GitHub Actions OIDC signe, workflow exact, push sur branche exacte.
// Une seule execution possible sur la fixture DEM-L5C-SBX-TEST01.
// Ne recopie aucun compte; ne touche jamais le projet Supabase principal.
// Aucune divulgation d'email, mot de passe, code, token ou ID Auth dans les reponses.
import {createClient} from "npm:@supabase/supabase-js@2.90.1";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";

const PROJECT="https://onqlsvphmrqhelislpry.supabase.co";
const REPO="ramon77777/schoolnet";
const REF="refs/heads/feature/schoolnet-lot5c-fiche-compacte-finalisation";
const WORKFLOW=REPO+"/.github/workflows/schoolnet-lot5c-autolink-sandbox-once.yml@"+REF;
const AUDIENCE="schoolnet-lot5c-autolink-once";
const ISSUER="https://token.actions.githubusercontent.com";
const JWKS=createRemoteJWKSet(new URL(ISSUER+"/.well-known/jwks"));
const REFERENCE="DEM-L5C-SBX-TEST01";
const OPTIONS={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
type ProfileRole="admin"|"parent"|"student";

function reply(status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","x-content-type-options":"nosniff",
  "referrer-policy":"no-referrer",
 }});
}
function failure(stage:string,status=409){
 return reply(status,{ok:false,sandbox_only:true,stage,stop_without_retry:true});
}
function password(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return "S!8m"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
async function digest(code:string,pepper:string){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(pepper),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const source=new TextEncoder().encode("schoolnet/student-code/v1:"+code);
 const raw=new Uint8Array(await crypto.subtle.sign("HMAC",key,source));
 return Array.from(raw,v=>v.toString(16).padStart(2,"0")).join("");
}
function syntheticCode(){
 const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 const bytes=crypto.getRandomValues(new Uint8Array(12));
 const chars=Array.from(bytes,v=>alphabet[v&31]).join("");
 return "SN-"+chars.slice(0,4)+"-"+chars.slice(4,8)+"-"+chars.slice(8,12);
}
async function signedGitHub(req:Request){
 const header=req.headers.get("authorization")||"";
 if(!header.startsWith("Bearer ")||header.length>7000)return false;
 try{
  const {payload}=await jwtVerify(header.slice(7),JWKS,{
   issuer:ISSUER,audience:AUDIENCE,algorithms:["RS256"],maxTokenAge:"5m",
  });
  return payload.repository===REPO && payload.ref===REF &&
   payload.workflow_ref===WORKFLOW && payload.event_name==="push" &&
   payload.sub==="repo:"+REPO+":ref:"+REF && typeof payload.run_id==="string";
 }catch{return false;}
}

Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return failure("method_not_allowed",405);
 if(!(await signedGitHub(req)))return failure("github_oidc_required",401);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const publishable=Deno.env.get("SUPABASE_ANON_KEY")||"";
 if(url!==PROJECT||!key||!publishable)return failure("sandbox_environment_invalid",503);
 let mode="";
 try{
  const raw=await req.text();
  if(raw.length>80)throw Error("large");
  const obj=JSON.parse(raw);
  mode=obj&&Object.keys(obj).length===1&&
   (obj.mode==="preflight"||obj.mode==="run")?obj.mode:"";
 }catch{return failure("invalid_body",400);}
 if(!mode)return failure("unsupported_mode",400);

 const service=createClient(url,key,OPTIONS);
 const request=await service.from("public_enrollment_requests").select(
  "id,reference,request_type,status,guardian_relationship,guardian_email,student_email"
 ).eq("reference",REFERENCE).maybeSingle();
 if(request.error||!request.data||request.data.request_type!=="student_enrollment"||
    request.data.status!=="new"||request.data.student_email!==null||
    request.data.guardian_relationship!=="father")
  return failure("request_preconditions");
 const requestId=request.data.id;
 const [reserved,invitation,profiles,users]=await Promise.all([
  service.from("schoolnet_student_no_email_requests").select(
   "request_id,parent_id,student_auth_user_id,technical_email,family_phone_e164,status,student_code_hmac,sent_at,activated_at"
  ).eq("request_id",requestId).single(),
  service.from("schoolnet_family_invitation_records").select(
   "request_id,recipient,expected_role,email,user_id,status,generation_count,sent_declared_at"
  ).eq("request_id",requestId).eq("recipient","parent").single(),
  service.from("profiles").select("id,role,child_ids"),
  service.auth.admin.listUsers({page:1,perPage:100}),
 ]);
 if(reserved.error||invitation.error||profiles.error||users.error||
    !reserved.data||!invitation.data||!profiles.data||!users.data||
    users.data.users.length!==7)
  return failure("fixture_registry_missing");
 const student=reserved.data, parent=invitation.data;
 const accountRows=profiles.data;
 const findRole=(role:ProfileRole)=>accountRows.filter(p=>p.role===role);
 if(accountRows.length!==3||findRole("admin").length!==1||
    findRole("parent").length!==1||findRole("student").length!==1)
  return failure("fixture_profile_roles_changed");
 const adminId=findRole("admin")[0].id,parentId=findRole("parent")[0].id,
       studentId=findRole("student")[0].id;
 if(student.status!=="auth_created"||student.student_code_hmac!==null||
    student.sent_at!==null||student.activated_at!==null||
    student.parent_id!==parentId||student.student_auth_user_id!==studentId||
    parent.status!=="prepared"||parent.user_id!==parentId||
    parent.generation_count!==1||parent.sent_declared_at!==null||
    parent.expected_role!=="parent"||parent.recipient!=="parent"||
    parent.email!==request.data.guardian_email||
    (findRole("parent")[0].child_ids??[]).length!==0)
  return failure("fixture_not_at_preparation_stage");

 const authFixtures=users.data.users.filter(u=>
  u.app_metadata?.schoolnet_lot5c_fixture===true);
 if(authFixtures.length!==3)return failure("auth_fixture_set_changed");
 const authParent=authFixtures.find(u=>u.id===parentId),
       authStudent=authFixtures.find(u=>u.id===studentId),
       authAdmin=authFixtures.find(u=>u.id===adminId);
 if(!authParent||!authStudent||!authAdmin||
    authParent.app_metadata?.schoolnet_family_invitation!==true||
    authStudent.app_metadata?.schoolnet_no_email_student!==true||
    authStudent.app_metadata?.schoolnet_no_email_request_id!==requestId||
    authStudent.email!==student.technical_email||
    authParent.email!==parent.email||
    !authParent.email_confirmed_at||!authStudent.email_confirmed_at)
  return failure("auth_identity_markers_invalid");

 const preLinks=await service.from("parent_links").select("id",{head:true,count:"exact"});
 if(preLinks.error||preLinks.count!==0)return failure("fixture_already_linked");
 if(mode==="preflight")return reply(200,{
  ok:true,sandbox_only:true,fixture_ready:true,parent_invitation:"prepared",
  student:"auth_created",family_links:0,auth_existing:7,
 });

 let stage="begin";
 try{
  // Passwords are random, in-memory, never written to database apart from Auth's hashing.
  const parentPwd=password(),studentPwd=password();
  stage="rotate_fixture_auth_passwords";
  const [a,b]=await Promise.all([
   service.auth.admin.updateUserById(parentId,{password:parentPwd}),
   service.auth.admin.updateUserById(studentId,{password:studentPwd}),
  ]);
  if(a.error||b.error||a.data?.user?.id!==parentId||b.data?.user?.id!==studentId)
   return failure(stage);
  const makeClient=()=>createClient(url,publishable,OPTIONS);
  const parentClient=makeClient(),studentClient=makeClient();
  stage="wrong_auth_password_is_denied";
  const wrong=await makeClient().auth.signInWithPassword({
   email:authStudent.email!,password:"ClearlyWrong99!never-valid",
  });
  if(!wrong.error||wrong.data?.session)return failure(stage);
  stage="verify_genuine_auth_sessions";
  const [pLogin,sLogin]=await Promise.all([
   parentClient.auth.signInWithPassword({email:authParent.email!,password:parentPwd}),
   studentClient.auth.signInWithPassword({email:authStudent.email!,password:studentPwd}),
  ]);
  if(pLogin.error||sLogin.error||pLogin.data.user?.id!==parentId||
     sLogin.data.user?.id!==studentId||!pLogin.data.session||!sLogin.data.session)
    return failure(stage);
  const [pVerified,sVerified]=await Promise.all([
   makeClient().auth.getUser(pLogin.data.session.access_token),
   makeClient().auth.getUser(sLogin.data.session.access_token),
  ]);
  if(pVerified.error||sVerified.error||pVerified.data.user?.id!==parentId||
     sVerified.data.user?.id!==studentId)return failure("jwt_user_validation_failed");

  stage="prepare_school_code_in_sandbox";
  // For this fixture only the pepper is ephemeral. Do not represent it as production login.
  const pepper=password();
  const hashed=await digest(syntheticCode(),pepper);
  const prepared=await service.from("schoolnet_student_no_email_requests").update({
   status:"prepared",student_code_hmac:hashed,last_action_by:adminId,
  }).eq("request_id",requestId).eq("status","auth_created").select("status").single();
  if(prepared.error||prepared.data?.status!=="prepared")return failure(stage);
  stage="declare_synthetic_student_delivery";
  // Synthetic declaration, no email/SMS actually sent.
  const delivered=await service.from("schoolnet_student_no_email_requests").update({
   status:"sent_declared",sent_at:new Date().toISOString(),last_action_by:adminId,
  }).eq("request_id",requestId).eq("status","prepared").select("status").single();
  if(delivered.error||delivered.data?.status!=="sent_declared")return failure(stage);

  stage="activate_before_parent_must_roll_back";
  const premature=await service.rpc("schoolnet_no_email_activate_after_password",{
   p_user_id:studentId,p_phone_e164:student.family_phone_e164,p_code_hmac:hashed,
  });
  if(!premature.error||
     !(premature.error.message||"").includes("SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED"))
    return failure(stage);
  const [stillPending,linksBefore,childrenBefore]=await Promise.all([
   service.from("schoolnet_student_no_email_requests").select("status,activated_at")
    .eq("request_id",requestId).single(),
   service.from("parent_links").select("id",{count:"exact",head:true}),
   service.from("profiles").select("child_ids").eq("id",parentId).single(),
  ]);
  if(stillPending.error||stillPending.data?.status!=="sent_declared"||
     stillPending.data.activated_at!==null||linksBefore.error||
     linksBefore.count!==0||childrenBefore.error||
     (childrenBefore.data?.child_ids??[]).length!==0)
    return failure("rollback_after_parent_not_activated_failed");

  stage="parent_delivery_synthetic_declaration";
  const inviteSent=await service.from("schoolnet_family_invitation_records").update({
   status:"sent_declared",sent_declared_at:new Date().toISOString(),
   sent_declared_by:adminId,last_action_by:adminId,
  }).eq("request_id",requestId).eq("recipient","parent")
    .eq("status","prepared").select("status").single();
  if(inviteSent.error||inviteSent.data?.status!=="sent_declared")return failure(stage);

  stage="record_auth_verified_parent_activation";
  const inviteActive=await service.from("schoolnet_family_invitation_records").update({
   status:"activated",last_action_by:adminId,
  }).eq("request_id",requestId).eq("recipient","parent")
    .eq("status","sent_declared").select("status").single();
  if(inviteActive.error||inviteActive.data?.status!=="activated")return failure(stage);

  stage="invalid_code_must_not_activate";
  const wrongCode=await service.rpc("schoolnet_no_email_activate_after_password",{
   p_user_id:studentId,p_phone_e164:student.family_phone_e164,
   p_code_hmac:"0".repeat(64),
  });
  if(wrongCode.error||wrongCode.data!==false)return failure(stage);

  stage="atomic_activation_and_autolink";
  const activated=await service.rpc("schoolnet_no_email_activate_after_password",{
   p_user_id:studentId,p_phone_e164:student.family_phone_e164,p_code_hmac:hashed,
  });
  if(activated.error||activated.data!==true)return failure(stage);

  stage="check_single_family_link";
  const [state,links,parentProfile,enabled]=await Promise.all([
   service.from("schoolnet_student_no_email_requests").select("status,activated_at")
    .eq("request_id",requestId).single(),
   service.from("parent_links").select("parent_id,student_id,relation_type")
    .eq("student_id",studentId),
   service.from("profiles").select("child_ids").eq("id",parentId).single(),
   service.rpc("schoolnet_no_email_login_enabled",{
    p_user_id:studentId,p_phone_e164:student.family_phone_e164,p_code_hmac:hashed,
   }),
  ]);
  if(state.error||state.data?.status!=="enabled"||!state.data.activated_at||
     links.error||links.data?.length!==1||
     links.data?.[0]?.parent_id!==parentId||links.data?.[0]?.student_id!==studentId||
     links.data?.[0]?.relation_type!=="father"||
     parentProfile.error||parentProfile.data?.child_ids?.length!==1||
     parentProfile.data.child_ids[0]!==studentId||enabled.error||enabled.data!==true)
   return failure(stage);

  stage="idempotent_second_activation";
  const duplicate=await service.rpc("schoolnet_no_email_activate_after_password",{
   p_user_id:studentId,p_phone_e164:student.family_phone_e164,p_code_hmac:hashed,
  });
  if(duplicate.error||duplicate.data!==false)return failure(stage);
  const countLinks=await service.from("parent_links").select("id",{head:true,count:"exact"});
  if(countLinks.error||countLinks.count!==1)return failure(stage);

  stage="parent_rls_can_read_child_without_class";
  const parentRead=createClient(url,publishable,{
   ...OPTIONS,global:{headers:{Authorization:"Bearer "+pLogin.data.session.access_token}},
  });
  const [childSeen,visibleLinks]=await Promise.all([
   parentRead.from("profiles").select("id,role").eq("id",studentId).maybeSingle(),
   parentRead.from("parent_links").select("student_id")
    .eq("parent_id",parentId).eq("student_id",studentId),
  ]);
  if(childSeen.error||childSeen.data?.id!==studentId||childSeen.data?.role!=="student"||
     visibleLinks.error||visibleLinks.data?.length!==1)
   return failure(stage);

  return reply(200,{
   ok:true,sandbox_only:true,reference:REFERENCE,
   parent_and_student_password_login_verified:true,
   auth_jwts_checked_against_server:true,
   premature_activation_rejected_and_rolled_back:true,
   parent_verification_recorded:true,
   invalid_code_rejected:true,
   actual_student_activation:true,
   atomic_family_link_count:1,parent_child_ids_count:1,
   second_activation_rejected_without_duplicate:true,
   parent_can_read_child_with_real_jwt:true,
   school_enrollment_not_required:true,
   emails_or_messages_sent:false,
   production_unchanged:true,
  });
 }catch{return failure(stage,503);}
});
