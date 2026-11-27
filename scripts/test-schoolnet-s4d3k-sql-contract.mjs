import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const sql=read("tests/s4d3k/disposable-bulletin-workflow.sql");
const seed=read("tests/s4d3k/disposable-seed.sql");
const run=read("tests/s4d3k/real-auth-workflow-http.mjs");
const ci=read(".github/workflows/schoolnet-s4d3k-real-auth-sql-ci.yml");
const pkg=JSON.parse(read("package.json"));
const vercel=JSON.parse(read("vercel.json"));
const branch="feature/schoolnet-s4d3k-disposable-sql-workflow-20261127";
test("S4-D.3k: this is executable PostgreSQL in tests, not another simulated TS transition",()=>{
 assert.match(sql,/CREATE FUNCTION public\.schoolnet_bulletin_v2_prototype_open_case/);
 assert.match(sql,/CREATE FUNCTION public\.schoolnet_bulletin_v2_prototype_transition/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/UPDATE schoolnet_private\.school_bulletin_v2_cases/);
 assert.match(sql,/INSERT INTO schoolnet_private\.school_bulletin_v2_events/);
 assert.match(sql,/sha256/);
});
test("S4-D.3k: six tables exist only in private schema",()=>{
 const tables=["policy_versions","grants","snapshots","cases","events","publications"];
 for(const table of tables){
  assert.match(sql,new RegExp("CREATE TABLE schoolnet_private\\.school_bulletin_v2_"+table));
  assert.match(sql,new RegExp("ALTER TABLE schoolnet_private\\.school_bulletin_v2_"+table+" ENABLE ROW LEVEL SECURITY"));
 }
 assert.doesNotMatch(sql,/CREATE TABLE public\.school_bulletin_v2/);
});
test("S4-D.3k: every sensitive table refuses anon/authenticated direct access",()=>{
 assert.match(sql,/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated/);
 assert.doesNotMatch(sql,/GRANT (SELECT|INSERT|UPDATE|DELETE) ON TABLE/);
});
test("S4-D.3k: role, school and live membership checks live inside SQL RPCs",()=>{
 assert.equal((sql.match(/auth\.uid\(\)/g)||[]).length>=2,true);
 assert.equal((sql.match(/p\.role::text='school_admin'/g)||[]).length,2);
 assert.equal((sql.match(/m\.status='active'/g)||[]).length,2);
 assert.equal((sql.match(/s\.status='active'/g)||[]).length,2);
 assert.match(sql,/schoolnet_private\.school_report_card_preview/);
 assert.doesNotMatch(sql,/p_actor_id/);
});
test("S4-D.3k: user grants differ from school role; self-decision and incomplete means are blocked",()=>{
 assert.match(sql,/g\.capability='submit'/);
 assert.match(sql,/g\.capability=v_required_cap/);
 assert.match(sql,/v_case\.requester_id=v_actor/);
 assert.match(sql,/S4D3K_INCOMPLETE_BULLETIN/);
 assert.match(sql,/v_projection->'averageOn20'='null'::jsonb/);
 assert.match(sql,/S4D3K_OBSOLETE_SOURCE/);
});
test("S4-D.3k: approval, authorization, publication remain separate; no fake PDF",()=>{
 assert.match(sql,/WHEN 'publication_authorized' THEN/);
 assert.match(sql,/S4D3K_ACTION_NOT_IMPLEMENTED/);
 assert.match(run,/publication_executed/);
 assert.match(run,/count\("publications"\),0/);
 assert.doesNotMatch(sql,/INSERT INTO schoolnet_private\.school_bulletin_v2_publications/);
});
test("S4-D.3k: snapshot and event history cannot be overwritten or removed",()=>{
 assert.match(sql,/s4d3k_snapshot_no_mutation/);
 assert.match(sql,/s4d3k_events_no_mutation/);
 assert.match(sql,/s4d3k_policy_no_mutation/);
 assert.match(sql,/UNIQUE\(case_id,idempotency_key\)/);
});
test("S4-D.3k: integration runs real GoTrue auth and real HTTP, not forged JWT claims",()=>{
 assert.match(run,/\/auth\/v1\/admin\/users/);
 assert.match(run,/\/auth\/v1\/token\?grant_type=password/);
 assert.match(run,/\/rest\/v1\/rpc\//);
 assert.match(run,/Promise\.all/);
 assert.match(run,/assertDENIED/);
 assert.match(run,/execFileSync\("psql"/);
});
test("S4-D.3k: local-only hard gates protect Supabase principal",()=>{
 assert.match(run,/assert\.equal\(API,"http:\/\/127\.0\.0\.1:55421"/);
 assert.match(seed,/S4D3K_FICTITIOUS_SEED_REFUSES_NONEMPTY_TARGET/);
 assert.match(sql,/S4D3K_LOCAL_ONLY_PREFLIGHT_FAILED/);
 assert.match(ci,/supabase start/);
 assert.match(ci,/supabase stop --no-backup/);
 assert.match(ci,/source <\(supabase status -o env\)/);
 assert.doesNotMatch(ci,/supabase link|db push|apply_migration|SUPABASE_DB_URL|PRODUCTION_DATABASE/);
});
test("S4-D.3k: no migration file or public integration added",()=>{
 assert.equal(readdirSync(new URL("../supabase/migrations/",import.meta.url))
  .filter(n=>/s4d3k/i.test(n)).length,0);
 assert.doesNotMatch(read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx"),
  /s4d3k|bulletin_v2_prototype/);
});
test("S4-D.3k: no hosted deployment; local QA command available",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d3k"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d3k-sql-contract.mjs");
});
