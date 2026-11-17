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

test("S3-A 01 - ecriture reservee au domaine et projet principal", () => {
  assert.equal(canWriteSchoolClassesFromRuntime(
    SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, true,
  ), true);
  for (const origin of [
    "http://localhost:5173",
    "https://schoolnet-s3a-preview.vercel.app",
    "https://schoolnet-snowy.vercel.app.evil.example",
    undefined,
  ]) {
    assert.equal(canWriteSchoolClassesFromRuntime(
      origin, SCHOOLNET_MAIN_SUPABASE_URL, true,
    ), false);
  }
});

test("S3-A 02 - garde-fou S3-A fail closed et reutilisation de la politique S2-B", async () => {
  const source = await read("../src/features/schools/lib/schoolTeacherWritePolicy.ts");
  assert.match(source, /canWriteSchoolClassesFromRuntime/);
  assert.match(source, /typeof window === "undefined"/);
  assert.match(source, /import\.meta\.env\.PROD/);
  assert.match(source, /SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE/);
});

test("S3-A 03 - API refuse les mutations avant l'appel RPC", async () => {
  const source = await read("../src/features/schools/lib/schoolTeachersApi.ts");
  assert.match(source, /schoolnet_school_teacher_roster/);
  assert.match(source, /schoolnet_school_teacher_attach/);
  assert.match(source, /schoolnet_school_teacher_set_active/);
  assert.equal((source.match(/if \(areSchoolTeachersReadOnly\(\)\)/g) ?? []).length, 2);
  const guard = source.indexOf("if (areSchoolTeachersReadOnly())");
  const rpc = source.indexOf('supabase.rpc("schoolnet_school_teacher_attach"');
  assert.ok(guard !== -1 && rpc > guard);
  assert.doesNotMatch(source, /\.from\(["']profiles["']\)/);
  assert.doesNotMatch(source, /\.from\(["']schoolnet_school_memberships["']\)/);
});

test("S3-A 04 - route exclusivement school_admin et navigation locale", async () => {
  const router = await read("../src/routes/router.tsx");
  const navigation = await read("../src/layouts/DashboardLayout.tsx");
  assert.match(router, /allowed=\{\["school_admin"\]\}/);
  assert.match(router, /school\/teachers/);
  assert.match(router, /<LocalSchoolTeachers \/>/);
  assert.match(navigation, /\/app\/school\/teachers/);
});

test("S3-A 05 - formulaire, confirmation et lecture seule Preview", async () => {
  const page = await read("../src/features/schools/pages/LocalSchoolTeachers.tsx");
  assert.match(page, /Prévisualisation SCHOOLNET — lecture seule/);
  assert.match(page, /S3-A — Répertoire momentanément indisponible/);
  assert.match(page, /readOnlyPreview \|\| !ready/);
  assert.match(page, /!readOnlyPreview && !isDemo/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /Aucun enseignant rattaché/);
});

test("S3-A 06 - SQL isole les ecoles et refuse les origines non officielles", async () => {
  const sql = await read("../supabase/proposals/s3a_school_teachers_roster_and_memberships.sql");
  assert.match(sql, /schoolnet_private\.is_school_admin_for\(p_school_id\)/);
  assert.match(sql, /\(SELECT public\.get_my_role\(\)\)::text IS DISTINCT FROM 'school_admin'/);
  assert.match(sql, /auth\.uid\(\) IS NULL/);
  assert.match(sql, /current_setting\('request\.headers',true\)/);
  assert.match(sql, /IS DISTINCT FROM 'https:\/\/schoolnet-snowy\.vercel\.app'/);
  assert.match(sql, /JOIN auth\.users/);
  assert.match(sql, /u\.email_confirmed_at IS NOT NULL/);
  assert.match(sql, /school_teacher_reactivated/);
  assert.match(sql, /school_teacher_revoked/);
  assert.doesNotMatch(sql, /GRANT (INSERT|UPDATE|DELETE) ON public\.schoolnet_school_memberships/i);
  assert.doesNotMatch(sql, /auth\.admin\.createUser|INSERT INTO auth\.users/i);
});

test("S3-A 07 - roles anon exclus et facade SECURITY INVOKER", async () => {
  const sql = await read("../supabase/proposals/s3a_school_teachers_roster_and_memberships.sql");
  assert.match(sql, /CREATE FUNCTION public\.schoolnet_school_teacher_roster/);
  assert.match(sql, /CREATE FUNCTION public\.schoolnet_school_teacher_attach/);
  assert.match(sql, /CREATE FUNCTION public\.schoolnet_school_teacher_set_active/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.schoolnet_school_teacher_roster/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.schoolnet_school_teacher_attach/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.schoolnet_school_teacher_set_active/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.schoolnet_school_teacher_attach/);
  assert.match(sql, /SECURITY INVOKER/);
  assert.match(sql, /SECURITY DEFINER/);
});

test("S3-A 08 - recette reversible et aucune migration permanente", async () => {
  const check = await read("../supabase/verification/20261117_s3a_school_teacher_membership_rollback.sql");
  assert.match(check, /NE JAMAIS COMMIT/);
  assert.match(check, /S3A_CROSS_SCHOOL_ATTACH_REVOKE_REACTIVATE_AUDIT_PREVIEW_ROLLBACK_PASS/);
  assert.match(check, /v_other_blocked/);
  assert.match(check, /v_preview_blocked/);
  assert.doesNotMatch(check, /\bCOMMIT\s*;/i);
  const canonical = new URL("../supabase/migrations/20261117155641_schoolnet_s3a_school_teachers_roster_and_memberships.sql", import.meta.url);
  assert.equal(existsSync(canonical), true);
  const canonSql = await read("../supabase/migrations/20261117155641_schoolnet_s3a_school_teachers_roster_and_memberships.sql");
  assert.match(canonSql, /migration canonique DEJA INSTALLEE/);
  assert.match(canonSql, /DO \$verify_s3a\$/);
});
