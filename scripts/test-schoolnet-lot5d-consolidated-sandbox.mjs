// SCHOOLNET 5D-A+B - controle STATIQUE hors reseau (ce n'est pas une recette PostgreSQL).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sqlPath = "../supabase/proposals/20261118_schoolnet_lot5d_ab_consolidated_SANDBOX_ONLY.sql";
const fixturePath = "./lot5d/fixture_postgresql17.sql";
const recipePath = "./lot5d/test_consolidated_postgresql17.sql";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("5D-C 01 - migration candidate isolee, non installable automatiquement", async () => {
  const s = await read(sqlPath);
  assert.match(s,/CANDIDAT SQL DE RECETTE ISOLEE/);
  assert.match(s,/NON APPROUVE POUR LA PRODUCTION/);
  assert.match(s,/NE PAS PLACER DANS supabase\/migrations/);
  assert.match(s,/^BEGIN;/m);
  assert.match(s,/^COMMIT;/m);
  assert.doesNotMatch(sqlPath,/supabase\/migrations/);
});

test("5D-C 02 - schema et RPC preexistants obligatoires", async () => {
  const s = await read(sqlPath);
  assert.match(s,/to_regprocedure\('public\.admin_set_current_school_year\(uuid\)'\)/);
  assert.match(s,/to_regnamespace\('schoolnet_private'\)/);
  assert.match(s,/to_regclass\('public\.student_enrollments'\)/);
  assert.match(s,/schoolnet_school_student_class_assignments/);
  assert.match(s,/schoolnet_school_teacher_subject_assignments/);
});

test("5D-C 03 - changement direct neutralise meme pour admin", async () => {
  const s = await read(sqlPath);
  assert.match(s,/CREATE OR REPLACE FUNCTION public\.admin_set_current_school_year/);
  assert.match(s,/activation directe des annees interdite/);
  assert.match(s,/trg_lot5d_year_switch_guard/);
  assert.match(s,/trg_lot5d_year_insert_guard/);
  assert.match(s,/trg_lot5d_year_delete_guard/);
  assert.doesNotMatch(s,/set_config\('schoolnet\.rollover_authorized'/i);
});

test("5D-C 04 - jeton prive lie a la transaction et revocation clients", async () => {
  const s = await read(sqlPath);
  assert.match(s,/lot5d_year_switch_permits/);
  assert.match(s,/tx_id=pg_catalog\.txid_current\(\)/);
  assert.match(s,/REVOKE ALL ON TABLE schoolnet_private\.lot5d_year_switch_permits/);
  assert.match(s,/REVOKE ALL ON FUNCTION schoolnet_private\.guard_lot5d_year_switch/);
  assert.match(s,/FROM PUBLIC,anon,authenticated,service_role/);
  assert.doesNotMatch(s,/GRANT EXECUTE ON FUNCTION schoolnet_private/i);
});

test("5D-C 05 - controle d'identite et fonction de finalisation non exposee", async () => {
  const s = await read(sqlPath);
  assert.match(s,/p_actor IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(s,/NOT public\.is_admin\(\)/);
  assert.match(s,/CREATE FUNCTION schoolnet_private\.finalize_lot5d_legacy_year/);
  assert.match(s,/has_function_privilege\('authenticated'/);
  assert.match(s,/has_function_privilege\('service_role'/);
});

test("5D-C 06 - verrouillage et preflight reevalues en transaction", async () => {
  const s = await read(sqlPath);
  assert.match(s,/LOCK TABLE public\.school_years/);
  assert.match(s,/IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(s,/set_config\('lock_timeout','3s',true\)/);
  assert.match(s,/source_year_id=p_source AND target_year_id=p_target/);
  assert.match(s,/v_ready<>v_total/);
});

test("5D-C 07 - cible deja occupee = refus quel que soit le statut", async () => {
  const s = await read(sqlPath);
  assert.match(s,/IF EXISTS\(SELECT 1 FROM public\.student_enrollments WHERE school_year_id=p_target\)/);
  assert.match(s,/annee cible deja occupee/);
  assert.doesNotMatch(s,/ON CONFLICT\s*\(student_id,school_year_id\)\s*DO UPDATE/i);
});

test("5D-C 08 - S3-C hors passage global legacy et pas de mutation officielle", async () => {
  const s = await read(sqlPath);
  assert.match(s,/classes et affectations officielles S3-C hors perimetre/);
  assert.match(s,/c\.school_id IS NOT NULL OR c\.learning_context='school'/);
  assert.doesNotMatch(s,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.schoolnet_school_/i);
});

test("5D-C 09 - historique d'inscriptions, parents et journaux preservables", async () => {
  const s = await read(sqlPath);
  assert.match(s,/school_year_rollover_audit/);
  assert.match(s,/school_year_rollover_runs/);
  assert.match(s,/trg_lot5d_audit_immutable/);
  assert.match(s,/trg_lot5d_runs_immutable/);
  assert.match(s,/deux journaux finaux sont append-only/);
  assert.doesNotMatch(s,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.parent_links/i);
});

test("5D-C 10 - idempotence par operation et controle post-traitement", async () => {
  const s = await read(sqlPath);
  assert.match(s,/operation_id uuid NOT NULL UNIQUE/);
  assert.match(s,/v_run\.operation_id<>p_operation_id/);
  assert.match(s,/already_finalized',true/);
  assert.match(s,/verification transactionnelle finale refusee/);
});

test("5D-C 11 - fixtures SQL 100% fictives et script de recette en ROLLBACK", async () => {
  const fixture = await read(fixturePath);
  const recipe = await read(recipePath);
  assert.match(fixture,/SCHEMA SYNTHETIQUE PostgreSQL 17/);
  assert.match(fixture,/CREATE SCHEMA auth/);
  assert.match(recipe,/TEST D'INTEGRATION SQL - POSTGRES 17 JETABLE/);
  assert.match(recipe,/^BEGIN;/m);
  assert.match(recipe,/^ROLLBACK;/m);
  assert.match(recipe,/fixture-injected-rollback/);
  assert.match(recipe,/rejouement non idempotent/);
  assert.match(recipe,/autre apprenant actif en cible = STOP/);
  assert.match(recipe,/role apprenant peut enregistrer/);
});

test("5D-C 12 - isolation CI sans secret Supabase ni action de deploiement", async () => {
  const yml = await read("../.github/workflows/schoolnet-quality.yml");
  assert.match(yml,/name: Test 5D-A\+B sur PostgreSQL 17 jetable/);
  assert.match(yml,/postgres:17-alpine/);
  assert.match(yml,/schoolnet_lot5d_ci/);
  assert.match(yml,/psql -v ON_ERROR_STOP=1/);
  assert.doesNotMatch(yml,/supabase db push|supabase migration up|vercel --prod/i);
});
