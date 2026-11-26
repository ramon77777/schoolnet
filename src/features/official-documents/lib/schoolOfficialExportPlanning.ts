/**
 * SCHOOLNET V2 — S4-D.1 — export eligibility DESIGN CONTRACT.
 *
 * IMPORTANT: this file never authorizes a real export. It models the required
 * server-side decisions for a future school-scoped PDF/XLSX export RPC.
 * No student data, grades or report cards are read by this module.
 */
export const OFFICIAL_EXPORT_KINDS = [
  "subject_period", "class_subjects", "class_general",
] as const;
export const OFFICIAL_EXPORT_FORMATS = ["pdf", "xlsx"] as const;
export const OFFICIAL_EXPORT_CADENCES = [
  "trimester", "semester", "annual",
] as const;
export const OFFICIAL_EXPORT_STATES = [
  "provisional", "published",
] as const;

export type ExportKind = typeof OFFICIAL_EXPORT_KINDS[number];
export type ExportFormat = typeof OFFICIAL_EXPORT_FORMATS[number];
export type ExportCadence = typeof OFFICIAL_EXPORT_CADENCES[number];
export type ExportState = typeof OFFICIAL_EXPORT_STATES[number];
export type ExportActorRole = "school_admin" | "teacher";

export type ExportScope = {
  schoolId: string;
  schoolYearId: string;
  classId: string;
  /** Null only for annual export, after a validated annual policy. */
  periodId: string | null;
};

export type SchoolSubjectAssignment = {
  schoolId: string;
  schoolYearId: string;
  classId: string;
  subjectId: string;
};

export type SchoolSummaryDelegation = ExportScope & {
  kind: "class_subjects" | "class_general";
  /** A coefficient-editing delegation is NOT a summary export delegation. */
  canExportSchoolwideResults: true;
};

export type ExportPlanningContext = {
  viewerId: string;
  role: ExportActorRole;
  membershipActive: boolean;
  allowedSchoolIds: readonly string[];
  teacherSubjectAssignments: readonly SchoolSubjectAssignment[];
  summaryExportDelegations: readonly SchoolSummaryDelegation[];
  /** Server-trusted facts MUST be checked again by the export RPC. */
  periodConfigured: boolean;
  annualPolicyApproved: boolean;
  annualPeriodsComplete: boolean;
  v2ProjectionAvailable: boolean;
  /** Server-side immutable publication reference required for official export. */
  publishedSnapshotId: string | null;
};

export type ExportRequest = {
  viewerId: string;
  role: ExportActorRole;
  scope: ExportScope;
  kind: ExportKind;
  cadence: ExportCadence;
  format: ExportFormat;
  state: ExportState;
  subjectId: string | null;
};

export type ExportPlanReason =
  | "INVALID_SCOPE" | "INACTIVE_MEMBER" | "OTHER_SCHOOL"
  | "MISSING_PERIOD" | "ANNUAL_POLICY_PENDING" | "ANNUAL_PERIODS_INCOMPLETE"
  | "SUBJECT_REQUIRED" | "SUBJECT_NOT_APPLICABLE"
  | "SUBJECT_NOT_ASSIGNED" | "SPECIFIC_EXPORT_DELEGATION_REQUIRED"
  | "V2_PROJECTION_PENDING" | "PUBLICATION_SNAPSHOT_REQUIRED"
  | "MISMATCHED_USER_OR_ROLE";

export type ExportPlan = {
  /** This is NOT an actual server authorization to export. */
  eligibleForServerReview: boolean;
  blockers: ExportPlanReason[];
  statusLabel: "RELEVÉ PROVISOIRE — NON PUBLIÉ" | "DOCUMENT OFFICIEL PUBLIÉ";
  fileExtension: ".pdf" | ".xlsx";
  /** Always pending until a dedicated server export RPC verifies permissions. */
  realDownloadAvailable: false;
};

const hasId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(value);
const matchesScope = (a: ExportScope, b: ExportScope) =>
  a.schoolId === b.schoolId &&
  a.schoolYearId === b.schoolYearId &&
  a.classId === b.classId &&
  a.periodId === b.periodId;

export function planSchoolOfficialExport(
  request: ExportRequest,
  context: ExportPlanningContext,
): ExportPlan {
  const blockers: ExportPlanReason[] = [];
  const { scope, role } = request;
  if (!hasId(request.viewerId) || !hasId(scope.schoolId) ||
      !hasId(scope.schoolYearId) || !hasId(scope.classId) ||
      (scope.periodId !== null && !hasId(scope.periodId))) blockers.push("INVALID_SCOPE");

  if (!context.membershipActive) blockers.push("INACTIVE_MEMBER");
  if (context.viewerId !== request.viewerId || context.role !== request.role)
    blockers.push("MISMATCHED_USER_OR_ROLE");
  if (!context.allowedSchoolIds.includes(scope.schoolId)) blockers.push("OTHER_SCHOOL");

  if (request.cadence === "annual") {
    if (scope.periodId !== null) blockers.push("INVALID_SCOPE");
    if (!context.annualPolicyApproved) blockers.push("ANNUAL_POLICY_PENDING");
    if (!context.annualPeriodsComplete) blockers.push("ANNUAL_PERIODS_INCOMPLETE");
  } else if (scope.periodId === null || !context.periodConfigured)
    blockers.push("MISSING_PERIOD");

  if (request.kind === "subject_period") {
    if (!hasId(request.subjectId)) blockers.push("SUBJECT_REQUIRED");
    else if (role === "teacher" && !context.teacherSubjectAssignments.some((assignment) =>
      assignment.schoolId === scope.schoolId &&
      assignment.schoolYearId === scope.schoolYearId &&
      assignment.classId === scope.classId && assignment.subjectId === request.subjectId))
      blockers.push("SUBJECT_NOT_ASSIGNED");
  } else {
    if (request.subjectId !== null) blockers.push("SUBJECT_NOT_APPLICABLE");
    if (role === "teacher" && !context.summaryExportDelegations.some((grant) =>
      grant.canExportSchoolwideResults === true && grant.kind === request.kind &&
      matchesScope(grant, scope)))
      blockers.push("SPECIFIC_EXPORT_DELEGATION_REQUIRED");
  }

  if (!context.v2ProjectionAvailable) blockers.push("V2_PROJECTION_PENDING");
  if (request.state === "published" && !hasId(context.publishedSnapshotId))
    blockers.push("PUBLICATION_SNAPSHOT_REQUIRED");

  return {
    eligibleForServerReview: blockers.length === 0,
    blockers: [...new Set(blockers)],
    statusLabel: request.state === "published"
      ? "DOCUMENT OFFICIEL PUBLIÉ" : "RELEVÉ PROVISOIRE — NON PUBLIÉ",
    fileExtension: request.format === "pdf" ? ".pdf" : ".xlsx",
    realDownloadAvailable: false,
  };
}

export const OFFICIAL_EXPORT_CATALOG: readonly {
  kind: ExportKind;
  name: string;
  description: string;
}[] = [
  { kind: "subject_period", name: "Moyennes par matière",
    description: "Une matière et ses élèves, sur une période configurée." },
  { kind: "class_subjects", name: "Tableau de classe — toutes matières",
    description: "Matières, coefficients et états par élève (accès étendu nécessaire)." },
  { kind: "class_general", name: "Moyennes générales de la classe",
    description: "Moyennes générales calculées côté serveur, sans notes brutes." },
];

export const OFFICIAL_EXPORT_CADENCE_CATALOG: readonly {
  cadence: ExportCadence;
  label: string;
  requirement: string;
}[] = [
  { cadence: "trimester", label: "Trimestriel",
    requirement: "Trimestre réellement configuré pour cette classe et cette année." },
  { cadence: "semester", label: "Semestriel",
    requirement: "Semestre réellement configuré, sans mélanger les trimestres." },
  { cadence: "annual", label: "Annuel",
    requirement: "Pondération annuelle approuvée et toutes périodes obligatoires complètes." },
];
