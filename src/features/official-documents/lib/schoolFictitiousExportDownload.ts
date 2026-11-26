/** SCHOOLNET S4-D.2a — local-only real-file download.
 * This function intentionally refuses any production build or non-fictional
 * export. No Supabase/network operation or persistent storage is performed.
 */
import {
  makeFictionalExportDocument, type FictionalExportDocument,
} from "./schoolFictitiousExportDocument.ts";
import { renderFictionalPdf } from "./schoolFictitiousPdf.ts";
import { renderFictionalXlsx } from "./schoolFictitiousXlsx.ts";
import type { ExportPlan, ExportRequest } from "./schoolOfficialExportPlanning.ts";

export function generateFictionalDownloadBytes(
  request: ExportRequest,
  plan: ExportPlan,
): { bytes: Uint8Array; fileName: string; mimeType: string; document: FictionalExportDocument } {
  const document = makeFictionalExportDocument(request, plan);
  if (request.format === "pdf") {
    return {
      bytes: renderFictionalPdf(document),
      fileName: "schoolnet_fictif_releve_provisoire.pdf",
      mimeType: "application/pdf",
      document,
    };
  }
  if (request.format === "xlsx") {
    return {
      bytes: renderFictionalXlsx(document),
      fileName: "schoolnet_fictif_releve_provisoire.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      document,
    };
  }
  throw new Error("Format d'export fictif invalide.");
}

export function downloadFictionalSchoolExport(
  request: ExportRequest,
  plan: ExportPlan,
): void {
  if (!import.meta.env.DEV || typeof window === "undefined" ||
      typeof document === "undefined" ||
      new URLSearchParams(window.location.search).get("schoolnet_s4d_demo") !== "1") {
    throw new Error("Les téléchargements fictifs sont interdits hors mode de recette local.");
  }
  const result = generateFictionalDownloadBytes(request, plan);
  // Explicit ArrayBuffer copy avoids the TS 5.9 SharedArrayBuffer/BlobPart mismatch.
  const buffer = Uint8Array.from(result.bytes).buffer;
  const blob = new Blob([buffer], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.rel = "noopener noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
