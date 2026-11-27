import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig,
  makeDemoCurriculum, makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";
import { validateAuthorizedReportCardPreview } from "../src/features/official-documents/lib/schoolAuthorizedReportCardModel.ts";
import { makeReportCardAdministrativeReview } from "../src/features/official-documents/lib/schoolReportCardAdministrativeReview.ts";
import {
  prepareReportCardApprovalWorkflow, PROPOSED_APPROVAL_EVENTS,
  PROPOSED_APPROVAL_AUDIT_FIELDS,
} from "../src/features/official-documents/lib/schoolReportCardApprovalPreparation.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const workflowModel = read("src/features/official-documents/lib/schoolReportCardApprovalPreparation.ts");
const workflowUi = read("src/features/official-documents/pages/SchoolReportCardApprovalPreparationPanel.tsx");
const adminPanel = read("src/features/official-documents/pages/SchoolReportCardAdministrativePanel.tsx");
const card = read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const hub = read("src/features/official-documents/pages/SchoolOfficialBulletinWorkspace.tsx");
const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const branch = "feature/schoolnet-s4d3f-approval-workflow-preparation-20261127";

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

function projection(student, scores, states, preview = general) {
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
    subjects: curriculum.subjects.map((subject, index) => ({
      subjectId: subject.subjectId, subjectName: subject.subjectName,
      coefficient: subject.coefficient, state: states[index],
      averageOn20: scores[index],
      includedAssessments: states[index] === "not_configured" ? 0 : 1,
      publishedAssessments: states[index] === "ready" ? 1 : 0,
      missingAssessments: states[index] === "incomplete" ? 1 : 0,
    })),
  };
  return validateAuthorizedReportCardPreview(
    raw, scope, student.studentId, curriculum, preview,
  );
}
function plan(student, scores, states, activeLabels = labels) {
  const report = projection(student, scores, states);
  const review = makeReportCardAdministrativeReview(report, curriculum, activeLabels);
  return prepareReportCardApprovalWorkflow(review);
}
const assertNeverPublishes = value => {
  assert.equal(value.approvalWorkflowInstalled, false);
  assert.equal(value.auditLogCreated, false);
  assert.equal(value.canSubmit, false);
  assert.equal(value.canApprove, false);
  assert.equal(value.canPublish, false);
  assert.equal(value.stages[1].status, "not_activated");
  assert.equal(value.stages[2].status, "not_activated");
  assert.equal(value.stages[3].status, "not_activated");
};

test("S4-D.3f: complete student is pedagogically checked, NOT approved or published", () => {
  const value = plan(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  assert.equal(value.pedagogicalReview, "complete");
  assert.equal(value.stages[0].status, "checked");
  assert.deepEqual(value.stages.map(item => item.id), [
    "academic_check", "submit_for_review", "administrative_decision", "publication",
  ]);
  assert.equal(value.blockers.some(item => item.code === "academic_incomplete"), false);
  assert.equal(value.blockers.length, 5);
  assertNeverPublishes(value);
});

test("S4-D.3f: published zero 0/20 remains eligible for precontrol but NOT approval", () => {
  const value = plan(general.students[1], [0, 0, 0], ["ready", "ready", "ready"]);
  assert.equal(value.pedagogicalReview, "complete");
  assert.equal(value.stages[0].status, "checked");
  assertNeverPublishes(value);
});

test("S4-D.3f: incomplete Sciences is a pedagogical blocker, never replaced with zero", () => {
  const value = plan(general.students[2], [11, 12, null],
    ["ready", "ready", "incomplete"]);
  assert.equal(value.pedagogicalReview, "requires_corrections");
  assert.equal(value.stages[0].status, "attention");
  assert.equal(value.blockers.some(item => item.code === "academic_incomplete"), true);
  assert.equal(value.blockers.length, 6);
  assertNeverPublishes(value);
});

test("S4-D.3f: not configured subject blocks all administrative actions", () => {
  const value = plan(general.students[3], [11, null, null],
    ["ready", "not_configured", "not_configured"]);
  assert.equal(value.pedagogicalReview, "requires_corrections");
  assertNeverPublishes(value);
});

test("S4-D.3f: missing identity or context labels cannot be marked complete", () => {
  for (const label of ["schoolName", "schoolYearName", "className", "periodName"]) {
    const value = plan(general.students[0], [17.17, 16.42, 15.92],
      ["ready", "ready", "ready"], { ...labels, [label]: "" });
    assert.equal(value.pedagogicalReview, "requires_corrections");
    assert.equal(value.blockers.some(item => item.code === "school_identity"), true);
    assertNeverPublishes(value);
  }
});

test("S4-D.3f: suppressed transfer-review averages never unlock approval", () => {
  const student = { ...general.students[2], state: "incomplete", readySubjects: 3 };
  const preview = { ...general, students: general.students.map(item =>
    item.studentId === student.studentId ? student : item) };
  const report = projection(student, [null, null, null],
    ["ready", "ready", "ready"], preview);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  const value = prepareReportCardApprovalWorkflow(review);
  assert.equal(value.pedagogicalReview, "requires_corrections");
  assertNeverPublishes(value);
});

test("S4-D.3f: even forged green review cannot skip unfinished checks", () => {
  const report = projection(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  const forged = {
    ...review, checks: review.checks.map(check =>
      check.id === "identity" ? { ...check, status: "attention" } : check),
  };
  const value = prepareReportCardApprovalWorkflow(forged);
  assert.equal(value.pedagogicalReview, "requires_corrections");
  assertNeverPublishes(value);
});

test("S4-D.3f: responsibilities are proposed, with no invented approval privileges", () => {
  const value = plan(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  assert.match(value.stages[0].responsibility, /consultation uniquement/);
  assert.match(value.stages[1].responsibility, /à désigner/);
  assert.match(value.stages[2].responsibility, /à définir/);
  assert.match(value.stages[3].responsibility, /à définir/);
  assert.match(value.stages[3].description, /distincte de l'approbation/);
});

test("S4-D.3f: audit is only a proposed immutable server-side event contract", () => {
  assert.deepEqual([...PROPOSED_APPROVAL_EVENTS], [
    "review_submitted", "correction_requested", "approval_granted",
    "approval_refused", "publication_authorized", "publication_revoked",
  ]);
  assert.deepEqual(PROPOSED_APPROVAL_AUDIT_FIELDS.map(item => item.key), [
    "school_scope", "actor", "event", "source_version", "server_time", "trace",
  ]);
  assert.match(PROPOSED_APPROVAL_AUDIT_FIELDS[3].detail, /Révision immuable/);
  assert.match(PROPOSED_APPROVAL_AUDIT_FIELDS[4].detail, /côté serveur/);
  assert.match(PROPOSED_APPROVAL_AUDIT_FIELDS[2].detail, /sans note brute/);
  const value = plan(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  assert.equal(value.auditLogCreated, false);
  assert.deepEqual([...value.proposedEventTypes], [...PROPOSED_APPROVAL_EVENTS]);
});

test("S4-D.3f: no browser approval transition, persistent audit, SQL, PDF or export", () => {
  for (const src of [workflowModel, workflowUi]) {
    assert.doesNotMatch(src, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|window\.print|download=|fetch\(/i);
    assert.doesNotMatch(src, /onClick=|onSubmit=|useState\(/);
  }
  assert.match(workflowUi, /Circuit non activé/);
  assert.match(workflowUi, /Aucun événement enregistré/);
  assert.match(workflowUi, /Validation, refus, demande de correction et publication désactivés/);
  assert.match(workflowModel, /canApprove: false/);
  assert.match(workflowModel, /canPublish: false/);
});

test("S4-D.3f: workflow mounts only under authorized school-admin student preview", () => {
  assert.match(card, /const report=result\?\.key===key && state==="ready"/);
  assert.match(card, /\{report && <>/);
  assert.match(card, /<SchoolReportCardAdministrativePanel/);
  assert.match(adminPanel, /makeReportCardAdministrativeReview\(report, curriculum, labels\)/);
  assert.match(adminPanel, /<SchoolReportCardApprovalPreparationPanel/);
  assert.match(adminPanel, /review=\{review\}/);
  assert.match(adminPanel, /fictional=\{fictional\}/);
  assert.match(hub, /user\.role === "school_admin"/);
  assert.match(hub, /!user\.isDemo/);
});

test("S4-D.3f: production deploys disabled and targeted QA registered", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pkg.scripts["qa:s4d3f"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3f-approval-workflow-preparation.mjs");
});
