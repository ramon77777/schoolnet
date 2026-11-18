// SCHOOLNET - Lot 5D-A : tests hors reseau, sans ecriture Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("5D-A 01 - gate refuse sans activation explicite, meme en production", async () => {
  const gate = await read("../src/features/enrollments/lib/schoolYearRolloverWritePolicy.ts");
  assert.match(gate, /explicitWriteFlag === "true"/);
  assert.match(gate, /isProductionBuild === true/);
  assert.match(gate, /origin === SCHOOLNET_MAIN_APP_ORIGIN/);
  assert.match(gate, /supabaseUrl === SCHOOLNET_MAIN_SUPABASE_URL/);
  assert.match(gate, /if \(typeof window === "undefined"\) return true/);
  assert.match(gate, /VITE_SCHOOLNET_LOT5D_WRITES_ENABLED/);
  assert.match(gate, /VITE_SUPABASE_URL/);
});

test("5D-A 02 - la source des origines officielles reste unique", async () => {
  const gate = await read("../src/features/enrollments/lib/schoolYearRolloverWritePolicy.ts");
  const existing = await read("../src/features/schools/lib/schoolClassWritePolicy.ts");
  assert.match(gate, /from "@\/features\/schools\/lib\/schoolClassWritePolicy"/);
  assert.match(existing, /SCHOOLNET_MAIN_APP_ORIGIN/);
  assert.match(existing, /SCHOOLNET_MAIN_SUPABASE_URL/);
  assert.doesNotMatch(gate, /https:\/\/[^"'\s]+/);
});

test("5D-A 03 - API bloque les deux RPC d'ecriture avant le reseau", async () => {
  const api = await read("../src/features/enrollments/lib/schoolYearRolloverApi.ts");
  const save = api.indexOf("export async function saveRolloverDecision");
  const finish = api.indexOf("export async function finalizeSchoolYearRollover");
  assert.ok(save >= 0 && finish > save);
  const saveGuard = api.indexOf("areSchoolYearRolloverWritesBlocked()", save);
  const saveRpc = api.indexOf('supabase.rpc("admin_save_school_year_rollover_decision"', save);
  const finishGuard = api.indexOf("areSchoolYearRolloverWritesBlocked()", finish);
  const finishRpc = api.indexOf('supabase.rpc("admin_finalize_school_year_rollover"', finish);
  assert.ok(saveGuard > save && saveGuard < saveRpc);
  assert.ok(finishGuard > finish && finishGuard < finishRpc);
  assert.match(api, /SCHOOLNET_YEAR_ROLLOVER_READ_ONLY_MESSAGE/);
});

test("5D-A 04 - l'Admin ne peut plus activer l'annee directement", async () => {
  const ui = await read("../src/features/admin/pages/AdminSchoolYears.tsx");
  assert.doesNotMatch(ui, /admin_set_current_school_year/);
  assert.doesNotMatch(ui, /setCurrentYear\(/);
  assert.match(ui, /Activation via passage d'annee/);
  assert.match(ui, /to="\/app\/admin\/year-rollover"/);
  assert.match(ui, /Activation directe/);
});

test("5D-A 05 - catalogue conserve les references du tenant et du contexte", async () => {
  const api = await read("../src/features/enrollments/lib/adminEnrollmentsApi.ts");
  assert.match(api, /school_id: string \| null/);
  assert.match(api, /learning_context: string \| null/);
  assert.match(api, /\.select\("id, name, school_year_id, school_year, school_id, learning_context"\)/);
});

test("5D-A 06 - aucun choix de classe officielle S3-C dans le legacy", async () => {
  const ui = await read("../src/features/admin/pages/AdminYearRollover.tsx");
  assert.match(ui, /item\.school_id === null && item\.learning_context !== "school"/);
  assert.match(ui, /officialClasses\.length > 0/);
  assert.match(ui, /nonLegacySource\.length > 0/);
  assert.match(ui, /readOnlyRuntime \|\| migrationPending/);
  assert.match(ui, /!readOnlyRuntime && !migrationPending/);
  assert.match(ui, /Lot 5D-A — preparation en lecture seule/);
});

test("5D-A 07 - migration SQL reservee aux propositions, jamais installable automatiquement", async () => {
  const sql = await read("../supabase/proposals/20261118_schoolnet_lot5d_a_guard_REVIEW_ONLY.sql");
  assert.match(sql, /REVIEW ONLY/);
  assert.match(sql, /NE PAS EXECUTER/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /LOCK_TIMEOUT|lock_timeout/);
  assert.match(sql, /guard_lot5da_direct_year_switch/);
  assert.match(sql, /CREATE TRIGGER trg_schoolnet_lot5da_block_direct_year_switch/);
  assert.match(sql, /REVOKE ALL ON FUNCTION schoolnet_private/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO) public\.student_enrollments/i);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|INSERT INTO) public\.schoolnet_school_/i);
});

test("5D-A 08 - SQL protege dossiers annuels et affectations par etablissement", async () => {
  const sql = await read("../supabase/proposals/20261118_schoolnet_lot5d_a_guard_REVIEW_ONLY.sql");
  for (const table of [
    "student_enrollments",
    "class_students",
    "class_teachers",
    "schoolnet_school_student_class_assignments",
    "schoolnet_school_teacher_subject_assignments",
  ]) assert.ok(sql.includes("FROM public." + table), table);
  assert.match(sql, /classes WHERE school_id IS NOT NULL/);
  assert.match(sql, /BEFORE UPDATE OF is_current ON public\.school_years/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /ERRCODE='42501'/);
});

test("5D-A 09 - aucun code de validation 5D ne modifie les dossiers historiques", async () => {
  const page = await read("../src/features/admin/pages/AdminYearRollover.tsx");
  const api = await read("../src/features/enrollments/lib/schoolYearRolloverApi.ts");
  assert.doesNotMatch(page, /\.from\("student_enrollments"\)\.update/);
  assert.doesNotMatch(page, /\.from\("school_years"\)\.update/);
  assert.doesNotMatch(api, /\.from\("school_years"\)\.update/);
  assert.match(page, /Les dossiers historiques restent inchangés pendant la préparation/);
});
