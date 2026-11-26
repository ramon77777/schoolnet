/** S4-D.2c.2 — generate binary sample artifacts in Node-based QA only.
 * This module NEVER downloads a document in the browser. It does not import
 * Supabase, call a network endpoint, or read a real school record.
 */
import {
  assertSyntheticPreviewDocument,
  type SyntheticPreviewDocument,
} from "./schoolSyntheticPreviewDocument.ts";
import { renderSyntheticPreviewPdf } from "./schoolSyntheticPreviewPdf.ts";
import { renderSyntheticPreviewXlsx } from "./schoolSyntheticPreviewXlsx.ts";

export type SyntheticPreviewFile = {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
};

/** Prevent real-data exports while the S4-D.2c.1 release gate stays closed. */
export function renderSyntheticPreviewBytes(
  doc: SyntheticPreviewDocument,
): SyntheticPreviewFile {
  assertSyntheticPreviewDocument(doc);
  const suffix = doc.kind === "class_general" ? "moyenne_generale" : "matiere";
  if (doc.format === "pdf") {
    return {
      bytes: renderSyntheticPreviewPdf(doc),
      fileName: "schoolnet_v2_recette_synthetique_" + suffix + ".pdf",
      mimeType: "application/pdf",
    };
  }
  if (doc.format === "xlsx") {
    return {
      bytes: renderSyntheticPreviewXlsx(doc),
      fileName: "schoolnet_v2_recette_synthetique_" + suffix + ".xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  throw new Error("Format de recette scolaire non reconnu.");
}
