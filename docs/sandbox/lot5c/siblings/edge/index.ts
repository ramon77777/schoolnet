// SCHOOLNET Lot 5.C — one Parent, two siblings, SANDBOX ONLY / one-shot acceptance.
// Three synthetic Auth identities, no real e-mail/SMS, no secrets in logs.
// Protected by exact GitHub Actions OIDC workflow + project lock.
// Do NOT run in production or retry after any partial failure.
import {createClient} from "npm:@supabase/supabase-js@2.90.1";
import {createRemoteJWKSet,jwtVerify} from "npm:jose@6.1.0";
const PROJECT="https://onqlsvphmrqhelislpry.supabase.co";
const REPO="ramon77777/schoolnet";
const REF="refs/heads/feature/schoolnet-lot5c-fiche-compacte-finalisation";
const WORKFLOW=REPO+"/.github/workflows/schoolnet-lot5c-siblings-sandbox-once.yml@"+REF;
const AUDIENCE="schoolnet-lot5c-siblings-once";
const ISSUER="https://token.actions.githubusercontent.com";
const JWKS=createRemoteJWKSet(new URL(ISSUER+"/.well-known/jwks"));
const PARENT_EMAIL="sn-l5c-siblings-parent@schoolnet.invalid";
const R1="DEM-L5C-SIB-01",R2="DEM-L5C-SIB-02",PHONE="+2250700000088";
const OPTIONS={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const srv=(key:string)=>createClient(PROJECT,key,OPTIONS);
const publicClient=(key:string,token?:string)=>createClient(PROJECT,key,{
 ...OPTIONS,...(token?{global:{headers:{Authorization:"Bearer "+token}}}:{})
});
function respond(status:number,body:Record<string,unknown>){
 return new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff"
 }});
}
const fail=(stage:string,status=409)=>respond(status,{
 ok:false,sandbox_only:true,stage,do_not_retry:true
});
async function allowed(req:Request){
 const header=req.headers.get("authorization")??"";
 if(!header.startsWith("Bearer ")||header.length>7000)return false;
 try{
  const {payload}=await jwtVerify(header.slice(7),JWKS,{
   issuer:ISSUER,audience:AUDIENCE,algorithms:["RS256"],maxTokenAge:"5m"
  });
  return payload.repository===REPO && payload.ref===REF &&
   payload.workflow_ref===WORKFLOW && payload.event_name==="push" &&
   payload.sub==="repo:"+REPO+":ref:"+REF && typeof payload.run_id==="string";
 }catch{return false;}
}
function password(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return "S!9p"+Array.from(bytes,x=>x.toString(16).padStart(2,"0")).join("");
}
async function syntheticCodeDigest(){
 const key=await crypto.subtle.importKey("raw",crypto.getRandomValues(new Uint8Array(32)),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const hmac=new Uint8Array(await crypto.subtle.sign("HMAC",key,
  new TextEncoder().encode("schoolnet/student-code/v1:"+crypto.randomUUID())));
 return Array.from(hmac,x=>x.toString(16).padStart(2,"0")).join("");
}
async function total(client:ReturnType<typeof srv>,table:string){
 const {count,error}=await client.from(table).select("*",{head:true,count:"exact"});
 if(error || count===null)throw Error("Cannot verify table count");
 return count;
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return fail("method",405);
 if(!(await allowed(req)))return fail("github_oidc_required",401);
 if(Deno.env.get("SUPABASE_URL")!==PROJECT)return fail("wrong_supabase_project",503);
 const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")??"";
 if(!secret||!anon)return fail("sandbox_keys_missing",503);
 let mode="";
 try{
  const body=await req.text();
  if(body.length>80)throw Error("oversized");
  const o=JSON.parse(body);
  mode=o && Object.keys(o).length===1 &&
   (o.mode==="preflight"||o.mode==="run")?o.mode:"";
 }catch{return fail("invalid_body",400);}
 if(!mode)return fail("invalid_mode",400);

 const admin=srv(secret);
 let stage="preflight";
 try{
  const [users,profiles,requests,students,invites,links,proofs,actor]=await Promise.all([
   admin.auth.admin.listUsers({page:1,perPage:100}),
   total(admin,"profiles"),total(admin,"public_enrollment_requests"),
   total(admin,"schoolnet_student_no_email_requests"),
   total(admin,"schoolnet_family_invitation_records"),total(admin,"parent_links"),
   admin.from("schoolnet_sibling_parent_approvals").select("request_id",{head:true,count:"exact"}),
   admin.from("profiles").select("id").eq("role","admin")
  ]);
  if(users.error||users.data?.users.length!==19||
   profiles!==15||requests!==7||students!==7||invites!==7||links!==2||
   proofs.error||proofs.count!==0||actor.error||actor.data?.length!==1||
   users.data.users.some(x=>x.email===PARENT_EMAIL)||
   (await admin.from("public_enrollment_requests").select("id")
    .in("reference",[R1,R2])).data?.length!==0)
    return fail("fixture_baseline_changed");
  const adminId=actor.data[0].id;
  if(mode==="preflight")return respond(200,{
   ok:true,sandbox_only:true,baseline_auth_users:19,
   baseline_family_links:2,existing_approval_rows:0,
   ready_for_one_time_sibling_test:true
  });

  stage="auth_create_three_synthetic_accounts";
  const reqIds=[crypto.randomUUID(),crypto.randomUUID()];
  const emails=[
   PARENT_EMAIL,
   "sn-"+reqIds[0].replaceAll("-","")+"@schoolnet.invalid",
   "sn-"+reqIds[1].replaceAll("-","")+"@schoolnet.invalid"
  ];
  const passwords=[password(),password(),password()];
  const ids:string[]=[];
  for(let i=0;i<3;i++){
   stage="create_auth_"+i;
   const app={
    schoolnet_lot5c_sibling_fixture:true,
    ...(i===0?{schoolnet_family_invitation:true}:{
     schoolnet_no_email_student:true,schoolnet_no_email_request_id:reqIds[i-1]
    })
   };
   const made=await admin.auth.admin.createUser({
    email:emails[i],password:passwords[i],email_confirm:true,
    app_metadata:app
   });
   if(made.error||!made.data?.user?.id||!made.data.user.email_confirmed_at)
    return fail(stage);
   ids.push(made.data.user.id);
  }
  const parentId=ids[0],child1=ids[1],child2=ids[2];
  stage="authenticate_real_parent_and_both_children";
  const sessions=await Promise.all(emails.map((email,i)=>
   publicClient(anon).auth.signInWithPassword({email,password:passwords[i]})));
  if(sessions.some((r,i)=>r.error||!r.data.session||r.data.user?.id!==ids[i]))
   return fail(stage);
  const parentJwt=sessions[0].data.session!.access_token;
  const childJwt=sessions[1].data.session!.access_token;
  const verify=await publicClient(anon).auth.getUser(parentJwt);
  if(verify.error||verify.data.user?.id!==parentId)return fail("parent_jwt_invalid");
  passwords.fill("");

  stage="insert_three_profiles";
  const p=await admin.from("profiles").insert([
   {id:parentId,role:"parent",full_name:"TEST Parent deux enfants",child_ids:[]},
   {id:child1,role:"student",full_name:"TEST Premier enfant",child_ids:[]},
   {id:child2,role:"student",full_name:"TEST Deuxieme enfant",child_ids:[]}
  ]).select("id");
  if(p.error||p.data?.length!==3)return fail(stage);

  stage="insert_two_new_requests_same_parent_email";
  const r=await admin.from("public_enrollment_requests").insert(reqIds.map((id,i)=>({
   id,reference:i===0?R1:R2,request_type:"student_enrollment",
   student_full_name:i===0?"TEST Premier enfant":"TEST Deuxieme enfant",
   student_gender:"female",requested_level:"CM2",
   guardian_full_name:"TEST Parent deux enfants",guardian_relationship:"mother",
   guardian_phone:PHONE,guardian_email:PARENT_EMAIL,student_email:null,
   status:"new"
  }))).select("id");
  if(r.error||r.data?.length!==2)return fail(stage);

  stage="insert_only_one_parent_invitation";
  const inv=await admin.from("schoolnet_family_invitation_records").insert({
   request_id:reqIds[0],recipient:"parent",expected_role:"parent",
   email:PARENT_EMAIL,user_id:parentId,prepared_by:adminId,last_action_by:adminId,
   verification_note:"Validation fictive Parent du test deux enfants SCHOOLNET.",
   generation_count:1,status:"activated",
   sent_declared_at:new Date().toISOString(),sent_declared_by:adminId
  }).select("request_id").single();
  if(inv.error||inv.data?.request_id!==reqIds[0])return fail(stage);

  stage="unique_parent_invitation_blocks_duplicate";
  const duplicate=await admin.from("schoolnet_family_invitation_records").insert({
   request_id:reqIds[1],recipient:"parent",expected_role:"parent",
   email:PARENT_EMAIL,user_id:parentId,prepared_by:adminId,last_action_by:adminId,
   verification_note:"Tentative volontaire de doublon pour recette SCHOOLNET.",
   generation_count:1,status:"activated"
  });
  if(!duplicate.error||duplicate.error.code!=="23505")return fail(stage);

  stage="prepare_two_student_accounts";
  const hashes=[await syntheticCodeDigest(),await syntheticCodeDigest()];
  for(let i=0;i<2;i++){
   stage="reserve_student_"+i;
   const reserve=await admin.from("schoolnet_student_no_email_requests").insert({
    request_id:reqIds[i],parent_id:parentId,student_auth_user_id:ids[i+1],
    technical_email:emails[i+1],family_phone_e164:PHONE,
    student_code_hmac:null,status:"reserved",
    verification_note:"Validation fictive et individuelle de la fratrie SCHOOLNET.",
    prepared_by:adminId,last_action_by:adminId
   }).select("request_id").single();
   if(reserve.error||reserve.data?.request_id!==reqIds[i])return fail(stage);
   stage="auth_created_student_"+i;
   const created=await admin.from("schoolnet_student_no_email_requests").update({
    status:"auth_created",last_action_by:adminId
   }).eq("request_id",reqIds[i]).eq("status","reserved").select("status").single();
   if(created.error||created.data?.status!=="auth_created")return fail(stage);
   stage="prepared_student_"+i;
   const prepared=await admin.from("schoolnet_student_no_email_requests").update({
    status:"prepared",student_code_hmac:hashes[i],last_action_by:adminId
   }).eq("request_id",reqIds[i]).eq("status","auth_created").select("status").single();
   if(prepared.error||prepared.data?.status!=="prepared")return fail(stage);
   stage="synthetic_delivery_student_"+i;
   const delivered=await admin.from("schoolnet_student_no_email_requests").update({
    status:"sent_declared",sent_at:new Date().toISOString(),last_action_by:adminId
   }).eq("request_id",reqIds[i]).eq("status","prepared").select("status").single();
   if(delivered.error||delivered.data?.status!=="sent_declared")return fail(stage);
  }

  const activate=(i:number)=>admin.rpc("schoolnet_no_email_activate_after_password",{
   p_user_id:ids[i+1],p_phone_e164:PHONE,p_code_hmac:hashes[i]
  });
  stage="activate_first_child_using_existing_invitation";
  const first=await activate(0);
  if(first.error||first.data!==true)return fail(stage);

  stage="block_second_child_without_per_request_approval";
  const premature=await activate(1);
  if(!premature.error||premature.error.code!=="23514"||
   !premature.error.message?.includes("SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED"))
   return fail(stage);
  const [unchanged,linksBefore,childIdsBefore]=await Promise.all([
   admin.from("schoolnet_student_no_email_requests").select("status,activated_at")
     .eq("request_id",reqIds[1]).single(),
   admin.from("parent_links").select("student_id").eq("parent_id",parentId),
   admin.from("profiles").select("child_ids").eq("id",parentId).single()
  ]);
  if(unchanged.error||unchanged.data?.status!=="sent_declared"||
     unchanged.data.activated_at!==null||
     linksBefore.error||linksBefore.data?.length!==1||
     linksBefore.data[0].student_id!==child1||
     childIdsBefore.error||childIdsBefore.data?.child_ids?.length!==1||
     childIdsBefore.data.child_ids[0]!==child1)
   return fail("second_child_failed_activation_not_rolled_back");

  stage="reject_unverified_approval_actor";
  const wrongAdmin=await admin.from("schoolnet_sibling_parent_approvals").insert({
   request_id:reqIds[1],parent_id:parentId,verified_by:child1,
   guardian_relationship:"mother",
   verification_note:"Tentative fictive de verification par un non-administrateur."
  });
  if(!wrongAdmin.error||wrongAdmin.error.code!=="23514")return fail(stage);

  stage="insert_specific_administrator_approval_for_child2";
  const verified=await admin.from("schoolnet_sibling_parent_approvals").insert({
   request_id:reqIds[1],parent_id:parentId,verified_by:adminId,
   guardian_relationship:"mother",
   verification_note:"Lien avec le second enfant verifie fictivement en sandbox par Admin."
  }).select("request_id,parent_id").single();
  if(verified.error||verified.data?.request_id!==reqIds[1]||
     verified.data.parent_id!==parentId)return fail(stage);

  stage="approval_is_immutable";
  const mutate=await admin.from("schoolnet_sibling_parent_approvals").update({
   verification_note:"Alteration interdite de preuve administrative fictive."
  }).eq("request_id",reqIds[1]);
  if(!mutate.error)return fail(stage);

  stage="activate_second_child_with_approved_parent_reuse";
  const second=await activate(1);
  if(second.error||second.data!==true)return fail(stage);
  const repeated=await activate(1);
  if(repeated.error||repeated.data!==false)return fail("second_activation_repeat");

  stage="two_children_exactly_once";
  const [actualLinks,parent,approved,inviteCount,states]=await Promise.all([
   admin.from("parent_links").select("student_id,parent_id")
    .eq("parent_id",parentId),
   admin.from("profiles").select("child_ids").eq("id",parentId).single(),
   admin.from("schoolnet_sibling_parent_approvals").select("request_id")
    .eq("parent_id",parentId),
   admin.from("schoolnet_family_invitation_records").select("request_id")
    .eq("user_id",parentId),
   admin.from("schoolnet_student_no_email_requests").select("status,activated_at")
    .in("request_id",reqIds)
  ]);
  const expected=new Set([child1,child2]);
  if(actualLinks.error||actualLinks.data?.length!==2||
     actualLinks.data.some(x=>x.parent_id!==parentId||!expected.has(x.student_id))||
     new Set(actualLinks.data.map(x=>x.student_id)).size!==2||
     parent.error||parent.data?.child_ids?.length!==2||
     !parent.data.child_ids.every((x:string)=>expected.has(x))||
     approved.error||approved.data?.length!==1||inviteCount.error||
     inviteCount.data?.length!==1||states.error||states.data?.length!==2||
     states.data.some(x=>x.status!=="enabled"||!x.activated_at))
   return fail(stage);

  stage="real_parent_rls_reads_both_children";
  const signed=publicClient(anon,parentJwt),signedChild=publicClient(anon,childJwt);
  const [visible,visibleLinks,unrelated]=await Promise.all([
   signed.from("profiles").select("id,role").in("id",[child1,child2]),
   signed.from("parent_links").select("student_id").eq("parent_id",parentId),
   signedChild.from("profiles").select("id").eq("id",child2).maybeSingle()
  ]);
  if(visible.error||visible.data?.length!==2||
     visible.data.some(x=>x.role!=="student"||!expected.has(x.id))||
     visibleLinks.error||visibleLinks.data?.length!==2||
     unrelated.error||unrelated.data!==null)
   return fail(stage);

  stage="original_sandbox_cases_still_unchanged";
  const baseline=await admin.from("public_enrollment_requests")
    .select("reference,status").in("reference",["DEM-L5C-SBX-TEST01","DEM-L5C-NG-06"]);
  const [totalAuth,allLinksCount,approvalCount,appCount]=await Promise.all([
   admin.auth.admin.listUsers({page:1,perPage:100}),
   admin.from("parent_links").select("id",{head:true,count:"exact"}),
   admin.from("schoolnet_sibling_parent_approvals").select("request_id",{head:true,count:"exact"}),
   admin.from("public_enrollment_requests").select("id",{head:true,count:"exact"})
  ]);
  if(baseline.error||baseline.data?.length!==2||
     totalAuth.error||totalAuth.data?.users.length!==22||
     allLinksCount.error||allLinksCount.count!==4||
     approvalCount.error||approvalCount.count!==1||
     appCount.error||appCount.count!==9)
   return fail(stage);

  return respond(200,{
   ok:true,sandbox_only:true,synthetic_auth_accounts_created:3,
   one_parent_two_students:true,
   only_one_parent_invitation:true,
   duplicate_parent_invitation_blocked:true,
   first_child_activated:true,
   second_child_activation_without_approval_rejected:true,
   failed_activation_rolled_back:true,
   non_admin_approval_rejected:true,
   distinct_second_child_approval_created:true,
   approval_immutable:true,
   second_child_autolink_activated:true,
   second_activation_duplicate_blocked:true,
   parent_links_for_both_children:2,
   parent_child_ids_count:2,
   parent_jwt_reads_two_children:true,
   child_jwt_cannot_read_sibling:true,
   no_annual_class_enrollment_required:true,
   original_cases_unchanged:true,
   real_messages_sent:false
  });
 }catch{return fail(stage,503);}
});
