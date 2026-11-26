import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL(
  "../supabase/proposals/s4c3c3_official_curriculum_and_general_average_kernel.sql",
  import.meta.url),"utf8");
const ci=readFileSync(new URL(
  "../.github/workflows/schoolnet-s4c3c3-curriculum-sql-ci.yml",
  import.meta.url),"utf8");
test("C3-C.3: catalogues exclusifs par classe/période",()=>{
  assert.match(sql,/UNIQUE \(period_id,class_id\)/);
  assert.match(sql,/NEW\.school_year_id/);
  assert.match(sql,/c\.learning_context='school'/);
  assert.match(sql,/p\.is_locked=false/);
});
test("C3-C.3: catalogue approuve et invalide apres changement",()=>{
  assert.match(sql,/status='approved'/);
  assert.match(sql,/status='draft',approved_at=NULL,approved_by=NULL/);
  assert.match(sql,/EMPTY_APPROVED_CURRICULUM/);
});
test("C3-C.3: tables privees, RLS et aucun acces direct aux roles clients",()=>{
  assert.match(sql,/school_official_curricula ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/school_official_curriculum_subjects ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON schoolnet_private\.school_official_curricula FROM PUBLIC,anon,authenticated/);
  assert.match(sql,/REVOKE ALL ON FUNCTION schoolnet_private\.compute_official_general_average_preview/);
  assert.doesNotMatch(sql,/\bGRANT\s+(SELECT|UPDATE|INSERT|DELETE|EXECUTE)\b/i);
});
test("C3-C.3: pas de RPC publique et aucune mise a jour des notes V1 ou V2",()=>{
  assert.doesNotMatch(sql,/\bCREATE (OR REPLACE )?FUNCTION public\./i);
  assert.doesNotMatch(sql,/\bUPDATE\s+public\.(assessment_submissions|report_cards|student_period_averages)/i);
  assert.doesNotMatch(sql,/\bstudent_period_averages\b|\bgenerate_report_card\b/);
});
test("C3-C.3: arrondi uniquement a la sortie, etat provisoire NULL",()=>{
  assert.match(sql,/v_subject_exact:=v_weighted\/v_weights/);
  assert.match(sql,/round\(v_general_weighted\/v_general_weights,2\)/);
  assert.match(sql,/ELSE NULL END,/);
  assert.match(sql,/previewOnly',true/);
});
test("C3-C.3: tests SQL sur service jetable, aucune cle production",()=>{
  assert.match(ci,/image: postgres:17/);
  assert.match(ci,/POSTGRES_DB: schoolnet_fixture/);
  assert.match(ci,/curl|psql/);
  assert.doesNotMatch(ci,/supabase db push|apply_migration|deployments\.create|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY/);
});
