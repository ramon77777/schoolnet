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
  readySubjects: number;
  expectedSubjects: number;
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
const averages = [16.67, 0, null, null, 12.88, 13.5, 13.87, null, 14.76, null, 15.79, 16.17, null];

export function makeFictionalExportDocument(
  request: ExportRequest,
  plan: ExportPlan,
): FictionalExportDocument {
  if (!plan.eligibleForServerReview || plan.realDownloadAvailable ||
      request.state !== "provisional" ||
      !["pdf", "xlsx"].includes(request.format) ||
      !["subject_period", "class_general"].includes(request.kind) ||
      request.cadence === "annual") {
    throw new Error("Export de test refusé : périmètre, publication ou format non pris en charge.");
  }
  const kind = request.kind as FictionalExportDocument["kind"];
  const periodName = request.cadence === "semester" ? "1er semestre (fictif)"
    : "1er trimestre (fictif)";
  const title = kind === "class_general"
    ? "Moyennes générales - 6e B"
    : "Moyennes par matière - " +
      (request.subjectId?.endsWith("150") ? "Mathématiques" : "Français");
  const rows = states.map((state, index) => ({
    studentCode: "TEST-" + String(index + 1).padStart(3, "0"),
    studentName: names[0] + " " + String(index + 1).padStart(2, "0"),
    state,
    readySubjects: state === "ready" ? 3 : state === "incomplete" ? 2 : 0,
    expectedSubjects: 3,
    averageOn20: state === "ready" ? averages[index] : null,
  }));
  return {
    source: "SCHOOLNET_LOCAL_FICTITIOUS",
    provisionalOnly: true,
    schoolName: "Établissement fictif A",
    schoolYear: "2026–2027 (fictive)",
    className: "6e B (fictive)",
    periodName,
    kind,
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
      !Array.isArray(data.rows) || data.rows.length > 250 ||
      data.rows.length === 0) throw new Error("Le modèle de test n'est pas autorisé.");
  for (const row of data.rows) {
    if (!row || typeof row.studentName !== "string" || !row.studentName ||
        row.studentName.length > 120 ||
        typeof row.studentCode !== "string" || row.studentCode.length > 30 ||
        !["ready", "incomplete", "not_configured"].includes(row.state) ||
        !Number.isSafeInteger(row.readySubjects) ||
        !Number.isSafeInteger(row.expectedSubjects) ||
        row.readySubjects < 0 || row.expectedSubjects < 1 ||
        row.readySubjects > row.expectedSubjects ||
        (row.state === "ready" &&
          (row.averageOn20 === null || !Number.isFinite(row.averageOn20) ||
           row.averageOn20 < 0 || row.averageOn20 > 20 ||
           row.readySubjects !== row.expectedSubjects)) ||
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
