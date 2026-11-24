import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isParentOfficialUuid,
  isParentOfficialResult,
  isParentOfficialResults,
  isParentOfficialResultDetail,
  parentOfficialResultUrl,
  parentResultsUrl,
} from "../src/features/parent/lib/parentOfficialResultsModel.ts";

const childA = { childId: "10000000-0000-4000-8000-000000000005", fullName: "Élève A" };
const childB = { childId: "10000000-0000-4000-8000-000000000006", fullName: "Élève B" };
const resultA = {
  childId: childA.childId,
  childName: childA.fullName,
  courseId: "70000000-0000-4000-8000-000000000001",
  assessmentId: "a0000000-0000-4000-8000-000000000001",
  schoolId: "20000000-0000-4000-8000-000000000001",
  schoolName: "École A",
  classId: "50000000-0000-4000-8000-000000000001",
  className: "6e A",
  schoolYear: "2026-2027",
  subjectName: "Mathématiques",
  courseTitle: "Mathématiques A",
  title: "Nombres entiers",
  type: "quiz",
  maxScore: 20,
  score: 20,
  publishedAt: "2026-11-24T08:00:00+00:00",
};
const catalog = (results = [resultA], children = [childA]) => ({ children, results });

test("C1 : catalogue officiel 20/20 sans inscription V1 et états vides valides", () => {
  assert.equal(isParentOfficialResults(catalog()), true);
  assert.equal(isParentOfficialResults(catalog([], [childA])), true);
  assert.equal(isParentOfficialResults(catalog([], [])), true);
});

test("C1 : une même évaluation peut concerner deux enfants liés", () => {
  const siblingResult = { ...resultA, childId: childB.childId, childName: childB.fullName, score: 15 };
  assert.equal(isParentOfficialResults(catalog([resultA, siblingResult], [childA, childB])), true);
});

test("C1 : un résultat d'un enfant absent du catalogue familial est refusé", () => {
  assert.equal(isParentOfficialResults(catalog([resultA], [childB])), false);
  assert.equal(isParentOfficialResults(catalog([resultA], [])), false);
  assert.equal(isParentOfficialResults(catalog([{ ...resultA, childName: "Autre enfant" }])), false);
});

test("C1 : dédoublonnage par enfant et évaluation, enfants uniques", () => {
  assert.equal(isParentOfficialResults(catalog([resultA, { ...resultA }])), false);
  assert.equal(isParentOfficialResults(catalog([resultA, { ...resultA, assessmentId: resultA.assessmentId.toUpperCase() }])), false);
  assert.equal(isParentOfficialResults(catalog([resultA], [childA, { ...childA }])), false);
});

test("C1 : aucun champ de copie ou de correction détaillée dans la liste", () => {
  for (const extra of ["feedback", "questions", "answers", "isCorrect", "fileUrl", "gradedBy", "status"]) {
    assert.equal(isParentOfficialResults(catalog([{ ...resultA, [extra]: "secret" }])), false, extra);
  }
  assert.equal(isParentOfficialResults({ ...catalog(), child_ids: [childA.childId] }), false);
  assert.equal(isParentOfficialResults(catalog([resultA], [{ ...childA, email: "private@example.org" }])), false);
});

test("C1 : identifiants UUID stricts et paramètres d'URL rejetés comme identifiant", () => {
  assert.equal(isParentOfficialUuid(childA.childId), true);
  for (const value of ["", "student-a", "../other", `${childA.childId}?childId=${childB.childId}`, null, 42]) {
    assert.equal(isParentOfficialUuid(value), false);
  }
  for (const key of ["childId", "courseId", "assessmentId", "schoolId", "classId"]) {
    assert.equal(isParentOfficialResult({ ...resultA, [key]: "other" }), false, key);
  }
});

test("C1 : types d'évaluation explicites et champs de contexte obligatoires", () => {
  for (const type of ["quiz", "assignment", "exam"]) {
    assert.equal(isParentOfficialResult({ ...resultA, type }), true);
  }
  for (const type of ["devoir", "Quiz", "other", null]) {
    assert.equal(isParentOfficialResult({ ...resultA, type }), false);
  }
  for (const key of ["childName", "schoolName", "className", "schoolYear", "subjectName", "courseTitle", "title"]) {
    for (const empty of ["", "   ", null]) {
      assert.equal(isParentOfficialResult({ ...resultA, [key]: empty }), false, key);
    }
  }
});

test("C1 : notes numériques finies dans le barème, zéro et décimales conservés", () => {
  for (const score of [0, 12.75, 20]) {
    assert.equal(isParentOfficialResult({ ...resultA, score }), true);
  }
  for (const score of [-1, 20.01, null, "20", NaN, Infinity, -Infinity]) {
    assert.equal(isParentOfficialResult({ ...resultA, score }), false);
  }
  for (const maxScore of [0, -20, null, "20", NaN, Infinity]) {
    assert.equal(isParentOfficialResult({ ...resultA, maxScore }), false);
  }
});

test("C1 : une publication exige une date ISO réelle avec fuseau", () => {
  for (const publishedAt of ["2026-11-24T08:00:00Z", "2026-11-24T09:00:00+01:00", "2026-11-24T08:00:00.123456+00:00"]) {
    assert.equal(isParentOfficialResult({ ...resultA, publishedAt }), true, publishedAt);
  }
  for (const publishedAt of [null, "", "2026-11-24", "2026-11-24T08:00:00", "2026-02-30T08:00:00Z", "2026-13-01T08:00:00Z", "not-a-date"]) {
    assert.equal(isParentOfficialResult({ ...resultA, publishedAt }), false, String(publishedAt));
  }
});

test("C1 : catalogue incomplet, mauvais tableaux et champs absents refusés", () => {
  for (const value of [null, [], "data", {}, { results: [resultA] }, { children: [childA] }, { children: null, results: [] }]) {
    assert.equal(isParentOfficialResults(value), false);
  }
  for (const key of Object.keys(resultA)) {
    const incomplete = { ...resultA };
    delete incomplete[key];
    assert.equal(isParentOfficialResult(incomplete), false, key);
  }
});

test("C1 : limites de volume explicites pour le catalogue reçu", () => {
  assert.equal(isParentOfficialResults(catalog([], Array.from({ length: 1001 }, (_, i) => ({ childId: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, fullName: `Élève ${i}` })))), false);
  assert.equal(isParentOfficialResults(catalog(Array.from({ length: 5001 }, (_, i) => ({ ...resultA, assessmentId: `a0000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })))), false);
});

test("C1 : détail publié avec appréciation globale ou appréciation absente", () => {
  assert.equal(isParentOfficialResultDetail({ found: true, result: resultA, feedback: "Très bonne démarche." }), true);
  assert.equal(isParentOfficialResultDetail({ found: true, result: resultA, feedback: null }), true);
  assert.equal(isParentOfficialResultDetail({ found: true, result: resultA, feedback: "a".repeat(4000) }), true);
  assert.equal(isParentOfficialResultDetail({ found: true, result: resultA, feedback: "a".repeat(4001) }), false);
  assert.equal(isParentOfficialResultDetail({ found: true, result: resultA, feedback: "🙂".repeat(3000) }), true);
  assert.equal(isParentOfficialResultDetail({ found: true, result: resultA, feedback: "🙂".repeat(4001) }), false);
});

test("C1 : résultat indisponible sans donnée résiduelle", () => {
  assert.equal(isParentOfficialResultDetail({ found: false }), true);
  for (const value of [
    { found: false, result: resultA },
    { found: false, feedback: "secret" },
    { found: true, result: resultA },
    { found: true, result: resultA, feedback: null, questions: [] },
    { found: "false" },
    null,
  ]) assert.equal(isParentOfficialResultDetail(value), false);
});

test("C1 : liens de détail exclusivement parent et paramètres conservés", () => {
  const url = new URL(parentOfficialResultUrl(childA.childId, resultA.assessmentId), "https://schoolnet.example");
  assert.equal(url.pathname, `/app/parent/results/${resultA.assessmentId}`);
  assert.equal(url.searchParams.get("source"), "official");
  assert.equal(url.searchParams.get("childId"), childA.childId);
  assert.equal([...url.searchParams.keys()].length, 2);
});

test("C1 : retour conserve l'enfant sélectionné et l'origine du résultat", () => {
  for (const source of ["official", "legacy"]) {
    const url = new URL(parentResultsUrl(source, childB.childId), "https://schoolnet.example");
    assert.equal(url.pathname, "/app/parent/results");
    assert.equal(url.searchParams.get("source"), source);
    assert.equal(url.searchParams.get("childId"), childB.childId);
  }
  const all = new URL(parentResultsUrl("official"), "https://schoolnet.example");
  assert.equal(all.searchParams.get("childId"), null);
});

test("C1 : un détail ouvert depuis Tous mes enfants conserve ce choix au retour", () => {
  const all = new URL(parentOfficialResultUrl(childA.childId, resultA.assessmentId, true), "https://schoolnet.example");
  assert.equal(all.searchParams.get("allChildren"), "1");
  assert.equal(all.searchParams.get("childId"), childA.childId);
  assert.equal(all.searchParams.get("source"), "official");
  const selected = new URL(parentOfficialResultUrl(childA.childId, resultA.assessmentId), "https://schoolnet.example");
  assert.equal(selected.searchParams.has("allChildren"), false);
});

test("C1 : la migration archivée est identique octet par octet à la proposition approuvée", () => {
  const proposal = readFileSync(new URL("../supabase/proposals/s4b3c1_parent_official_results.sql", import.meta.url));
  const archive = readFileSync(new URL("../supabase/migrations/20261124090800_schoolnet_s4b3c1_parent_official_results.sql", import.meta.url));
  assert.equal(archive.equals(proposal), true, "L’archive C.1 doit conserver exactement les octets de la proposition SQL approuvée.");
});
