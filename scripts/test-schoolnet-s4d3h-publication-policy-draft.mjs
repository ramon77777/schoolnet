import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GOVERNANCE_DECISIONS_TO_APPROVE,
  prepareBulletinGovernance,
} from "../src/features/official-documents/lib/schoolReportCardApprovalGovernance.ts";
import {
  prepareReportCardApprovalWorkflow,
  PROPOSED_APPROVAL_EVENTS,
} from "../src/features/official-documents/lib/schoolReportCardApprovalPreparation.ts";
import {
  PROPOSED_BULLETIN_POLICY_CLAUSES,
  PROPOSED_BULLETIN_STATE_TRANSITIONS,
  REQUIRED_SERVER_CONTROLS,
  prepareBulletinPublicationPolicyDraft,
} from "../src/features/official-documents/lib/schoolBulletinPublicationPolicyDraft.ts";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig, makeDemoCurriculum, makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";
import {
  validateAuthorizedReportCardPreview,
} from "../src/features/official-documents/lib/schoolAuthorizedReportCardModel.ts";
import {
  makeReportCardAdministrativeReview,
} from "../src/features/official-documents/lib/schoolReportCardAdministrativeReview.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const model = read("src/features/official-documents/lib/schoolBulletinPublicationPolicyDraft.ts");
const panel = read("src/features/official-documents/pages/SchoolBulletinPublicationPolicyDraftPanel.tsx");
const governancePanel = read("src/features/official-documents/pages/SchoolReportCardRoleGovernancePanel.tsx");
const preparationPanel = read("src/features/official-documents/pages/SchoolReportCardApprovalPreparationPanel.tsx");
const adminPanel = read("src/features/official-documents/pages/SchoolReportCardAdministrativePanel.tsx");
const card = read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const workspace = read("src/features/official-documents/pages/SchoolOfficialBulletinWorkspace.tsx");
const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const branch = "feature/schoolnet-s4d3h-publication-policy-draft-20261127";

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

function policyFor(student, grades, states) {
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
      state: states[i], averageOn20: grades[i],
      includedAssessments: states[i] === "not_configured" ? 0 : 1,
      publishedAssessments: states[i] === "ready" ? 1 : 0,
      missingAssessments: states[i] === "incomplete" ? 1 : 0,
    })),
  };
  const validated = validateAuthorizedReportCardPreview(raw, scope, student.studentId,
    curriculum, general);
  const review = makeReportCardAdministrativeReview(validated, curriculum, labels);
  const workflow = prepareReportCardApprovalWorkflow(review);
  return prepareBulletinPublicationPolicyDraft(prepareBulletinGovernance(workflow));
}

const neverGrants = policy => {
  assert.equal(policy.adoptionStatus, "unapproved_draft");
  assert.equal(policy.proposedClauseCount, 7);
  assert.equal(policy.approvedClauseCount, 0);
  assert.equal(policy.serverWorkflowInstalled, false);
  for (const key of ["canSubmit", "canApprove", "canPublish", "canWithdraw"]) {
    assert.equal(policy[key], false, key);
  }
  assert.ok(policy.clauses.every(item =>
    item.status === "awaiting_business_decision" && item.approved === false));
  assert.ok(policy.transitions.every(item => item.enabled === false));
};

test("S4-D.3h: exactly seven clauses reuse the S4-D.3g decision IDs in order", () => {
  const clauseIds = PROPOSED_BULLETIN_POLICY_CLAUSES.map(item => item.id);
  assert.deepEqual(clauseIds, GOVERNANCE_DECISIONS_TO_APPROVE.map(item => item.id));
  assert.equal(new Set(clauseIds).size, 7);
  for (const clause of PROPOSED_BULLETIN_POLICY_CLAUSES) {
    for (const field of ["title", "proposedRule", "prerequisite", "alternativeToArbitrate"]) {
      assert.ok(clause[field].length > 40 || field === "title" && clause[field].length > 5,
        field + " missing for " + clause.id);
    }
  }
});

test("S4-D.3h: complete student 16.67 remains an unapproved policy draft", () => {
  const policy = policyFor(general.students[0], [17.17, 16.42, 15.92],
    ["ready", "ready", "ready"]);
  assert.equal(policy.pedagogicalPrecontrol, "satisfied");
  neverGrants(policy);
});

test("S4-D.3h: genuine zero 0/20 remains calculated but is never sufficient for publication", () => {
  const policy = policyFor(general.students[1], [0, 0, 0],
    ["ready", "ready", "ready"]);
  assert.equal(policy.pedagogicalPrecontrol, "satisfied");
  neverGrants(policy);
});

test("S4-D.3h: missing Sciences keeps the policy non-operational", () => {
  const policy = policyFor(general.students[2], [11, 12, null],
    ["ready", "ready", "incomplete"]);
  assert.equal(policy.pedagogicalPrecontrol, "requires_correction");
  neverGrants(policy);
});

test("S4-D.3h: not-configured subjects never unlock an approval or publication", () => {
  const policy = policyFor(general.students[3], [11, null, null],
    ["ready", "not_configured", "not_configured"]);
  assert.equal(policy.pedagogicalPrecontrol, "requires_correction");
  neverGrants(policy);
});

test("S4-D.3h: requester has to be an explicitly delegated school member", () => {
  const clause = PROPOSED_BULLETIN_POLICY_CLAUSES.find(item => item.id === "requester");
  assert.match(clause.proposedRule, /délégué/);
  assert.match(clause.prerequisite, /côté serveur/);
  assert.match(clause.prerequisite, /affiliation active/);
  assert.equal(clause.approved, false);
});

test("S4-D.3h: approver must be distinct from submitter as a proposal, not granted right", () => {
  const clause = PROPOSED_BULLETIN_POLICY_CLAUSES.find(item => item.id === "approver");
  assert.match(clause.proposedRule, /distincte du demandeur/);
  assert.match(clause.prerequisite, /séparation des personnes/);
  assert.equal(clause.status, "awaiting_business_decision");
});

test("S4-D.3h: approving, authorizing publication and executing publication are distinct", () => {
  const events = PROPOSED_BULLETIN_STATE_TRANSITIONS.map(item => item.event);
  assert.ok(events.includes("approval_granted"));
  assert.ok(events.includes("publication_authorized"));
  assert.ok(events.includes("publication_executed"));
  const approval = PROPOSED_BULLETIN_STATE_TRANSITIONS.find(item =>
    item.event === "approval_granted");
  const authorization = PROPOSED_BULLETIN_STATE_TRANSITIONS.find(item =>
    item.event === "publication_authorized");
  const publication = PROPOSED_BULLETIN_STATE_TRANSITIONS.find(item =>
    item.event === "publication_executed");
  assert.equal(approval.to, "approved");
  assert.equal(authorization.from, "approved");
  assert.equal(authorization.to, "authorized_for_publication");
  assert.equal(publication.from, "authorized_for_publication");
  assert.equal(publication.to, "published");
  assert.ok([approval, authorization, publication].every(item => item.enabled === false));
});

test("S4-D.3h: existing proposed events are retained and new publication event is not assumed implemented", () => {
  const events = PROPOSED_BULLETIN_STATE_TRANSITIONS.map(item => item.event);
  assert.deepEqual(PROPOSED_APPROVAL_EVENTS.filter(item => !events.includes(item)), []);
  assert.equal(events.length, PROPOSED_APPROVAL_EVENTS.length + 1);
  assert.match(PROPOSED_BULLETIN_STATE_TRANSITIONS.find(item =>
    item.event === "publication_executed").required, /événement à adopter/);
});

test("S4-D.3h: delegations are scoped and revocable proposals", () => {
  const clause = PROPOSED_BULLETIN_POLICY_CLAUSES.find(item => item.id === "delegations");
  assert.match(clause.proposedRule, /nominative/);
  assert.match(clause.proposedRule, /dates d'effet/);
  assert.match(clause.proposedRule, /révocation/);
  assert.match(clause.prerequisite, /chaque décision/);
});

test("S4-D.3h: supplementary data are undecided, not invented or automatically mandatory", () => {
  const clause = PROPOSED_BULLETIN_POLICY_CLAUSES.find(item => item.id === "supplementary_data");
  assert.match(clause.proposedRule, /rangs, absences, appréciations, signatures/);
  assert.match(clause.proposedRule, /sans créer de valeurs absentes/);
  assert.match(clause.alternativeToArbitrate, /obligatoires, facultatifs ou non applicables/);
});

test("S4-D.3h: correction invalidates former version's approval, withdrawal preserves audit", () => {
  const clause = PROPOSED_BULLETIN_POLICY_CLAUSES.find(item => item.id === "withdrawal");
  assert.match(clause.proposedRule, /nouvel examen/);
  assert.match(clause.prerequisite, /sans effacement de traces/);
  assert.equal(PROPOSED_BULLETIN_STATE_TRANSITIONS.find(item =>
    item.event === "publication_revoked").to, "withdrawn");
});

test("S4-D.3h: family visibility requires actually published bulletin and verified filiation", () => {
  const clause = PROPOSED_BULLETIN_POLICY_CLAUSES.find(item => item.id === "family_access");
  assert.match(clause.proposedRule, /réellement publié/);
  assert.match(clause.proposedRule, /lien est vérifié côté serveur/);
  assert.match(clause.prerequisite, /isolation entre écoles et familles/);
});

test("S4-D.3h: future transitions are all disabled and state machine cannot execute in browser", () => {
  const events = PROPOSED_BULLETIN_STATE_TRANSITIONS;
  assert.equal(events.length, 7);
  assert.ok(events.every(item => item.enabled === false));
  assert.equal(new Set(events.map(item => item.event)).size, 7);
  assert.equal(events.find(item => item.event === "review_submitted").from, "draft");
  assert.equal(events.find(item => item.event === "publication_revoked").from, "published");
  assert.doesNotMatch(model, /onClick=|onSubmit=|\\.rpc\\(|\\.insert\\(|\\.update\\(|\\.upsert\\(|\\.delete\\(/);
});

test("S4-D.3h: seven server controls require identity, scope, snapshot, audit and publication permissions", () => {
  const ids = REQUIRED_SERVER_CONTROLS.map(item => item.id);
  assert.deepEqual(ids, [
    "identity", "scope", "separation", "snapshot", "transaction", "audit", "publication",
  ]);
  assert.match(REQUIRED_SERVER_CONTROLS.find(item => item.id === "identity").label, /serveur/);
  assert.match(REQUIRED_SERVER_CONTROLS.find(item => item.id === "scope").label, /établissement/i);
  assert.match(REQUIRED_SERVER_CONTROLS.find(item => item.id === "snapshot").label, /Version immuable/);
  assert.match(REQUIRED_SERVER_CONTROLS.find(item => item.id === "audit").label, /append-only/);
  assert.match(REQUIRED_SERVER_CONTROLS.find(item => item.id === "publication").label, /révocation/);
});

test("S4-D.3h: forged governance that grants rights fails closed", () => {
  const normal = prepareBulletinGovernance(prepareReportCardApprovalWorkflow({
    academicStatus: "pedagogically_complete",
    expectedSubjects: 3,
    completeSubjects: 3,
    findings: [],
    checks: [
      { id: "identity", label: "Identity", status: "verified", explanation: "OK" },
      { id: "curriculum", label: "Curriculum", status: "verified", explanation: "OK" },
      { id: "subject_results", label: "Results", status: "verified", explanation: "OK" },
    ],
    publicationAuthorized: false,
  }));
  for (const key of ["canSubmit", "canApprove", "canPublish", "canRevoke", "roleAssignmentsApproved"]) {
    assert.throws(() => prepareBulletinPublicationPolicyDraft({ ...normal, [key]: true }),
      /habilitations ou décisions incohérentes/);
  }
  const roles = normal.roleMatrix.map((item, i) =>
    i === 0 ? { ...item, decideGranted: true } : item);
  assert.throws(() => prepareBulletinPublicationPolicyDraft({ ...normal, roleMatrix: roles }),
    /habilitations ou décisions incohérentes/);
  assert.throws(() => prepareBulletinPublicationPolicyDraft({
    ...normal, decisionsToApprove: normal.decisionsToApprove.slice(1),
  }), /habilitations ou décisions incohérentes/);
});

test("S4-D.3h: draft panel is chained under authorized school-admin subject projection", () => {
  assert.match(card, /const report=result\?\.key===key && state==="ready"/);
  assert.match(card, /\{report && <>/);
  assert.match(card, /<SchoolReportCardAdministrativePanel/);
  assert.match(adminPanel, /makeReportCardAdministrativeReview\(report, curriculum, labels\)/);
  assert.match(preparationPanel, /<SchoolReportCardRoleGovernancePanel/);
  assert.match(governancePanel, /prepareBulletinGovernance\(workflow\)/);
  assert.match(governancePanel, /<SchoolBulletinPublicationPolicyDraftPanel/);
  assert.match(governancePanel, /governance=\{governance\}/);
  assert.match(panel, /prepareBulletinPublicationPolicyDraft\(governance\)/);
  assert.match(workspace, /user\.role === "school_admin"/);
});

test("S4-D.3h: UI is informational and non-persisted, without approval controls or PDF download", () => {
  assert.match(panel, /Politique d'approbation et de publication — projet/);
  assert.match(panel, /7 clauses proposées · 0 validée/);
  assert.match(panel, /toutes à valider/);
  assert.match(panel, /Transitions envisagées — non exécutables/);
  assert.match(panel, /Aucune habilitation, aucun état de bulletin/);
  for (const src of [model, panel]) {
    assert.doesNotMatch(src, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|window\.print|download=|fetch\(/i);
    assert.doesNotMatch(src, /onClick=|onSubmit=|useState\(|useEffect\(/);
  }
});

test("S4-D.3h: branch preview disabled and targeted QA registered", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pkg.scripts["qa:s4d3h"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3h-publication-policy-draft.mjs");
});
