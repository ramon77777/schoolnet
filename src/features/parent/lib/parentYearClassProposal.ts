/**
 * SCHOOLNET Lot 5D-H - year-aware Parent class resolution, PURE PROPOSAL.
 * Not connected to the live Parent page. Parents cannot directly SELECT
 * student_enrollments in the installed schema. A future authorized read-only
 * server API must verify parent_links before supplying annualEnrollments.
 * Never use profiles.child_ids as a permission source.
 */
export type LinkedStudent = { student_id: string };
export type AnnualClassInfo = { id: string; name: string | null };
export type AnnualEnrollmentInfo = {
  student_id: string;
  school_year_id: string;
  class_id: string;
  status: string;
};
export type CurrentYearClassState =
  | "current"
  | "unassigned"
  | "unavailable"
  | "conflict";
export type CurrentYearClass = {
  studentId: string;
  state: CurrentYearClassState;
  className: string | null;
};

export function resolveAuthorizedCurrentYearClasses(input: {
  verifiedParentLinks: readonly LinkedStudent[];
  currentYearId: string | null;
  annualEnrollments: readonly AnnualEnrollmentInfo[] | null;
  classes: readonly AnnualClassInfo[];
}): CurrentYearClass[] {
  const studentIds = [...new Set(
    input.verifiedParentLinks.map((link) => link.student_id?.trim())
      .filter((id): id is string => !!id),
  )];
  const classNames = new Map(input.classes.map((row) => [row.id, row.name]));
  return studentIds.map((studentId): CurrentYearClass => {
    if (!input.currentYearId || input.annualEnrollments === null) {
      return { studentId, state: "unavailable", className: null };
    }
    const matching = input.annualEnrollments.filter((row) =>
      row.student_id === studentId &&
      row.school_year_id === input.currentYearId &&
      row.status === "active",
    );
    if (matching.length > 1) {
      return { studentId, state: "conflict", className: null };
    }
    if (matching.length === 0) {
      return { studentId, state: "unassigned", className: null };
    }
    const className = classNames.get(matching[0].class_id)?.trim() || null;
    return className
      ? { studentId, state: "current", className }
      : { studentId, state: "unavailable", className: null };
  });
}
