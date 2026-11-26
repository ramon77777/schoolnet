/** SCHOOLNET V2 / S4-D.2a
 * This document model is ONLY a LOCAL FICTIONAL FIXTURE.
 * A separate server-signed, scope-limited export projection is required
 * before real student information can ever use an export renderer.
 */
import type { ExportRequest, ExportPlan } from "./schoolOfficialExportPlanning.ts";

export type FictionalExportRow = {
  studentCode: string;
  studentName: string;
  state: "ready" | "incomplete" | "not_configured";
  completedItems: number;
  expectedItems: number;
  averageOn20: number | null;
};

export type FictionalExportDocument = {
  source: "SCHOOLNET_LOCAL_FICTITIOUS";
  provisionalOnly: true;
  schoolName: string;
  schoolYear: string;
  className: string;
  periodName: string;
  kind: "subject_period" | "class_general";
  completionUnit: "matières" | "évaluations";
  title: string;
  generatedAt: string;
  rows: FictionalExportRow[];
};

export const FICTIONAL_EXPORT_LABEL = "RELEVÉ PROVISOIRE - NON PUBLIÉ";
export const FICTIONAL_TEST_LABEL = "DONNÉES FICTIVES - TEST LOCAL";

const names = ["Élève fictif"];
const states: FictionalExportRow["state"][] = [
  "ready", "ready", "incomplete", "not_configured", "ready",
  "ready", "ready", "incomplete", "ready", "not_configured",
  "ready", "ready", "incomplete",
];
const generalAverages = [16.67, 0, null, null, 12.88, 13.5, 13.87, null, 14.76, null, 15.79, 16.17, null];
const mathAverages = [17.25, 0, null, null, 11.5, 14.25, 13, null, 15, null, 16.75, 18, null];
const frenchAverages = [14.5, 9.75, null, null, 13, 12.25, 15.5, null, 12, null, 14.25, 16, null];

const SCHOOL_A = "00000000-0000-4000-8000-000000000100";
const YEAR = "00000000-0000-4000-8000-000000000110";
const CLASS = "00000000-0000-4000-8000-000000000120";
const MATH = "00000000-0000-4000-8000-000000000150";
const FRENCH = "00000000-0000-4000-8000-000000000151";

export function makeFictionalExportDocument(
  request: ExportRequest,
  plan: ExportPlan,
): FictionalExportDocument {
  if (!plan.eligibleForServerReview || plan.realDownloadAvailable ||
      request.state !== "provisional" ||
      !["pdf", "xlsx"].includes(request.format) ||
      !["subject_period", "class_general"].includes(request.kind) ||
      request.cadence === "annual" ||
      request.scope.schoolId !== SCHOOL_A ||
      request.scope.schoolYearId !== YEAR ||
      request.scope.classId !== CLASS ||
      (request.kind === "subject_period" && ![MATH, FRENCH].includes(request.subjectId ?? ""))) {
    throw new Error("Export de test refusé : périmètre, publication ou format non pris en charge.");
  }
  const kind = request.kind as FictionalExportDocument["kind"];
  const periodName = request.cadence === "semester" ? "1er semestre (fictif)"
    : "1er trimestre (fictif)";
  const completionUnit = kind === "class_general" ? "matières" : "évaluations";
  const title = kind === "class_general"
    ? "Moyennes générales - 6e B"
    : "Moyennes par matière - " +
      (request.subjectId === MATH ? "Mathématiques" : "Français");
  const scores = kind === "class_general" ? generalAverages
    : request.subjectId === MATH ? mathAverages : frenchAverages;
  const rows = states.map((state, index) => ({
    studentCode: "TEST-" + String(index + 1).padStart(3, "0"),
    studentName: names[0] + " " + String(index + 1).padStart(2, "0"),
    state,
    completedItems: state === "ready" ? 3 : state === "incomplete" ? 2 : 0,
    expectedItems: 3,
    averageOn20: state === "ready" ? scores[index] : null,
  }));
  return {
    source: "SCHOOLNET_LOCAL_FICTITIOUS",
    provisionalOnly: true,
    schoolName: "Établissement fictif A",
    schoolYear: "2026–2027 (fictive)",
    className: "6e B (fictive)",
    periodName,
    kind,
    completionUnit,
    title,
    generatedAt: new Date().toISOString(),
    rows,
  };
}

export function assertFictionalExportDocument(
  value: unknown,
): asserts value is FictionalExportDocument {
  if (!value || typeof value !== "object") throw new Error("Document de test invalide.");
  const data = value as FictionalExportDocument;
  if (data.source !== "SCHOOLNET_LOCAL_FICTITIOUS" ||
      data.provisionalOnly !== true ||
      !["subject_period", "class_general"].includes(data.kind) ||
      data.completionUnit !== (data.kind === "class_general" ? "matières" : "évaluations") ||
      !Array.isArray(data.rows) || data.rows.length > 250 ||
      data.rows.length === 0) throw new Error("Le modèle de test n'est pas autorisé.");
  for (const row of data.rows) {
    if (!row || typeof row.studentName !== "string" || !row.studentName ||
        row.studentName.length > 120 ||
        typeof row.studentCode !== "string" || row.studentCode.length > 30 ||
        !["ready", "incomplete", "not_configured"].includes(row.state) ||
        !Number.isSafeInteger(row.completedItems) ||
        !Number.isSafeInteger(row.expectedItems) ||
        row.completedItems < 0 || row.expectedItems < 1 ||
        row.completedItems > row.expectedItems ||
        (row.state === "ready" &&
          (row.averageOn20 === null || !Number.isFinite(row.averageOn20) ||
           row.averageOn20 < 0 || row.averageOn20 > 20 ||
           row.completedItems !== row.expectedItems)) ||
        (row.state !== "ready" && row.averageOn20 !== null)) {
      throw new Error("Ligne de test incorrecte, note manquante ou non autorisée.");
    }
  }
}

export const frenchStatus = (state: FictionalExportRow["state"]) =>
  state === "ready" ? "Calculable" : state === "incomplete" ? "À compléter" : "À configurer";

export const frenchAverage = (value: number | null) =>
  value === null ? "—" : value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
