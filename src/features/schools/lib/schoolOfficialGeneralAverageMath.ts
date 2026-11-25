/**
 * SCHOOLNET V2 / S4-C.3-C.2 — general average, pure reference contract.
 *
 * NOT an authorization boundary, database reader, school catalogue, report-card
 * generator or publication service. Only an already-authorized PostgreSQL service
 * may construct these inputs from a verified school-local curriculum and roster.
 * Never supply unpublished assessment submissions to a browser from this module.
 *
 * Reuses the tested C.3-B.1 subject + general math without modifying its rules.
 */
import {
  computeOfficialAveragePreview,
  type OfficialAssessmentForAverage,
  type OfficialSubjectCoefficient,
} from "./schoolOfficialAverageMath";

export type OfficialSchoolScope = {
  schoolId: string;
  schoolYearId: string;
  classId: string;
  periodId: string;
  studentId: string;
};

type ScopedSchoolContext = Omit<OfficialSchoolScope, "studentId">;

/** Explicit school-approved subject, not inferred from teacher assignments. */
export type OfficialExpectedSubject = ScopedSchoolContext & OfficialSubjectCoefficient & {
  participation: "required" | "exemption_pending";
};

/** Only server-verified, school-local assessment projections are allowed. */
export type OfficialScopedAssessment =
  OfficialSchoolScope & OfficialAssessmentForAverage;

export type OfficialGeneralInput = {
  scope: OfficialSchoolScope;
  /** True ONLY after school_admin approval verified in the future SQL service. */
  curriculumApproved: boolean;
  /** Pending transfer never silently drops a student or a subject. */
  enrollmentState: "active" | "transfer_review";
  expectedSubjects: readonly OfficialExpectedSubject[];
  assessments: readonly OfficialScopedAssessment[];
};

export type OfficialGeneralSubjectState =
  | "ready"
  | "incomplete"
  | "not_configured"
  | "exemption_pending";

export type OfficialGeneralSubjectPreview = {
  subjectId: string;
  coefficient: number | null;
  state: OfficialGeneralSubjectState;
  averageOn20: number | null;
  includedAssessments: number;
  publishedAssessments: number;
  missingAssessments: number;
};

export type OfficialGeneralPreview = {
  previewOnly: true;
  state: "ready" | "incomplete" | "not_configured";
  averageOn20: number | null;
  expectedSubjects: number;
  readySubjects: number;
  subjects: OfficialGeneralSubjectPreview[];
};

const schoolFields = [
  "schoolId",
  "schoolYearId",
  "classId",
  "periodId",
] as const;

function invalid(reason: string): never {
  throw new Error("C3C2_INVALID_INPUT:" + reason);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 100;
}

function assertSchoolScope(
  row: ScopedSchoolContext,
  scope: OfficialSchoolScope,
): void {
  for (const field of schoolFields) {
    if (row[field] !== scope[field]) invalid("FOREIGN_SCHOOL_CONTEXT");
  }
}

/**
 * Trusted-data calculation contract for ONE student in ONE school-local period.
 * No school-admin or teacher permissions are inferred here: C.3-C.3 SQL must
 * authorize the caller, catalogue approval, enrollments and any exemptions.
 */
export function computeSchoolOfficialGeneralPreview(
  input: OfficialGeneralInput,
): OfficialGeneralPreview {
  if (!input || typeof input !== "object" || !input.scope) {
    invalid("MISSING_SCOPE");
  }
  const scope = input.scope;
  if (![...schoolFields, "studentId"].every((field) =>
    validId(scope[field as keyof OfficialSchoolScope])
  )) invalid("INVALID_SCOPE");

  if (typeof input.curriculumApproved !== "boolean" ||
      !["active", "transfer_review"].includes(input.enrollmentState) ||
      !Array.isArray(input.expectedSubjects) ||
      !Array.isArray(input.assessments)) {
    invalid("INVALID_CONTRACT");
  }
  if (input.expectedSubjects.length > 200 || input.assessments.length > 3000) {
    invalid("TOO_MANY_ITEMS");
  }

  const subjectIds = new Set<string>();
  for (const subject of input.expectedSubjects) {
    if (!subject || !validId(subject.subjectId)) invalid("INVALID_SUBJECT");
    assertSchoolScope(subject, scope);
    if (subjectIds.has(subject.subjectId)) invalid("DUPLICATE_SUBJECT");
    if (!["required", "exemption_pending"].includes(subject.participation)) {
      invalid("INVALID_PARTICIPATION");
    }
    subjectIds.add(subject.subjectId);
  }

  const assessmentIds = new Set<string>();
  for (const assessment of input.assessments) {
    if (!assessment || !validId(assessment.assessmentId)) {
      invalid("INVALID_ASSESSMENT");
    }
    assertSchoolScope(assessment, scope);
    if (assessment.studentId !== scope.studentId) {
      invalid("FOREIGN_STUDENT");
    }
    if (!subjectIds.has(assessment.subjectId)) {
      invalid("UNEXPECTED_SUBJECT");
    }
    if (assessmentIds.has(assessment.assessmentId)) {
      invalid("DUPLICATE_ASSESSMENT");
    }
    assessmentIds.add(assessment.assessmentId);
  }

  // Delegate score/barème/coefficient/visibility validation and exact weighted
  // math to B.1. The B.1 engine keeps the unrounded subject values internally.
  const reference = computeOfficialAveragePreview(
    input.expectedSubjects.map(({subjectId, coefficient}) =>
      ({subjectId, coefficient})),
    input.assessments.map(({
      assessmentId, subjectId, coefficient, includeInAverage,
      status, score, maxScore, publishedAt,
    }) => ({
      assessmentId, subjectId, coefficient, includeInAverage,
      status, score, maxScore, publishedAt,
    })),
  );

  const rows = reference.subjects.map((subject, index) => {
    const expected = input.expectedSubjects[index];
    let state: OfficialGeneralSubjectState;
    if (expected.participation === "exemption_pending") {
      state = "exemption_pending";
    } else if (subject.coefficient === null ||
               subject.includedAssessments === 0) {
      state = "not_configured";
    } else if (subject.missingAssessments > 0 ||
               subject.averageOn20 === null) {
      state = "incomplete";
    } else {
      state = "ready";
    }
    const canShow = input.curriculumApproved &&
      input.enrollmentState === "active" && state === "ready";
    return {
      subjectId: subject.subjectId,
      coefficient: subject.coefficient,
      state,
      averageOn20: canShow ? subject.averageOn20 : null,
      includedAssessments: subject.includedAssessments,
      publishedAssessments: subject.publishedAssessments,
      missingAssessments: subject.missingAssessments,
    };
  });

  const hasConfigurationGap = rows.some((r) =>
    r.state === "not_configured");
  const state: OfficialGeneralPreview["state"] =
    !input.curriculumApproved || rows.length === 0 || hasConfigurationGap
      ? "not_configured"
      : input.enrollmentState !== "active" ||
        reference.state !== "ready" ||
        rows.some((r) => r.state !== "ready")
        ? "incomplete"
        : "ready";

  return {
    previewOnly: true,
    state,
    averageOn20: state === "ready" ? reference.averageOn20 : null,
    expectedSubjects: rows.length,
    readySubjects: rows.filter((r) => r.state === "ready").length,
    subjects: rows,
  };
}
