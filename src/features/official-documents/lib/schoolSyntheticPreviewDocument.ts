/** SCHOOLNET V2 S4-D.2c.2 — synthetic-only printable document from
 * a strictly validated S4-D.2b server projection contract.
 * Never import in browser routes. No real data, network calls or publication.
 */
import {
  assertMatchingOfficialExportProjection,
  type VerifiedExportViewer,
} from "./schoolOfficialExportPreviewBridge.ts";
import type { ExportRequest } from "./schoolOfficialExportPlanning.ts";

export const SYNTHETIC_EXPORT_LABEL = "RELEVÉ PROVISOIRE - NON PUBLIÉ";
export const SYNTHETIC_TEST_LABEL = "DONNÉES SYNTHÉTIQUES - RECETTE UNIQUEMENT";

export type SyntheticPreviewRow = {
  studentCode: string;
  studentName: string;
  state: "ready" | "incomplete" | "not_configured";
  completedItems: number;
  expectedItems: number;
  averageOn20: number | null;
};

export type SyntheticPreviewDocument = {
  source: "SCHOOLNET_V2_SYNTHETIC_QA_ONLY";
  syntheticOnly: true;
  provisionalOnly: true;
  format: "pdf" | "xlsx";
  schoolId: string;
  schoolYearId: string;
  classId: string;
  periodId: string;
  subjectId: string | null;
  auditId: string;
  kind: "subject_period" | "class_general";
  completionUnit: "matières" | "évaluations";
  schoolName: string;
  schoolYear: string;
  className: string;
  periodName: string;
  title: string;
  generatedAt: string;
  rows: SyntheticPreviewRow[];
};

export type SyntheticSchoolLabels = {
  source: "SCHOOLNET_SYNTHETIC_QA_LABELS";
  schoolId: string;
  schoolYearId: string;
  classId: string;
  periodId: string;
  subjectId: string | null;
  schoolName: string;
  schoolYear: string;
  className: string;
  periodName: string;
  subjectName: string | null;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const noBrowser = () => {
  if (typeof window !== "undefined") {
    throw new Error("S4-D.2c.2 : génération strictement interdite dans le navigateur.");
  }
};

const label = (s: unknown, max: number) =>
  typeof s === "string" && s.length > 0 && s.length <= max &&
  s.trim() === s && !Array.from(s).some(ch => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp < 32 || cp === 127;
  });

/** Local QA labels are for display ONLY, never used for authorization. */
export function makeSyntheticPreviewDocument(
  raw: unknown,
  request: ExportRequest,
  viewer: VerifiedExportViewer,
  labels: SyntheticSchoolLabels,
  generatedAt: string,
): SyntheticPreviewDocument {
  noBrowser();
  const projection = assertMatchingOfficialExportProjection(raw, request, viewer);
  if (!labels || labels.source !== "SCHOOLNET_SYNTHETIC_QA_LABELS" ||
      labels.schoolId !== projection.schoolId ||
      labels.schoolYearId !== projection.schoolYearId ||
      labels.classId !== projection.classId ||
      labels.periodId !== projection.periodId ||
      labels.subjectId !== projection.subjectId ||
      !label(labels.schoolName, 75) || !label(labels.schoolYear, 40) ||
      !label(labels.className, 40) || !label(labels.periodName, 55) ||
      (request.kind === "subject_period" ?
        !label(labels.subjectName, 50) : labels.subjectName !== null) ||
      typeof generatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(generatedAt) ||
      !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("Métadonnées synthétiques incohérentes, génération annulée.");
  }

  const title = projection.kind === "class_general"
    ? "Moyennes générales - " + labels.className
    : "Moyennes par matière - " + labels.subjectName;
  const document: SyntheticPreviewDocument = {
    source: "SCHOOLNET_V2_SYNTHETIC_QA_ONLY",
    syntheticOnly: true,
    provisionalOnly: true,
    format: projection.format,
    schoolId: projection.schoolId,
    schoolYearId: projection.schoolYearId,
    classId: projection.classId,
    periodId: projection.periodId,
    subjectId: projection.subjectId,
    auditId: projection.auditId,
    kind: projection.kind,
    completionUnit: projection.completionUnit,
    schoolName: labels.schoolName,
    schoolYear: labels.schoolYear,
    className: labels.className,
    periodName: labels.periodName,
    title,
    generatedAt,
    rows: projection.students.map((student, i) => ({
      // For tests, print a row number, not the internal student's UUID.
      studentCode: String(i + 1).padStart(3, "0"),
      studentName: student.studentName,
      state: student.state,
      completedItems: student.completedItems,
      expectedItems: student.expectedItems,
      averageOn20: student.averageOn20,
    })),
  };
  assertSyntheticPreviewDocument(document);
  return document;
}

/** Defense-in-depth against accidentally passing a V1 or real-data document. */
export function assertSyntheticPreviewDocument(
  value: unknown,
): asserts value is SyntheticPreviewDocument {
  noBrowser();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Relevé de recette synthétique invalide.");
  }
  const d = value as SyntheticPreviewDocument;
  const keys = [
    "source","syntheticOnly","provisionalOnly","format",
    "schoolId","schoolYearId","classId","periodId","subjectId","auditId",
    "kind","completionUnit","schoolName","schoolYear","className",
    "periodName","title","generatedAt","rows",
  ];
  if (Object.keys(d).length !== keys.length ||
      !keys.every(k => Object.prototype.hasOwnProperty.call(d,k)) ||
      d.source !== "SCHOOLNET_V2_SYNTHETIC_QA_ONLY" ||
      d.syntheticOnly !== true || d.provisionalOnly !== true ||
      !["pdf","xlsx"].includes(d.format) ||
      !["subject_period","class_general"].includes(d.kind) ||
      d.completionUnit !== (d.kind === "class_general" ? "matières" : "évaluations") ||
      (d.kind === "subject_period" && !d.subjectId) ||
      (d.kind === "class_general" && d.subjectId !== null) ||
      ![d.schoolId,d.schoolYearId,d.classId,d.periodId,d.auditId].every(x =>
        typeof x === "string" && uuid.test(x)) ||
      (d.subjectId !== null && (typeof d.subjectId !== "string" || !uuid.test(d.subjectId))) ||
      typeof d.generatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(d.generatedAt) ||
      !Number.isFinite(Date.parse(d.generatedAt)) ||
      !label(d.schoolName,75) || !label(d.schoolYear,40) ||
      !label(d.className,40) || !label(d.periodName,55) ||
      !label(d.title,110) ||
      !Array.isArray(d.rows) || d.rows.length < 1 || d.rows.length > 250) {
    throw new Error("Ce relevé ne peut être utilisé que pour la recette synthétique.");
  }
  const codes = new Set<string>();
  for (const r of d.rows) {
    if (!r || typeof r !== "object" ||
        Object.keys(r).length !== 6 ||
        !["studentCode","studentName","state","completedItems","expectedItems","averageOn20"]
          .every(k => Object.prototype.hasOwnProperty.call(r,k)) ||
        typeof r.studentCode !== "string" || !/^\d{3}$/.test(r.studentCode) ||
        codes.has(r.studentCode) || !label(r.studentName,120) ||
        !["ready","incomplete","not_configured"].includes(r.state) ||
        !Number.isSafeInteger(r.completedItems) ||
        !Number.isSafeInteger(r.expectedItems) ||
        r.completedItems < 0 || r.expectedItems < 1 ||
        r.completedItems > r.expectedItems ||
        (r.state === "ready"
          ? r.completedItems !== r.expectedItems ||
            typeof r.averageOn20 !== "number" ||
            !Number.isFinite(r.averageOn20) ||
            r.averageOn20 < 0 || r.averageOn20 > 20
          : r.averageOn20 !== null)) {
      throw new Error("Ligne d'élève incorrecte ou moyenne scolaire non calculable.");
    }
    codes.add(r.studentCode);
  }
}

export const syntheticFrenchState = (state: SyntheticPreviewRow["state"]) =>
  state === "ready" ? "Calculable" :
  state === "incomplete" ? "À compléter" : "À configurer";

export const syntheticFrenchAverage = (value: number | null) =>
  value === null ? "—" :
  value.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2});
