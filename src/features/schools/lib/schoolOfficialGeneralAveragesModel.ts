/** SCHOOLNET V2 / S4-C.3-C.4
 * Strict, school-admin-only projections from the proposed C.3-C.3.3 RPCs.
 * No note, copy, raw grade or V1 average is accepted in the browser.
 */
export type GeneralScope = {
  schoolId: string;
  schoolYearId: string;
  classId: string;
  periodId: string;
};

export type CurriculumSubject = {
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
};

export type OfficialCurriculum = GeneralScope & {
  status: "missing" | "draft" | "approved";
  approvedAt: string | null;
  subjects: CurriculumSubject[];
};

export type GeneralStudent = {
  studentId: string;
  studentName: string;
  state: "ready" | "incomplete" | "not_configured";
  averageOn20: number | null;
  expectedSubjects: number;
  readySubjects: number;
};

export type OfficialGeneralPreview = GeneralScope & {
  schoolAdminScoped: true;
  previewOnly: true;
  state: "preview" | "not_configured";
  expectedSubjects: number;
  studentCount: number;
  students: GeneralStudent[];
};

export type GeneralFilter = "all" | GeneralStudent["state"];
export const GENERAL_PAGE_SIZE = 20;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

const id = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 100;
const label = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 300;
const count = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const average = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 20;
const coefficient = (v: unknown): boolean =>
  v === null || (average(v) && v >= 0.25);

export function matchesGeneralScope(value: unknown, scope: GeneralScope): boolean {
  if (!object(value)) return false;
  return (["schoolId", "schoolYearId", "classId", "periodId"] as const)
    .every((field) => id(scope[field]) && value[field] === scope[field]);
}

export function isOfficialCurriculum(
  value: unknown,
  scope: GeneralScope,
): value is OfficialCurriculum {
  if (!object(value) || !matchesGeneralScope(value, scope) ||
    !exact(value, ["schoolId", "schoolYearId", "classId", "periodId",
      "status", "approvedAt", "subjects"]) ||
    !["missing", "draft", "approved"].includes(String(value.status)) ||
    !(value.approvedAt === null || typeof value.approvedAt === "string") ||
    !Array.isArray(value.subjects) || value.subjects.length > 60) return false;

  const subjectIds = new Set<string>();
  for (const subject of value.subjects) {
    if (!object(subject) || !exact(subject, ["subjectId", "subjectName", "coefficient"]) ||
      !id(subject.subjectId) || !label(subject.subjectName) ||
      !coefficient(subject.coefficient) || subjectIds.has(subject.subjectId)) return false;
    subjectIds.add(subject.subjectId);
  }
  return value.status !== "approved" || value.subjects.length > 0;
}

export function isOfficialGeneralPreview(
  value: unknown,
  scope: GeneralScope,
): value is OfficialGeneralPreview {
  if (!object(value) || !matchesGeneralScope(value, scope) ||
    !exact(value, ["schoolId", "schoolYearId", "classId", "periodId",
      "schoolAdminScoped", "previewOnly", "state", "expectedSubjects",
      "studentCount", "students"]) ||
    value.schoolAdminScoped !== true || value.previewOnly !== true ||
    !["preview", "not_configured"].includes(String(value.state)) ||
    !count(value.expectedSubjects, 60) || !count(value.studentCount, 250) ||
    !Array.isArray(value.students) || value.studentCount !== value.students.length) return false;

  if (value.state === "not_configured") {
    return value.studentCount === 0 && value.students.length === 0;
  }
  if (value.expectedSubjects < 1) return false;
  const seen = new Set<string>();
  for (const student of value.students) {
    if (!object(student) ||
      !exact(student, ["studentId", "studentName", "state", "averageOn20",
        "expectedSubjects", "readySubjects"]) ||
      !id(student.studentId) || seen.has(student.studentId) ||
      !label(student.studentName) ||
      !["ready", "incomplete", "not_configured"].includes(String(student.state)) ||
      !count(student.expectedSubjects, 60) ||
      student.expectedSubjects !== value.expectedSubjects ||
      !count(student.readySubjects, student.expectedSubjects)) return false;
    if (student.state === "ready") {
      if (!average(student.averageOn20) ||
        student.readySubjects !== student.expectedSubjects) return false;
    } else if (student.averageOn20 !== null) return false;
    seen.add(student.studentId);
  }
  return true;
}

/** Search and display only. Never infer a missing/invalid grade as zero. */
export function filterGeneralStudents(
  students: readonly GeneralStudent[],
  search: string,
  state: GeneralFilter,
): GeneralStudent[] {
  const query = search.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return students.filter((row) => {
    if (state !== "all" && row.state !== state) return false;
    const name = row.studentName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return name.includes(query);
  });
}

export function summarizeGeneralStudents(students: readonly GeneralStudent[]) {
  return {
    total: students.length,
    ready: students.filter((student) => student.state === "ready").length,
    incomplete: students.filter((student) => student.state === "incomplete").length,
    notConfigured: students.filter((student) => student.state === "not_configured").length,
  };
}

export function displayGeneralAverage(student: GeneralStudent): string {
  return student.state === "ready" && student.averageOn20 !== null
    ? student.averageOn20.toLocaleString("fr-FR", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }) + " / 20"
    : "—";
}
