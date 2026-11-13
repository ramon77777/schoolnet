// SCHOOLNET - release candidate of the school code / family phone / password login.
// Production PILOT for one authorized student request. Public endpoint is guarded
// by Turnstile, server-side rate limits, verified Auth password and request allowlist.
// Emergency disable: SCHOOLNET_STUDENT_LOGIN_ENABLED=false (Supabase Edge secret).
import {createClient} from 'npm:@supabase/supabase-js@2.90.1';
import {runSchoolnetNoEmailLogin,type NoEmailLoginDeps}
 from '../_shared/studentNoEmailLoginCore.ts';
import {SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN} from '../_shared/schoolnetStudentIdentity.ts';

const PROD='https://anttmbhaphkhmkoqsofd.supabase.co';
const ORIGIN='https://schoolnet-snowy.vercel.app';
const MAX_LENGTH=2600;
const CLIENT={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const errorBody=(status:number,message:string)=>({status,body:{ok:false,message}});
function json(status:number,body:Record<string,unknown>,allowOrigin=false){
 return new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','pragma':'no-cache',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer','vary':'Origin',
  ...(allowOrigin?{'access-control-allow-origin':ORIGIN}:{}),
 }});
}
function validIp(value:string|null):string|null{
 if(!value||value.length>64||value.includes(',')||/\s/.test(value))return null;
 if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) && value.split('.').every(x=>+x<=255))return value;
 if(value.includes(':')&&/^[0-9a-f:]{2,45}$/i.test(value)){
  try{new URL(`http://[${value}]/`);return value.toLowerCase();}catch{return null;}
 }
 return null;
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 if(origin!==ORIGIN)return json(403,{ok:false,message:'Origine non autorisee.'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'access-control-allow-origin':ORIGIN,
  'access-control-allow-methods':'OPTIONS,POST',
  'access-control-allow-headers':'apikey,authorization,x-client-info,content-type',
  'access-control-max-age':'600','vary':'Origin','cache-control':'no-store',
 }});
 if(req.method!=='POST')return json(405,{ok:false,message:'Methode non autorisee.'},true);
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')
  return json(415,{ok:false,message:'Format JSON requis.'},true);
 const url=Deno.env.get('SUPABASE_URL')||'';
 const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const pepper=Deno.env.get('SCHOOLNET_STUDENT_CODE_PEPPER')||'';
 const domain=SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN;
 // Reuse the verified Turnstile configuration already active on public requests.
 const captchaSecret=Deno.env.get('SCHOOLNET_STUDENT_TURNSTILE_SECRET')||
   Deno.env.get('TURNSTILE_SECRET_KEY')||'';
 // This pilot is explicitly authorized. Flag 'false' is the emergency stop.
 const enabled=Deno.env.get('SCHOOLNET_STUDENT_LOGIN_ENABLED')!=='false';
 const pilotId=(Deno.env.get('SCHOOLNET_STUDENT_PILOT_REQUEST_ID')||'').trim().toLowerCase();
 const isUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
 if(!enabled||url!==PROD||!anon||!secret||!captchaSecret||!isUuid(pilotId)||
   new TextEncoder().encode(pepper).length<32)
  return json(503,{ok:false,message:'Connexion scolaire non disponible.'},true);
 // This header is not the security boundary. Do not assume a user-supplied
 // header is unforgeable. Rate limits for global/phone/code are independent.
 const cfIp=validIp(req.headers.get('cf-connecting-ip'));
 const ip=cfIp||validIp(req.headers.get('x-real-ip'))||'unknown-shared';
 let body:Record<string,unknown>;
 try{
  const declared=Number(req.headers.get('content-length')||0);
  if(declared>MAX_LENGTH)throw Error('large');
  const raw=await req.text();
  if(raw.length>MAX_LENGTH)throw Error('large');
  body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='captchaToken,password,phone,studentCode'||
    typeof body.captchaToken!=='string'||body.captchaToken.length>2048)
   throw Error('bad');
 }catch{return json(400,{ok:false,message:'Requete invalide.'},true);}
 // Turnstile is verified server-side; browser-origin checks alone are spoofable.
 try{
  const form=new FormData();
  form.set('secret',captchaSecret);form.set('response',body.captchaToken as string);
  // Turnstile remoteip is optional; only pass the Cloudflare value if present.
  if(cfIp)form.set('remoteip',cfIp);
  const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
   {method:'POST',body:form,signal:AbortSignal.timeout(8500)});
  const result=await res.json() as {success?:boolean;hostname?:string};
  if(!res.ok||result.success!==true||result.hostname!==new URL(ORIGIN).hostname)
   return json(403,{ok:false,message:'Verification de securite non valide.'},true);
 }catch{return json(503,{ok:false,message:'Verification de securite indisponible.'},true);}

 const svc=createClient(url,secret,CLIENT);
 const pub=()=>createClient(url,anon,CLIENT);
 const deps:NoEmailLoginDeps={
  async gate({phone,codeHmac,phoneHmac,ipHmac}){
   const {data,error}=await svc.rpc('schoolnet_no_email_login_gate',{
    p_phone_e164:phone,p_code_hmac:codeHmac,
    p_phone_bucket_hmac:phoneHmac,p_ip_bucket_hmac:ipHmac,
   });
   if(error||!Array.isArray(data)||data.length!==1||
    typeof data[0].rate_allowed!=='boolean')throw Error('gate unavailable');
   // Global, per-phone and per-code counters were already incremented by SQL.
   // Additionally, ONLY the user's selected request is permitted in this pilot.
   const candidate=data[0].student_auth_user_id as string|null;
   if(!data[0].rate_allowed||!candidate)
     return {allowed:data[0].rate_allowed,id:null};
   const {data:record,error:recordError}=await svc
     .from('schoolnet_student_no_email_requests')
     .select('request_id')
     .eq('student_auth_user_id',candidate)
     .maybeSingle();
   if(recordError)throw Error('pilot unavailable');
   const pilotMatch=typeof record?.request_id==='string' &&
     record.request_id.toLowerCase()===pilotId;
   return {allowed:true,id:pilotMatch?candidate:null};
  },
  async getUser(id){
   const {data,error}=await svc.auth.admin.getUserById(id);
   if(error)throw Error('directory unavailable');
   const u=data.user;
   if(!u||u.id!==id)return null;
   return {email:u.email??null,isSchoolnetNoEmail:u.app_metadata?.schoolnet_no_email_student===true};
  },
  async signIn(email,password){
   const {data,error}=await pub().auth.signInWithPassword({email,password});
   if(error||!data.session||!data.user)return null;
   return {id:data.user.id,accessToken:data.session.access_token,
    refreshToken:data.session.refresh_token,expiresIn:data.session.expires_in};
  },
  async verifyAccess(token){
   const {data,error}=await svc.auth.getUser(token);
   return error?null:(data.user?.id??null);
  },
  async activateAfterPassword(id,phone,codeHmac){
   const {data,error}=await svc.rpc('schoolnet_no_email_activate_after_password',{
    p_user_id:id,p_phone_e164:phone,p_code_hmac:codeHmac,
   });
   if(error||typeof data!=='boolean')throw Error('activation unavailable');
   return data;
  },
  async isEnabled(id,phone,codeHmac){
   const {data,error}=await svc.rpc('schoolnet_no_email_login_enabled',{
    p_user_id:id,p_phone_e164:phone,p_code_hmac:codeHmac,
   });
   if(error||typeof data!=='boolean')throw Error('status unavailable');
   return data;
  },
  async audit(outcome){
   const {error}=await svc.rpc('schoolnet_no_email_login_audit',{p_outcome:outcome});
   if(error)throw Error('audit unavailable');
  },
 };
 const r=await runSchoolnetNoEmailLogin({
  phone:body.phone,studentCode:body.studentCode,password:body.password,
 },ip,pepper,domain,deps);
 return json(r.status,r.body,true);
});