// SCHOOLNET Lot 5.C — environnement serveur strict, sans aucune écriture.
// Production : origine et projet exacts. Sandbox : double opt-in explicite.
// Cette vérification ne remplace jamais Auth, JWT, RLS, Turnstile ou rate-limits.
export const STUDENT_PRODUCTION_PROJECT='https://anttmbhaphkhmkoqsofd.supabase.co';
export const STUDENT_SANDBOX_PROJECT='https://onqlsvphmrqhelislpry.supabase.co';
export const STUDENT_PRODUCTION_ORIGIN='https://schoolnet-snowy.vercel.app';

export type StudentRuntimeGateInput={
 projectUrl:string;
 requestOrigin:string;
 executionMode?:string|null;
 sandboxEnabled?:string|null;
 sandboxOrigin?:string|null;
};

function validSandboxOrigin(value:string):boolean{
 try{
  const url=new URL(value);
  if(url.origin!==value||url.username||url.password||url.pathname!=='/'||
     url.search||url.hash)return false;
  const browserPreview=url.protocol==='https:'&&
   url.hostname.startsWith('schoolnet-')&&
   url.hostname.endsWith('.vercel.app')&&
   value!==STUDENT_PRODUCTION_ORIGIN;
  const localhost=url.protocol==='http:'&&url.port==='5173'&&
   (url.hostname==='localhost'||url.hostname==='127.0.0.1');
  return browserPreview||localhost;
 }catch{return false;}
}

// Return null unless the pair (Supabase project + browser Origin) is approved.
// In particular, setting "sandbox" on production Supabase can NEVER open access.
export function schoolnetStudentAllowedOrigin(input:StudentRuntimeGateInput):string|null{
 if(input.projectUrl===STUDENT_PRODUCTION_PROJECT){
  const productionMode=!input.executionMode||input.executionMode==='production';
  return productionMode&&input.requestOrigin===STUDENT_PRODUCTION_ORIGIN
   ? STUDENT_PRODUCTION_ORIGIN:null;
 }
 if(input.projectUrl!==STUDENT_SANDBOX_PROJECT||
    input.executionMode!=='sandbox'||
    input.sandboxEnabled!=='true'||!input.sandboxOrigin||
    !validSandboxOrigin(input.sandboxOrigin)||
    input.requestOrigin!==input.sandboxOrigin)return null;
 return input.sandboxOrigin;
}
