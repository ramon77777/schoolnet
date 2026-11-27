import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig, makeDemoCurriculum,
  makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";
import {
  validateAuthorizedReportCardPreview,
} from "../src/features/official-documents/lib/schoolAuthorizedReportCardModel.ts";
import {
  makeReportCardAdministrativeReview,
} from "../src/features/official-documents/lib/schoolReportCardAdministrativeReview.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const panel = read("src/features/official-documents/pages/SchoolReportCardAdministrativePanel.tsx");
const model = read("src/features/official-documents/lib/schoolReportCardAdministrativeReview.ts");
const card = read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const workspace = read("src/features/official-documents/pages/SchoolOfficialBulletinWorkspace.tsx");
const api = read("src/features/official-documents/lib/schoolAuthorizedReportCardApi.ts");
const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const branch = "feature/schoolnet-s4d3e-admin-reportcard-review-20261127";

const config = makeDemoGradeConfig(DEMO_SCHOOLS[0].id);
const scope = {
  schoolId: config.schoolId,
  schoolYearId: config.years[0].id,
  classId: config.subjects[0].classId,
  periodId: config.periods[0].id,
};
const curriculum = makeDemoCurriculum(scope);
const general = makeDemoGeneralPreview(scope);
const labels = {
  schoolName: DEMO_SCHOOLS[0].name,
  schoolYearName: config.years[0].name,
  className: config.subjects[0].className,
  periodName: config.periods[0].name,
};

function projection(student, marks, states, preview=general) {
  const raw = {
    projection: "schoolnet_v2_report_card_provisional_v1",
    ...scope,
    studentId: student.studentId,
    studentName: student.studentName,
    schoolAdminScoped: true,
    previewOnly: true,
    documentState: "provisional",
    state: student.state,
    averageOn20: student.averageOn20,
    expectedSubjects: student.expectedSubjects,
    readySubjects: student.readySubjects,
    subjects: curriculum.subjects.map((subject, i) => ({
      subjectId: subject.subjectId, subjectName: subject.subjectName,
      coefficient: subject.coefficient,
      state: states[i], averageOn20: marks[i],
      includedAssessments: states[i] === "not_configured" ? 0 : 1,
      publishedAssessments: states[i] === "ready" ? 1 : 0,
      missingAssessments: states[i] === "incomplete" ? 1 : 0,
    })),
  };
  return validateAuthorizedReportCardPreview(raw, scope, student.studentId,
    curriculum, preview);
}

test("S4-D.3e: first student has a complete educational control but publication is never allowed", () => {
  const report = projection(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  assert.equal(report.averageOn20, 16.67);
  assert.equal(review.academicStatus, "pedagogically_complete");
  assert.equal(review.completeSubjects, 3);
  assert.equal(review.expectedSubjects, 3);
  assert.deepEqual(review.findings, []);
  assert.equal(review.checks.filter(check => check.status === "verified").length, 3);
  assert.equal(review.checks.find(check => check.id === "complementary")?.status, "not_integrated");
  assert.equal(review.publicationAuthorized, false);
});

test("S4-D.3e: a genuine published zero remains complete, never a missing mark", () => {
  const report = projection(general.students[1], [0, 0, 0],
    ["ready", "ready", "ready"]);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  assert.equal(report.averageOn20, 0);
  assert.equal(review.academicStatus, "pedagogically_complete");
  assert.equal(review.completeSubjects, 3);
  assert.equal(review.findings.length, 0);
  assert.equal(review.publicationAuthorized, false);
});

test("S4-D.3e: absent Science evaluation produces a named finding without inventing a grade", () => {
  const report = projection(general.students[2], [11, 12, null],
    ["ready", "ready", "incomplete"]);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  assert.equal(report.averageOn20, null);
  assert.equal(review.academicStatus, "to_complete");
  assert.equal(review.completeSubjects, 2);
  assert.equal(review.findings.length, 1);
  assert.equal(review.findings[0].subjectName, "Sciences");
  assert.equal(review.findings[0].status, "incomplete");
  assert.equal(review.findings[0].missingAssessments, 1);
  assert.match(review.findings[0].explanation, /1 évaluation/);
  assert.equal(review.publicationAuthorized, false);
});

test("S4-D.3e: non-configured subjects remain pending, even if another subject has a score", () => {
  const report = projection(general.students[3], [11, null, null],
    ["ready", "not_configured", "not_configured"]);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  assert.equal(review.academicStatus, "not_configured");
  assert.equal(review.completeSubjects, 1);
  assert.equal(review.findings.filter(item => item.status === "not_configured").length, 2);
  assert.equal(review.publicationAuthorized, false);
});

test("S4-D.3e: missing school, class, year or period label cannot be reported as complete", () => {
  const report = projection(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  for (const field of ["schoolName", "schoolYearName", "className", "periodName"]) {
    const review = makeReportCardAdministrativeReview(report, curriculum,
      { ...labels, [field]: "" });
    assert.equal(review.academicStatus, "to_complete", field);
    assert.equal(review.checks.find(item => item.id === "identity")?.status, "attention");
    assert.equal(review.publicationAuthorized, false);
  }
});

test("S4-D.3e: transfer-review suppressed subject scores are not declared complete", () => {
  const student = { ...general.students[2], readySubjects: 3, state: "incomplete" };
  const preview = { ...general, students: general.students.map(item =>
    item.studentId === student.studentId ? student : item) };
  const report = projection(student, [null, null, null],
    ["ready", "ready", "ready"], preview);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  assert.equal(review.academicStatus, "to_complete");
  assert.equal(review.completeSubjects, 0);
  assert.equal(review.findings.length, 3);
  assert.ok(review.findings.every(item => item.status === "unavailable"));
  assert.equal(review.publicationAuthorized, false);
});

test("S4-D.3e: invalid program or foreign context never produces a green control", () => {
  const report = projection(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  assert.throws(() => makeReportCardAdministrativeReview(report,
    { ...curriculum, status: "draft" }, labels), /incohérent/);
  assert.throws(() => makeReportCardAdministrativeReview(report,
    { ...curriculum, schoolId: DEMO_SCHOOLS[1].id }, labels), /incohérent/);
  assert.throws(() => makeReportCardAdministrativeReview(report,
    { ...curriculum, subjects: curriculum.subjects.slice(1) }, labels), /incohérent/);
});

test("S4-D.3e: no published or unverified server projection can pass the defensive guard", () => {
  const report = projection(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  for (const bad of [
    { ...report, previewOnly: false },
    { ...report, schoolAdminScoped: false },
    { ...report, documentState: "published" },
  ]) assert.throws(() => makeReportCardAdministrativeReview(bad, curriculum, labels));
});

test("S4-D.3e: checklist mounts only below already validated per-student RPC outcome", () => {
  assert.match(card, /const report=result\?\.key===key && state==="ready"/);
  assert.match(card, /\{report && <>/);
  assert.match(card, /<SchoolReportCardAdministrativePanel/);
  assert.match(card, /report=\{report\}/);
  assert.match(card, /curriculum=\{curriculum\}/);
  assert.match(card, /fictional=\{localDemo\}/);
  assert.match(card, /SchoolAuthorizedReportCardLayout/);
  assert.match(api, /validateAuthorizedReportCardPreview/);
  assert.match(workspace, /user\.role === "school_admin"/);
  assert.match(workspace, /!user\.isDemo/);
});

test("S4-D.3e: class overview is based only on authorized cohort and does not recalculate marks", () => {
  assert.match(workspace, /summarizeGeneralStudents\(preview\.students\)/);
  assert.match(workspace, /preview && cohortTotals/);
  assert.match(workspace, /cohortTotals\.total/);
  assert.match(workspace, /cohortTotals\.ready/);
  assert.match(workspace, /cohortTotals\.incomplete/);
  assert.match(workspace, /cohortTotals\.notConfigured/);
  assert.match(workspace, /rosterLoad\?\.key === scopeKey/);
  assert.doesNotMatch(model, /weightedSum|\.reduce\(|Math\.round|supabase\.rpc/);
});

test("S4-D.3e: review never approves, publishes, writes SQL or exports a report", () => {
  for (const src of [model, panel]) {
    assert.doesNotMatch(src, /supabase|\.rpc\(|window\.print|download=|\.insert\(|\.update\(|\.upsert\(/i);
    assert.doesNotMatch(src, /onClick=|\bfetch\(/);
  }
  assert.match(panel, /Publication désactivée/);
  assert.match(panel, /Aucun statut publié, aucune approbation/);
  assert.match(model, /publicationAuthorized: false/);
  assert.match(panel, /RECETTE LOCALE — DONNÉES 100 % FICTIVES/);
});

test("S4-D.3e: production remains isolated and specialized QA is registered", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pkg.scripts["qa:s4d3e"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3e-admin-reportcard.mjs");
});
