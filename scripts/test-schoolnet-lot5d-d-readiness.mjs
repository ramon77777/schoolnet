// Lot 5D-D: contract-only tests. No real auth, no database, no deployments.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectLot5dGatewayContract as inspect } from "./lot5d/admin_gateway_contract_mock.mjs";

const admin = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const student = "11111111-1111-4111-8111-111111111111";
const session = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const source = "20252025-2025-4025-8025-202520252025";
const target = "20262026-2026-4026-8026-202620262026";
const classroom = "c0260000-0000-4000-8000-000000000026";
const operation = "10000000-0000-4000-8000-000000000091";
const sandbox = {
  mode: "isolated_fixture", explicitlyEnabled: true,
  dbName: "schoolnet_lot5d_ci", dbHost: "127.0.0.1",
  sandboxOrigin: "https://schoolnet-sandbox.invalid",
  sessionVerifiedByAuth: true, authUserId: admin,
  dbProfileId: admin, dbConfirmedRole: "admin", sessionId: session
};
const request = {
  method: "POST", contentType: "application/json", origin: sandbox.sandboxOrigin,
  authorization: "Bearer opaque-fake-for-test",
  body: { action: "finalize", sourceYearId: source, targetYearId: target,
          confirmation: "2026-2027", operationId: operation }
};
const withRequest = (changes = {}) => ({ ...request, ...changes });
const withServer = (changes = {}) => ({ ...sandbox, ...changes });
const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

test("5D-D 01 - pas de config = refuse, meme si corps pret", () => {
  assert.equal(inspect(request, undefined).code, "locked");
  assert.equal(inspect(request, {}).code, "locked");
  assert.equal(inspect(request, withServer({ explicitlyEnabled:false })).code, "locked");
});
test("5D-D 02 - connexion prod et autre base refusees, meme avec drapeau", () => {
  assert.equal(inspect(request, withServer({ dbName:"postgres" })).code,"not_isolated");
  assert.equal(inspect(request, withServer({ dbHost:"db.production" })).code,"not_isolated");
  assert.equal(inspect(request, withServer({ mode:"production" })).code,"locked");
});
test("5D-D 03 - origine exacte obligatoire, localhost, previews exclus", () => {
  assert.equal(inspect(withRequest({origin:"http://localhost:5173"}),sandbox).code,"untrusted_origin");
  assert.equal(inspect(withRequest({origin:"https://schoolnet-snowy.vercel.app"}),sandbox).code,"untrusted_origin");
  assert.equal(inspect(withRequest({origin:"https://preview.schoolnet-sandbox.invalid"}),sandbox).code,"untrusted_origin");
});
test("5D-D 04 - POST et JSON seulement", () => {
  assert.equal(inspect(withRequest({ method:"GET" }),sandbox).code,"request_format");
  assert.equal(inspect(withRequest({ contentType:"text/plain" }),sandbox).code,"request_format");
});
test("5D-D 05 - bearer obligatoire, mais sa presence ne vaut pas verification", () => {
  assert.equal(inspect(withRequest({ authorization:"" }),sandbox).code,"missing_bearer");
  assert.equal(inspect(withRequest({ authorization:"Bearer abc def" }),sandbox).code,"missing_bearer");
  assert.equal(inspect(request,withServer({sessionVerifiedByAuth:false})).code,"unverified_session");
});
test("5D-D 06 - identite verifiee et session requises cote serveur", () => {
  assert.equal(inspect(request,withServer({sessionId:undefined})).code,"unverified_session");
  assert.equal(inspect(request,withServer({authUserId:student,dbProfileId:admin})).code,"not_global_admin");
});
test("5D-D 07 - school_admin, parent, teacher refusent calendrier global", () => {
  for(const role of ["school_admin","teacher","parent","student"]){
    assert.equal(inspect(request,withServer({dbConfirmedRole:role})).code,"not_global_admin");
  }
});
test("5D-D 08 - injection du role ou de l'acteur par le navigateur rejetee", () => {
  assert.equal(inspect(withRequest({body:{...request.body,actorId:admin}}),sandbox).code,"payload");
  assert.equal(inspect(withRequest({body:{...request.body,role:"admin"}}),sandbox).code,"payload");
  assert.equal(inspect(withRequest({body:{...request.body,studentId:student}}),sandbox).code,"payload");
});
test("5D-D 09 - donnees malformees et confirm invalide refusees", () => {
  assert.equal(inspect(withRequest({body:{...request.body,sourceYearId:target}}),sandbox).code,"payload");
  assert.equal(inspect(withRequest({body:{...request.body,operationId:"00000000-0000-0000-0000-000000000000"}}),sandbox).code,"payload");
  assert.equal(inspect(withRequest({body:{...request.body,confirmation:"oui"}}),sandbox).code,"payload");
});
test("5D-D 10 - format valide reste reference, aucun appel SQL", () => {
  const result=inspect(request,sandbox);
  assert.equal(result.ok,true);
  assert.equal(result.actorId,admin);
  assert.equal(result.operationId,operation);
  assert.equal(result.action,"finalize");
});
test("5D-D 11 - decision scolaire verifie classe et typologie", () => {
  const item = {action:"decision",sourceYearId:source,targetYearId:target,
    studentId:student,decision:"repeat",targetClassId:classroom,note:"Essai fictif"};
  assert.equal(inspect(withRequest({body:item}),sandbox).ok,true);
  assert.equal(inspect(withRequest({body:{...item,targetClassId:null}}),sandbox).code,"decision_class");
  assert.equal(inspect(withRequest({body:{...item,decision:"leave"}}),sandbox).code,"decision_class");
  assert.equal(inspect(withRequest({body:{...item,note:"a".repeat(1001)}}),sandbox).code,"payload");
});
test("5D-D 12 - PRIVILEGE execute absent de tous les roles API", async () => {
  const sql=await read("../supabase/proposals/20261118_schoolnet_lot5d_ab_consolidated_SANDBOX_ONLY.sql");
  assert.match(sql,/REVOKE ALL ON FUNCTION schoolnet_private\.guard_lot5d_year_switch/);
  assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(sql,/\bGRANT EXECUTE\b[\s\S]{0,80}\b(?:anon|authenticated|service_role)\b/i);
});
test("5D-D 13 - scripts de concurrence, droits et contraintes reels references CI", async () => {
  const wf=await read("../.github/workflows/schoolnet-quality.yml");
  assert.match(wf,/run_concurrency_postgresql17\.sh/);
  assert.match(wf,/authorization_postgresql17\.sql/);
  assert.match(wf,/schema_compatibility_postgresql17\.sql/);
  assert.match(wf,/postgres:17-alpine/);
  assert.doesNotMatch(wf,/supabase db push|supabase migration up|vercel --prod/i);
});
test("5D-D 14 - concurrence cible uniquement PG17 ephemere", async () => {
  const runner=await read("./lot5d/run_concurrency_postgresql17.sh");
  assert.match(runner,/schoolnet_lot5d_ci/);
  assert.match(runner,/127\.0\.0\.1/);
  assert.match(runner,/SUPABASE_DB_URL/);
  assert.match(runner,/pg_stat_activity/);
  assert.match(runner,/lock timeout/);
});
test("5D-D 15 - les fonctions legacy ne sont pas utilisees dans le finaliseur", async () => {
  const sql=await read("../supabase/proposals/20261118_schoolnet_lot5d_ab_consolidated_SANDBOX_ONLY.sql");
  const finale=sql.slice(sql.indexOf("CREATE FUNCTION schoolnet_private.finalize_lot5d_legacy_year"));
  assert.doesNotMatch(finale,/\b(?:CALL|PERFORM)\s+public\.admin_(?:upsert_student_enrollment|set_student_enrollment_status)/i);
  assert.match(finale,/INSERT INTO public\.class_students/);
  assert.doesNotMatch(finale,/DELETE FROM public\.class_students/);
});
