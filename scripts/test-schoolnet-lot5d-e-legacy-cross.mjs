// SCHOOLNET 5D-E: offline contract, archive & SQL safety checks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createLot5dSandboxGateway } from "./lot5d/admin_gateway_dryrun.mjs";

const actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const student="11111111-1111-4111-8111-111111111111";
const session="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const source="20252025-2025-4025-8025-202520252025";
const target="20262026-2026-4026-8026-202620262026";
const classroom="c0260000-0000-4000-8000-000000000026";
const operation="10000000-0000-4000-8000-0000000000e1";
const config=Object.freeze({
 mode:"isolated_fixture", explicitlyEnabled:true,dbName:"schoolnet_lot5d_ci",
 dbHost:"127.0.0.1",sandboxOrigin:"https://schoolnet-sandbox.invalid"
});
const request=Object.freeze({
 method:"POST", contentType:"application/json",origin:config.sandboxOrigin,
 authorization:"Bearer sandbox-fake-opaque-token",
 body:{action:"finalize",sourceYearId:source,targetYearId:target,
       confirmation:"2026-2027",operationId:operation}
});
const newRequest=(x={})=>({...request,...x});
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
const adapters=(calls,overrides={})=>({
 config,
 verifyAuthToken:async (token)=>{calls.push(["verify",token]);return {
  userId:actor,sessionId:session,authoritativelyVerified:true};
 },
 findProfileById:async (id)=>{calls.push(["profile",id]);return {id,role:"admin"};},
 mockDbTransaction:async (job)=>{calls.push(["transaction",job]);return {ok:true};},
 ...overrides
});

test("5D-E 01 - gateway ferme sans config, aucun appel adapter", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{config:null}));
 assert.equal((await g(request)).code,"locked");assert.equal(calls.length,0);
});
test("5D-E 02 - aucune configuration production autorisee", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{config:{
  ...config,dbHost:"db.schoolnet.production"}}));
 assert.equal((await g(request)).code,"not_isolated");assert.equal(calls.length,0);
});
test("5D-E 03 - une dependance mock absente empeche l'operation", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{mockDbTransaction:undefined}));
 assert.equal((await g(request)).code,"missing_mock_adapter");assert.equal(calls.length,0);
});
test("5D-E 04 - token absent est refuse avant authentification", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls));
 assert.equal((await g(newRequest({authorization:""}))).code,"missing_bearer");
 assert.equal(calls.length,0);
});
test("5D-E 05 - erreur Auth externe = refus, pas de transaction", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{
  verifyAuthToken:async()=>{throw Error("Auth fixture offline");}
 }));
 assert.equal((await g(request)).code,"auth_unavailable");
 assert.ok(calls.every(x=>x[0]!=="transaction"));
});
test("5D-E 06 - token non verifie ne vaut aucune autorisation", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{
  verifyAuthToken:async()=>({userId:actor,sessionId:session,authoritativelyVerified:false})
 }));
 assert.equal((await g(request)).code,"unverified_session");assert.equal(calls.length,0);
});
test("5D-E 07 - panne lecture profil = refus", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{
  findProfileById:async()=>{throw Error("offline test");}
 }));
 assert.equal((await g(request)).code,"profile_unavailable");
 assert.ok(!calls.some(x=>x[0]==="transaction"));
});
test("5D-E 08 - school_admin, enseignant, parent et eleve n'activent pas calendrier", async()=>{
 for(const role of ["school_admin","teacher","parent","student"]){
  const calls=[];const g=createLot5dSandboxGateway(adapters(calls,{
   findProfileById:async()=>({id:actor,role})
  }));
  assert.equal((await g(request)).code,"not_global_admin",role);
  assert.equal(calls.some(x=>x[0]==="transaction"),false,role);
 }
});
test("5D-E 09 - une origine preview ou locale est refusee", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls));
 for(const origin of ["http://localhost:5173","https://schoolnet-snowy.vercel.app"]){
  assert.equal((await g(newRequest({origin}))).code,"untrusted_origin");
 }
 assert.ok(!calls.some(x=>x[0]==="transaction"));
});
test("5D-E 10 - injection du role et de l'acteur navigateur refusee", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls));
 for(const k of ["actorId","role","sqlFunction","isAdmin"]){
  const body={...request.body,[k]:k==="role"?"admin":actor};
  assert.equal((await g(newRequest({body}))).code,"payload",k);
 }
 assert.ok(!calls.some(x=>x[0]==="transaction"));
});
test("5D-E 11 - la finalisation utilise un mapping SQL fixe et acteur serveur", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls));
 assert.deepEqual(await g(request),{ok:true,action:"finalize",confirmed:true});
 const action=calls.find(x=>x[0]==="transaction")?.[1];
 assert.equal(action.functionName,"schoolnet_private.finalize_lot5d_legacy_year");
 assert.equal(action.actorId,actor);
 assert.equal(action.args.operationId,operation);
 assert.equal(action.args.studentId,undefined);
});
test("5D-E 12 - la decision validee utilise aussi acteur serveur", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls));
 const body={action:"decision",sourceYearId:source,targetYearId:target,
  studentId:student,decision:"repeat",targetClassId:classroom,note:"fictif"};
 assert.equal((await g(newRequest({body}))).ok,true);
 const action=calls.find(x=>x[0]==="transaction")?.[1];
 assert.equal(action.functionName,"schoolnet_private.save_lot5d_legacy_decision");
 assert.equal(action.actorId,actor);
 assert.equal(action.args.studentId,student);
});
test("5D-E 13 - echec de transaction ne renvoie jamais de donnees privees", async()=>{
 const g=createLot5dSandboxGateway(adapters([],{
  mockDbTransaction:async()=>{throw Error("private database error with secrets");}
 }));
 assert.deepEqual(await g(request),{ok:false,code:"transaction_failed"});
});
test("5D-E 14 - retour SQL non confirme = refus", async()=>{
 const g=createLot5dSandboxGateway(adapters([],{
  mockDbTransaction:async()=>({ok:false,secret:"not for public"})
 }));
 assert.equal((await g(request)).code,"transaction_unconfirmed");
});
test("5D-E 15 - demande malformee est refusee avant mock DB", async()=>{
 const calls=[];const g=createLot5dSandboxGateway(adapters(calls));
 const bad={...request.body,operationId:"broken"};
 assert.equal((await g(newRequest({body:bad}))).code,"payload");
 assert.ok(!calls.some(x=>x[0]==="transaction"));
});
test("5D-E 16 - garde SQL historisation des dossiers et des classes",async()=>{
 const sql=await read("../supabase/proposals/20261118_schoolnet_lot5de_history_guards_SANDBOX_ONLY.sql");
 assert.match(sql,/SANDBOX_ONLY/);
 assert.match(sql,/NE PAS.*supabase\/migrations/);
 assert.match(sql,/trg_lot5de_freeze_closed_year_enrollment/);
 assert.match(sql,/trg_lot5de_freeze_closed_year_class_link/);
 assert.match(sql,/school_year_rollover_runs/);
 assert.match(sql,/REVOKE ALL ON FUNCTION schoolnet_private/);
 assert.doesNotMatch(sql,/\bGRANT\s+EXECUTE\s+ON\b/i);
});
test("5D-E 17 - replique legacy verifie annee SOUS lock avant is_current",async()=>{
 const sql=await read("./lot5d/legacy_rpc_guarded_fixture_postgresql17.sql");
 const upsert=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_upsert_student_enrollment("),
   sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_set_student_enrollment_status("));
 const status=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_set_student_enrollment_status("),
   sql.indexOf("CREATE OR REPLACE FUNCTION public.admin_upsert_student_enrollment_with_gender("));
 assert.ok(upsert.indexOf("LOCK TABLE public.school_years IN SHARE MODE")<
           upsert.indexOf("SELECT sy.id,sy.name,sy.is_current"));
 assert.ok(status.indexOf("LOCK TABLE public.school_years IN SHARE MODE")<
           status.indexOf("FROM public.student_enrollments e"));
 assert.match(sql,/NOT drop-in replacements|not the complete production functions/i);
});
test("5D-E 18 - fixture archive inclut parent, bulletin, preuve et ancienne classe",async()=>{
 const sql=await read("./lot5d/legacy_cross_prepare.sql");
 for(const table of ["parent_links","report_cards","student_enrollment_documents","class_students"]){
  assert.match(sql,new RegExp("public\\."+table));
 }
 assert.match(sql,/fixture_5de_history_snapshot/);
});
test("5D-E 19 - deux sessions, timeout, apres commit status et archives testes",async()=>{
 const runner=await read("./lot5d/run_legacy_cross_postgresql17.sh");
 const post=await read("./lot5d/legacy_cross_postcheck.sql");
 const a=await read("./lot5d/legacy_cross_finalizer_a.sql");
 assert.match(runner,/pg_stat_activity/);
 assert.match(runner,/lock timeout/);
 assert.match(runner,/127\.0\.0\.1/);
 assert.match(runner,/schoolnet_lot5d_ci/);
 assert.match(a,/pg_sleep\(11\)/);
 assert.match(post,/E-CROSS 11/);
 assert.match(post,/parent_child_ids/);
 assert.match(post,/^ROLLBACK;/m);
});
test("5D-E 20 - CI isolee et pas de vrai backend deploye",async()=>{
 const wf=await read("../.github/workflows/schoolnet-quality.yml");
 assert.match(wf,/lot5d_legacy_cross:/);
 assert.match(wf,/run_legacy_cross_postgresql17\.sh/);
 assert.match(wf,/postgres:17-alpine/);
 assert.doesNotMatch(wf,/supabase db push|vercel --prod/i);
 const gateway=await read("./lot5d/admin_gateway_dryrun.mjs");
 assert.match(gateway,/NO HTTP SERVER/);
 assert.match(gateway,/NO Supabase client/);
 assert.doesNotMatch(gateway,/\bDeno\.serve\s*\(|\bfetch\s*\(|\bcreateServer\s*\(/);
});
