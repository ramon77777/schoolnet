import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = path => readFileSync(new URL(path, import.meta.url), "utf8");
const rpc = load("../supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql");
const audit = load("../tests/s4c3c-tenant-ci/fixtures/school-admin-security-audit.sql");
const ci = load("../.github/workflows/schoolnet-s4c3c34-security-audit-ci.yml");

test("C3-C.3.4: a real school-admin catalog READ never issues SELECT FOR UPDATE",()=>{
  // Git on Windows may check out SQL with CRLF, while CI Linux uses LF.
  // Require the same read/write security split under both line endings.
  for (const source of [rpc, rpc.replace(/\r?\n/g, "\r\n")]) {
    const branches = source.match(
      /IF p_action='read' THEN\s+([\s\S]*?)\s+ELSE\s+([\s\S]*?)\s+END IF;/
    );
    assert.ok(branches, "explicit read/write split is required");
    assert.doesNotMatch(branches[1], /FOR UPDATE/i);
    assert.match(branches[2], /FOR UPDATE;/i);
  }
  assert.match(audit,/BEGIN READ ONLY;[\s\S]*SET LOCAL ROLE authenticated;/);
  assert.match(audit,/C3C34_PASS_CATALOG_READ_ONLY_TRANSACTION/);
});

test("C3-C.3.4: no direct table or public definer exposure to anonymous",()=>{
  assert.match(rpc,/REVOKE ALL ON FUNCTION public\.schoolnet_school_official_curriculum\(uuid,uuid,uuid,text,uuid\[\]\)\s+FROM PUBLIC,anon,authenticated;/);
  assert.match(rpc,/REVOKE ALL ON FUNCTION public\.schoolnet_school_official_general_averages\(uuid,uuid,uuid\)\s+FROM PUBLIC,anon,authenticated;/);
  assert.match(rpc,/SECURITY INVOKER SET search_path=pg_catalog/);
  assert.match(rpc,/SECURITY DEFINER SET search_path=pg_catalog/);
  assert.match(rpc,/auth\.uid\(\) IS NULL/);
  assert.match(rpc,/m\.status='active'\s+AND m\.revoked_at IS NULL/);
});

test("C3-C.3.4: catalogue rejects arbitrary actions, duplicates and inactive subjects",()=>{
  for(const label of [
    "C3C34_PASS_EMPTY_CATALOG_APPROVAL_REJECTED",
    "C3C34_PASS_DUPLICATE_SUBJECT_REJECTED",
    "C3C34_PASS_UNKNOWN_SUBJECT_REJECTED",
    "C3C34_PASS_INACTIVE_SUBJECT_REJECTED",
    "C3C34_PASS_OVERSIZED_CATALOG_REJECTED",
    "C3C34_PASS_READ_FORBIDS_MUTATION_ARGUMENT",
    "C3C34_PASS_UNKNOWN_ACTION_REJECTED",
    "C3C34_PASS_IDEMPOTENT_SUBJECT_SET",
  ]) assert.ok(audit.includes(label),"missing SQL proof: "+label);
});

test("C3-C.3.4: membership revocation enforced without relying on JWT role",()=>{
  assert.match(audit,/UPDATE public\.schoolnet_school_memberships\s+SET status='revoked',revoked_at=now\(\)/);
  assert.match(audit,/C3C34_PASS_REVOKED_ADMIN_SESSION_BLOCKED/);
  assert.match(rpc,/public\.get_my_role\(\)::text IS DISTINCT FROM 'school_admin'/);
  assert.doesNotMatch(rpc,/auth\.jwt\(\)->>'user_metadata'|raw_user_meta_data/);
});

test("C3-C.3.4: preview never exports grades or legacy course averages",()=>{
  assert.match(rpc,/schoolnet_private\.compute_official_general_average_preview/);
  assert.match(rpc,/'previewOnly',true/);
  assert.match(rpc,/'averageOn20',v_average->'averageOn20'/);
  assert.doesNotMatch(rpc,/CREATE (?:OR REPLACE )?FUNCTION public\.[\s\S]*?SECURITY DEFINER/);
  assert.doesNotMatch(rpc,/\bUPDATE public\.assessment_submissions\b|\bINSERT INTO public\.assessment_submissions\b/);
  assert.doesNotMatch(rpc,/\blegacy_averages\b|\bcourse_averages\b|\breport_cards\b/);
});

test("C3-C.3.4: PostgreSQL service disposable, regression and cleanup required",()=>{
  assert.match(ci,/image: postgres:17/);
  assert.match(ci,/POSTGRES_DB: schoolnet_fixture/);
  assert.match(ci,/npm run qa:s4c3c33/);
  assert.match(ci,/npm run qa:s4c3c34/);
  assert.match(ci,/C3C34_PASS_TEMP_FIXTURE_CLEANUP/);
  assert.match(audit,/ROLLBACK;/);
  assert.doesNotMatch(ci,/SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|supabase db push|apply_migration/);
});
