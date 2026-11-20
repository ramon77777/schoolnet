// SCHOOLNET S4-B.3-B.0 - contrats de sécurité (aucune requête réseau)
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=(p)=>readFileSync(p,"utf8");
const sql=src("supabase/proposals/s4b3b0_official_assessment_security_foundation.sql");
const rollback=src("supabase/verification/s4b3b0_official_assessment_security_rollback_manual.sql");
const core=src("tests/s4b3b0-tenant-ci/fixtures/submission-core.sql");
const scenario=src("tests/s4b3b0-tenant-ci/fixtures/security-a-b.sql");
const ci=src(".github/workflows/schoolnet-s4b3b0-security-ci.yml");
test("La proposition SQL reste separée de toute migration principale",()=>{
 assert.match(sql,/NE PAS EXÉCUTER sur Supabase principal/);
 assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM public\.notifications)\b/i);
});
test("Le lien scolaire meme revoqué garde son statut officiel",()=>{
 assert.match(sql,/schoolnet_private\.school_assessment_links al/);
 assert.match(sql,/al\.assessment_id=p_assessment_id/);
 assert.doesNotMatch(sql,/al\.status='active'/);
});
test("Toutes les classifications privees restreignent les accès directs",()=>{
 for(const fn of ["is_official_assessment","is_official_question","is_official_submission"])
  assert.match(sql,new RegExp("schoolnet_private\\.s4b3b0_"+fn));
 assert.match(sql,/REVOKE ALL ON FUNCTION schoolnet_private\.s4b3b0_is_official_question/);
 assert.match(sql,/SET search_path=pg_catalog/);
 assert.match(sql,/SECURITY DEFINER/);
});
test("Les bonnes reponses sont bloquees sans s'appuyer sur une jointure RLS",()=>{
 assert.match(sql,/s4b3b0_correct_choices_guard/);
 assert.match(sql,/NOT schoolnet_private\.s4b3b0_is_official_question\(question_id\)/);
 assert.match(scenario,/B0_FAIL_STUDENT_OFFICIAL_RLS/);
});
test("Restrictions combinées AND avec les anciennes policies permissives",()=>{
 const n=[...sql.matchAll(/AS RESTRICTIVE FOR (?:SELECT|ALL) TO authenticated/g)].length;
 assert.equal(n,8);
 for(const table of ["public.assessments","public.quiz_questions","public.quiz_choices","public.assessment_submissions",
  "public.homework_submissions","public.submissions","public.submission_answers","public.submission_question_grades"])
  assert.ok(sql.includes("ON "+table+" AS RESTRICTIVE"),table);
});
test("La correction V1 n'est pas accessible a l'eleve ni au mauvais professeur",()=>{
 assert.match(sql,/S4B3B0_GRADING_NOT_AUTHORIZED/);
 assert.match(sql,/a\.created_by=auth\.uid\(\)/);
 assert.match(scenario,/B0_FAIL_FOREIGN_TEACHER_GRADE/);
 assert.match(scenario,/B0_FAIL_STUDENT_GRADE_V1/);
});
test("Les 6 RPC de correction originales sont conservées dans le rollback",()=>{
 for(const fun of ["publish_assessment_submission","mark_submission_as_graded","mark_submission_as_graded_v2",
  "mark_homework_submission_as_graded","publish_homework_submission"])
  assert.ok(rollback.includes("CREATE OR REPLACE FUNCTION public."+fun),fun);
 assert.match(rollback,/S4B3B0_SECURITY_ROLLBACK_PASS/);
});
test("Les grades et publications etudiant sont immuables meme sur V1",()=>{
 assert.match(sql,/S4B3B0_STUDENT_IMMUTABLE_GRADING/);
 assert.match(sql,/S4B3B0_STUDENT_CANNOT_SET_GRADE/);
 assert.match(scenario,/B0_FAIL_V1_STUDENT_FORGED_SCORE/);
 assert.match(scenario,/B0_FAIL_V1_STUDENT_FORGED_STATUS/);
});
test("Les anciennes fonctions de correction ne permettent pas de publier V2",()=>{
 assert.match(sql,/schoolnet_private\.s4b3b0_is_official_assessment\(a\.id\)/);
 assert.match(scenario,/B0_FAIL_OLD_RPC_PUBLISHED_OFFICIAL/);
 assert.match(scenario,/B0_FAIL_V2_GRADED_OFFICIAL_WITH_OLD_RPC/);
 assert.match(scenario,/B0_FAIL_V1_RPC_PUBLISHED_OFFICIAL_HOMEWORK/);
});
test("Les nouveaux triggers sont pris en compte dans le rollback",()=>{
 assert.match(sql,/trg_s4b3b0_protect_assessment_submissions/);
 assert.match(sql,/trg_s4b3b0_protect_homework_submissions/);
 assert.match(rollback,/DROP TRIGGER IF EXISTS trg_s4b3b0_protect_assessment_submissions/);
 assert.match(rollback,/DROP POLICY IF EXISTS s4b3b0_correct_choices_guard/);
});
test("Les élèves ne sont jamais inscrits automatiquement aux cours V1",()=>{
 assert.doesNotMatch(sql,/\bINSERT INTO public\.course_enrollments\b/i);
 assert.doesNotMatch(sql,/\bINSERT INTO public\.student_progress\b/i);
 assert.match(scenario,/B0_PASS_NO_FAKE_ENROLLMENT_OR_PROGRESS/);
});
test("La CI teste les deux etablissements et V1 dans une base jetable",()=>{
 assert.match(ci,/supabase start -x/);
 assert.match(ci,/tests\/s4b3b0-tenant-ci\/fixtures\/security-a-b\.sql/);
 assert.match(ci,/s4b3b0_official_assessment_security_rollback_manual\.sql/);
 assert.match(ci,/supabase stop --no-backup/);
 assert.doesNotMatch(ci,/supabase db push|supabase db reset --linked|vercel --prod/);
});
test("Les anciennes RPC sont effectivement testées en local",()=>{
 assert.match(core,/CREATE OR REPLACE FUNCTION public\.publish_assessment_submission/);
 assert.match(core,/CREATE OR REPLACE FUNCTION public\.mark_submission_as_graded_v2/);
 assert.match(scenario,/B0_PASS_TEACHER_V1_COMPATIBLE_AND_OFFICIAL_LOCKED/);
 assert.match(scenario,/B0_PASS_TENANT_B_ISOLATED/);
});
