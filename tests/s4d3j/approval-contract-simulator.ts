/**
 * SCHOOLNET V2 - S4-D.3j / TEST-ONLY hypothetical transition evaluator.
 *
 * IMPORTANT:
 * - This file lives in tests/, never imported by runtime application.
 * - All inputs are mock "server-verified" fixtures, not proof of actual auth.
 * - It has no database, network, side effects, persistence or real permissions.
 * - Passing these tests DOES NOT authorize installation of SQL or production use.
 */
export type BulletinAction =
  | "review_submitted"
  | "correction_requested"
  | "approval_refused"
  | "approval_granted"
  | "publication_authorized"
  | "publication_executed"
  | "publication_revoked";
export type BulletinState =
  | "draft" | "submitted" | "correction_requested" | "refused"
  | "approved" | "authorized_for_publication" | "published" | "withdrawn";
export type ExplicitCapability =
  | "submit" | "decide" | "authorize_publication" | "execute_publication"
  | "withdraw";
export type SchoolScope = {
  schoolId: string; schoolYearId: string; classId: string;
  periodId: string; studentId: string;
};
export type VerifiedActorFixture = {
  kind: "server-verified-fixture";
  actorId: string;
  profileRole: "school_admin" | "admin" | "teacher" | "parent" | "student";
  schoolId: string;
  membershipStatus: "active" | "revoked";
  membershipRevokedAt: string | null;
  schoolStatus: "active" | "suspended";
};
export type DelegationFixture = {
  id: string;
  userId: string;
  schoolId: string;
  capability: ExplicitCapability;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  mandateVerified: boolean;
};
export type SnapshotFixture = {
  id: string;
  scope: SchoolScope;
  digest: string;
  immutable: true;
  sourceKind: "authorized-v2-server-projection";
  approvedCurriculum: boolean;
  completeExpectedSubjects: boolean;
  meanAvailable: boolean;
  mentionsPolicyConfirmed: boolean;
};
export type BulletinCaseFixture = {
  id: string;
  scope: SchoolScope;
  snapshotId: string;
  version: number;
  status: BulletinState;
  requesterId: string | null;
  approverId: string | null;
  publicationAuthorizerId: string | null;
};
export type HypotheticalRequest = {
  action: BulletinAction;
  actor: VerifiedActorFixture;
  grant: DelegationFixture | null;
  caseRow: BulletinCaseFixture;
  snapshot: SnapshotFixture;
  scope: SchoolScope;
  currentSourceDigest: string;
  studentAssignmentActive: boolean;
  expectedCaseVersion: number;
  now: string;
  idempotencyKey: string;
  previouslyAcceptedKeys: readonly string[];
  reason: string | null;
};
export type HypotheticalDecision = {
  wouldPassDesignedChecks: boolean;
  nextState: BulletinState | null;
  problems: readonly string[];
  executionEnabled: false;
  eventWritten: false;
  publicationCreated: false;
};

export const S4D3J_REVIEW_POLICY = Object.freeze({
  productDecisionsAccepted: 7,
  productRuleVersion: "S4-D.3i-A-2026-11-27",
  hasActiveSchoolPolicy: false,
  serverRpcsInstalled: false,
  anyRealGrantCreated: false,
  actualExecutionEnabled: false,
});

export const PROPOSED_STATE_MACHINE: Readonly<Record<
  BulletinAction,
  { from: BulletinState; to: BulletinState; capability: ExplicitCapability }
>> = {
  review_submitted: {
    from: "draft", to: "submitted", capability: "submit",
  },
  correction_requested: {
    from: "submitted", to: "correction_requested", capability: "decide",
  },
  approval_refused: {
    from: "submitted", to: "refused", capability: "decide",
  },
  approval_granted: {
    from: "submitted", to: "approved", capability: "decide",
  },
  publication_authorized: {
    from: "approved", to: "authorized_for_publication",
    capability: "authorize_publication",
  },
  publication_executed: {
    from: "authorized_for_publication", to: "published",
    capability: "execute_publication",
  },
  publication_revoked: {
    from: "published", to: "withdrawn", capability: "withdraw",
  },
} as const;

const scopeFields: readonly (keyof SchoolScope)[] = [
  "schoolId", "schoolYearId", "classId", "periodId", "studentId",
];
const sameScope = (left: SchoolScope, right: SchoolScope): boolean =>
  scopeFields.every(field =>
    typeof left[field] === "string" &&
    left[field].length > 0 &&
    left[field] === right[field]);
const parseTime = (v: string): number => Date.parse(v);
const validReason = (v: string | null): boolean =>
  typeof v === "string" && v.trim().length >= 5 && v.trim().length <= 2000;

export function evaluateProposedTransition(input: HypotheticalRequest): HypotheticalDecision {
  const problems: string[] = [];
  const transition = PROPOSED_STATE_MACHINE[input.action];
  if (!transition) {
    return {
      wouldPassDesignedChecks: false, nextState: null,
      problems: ["unknown_action"], executionEnabled: false,
      eventWritten: false, publicationCreated: false,
    };
  }

  const { actor, grant, caseRow, snapshot } = input;
  const now = parseTime(input.now);
  if (!Number.isFinite(now)) problems.push("invalid_server_time");
  if (actor.kind !== "server-verified-fixture" ||
      !actor.actorId || actor.profileRole !== "school_admin" ||
      actor.membershipStatus !== "active" ||
      actor.membershipRevokedAt !== null ||
      actor.schoolStatus !== "active" ||
      actor.schoolId !== input.scope.schoolId) problems.push("actor_not_authorized");
  if (!sameScope(caseRow.scope, input.scope) ||
      !sameScope(snapshot.scope, input.scope) ||
      caseRow.snapshotId !== snapshot.id ||
      snapshot.sourceKind !== "authorized-v2-server-projection" ||
      snapshot.immutable !== true ||
      !snapshot.digest) problems.push("scope_or_snapshot_mismatch");
  if (caseRow.status !== transition.from) problems.push("invalid_state_transition");
  if (!Number.isSafeInteger(caseRow.version) || caseRow.version < 1 ||
      input.expectedCaseVersion !== caseRow.version) problems.push("stale_case_version");
  if (!input.idempotencyKey ||
      input.idempotencyKey.length > 128 ||
      input.previouslyAcceptedKeys.includes(input.idempotencyKey))
    problems.push("idempotency_replay_or_invalid");
  if (!grant || !grant.id ||
      grant.userId !== actor.actorId ||
      grant.schoolId !== input.scope.schoolId ||
      grant.capability !== transition.capability ||
      grant.revokedAt !== null ||
      !grant.mandateVerified ||
      !Number.isFinite(parseTime(grant.startsAt)) ||
      !Number.isFinite(parseTime(grant.expiresAt)) ||
      !(parseTime(grant.startsAt) <= now && now < parseTime(grant.expiresAt)))
    problems.push("missing_active_explicit_capability");

  if (input.action !== "publication_revoked") {
    if (!input.studentAssignmentActive) problems.push("student_assignment_inactive");
    if (input.currentSourceDigest !== snapshot.digest)
      problems.push("obsolete_academic_version");
    if (!snapshot.approvedCurriculum ||
        !snapshot.completeExpectedSubjects ||
        !snapshot.meanAvailable ||
        !snapshot.mentionsPolicyConfirmed) problems.push("bulletin_not_complete");
  }

  if (input.action === "review_submitted") {
    if (caseRow.requesterId !== null) problems.push("request_already_claimed");
  } else {
    if (!caseRow.requesterId) problems.push("missing_requester");
  }
  if (["correction_requested", "approval_refused", "approval_granted"]
    .includes(input.action)) {
    if (caseRow.requesterId === actor.actorId)
      problems.push("self_approval_forbidden");
  }
  if (input.action === "publication_authorized" && !caseRow.approverId)
    problems.push("no_prior_approval");
  if (input.action === "publication_executed" &&
      (!caseRow.approverId || !caseRow.publicationAuthorizerId))
    problems.push("missing_publication_authorization");
  if (["correction_requested", "approval_refused", "publication_revoked"]
    .includes(input.action) && !validReason(input.reason))
    problems.push("reason_required");

  // This is a specification evaluator only; never mutate a case, write an
  // event, create an artifact or return an executable authorization.
  return Object.freeze({
    wouldPassDesignedChecks: problems.length === 0,
    nextState: problems.length === 0 ? transition.to : null,
    problems: Object.freeze(problems),
    executionEnabled: false,
    eventWritten: false,
    publicationCreated: false,
  });
}
