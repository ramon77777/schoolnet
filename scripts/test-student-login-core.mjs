// SCHOOLNET 5.C-B.2 2.D - offline sandbox login core tests, no real secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { privateBucketHmac, runSandboxStudentLogin } from '../supabase/functions/_shared/studentLoginCore.ts';

const pepper = 'sandbox-only-test-pepper-with-at-least-32-bytes-123';
const body = {phone:'07 12 34 56 78',studentCode:'SN-ABCD-EFGH-JKMN',password:'FictitiousSecret42!'};
const ip='192.0.2.14';
const userId='a1111111-1111-4111-8111-111111111111';
const alias='schoolnet-b2b-student-01@schoolnet.invalid';
function makeDeps(options={}) {
 const calls={gate:[],getAuthUser:[],signIn:[],verifyAccess:[],isEnabled:[],audit:[]};
 const deps={
  async gate(p) { calls.gate.push(p); if(options.gateError) throw Error('DB secret error'); return options.gate??{rateAllowed:true,userId}; },
  async getAuthUser(id) { calls.getAuthUser.push(id); return options.user??{email:alias,sandboxStudent:true}; },
  async signIn(email,password) {
   calls.signIn.push({email,password});
   if(options.passwordWrong) return null;
   return options.session??{userId,accessToken:'test-access-token',refreshToken:'test-refresh-token',expiresIn:3600};
  },
  async verifyAccess(token) { calls.verifyAccess.push(token); return options.verifiedUser===undefined?userId:options.verifiedUser; },
  async isEnabled(id,phone,codeHmac) { calls.isEnabled.push({id,phone,codeHmac}); return options.enabled!==false; },
  async audit(outcome) { calls.audit.push(outcome); if(options.auditError) throw Error('audit private'); },
 };
 return {deps,calls};
}

test('Succes serveur : telephone normalise, session verifiee, aucun alias en sortie',async()=>{
 const {deps,calls}=makeDeps();
 const result=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(result.status,200);
 assert.equal(result.body.ok,true);
 assert.equal(result.body.access_token,'test-access-token');
 assert.equal(JSON.stringify(result).includes(alias),false);
 assert.equal(calls.gate[0].phone,'+2250712345678');
 for(const k of ['codeHmac','phoneHmac','ipHmac']) assert.match(calls.gate[0][k],/^[0-9a-f]{64}$/);
 assert.notEqual(calls.gate[0].codeHmac,calls.gate[0].phoneHmac);
 assert.notEqual(calls.gate[0].phoneHmac,calls.gate[0].ipHmac);
 assert.deepEqual(calls.audit,['authenticated']);
 assert.equal(calls.isEnabled.length,1);
 assert.equal(calls.signIn[0].email,alias);
});

test('Code inexistant : appel Auth factice, erreur generique',async()=>{
 const {deps,calls}=makeDeps({gate:{rateAllowed:true,userId:null},passwordWrong:true});
 const r=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(r.status,401);
 assert.match(calls.signIn[0].email,/nonexistent-b2d/);
 assert.equal(JSON.stringify(r).includes(alias),false);
 assert.deepEqual(calls.audit,['denied']);
});

test('Mot de passe incorrect : identite inconnue du navigateur',async()=>{
 const {deps,calls}=makeDeps({passwordWrong:true});
 const r=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(r.status,401);
 assert.equal(r.body.access_token,undefined);
 assert.deepEqual(calls.audit,['denied']);
});

test('Limite atteinte : aucun appel Auth',async()=>{
 const {deps,calls}=makeDeps({gate:{rateAllowed:false,userId:null}});
 const r=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(r.status,429);
 assert.equal(calls.getAuthUser.length,0);
 assert.equal(calls.signIn.length,0);
 assert.deepEqual(calls.audit,['rate_limited']);
});

test('Controle de role et alias strict dans app_metadata serveur',async()=>{
 for(const user of [{email:alias,sandboxStudent:false},{email:'parent@example.test',sandboxStudent:true},{email:null,sandboxStudent:true}]) {
  const {deps,calls}=makeDeps({user,passwordWrong:true});
  const r=await runSandboxStudentLogin(body,ip,pepper,deps);
  assert.equal(r.status,401);
  assert.match(calls.signIn[0].email,/nonexistent-b2d/);
 }
});

test('Rejet de session Auth appartenant a un autre utilisateur',async()=>{
 const {deps,calls}=makeDeps({session:{userId:'b2222222-2222-4222-8222-222222222222',accessToken:'x',refreshToken:'y',expiresIn:3600}});
 const r=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(r.status,401);
 assert.equal(calls.isEnabled.length,0);
});

test('Double verification apres Auth : jeton invalide ou statut suspendu',async()=>{
 for(const options of [{verifiedUser:null},{enabled:false}]){
  const {deps,calls}=makeDeps(options);
  const r=await runSandboxStudentLogin(body,ip,pepper,deps);
  assert.equal(r.status,401);
  assert.equal(r.body.access_token,undefined);
  assert.deepEqual(calls.audit,['denied']);
 }
});

test('Audit indisponible : blocage de la session, pas de fuite',async()=>{
 const {deps,calls}=makeDeps({auditError:true});
 const r=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(r.status,503);
 assert.equal(r.body.access_token,undefined);
 assert.ok(calls.audit.includes('authenticated'));
 assert.ok(calls.audit.includes('server_error'));
});

test('Echec PostgREST : message neutre et journal sans identifiants',async()=>{
 const {deps,calls}=makeDeps({gateError:true});
 const r=await runSandboxStudentLogin(body,ip,pepper,deps);
 assert.equal(r.status,503);
 assert.equal(JSON.stringify(r).includes('DB secret error'),false);
 assert.deepEqual(calls.audit,['server_error']);
});

test('Entrees rejetees : longueur, types, format, secret faible',async()=>{
 const shapes=[null,[],{...body,password:4},{...body,password:''},{...body,password:'x'.repeat(257)},
  {...body,phone:'not-phone'},{...body,studentCode:'SN-INVALID'},{...body,extra:'x'}];
 for(const shape of shapes){
  const {deps,calls}=makeDeps();
  const r=await runSandboxStudentLogin(shape,ip,pepper,deps);
  assert.ok([400,401,503].includes(r.status));
  assert.equal(calls.gate.length,0);
  assert.equal(calls.signIn.length,0);
 }
 const {deps,calls}=makeDeps();
 const x=await runSandboxStudentLogin(body,ip,'short',deps);
 assert.equal(x.status,503);
 assert.equal(calls.gate.length,0);
});

test('Cle de HMAC par domaine et IP distinct',async()=>{
 const a=await privateBucketHmac('phone','+2250712345678',pepper);
 const b=await privateBucketHmac('phone','+2250712345678',pepper);
 const c=await privateBucketHmac('ip','+2250712345678',pepper);
 assert.equal(a,b);
 assert.notEqual(a,c);
 assert.match(a,/^[0-9a-f]{64}$/);
});
