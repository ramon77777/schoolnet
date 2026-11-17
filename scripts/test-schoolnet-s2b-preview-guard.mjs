import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  canWriteSchoolClassesFromRuntime,
  areSchoolClassesReadOnly,
  SCHOOLNET_MAIN_APP_ORIGIN,
  SCHOOLNET_MAIN_SUPABASE_URL,
} from "../src/features/schools/lib/schoolClassWritePolicy.ts";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("S2-B 01 - domain + Supabase principal + build production obligatoires", () => {
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, true,
    ),
    true,
  );
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, SCHOOLNET_MAIN_SUPABASE_URL, false,
    ),
    false,
  );
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, undefined, true,
    ),
    false,
  );
  assert.equal(
    canWriteSchoolClassesFromRuntime(
      SCHOOLNET_MAIN_APP_ORIGIN, "https://sandbox.supabase.co", true,
    ),
    false,
  );
});

test("S2-B 02 - Vercel Preview, localhost, protocoles et sous-domaines bloques", () => {
  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://schoolnet-git-s2b-preview.vercel.app",
    "https://schoolnet-snowy.vercel.app.evil.example",
    "https://schoolnet-snowy.vercel.app.",
    "http://schoolnet-snowy.vercel.app",
    "",
    undefined,
  ]) {
    assert.equal(
      canWriteSchoolClassesFromRuntime(origin, SCHOOLNET_MAIN_SUPABASE_URL, true),
      false,
      `Une origine non officielle a ete autorisee : ${origin}`,
    );
  }
});

test("S2-B 03 - le mode hors navigateur reste en lecture seule", () => {
  assert.equal(areSchoolClassesReadOnly(), true);
});

test("S2-B 04 - l'API refuse AVANT d'appeler la RPC de creation", async () => {
  const source = await read("../src/features/schools/lib/schoolClassesApi.ts");
  const guard = source.indexOf("if (areSchoolClassesReadOnly())");
  const rpc = source.indexOf('supabase.rpc("schoolnet_school_create_class"');
  assert.ok(guard > 0 && rpc > guard, "Le garde-fou doit preceder l'appel RPC.");
  assert.match(source, /SCHOOL_CLASS_PREVIEW_READ_ONLY_MESSAGE/);
});

test("S2-B 05 - le formulaire refuse les soumissions dans les previews", async () => {
  const source = await read("../src/features/schools/pages/LocalSchoolClasses.tsx");
  assert.match(source, /!readOnlyPreview &&/);
  assert.match(source, /if \(!canSave \|\| readOnlyPreview/);
  assert.match(source, /Prévisualisation SCHOOLNET — lecture seule/);
  assert.match(source, /S2-B est installé sur Supabase principal/);
  assert.doesNotMatch(source, /les protections S2-A et les\s+fonctions S2-B n'ont pas encore été activées/);
});

test("S2-B 06 - les droits d'ecole restent controles en SQL", async () => {
  const source = await read("../supabase/proposals/s2b_school_class_rpc_and_catalog.sql");
  assert.match(source, /schoolnet_private\.is_school_admin_for\(p_school_id\)/);
  assert.match(source, /\(SELECT public\.get_my_role\(\)\)::text IS DISTINCT FROM 'school_admin'/);
  assert.match(source, /auth\.uid\(\) IS NULL/);
  assert.match(source, /current_setting\('request\.headers',true\)/);
  assert.match(source, /IS DISTINCT FROM 'https:\/\/schoolnet-snowy\.vercel\.app'/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.schoolnet_school_create_class/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.schoolnet_school_create_class/);
});

test("S2-B 07 - la recette SQL nie la creation Preview / origine manquante", async () => {
  const source = await read("../supabase/verification/20261110_s2b_school_class_rpc_rollback.sql");
  assert.match(source, /v_preview_origin_blocked/);
  assert.match(source, /v_missing_origin_blocked/);
  assert.match(source, /v_subdomain_origin_blocked/);
  assert.match(source, /S2-A EST DEJA INSTALLEE/);
  assert.doesNotMatch(source, /<SQL S2-A>/);
});
