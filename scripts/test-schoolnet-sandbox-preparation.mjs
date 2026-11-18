import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  PRODUCTION_APP_ORIGIN,
  PRODUCTION_SUPABASE_URL,
  REQUIRED_SANDBOX_ENV_KEYS,
  parseSandboxEnv,
  validateSandboxEnvironment,
} from "./lib/schoolnet-sandbox-env.mjs";

const read = async (p) => readFile(new URL(p, import.meta.url), "utf8");
const good = () => ({
  VITE_SCHOOLNET_ENVIRONMENT: "sandbox",
  VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED: "false",
  VITE_SCHOOLNET_SANDBOX_APP_ORIGIN: "https://schoolnet-sandbox.example.com",
  VITE_SCHOOLNET_SANDBOX_PROJECT_REF: "sandboxprojectref123",
  VITE_SUPABASE_URL: "https://sandboxprojectref123.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_" + "A".repeat(32),
});
const invalidWith = (overrides) => validateSandboxEnvironment({ ...good(), ...overrides });

test("SANDBOX 01 - configuration fictive distincte valide en mode bloque", () => {
  assert.equal(validateSandboxEnvironment(good()).valid, true);
});

test("SANDBOX 02 - environnement prod explicite ou mode manquant refuse", () => {
  assert.equal(invalidWith({ VITE_SCHOOLNET_ENVIRONMENT: "production" }).valid, false);
  assert.equal(invalidWith({ VITE_SCHOOLNET_ENVIRONMENT: "" }).valid, false);
});

test("SANDBOX 03 - activation ecritures impossible dans le validateur de preparation", () => {
  for (const flag of ["true", "1", "yes", "", undefined]) {
    assert.equal(invalidWith({ VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED: flag }).valid, false);
  }
});

test("SANDBOX 04 - origine officielle production strictement refusee", () => {
  assert.equal(invalidWith({
    VITE_SCHOOLNET_SANDBOX_APP_ORIGIN: PRODUCTION_APP_ORIGIN,
  }).valid, false);
});

test("SANDBOX 05 - origine preview usurpee, localhost, http, chemin et placeholder refuses", () => {
  for (const origin of [
    "http://localhost:5173",
    "https://schoolnet-snowy.vercel.app.evil.example",
    "http://schoolnet-sandbox.example.com",
    "https://schoolnet-sandbox.example.com/path",
    "https://recette-schoolnet.example.invalid",
    "https://schoolnet-sandbox.example.com:444",
    "https://schoolnet-sandbox.example.com?mode=preview",
  ]) {
    assert.equal(invalidWith({ VITE_SCHOOLNET_SANDBOX_APP_ORIGIN: origin }).valid, false);
  }
});

test("SANDBOX 06 - URL de production Supabase toujours refusee", () => {
  assert.equal(invalidWith({ VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL }).valid, false);
  assert.equal(invalidWith({
    VITE_SCHOOLNET_SANDBOX_PROJECT_REF: "anttmbhaphkhmkoqsofd",
    VITE_SUPABASE_URL: PRODUCTION_SUPABASE_URL,
  }).valid, false);
});

test("SANDBOX 07 - projet different de l'URL et domaine tiers refuses", () => {
  assert.equal(invalidWith({
    VITE_SUPABASE_URL: "https://anotherprojectref123.supabase.co",
  }).valid, false);
  assert.equal(invalidWith({
    VITE_SUPABASE_URL: "https://sandboxprojectref123.supabase.co.attacker.invalid",
  }).valid, false);
});

test("SANDBOX 08 - aucune cle privee ou service_role cote navigateur", () => {
  assert.equal(invalidWith({
    VITE_SUPABASE_ANON_KEY: "sb_secret_" + "B".repeat(36),
  }).valid, false);
  const secretJwt = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
    "FAKE_SIGNATURE",
  ].join(".");
  assert.equal(invalidWith({ VITE_SUPABASE_ANON_KEY: secretJwt }).valid, false);
  assert.equal(invalidWith({
    SUPABASE_SERVICE_ROLE_KEY: "NEVER",
  }).valid, false);
});

test("SANDBOX 09 - doublons et interpolations dans .env refuses", () => {
  const duplicate = parseSandboxEnv(
    "VITE_SUPABASE_URL=https://one.supabase.co\nVITE_SUPABASE_URL=https://two.supabase.co",
  );
  assert.ok(duplicate.issues.includes("DUPLICATE_KEY_VITE_SUPABASE_URL"));
  const dynamic = parseSandboxEnv("VITE_SUPABASE_URL=${SOME_SECRET}");
  assert.ok(dynamic.issues.includes("INTERPOLATION_FORBIDDEN_VITE_SUPABASE_URL"));
});

test("SANDBOX 10 - modèle versionne sans valeurs reelles ni ecritures", async () => {
  const source = await read("../config/schoolnet-sandbox.env.example");
  const parsed = parseSandboxEnv(source);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.env.VITE_SCHOOLNET_ENVIRONMENT, "sandbox");
  assert.equal(parsed.env.VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED, "false");
  assert.equal(validateSandboxEnvironment(parsed.env).valid, false);
  assert.ok(parsed.env.VITE_SUPABASE_URL.includes("REPLACE_WITH"));
  assert.ok(parsed.env.VITE_SCHOOLNET_SANDBOX_APP_ORIGIN.endsWith(".invalid"));
  for (const key of REQUIRED_SANDBOX_ENV_KEYS) assert.ok(Object.hasOwn(parsed.env, key));
});

test("SANDBOX 11 - fichiers .env locaux exclus de Git", async () => {
  const ignore = await read("../.gitignore");
  assert.match(ignore, /^\.env\*/m);
  assert.match(ignore, /supabase\/\.temp\//);
  assert.match(ignore, /^\.vercel$/m);
});

test("SANDBOX 12 - politique officielle existante conservee intacte", async () => {
  const p = await read("../src/features/schools/lib/schoolClassWritePolicy.ts");
  assert.ok(p.includes("SCHOOLNET_MAIN_APP_ORIGIN = " + JSON.stringify(PRODUCTION_APP_ORIGIN)));
  assert.ok(p.includes("SCHOOLNET_MAIN_SUPABASE_URL = " + JSON.stringify(PRODUCTION_SUPABASE_URL)));
  assert.match(p, /origin === SCHOOLNET_MAIN_APP_ORIGIN/);
  assert.match(p, /supabaseUrl === SCHOOLNET_MAIN_SUPABASE_URL/);
  assert.doesNotMatch(p, /VITE_SCHOOLNET_SANDBOX_WRITES_ENABLED/);
});

test("SANDBOX 13 - quatre modules conservent le verrou production", async () => {
  for (const file of [
    "../src/features/schools/lib/schoolTeacherWritePolicy.ts",
    "../src/features/schools/lib/schoolStudentWritePolicy.ts",
    "../src/features/schools/lib/schoolAssignmentWritePolicy.ts",
  ]) {
    const source = await read(file);
    assert.match(source, /canWriteSchoolClassesFromRuntime/);
  }
  const api = await read("../src/lib/supabaseClient.ts");
  assert.match(api, /import\.meta\.env\.VITE_SUPABASE_URL/);
  assert.match(api, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
});

test("SANDBOX 14 - les 6 verrous SQL d'Origin restent officiels", async () => {
  const migrations = [
    ["20261117150838_schoolnet_s2b_school_class_rpc_and_catalog.sql", 1],
    ["20261117155641_schoolnet_s3a_school_teachers_roster_and_memberships.sql", 2],
    ["20261117162853_schoolnet_s3b_school_students_roster_and_memberships.sql", 2],
    ["20261118083254_schoolnet_s3c_class_assignments.sql", 1],
  ];
  for (const [name, expected] of migrations) {
    const sql = await read("../supabase/migrations/" + name);
    const matches = sql.match(/IS DISTINCT FROM 'https:\/\/schoolnet-snowy\.vercel\.app'/g) ?? [];
    assert.equal(matches.length, expected, name);
    assert.doesNotMatch(sql, /VITE_SCHOOLNET_SANDBOX_APP_ORIGIN/);
  }
});

test("SANDBOX 15 - le controleur local ne contacte aucun service", async () => {
  const script = await read("./check-schoolnet-sandbox-env.mjs");
  assert.doesNotMatch(script, /supabase\.rpc|apply_migration|fetch\(|createClient\(|db push|service_role/i);
  assert.match(script, /readFile\(candidate, "utf8"\)/);
  assert.match(script, /ECRITURES DESACTIVEES/);
});

test("SANDBOX 16 - plan deploiement sandbox separe et autorisation future", async () => {
  const doc = await read("../docs/releases/SCHOOLNET_SANDBOX_PREPARATION_2026-11-18.md");
  for (const part of [
    "Supabase distinct", "Vercel distinct", "RLS", "pas de déploiement",
    "autoris", "sans données personnelles", "production inchangée",
  ]) assert.ok(doc.toLowerCase().includes(part.toLowerCase()), part);
});

test("SANDBOX 17 - integration CI hors reseau sans deploy", async () => {
  const pkg = JSON.parse(await read("../package.json"));
  const ci = await read("../.github/workflows/schoolnet-s2b-qa.yml");
  assert.equal(pkg.scripts["qa:sandbox:prepare"],
    "node --test scripts/test-schoolnet-sandbox-preparation.mjs");
  assert.equal(pkg.scripts["sandbox:check"],
    "node scripts/check-schoolnet-sandbox-env.mjs");
  assert.ok(ci.includes("npm run qa:sandbox:prepare"));
  assert.ok(ci.includes("npm run qa:e2e:readiness"));
  assert.doesNotMatch(ci, /vercel deploy|supabase db push|apply_migration/);
});
