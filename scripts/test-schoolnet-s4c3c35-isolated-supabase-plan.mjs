import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const yaml=read("../.github/workflows/schoolnet-s4c3c35-full-auth-http-ci.yml");
const testSource=read("../tests/s4c3c35-supabase-ci/auth-postgrest-smoke.mjs");
const sql=read("../tests/s4c3c35-supabase-ci/fixtures/http-rls-probe.sql");
const config=read("../tests/s4c3c35-supabase-ci/supabase/config.toml");

test("C3-C.3.5.1: temp GitHub runner with full Auth + PostgREST + RLS",()=>{
  assert.match(yaml,/supabase\/setup-cli@v1/);
  assert.match(yaml,/version:\s*2\.122\.1/);
  assert.match(yaml,/supabase start -x /);
  assert.doesNotMatch(yaml,/start -x[^\n]*(?:gotrue|postgrest|kong)/);
  assert.match(yaml,/working-directory:\s*tests\/s4c3c35-supabase-ci/);
  assert.match(yaml,/supabase stop --no-backup/);
});

test("C3-C.3.5.1: real Auth token, isolated per-user HTTP RLS and no write",()=>{
  assert.match(testSource,/auth\/v1\/signup/);
  assert.match(testSource,/auth\/v1\/user/);
  assert.match(testSource,/rest\/v1\/schoolnet_c35_http_probe/);
  assert.match(testSource,/assert\.equal\(api, "http:\/\/127\.0\.0\.1:55421"/);
  assert.match(testSource,/for \(const label of \["alpha","beta"\]\)/);
  assert.match(testSource,/forged/);
  assert.match(testSource,/unauthorized/);
});

test("C3-C.3.5.1: dummy table locked with FORCE RLS and no inherited DML",()=>{
  assert.match(sql,/REFERENCES auth\.users\(id\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/TO authenticated\s+USING \(owner_id = \(SELECT auth\.uid\(\)\)\)/);
  assert.match(sql,/REVOKE ALL ON public\.schoolnet_c35_http_probe FROM PUBLIC, anon, authenticated;/);
  assert.match(sql,/GRANT SELECT ON public\.schoolnet_c35_http_probe TO authenticated;/);
  assert.doesNotMatch(sql,/schoolnet_official|assessment_submissions|student_grades/);
});

test("C3-C.3.5.1: sandbox never uses remote Supabase, customer credentials or deployment",()=>{
  assert.match(config,/project_id = "schoolnet_s4c3c35_full_auth_http_ci"/);
  assert.match(config,/port = 55421/);
  assert.match(config,/major_version = 17/);
  assert.doesNotMatch(yaml,/supabase link|supabase db push|--linked|--remote|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|apply_migration|deploy_edge_function/i);
  assert.doesNotMatch(testSource,/https:\/\/[^\s"']+supabase\.co|anntmbhaphkhmkoqsofd|onqlsvphmrqhelislpry/);
});
