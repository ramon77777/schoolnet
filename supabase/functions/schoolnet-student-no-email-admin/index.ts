// SCHOOLNET 5.C-B.2 - NEW server-only onboarding path for children without email.
// REVIEW/DEPLOY ONLY AFTER SQL migration, secret config, test and explicit approval.
// Zero automatic emails; one-time code and Auth invite link are returned ONLY to a verified Admin.
import {createClient} from 'npm:@supabase/supabase-js@2.90.1';
import {generateSchoolnetStudentCode,studentCodeLookupDigest} from '../_shared/schoolnetStudentIdentity.ts';
import {validateStudentNoEmailRequest,technicalSchoolnetAlias,validateAdminVerification,
  type StudentRequest,type ParentInvitation} from '../_shared/studentNoEmailPolicy.ts';

const PROD_PROJECT='https://anttmbhaphkhmkoqsofd.supabase.co';
const PROD_ORIGIN='https://schoolnet-snowy.vercel.app';
const MAX_BODY=3500;
const OPTIONS={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
type Action='inspect'|'prepare'|'declare_sent';
type Body={action?:unknown;request_id?:unknown;verified?:unknown;delivery_confirmed?:unknown;verification_note?:unknown};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(origin:string,status:number,body:Record<string,unknown>) {
 return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'vary':'Origin','access-control-allow-origin':origin,
  'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, apikey, content-type, x-client-info'}});
}
function deny(origin:string,code:number,message:string){return reply(origin,code,{success:false,message});}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 // Strict administrative origin. Origin is not authorization; server JWT validation follows.
 if(origin!==PROD_ORIGIN) return new Response('Forbidden',{status:403});
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, apikey, content-type, x-client-info','cache-control':'no-store','vary':'Origin'}});
 if(req.method!=='POST') return deny(origin,405,'Methode non autorisee.');
 const url=Deno.env.get('SUPABASE_URL')||'';
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 const pepper=Deno.env.get('SCHOOLNET_STUDENT_CODE_PEPPER')||'';
 if(url!==PROD_PROJECT||!secret||!anon ||
    Deno.env.get('SCHOOLNET_STUDENT_ACCOUNTS_ENABLED')!=='true')
   return deny(origin,503,'Service Apprenant sans e-mail non active.');
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
   return deny(origin,415,'Format non pris en charge.');
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [^\s]+$/.test(authorization))return deny(origin,401,'Connexion Admin requise.');

 let body:Body;
 try{
  const length=Number(req.headers.get('content-length')||0);
  if(length>MAX_BODY) throw Error('payload');
  const raw=await req.text();
  if(raw.length>MAX_BODY)throw Error('payload');
  body=JSON.parse(raw) as Body;
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('payload');
 }catch{return deny(origin,400,'Requete invalide.');}
 const action=body.action as Action;
 const requestId=body.request_id;
 if(!['inspect','prepare','declare_sent'].includes(action)||
    typeof requestId!=='string'||!UUID.test(requestId))
   return deny(origin,400,'Demande ou action invalide.');

 const service=createClient(url,secret,OPTIONS);
 const {data:verified,error:authErr}=await service.auth.getUser(authorization.slice(7));
 if(authErr||!verified.user)return deny(origin,401,'Session expiree.');
 const actor=verified.user.id;
 const {data:actorProfile,error:roleErr}=await service.from('profiles').select('role').eq('id',actor).maybeSingle();
 if(roleErr||actorProfile?.role!=='admin')return deny(origin,403,'Super Administrateur uniquement.');

 const {data:request,error:requestErr}=await service.from('public_enrollment_requests')
  .select('id,request_type,status,student_full_name,student_email,guardian_email,guardian_phone')
  .eq('id',requestId).maybeSingle();
 if(requestErr)return deny(origin,503,'Demande non disponible.');
 if(!request)return deny(origin,404,'Demande introuvable.');
 const {data:parentRecord,error:parentErr}=await service.from('schoolnet_family_invitation_records')
  .select('recipient,expected_role,status,email,user_id').eq('request_id',requestId)
  .eq('recipient','parent').maybeSingle();
 if(parentErr)return deny(origin,503,'Preuve parent indisponible.');
 if(!parentRecord)return deny(origin,409,'Le compte Parent doit etre active en premier.');
 let check:{parentId:string;familyPhone:string;studentName:string};
 try{check=validateStudentNoEmailRequest(request as StudentRequest,parentRecord as ParentInvitation);}
 catch{return deny(origin,409,'Demande sans e-mail ou lien Parent non verifie.');}

 const {data:parentProfile,error:parentProfileErr}=await service.from('profiles')
  .select('role').eq('id',check.parentId).maybeSingle();
 const parentAuth=await service.auth.admin.getUserById(check.parentId);
 if(parentProfileErr||parentProfile?.role!=='parent'||parentAuth.error||!parentAuth.data.user||
    parentAuth.data.user.email?.toLowerCase()!==request.guardian_email?.trim().toLowerCase()||
    !parentAuth.data.user.email_confirmed_at||
    parentAuth.data.user.app_metadata?.schoolnet_family_invitation!==true)
   return deny(origin,409,'Preuve du compte Parent insuffisante.');

 const {data:record,error:recordErr}=await service.from('schoolnet_student_no_email_requests')
  .select('request_id,parent_id,student_auth_user_id,status,sent_at,activated_at')
  .eq('request_id',requestId).maybeSingle();
 if(recordErr)return deny(origin,503,'Registre scolaire non disponible.');
 if(action==='inspect')return reply(origin,200,{success:true,status:record?.status??'not_prepared',
  student_id:record?.student_auth_user_id??null,
  has_delivery:Boolean(record?.sent_at),is_activated:Boolean(record?.activated_at),
  parent_verified:true,request_id:requestId});
 let note:string;
 try{
  if(body.verified!==true)throw Error('verified');
  note=validateAdminVerification(body.verification_note);
 }catch{return deny(origin,422,'Verification administrative et note de 10 caracteres requises.');}

 if(action==='declare_sent'){
  if(!record||record.status!=='prepared'||body.delivery_confirmed!==true)
   return deny(origin,409,'Invitation non preparee ou transmission non attestee.');
  const now=new Date().toISOString();
  const {data:changed,error:changedErr}=await service.from('schoolnet_student_no_email_requests')
   .update({status:'sent_declared',sent_at:now,last_action_by:actor})
   .eq('request_id',requestId).eq('status','prepared').is('sent_at',null)
   .select('request_id').maybeSingle();
  if(changedErr||!changed)return deny(origin,409,'Transmission non enregistree : actualisez.');
  return reply(origin,200,{success:true,status:'sent_declared',password_login_required:true});
 }
 if(record)return deny(origin,409,'Un compte a deja ete reserve pour cette demande. Aucun doublon autorise.');
 let technicalEmail:string;
 try{
  technicalEmail=technicalSchoolnetAlias(requestId);
  if(new TextEncoder().encode(pepper).length<32)throw Error('secret');
 }catch{return deny(origin,503,'Configuration serveur incomplete.');}
 const destination=`${PROD_ORIGIN}/auth/reset-password?mode=student-invite`;

 // Commit the unique request reservation BEFORE calling Auth; never silently retry on timeouts.
 const {error:reserveError}=await service.from('schoolnet_student_no_email_requests').insert({
  request_id:requestId,parent_id:check.parentId,technical_email:technicalEmail,
  family_phone_e164:check.familyPhone,verification_note:note,
  status:'reserved',prepared_by:actor,last_action_by:actor,
 });
 if(reserveError)return deny(origin,409,'Reservation deja existante ou impossible : revue manuelle.');
 async function move(expected:string,next:string,patch:Record<string,unknown>={}){
  const {data,error}=await service.from('schoolnet_student_no_email_requests')
   .update({status:next,last_action_by:actor,...patch})
   .eq('request_id',requestId).eq('status',expected)
   .select('request_id').maybeSingle();
  return !error && !!data;
 }
 async function flagReview(expected:string){await move(expected,'requires_review');}

 const started=Date.now();
 try{
  const created=await service.auth.admin.generateLink({
   type:'invite',email:technicalEmail,options:{redirectTo:destination},
  });
  const u=created.data?.user;
  const actionLink=created.data?.properties?.action_link;
  if(created.error||!u||!actionLink||u.email?.toLowerCase()!==technicalEmail||
      Boolean(u.last_sign_in_at)||Boolean(u.email_confirmed_at)||
      Date.parse(u.created_at||'')<started-15000){
   await flagReview('reserved');
   return deny(origin,409,'Creation Auth incertaine. Controle manuel obligatoire.');
  }
  if(!await move('reserved','auth_created',{student_auth_user_id:u.id})){
   await flagReview('reserved');
   return deny(origin,503,'Reservation Auth incomplete. Controle manuel requis.');
  }
  const marker=await service.auth.admin.updateUserById(u.id,{
   app_metadata:{...(u.app_metadata??{}),schoolnet_no_email_student:true,
    schoolnet_no_email_request_id:requestId},
  });
  if(marker.error||marker.data?.user?.app_metadata?.schoolnet_no_email_student!==true){
   await flagReview('auth_created');return deny(origin,503,'Compte en revue manuelle.');
  }
  // Auth creation trigger adds a minimal student profile. Keep role and name verified.
  const profile=await service.from('profiles').select('role').eq('id',u.id).maybeSingle();
  if(profile.error || (profile.data && profile.data.role!=='student')){
   await flagReview('auth_created');return deny(origin,503,'Profil non conforme.');
  }
  const updateProfile=profile.data
   ? await service.from('profiles').update({full_name:check.studentName}).eq('id',u.id).eq('role','student')
   : await service.from('profiles').insert({id:u.id,role:'student',full_name:check.studentName});
  if(updateProfile.error){await flagReview('auth_created');return deny(origin,503,'Profil indisponible.');}
  const code=generateSchoolnetStudentCode();
  const codeHmac=await studentCodeLookupDigest(code,pepper);
  if(!await move('auth_created','prepared',{student_code_hmac:codeHmac})){
   await flagReview('auth_created');return deny(origin,503,'Preparation interrompue.');
  }
  // Secrets returned once to the authenticated Admin, never written to DB or logs.
  return reply(origin,200,{success:true,status:'prepared',request_id:requestId,
   student_id:u.id,schoolnet_code:code,family_phone:check.familyPhone,
   delivery_contact_email:parentRecord.email,invitation_url:actionLink,
   manual_delivery_only:true,first_login_password_required:true});
 }catch{
  // A timeout may have created Auth even if its response was lost: no retry.
  await flagReview('reserved');
  await flagReview('auth_created');
  return deny(origin,503,'Preparation incertaine : revue manuelle, ne pas relancer.');
 }
});