import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {periodKindFromCode,periodPrefix,previewNextPeriodCode,suggestedPeriodName}
 from "../src/features/schools/lib/schoolGradePeriodCodes.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const sql=read("supabase/proposals/s4c3a1_automatic_period_codes.sql");
const rollback=read("supabase/verification/s4c3a1_automatic_period_codes_rollback_manual.sql");
const ui=read("src/features/schools/pages/LocalSchoolGradeConfiguration.tsx");
const api=read("src/features/schools/lib/schoolGradeConfigurationApi.ts");
const fixture=read("tests/s4c3a-tenant-ci/fixtures/periods-a-b.sql");

test("C3-A.1: type et code proposes se deduisent des lignes du meme annee",()=>{
 const year2026=[{code:"T1"},{code:"S1"},{code:"P01"}];
 assert.equal(previewNextPeriodCode(year2026,"trimester"),"T2");
 assert.equal(previewNextPeriodCode(year2026,"semester"),"S2");
 assert.equal(previewNextPeriodCode(year2026,"custom"),"P02");
 assert.equal(previewNextPeriodCode([],"trimester"),"T1");
 assert.equal(previewNextPeriodCode([],"custom"),"P01");
 assert.equal(periodPrefix("trimester"),"T");
 assert.equal(periodPrefix("semester"),"S");
 assert.equal(periodPrefix("custom"),"P");
 assert.equal(periodKindFromCode("T1"),"trimester");
 assert.equal(periodKindFromCode("S2"),"semester");
 assert.equal(periodKindFromCode("M1"),"custom");
});
test("C3-A.1: plafonds et noms pedagogiques restent previsibles",()=>{
 assert.equal(previewNextPeriodCode([{code:"T1"},{code:"T2"}],"trimester"),"T3");
 assert.equal(previewNextPeriodCode([{code:"T3"}],"trimester"),null);
 assert.equal(previewNextPeriodCode([{code:"S2"}],"semester"),null);
 assert.equal(previewNextPeriodCode([{code:"P99"}],"custom"),"P100");
 assert.equal(previewNextPeriodCode([{code:"P9999"}],"custom"),null);
 assert.equal(suggestedPeriodName("trimester","T2"),"Deuxième trimestre");
 assert.equal(suggestedPeriodName("semester","S1"),"Premier semestre");
 assert.equal(suggestedPeriodName("custom","P01"),"Période personnalisée 1");
});
test("C3-A.1: code en lecture seule dans UI, type transmis a la RPC",()=>{
 assert.match(ui,/Type de période/);
 assert.match(ui,/Code automatique/);
 assert.match(ui,/readOnly aria-label="Code automatique"/);
 assert.match(ui,/previewNextPeriodCode\(periods,periodDraft\.kind\)/);
 assert.doesNotMatch(ui,/periodDraft\.code/);
 assert.match(api,/isSchoolPeriodKind\(input\.periodKind\)/);
 assert.match(api,/p_code:periodPrefix\(input\.periodKind\)/);
 assert.doesNotMatch(api,/\.from\(|\.insert\(|\.update\(|\.delete\(/);
});
test("C3-A.1: SQL attribue le code sous verrou et conserve le code a l'edition",()=>{
 for(const marker of [
  "schoolnet_private.assert_s3c_access(p_school_id,true)",
  "WHERE s.id=p_school_id AND s.status='active' FOR UPDATE",
  "p.school_id=p_school_id AND p.school_year_id=p_school_year_id",
  "v_code:=v_old.code",
  "S4C3A1_INVALID_KIND","S4C3A1_KIND_EXHAUSTED",
  "S4C3A_PERIOD_OVERLAP","S4C3A_PERIOD_LOCKED",
  "btrim(COALESCE(p_name,''), E' \\t\\n\\r')",
  "CREATE OR REPLACE FUNCTION schoolnet_private.school_upsert_grading_period"
 ])assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/\bDROP TABLE\b|\bTRUNCATE\b|\bUPDATE\s+public\.|\bINSERT\s+INTO\s+public\./i);
 assert.match(rollback,/S4C3A1_ROLLBACK_READY/);
 assert.doesNotMatch(rollback,/\bDROP TABLE\b|\bTRUNCATE\b/);
 for(const proof of [
  "C3A1_PASS_AUTO_SEQUENCE_AND_TRIM","C3A1_PASS_CODE_IMMUTABLE",
  "C3A1_PASS_TYPES_TRIMESTER_SEMESTER_CUSTOM",
  "C3A1_PASS_TRIMESTER_LIMIT","C3A1_PASS_FREE_CODE_DENIED",
 ])assert.ok(fixture.includes(proof),proof);
});
