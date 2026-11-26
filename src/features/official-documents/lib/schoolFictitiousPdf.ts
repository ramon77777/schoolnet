/** Minimal PDF 1.4 renderer for LOCAL FICTIONAL SCHOOLNET exports ONLY.
 * No remote URL, fonts, or dependencies; page/table/text stream is deterministic.
 * Real school exports are deliberately not wired to this module.
 */
import {
  assertFictionalExportDocument, FICTIONAL_EXPORT_LABEL, FICTIONAL_TEST_LABEL,
  frenchAverage, frenchStatus, type FictionalExportDocument,
} from "./schoolFictitiousExportDocument.ts";

const extended: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function latinPdfText(value: string): string {
  return Array.from(value)
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      const byte = cp >= 32 && cp <= 126 || cp >= 160 && cp <= 255
        ? cp : extended[cp] ?? 63;
      return String.fromCharCode(byte);
    })
    .join("")
    .replace(/[\\()]/g, "\\$&");
}

function textAt(x: number, y: number, size: number, value: string, bold = false) {
  return "BT /" + (bold ? "F2" : "F1") + " " + size + " Tf " +
    "1 0 0 1 " + x + " " + y + " Tm (" + latinPdfText(value) + ") Tj ET";
}

const PAGE_SIZE = 25;
const WIDTH = 595;
const HEIGHT = 842;

function pageStream(
  doc: FictionalExportDocument,
  page: number,
  totalPages: number,
): string {
  const commands: string[] = [];
  commands.push("0.10 0.20 0.43 rg 0 774 595 68 re f"); // navy
  commands.push("1 1 1 rg", textAt(45, 806, 17, "SCHOOLNET", true));
  commands.push(textAt(45, 786, 9, "RELEVÉS DES MOYENNES - ÉDITION DE TEST", true));
  commands.push("0.10 0.20 0.43 rg",
    textAt(45, 747, 12, FICTIONAL_EXPORT_LABEL, true));
  commands.push("0.35 0.29 0.69 rg",
    textAt(45, 729, 9, FICTIONAL_TEST_LABEL, true));
  commands.push("0.10 0.16 0.27 rg",
    textAt(45, 705, 12, doc.title.slice(0, 64), true),
    textAt(45, 685, 8.8, "École : " + doc.schoolName.slice(0, 55)),
    textAt(45, 670, 8.8, "Année : " + doc.schoolYear + "   Classe : " + doc.className),
    textAt(45, 655, 8.8, "Période : " + doc.periodName));
  commands.push("0.93 0.95 0.99 rg 42 612 510 27 re f");
  commands.push("0.16 0.23 0.43 rg",
    textAt(49, 622, 9, "ÉLÈVE", true),
    textAt(250, 622, 9, "COMPLÉTUDE", true),
    textAt(351, 622, 9, "ÉTAT", true),
    textAt(490, 622, 9, "MOY. /20", true));
  const start = page * PAGE_SIZE;
  const batch = doc.rows.slice(start, start + PAGE_SIZE);
  batch.forEach((student, index) => {
    const y = 595 - 20 * index;
    if (index % 2 === 1) commands.push("0.975 0.983 0.995 rg 42 " +
      (y - 6) + " 510 20 re f");
    commands.push("0.13 0.19 0.31 rg",
      textAt(49, y, 8.2, student.studentName.slice(0, 34)),
      textAt(250, y, 8.1, student.readySubjects + " / " +
        student.expectedSubjects + " matières"),
      textAt(351, y, 8.1, frenchStatus(student.state)),
      textAt(492, y, 8.3, student.state === "ready"
        ? frenchAverage(student.averageOn20) : "-", true));
  });
  commands.push("0.36 0.40 0.51 rg",
    textAt(45, 58, 8.3, "Document de test sans valeur scolaire officielle."),
    textAt(45, 43, 8.3, "Aucune note nominative réelle n'a été utilisée."),
    textAt(488, 43, 8, "Page " + (page + 1) + "/" + totalPages));
  return commands.join("\n") + "\n";
}

/** Produces a valid PDF byte stream; no downloaded file or server call. */
export function renderFictionalPdf(doc: FictionalExportDocument): Uint8Array {
  assertFictionalExportDocument(doc);
  const pages = Math.max(1, Math.ceil(doc.rows.length / PAGE_SIZE));
  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [" +
    Array.from({ length: pages }, (_, i) => (5 + i * 2) + " 0 R").join(" ") +
    "] /Count " + pages + " >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica " +
    "/Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold " +
    "/Encoding /WinAnsiEncoding >>";
  for (let p = 0; p < pages; p++) {
    const pageId = 5 + p * 2, streamId = pageId + 1;
    const body = pageStream(doc, p, pages);
    objects[pageId] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " +
      WIDTH + " " + HEIGHT + "] /Resources << /Font << /F1 3 0 R " +
      "/F2 4 0 R >> >> /Contents " + streamId + " 0 R >>";
    objects[streamId] = "<< /Length " + body.length + " >>\nstream\n" +
      body + "endstream";
  }

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += id + " 0 obj\n" + objects[id] + "\nendobj\n";
  }
  const xrefOffset = pdf.length;
  pdf += "xref\n0 " + objects.length + "\n0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id++) {
    pdf += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + objects.length + " /Root 1 0 R >>\n" +
    "startxref\n" + xrefOffset + "\n%%EOF\n";

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
  return bytes;
}
