// SCHOOLNET 5D-J — LOCAL-ONLY Auth/session/Storage HTTP fixture tests.
// Real loopback HTTP, fake credentials and fake byte blobs only.
// No Supabase or Vercel connection, no physical delete in code under test.
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import {createHash} from "node:crypto";
import {
  makeIsolatedParentGateway,makeLoopbackAuthTransport,
} from "./lot5d/5dj_parent_http_security_reference.mjs";
import {
  rehearseVerifiedRetention,classifyDocumentReconciliation,
} from "./lot5d/5dj_retention_recovery_reference.mjs";
import {readVerifiedParentAnnualClasses} from
  "../supabase/functions/_shared/lot5diParentAnnualRead.ts";

const file=(p)=>readFile(new URL(p,import.meta.url),"utf8");
const actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const session="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const child="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const config={mode:"loopback-fixture",enabled:true,
  allowedOrigin:"https://schoolnet-test.invalid",baseUrl:"http://127.0.0.1:54321/"};
const request={origin:config.allowedOrigin,method:"POST",contentType:"application/json",
 authorization:"Bearer fixture-parent",body:{action:"list_current_classes"}};
const result={schoolYearId:"2026-2027",
 children:[{studentId:child,state:"current",className:"5e B"}]};
const calls=[];
function deps(overrides={}) {
 return {
  getAuthIdentity:async()=>{calls.push("auth");return {verified:true,userId:actor,sessionId:session};},
  getLiveSession:async()=>{calls.push("session");
    return {present:true,active:true,revoked:false,userId:actor,sessionId:session,notAfterMs:null};},
  getRateLimit:async()=>{calls.push("limit");return {allowed:true};},
  getConfirmedRole:async()=>{calls.push("role");return "parent";},
  readAuthorizedAnnualClasses:async()=>{calls.push("data");return result;},
  ...overrides,
 };
}
const gate=(override={},extraConfig={})=>
  makeIsolatedParentGateway({...config,...extraConfig},deps(override));
function req(extra={}) {return {...request,...extra};}
function reset(){calls.length=0;}

function retentionFixture(overrides={}) {
 const fileBytes=Buffer.from("SCHOOLNET fictional PDF bytes - no personal data","utf8");
 const original="source/doc-123.pdf";
 const stored=new Map([[original,fileBytes]]);
 const journal=[];
 const counters={reads:0,writes:0,attests:0,deletes:0};
 const doc={id:"doc-123",yearCurrent:true,enrollmentStatus:"active",
   yearClosurePending:false,storagePath:original,sizeBytes:fileBytes.length};
 const adapter={
  readDocument:async()=>({...doc}),
  readOriginal:async(path)=>{counters.reads++;return stored.get(path);},
  writeBackup:async(path,bytes)=>{counters.writes++;stored.set(path,Buffer.from(bytes));},
  readBackup:async(path)=>stored.get(path),
  attestBackup:async(a)=>{counters.attests++;journal.push({...a});
    return {persisted:true,operationId:a.operationId};},
  ...overrides,
 };
 const input={mode:"isolated-fixture",enabled:true,operationId:"op-123",
  documentId:doc.id,actorVerified:true,role:"admin"};
 return {fileBytes,stored,journal,counters,doc,adapter,input};
}
const sha256=(x)=>createHash("sha256").update(x).digest("hex");

test("J 01 - default-off parent fixture has no adapter effects",async()=>{
 reset();const g=gate({},{enabled:false});
 assert.equal((await g(request)).status,503);assert.deepEqual(calls,[]);
});
test("J 02 - any cloud or non-loopback URL is refused",async()=>{
 for(const baseUrl of ["https://anttmbhaphkhmkoqsofd.supabase.co/",
  "http://example.com:54321/","http://localhost:54321/",
  "http://127.0.0.1:54321/other","file:///tmp/mock"]){
  reset();assert.equal((await gate({},{baseUrl})(request)).status,503);
  assert.deepEqual(calls,[]);
 }
});
test("J 03 - wrong preview or production origin is rejected",async()=>{
 reset();assert.equal((await gate()(req({origin:"https://schoolnet-snowy.vercel.app"}))).status,403);
 assert.deepEqual(calls,[]);
});
test("J 04 - only JSON POST is accepted",async()=>{
 reset();assert.equal((await gate()(req({method:"GET"}))).status,405);
 assert.equal((await gate()(req({contentType:"text/plain"}))).status,405);
 assert.deepEqual(calls,[]);
});
test("J 05 - browser-supplied parent id, role or extra action is refused",async()=>{
 for(const k of ["parent_id","student_id","role","sql","actorId"]){
  reset();const r=await gate()(req({body:{action:"list_current_classes",[k]:actor}}));
  assert.equal(r.status,400);assert.deepEqual(calls,[]);
 }
});
test("J 06 - missing Bearer cannot call Auth",async()=>{
 reset();assert.equal((await gate()(req({authorization:""}))).status,401);
 assert.deepEqual(calls,[]);
});
test("J 07 - Auth outage fails closed",async()=>{
 reset();const g=gate({getAuthIdentity:async()=>{throw Error("provider down");}});
 assert.equal((await g(request)).status,401);
});
test("J 08 - unverified JWT fails despite an admin role in token metadata",async()=>{
 reset();const g=gate({getAuthIdentity:async()=>({
  verified:false,userId:actor,sessionId:session,user_metadata:{role:"parent"}
 })});
 assert.equal((await g(request)).status,401);assert.deepEqual(calls,[]);
});
test("J 09 - missing validated session id blocks access",async()=>{
 const g=gate({getAuthIdentity:async()=>({verified:true,userId:actor,sessionId:null})});
 assert.equal((await g(request)).status,401);
});
test("J 10 - revoked session blocks access despite verified JWT",async()=>{
 reset();const g=gate({getLiveSession:async()=>({
  present:true,active:true,revoked:true,userId:actor,sessionId:session
 })});
 assert.equal((await g(request)).status,401);assert.equal(calls.includes("data"),false);
});
test("J 11 - deleted session blocks access",async()=>{
 const g=gate({getLiveSession:async()=>({
  present:false,active:false,userId:actor,sessionId:session
 })});assert.equal((await g(request)).status,401);
});
test("J 12 - session belonging to another user blocks access",async()=>{
 const g=gate({getLiveSession:async()=>({
  present:true,active:true,userId:other,sessionId:session
 })});assert.equal((await g(request)).status,401);
});
test("J 13 - expired not_after blocks access",async()=>{
 const g=gate({getLiveSession:async()=>({
  present:true,active:true,userId:actor,sessionId:session,
  notAfterMs:Date.now()-1000
 })});assert.equal((await g(request)).status,401);
});
test("J 14 - session-check outage refuses the request",async()=>{
 const g=gate({getLiveSession:async()=>{throw Error("auth sessions down");}});
 assert.equal((await g(request)).status,503);
});
test("J 15 - persistent rate limit denial is enforced",async()=>{
 const g=gate({getRateLimit:async()=>({allowed:false})});
 assert.equal((await g(request)).status,429);
});
test("J 16 - rate limit store outage is fail-closed",async()=>{
 const g=gate({getRateLimit:async()=>{throw Error("rate store down");}});
 assert.equal((await g(request)).status,503);
});
test("J 17 - school_admin, admin, student and teacher cannot use Parent read",async()=>{
 for(const role of ["school_admin","admin","student","teacher",null]){
  reset();const g=gate({getConfirmedRole:async()=>role});
  assert.equal((await g(request)).status,403);
  assert.equal(calls.includes("data"),false);
 }
});
test("J 18 - live role lookup failure never exposes children",async()=>{
 const g=gate({getConfirmedRole:async()=>{throw Error("private profile");}});
 assert.equal((await g(request)).status,503);
});
test("J 19 - authorized Parent receives only minimal annual fields",async()=>{
 reset();const r=await gate()(request);
 assert.equal(r.status,200);
 assert.deepEqual(r.body,{ok:true,school_year_id:"2026-2027",
  children:[{student_id:child,state:"current",class_name:"5e B"}]});
 assert.deepEqual(calls,["auth","session","limit","role","data"]);
});
test("J 20 - faulty backend extra private fields never reach client",async()=>{
 const privateRow={...result.children[0],privateEmail:"never@example.invalid",
  notes:"private",parentPhone:"000"};
 const g=gate({readAuthorizedAnnualClasses:async()=>({
  schoolYearId:"2026-2027",children:[privateRow]
 })});
 const r=await g(request);
 assert.equal(r.status,200);
 assert.equal(JSON.stringify(r.body).includes("private"),false);
});
test("J 21 - backend data error never leaks SQL text",async()=>{
 const g=gate({readAuthorizedAnnualClasses:async()=>{throw Error("PG row: private family");}});
 const r=await g(request);
 assert.deepEqual(r,{status:503,body:{ok:false,message:"Lecture indisponible."}});
});
test("J 22 - malformed annual results fail closed",async()=>{
 const g=gate({readAuthorizedAnnualClasses:async()=>({
  schoolYearId:"2026-2027",children:[{studentId:other,state:"injected",className:"secret"}]
 })});
 assert.equal((await g(request)).status,503);
});
test("J 23 - Parent annual core rejects cross-family rows from faulty reader",async()=>{
 const d=await readVerifiedParentAnnualClasses({
  parentId:actor,
  getConfirmedRole:async()=> "parent",
  getVerifiedLinks:async()=>[{student_id:child}],
  getCurrentYears:async()=>[{id:"2026-2027"}],
  getAnnualEnrollments:async()=>[
    {student_id:child,school_year_id:"2026-2027",class_id:"classA",status:"active"},
    {student_id:other,school_year_id:"2026-2027",class_id:"classX",status:"active"}],
  getYearClasses:async()=>[
    {id:"classA",name:"5e B",school_year_id:"2026-2027"},
    {id:"classX",name:"PRIVATE",school_year_id:"2026-2027"}],
 });
 assert.deepEqual(d.children.map(x=>x.studentId),[child]);
 assert.equal(JSON.stringify(d).includes("PRIVATE"),false);
});
test("J 24 - verified retention copies, reads back, hashes and attests without deleting",async()=>{
 const f=retentionFixture();
 const r=await rehearseVerifiedRetention(f.input,f.adapter);
 assert.equal(r.status,"backup_attested");assert.equal(r.delete_allowed,false);
 assert.equal(r.sha256,sha256(f.fileBytes));
 assert.equal(f.journal[0].sha256,r.sha256);
 assert.equal(f.counters.attests,1);assert.equal(f.counters.deletes,0);
 assert.equal(f.stored.has(f.doc.storagePath),true);
});
test("J 25 - non-Admin or unverified actor cannot read any document",async()=>{
 const f=retentionFixture();
 for(const input of [{role:"parent"},{actorVerified:false},{mode:"production"}]){
  assert.equal((await rehearseVerifiedRetention({...f.input,...input},f.adapter)).status,"denied");
 }
 assert.equal(f.counters.reads,0);assert.equal(f.counters.writes,0);
});
test("J 26 - closed year or pending year change forbids retention action",async()=>{
 const f=retentionFixture();
 const p=retentionFixture({readDocument:async()=>({...f.doc,yearCurrent:false})});
 assert.equal((await rehearseVerifiedRetention(p.input,p.adapter)).status,"document_blocked");
 const q=retentionFixture({readDocument:async()=>({...f.doc,yearClosurePending:true})});
 assert.equal((await rehearseVerifiedRetention(q.input,q.adapter)).status,"document_blocked");
});
test("J 27 - incomplete original bytes cannot be certified",async()=>{
 const f=retentionFixture({readOriginal:async()=>Buffer.from("bad")});
 assert.equal((await rehearseVerifiedRetention(f.input,f.adapter)).status,"source_mismatch");
 assert.equal(f.counters.attests,0);
});
test("J 28 - altered backup digest never obtains attestation",async()=>{
 const f=retentionFixture({readBackup:async()=>Buffer.alloc(42)});
 assert.equal((await rehearseVerifiedRetention(f.input,f.adapter)).status,"backup_mismatch");
 assert.equal(f.counters.attests,0);
});
test("J 29 - timeout after stored backup can be recovered by verified readback",async()=>{
 const f=retentionFixture({writeBackup:async(path,bytes)=>{
  f.stored.set(path,Buffer.from(bytes));throw Error("http timeout after commit");
 }});
 const r=await rehearseVerifiedRetention(f.input,f.adapter);
 assert.equal(r.status,"backup_attested");
 assert.equal(f.counters.deletes,0);
});
test("J 30 - timeout before backup write means no certification and no delete",async()=>{
 const f=retentionFixture({writeBackup:async()=>{throw Error("timeout before write");}});
 assert.equal((await rehearseVerifiedRetention(f.input,f.adapter)).status,"backup_mismatch");
 assert.equal(f.counters.attests,0);assert.equal(f.counters.deletes,0);
});
test("J 31 - audit unconfirmed cannot enable physical removal",async()=>{
 const f=retentionFixture({attestBackup:async()=>{throw Error("db down");}});
 const r=await rehearseVerifiedRetention(f.input,f.adapter);
 assert.equal(r.status,"audit_unconfirmed");assert.equal(r.delete_allowed,false);
 assert.equal(f.stored.has(f.doc.storagePath),true);
});
test("J 32 - unknown metadata original missing is a restore review, not auto-repair",()=>{
 const r=classifyDocumentReconciliation({mode:"isolated-fixture",
  documentVerified:true,metadataPresent:true,originalPresent:false,
  verifiedBackupPresent:true});
 assert.deepEqual(r,{ok:true,status:"restore_requires_review",delete_allowed:false});
});
test("J 33 - orphan Storage object is retained for review",()=>{
 const r=classifyDocumentReconciliation({mode:"isolated-fixture",
  documentVerified:true,metadataPresent:false,originalPresent:true,
  verifiedBackupPresent:false});
 assert.equal(r.status,"orphan_requires_review");assert.equal(r.delete_allowed,false);
});
test("J 34 - lost original and backup require urgent investigation",()=>{
 const r=classifyDocumentReconciliation({mode:"isolated-fixture",
  documentVerified:true,metadataPresent:true,originalPresent:false,
  verifiedBackupPresent:false});
 assert.equal(r.status,"urgent_missing_source");assert.equal(r.delete_allowed,false);
});
test("J 35 - Parent Edge remains disabled and I SQL never deployed",async()=>{
 const edge=await file("../supabase/functions/schoolnet-parent-current-class/index.ts");
 const policy=await file("../src/features/enrollments/lib/enrollmentDocumentSafety.ts");
 assert.match(edge,/SCHOOLNET_LOT5DI_PARENT_READ_ENABLED/);
 assert.match(policy,/ENROLLMENT_DOCUMENT_BROWSER_DELETE_BLOCKED = true/);
 assert.doesNotMatch(edge,/\.from\("student_enrollments"\)\s*\.delete\(/);
});
test("J 36 - private session contract is isolated from real provider",async()=>{
 const core=await file("./lot5d/5dj_parent_http_security_reference.mjs");
 assert.match(core,/hostname==="127\.0\.0\.1"/);
 assert.match(core,/allowedOrigin!=="https:\/\/schoolnet-test\.invalid"/);
 assert.doesNotMatch(core,/createClient\(|SUPABASE_SERVICE_ROLE_KEY|Deno\.serve/);
});
test("J 37 - repository CI uses no Supabase write or deploy",async()=>{
 const wf=await file("../.github/workflows/schoolnet-quality.yml");
 assert.match(wf,/npm run qa:lot5d:j/);
 assert.match(wf,/lot5d_http_isolation:/);
 assert.doesNotMatch(wf,/supabase db push|supabase functions deploy|vercel --prod/i);
});

// HTTP fixtures: a real loopback socket, but no Supabase/Storage internet.
async function startLoopbackFixture(options={}) {
 const state={role:"parent",rateAllowed:true,sessionActive:true,revoked:false,
  authAvailable:true,notAfterMs:null,storage:new Map(),deleteAttempts:0,
  uploads:0,backupFault:"none",...options};
 const server=createServer(async(req,res)=>{
  const u=new URL(req.url,"http://127.0.0.1");
  const json=(code,data)=>{res.writeHead(code,{"content-type":"application/json"});
    res.end(JSON.stringify(data));};
  if(req.method==="GET"&&u.pathname==="/auth/v1/user"){
    if(!state.authAvailable) return json(503,{error:"auth down"});
    if(req.headers.authorization!=="Bearer fixture-parent")return json(401,{error:"bad token"});
    return json(200,{verified:true,userId:actor,sessionId:session});
  }
  if(req.method==="GET"&&u.pathname==="/_fixture/session")
    return json(200,{present:state.sessionActive,active:state.sessionActive,
      revoked:state.revoked,userId:actor,sessionId:session,
      notAfterMs:state.notAfterMs});
  if(req.method==="GET"&&u.pathname==="/_fixture/rate")
    return json(200,{allowed:state.rateAllowed});
  if(req.method==="GET"&&u.pathname==="/_fixture/profile")
    return json(200,{role:state.role});
  if(u.pathname.startsWith("/storage/v1/object/")){
    const key=decodeURIComponent(u.pathname.slice("/storage/v1/object/".length));
    if(req.method==="GET"){
      const bytes=state.storage.get(key);
      if(!bytes){res.writeHead(404);return res.end();}
      res.writeHead(200,{"content-type":"application/octet-stream"});
      return res.end(bytes);
    }
    if(req.method==="PUT"){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      state.uploads++;
      if(state.backupFault==="before"){res.writeHead(503);return res.end();}
      state.storage.set(key,Buffer.concat(chunks));
      if(state.backupFault==="after"){res.writeHead(503);return res.end();}
      res.writeHead(200);return res.end();
    }
    if(req.method==="DELETE"){
      state.deleteAttempts++;
      res.writeHead(403);return res.end();
    }
  }
  return json(404,{error:"fixture route missing"});
 });
 await new Promise((resolve,reject)=>{
  server.once("error",reject);server.listen(0,"127.0.0.1",resolve);
 });
 const baseUrl="http://127.0.0.1:"+server.address().port+"/";
 return {state,baseUrl,close:()=>new Promise(resolve=>server.close(resolve))};
}
function gateFromHttp(f) {
 const tx=makeLoopbackAuthTransport(f.baseUrl);
 return makeIsolatedParentGateway({...config,baseUrl:f.baseUrl},{
  ...tx,readAuthorizedAnnualClasses:async()=>result,
 });
}
async function getStorageBuffer(base,key) {
 const r=await fetch(base+"storage/v1/object/"+encodeURIComponent(key));
 if(!r.ok)throw Error("not available");
 return Buffer.from(await r.arrayBuffer());
}
test("J 38 - REAL loopback HTTP verifies Auth and live session before reading",async()=>{
 const fx=await startLoopbackFixture();
 try {
  const g=gateFromHttp(fx);
  const r=await g(request);
  assert.equal(r.status,200);assert.equal(r.body.children[0].student_id,child);
  fx.state.revoked=true;
  assert.equal((await g(request)).status,401);
 } finally {await fx.close();}
});
test("J 39 - REAL loopback HTTP enforces rate limit and role changes",async()=>{
 const fx=await startLoopbackFixture();
 try {
  const g=gateFromHttp(fx);
  fx.state.rateAllowed=false;
  assert.equal((await g(request)).status,429);
  fx.state.rateAllowed=true;fx.state.role="teacher";
  assert.equal((await g(request)).status,403);
 } finally {await fx.close();}
});
test("J 40 - REAL local binary Storage HTTP backup survives uncertain PUT",async()=>{
 const fx=await startLoopbackFixture({backupFault:"after"});
 try {
  const f=retentionFixture();
  fx.state.storage.set(f.doc.storagePath,f.fileBytes);
  const a={
   ...f.adapter,
   readOriginal:(path)=>getStorageBuffer(fx.baseUrl,path),
   writeBackup:async(path,bytes)=>{
    const r=await fetch(fx.baseUrl+"storage/v1/object/"+encodeURIComponent(path),
      {method:"PUT",body:bytes});
    if(!r.ok)throw Error("HTTP status "+r.status);
   },
   readBackup:(path)=>getStorageBuffer(fx.baseUrl,path),
  };
  const r=await rehearseVerifiedRetention(f.input,a);
  assert.equal(r.status,"backup_attested");
  assert.equal(fx.state.storage.has(f.doc.storagePath),true);
  assert.equal(fx.state.deleteAttempts,0);assert.equal(fx.state.uploads,1);
 } finally {await fx.close();}
});
