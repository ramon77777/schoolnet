import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  canWriteSchoolClassesFromRuntime,
  SCHOOLNET_MAIN_APP_ORIGIN,
  SCHOOLNET_MAIN_SUPABASE_URL,
} from "../src/features/schools/lib/schoolClassWritePolicy.ts";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("S3-C 01 - ecriture reservee a la prod officielle, pas a une Preview", () => {
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN,SCHOOLNET_MAIN_SUPABASE_URL,true,
  ), true);
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://schoolnet-s3c-preview.vercel.app",
    "https://schoolnet-snowy.vercel.app.evil.example",
    undefined,
  ]) {
    assert.equal(canWriteSchoolClassesFromRuntime(
      origin,SCHOOLNET_MAIN_SUPABASE_URL,true,
    ), false);
  }
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN,SCHOOLNET_MAIN_SUPABASE_URL,false,
  ), false);
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN,"https://another.supabase.co",true,
  ), false);
});

test("S3-C 02 - protection fail-closed SSR et reuse de S2-B", async () => {
  const policy = await read("../src/features/schools/lib/schoolAssignmentWritePolicy.ts");
  assert.match(policy,/canWriteSchoolClassesFromRuntime/);
  assert.match(policy,/typeof window === "undefined"/);
  assert.match(policy,/import\.meta\.env\.PROD/);
  assert.match(policy,/SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE/);
});

test("S3-C 03 - quatre mutations bloquees avant les RPC", async () => {
  const source = await read("../src/features/schools/lib/schoolAssignmentsApi.ts");
  const methods = [
    "schoolnet_school_assign_student",
    "schoolnet_school_set_student_assignment_active",
    "schoolnet_school_assign_teacher_subject",
    "schoolnet_school_set_teacher_subject_assignment_active",
  ];
  assert.equal((source.match(/if \(areSchoolAssignmentsReadOnly\(\)\)/g) ?? []).length, 4);
  for(const method of methods) {
    const methodCall = source.indexOf('supabase.rpc("' + method + '"');
    assert.ok(methodCall >= 0, "RPC presente: " + method);
    const gate = source.lastIndexOf("if (areSchoolAssignmentsReadOnly())", methodCall);
    assert.ok(gate >= 0 && gate < methodCall, "garde avant la RPC " + method);
  }
  assert.doesNotMatch(source,/\.from\(["'](?:class_students|class_teachers|student_enrollments|profiles|schoolnet_school_memberships)["']\)/);
});

test("S3-C 04 - catalogue valide toutes les familles de reponses", async () => {
  const api = await read("../src/features/schools/lib/schoolAssignmentsApi.ts");
  assert.match(api,/isSchoolAssignmentsCatalog/);
  for(const key of [
    "classes","students","teachers","subjects","events","student_assignments","teacher_assignments",
  ]) {
    assert.ok(api.includes(key),"champ requis: "+key);
  }
  assert.match(api,/typeof row\.effective_active === "boolean"/);
  assert.match(api,/row\.school_id !== schoolId|value\.school_id !== schoolId/);
});

test("S3-C 05 - route restreinte et navigation locale", async () => {
  const router = await read("../src/routes/router.tsx");
  const nav = await read("../src/layouts/DashboardLayout.tsx");
  const dashboard = await read("../src/features/schools/pages/LocalSchoolDashboard.tsx");
  assert.match(router,/allowed=\{\["school_admin"\]\}/);
  assert.match(router,/school\/assignments/);
  assert.match(router,/<LocalSchoolAssignments \/>/);
  assert.match(nav,/\/app\/school\/assignments/);
  assert.match(dashboard,/Consulter les affectations/);
});

test("S3-C 06 - l'interface reste en lecture seule Preview apres installation", async () => {
  const page = await read("../src/features/schools/pages/LocalSchoolAssignments.tsx");
  assert.match(page,/Prévisualisation SCHOOLNET — lecture seule/);
  assert.match(page,/S3-C — Catalogue momentanément indisponible/);
  assert.match(page,/!readOnlyPreview && !isDemo/);
  assert.match(page,/readOnlyPreview \|\| busy/);
  assert.match(page,/window\.confirm/);
  assert.match(page,/Aucune classe officielle créée/);
});

test("S3-C 07 - formulaires distincts avec classe et annee, sans ecriture legacy", async () => {
  const page = await read("../src/features/schools/pages/LocalSchoolAssignments.tsx");
  assert.match(page,/assignment-school/);
  assert.match(page,/assignment-class/);
  assert.match(page,/assignment-student/);
  assert.match(page,/assignment-teacher/);
  assert.match(page,/assignment-subject/);
  assert.match(page,/selectedClass\.school_year_id/);
  assert.match(page,/cours historiques/);
  // La page ne doit pas reutiliser les tables legacy; la mention textuelle
  // de ces tables n'est pas requise. Les RPC restent la seule ecriture.
  assert.doesNotMatch(page,/\.from\(["'](?:class_students|class_teachers)["']\)/);
});

test("S3-C 08 - conflit par ecole/annee et reactivation explicite", async () => {
  const page = await read("../src/features/schools/pages/LocalSchoolAssignments.tsx");
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  assert.match(page,/assignment\.school_year_id === selectedClass\.school_year_id/);
  assert.match(page,/existingSameClass/);
  assert.match(sql,/schoolnet_s3c_student_one_class_per_school_year/);
  assert.match(sql,/WHERE status='active'/);
  assert.match(sql,/CONSTRAINT schoolnet_s3c_student_same_class_unique UNIQUE/);
  assert.match(sql,/school_student_class_reactivated/);
});

test("S3-C 09 - tables officielles separees et RLS fail-closed", async () => {
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  assert.match(sql,/CREATE TABLE public\.schoolnet_school_student_class_assignments/);
  assert.match(sql,/CREATE TABLE public\.schoolnet_school_teacher_subject_assignments/);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length,3);
  assert.match(sql,/REVOKE ALL ON TABLE public\.schoolnet_school_student_class_assignments/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.schoolnet_school_teacher_subject_assignments/);
  assert.doesNotMatch(sql,/GRANT (?:SELECT|INSERT|UPDATE|DELETE) ON TABLE public\.schoolnet_school_(?:student_class|teacher_subject)_assignments/i);
  assert.doesNotMatch(sql,/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:class_students|class_teachers|student_enrollments|courses|grades|report_cards|parent_student_links)/i);
});

test("S3-C 10 - triggers d'integrite et affiliations actives", async () => {
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  assert.match(sql,/CREATE FUNCTION schoolnet_private\.validate_s3c_assignment/);
  assert.match(sql,/trg_schoolnet_s3c_student_integrity/);
  assert.match(sql,/trg_schoolnet_s3c_teacher_integrity/);
  assert.match(sql,/NEW\.school_year_id/);
  assert.match(sql,/c\.learning_context='school'/);
  assert.match(sql,/m\.member_role=v_role AND m\.status='active'/);
  assert.match(sql,/AND is_active=true/);
});

test("S3-C 11 - roles SQL, school_admin et origine officielle", async () => {
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  assert.match(sql,/auth\.uid\(\) IS NULL/);
  assert.match(sql,/\(SELECT public\.get_my_role\(\)\)::text IS DISTINCT FROM 'school_admin'/);
  assert.match(sql,/schoolnet_private\.is_school_admin_for\(p_school_id\)/);
  assert.match(sql,/current_setting\('request\.headers',true\)/);
  assert.match(sql,/IS DISTINCT FROM 'https:\/\/schoolnet-snowy\.vercel\.app'/);
  assert.match(sql,/schoolnet_private\.assert_s3c_access\(p_school_id,true\)/);
});

test("S3-C 12 - cinq facades RPC invoker, anon exclu", async () => {
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  for(const name of [
    "schoolnet_school_assignment_catalog",
    "schoolnet_school_assign_student",
    "schoolnet_school_set_student_assignment_active",
    "schoolnet_school_assign_teacher_subject",
    "schoolnet_school_set_teacher_subject_assignment_active",
  ]) {
    assert.ok(sql.includes("CREATE FUNCTION public." + name),name);
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public." + name),name);
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public." + name),name);
  }
  assert.match(sql,/SECURITY INVOKER/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/DO \$verify_s3c\$/);
});

test("S3-C 13 - audit des six evenements sans effacer l'ancien audit", async () => {
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  for(const action of [
    "school_student_class_assigned","school_student_class_revoked",
    "school_student_class_reactivated","school_teacher_subject_assigned",
    "school_teacher_subject_revoked","school_teacher_subject_reactivated",
  ]) {
    assert.ok(sql.includes(action),action);
  }
  assert.match(sql,/school_teacher_reactivated/);
  assert.match(sql,/school_student_reactivated/);
});

test("S3-C 14 - recette rollback reel et migration canonique historisee", async () => {
  const qa = await read("../supabase/verification/20261117_s3c_class_assignments_rollback.sql");
  assert.match(qa,/NE JAMAIS COMMIT/);
  assert.match(qa,/S3C_ASSIGNMENTS_ROLES_TENANT_YEAR_SUBJECT_PREVIEW_HISTORY_ROLLBACK_PASS/);
  assert.match(qa,/v_same_year/);
  assert.match(qa,/qa_s3c_cross_school/);
  assert.match(qa,/v_direct_table_denied/);
  assert.match(qa,/events_before/);
  assert.doesNotMatch(qa,/^\s*COMMIT\s*;/im);
  const canonical = new URL("../supabase/migrations/20261118083254_schoolnet_s3c_class_assignments.sql", import.meta.url);
  assert.equal(existsSync(canonical),true);
  const canonSql = await read("../supabase/migrations/20261118083254_schoolnet_s3c_class_assignments.sql");
  assert.match(canonSql,/MIGRATION CANONIQUE DEJA INSTALLEE/);
  assert.match(canonSql,/DO \$verify_s3c\$/);
});

test("S3-C 15 - journal d'affectations immuable, prive et filtre par ecole", async () => {
  const sql = await read("../supabase/proposals/s3c_school_class_assignments.sql");
  const page = await read("../src/features/schools/pages/LocalSchoolAssignments.tsx");
  const api = await read("../src/features/schools/lib/schoolAssignmentsApi.ts");
  assert.match(sql,/CREATE TABLE public\.schoolnet_school_assignment_events/);
  assert.match(sql,/ALTER TABLE public\.schoolnet_school_assignment_events ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE public\.schoolnet_school_assignment_events/);
  assert.match(sql,/WHERE ev\.school_id=p_school_id/);
  assert.match(sql,/ORDER BY ev\.created_at DESC,ev\.id DESC LIMIT 100/);
  assert.match(sql,/INSERT INTO public\.schoolnet_school_assignment_events/);
  assert.match(api,/events: SchoolAssignmentEvent\[\]/);
  assert.match(page,/Journal des mouvements/);
  assert.match(page,/historyEvents/);
});
