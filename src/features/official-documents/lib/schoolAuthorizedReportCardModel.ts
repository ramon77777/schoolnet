/** SCHOOLNET S4-D.3b — Strict per-student, read-only V2 subject projection.
 * A browser-side guard is NOT an authorization mechanism. The dedicated RPC
 * must independently check auth.uid(), school_admin role and active school.
 * Never adapt teacher-scoped or V1 raw grades to school-admin report cards.
 */
import {
  isOfficialCurriculum, isOfficialGeneralPreview,
  type GeneralScope, type OfficialCurriculum, type OfficialGeneralPreview,
} from "../../schools/lib/schoolOfficialGeneralAveragesModel.ts";

export type AuthorizedSubjectRow = {
  subjectId: string;
  subjectName: string;
  coefficient: number | null;
  state: "ready" | "incomplete" | "not_configured";
  averageOn20: number | null;
  includedAssessments: number;
  publishedAssessments: number;
  missingAssessments: number;
};
export type AuthorizedReportCardPreview = GeneralScope & {
  projection: "schoolnet_v2_report_card_provisional_v1";
  studentId: string;
  studentName: string;
  schoolAdminScoped: true;
  previewOnly: true;
  documentState: "provisional";
  state: AuthorizedSubjectRow["state"];
  averageOn20: number | null;
  expectedSubjects: number;
  readySubjects: number;
  subjects: AuthorizedSubjectRow[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const keysExact = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(v, key));
const integer = (v: unknown, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const average = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 20;
const coefficient = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0.25 && v <= 20 &&
  Math.abs(v * 100 - Math.round(v * 100)) < 1e-7;

export function isAuthorizedReportCardPreview(
  raw: unknown, scope: GeneralScope, studentId: string,
  curriculum: OfficialCurriculum, general: OfficialGeneralPreview,
): raw is AuthorizedReportCardPreview {
  if (!Object.values(scope).every(value => uuid.test(value)) ||
      !uuid.test(studentId) ||
      !isOfficialCurriculum(curriculum, scope) || curriculum.status !== "approved" ||
      !isOfficialGeneralPreview(general, scope) || general.state !== "preview" ||
      !obj(raw) || !keysExact(raw, [
        "projection", "schoolId", "schoolYearId", "classId", "periodId",
        "studentId", "studentName", "schoolAdminScoped", "previewOnly",
        "documentState", "state", "averageOn20", "expectedSubjects",
        "readySubjects", "subjects",
      ]) ||
      raw.projection !== "schoolnet_v2_report_card_provisional_v1" ||
      raw.studentId !== studentId || raw.schoolAdminScoped !== true ||
      raw.previewOnly !== true || raw.documentState !== "provisional" ||
      ["schoolId", "schoolYearId", "classId", "periodId"].some(
        key => raw[key] !== scope[key as keyof GeneralScope],
      ) ||
      !["ready", "incomplete", "not_configured"].includes(String(raw.state)) ||
      typeof raw.studentName !== "string" || raw.studentName.length < 1 ||
      raw.studentName.trim() !== raw.studentName || raw.studentName.length > 300 ||
      !integer(raw.expectedSubjects, 60) || raw.expectedSubjects < 1 ||
      !integer(raw.readySubjects, raw.expectedSubjects) ||
      raw.expectedSubjects !== curriculum.subjects.length ||
      raw.expectedSubjects !== general.expectedSubjects ||
      !Array.isArray(raw.subjects) ||
      raw.subjects.length !== raw.expectedSubjects) return false;

  const student = general.students.find(item => item.studentId === studentId);
  if (!student || raw.studentName !== student.studentName ||
      raw.state !== student.state || raw.averageOn20 !== student.averageOn20 ||
      raw.expectedSubjects !== student.expectedSubjects ||
      raw.readySubjects !== student.readySubjects) return false;

  const catalog = new Map(curriculum.subjects.map(s => [s.subjectId, s]));
  if (catalog.size !== curriculum.subjects.length) return false;
  const found = new Set<string>();
  let ready = 0;
  let weightedSum = 0;
  let weightTotal = 0;
  let visibleReadyGrades = 0;

  for (const rawSubject of raw.subjects) {
    if (!obj(rawSubject) || !keysExact(rawSubject, [
      "subjectId", "subjectName", "coefficient", "state", "averageOn20",
      "includedAssessments", "publishedAssessments", "missingAssessments",
    ]) || typeof rawSubject.subjectId !== "string" ||
        !uuid.test(rawSubject.subjectId) || found.has(rawSubject.subjectId) ||
        !["ready", "incomplete", "not_configured"].includes(String(rawSubject.state)) ||
        !integer(rawSubject.includedAssessments, 500) ||
        !integer(rawSubject.publishedAssessments, rawSubject.includedAssessments) ||
        !integer(rawSubject.missingAssessments, rawSubject.includedAssessments) ||
        rawSubject.missingAssessments !==
          rawSubject.includedAssessments - rawSubject.publishedAssessments) return false;

    const expected = catalog.get(rawSubject.subjectId);
    if (!expected || rawSubject.subjectName !== expected.subjectName ||
        rawSubject.coefficient !== expected.coefficient ||
        !(rawSubject.coefficient === null || coefficient(rawSubject.coefficient))) return false;
    if (rawSubject.state === "ready") {
      if (rawSubject.coefficient === null ||
          rawSubject.includedAssessments < 1 ||
          rawSubject.publishedAssessments !== rawSubject.includedAssessments ||
          !(rawSubject.averageOn20 === null || average(rawSubject.averageOn20))) return false;
      ready += 1;
      if (rawSubject.averageOn20 !== null) {
        visibleReadyGrades++;
        weightedSum += rawSubject.averageOn20 * rawSubject.coefficient;
        weightTotal += rawSubject.coefficient;
      }
    } else if (rawSubject.averageOn20 !== null) return false;
    found.add(rawSubject.subjectId);
  }
  if (found.size !== catalog.size || ready !== raw.readySubjects) return false;

  if (raw.state === "ready") {
    if (!average(raw.averageOn20) || ready !== raw.expectedSubjects ||
        visibleReadyGrades !== ready || weightTotal <= 0 ||
        Math.abs(weightedSum / weightTotal - raw.averageOn20) > 0.015) return false;
  } else {
    // Transfer_review suppresses all averages even if the individual subject
    // kernels counted all "ready" states. No partial transfer scores exposed.
    if (raw.averageOn20 !== null ||
        (visibleReadyGrades !== ready &&
         !(ready === raw.expectedSubjects && visibleReadyGrades === 0))) return false;
  }
  return true;
}

/** Validated projection only; never accepts a score or viewer identity from UI. */
export function validateAuthorizedReportCardPreview(
  raw: unknown, scope: GeneralScope, studentId: string,
  curriculum: OfficialCurriculum, general: OfficialGeneralPreview,
): AuthorizedReportCardPreview {
  if (!isAuthorizedReportCardPreview(raw, scope, studentId, curriculum, general))
    throw new Error("Bulletin V2 refusé : réponse serveur hors périmètre ou incohérente.");
  return raw;
}
