import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const ci=read("../.github/workflows/schoolnet-s4c3c352-official-rpc-http-ci.yml");
const schema=read("../tests/s4c3c35-supabase-ci/fixtures/official-averages-auth-schema.sql");
const seed=read("../tests/s4c3c35-supabase-ci/fixtures/official-averages-auth-seed.sql");
const suite=read("../tests/s4c3c35-supabase-ci/official-averages-http.mjs");
const rpc=read("../supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql");
const kernel=read("../supabase/proposals/s4c3c3_official_curriculum_and_general_average_kernel.sql");

test("C3-C.3.5.2: same true official SQL proposals loaded in disposable full Supabase",()=>{
 assert.match(ci,/supabase\/proposals\/s4c3c3_official_curriculum_and_general_average_kernel\.sql/);
 assert.match(ci,/supabase\/proposals\/s4c3c3_school_admin_official_general_averages_rpc\.sql/);
 assert.match(ci,/supabase start -x /);
 assert.match(ci,/supabase stop --no-backup/);
 assert.match(ci,/working-directory: tests\/s4c3c35-supabase-ci/);
 assert.match(ci,/name:.*official RPC/i);
 assert.doesNotMatch(ci,/supabase link|supabase db push|--linked|--remote|production|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|apply_migration/);
});

test("C3-C.3.5.2: real auth.uid, not a mocked auth or user-submitted role",()=>{
 assert.match(schema,/REFERENCES auth\.users\(id\)/);
 assert.match(schema,/to_regprocedure\('auth\.uid\(\)'\)/);
 assert.doesNotMatch(schema,/CREATE SCHEMA auth|CREATE (?:OR REPLACE )?FUNCTION auth\.uid/);
 assert.match(suite,/\/auth\/v1\/admin\/users/);
 assert.match(suite,/\/auth\/v1\/token\?grant_type=password/);
 assert.match(suite,/assert\.equal\(API,"http:\/\/127\.0\.0\.1:55421"/);
 assert.match(rpc,/auth\.uid\(\) IS NULL/);
 assert.match(rpc,/member_role='school_admin' AND m\.status='active'/);
});

test("C3-C.3.5.2: no client grade-table permission or PostgREST private schema",()=>{
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/);
 assert.match(schema,/REVOKE ALL ON TABLE public\.%I FROM PUBLIC,anon,authenticated/);
 assert.match(schema,/REVOKE ALL ON SCHEMA schoolnet_private FROM PUBLIC,anon,authenticated/);
 assert.match(suite,/schoolnet_school_official_curriculum/);
 assert.match(suite,/schoolnet_school_official_general_averages/);
 assert.match(suite,/private schema must remain unexposed/);
 assert.match(suite,/assessment_submissions\?select=score/);
 assert.match(rpc,/REVOKE ALL ON FUNCTION public\.schoolnet_school_official_general_averages/);
});

test("C3-C.3.5.2: real scoped weighted grade, null, zero, transfer and revocation scenarios",()=>{
 for(const expected of [
 "16.67","student_a3","student_a2","student_transfer","school B",
 "teacher membership revocation","membership revocation","locked period",
 "published_at","averageOn20,null"
 ]) assert.ok(suite.includes(expected),"Missing scenario "+expected);
 assert.match(seed,/:'student_a1'::uuid/);
 assert.match(seed,/:'student_transfer'::uuid/);
 assert.match(seed,/include_in_average/);
 assert.match(seed,/1,false\)/);
 assert.match(seed,/graded',8,NULL/);
 assert.match(kernel,/v_general_weighted\/v_general_weights/);
});

test("C3-C.3.5.2: no real school records, exports, publication or main-site deploy",()=>{
 assert.match(seed,/C3-C\.3\.5\.2 fixture/);
 assert.match(ci,/qa:s4c3c352/);
 assert.match(ci,/npm run build/);
 // The LOCAL, ephemeral service role key is intentionally read from CLI env
 // to create fake Auth users; disallow hosted URLs and browser-exposed keys.
 assert.match(suite,/const SERVICE=process\.env\.SERVICE_ROLE_KEY;/);
 assert.doesNotMatch(suite,/https:\/\/|supabase\.co|VITE_SUPABASE_/i);
 assert.doesNotMatch(rpc,/UPDATE public\.assessment_submissions/);
 assert.doesNotMatch(ci,/vercel deploy|supabase projects create|supabase functions deploy/);
});
