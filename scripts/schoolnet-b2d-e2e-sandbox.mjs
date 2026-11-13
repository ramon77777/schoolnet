// SCHOOLNET - 5.C-B.2 D.2 - real Auth integration on SANDBOX ONLY.
// Execute manually, once, from your trusted local PC. Never import into browser.
// Uses your local env credentials; never prints passwords, codes, tokens or emails.
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  generateSchoolnetStudentCode,
  studentCodeLookupDigest,
} from '../supabase/functions/_shared/schoolnetStudentIdentity.ts';
import { runSandboxStudentLogin } from '../supabase/functions/_shared/studentLoginCore.ts';

const SANDBOX = 'https://onqlsvphmrqhelislpry.supabase.co';
const PHONE = '+2250799999999'; // purely fictitious, shared outside auth.users.phone
const TEST_ACCOUNTS = ['schoolnet-b2b-student-01@schoolnet.invalid', 'schoolnet-b2b-student-02@schoolnet.invalid'];
const OLDER_TEST_ACCOUNTS = ['schoolnet-b3-parent@example.test', 'schoolnet-b3-student@example.test'];
const CONFIRM = 'OUI_RECETTE_B2D2_SANDBOX_2_ELEVES';
const OPTIONS = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const info = (message) => process.stdout.write(`[SCHOOLNET/B2D2] ${message}\n`);
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const abort = (phase) => { throw new Error(`STOP_${phase}`); };

export function checkEnv(env, requirePepper=false) {
  assert(String(env.SCHOOLNET_SANDBOX_URL||'').trim() === SANDBOX,'WRONG_PROJECT');
  const anon=String(env.SCHOOLNET_SANDBOX_PUBLISHABLE_KEY||'').trim();
  const service=String(env.SCHOOLNET_SANDBOX_SERVICE_ROLE_KEY||'').trim();
  assert(anon.length>15 && service.length>15 && anon !== service,'MISSING_OR_INVALID_KEYS');
  assert(/^[\x21-\x7e]+$/.test(anon) && /^[\x21-\x7e]+$/.test(service),'INVALID_KEY_CHARS');
  const pepper=String(env.SCHOOLNET_STUDENT_CODE_PEPPER||'');
  if(requirePepper) assert(new TextEncoder().encode(pepper).length>=32,'MISSING_PEPPER');
  return {anon,service,pepper};
}
export function assertTestRoster(users) {
  const expected=new Set([...TEST_ACCOUNTS,...OLDER_TEST_ACCOUNTS]);
  assert(Array.isArray(users) && users.length===4,'UNEXPECTED_ROSTER_SIZE');
  for(const user of users) {
    const email=String(user?.email??'').toLowerCase();
    assert(expected.delete(email),'UNEXPECTED_ACCOUNT');
    assert(user?.app_metadata?.schoolnet_sandbox===true,'UNEXPECTED_TEST_MARKER');
    if(TEST_ACCOUNTS.includes(email))
      assert(user?.app_metadata?.schoolnet_sandbox_student_b2b===true && !user.phone,'INVALID_B2B_MARKER');
  }
  assert(expected.size===0,'MISSING_TEST_ACCOUNT');
  return true;
}
export function assertInventory(rows, expected) {
  assert(Array.isArray(rows) && rows.length===1,'INVENTORY_UNAVAILABLE');
  const row=rows[0];
  assert(Number(row.identity_count)===expected,'INVENTORY_MISMATCH');
  return true;
}

export async function runB2dScenario(admin, createPublic, pepper) {
  let phase='preflight';
  const roster=await admin.auth.admin.listUsers({page:1,perPage:100});
  if(roster.error||!roster.data) abort(phase);
  assertTestRoster(roster.data.users);
  const inv=await admin.rpc('schoolnet_student_sandbox_inventory');
  if(inv.error) abort('inventory');
  assertInventory(inv.data,0); // stop a second run, do not create duplicates or reset existing accounts
  const creds=[];
  try {
    for(let i=0;i<TEST_ACCOUNTS.length;i++) {
      const email=TEST_ACCOUNTS[i];
      const original=roster.data.users.find(u=>u.email?.toLowerCase()===email);
      assert(original,'MISSING_AUTH_USER');
      phase='recovery_'+(i+1);
      const link=await admin.auth.admin.generateLink({type:'recovery',email});
      if(link.error||!link.data?.properties?.hashed_token||
         link.data?.properties?.verification_type!=='recovery'||
         link.data?.user?.id!==original.id) abort(phase);
      const resetClient=createPublic();
      phase='consume_recovery_'+(i+1);
      const consumed=await resetClient.auth.verifyOtp({
        type:'recovery',token_hash:link.data.properties.hashed_token,
      });
      if(consumed.error||consumed.data?.user?.id!==original.id||!consumed.data.session) abort(phase);
      phase='set_new_password_'+(i+1);
      const password='SN!'+randomBytes(30).toString('hex');
      const changed=await resetClient.auth.updateUser({password});
      if(changed.error||changed.data?.user?.id!==original.id) abort(phase);
      if((await resetClient.auth.signOut()).error) abort('signout_'+(i+1));

      phase='auth_login_check_'+(i+1);
      const signIn=await createPublic().auth.signInWithPassword({email,password});
      if(signIn.error||signIn.data.user?.id!==original.id||!signIn.data.session) abort(phase);
      const verified=await admin.auth.getUser(signIn.data.session.access_token);
      if(verified.error||verified.data.user?.id!==original.id) abort('auth_proof_'+(i+1));
      const updated=await admin.auth.admin.getUserById(original.id);
      if(updated.error||updated.data.user?.app_metadata?.schoolnet_sandbox_student_b2b!==true)
        abort('role_marker_'+(i+1));

      phase='provision_'+(i+1);
      const code=generateSchoolnetStudentCode();
      const codeHmac=await studentCodeLookupDigest(code,pepper);
      const provisioned=await admin.rpc('schoolnet_student_sandbox_provision',{
        p_auth_user_id:original.id,p_code_hmac:codeHmac,p_family_phone:PHONE,
      });
      if(provisioned.error||provisioned.data!==true) abort(phase);
      phase='activate_'+(i+1);
      const activated=await admin.rpc('schoolnet_student_sandbox_activate',{
        p_auth_user_id:original.id,p_code_hmac:codeHmac,p_family_phone:PHONE,
      });
      if(activated.error||activated.data!==true) abort(phase);
      creds.push({id:original.id,code,password});
    }

    phase='final_inventory';
    const inventory=await admin.rpc('schoolnet_student_sandbox_inventory');
    if(inventory.error) abort(phase);
    assertInventory(inventory.data,2);
    assert(Number(inventory.data[0].enabled_count)===2,'NOT_ENABLED');

    // Exactly the same Supabase Auth / SQL RPCs as the Edge adapter, without
    // exposing a public unauthenticated Edge Function during the sandbox test.
    const deps={
      async gate({phone,codeHmac,phoneHmac,ipHmac}) {
        const {data,error}=await admin.rpc('schoolnet_student_login_gate',{
          p_phone_e164:phone,p_code_hmac:codeHmac,
          p_phone_bucket_hmac:phoneHmac,p_ip_bucket_hmac:ipHmac,
        });
        if(error||!Array.isArray(data)||data.length!==1) abort('gate');
        return {rateAllowed:data[0].rate_allowed,userId:data[0].student_auth_user_id??null};
      },
      async getAuthUser(id) {
        const {data,error}=await admin.auth.admin.getUserById(id);
        if(error||!data.user) abort('get_auth_user');
        return {email:data.user.email??null,sandboxStudent:
          data.user.app_metadata?.schoolnet_sandbox===true &&
          data.user.app_metadata?.schoolnet_sandbox_student_b2b===true};
      },
      async signIn(email,password) {
        const {data,error}=await createPublic().auth.signInWithPassword({email,password});
        if(error||!data.user||!data.session) return null;
        return {userId:data.user.id,accessToken:data.session.access_token,
          refreshToken:data.session.refresh_token,expiresIn:data.session.expires_in};
      },
      async verifyAccess(token) {
        const {data,error}=await admin.auth.getUser(token);
        return error?null:(data.user?.id??null);
      },
      async isEnabled(id,phone,codeHmac) {
        const {data,error}=await admin.rpc('schoolnet_student_login_enabled',{
          p_student_auth_user_id:id,p_phone_e164:phone,p_code_hmac:codeHmac,
        });
        if(error||typeof data!=='boolean') abort('is_enabled');
        return data;
      },
      async audit(outcome) {
        const {error}=await admin.rpc('schoolnet_student_login_audit',{p_outcome:outcome});
        if(error) abort('audit');
      },
    };
    const proof=[];
    for(let i=0;i<creds.length;i++) {
      phase='student_composite_login_'+(i+1);
      const result=await runSandboxStudentLogin({
        phone:PHONE,studentCode:creds[i].code,password:creds[i].password,
      },'198.51.100.200',pepper,deps);
      if(result.status!==200||result.body.ok!==true||
         typeof result.body.access_token!=='string') abort(phase);
      const auth=await admin.auth.getUser(result.body.access_token);
      if(auth.error||auth.data.user?.id!==creds[i].id) abort('token_to_student_'+(i+1));
      proof.push(result.body.access_token);
    }
    assert(proof[0]!==proof[1],'NON_DISTINCT_SESSIONS');

    phase='wrong_password';
    const wrong=await runSandboxStudentLogin({
      phone:PHONE,studentCode:creds[0].code,password:'DefinitelyWrong!1',
    },'198.51.100.200',pepper,deps);
    assert(wrong.status===401 && wrong.body.access_token===undefined,'WRONG_PASSWORD_ACCEPTED');

    phase='unknown_code';
    const unknown=await runSandboxStudentLogin({
      phone:PHONE,studentCode:generateSchoolnetStudentCode(),password:'WrongTestPassword!1',
    },'198.51.100.200',pepper,deps);
    assert(unknown.status===401&&unknown.body.access_token===undefined,'UNKNOWN_CODE_ACCEPTED');
    return {
      passed:true,sandbox_only:true,identities_provisioned:2,identities_enabled:2,
      shared_family_contact:true,auth_sessions_independent:true,
      two_composite_logins_passed:true,wrong_password_rejected:true,
      unknown_code_rejected:true,users_reused_not_recreated:true,
      production_untouched_by_script:true,
      parent_link_not_tested:true,edge_endpoint_not_opened:true,
    };
  } catch {
    abort(phase); // Partial state must be reviewed manually. NEVER rerun or auto-delete.
  }
}

async function main() {
  const mode=process.argv[2]??'--help';
  if(mode==='--help') {
    info('Modes: --preflight (read-only), --run (ONE TIME sandbox setup + real Auth test)');
    return;
  }
  assert(mode==='--preflight'||mode==='--run','INVALID_MODE');
  const {anon,service,pepper}=checkEnv(process.env,mode==='--run');
  if(mode==='--run') assert(process.env.SCHOOLNET_B2D_CONFIRMATION===CONFIRM,'CONFIRMATION_REQUIRED');
  const {createClient}=await import('@supabase/supabase-js');
  const admin=createClient(SANDBOX,service,OPTIONS);
  const roster=await admin.auth.admin.listUsers({page:1,perPage:100});
  if(roster.error||!roster.data) abort('roster');
  assertTestRoster(roster.data.users);
  const inv=await admin.rpc('schoolnet_student_sandbox_inventory');
  if(inv.error) abort('inventory');
  assertInventory(inv.data,0);
  if(mode==='--preflight') {
    info('PRE-FLIGHT OK: quatre comptes fictifs, table identites vide, aucune ecriture.');
    return;
  }
  const makePublic=()=>createClient(SANDBOX,anon,OPTIONS);
  const result=await runB2dScenario(admin,makePublic,pepper);
  info(`RECETTE COMPLETE: ${JSON.stringify(result)}`);
  info('Conserver les comptes pour audit. NE PAS relancer --run.');
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch((error)=>{
    info(`RECETTE STOP: ${String(error?.message||'UNKNOWN_STAGE').replace(/[^A-Z0-9_]/g,'')}`);
    process.exitCode=1;
  });
}