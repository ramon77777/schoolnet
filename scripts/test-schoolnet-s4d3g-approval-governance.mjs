import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SCHOOLNET_BULLETIN_ROLE_GOVERNANCE,
  PROPOSED_BULLETIN_RESPONSIBILITIES,
  PROPOSED_GOVERNANCE_GUARDS,
  GOVERNANCE_DECISIONS_TO_APPROVE,
  prepareBulletinGovernance,
} from "../src/features/official-documents/lib/schoolReportCardApprovalGovernance.ts";
import {
  prepareReportCardApprovalWorkflow,
} from "../src/features/official-documents/lib/schoolReportCardApprovalPreparation.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const model = read("src/features/official-documents/lib/schoolReportCardApprovalGovernance.ts");
const panel = read("src/features/official-documents/pages/SchoolReportCardRoleGovernancePanel.tsx");
const mounted = read("src/features/official-documents/pages/SchoolReportCardApprovalPreparationPanel.tsx");
const adminPanel = read("src/features/official-documents/pages/SchoolReportCardAdministrativePanel.tsx");
const report = read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const schoolWorkspace = read("src/features/official-documents/pages/SchoolOfficialBulletinWorkspace.tsx");
const roleTypes = read("src/lib/auth/auth-context.ts");
const memberships = read("src/features/schools/lib/schoolManagementApi.ts");
const schoolFilter = read("src/features/schools/lib/schoolPedagogyOverview.ts");
const pkg = JSON.parse(read("package.json"));
const vercel = JSON.parse(read("vercel.json"));
const branch = "feature/schoolnet-s4d3g-approval-role-governance-20261127";

const makeReview = state => ({
  academicStatus: state === "complete" ? "pedagogically_complete" : "to_complete",
  completeSubjects: state === "complete" ? 3 : 2,
  expectedSubjects: 3,
  findings: state === "complete" ? [] : [{ subjectId: "science", subjectName: "Sciences" }],
  checks: [
    { id: "identity", status: "verified" },
    { id: "curriculum", status: "verified" },
    { id: "subject_results", status: state === "complete" ? "verified" : "attention" },
  ],
  publicationAuthorized: false,
});
const prepared = state => prepareReportCardApprovalWorkflow(makeReview(state));
const neverGrant = value => {
  assert.equal(value.currentPreviewOnly, true);
  assert.equal(value.roleAssignmentsApproved, false);
  for (const key of ["canSubmit", "canApprove", "canPublish", "canRevoke"]) {
    assert.equal(value[key], false, key);
  }
  assert.ok(value.roleMatrix.every(role =>
    role.submitGranted === false && role.decideGranted === false &&
    role.publishGranted === false && role.revokeGranted === false));
};

test("S4-D.3g: roles exactly reuse existing profile roles; no director role invented", () => {
  const roles = SCHOOLNET_BULLETIN_ROLE_GOVERNANCE.map(entry => entry.role);
  assert.deepEqual([...roles].sort(), ["admin", "parent", "school_admin", "student", "teacher"].sort());
  for (const role of roles) assert.match(roleTypes, new RegExp('"' + role + '"'));
  assert.equal(new Set(roles).size, 5);
  assert.doesNotMatch(model, /role:\s*"director"|role:\s*"principal"/);
});

test("S4-D.3g: only existing school_admin preview has scoped read, never a new right", () => {
  const viewers = SCHOOLNET_BULLETIN_ROLE_GOVERNANCE
    .filter(entry => entry.currentPreview === "school_admin_scoped_read");
  assert.deepEqual(viewers.map(entry => entry.role), ["school_admin"]);
  assert.match(schoolWorkspace, /user\.role === "school_admin"/);
  assert.match(schoolWorkspace, /!user\.isDemo/);
  assert.match(memberships, /member_role: "school_admin" \| "teacher"/);
  assert.match(schoolFilter, /membership\.status === "active"/);
  assert.match(schoolFilter, /school\.status === "active"/);
});

test("S4-D.3g: all five current roles have zero approval, submission, publication and revocation rights", () => {
  const plan = prepareBulletinGovernance(prepared("complete"));
  assert.equal(plan.roleMatrix.length, 5);
  neverGrant(plan);
});

test("S4-D.3g: general platform admin never overrides school academic approvals", () => {
  const admin = SCHOOLNET_BULLETIN_ROLE_GOVERNANCE.find(entry => entry.role === "admin");
  assert.equal(admin.currentPreview, "not_in_this_workspace");
  assert.equal(admin.decideGranted, false);
  assert.equal(admin.publishGranted, false);
  assert.match(admin.futureResponsibility, /sans droit automatique/);
  neverGrant(prepareBulletinGovernance(prepared("complete")));
});

test("S4-D.3g: teachers only retain existing pedagogical assignments, not whole-class bulletin rights", () => {
  const teacher = SCHOOLNET_BULLETIN_ROLE_GOVERNANCE.find(entry => entry.role === "teacher");
  assert.equal(teacher.currentPreview, "not_in_this_workspace");
  assert.match(teacher.futureResponsibility, /affectations/);
  assert.equal(teacher.submitGranted, false);
  assert.equal(teacher.decideGranted, false);
});

test("S4-D.3g: parent and student have no advance access to unpublished bulletins", () => {
  for (const role of ["parent", "student"]) {
    const row = SCHOOLNET_BULLETIN_ROLE_GOVERNANCE.find(entry => entry.role === role);
    assert.equal(row.currentPreview, "not_in_this_workspace");
    assert.match(row.futureResponsibility, /publié/);
    assert.equal(row.publishGranted, false);
  }
});

test("S4-D.3g: responsibilities are distinct functions without new app roles", () => {
  assert.deepEqual(PROPOSED_BULLETIN_RESPONSIBILITIES.map(entry => entry.id),
    ["precontrol", "submit", "decide", "publish"]);
  assert.match(PROPOSED_BULLETIN_RESPONSIBILITIES[0].authorization, /Lecture V2 existante/);
  for (const row of PROPOSED_BULLETIN_RESPONSIBILITIES.slice(1)) {
    assert.match(row.authorization, /Aucune habilitation actuellement accordée/);
    assert.match(row.accountable, /à désigner/);
  }
});

test("S4-D.3g: maker-checker and publisher separation require future authorization", () => {
  const ids = PROPOSED_GOVERNANCE_GUARDS.map(row => row.id);
  assert.ok(ids.includes("maker_checker"));
  assert.ok(ids.includes("publisher_separation"));
  assert.match(PROPOSED_GOVERNANCE_GUARDS.find(row => row.id === "maker_checker").description,
    /propre demande/);
  assert.match(PROPOSED_GOVERNANCE_GUARDS.find(row => row.id === "publisher_separation").description,
    /distincte de l'approbation/);
});

test("S4-D.3g: future rights require active same-school membership and explicit grants", () => {
  const guards = PROPOSED_GOVERNANCE_GUARDS;
  assert.match(guards.find(row => row.id === "active_membership").description,
    /sur le serveur/);
  assert.match(guards.find(row => row.id === "active_membership").description,
    /affiliation/);
  assert.match(guards.find(row => row.id === "explicit_grants").description,
    /révocables/);
  assert.match(guards.find(row => row.id === "school_data_privacy").description,
    /accès croisés/);
});

test("S4-D.3g: immutable grades, server transaction and audit are mandatory proposals", () => {
  const guards = PROPOSED_GOVERNANCE_GUARDS;
  assert.match(guards.find(row => row.id === "immutable_snapshot").description,
    /version immuable/);
  assert.match(guards.find(row => row.id === "server_transaction").description,
    /côté serveur/);
  assert.match(guards.find(row => row.id === "server_transaction").description,
    /journal append-only/);
  assert.match(guards.find(row => row.id === "school_data_privacy").description,
    /parents\/élèves/);
});

test("S4-D.3g: exactly seven decisions stay explicitly unapproved", () => {
  assert.deepEqual(GOVERNANCE_DECISIONS_TO_APPROVE.map(entry => entry.id), [
    "requester", "approver", "publisher", "delegations", "supplementary_data",
    "withdrawal", "family_access",
  ]);
  const plan = prepareBulletinGovernance(prepared("complete"));
  assert.equal(plan.decisionsToApprove.length, 7);
  assert.equal(plan.roleAssignmentsApproved, false);
});

test("S4-D.3g: complete academic preview still provides no authority", () => {
  const plan = prepareBulletinGovernance(prepared("complete"));
  assert.equal(plan.academicPrecontrol, "satisfied");
  neverGrant(plan);
});

test("S4-D.3g: incomplete academic preview never starts real decision-making", () => {
  const plan = prepareBulletinGovernance(prepared("incomplete"));
  assert.equal(plan.academicPrecontrol, "requires_correction");
  neverGrant(plan);
});

test("S4-D.3g: forged activation flag or modified stage fails closed", () => {
  const good = prepared("complete");
  for (const key of ["canSubmit", "canApprove", "canPublish",
    "approvalWorkflowInstalled", "auditLogCreated"]) {
    assert.throws(() => prepareBulletinGovernance({ ...good, [key]: true }),
      /circuit administratif non sécurisé/);
  }
  const forged = { ...good, stages: good.stages.map((item, i) =>
    i === 2 ? { ...item, status: "checked" } : item) };
  assert.throws(() => prepareBulletinGovernance(forged),
    /circuit administratif non sécurisé/);
});

test("S4-D.3g: panel is only mounted downstream of verified school-admin student preview", () => {
  assert.match(report, /const report=result\?\.key===key && state==="ready"/);
  assert.match(report, /\{report && <>/);
  assert.match(report, /<SchoolReportCardAdministrativePanel/);
  assert.match(adminPanel, /makeReportCardAdministrativeReview\(report, curriculum, labels\)/);
  assert.match(mounted, /prepareReportCardApprovalWorkflow\(review\)/);
  assert.match(mounted, /<SchoolReportCardRoleGovernancePanel/);
  assert.match(mounted, /workflow=\{plan\}/);
  assert.match(panel, /prepareBulletinGovernance\(workflow\)/);
});

test("S4-D.3g: informational matrix has no interactive grants, SQL writes or export", () => {
  assert.match(panel, /Matrice des rôles SCHOOLNET/);
  assert.match(panel, /Non attribué/);
  assert.match(panel, /Aucun droit de soumission, décision, publication ou retrait attribué/);
  assert.match(panel, /aucune habilitation réelle créée/);
  for (const src of [model, panel]) {
    assert.doesNotMatch(src, /\.rpc\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|window\.print|download=|fetch\(/i);
    assert.doesNotMatch(src, /onClick=|onSubmit=|useState\(|useEffect\(/);
  }
});

test("S4-D.3g: Vercel branch preview remains disabled and QA command is available", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pkg.scripts["qa:s4d3g"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3g-approval-governance.mjs");
});
