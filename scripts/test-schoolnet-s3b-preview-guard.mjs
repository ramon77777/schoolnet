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

test("S3-B 01 - origine et Supabase principal requis pour toute ecriture", () => {
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, true,
  ), true);
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://schoolnet-preview.vercel.app",
    "https://schoolnet-snowy.vercel.app.evil.example",
    undefined,
  ]) {
    assert.equal(canWriteSchoolClassesFromRuntime(
      origin, SCHOOLNET_MAIN_SUPABASE_URL, true,
    ), false);
  }
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, false,
  ), false);
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN, "https://another-project.supabase.co", true,
  ), false);
});

test("S3-B 02 - politique fail closed, reutilise celle de S2-B", async () => {
  const source = await read("../src/features/schools/lib/schoolStudentWritePolicy.ts");
  assert.match(source, /canWriteSchoolClassesFromRuntime/);
  assert.match(source, /typeof window === "undefined"/);
  assert.match(source, /import\.meta\.env\.PROD/);
  assert.match(source, /SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE/);
});

test("S3-B 03 - API refuse toutes les mutations avant PostgREST", async () => {
  const source = await read("../src/features/schools/lib/schoolStudentsApi.ts");
  assert.match(source, /schoolnet_school_student_roster/);
  assert.match(source, /schoolnet_school_student_attach/);
  assert.match(source, /schoolnet_school_student_set_active/);
  assert.equal((source.match(/if \(areSchoolStudentsReadOnly\(\)\)/g) ?? []).length, 2);
  const firstGuard = source.indexOf("if (areSchoolStudentsReadOnly())");
  const firstRpc = source.indexOf('supabase.rpc("schoolnet_school_student_attach"');
  assert.ok(firstGuard !== -1 && firstGuard < firstRpc);
  assert.doesNotMatch(source, /\.from\(["']profiles["']\)/);
  assert.doesNotMatch(source, /\.from\(["']schoolnet_school_memberships["']\)/);
  assert.doesNotMatch(source, /\.from\(["']auth\.users["']\)/);
});

test("S3-B 04 - route et menu reserves a school_admin", async () => {
  const router = await read("../src/routes/router.tsx");
  const nav = await read("../src/layouts/DashboardLayout.tsx");
  assert.match(router, /allowed=\{\["school_admin"\]\}/);
  assert.match(router, /school\/students/);
  assert.match(router, /<LocalSchoolStudents \/>/);
  assert.match(nav, /\/app\/school\/students/);
});

test("S3-B 05 - interface en lecture seule avant activation", async () => {
  const page = await read("../src/features/schools/pages/LocalSchoolStudents.tsx");
  assert.match(page, /Prévisualisation SCHOOLNET — lecture seule/);
  assert.match(page, /S3-B — Activation du module en attente/);
  assert.match(page, /readOnlyPreview \|\| !ready/);
  assert.match(page, /!readOnlyPreview && !isDemo/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /Aucun élève rattaché/);
});

test("S3-B 06 - recherche, statut et parcours sans email personnel", async () => {
  const page = await read("../src/features/schools/pages/LocalSchoolStudents.tsx");
  assert.match(page, /type StatusFilter = "all" \| "active" \| "revoked"/);
  assert.match(page, /établissement/);
  assert.match(page, /student-search/);
  assert.match(page, /student-status-filter/);
  assert.match(page, /student\.email \?\?/);
  assert.match(page, /N'utilisez jamais l'adresse technique/);
  assert.match(page, /sans affectation à une classe/);
});

test("S3-B 07 - SQL refuse le hors ecole et les origines non officielles", async () => {
  const sql = await read("../supabase/proposals/s3b_school_students_roster_and_memberships.sql");
  assert.match(sql, /schoolnet_private\.is_school_admin_for\(p_school_id\)/);
  assert.match(sql, /\(SELECT public\.get_my_role\(\)\)::text IS DISTINCT FROM 'school_admin'/);
  assert.match(sql, /auth\.uid\(\) IS NULL/);
  assert.match(sql, /current_setting\('request\.headers',true\)/);
  assert.match(sql, /IS DISTINCT FROM 'https:\/\/schoolnet-snowy\.vercel\.app'/);
  assert.match(sql, /m\.school_id=p_school_id/);
  assert.match(sql, /m\.member_role='student'/);
});

test("S3-B 08 - SQL exclut l'e-mail technique sans-email", async () => {
  const sql = await read("../supabase/proposals/s3b_school_students_roster_and_memberships.sql");
  assert.match(sql, /schoolnet_student_no_email_requests/);
  assert.match(sql, /r\.student_auth_user_id=p\.id/);
  assert.match(sql, /r\.student_auth_user_id=m\.user_id/);
  assert.match(sql, /THEN NULL ELSE u\.email END/);
  assert.match(sql, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(sql, /NOT COALESCE\(u\.is_anonymous,false\)/);
  assert.match(sql, /u\.deleted_at IS NULL/);
  assert.doesNotMatch(sql, /INSERT INTO auth\.users|auth\.admin\.createUser/i);
});

test("S3-B 09 - RPC non executees par anon, pas de droit direct sur memberships", async () => {
  const sql = await read("../supabase/proposals/s3b_school_students_roster_and_memberships.sql");
  for (const name of [
    "roster", "attach", "set_active",
  ]) {
    assert.ok(sql.includes("CREATE FUNCTION public.schoolnet_school_student_" + name));
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public.schoolnet_school_student_" + name));
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public.schoolnet_school_student_" + name));
  }
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE) ON public\.schoolnet_school_memberships/i);
});

test("S3-B 10 - aucune modification directe des dossiers pedagogiques ni familiaux", async () => {
  const sql = await read("../supabase/proposals/s3b_school_students_roster_and_memberships.sql");
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:profiles|class_students|student_enrollments|classes|parent_student_links|course_enrollments)/i);
  assert.match(sql, /INSERT INTO public\.schoolnet_school_memberships/);
  assert.match(sql, /INSERT INTO public\.schoolnet_school_audit/);
});

test("S3-B 11 - recette reversible, pas de migration permanente", async () => {
  const check = await read("../supabase/verification/20261117_s3b_school_student_membership_rollback.sql");
  assert.match(check, /NE JAMAIS COMMIT/);
  assert.match(check, /S3B_EMAIL_STUDENT_CROSS_SCHOOL_ROSTER_REVOKE_AUDIT_NOEMAIL_ROLLBACK_PASS/);
  assert.match(check, /v_technical_blocked/);
  assert.match(check, /v_cross_read/);
  assert.match(check, /v_preview/);
  assert.doesNotMatch(check, /^\s*COMMIT\s*;/im);
  assert.equal(existsSync(
    new URL("../supabase/migrations/20261117_s3b_school_students_roster_and_memberships.sql", import.meta.url),
  ), false);
});
