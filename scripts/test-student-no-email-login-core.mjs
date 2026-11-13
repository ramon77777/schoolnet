import test from 'node:test';
import assert from 'node:assert/strict';
import {runSchoolnetNoEmailLogin,keyedLoginDigest} from '../supabase/functions/_shared/studentNoEmailLoginCore.ts';
const domain='identites.ecole.example.org';
const account='sn-8c3e7e58df4942498b908a57868cf3a4@'+domain;
const id='e270362f-18a2-4f6e-a8b9-57ded300e3bb';
const data={phone:'07 12 34 56 78',studentCode:'SN-ABCD-EFGH-JKMN',password:'Correct-Password-2026!'};
const secret='TEST-SECRET-ONLY-NO-PRODUCTION-KEY-00012345';
const ip='192.0.2.8';
function createDeps(opts={}){
 const calls=[];let enabled=opts.previouslyEnabled===true;
 const dep={
  async gate(p){calls.push('gate');assert.match(p.codeHmac,/^[a-f0-9]{64}$/);return opts.gate??{allowed:true,id};},
  async getUser(){calls.push('getUser');return opts.user??{email:account,isSchoolnetNoEmail:true};},
  async signIn(alias){calls.push('signIn');if(opts.badPassword)return null;
   assert.ok(alias===account || alias.includes('no-such-account'));
   return {id:opts.sessionUserId??id,accessToken:'TEST-ACCESS',refreshToken:'TEST-REFRESH',expiresIn:3600};},
  async verifyAccess(){calls.push('verifyAccess');return opts.badToken?null:id;},
  async activateAfterPassword(){calls.push('activate');if(opts.activationError)throw Error('private');if(opts.mayActivate===false)return false;enabled=true;return true;},
  async isEnabled(){calls.push('enabled');return enabled;},
  async audit(x){calls.push('audit:'+x);if(opts.auditError)throw Error('audit');},
 };return {dep,calls};
}
test('nouvel apprenant: valide Auth, active apres preuve et remet deux jetons',async()=>{
 const {dep,calls}=createDeps();const r=await runSchoolnetNoEmailLogin(data,ip,secret,domain,dep);
 assert.equal(r.status,200);assert.equal(r.body.access_token,'TEST-ACCESS');
 assert.ok(calls.indexOf('verifyAccess')<calls.indexOf('activate'));
 assert.ok(calls.includes('audit:authenticated'));
});
test('compte deja active : seconde connexion permise, sans reactivation',async()=>{
 const {dep}=createDeps({previouslyEnabled:true,mayActivate:false});
 assert.equal((await runSchoolnetNoEmailLogin(data,ip,secret,domain,dep)).status,200);
});
test('code inconnu: pas de revelation de l email technique',async()=>{
 const {dep}=createDeps({gate:{allowed:true,id:null},badPassword:true});
 const r=await runSchoolnetNoEmailLogin(data,ip,secret,domain,dep);
 assert.equal(r.status,401);assert.ok(!JSON.stringify(r.body).includes(account));
});
test('mauvais password ou autre session: refus',async()=>{
 for(const opts of [{badPassword:true},{sessionUserId:'somebody-else'},{badToken:true}]){
  const {dep}=createDeps(opts);
  const r=await runSchoolnetNoEmailLogin(data,ip,secret,domain,dep);
  assert.equal(r.status,401);assert.equal(r.body.access_token,undefined);
 }
});
test('en attente de remise, email non technique ou marqueur absent: refus',async()=>{
 for(const opts of [{mayActivate:false},{user:{email:'parent@example.org',isSchoolnetNoEmail:true}},
  {user:{email:account,isSchoolnetNoEmail:false}}]){
  const {dep}=createDeps(opts);const r=await runSchoolnetNoEmailLogin(data,ip,secret,domain,dep);
  assert.equal(r.status,401);assert.equal(r.body.refresh_token,undefined);
 }
});
test('limite SQL: refuse avant Auth',async()=>{
 const {dep,calls}=createDeps({gate:{allowed:false,id:null}});
 assert.equal((await runSchoolnetNoEmailLogin(data,ip,secret,domain,dep)).status,429);
 assert.ok(!calls.includes('signIn'));
});
test('secret manquant, format invalide et audit indisponible: pas de session',async()=>{
 for(const [badData,badSecret,opts] of [[{...data,studentCode:'INVALID'},secret,{}],
   [data,'short',{}],[data,secret,{auditError:true}],[data,secret,{activationError:true}]]){
  const {dep}=createDeps(opts);
  const r=await runSchoolnetNoEmailLogin(badData,ip,badSecret,domain,dep);
  assert.ok([401,503].includes(r.status));assert.equal(r.body.access_token,undefined);
 }
});
test('HMAC cryptographique varie selon domaine, telephone et IP',async()=>{
 const phone=await keyedLoginDigest('phone','+2250712345678',secret);
 const repeated=await keyedLoginDigest('phone','+2250712345678',secret);
 const different=await keyedLoginDigest('ip','+2250712345678',secret);
 assert.equal(phone,repeated);assert.notEqual(phone,different);
});