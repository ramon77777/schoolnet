/** SCHOOLNET S4-D.2b — strict read-only V2 export projection guard.
 * Server RPC is NOT deployed and this module does not call Supabase.
 * A trusted scope and server authorization are mandatory. Browser validation
 * is defense-in-depth only, not permission to download a file.
 */
export type OfficialExportScope = {
  schoolId: string;
  periodId: string;
  classId: string;
  kind: "subject_period" | "class_general";
  subjectId: string | null;
  format: "pdf" | "xlsx";
};
export type OfficialExportStudent = {
  studentId: string;
  studentName: string;
  state: "ready" | "incomplete" | "not_configured";
  averageOn20: number | null;
  completedItems: number;
  expectedItems: number;
};
export type OfficialExportProjection = {
  projection: "schoolnet_v2_export_provisional_v1";
  previewOnly: true;
  documentState: "provisional";
  kind: OfficialExportScope["kind"];
  format: OfficialExportScope["format"];
  schoolId: string;
  schoolYearId: string;
  classId: string;
  periodId: string;
  subjectId: string | null;
  completionUnit: "matières" | "évaluations";
  studentCount: number;
  students: OfficialExportStudent[];
  auditId: string;
};

const idRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exact = (o: Record<string,unknown>, keys: readonly string[]) =>
  Object.keys(o).length === keys.length &&
  keys.every(key => Object.hasOwn(o,key));

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v);
const grade = (v: unknown) => typeof v === "number" && Number.isFinite(v) &&
  v >= 0 && v <= 20;

export function isOfficialExportProjection(
  raw: unknown,
  scope: OfficialExportScope,
): raw is OfficialExportProjection {
  if (!object(raw) || !exact(raw, [
    "projection","previewOnly","documentState","kind","format",
    "schoolId","schoolYearId","classId","periodId","subjectId",
    "completionUnit","studentCount","students","auditId",
  ]) || raw.projection !== "schoolnet_v2_export_provisional_v1" ||
      raw.previewOnly !== true || raw.documentState !== "provisional" ||
      raw.schoolId !== scope.schoolId || raw.periodId !== scope.periodId ||
      raw.classId !== scope.classId || raw.kind !== scope.kind ||
      raw.subjectId !== scope.subjectId || raw.format !== scope.format ||
      typeof raw.schoolYearId !== "string" || !idRx.test(raw.schoolYearId) ||
      typeof raw.auditId !== "string" || !idRx.test(raw.auditId) ||
      raw.completionUnit !== (scope.kind === "class_general" ? "matières" : "évaluations") ||
      !integer(raw.studentCount) || (raw.studentCount as number) < 1 ||
      (raw.studentCount as number) > 250 ||
      !Array.isArray(raw.students) || raw.students.length !== raw.studentCount) return false;

  const ids = new Set<string>();
  for (const value of raw.students) {
    if (!object(value) || !exact(value,[
      "studentId","studentName","state","averageOn20","completedItems","expectedItems",
    ]) || typeof value.studentId !== "string" || !idRx.test(value.studentId) ||
      ids.has(value.studentId) ||
      typeof value.studentName !== "string" ||
      value.studentName.trim() !== value.studentName ||
      value.studentName.length < 1 || value.studentName.length > 120 ||
      !["ready","incomplete","not_configured"].includes(String(value.state)) ||
      !integer(value.completedItems) || !integer(value.expectedItems) ||
      (value.expectedItems as number) < 1 ||
      (value.completedItems as number) < 0 ||
      (value.completedItems as number) > (value.expectedItems as number)) return false;

    if (value.state === "ready") {
      if (!grade(value.averageOn20) || value.completedItems !== value.expectedItems)
        return false;
    } else if (value.averageOn20 !== null) return false;
    ids.add(value.studentId);
  }
  return true;
}
