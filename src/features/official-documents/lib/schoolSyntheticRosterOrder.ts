/** SCHOOLNET S4-D.2c.3 — deterministic grade-roster ordering for synthetic QA.
 * This changes only the ORDER of already server-scoped student projections;
 * it MUST NOT select, filter, authorize or fetch any student record.
 * School jurisdiction and all grades are validated by preceding V2 contracts.
 */
import type { OfficialExportStudent } from "./schoolOfficialExportProjectionModel.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mark = /\p{M}/gu;
const safeName = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 &&
  value.length <= 120 && value.trim() === value &&
  !Array.from(value).some(char => {
    const cp = char.codePointAt(0) ?? 0;
    return cp < 32 || cp === 127;
  });
const key = (name: string) => name.normalize("NFD").replace(mark,"").toLowerCase();
const compare = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;

/** A stable French-oriented alphabetical order without environment-specific
 * Intl collations: strip combining accents, case fold and break ties by UUID.
 * Duplicate names are valid; duplicate student IDs are always rejected.
 * The input collection and student records are never modified.
 */
export function orderSchoolExportStudents(
  students: readonly OfficialExportStudent[],
): OfficialExportStudent[] {
  if (!Array.isArray(students) || students.length < 1 || students.length > 250)
    throw new Error("Effectif scolaire hors limites.");
  const ids = new Set<string>();
  const decorated = students.map(student => {
    if (!student || !uuid.test(student.studentId) ||
        !safeName(student.studentName) || ids.has(student.studentId)) {
      throw new Error("Identité d'élève incohérente dans le relevé.");
    }
    ids.add(student.studentId);
    return {student, sortName:key(student.studentName)};
  });
  decorated.sort((a,b) =>
    compare(a.sortName,b.sortName) ||
    compare(a.student.studentId.toLowerCase(),b.student.studentId.toLowerCase())
  );
  return decorated.map(v => v.student);
}
