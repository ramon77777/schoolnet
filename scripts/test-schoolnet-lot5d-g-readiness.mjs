// SCHOOLNET 5D-G - offline gateway/SQL security matrix, no network or DB.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createLot5dgOfflineAdminGateway} from "./lot5d/5dg_admin_gateway_reference.mjs";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
const actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessionId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const source="20252025-2025-4025-8025-202520252025";
const target="20262026-2026-4026-8026-202620262026";
const op="10000000-0000-4000-8000-0000000000a7";
const config={mode:"isolated_fixture",explicitlyEnabled:true,dbName:"schoolnet_lot5d_ci",
 dbHost:"127.0.0.1",sandboxOrigin:"https://test.schoolnet.invalid"};
const request={method:"POST",contentType:"application/json",origin:config.sandboxOrigin,
 authorization:"Bearer dummy-offline-token",body:{action:"finalize",sourceYearId:source,
 targetYearId:target,confirmation:"2026-2027",operationId:op}};
const adapters=(calls=[],overrides={})=>({
 config,
 verifyAuthToken:async(t)=>{calls.push("auth");return {userId:actor,sessionId,authoritativelyVerified:true};},
 verifyLiveSession:async(id,sid)=>{calls.push("session");return {active:true,revoked:false,userId:id,sessionId:sid};},
 lookupAdminProfile:async(id)=>{calls.push("profile");return {id,role:"admin"};},
 consumeRateLimit:async()=>{calls.push("limit");return {allowed:true};},
 loadPreflight:async(job)=>{calls.push("preflight");return {allowed:true,sourceYearId:job.sourceYearId,
   targetYearId:job.targetYearId,sourceCurrent:true,targetEnrollmentCount:0,
   historicalIntegrity:true,decisionsComplete:true};},
 runMockTransaction:async(job)=>{calls.push(["tx",job]);return {committed:true,
   auditPersisted:true,operationId:job.args.operationId??null};},
 ...overrides,
});
const send=(override={})=>({...request,...override});
test("G 01 - gateway off by default and no adapters called",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls,{config:{...config,explicitlyEnabled:false}}));
 assert.equal((await gw(request)).code,"disabled");assert.deepEqual(calls,[]);
});
test("G 02 - production host strictly denied",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls,{config:{...config,dbHost:"db.production.example"}}));
 assert.equal((await gw(request)).code,"not_isolated");assert.deepEqual(calls,[]);
});
test("G 03 - missing live-session adapter fails closed",async()=>{
 const gw=createLot5dgOfflineAdminGateway(adapters([],{verifyLiveSession:null}));
 assert.equal((await gw(request)).code,"missing_adapter");
});
test("G 04 - non-POST and foreign origin rejected before authentication",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls));
 assert.equal((await gw(send({method:"GET"}))).code,"request_format");
 assert.equal((await gw(send({origin:"https://schoolnet-snowy.vercel.app"}))).code,"untrusted_origin");
 assert.deepEqual(calls,[]);
});
test("G 05 - missing bearer cannot authenticate",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls));
 assert.equal((await gw(send({authorization:"Bearer "}))).code,"missing_bearer");
 assert.deepEqual(calls,[]);
});
test("G 06 - Auth unavailable or token unverified is denied",async()=>{
 const broken=createLot5dgOfflineAdminGateway(adapters([],{verifyAuthToken:async()=>{throw Error("no");}}));
 assert.equal((await broken(request)).code,"auth_unavailable");
 const unverified=createLot5dgOfflineAdminGateway(adapters([],{verifyAuthToken:async()=>({
  userId:actor,sessionId,authoritativelyVerified:false,
 })}));
 assert.equal((await unverified(request)).code,"unverified_session");
});
test("G 07 - revoked or mismatched real-time session blocked",async()=>{
 for(const x of [{active:false,revoked:true,userId:actor,sessionId},
  {active:true,revoked:false,userId:actor,sessionId:"wrong"},
  {active:true,revoked:false,userId:"wrong",sessionId}]){
  const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls,{verifyLiveSession:async()=>x}));
  assert.equal((await gw(request)).code,"session_inactive");
  assert.equal(calls.includes("profile"),false);
 }
});
test("G 08 - session API outage prevents all mutations",async()=>{
 const gw=createLot5dgOfflineAdminGateway(adapters([],{verifyLiveSession:async()=>{throw Error("offline");}}));
 assert.equal((await gw(request)).code,"session_unavailable");
});
test("G 09 - Admin is checked from profile, not request",async()=>{
 for(const role of ["school_admin","parent","teacher","student"]){
  const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls,{lookupAdminProfile:async()=>({id:actor,role})}));
  assert.equal((await gw(request)).code,"not_global_admin",role);
  assert.equal(calls.some(x=>Array.isArray(x)&&x[0]==="tx"),false);
 }
});
test("G 10 - role and actor client injection cannot authorize SQL",async()=>{
 for(const field of ["actorId","role","sqlFunction","isAdmin"]){
  const gw=createLot5dgOfflineAdminGateway(adapters([]));
  assert.equal((await gw(send({body:{...request.body,[field]:"admin"}}))).code,"payload");
 }
});
test("G 11 - rate limit is mandatory and fails closed",async()=>{
 const gw=createLot5dgOfflineAdminGateway(adapters([],{consumeRateLimit:async()=>({allowed:false})}));
 assert.equal((await gw(request)).code,"rate_limited");
 const failed=createLot5dgOfflineAdminGateway(adapters([],{consumeRateLimit:async()=>{throw Error("redis unavailable");}}));
 assert.equal((await failed(request)).code,"rate_limit_unavailable");
});
test("G 12 - occupied target blocks transaction regardless of client values",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls,{
  loadPreflight:async(job)=>({allowed:true,sourceYearId:job.sourceYearId,
   targetYearId:job.targetYearId,sourceCurrent:true,targetEnrollmentCount:1,
   historicalIntegrity:true,decisionsComplete:true}),
 }));
 assert.equal((await gw(request)).code,"preflight_blocked");
 assert.equal(calls.some(x=>Array.isArray(x)&&x[0]==="tx"),false);
});
test("G 13 - preflight failure or incomplete decisions denied",async()=>{
 const gw=createLot5dgOfflineAdminGateway(adapters([],{loadPreflight:async(job)=>({
  allowed:true,sourceYearId:job.sourceYearId,targetYearId:job.targetYearId,
  sourceCurrent:true,targetEnrollmentCount:0,historicalIntegrity:true,decisionsComplete:false,
 })}));
 assert.equal((await gw(request)).code,"preflight_blocked");
 const outage=createLot5dgOfflineAdminGateway(adapters([],{loadPreflight:async()=>{throw Error("sql network");}}));
 assert.equal((await outage(request)).code,"preflight_unavailable");
});
test("G 14 - valid finalization maps only server-owned private function",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls));
 assert.deepEqual(await gw(request),{ok:true,action:"finalize",confirmed:true});
 const job=calls.find(x=>Array.isArray(x)&&x[0]==="tx")[1];
 assert.equal(job.functionName,"schoolnet_private.finalize_lot5d_legacy_year");
 assert.equal(job.actorId,actor);
 assert.equal(job.sessionId,sessionId);
 assert.equal(job.args.operationId,op);
 assert.equal(job.args.actorId,undefined);
});
test("G 15 - decision remains bound to trusted actor",async()=>{
 const calls=[];const gw=createLot5dgOfflineAdminGateway(adapters(calls));
 const r=await gw(send({body:{action:"decision",sourceYearId:source,targetYearId:target,
  studentId:"11111111-1111-4111-8111-111111111111",
  decision:"leave",targetClassId:null,note:"fictional"}}));
 assert.equal(r.ok,true);
 const job=calls.find(x=>Array.isArray(x)&&x[0]==="tx")[1];
 assert.equal(job.functionName,"schoolnet_private.save_lot5d_legacy_decision");
 assert.equal(job.actorId,actor);
 assert.equal(job.args.decision,"leave");
 assert.equal(job.args.targetClassId,null);
});
test("G 16 - transaction must confirm commit AND audit; no error leaks",async()=>{
 for(const response of [{committed:false,auditPersisted:true,operationId:op},
  {committed:true,auditPersisted:false,operationId:op},
  {committed:true,auditPersisted:true,operationId:"mismatch"}]){
  const gw=createLot5dgOfflineAdminGateway(adapters([],{runMockTransaction:async()=>response}));
  assert.equal((await gw(request)).code,"transaction_unconfirmed");
 }
 const gw=createLot5dgOfflineAdminGateway(adapters([],{runMockTransaction:async()=>{throw Error("private row secret");}}));
 assert.deepEqual(await gw(request),{ok:false,code:"transaction_failed"});
});
test("G 17 - year direct-write guard and archive documents SANDBOX_ONLY",async()=>{
 const guard=await read("../supabase/proposals/20261118_schoolnet_lot5dg_archive_documents_SANDBOX_ONLY.sql");
 const source=await read("../supabase/proposals/20261118_schoolnet_lot5d_ab_consolidated_SANDBOX_ONLY.sql");
 assert.match(guard,/SANDBOX_ONLY/);
 assert.match(guard,/LOCK TABLE public\.school_years IN SHARE MODE/);
 assert.match(guard,/trg_lot5dg_freeze_archived_enrollment_document/);
 assert.match(guard,/REVOKE ALL ON FUNCTION/);
 assert.match(source,/trg_lot5d_year_switch_guard/);
 assert.match(source,/trg_lot5d_year_insert_guard/);
 assert.match(source,/trg_lot5d_year_delete_guard/);
});
test("G 18 - audit uses SELECT-only catalog and no personal rows",async()=>{
 const sql=await read("../supabase/verification/20261118_schoolnet_lot5dg_catalog_SELECT_ONLY.sql");
 assert.match(sql,/SELECT ONLY/);
 for(const word of ["pg_catalog.pg_policies","pg_catalog.pg_trigger","pg_catalog.has_table_privilege"])
  assert.ok(sql.includes(word),word);
 assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+(?:INTO|TABLE|FUNCTION|POLICY|TRIGGER|ROLE)\b/i);
});
test("G 19 - fixture audited permissions, RLS and docs after rollover",async()=>{
 const sql=await read("./lot5d/5dg_schema_parity_fixture_postgresql17.sql");
 const pre=await read("./lot5d/5dg_direct_paths_pre_postgresql17.sql");
 const post=await read("./lot5d/5dg_direct_paths_post_postgresql17.sql");
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE POLICY fixture_admin_school_years/);
 assert.match(pre,/G-PRE 06/);
 assert.match(post,/G-POST 08/);
 assert.match(pre,/^ROLLBACK;/m);
 assert.match(post,/^ROLLBACK;/m);
});
test("G 20 - no real endpoint/deployment and Vite write flag still off",async()=>{
 const path=await read("./lot5d/5dg_admin_gateway_reference.mjs");
 const policy=await read("../src/features/enrollments/lib/schoolYearRolloverWritePolicy.ts");
 const wf=await read("../.github/workflows/schoolnet-quality.yml");
 assert.match(path,/NO HTTP endpoint/);
 assert.match(path,/NO SQL driver/);
 assert.doesNotMatch(path,/\bDeno\.serve\(|\bfetch\(|\bcreateClient\(/);
 assert.match(policy,/VITE_SCHOOLNET_LOT5D_WRITES_ENABLED/);
 assert.match(wf,/lot5d_direct_paths:/);
 assert.doesNotMatch(wf,/supabase db push|vercel --prod/);
});
