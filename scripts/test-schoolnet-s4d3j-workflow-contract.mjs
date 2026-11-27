import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  S4D3J_REVIEW_POLICY,
  PROPOSED_STATE_MACHINE,
  evaluateProposedTransition,
} from "../tests/s4d3j/approval-contract-simulator.ts";

const file = path => readFileSync(new URL("../" + path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const doc = file("docs/architecture/SCHOOLNET_S4D3J_SECURE_APPROVAL_BACKEND_2026-11-27.md");
const productPolicy = file("docs/governance/SCHOOLNET_S4D3I_BUSINESS_DECISIONS_2026-11-27.md");
const simulator = file("tests/s4d3j/approval-contract-simulator.ts");
const packageJSON = JSON.parse(file("package.json"));
const vercel = JSON.parse(file("vercel.json"));
const branch = "feature/schoolnet-s4d3j-secure-workflow-contract-20261127";
const scopeA = {
  schoolId: "school-a", schoolYearId: "year-1", classId: "class-a",
  periodId: "period-1", studentId: "student-01",
};
const scopeB = { ...scopeA, schoolId: "school-b", classId: "class-b" };
const time = "2026-11-27T15:00:00.000Z";

function fixture(action="review_submitted") {
  const t = PROPOSED_STATE_MACHINE[action];
  return {
    action,
    scope: { ...scopeA },
    actor: {
      kind: "server-verified-fixture", actorId: action === "review_submitted" ? "requester-a" : "approver-b",
      profileRole: "school_admin", schoolId: scopeA.schoolId,
      membershipStatus: "active", membershipRevokedAt: null,
      schoolStatus: "active",
    },
    caseRow: {
      id: "case-01", scope: { ...scopeA }, snapshotId: "snapshot-01",
      status: t.from, version: 4,
      requesterId: action === "review_submitted" ? null : "requester-a",
      approverId: ["publication_authorized", "publication_executed", "publication_revoked"].includes(action)
        ? "approver-b" : null,
      publicationAuthorizerId: ["publication_executed", "publication_revoked"].includes(action)
        ? "approver-b" : null,
    },
    snapshot: {
      id: "snapshot-01", scope: { ...scopeA }, digest: "server-sha256-fictitious",
      immutable: true, sourceKind: "authorized-v2-server-projection",
      approvedCurriculum: true, completeExpectedSubjects: true,
      meanAvailable: true, mentionsPolicyConfirmed: true,
    },
    grant: {
      id: "grant-a", userId: action === "review_submitted" ? "requester-a" : "approver-b",
      schoolId: scopeA.schoolId, capability: t.capability,
      startsAt: "2026-11-01T00:00:00.000Z",
      expiresAt: "2026-12-01T00:00:00.000Z",
      revokedAt: null, mandateVerified: true,
    },
    currentSourceDigest: "server-sha256-fictitious",
    studentAssignmentActive: true,
    expectedCaseVersion: 4,
    now: time,
    idempotencyKey: "unique-key-01",
    previouslyAcceptedKeys: [],
    reason: ["approval_refused", "correction_requested", "publication_revoked"].includes(action)
      ? "Motif fictif détaillé" : null,
  };
}
function evaluate(action="review_submitted", mutator=()=>{}) {
  const data=fixture(action);
  mutator(data);
  return evaluateProposedTransition(data);
}
function failedWith(result, code) {
  assert.equal(result.wouldPassDesignedChecks, false);
  assert.ok(result.problems.includes(code), JSON.stringify(result.problems));
  assert.equal(result.nextState, null);
  assert.equal(result.executionEnabled, false);
  assert.equal(result.eventWritten, false);
  assert.equal(result.publicationCreated, false);
}

test("S4-D.3j: seven adopted product decisions are not a production permission", () => {
  assert.equal(S4D3J_REVIEW_POLICY.productDecisionsAccepted, 7);
  assert.equal(S4D3J_REVIEW_POLICY.productRuleVersion, "S4-D.3i-A-2026-11-27");
  assert.equal(S4D3J_REVIEW_POLICY.hasActiveSchoolPolicy, false);
  assert.equal(S4D3J_REVIEW_POLICY.serverRpcsInstalled, false);
  assert.equal(S4D3J_REVIEW_POLICY.anyRealGrantCreated, false);
  assert.equal(S4D3J_REVIEW_POLICY.actualExecutionEnabled, false);
  assert.match(productPolicy, /7\/7 orientations A adoptées/);
});

test("S4-D.3j: all seven proposed transitions have unique events and capabilities", () => {
  const actions = Object.keys(PROPOSED_STATE_MACHINE);
  assert.deepEqual(actions, [
    "review_submitted", "correction_requested", "approval_refused",
    "approval_granted", "publication_authorized",
    "publication_executed", "publication_revoked",
  ]);
  assert.deepEqual(Object.values(PROPOSED_STATE_MACHINE).map(x=>x.capability),
    ["submit","decide","decide","decide","authorize_publication","execute_publication","withdraw"]);
});

test("S4-D.3j: valid synthetic submission is hypothetically eligible but cannot execute", () => {
  const result = evaluate();
  assert.equal(result.wouldPassDesignedChecks, true, result.problems.join(", "));
  assert.equal(result.nextState, "submitted");
  assert.equal(result.executionEnabled, false);
  assert.equal(result.eventWritten, false);
  assert.equal(result.publicationCreated, false);
});

test("S4-D.3j: no platform admin, teacher, parent or student can approve via role alone", () => {
  for (const role of ["admin","teacher","parent","student"]) {
    failedWith(evaluate("approval_granted", r => { r.actor.profileRole=role; }),
      "actor_not_authorized");
  }
});

test("S4-D.3j: foreign actor school and suspended school fail closed", () => {
  failedWith(evaluate("review_submitted", r=>{r.actor.schoolId=scopeB.schoolId;}),
    "actor_not_authorized");
  failedWith(evaluate("review_submitted", r=>{r.actor.schoolStatus="suspended";}),
    "actor_not_authorized");
});

test("S4-D.3j: revoked school membership immediately blocks even if grant remains active", () => {
  failedWith(evaluate("review_submitted", r=>{
    r.actor.membershipStatus="revoked";
    r.actor.membershipRevokedAt=time;
  }), "actor_not_authorized");
});

test("S4-D.3j: mismatched school/class/student context cannot be substituted", () => {
  for(const key of ["schoolId","schoolYearId","classId","periodId","studentId"]){
    failedWith(evaluate("review_submitted", r => {
      r.scope[key]="other-value";
    }), "scope_or_snapshot_mismatch");
  }
  failedWith(evaluate("review_submitted", r=>{r.caseRow.scope=scopeB;}),
    "scope_or_snapshot_mismatch");
  failedWith(evaluate("review_submitted", r=>{r.snapshot.scope=scopeB;}),
    "scope_or_snapshot_mismatch");
  failedWith(evaluate("review_submitted", r=>{r.caseRow.snapshotId="other-snapshot";}),
    "scope_or_snapshot_mismatch");
});

test("S4-D.3j: identity and credentials cannot come from unverified browser claims", () => {
  failedWith(evaluate("review_submitted", r=>{
    r.actor.kind="untrusted-browser-claims";
  }), "actor_not_authorized");
});

test("S4-D.3j: no grant and wrong action-specific grant are both rejected", () => {
  failedWith(evaluate("review_submitted", r=>{r.grant=null;}),
    "missing_active_explicit_capability");
  failedWith(evaluate("publication_executed", r=>{
    r.grant.capability="decide";
  }), "missing_active_explicit_capability");
});

test("S4-D.3j: foreign-user and cross-school grants are not accepted", () => {
  failedWith(evaluate("approval_granted", r=>{r.grant.userId="foreign-user";}),
    "missing_active_explicit_capability");
  failedWith(evaluate("approval_granted", r=>{r.grant.schoolId=scopeB.schoolId;}),
    "missing_active_explicit_capability");
  failedWith(evaluate("approval_granted", r=>{r.grant.mandateVerified=false;}),
    "missing_active_explicit_capability");
});

test("S4-D.3j: grants must be current and never revoked", () => {
  failedWith(evaluate("approval_granted", r=>{r.grant.revokedAt=time;}),
    "missing_active_explicit_capability");
  failedWith(evaluate("approval_granted", r=>{r.grant.expiresAt=time;}),
    "missing_active_explicit_capability");
  failedWith(evaluate("approval_granted", r=>{r.grant.startsAt="2026-12-01T00:00:00Z";}),
    "missing_active_explicit_capability");
});

test("S4-D.3j: unconfigured curriculum, missing score or missing mentions policy block review", () => {
  for(const key of ["approvedCurriculum","completeExpectedSubjects",
    "meanAvailable","mentionsPolicyConfirmed"]){
    failedWith(evaluate("review_submitted", r=>{r.snapshot[key]=false;}),
      "bulletin_not_complete");
  }
});

test("S4-D.3j: genuine zero does not trigger any invented missing-grade rule", () => {
  const r=fixture();
  r.snapshot.completeExpectedSubjects=true;
  r.snapshot.meanAvailable=true; // may represent a VALID published mean of 0
  const result=evaluateProposedTransition(r);
  assert.equal(result.wouldPassDesignedChecks,true);
  assert.equal(result.executionEnabled,false);
});

test("S4-D.3j: student no longer assigned blocks new approval and publication", () => {
  failedWith(evaluate("review_submitted",r=>{r.studentAssignmentActive=false;}),
    "student_assignment_inactive");
  failedWith(evaluate("publication_executed",r=>{r.studentAssignmentActive=false;}),
    "student_assignment_inactive");
});

test("S4-D.3j: source note/coefficient/policy change invalidates any pre-publication version", () => {
  for(const action of ["review_submitted","approval_granted",
    "publication_authorized","publication_executed"]){
    failedWith(evaluate(action,r=>{r.currentSourceDigest="changed-source-version";}),
      "obsolete_academic_version");
  }
});

test("S4-D.3j: old revision cannot override concurrently updated case", () => {
  failedWith(evaluate("approval_granted",r=>{r.expectedCaseVersion=3;}),
    "stale_case_version");
  failedWith(evaluate("approval_granted",r=>{r.expectedCaseVersion=5;}),
    "stale_case_version");
});

test("S4-D.3j: idempotent retry must not create duplicate event", () => {
  failedWith(evaluate("approval_granted",r=>{
    r.previouslyAcceptedKeys=["unique-key-01"];
  }), "idempotency_replay_or_invalid");
  failedWith(evaluate("approval_granted",r=>{r.idempotencyKey="";}),
    "idempotency_replay_or_invalid");
});

test("S4-D.3j: incorrect initial state cannot jump directly to publication", () => {
  failedWith(evaluate("publication_executed",r=>{r.caseRow.status="approved";}),
    "invalid_state_transition");
  failedWith(evaluate("publication_authorized",r=>{r.caseRow.status="draft";}),
    "invalid_state_transition");
});

test("S4-D.3j: maker-checker separation prevents all self-decisions", () => {
  for(const action of ["approval_granted","approval_refused","correction_requested"]){
    failedWith(evaluate(action,r=>{r.actor.actorId=r.caseRow.requesterId;}),
      "self_approval_forbidden");
  }
});

test("S4-D.3j: legitimate distinct approver can hypothetically approve, but no event is written", () => {
  const r=evaluate("approval_granted");
  assert.equal(r.wouldPassDesignedChecks,true,r.problems.join(","));
  assert.equal(r.nextState,"approved");
  assert.equal(r.eventWritten,false);
});

test("S4-D.3j: motivated refusal/correction require a nonempty reason", () => {
  for(const action of ["approval_refused","correction_requested"]){
    failedWith(evaluate(action,r=>{r.reason="";}),"reason_required");
    const success=evaluate(action);
    assert.equal(success.wouldPassDesignedChecks,true,success.problems.join(","));
  }
});

test("S4-D.3j: approval alone is not enough to authorize publication", () => {
  failedWith(evaluate("publication_authorized",r=>{r.caseRow.approverId=null;}),
    "no_prior_approval");
  failedWith(evaluate("publication_authorized",r=>{r.grant.capability="decide";}),
    "missing_active_explicit_capability");
});

test("S4-D.3j: same approver may authorize publication with distinct delegation only", () => {
  const r=evaluate("publication_authorized");
  assert.equal(r.wouldPassDesignedChecks,true,r.problems.join(","));
  assert.equal(r.nextState,"authorized_for_publication");
  assert.equal(r.executionEnabled,false);
});

test("S4-D.3j: future publisher cannot bypass recorded authorization or capability", () => {
  failedWith(evaluate("publication_executed",r=>{
    r.caseRow.publicationAuthorizerId=null;
  }), "missing_publication_authorization");
  failedWith(evaluate("publication_executed",r=>{r.grant.capability="authorize_publication";}),
    "missing_active_explicit_capability");
});

test("S4-D.3j: publication only hypothetically passes after distinct authorization", () => {
  const r=evaluate("publication_executed");
  assert.equal(r.wouldPassDesignedChecks,true,r.problems.join(","));
  assert.equal(r.nextState,"published");
  assert.equal(r.publicationCreated,false);
  assert.equal(r.executionEnabled,false);
});

test("S4-D.3j: published bulletin may be withdrawn after student transfer/source drift", () => {
  const r=evaluate("publication_revoked",data=>{
    data.studentAssignmentActive=false;
    data.currentSourceDigest="changed";
  });
  assert.equal(r.wouldPassDesignedChecks,true,r.problems.join(","));
  assert.equal(r.nextState,"withdrawn");
  assert.equal(r.eventWritten,false);
});

test("S4-D.3j: withdrawal always requires reason and withdraw capability", () => {
  failedWith(evaluate("publication_revoked",r=>{r.reason=" ";}),"reason_required");
  failedWith(evaluate("publication_revoked",r=>{r.grant.capability="decide";}),
    "missing_active_explicit_capability");
});

test("S4-D.3j: no real permissions, DB mutations or browser integration in simulator", () => {
  assert.doesNotMatch(simulator, /supabase|createClient|fetch\(|localStorage|window\.|\.rpc\(|\.insert\(|\.update\(|\.delete\(/i);
  assert.match(simulator,/executionEnabled: false/);
  assert.match(simulator,/eventWritten: false/);
  assert.match(simulator,/publicationCreated: false/);
  assert.match(doc,/0 autorisation effective/);
});

test("S4-D.3j: architecture never reuses V1 publish RPC or historical report_card tables", () => {
  assert.match(doc,/public\.publish_admin_report_card/);
  assert.match(doc,/Ne jamais réutiliser ni appeler/);
  assert.match(doc,/school_bulletin_v2_snapshots/);
  assert.match(doc,/school_bulletin_v2_events/);
  assert.match(doc,/school_bulletin_v2_grants/);
  assert.match(doc,/auth\.uid\(\)/);
  assert.match(doc,/FOR UPDATE/);
  assert.match(doc,/UNIQUE\(case_id,idempotency_key\)/);
});

test("S4-D.3j: no S4-D.3j migration can be installed automatically", () => {
  const migrations = readdirSync(new URL("../supabase/migrations/",import.meta.url));
  assert.equal(migrations.filter(name=>/s4d3j/i.test(name)).length,0);
  assert.match(doc,/Aucun nouveau fichier dans .*supabase\/migrations/);
});

test("S4-D.3j: no Vercel branch deployment, QA script defined", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(packageJSON.scripts["qa:s4d3j"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3j-workflow-contract.mjs");
});
