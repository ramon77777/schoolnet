// SCHOOLNET 5.C-B.2: controlled single-use recovery after 13 Nov 2026 timeout.
// SANDBOX ONLY. No key, password, token, school code or email is printed.
// Do not run original --run again. No automatic retry on partial writes.
import {pathToFileURL} from 'node:url';
import {
  checkEnv, assertTestRoster, assertInventory, runB2dScenario,
} from './schoolnet-b2d-e2e-sandbox.mjs';

const SANDBOX='https://onqlsvphmrqhelislpry.supabase.co';
const FIRST='schoolnet-b2b-student-01@schoolnet.invalid';
const SECOND='schoolnet-b2b-student-02@schoolnet.invalid';
const CUTOFF=Date.parse('2026-11-13T09:50:30.000Z');
const CONFIRM='OUI_REPRISE_B2D2_TIMEOUT_PREMIER_COMPTE';
const OPTIONS={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const info=msg=>process.stdout.write(`[SCHOOLNET/B2D2/RESUME] ${msg}\n`);
function requireCondition(ok, code){if(!ok)throw new Error(code);}

// No writes: validate this *specific* observed partial state, not a generic rerun.
export function assertKnownPartialState(users, inventory){
  assertTestRoster(users);
  assertInventory(inventory,0);
  const a=users.find(u=>u.email?.toLowerCase()===FIRST);
  const b=users.find(u=>u.email?.toLowerCase()===SECOND);
  requireCondition(a?.id && b?.id && a.id!==b.id,'INVALID_USER_IDS');
  const firstUpdated=Date.parse(a.updated_at||'');
  const firstLogin=Date.parse(a.last_sign_in_at||'');
  const secondUpdated=Date.parse(b.updated_at||'');
  const secondLogin=Date.parse(b.last_sign_in_at||'');
  requireCondition(Number.isFinite(firstUpdated) && firstUpdated>=CUTOFF,
    'FIRST_ACCOUNT_UPDATE_NOT_OBSERVED');
  requireCondition(Number.isFinite(firstLogin) && firstLogin>=CUTOFF,
    'FIRST_ACCOUNT_SIGNIN_NOT_OBSERVED');
  requireCondition(Number.isFinite(secondUpdated) && secondUpdated<CUTOFF &&
    Number.isFinite(secondLogin) && secondLogin<CUTOFF,
    'SECOND_ACCOUNT_CHANGED_OR_AMBIGUOUS');
  return true;
}

async function main(){
  const mode=process.argv[2]??'--help';
  if(mode==='--help'){
    info('Usage: --preflight (read-only) or --resume (once, sandbox only).');
    return;
  }
  requireCondition(mode==='--preflight'||mode==='--resume','INVALID_MODE');
  const {anon,service,pepper}=checkEnv(process.env,mode==='--resume');
  requireCondition(SANDBOX===process.env.SCHOOLNET_SANDBOX_URL,'WRONG_PROJECT');
  if(mode==='--resume')requireCondition(process.env.SCHOOLNET_B2D_RESUME_CONFIRMATION===CONFIRM,
    'RECOVERY_CONFIRMATION_REQUIRED');

  const {createClient}=await import('@supabase/supabase-js');
  const admin=createClient(SANDBOX,service,OPTIONS);
  const roster=await admin.auth.admin.listUsers({page:1,perPage:100});
  requireCondition(!roster.error && !!roster.data,'TEST_STOP_ROSTER');
  const inventory=await admin.rpc('schoolnet_student_sandbox_inventory');
  requireCondition(!inventory.error && !!inventory.data,'TEST_STOP_INVENTORY');
  assertKnownPartialState(roster.data.users,inventory.data);
  if(mode==='--preflight'){
    info('REPRISE PRE-FLIGHT OK: 4 comptes fictifs; premier compte modifie; second intact; 0 correspondance; aucune ecriture.');
    return;
  }

  // The first password was changed during the interrupted run, and the random
  // new password was lost when the process terminated. A NEW recovery/reset of
  // that synthetic account is therefore required. No user/account is recreated.
  // The original scenario safely reuses both accounts from the observed state.
  info('Reprise autorisee; deux comptes fictifs reutilises; aucun nouveau compte Auth.');
  const createPublic=()=>createClient(SANDBOX,anon,OPTIONS);
  const result=await runB2dScenario(admin,createPublic,pepper);
  info(`RECETTE REPRISE COMPLETE: ${JSON.stringify(result)}`);
  info('Ne relancez pas --resume ni --run; conservez les preuves pour audit.');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    const msg=String(error?.message||'UNKNOWN_STOP');
    // Never expose Supabase exception details or credentials.
    const safe=/^[A-Z_0-9]{3,85}$/.test(msg)?msg:'SAFE_STOP_NETWORK_OR_BACKEND';
    info(`RECETTE STOP: ${safe}`);
    process.exitCode=1;
  });
}