import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEnv,assertTestRoster,assertInventory,runB2dScenario} from './schoolnet-b2d-e2e-sandbox.mjs';

const emails=[
 'schoolnet-b3-parent@example.test','schoolnet-b3-student@example.test',
 'schoolnet-b2b-student-01@schoolnet.invalid','schoolnet-b2b-student-02@schoolnet.invalid'
];
const users=emails.map((email,i)=>({
  email,id:`00000000-0000-4000-8000-00000000000${i+1}`,phone:null,
  app_metadata:{schoolnet_sandbox:true,schoolnet_sandbox_student_b2b:i>=2},
}));
const env={SCHOOLNET_SANDBOX_URL:'https://onqlsvphmrqhelislpry.supabase.co',
 SCHOOLNET_SANDBOX_PUBLISHABLE_KEY:'anon_just_a_non_secret_mock_key',
 SCHOOLNET_SANDBOX_SERVICE_ROLE_KEY:'service_just_a_mock_key_for_unit_tests',
 SCHOOLNET_STUDENT_CODE_PEPPER:'a_purely_fictitious_test_secret_at_least_32_chars'};

test('sandbox-only environment constraints',()=>{
 assert.ok(checkEnv(env,true).pepper);
 assert.throws(()=>checkEnv({...env,SCHOOLNET_SANDBOX_URL:'https://anttmbhaphkhmkoqsofd.supabase.co'},true),/WRONG_PROJECT/);
 assert.throws(()=>checkEnv({...env,SCHOOLNET_STUDENT_CODE_PEPPER:'short'},true),/MISSING_PEPPER/);
 assert.throws(()=>checkEnv({...env,SCHOOLNET_SANDBOX_SERVICE_ROLE_KEY:'a-very-long-invalid\nheader'},true),/INVALID_KEY_CHARS/);
});
test('B2B and older synthetic users recognized and validated',()=>{
 assert.equal(assertTestRoster(users),true);
 assert.throws(()=>assertTestRoster(users.slice(0,3)),/UNEXPECTED_ROSTER_SIZE/);
 assert.throws(()=>assertTestRoster([...users.slice(0,3),{...users[3],phone:'+2250700000000'}]),/INVALID_B2B_MARKER/);
 assert.throws(()=>assertTestRoster([...users.slice(0,3),{...users[3],email:'real@example.com'}]),/UNEXPECTED_ACCOUNT/);
});
test('preflight blocks any previously created mapping',()=>{
 assert.equal(assertInventory([{identity_count:0}],0),true);
 assert.throws(()=>assertInventory([{identity_count:1}],0),/INVENTORY_MISMATCH/);
});

test('two distinct accounts: recovery, provisioning, auth, shared phone and independent composite sessions',async()=>{
 const byEmail=new Map(users.map(u=>[u.email,u]));
 const byId=new Map(users.map(u=>[u.id,u]));
 const passwords=new Map();
 const mappings=new Map();
 const sessionByToken=new Map();
 const actionLogs=[];
 function tokenFor(user){const token=`token-${user.id}-${sessionByToken.size}`;sessionByToken.set(token,user);return token;}
 function publicClient(){
  let currentUser=null;
  return {auth:{
   async verifyOtp({token_hash,type}){
    const email=token_hash.replace('reset:','');
    const user=byEmail.get(email);
    if(type!=='recovery'||!user)return {error:Error('bad token')};
    currentUser=user;
    return {data:{user,session:{access_token:tokenFor(user)}}};
   },
   async updateUser({password}){
    if(!currentUser)return {error:Error('no session')};
    passwords.set(currentUser.email,password);
    return {data:{user:currentUser}};
   },
   async signOut(){currentUser=null;return {error:null};},
   async signInWithPassword({email,password}){
    const user=byEmail.get(email);
    if(!user||!passwords.has(email)||passwords.get(email)!==password)
      return {error:Error('invalid password')};
    const session={access_token:tokenFor(user),refresh_token:'mock-refresh-'+user.id,expires_in:3600};
    return {data:{user,session}};
   },
  }};
 }
 const admin={
  auth:{
   admin:{
    async listUsers(){return {data:{users},error:null};},
    async generateLink({type,email}){
     const user=byEmail.get(email);
     if(!user)return {error:Error('no user')};
     return {data:{user,properties:{verification_type:type,hashed_token:'reset:'+email}}};
    },
    async getUserById(id){return {data:{user:byId.get(id)},error:null};},
   },
   async getUser(token){const user=sessionByToken.get(token);return {data:{user},error:user?null:Error('unknown')};},
  },
  async rpc(name,p={}){
   actionLogs.push(name);
   if(name==='schoolnet_student_sandbox_inventory'){
    const a=[...mappings.values()];
    return {data:[{identity_count:a.length,enabled_count:a.filter(x=>x.enabled).length}],error:null};
   }
   if(name==='schoolnet_student_sandbox_provision'){
    if(mappings.has(p.p_auth_user_id))return {data:false,error:Error('duplicate')};
    mappings.set(p.p_auth_user_id,{hash:p.p_code_hmac,phone:p.p_family_phone,enabled:false});
    return {data:true,error:null};
   }
   if(name==='schoolnet_student_sandbox_activate'){
    const row=mappings.get(p.p_auth_user_id);
    if(!row||row.hash!==p.p_code_hmac||row.phone!==p.p_family_phone)return {data:false,error:Error('mismatch')};
    row.enabled=true;return {data:true,error:null};
   }
   if(name==='schoolnet_student_login_gate'){
    const found=[...mappings.entries()].find(([id,row])=>row.enabled&&row.hash===p.p_code_hmac&&row.phone===p.p_phone_e164);
    return {data:[{rate_allowed:true,student_auth_user_id:found?.[0]??null}],error:null};
   }
   if(name==='schoolnet_student_login_enabled'){
    const row=mappings.get(p.p_student_auth_user_id);
    return {data:!!row?.enabled && row.phone===p.p_phone_e164 && row.hash===p.p_code_hmac,error:null};
   }
   if(name==='schoolnet_student_login_audit')return {data:null,error:null};
   throw Error('unexpected RPC '+name);
  },
 };
 const result=await runB2dScenario(admin,publicClient,env.SCHOOLNET_STUDENT_CODE_PEPPER);
 assert.equal(result.passed,true);
 assert.equal(result.identities_provisioned,2);
 assert.equal(result.two_composite_logins_passed,true);
 assert.equal(result.unknown_code_rejected,true);
 assert.equal(result.wrong_password_rejected,true);
 assert.equal(mappings.size,2);
 assert.equal(new Set([...mappings.values()].map(x=>x.hash)).size,2);
 assert.ok([...mappings.values()].every(x=>x.enabled));
 assert.ok(actionLogs.includes('schoolnet_student_login_gate'));
 assert.ok(actionLogs.includes('schoolnet_student_login_audit'));
});