// SCHOOLNET 5.C-B.2 / Etape 2.D — SANDBOX-ONLY login backend.
// Not for production: depends on two B2B synthetic accounts and a sandbox-only schema.
// verify_jwt=false is necessary for login, so secrets and atomic SQL gate are mandatory.
// FAILS CLOSED until SCHOOLNET_STUDENT_LOGIN_ENABLED=true, sandbox URL, origin,
// HMAC pepper, trusted proxy IP header and Supabase keys are configured.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { runSandboxStudentLogin, type LoginDeps } from "../_shared/studentLoginCore.ts";

const SANDBOX_URL = "https://onqlsvphmrqhelislpry.supabase.co";
const MAX_BODY = 2048;
// Safety interlock: intentionally true for the first sandbox deployment.
// A future, separately reviewed change is required before any real login.
const STAGED_SANDBOX_DISABLED = true;
const AUTH_OPTS = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};

function jsonReply(status: number, body: Record<string, unknown>, origin?: string) {
  const headers: Record<string,string> = {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "vary":"Origin",
  };
  if(origin) headers["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(body),{status,headers});
}
function normalizeTrustedProxyIp(header: string | null): string | null {
  if (!header || header.length > 64 || header.includes(",") || /\s/.test(header)) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(header)) {
    if (header.split(".").every(v=>Number(v)<=255)) return header;
    return null;
  }
  if (/^[0-9a-fA-F:]{2,45}$/.test(header) && header.includes(":")) {
    try { new URL(`http://[${header}]/`); return header.toLowerCase(); }
    catch { return null; }
  }
  return null;
}
async function readSmallJson(req: Request): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if(declared && (!/^\d+$/.test(declared) || Number(declared)>MAX_BODY)) throw Error("Invalid length");
  if(!req.body) throw Error("Empty request");
  const reader = req.body.getReader();
  let size=0;
  const buffers: Uint8Array[]=[];
  while(true){
    const {done,value}=await reader.read();
    if(done) break;
    size+=value.byteLength;
    if(size>MAX_BODY){await reader.cancel();throw Error("Too large");}
    buffers.push(value);
  }
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const part of buffers){bytes.set(part,offset);offset+=part.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}

Deno.serve(async(req: Request) => {
  // Strict origin check is a browser defense, not authentication.
  // Direct callers can spoof Origin; rate limiting and WAF are still required.
  const allowedOrigin=Deno.env.get("SCHOOLNET_STUDENT_LOGIN_ALLOWED_ORIGIN")||"";
  const origin=req.headers.get("origin")||"";
  const acceptedOrigin=allowedOrigin!=="" &&
    (/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(allowedOrigin) ||
     /^http:\/\/localhost:\d{2,5}$/.test(allowedOrigin)) && origin===allowedOrigin;
  if(!acceptedOrigin) return jsonReply(403,{ok:false,message:"Origine non autorisee."});
  if(req.method==="OPTIONS"){
    return new Response(null,{status:204,headers:{
      "access-control-allow-origin":allowedOrigin,
      "access-control-allow-methods":"POST, OPTIONS",
      "access-control-allow-headers":"content-type, apikey, authorization, x-client-info",
      "access-control-max-age":"600",
      "cache-control":"no-store",
      "vary":"Origin",
    }});
  }
  if(req.method!=="POST") return jsonReply(405,{ok:false,message:"Methode non autorisee."},allowedOrigin);
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type")||""))
    return jsonReply(415,{ok:false,message:"Format non pris en charge."},allowedOrigin);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const pepper=Deno.env.get("SCHOOLNET_STUDENT_CODE_PEPPER")||"";
  if(STAGED_SANDBOX_DISABLED ||
     Deno.env.get("SCHOOLNET_STUDENT_LOGIN_ENABLED")!=="true" ||
     url!==SANDBOX_URL || !serviceKey || !anonKey ||
     new TextEncoder().encode(pepper).length<32){
    return jsonReply(503,{ok:false,message:"Connexion momentanement indisponible."},allowedOrigin);
  }
  // Cloudflare header must be verified as overwritten by the trusted proxy.
  // Do not fall back to client-controlled X-Forwarded-For.
  const ip=normalizeTrustedProxyIp(req.headers.get("cf-connecting-ip"));
  if(!ip) return jsonReply(503,{ok:false,message:"Connexion momentanement indisponible."},allowedOrigin);

  let input: unknown;
  try {input=await readSmallJson(req);}
  catch{return jsonReply(400,{ok:false,message:"Requete invalide."},allowedOrigin);}

  const privileged=createClient(url,serviceKey,AUTH_OPTS);
  const publicAuth=()=>createClient(url,anonKey,AUTH_OPTS);
  const deps: LoginDeps={
    async gate({phone,codeHmac,phoneHmac,ipHmac}){
      const {data,error}=await privileged.rpc("schoolnet_student_login_gate",{
        p_phone_e164:phone,p_code_hmac:codeHmac,
        p_phone_bucket_hmac:phoneHmac,p_ip_bucket_hmac:ipHmac,
      });
      if(error || !Array.isArray(data) || data.length!==1 ||
         typeof data[0].rate_allowed!=="boolean") throw Error("Gate unavailable");
      return {rateAllowed:data[0].rate_allowed,userId:data[0].student_auth_user_id??null};
    },
    async getAuthUser(userId){
      const {data,error}=await privileged.auth.admin.getUserById(userId);
      if(error) throw Error("Auth directory unavailable");
      const u=data?.user;
      if(!u || u.id!==userId) return null;
      return {email:u.email??null,sandboxStudent:
        u.app_metadata?.schoolnet_sandbox===true &&
        u.app_metadata?.schoolnet_sandbox_student_b2b===true};
    },
    async signIn(email,password){
      const {data,error}=await publicAuth().auth.signInWithPassword({email,password});
      if(error || !data.session || !data.user) return null;
      return {userId:data.user.id,accessToken:data.session.access_token,
        refreshToken:data.session.refresh_token,expiresIn:data.session.expires_in};
    },
    async verifyAccess(token){
      const {data,error}=await publicAuth().auth.getUser(token);
      return error ? null : (data.user?.id??null);
    },
    async isEnabled(id,phone,codeHmac){
      const {data,error}=await privileged.rpc("schoolnet_student_login_enabled",{
        p_student_auth_user_id:id,p_phone_e164:phone,p_code_hmac:codeHmac,
      });
      if(error || typeof data!=="boolean") throw Error("Status check unavailable");
      return data;
    },
    async audit(outcome){
      const {error}=await privileged.rpc("schoolnet_student_login_audit",{
        p_outcome:outcome,
      });
      if(error) throw Error("Audit unavailable");
    },
  };
  const result=await runSandboxStudentLogin(input,ip,pepper,deps);
  return jsonReply(result.status,result.body,allowedOrigin);
});
