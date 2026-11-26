import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL(
  "../supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql",
  import.meta.url),"utf8");
const ci=readFileSync(new URL(
  "../.github/workflows/schoolnet-s4c3c33-admin-rpc-ci.yml",
  import.meta.url),"utf8");
const fixture=readFileSync(new URL(
  "../tests/s4c3c-tenant-ci/fixtures/school-admin-rpc-a-b.sql",
  import.meta.url),"utf8");

test("C3-C.3.3: private security-definer checks auth.uid and membership",()=>{
  assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog/);
  assert.match(sql,/auth\.uid\(\) IS NULL/);
  assert.match(sql,/public\.get_my_role\(\)::text IS DISTINCT FROM 'school_admin'/);
  assert.match(sql,/m\.member_role='school_admin' AND m\.status='active'/);
  assert.match(sql,/m\.revoked_at IS NULL/);
});
test("C3-C.3.3: school, year, class and period strict scope",()=>{
  assert.match(sql,/c\.id=p_class_id AND c\.school_id=gp\.school_id/);
  assert.match(sql,/c\.school_year_id=gp\.school_year_id/);
  assert.match(sql,/gp\.id=p_period_id AND gp\.school_id=p_school_id/);
  assert.match(sql,/WHERE ca\.school_id=p_school_id AND ca\.school_year_id=v_year/);
});
test("C3-C.3.3: no p_student_id, p_teacher_id or request-controlled score JSON",()=>{
  assert.doesNotMatch(sql,/p_student_id\s+uuid|p_teacher_id\s+uuid|p_score\s+numeric|p_expected\s+jsonb|p_assessments\s+jsonb/);
  assert.match(sql,/FROM public\.schoolnet_school_student_class_assignments sa/);
  assert.match(sql,/FROM public\.assessment_submissions|JOIN public\.assessment_submissions/);
});
test("C3-C.3.3: only active links, teacher memberships and published grades",()=>{
  assert.match(sql,/al\.status='active' AND al\.revoked_at IS NULL/);
  assert.match(sql,/cl\.status='active'/);
  assert.match(sql,/ta\.status='active' AND ta\.revoked_at IS NULL/);
  assert.match(sql,/tm\.member_role='teacher' AND tm\.status='active'/);
  assert.match(sql,/setting\.include_in_average=true/);
  assert.match(sql,/submission\.status::text='published'/);
  assert.match(sql,/submission\.published_at IS NOT NULL/);
});
test("C3-C.3.3: outputs aggregate preview, no raw grade fields or publication",()=>{
  assert.match(sql,/schoolnet_private\.compute_official_general_average_preview/);
  assert.match(sql,/'previewOnly',true/);
  assert.match(sql,/'averageOn20',v_average->'averageOn20'/);
  assert.doesNotMatch(sql,/'score',submission\.score/);
  assert.doesNotMatch(sql,/\bINSERT INTO public\.assessment_submissions\b|\bUPDATE public\.assessment_submissions\b/);
  assert.doesNotMatch(sql,/\breport_cards\b|\bstudent_period_averages\b|\bpublish_admin_report_card\b/);
});
test("C3-C.3.3: only invoker public RPCs and restricted execute grants",()=>{
  const publicDecls=[...sql.matchAll(/CREATE FUNCTION public\.[\s\S]*?AS \$wrapper\$/g)];
  assert.equal(publicDecls.length,2);
  for(const f of publicDecls)assert.match(f[0],/SECURITY INVOKER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_school_official_general_averages/);
  assert.match(sql,/TO authenticated/);
  assert.match(sql,/REVOKE ALL ON FUNCTION schoolnet_private\.c3c3_require_school_admin/);
});
test("C3-C.3.3: real user roles, cross-tenancy and rollback in CI",()=>{
  assert.match(ci,/image: postgres:17/);
  assert.match(ci,/POSTGRES_DB: schoolnet_fixture/);
  assert.match(fixture,/SET LOCAL ROLE authenticated;/);
  assert.match(fixture,/C3C33_PASS_ADMIN_B_DENIED_A/);
  assert.match(fixture,/C3C33_PASS_PRIVATE_HELPER_DIRECT_CALL_REJECTED/);
  assert.match(fixture,/C3C33_PASS_NO_AUTH_UID_DENIED/);
  assert.match(fixture,/ROLLBACK;/);
  assert.doesNotMatch(ci,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|supabase db push|apply_migration/);
});
