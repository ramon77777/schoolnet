// SCHOOLNET - generic real student login logic; password stays exclusively in Supabase Auth.
// Release rollout requires Turnstile, a trusted IP source, SQL migration and secrets.
import {normalizeSchoolnetFamilyPhone,normalizeSchoolnetStudentCode,studentCodeLookupDigest,
 SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN}
 from './schoolnetStudentIdentity.ts';

export type NoEmailLoginOutcome='denied'|'rate_limited'|'authenticated'|'server_error';
export type NoEmailLoginDeps={
 gate(args:{phone:string;codeHmac:string;phoneHmac:string;ipHmac:string}):Promise<{allowed:boolean;id:string|null}>;
 getUser(id:string):Promise<{email:string|null;isSchoolnetNoEmail:boolean}|null>;
 signIn(email:string,password:string):Promise<{id:string;accessToken:string;refreshToken:string;expiresIn:number}|null>;
 verifyAccess(token:string):Promise<string|null>;
 activateAfterPassword(id:string,phone:string,codeHmac:string):Promise<boolean>;
 isEnabled(id:string,phone:string,codeHmac:string):Promise<boolean>;
 audit(outcome:NoEmailLoginOutcome):Promise<void>;
};
export type NoEmailLoginResponse={status:number;body:Record<string,unknown>};
const INVALID='Identifiants scolaires ou mot de passe incorrects.';
const UNAVAILABLE='Connexion scolaire momentanement indisponible.';
const fail=(status:number,message:string):NoEmailLoginResponse=>({status,body:{ok:false,message}});

export async function keyedLoginDigest(kind:'ip'|'phone',value:string,pepper:string):Promise<string>{
 if(new TextEncoder().encode(pepper).length<32)throw Error('SERVER_SECRET_REQUIRED');
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const s=new Uint8Array(await crypto.subtle.sign('HMAC',k,
  new TextEncoder().encode(`schoolnet/student-login/${kind}/v1:${value}`)));
 return Array.from(s,b=>b.toString(16).padStart(2,'0')).join('');
}

export async function runSchoolnetNoEmailLogin(
 input:unknown, trustedIp:string, pepper:string, allowedDomain:string, deps:NoEmailLoginDeps,
):Promise<NoEmailLoginResponse>{
 if(allowedDomain!==SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN ||
    !trustedIp || trustedIp.length>64 ||
    new TextEncoder().encode(pepper||'').length<32)
  return fail(503,UNAVAILABLE);
 if(!input||typeof input!=='object'||Array.isArray(input))return fail(400,'Requete incorrecte.');
 const data=input as Record<string,unknown>;
 if(Object.keys(data).sort().join(',')!=='password,phone,studentCode' ||
   typeof data.phone!=='string'||typeof data.studentCode!=='string'||
   typeof data.password!=='string'||data.password.length<12||data.password.length>256)
  return fail(400,'Requete incorrecte.');
 let phone:string,code:string;
 try{phone=normalizeSchoolnetFamilyPhone(data.phone);code=normalizeSchoolnetStudentCode(data.studentCode);}
 catch{return fail(401,INVALID);}
 try{
  const [codeHmac,phoneHmac,ipHmac]=await Promise.all([
   studentCodeLookupDigest(code,pepper),
   keyedLoginDigest('phone',phone,pepper),keyedLoginDigest('ip',trustedIp,pepper),
  ]);
  const gate=await deps.gate({phone,codeHmac,phoneHmac,ipHmac});
  if(!gate.allowed){await deps.audit('rate_limited');return fail(429,'Trop de tentatives. Reessayez plus tard.');}
  const account=gate.id?await deps.getUser(gate.id):null;
  const trustedEmail=account?.isSchoolnetNoEmail===true&&account.email&&
   account.email.endsWith(`@${allowedDomain}`) &&
   /^sn-[0-9a-f]{32}@/.test(account.email) ? account.email:null;
  const alias=trustedEmail||`student-no-such-account@${allowedDomain}`;
  const session=await deps.signIn(alias,data.password);
  if(!gate.id||!trustedEmail||!session||session.id!==gate.id){
   await deps.audit('denied');return fail(401,INVALID);
  }
  if(await deps.verifyAccess(session.accessToken)!==gate.id){
   await deps.audit('denied');return fail(401,INVALID);
  }
  // Only the holder of the school code AND a real verified Auth password may activate.
  // The SQL CAS permits this only after Admin has attested the manual delivery.
  const wasActivated=await deps.activateAfterPassword(gate.id,phone,codeHmac);
  if(!wasActivated && !(await deps.isEnabled(gate.id,phone,codeHmac))){
   await deps.audit('denied');return fail(401,INVALID);
  }
  if(!(await deps.isEnabled(gate.id,phone,codeHmac))){
   await deps.audit('denied');return fail(401,INVALID);
  }
  await deps.audit('authenticated');
  return {status:200,body:{ok:true,access_token:session.accessToken,
   refresh_token:session.refreshToken,token_type:'bearer',expires_in:session.expiresIn}};
 }catch{
  // No SQL, GoTrue error text or credentials disclosed to clients.
  try{await deps.audit('server_error');}catch{ /* fail closed */ }
  return fail(503,UNAVAILABLE);
 }
}