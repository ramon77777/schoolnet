// SCHOOLNET 5D-B - Diagnostic pur et hors reseau, sans mutation Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectSchoolYearRolloverSnapshot } from "../src/features/enrollments/lib/schoolYearRolloverPreflight.ts";

const SOURCE = "y25";
const TARGET = "y26";
const YEAR_NEXT = "y27";
const years = Object.freeze([
  { id: SOURCE, name: "2025-2026", starts_on: "2025-09-01", is_current: true },
  { id: TARGET, name: "2026-2027", starts_on: "2026-09-01", is_current: false },
  { id: YEAR_NEXT, name: "2027-2028", starts_on: "2027-09-01", is_current: false },
]);
const classes = Object.freeze([
  { id:"c25", school_id: null, learning_context:"legacy_unclassified",
    school_year_id: SOURCE, school_year:"2025-2026" },
  { id:"c26", school_id: null, learning_context:"legacy_unclassified",
    school_year_id: TARGET, school_year:"2026-2027" },
]);
const sourceRow = Object.freeze({
  enrollment_id: "e25", student_id: "studentA", school_year_id: SOURCE,
  class_id: "c25", status: "active",
});

function inspect(partial = {}) {
  return inspectSchoolYearRolloverSnapshot({
    years,
    classes,
    enrollments: [sourceRow],
    sourceYearId: SOURCE,
    targetYearId: TARGET,
    ...partial,
  });
}
function has(result, code) { return result.issues.some((issue) => issue.code === code); }

test("5D-B 01 — une lecture conforme n'autorise jamais la transaction", () => {
  const result = inspect();
  assert.deepEqual(result.issues, []);
  assert.equal(result.requiresServerValidation, true);
  assert.equal(result.sourceActive, 1);
  assert.equal(result.targetExisting, 0);
});
test("5D-B 02 — un dossier actif dans l'annee cible bloque la bascule", () => {
  const result = inspect({ enrollments: [
    sourceRow, { ...sourceRow, enrollment_id:"e26", school_year_id:TARGET,
      class_id:"c26", status:"active" },
  ] });
  assert.equal(result.targetActiveOrCompleted, 1);
  assert.equal(has(result, "TARGET_ACTIVE_OR_COMPLETED"), true);
});
test("5D-B 03 — un dossier termine cible bloque aussi la bascule", () => {
  const result = inspect({ enrollments: [
    sourceRow, { ...sourceRow, enrollment_id:"closed26", school_year_id:TARGET,
      class_id:"c26", status:"completed" },
  ] });
  assert.equal(has(result, "TARGET_ACTIVE_OR_COMPLETED"), true);
});
test("5D-B 04 — un brouillon cible exige la recette SQL, n'est pas dit finalise", () => {
  const result = inspect({ enrollments: [
    sourceRow, { ...sourceRow, enrollment_id:"draft26", school_year_id:TARGET,
      class_id:"c26", status:"draft" },
  ] });
  assert.equal(result.targetExisting, 1);
  assert.equal(result.targetActiveOrCompleted, 0);
  assert.equal(result.requiresServerValidation, true);
  assert.equal(has(result, "TARGET_ACTIVE_OR_COMPLETED"), false);
});
test("5D-B 05 — deux annees courantes constituent une anomalie", () => {
  const result = inspect({ years: years.map(x => x.id === TARGET ? {...x,is_current:true} : x) });
  assert.equal(has(result,"CURRENT_YEAR_NOT_UNIQUE"), true);
});
test("5D-B 06 — l'annee source doit etre l'annee courante", () => {
  const result = inspect({ sourceYearId: YEAR_NEXT });
  assert.equal(has(result,"SOURCE_NOT_CURRENT"), true);
});
test("5D-B 07 — une destination antechronique ou identique est refusee", () => {
  assert.equal(has(inspect({ targetYearId: SOURCE }),"TARGET_NOT_LATER"), true);
  assert.equal(has(inspect({ targetYearId: "unknown" }),"TARGET_NOT_LATER"), true);
});
test("5D-B 08 — une source sans dossier actif n'est pas une bascule", () => {
  const result = inspect({ enrollments:[{...sourceRow,status:"completed"}] });
  assert.equal(has(result,"SOURCE_EMPTY"),true);
});
test("5D-B 09 — classe source absente du catalogue implique arret", () => {
  const result = inspect({ classes: [] });
  assert.equal(has(result,"SOURCE_CLASS_MISSING"),true);
});
test("5D-B 10 — dossier actif associe a une classe d'autre annee est rejete", () => {
  const result = inspect({ enrollments:[{...sourceRow,class_id:"c26"}] });
  assert.equal(has(result,"SOURCE_CLASS_WRONG_YEAR"),true);
});
test("5D-B 11 — une classe d'etablissement S2/S3 est hors legacy", () => {
  const official = {...classes[0],id:"official25",school_id:"school-1",learning_context:"school"};
  const result = inspect({classes:[official, classes[1]],enrollments:[{...sourceRow,class_id:"official25"}]});
  assert.equal(has(result,"SOURCE_CLASS_OFFICIAL"),true);
  assert.equal(has(result,"OFFICIAL_CLASS_PRESENT"),true);
  assert.equal(result.sourceClassOutsideLegacy,1);
});
test("5D-B 12 — la presence d'une classe officielle sans dossier bloque la simplification", () => {
  const official = {...classes[1],id:"official26",school_id:"school-1",learning_context:"school"};
  const result = inspect({classes:[...classes,official]});
  assert.equal(has(result,"OFFICIAL_CLASS_PRESENT"),true);
});
test("5D-B 13 — les doublons de dossier actif par apprenant sont identifies", () => {
  const result = inspect({enrollments:[sourceRow,{...sourceRow,enrollment_id:"duplicate"}]});
  assert.equal(has(result,"SOURCE_DUPLICATE_STUDENT"),true);
});
test("5D-B 14 — les donnees d'une autre annee ne sont pas comptees en cible", () => {
  const result = inspect({enrollments:[
    sourceRow,{...sourceRow,enrollment_id:"e27",school_year_id:YEAR_NEXT,status:"active"},
  ]});
  assert.equal(result.targetExisting,0);
  assert.equal(has(result,"TARGET_ACTIVE_OR_COMPLETED"),false);
});
test("5D-B 15 — diagnostics navigateur ne remplacent jamais les droits serveur", async () => {
  const code = await readFile(new URL(
    "../src/features/admin/pages/AdminYearRollover.tsx", import.meta.url), "utf8");
  assert.match(code, /inspectSchoolYearRolloverSnapshot\(/);
  assert.match(code, /readOnlyRuntime \|\| migrationPending/);
  assert.match(code, /!readOnlyRuntime && !migrationPending/);
  assert.match(code, /requiresServerValidation|Les contrôles complets des droits/);
  assert.match(code, /disabled:opacity-40/);
});
test("5D-B 16 — le projet SQL de verification doit rester uniquement SELECT", async () => {
  const sql = await readFile(new URL(
    "../supabase/verification/20261118_schoolnet_lot5db_readonly_preflight.sql",
    import.meta.url), "utf8");
  // Supprime les commentaires avant de controler les commandes SQL.
  const executable = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
  assert.match(executable,/^\s*WITH /i);
  assert.match(executable,/\bSELECT\b/i);
  assert.doesNotMatch(executable,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i);
});
test("5D-B 17 — aucune fonction SQL destructive n'est declaree dans le draft", async () => {
  const draft = await readFile(new URL(
    "../supabase/proposals/20261118_schoolnet_lot5db_TRANSACTION_DRAFT_NOT_INSTALLABLE.sql",
    import.meta.url), "utf8");
  assert.match(draft,/NON INSTALLABLE/);
  assert.match(draft,/read only|lecture seule/i);
  // Un plan transactionnel seulement, toute instruction de migration reste commentee.
  const executable = draft.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("").trim();
  assert.equal(executable, "");
  assert.match(draft,/SELECT FOR UPDATE/);
  assert.match(draft,/idempotence/i);
  assert.match(draft,/tenant/i);
});
