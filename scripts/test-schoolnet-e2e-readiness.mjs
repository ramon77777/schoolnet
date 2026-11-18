import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  canWriteSchoolClassesFromRuntime,
  SCHOOLNET_MAIN_APP_ORIGIN,
  SCHOOLNET_MAIN_SUPABASE_URL,
} from "../src/features/schools/lib/schoolClassWritePolicy.ts";

// SECURITE : controle purement statique, sans API Supabase, sans navigateur,
// sans reseau, sans secret et sans aucune RPC d'ecriture.
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function contains(source, fragment, label) {
  assert.ok(source.includes(fragment), label || `Fragment absent: ${fragment}`);
}

function assertWriteGuard(source, guard, rpc) {
  const rpcAt = source.indexOf(`supabase.rpc("${rpc}"`);
  assert.ok(rpcAt > 0, `RPC ${rpc} introuvable`);
  const gateAt = source.lastIndexOf(`if (${guard}())`, rpcAt);
  assert.ok(gateAt >= 0 && gateAt < rpcAt, `Garde-fou absent avant ${rpc}`);
}

test("E2E-READINESS 01 - origine officielle et projet Supabase exacts", () => {
  assert.equal(SCHOOLNET_MAIN_APP_ORIGIN, "https://schoolnet-snowy.vercel.app");
  assert.equal(SCHOOLNET_MAIN_SUPABASE_URL, "https://anttmbhaphkhmkoqsofd.supabase.co");
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, true,
    ), true,
  );
});

test("E2E-READINESS 02 - localhost, Preview et projets tiers en lecture seule", () => {
  for (const origin of [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "https://schoolnet-preview.vercel.app",
    "https://schoolnet-snowy.vercel.app.attacker.invalid",
    undefined,
  ]) {
    assert.equal(
      canWriteSchoolClassesFromRuntime(origin, SCHOOLNET_MAIN_SUPABASE_URL, true),
      false,
      `Origine non officielle autorisee: ${origin}`,
    );
  }
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, false,
    ), false,
  );
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, "https://another.supabase.co", true,
    ), false,
  );
});

test("E2E-READINESS 03 - quatre routes protegees par school_admin", async () => {
  const routes = await read("../src/routes/router.tsx");
  contains(routes, '<RoleGate allowed={["school_admin"]} />');
  for (const path of [
    "school/classes", "school/teachers", "school/students", "school/assignments",
  ]) contains(routes, `path: "${path}"`, `Route manquante: ${path}`);
});

test("E2E-READINESS 04 - menu local complet et sans lien public d'ecriture", async () => {
  const nav = await read("../src/layouts/DashboardLayout.tsx");
  contains(nav, 'user.role === "school_admin"');
  for (const page of ["classes", "teachers", "students", "assignments"]) {
    contains(nav, `to="/app/school/${page}"`);
  }
});

test("E2E-READINESS 05 - classes : catalogue, annee explicite, create RPC protegee", async () => {
  const api = await read("../src/features/schools/lib/schoolClassesApi.ts");
  const page = await read("../src/features/schools/pages/LocalSchoolClasses.tsx");
  contains(api, 'supabase.rpc("schoolnet_school_class_catalog"');
  contains(api, '.eq("school_id", schoolId)');
  contains(api, '.eq("learning_context", "school")');
  assertWriteGuard(api, "areSchoolClassesReadOnly", "schoolnet_school_create_class");
  contains(api, "p_school_year_id: input.schoolYearId");
  contains(page, "schoolYearId");
  contains(page, "Prévisualisation SCHOOLNET");
});

test("E2E-READINESS 06 - enseignants : email exact et changement de statut proteges", async () => {
  const api = await read("../src/features/schools/lib/schoolTeachersApi.ts");
  contains(api, 'supabase.rpc("schoolnet_school_teacher_roster"');
  assertWriteGuard(api, "areSchoolTeachersReadOnly", "schoolnet_school_teacher_attach");
  assertWriteGuard(api, "areSchoolTeachersReadOnly", "schoolnet_school_teacher_set_active");
  contains(api, "p_email: email.trim().toLowerCase()");
});

test("E2E-READINESS 07 - eleves : affiliation sans insertion directe ni compte Auth", async () => {
  const api = await read("../src/features/schools/lib/schoolStudentsApi.ts");
  contains(api, 'supabase.rpc("schoolnet_school_student_roster"');
  assertWriteGuard(api, "areSchoolStudentsReadOnly", "schoolnet_school_student_attach");
  assertWriteGuard(api, "areSchoolStudentsReadOnly", "schoolnet_school_student_set_active");
  assert.equal(api.includes('.from("schoolnet_school_memberships")'), false);
  assert.equal(api.includes('.from("auth.users")'), false);
});

test("E2E-READINESS 08 - quatre mutations S3-C bloquees avant appel RPC", async () => {
  const api = await read("../src/features/schools/lib/schoolAssignmentsApi.ts");
  contains(api, 'supabase.rpc("schoolnet_school_assignment_catalog"');
  for (const rpc of [
    "schoolnet_school_assign_student",
    "schoolnet_school_set_student_assignment_active",
    "schoolnet_school_assign_teacher_subject",
    "schoolnet_school_set_teacher_subject_assignment_active",
  ]) assertWriteGuard(api, "areSchoolAssignmentsReadOnly", rpc);
});

test("E2E-READINESS 09 - migrations canoniques S2B/S3A/S3B/S3C presentes", async () => {
  const names = [
    "20261117150838_schoolnet_s2b_school_class_rpc_and_catalog.sql",
    "20261117155641_schoolnet_s3a_school_teachers_roster_and_memberships.sql",
    "20261117162853_schoolnet_s3b_school_students_roster_and_memberships.sql",
    "20261118083254_schoolnet_s3c_class_assignments.sql",
  ];
  for (const name of names) {
    const sql = await read(`../supabase/migrations/${name}`);
    contains(sql, "CREATE FUNCTION public.", `Migration invalide: ${name}`);
    contains(sql, "schoolnet_private.is_school_admin_for");
  }
});

test("E2E-READINESS 10 - e-mail technique du parcours sans e-mail exclu en SQL", async () => {
  const sql = await read("../supabase/migrations/20261117162853_schoolnet_s3b_school_students_roster_and_memberships.sql");
  contains(sql, "schoolnet_student_no_email_requests");
  contains(sql, "r.student_auth_user_id");
  contains(sql, "auth.uid() IS NULL");
});

test("E2E-READINESS 11 - S3-C : integrite par ecole, annee, role et matiere", async () => {
  const sql = await read("../supabase/migrations/20261118083254_schoolnet_s3c_class_assignments.sql");
  contains(sql, "schoolnet_s3c_student_one_class_per_school_year");
  contains(sql, "schoolnet_s3c_teacher_subject_unique");
  contains(sql, "m.member_role=v_role AND m.status='active'");
  contains(sql, "c.learning_context='school'");
  contains(sql, "academic_subjects");
  contains(sql, "schoolnet_private.assert_s3c_access");
});

test("E2E-READINESS 12 - S3-C : RLS et aucun acces direct aux affectations", async () => {
  const sql = await read("../supabase/migrations/20261118083254_schoolnet_s3c_class_assignments.sql");
  for (const table of [
    "schoolnet_school_student_class_assignments",
    "schoolnet_school_teacher_subject_assignments",
    "schoolnet_school_assignment_events",
  ]) {
    contains(sql, `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    contains(sql, `REVOKE ALL ON TABLE public.${table}`);
  }
  for (const name of [
    "schoolnet_school_assignment_catalog",
    "schoolnet_school_assign_student",
    "schoolnet_school_assign_teacher_subject",
  ]) contains(sql, `REVOKE ALL ON FUNCTION public.${name}`);
});

test("E2E-READINESS 13 - journal prive et legacy non alteres par la proposition S3-C", async () => {
  const sql = await read("../supabase/migrations/20261118083254_schoolnet_s3c_class_assignments.sql");
  const api = await read("../src/features/schools/lib/schoolAssignmentsApi.ts");
  const page = await read("../src/features/schools/pages/LocalSchoolAssignments.tsx");
  contains(sql, "CREATE TABLE public.schoolnet_school_assignment_events");
  contains(sql, "school_student_class_assigned");
  contains(sql, "school_teacher_subject_reactivated");
  for (const table of ["class_students", "class_teachers", "student_enrollments"]) {
    for (const verb of ["INSERT INTO", "UPDATE", "DELETE FROM"]) {
      assert.ok(!sql.includes(`${verb} public.${table}`),
        `Ecriture legacy interdite : ${verb} ${table}`);
    }
  }
  contains(api, "events: SchoolAssignmentEvent[]");
  contains(page, "Journal des mouvements");
});

test("E2E-READINESS 14 - inventaire SQL SELECT uniquement, sans secret ni e-mail", async () => {
  const sql = await read("../supabase/verification/20261118_schoolnet_e2e_readiness_readonly.sql");
  const statements = sql.replace(/--[^\n]*/g, "").trim();
  assert.match(statements, /^SELECT\b/i, "Le diagnostic doit commencer par SELECT");
  // Les noms de privilèges 'INSERT' dans un SELECT ne sont PAS des instructions DML.
  assert.equal(/(?:^|;)\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|TRUNCATE|DROP|GRANT|REVOKE|CALL|DO)\b/im.test(statements), false);
  assert.equal(/\b(?:password|technical_email|service_role|access_token)\b/i.test(statements), false);
  contains(sql, "installed_flow_migrations");
  contains(sql, "school_year_marked_current");
});

test("E2E-READINESS 15 - plan recette separant lecture et ecritures futures", async () => {
  const plan = await read("../docs/releases/SCHOOLNET_RECETTE_E2E_S2B_S3C_PREPARATION_2026-11-18.md");
  for (const text of [
    "Mode A", "Mode B", "ADMIN_A", "ADMIN_B", "ELEVE_SANS_EMAIL",
    "R01", "R28", "2025-2026", "aucune donnée", "lecture seule",
  ]) contains(plan.toLowerCase(), text.toLowerCase());
  contains(plan, "restauration");
  contains(plan, "sans e-mail");
});

test("E2E-READINESS 16 - QA historiques et compilation dans le workflow", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const ci = await read("../.github/workflows/schoolnet-s2b-qa.yml");
  for (const name of ["qa:s2b", "qa:s3a", "qa:s3b", "qa:s3c", "qa:e2e:readiness"]) {
    assert.equal(typeof pkg.scripts[name], "string", `npm ${name} manquant`);
    contains(ci, `npm run ${name}`);
  }
  for (const name of ["lint", "build"]) contains(ci, `npm run ${name}`);
  assert.equal(pkg.scripts["qa:e2e:readiness"],
    "node --experimental-strip-types --test scripts/test-schoolnet-e2e-readiness.mjs");
});
