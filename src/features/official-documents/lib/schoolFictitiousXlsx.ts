/** Minimal native OOXML .xlsx writer, no external links or macros.
 * Only SCHOOLNET_LOCAL_FICTITIOUS documents are accepted in S4-D.2a.
 * Text is stored as literal inline strings (never formulas).
 */
import {
  assertFictionalExportDocument, FICTIONAL_EXPORT_LABEL, FICTIONAL_TEST_LABEL,
  frenchStatus, type FictionalExportDocument,
} from "./schoolFictitiousExportDocument.ts";

const utf8 = new TextEncoder();
const xmlEscape = (value: string) => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

export function excelLiteral(value: string): string {
  // Both inlineStr and a leading apostrophe make this unambiguously a literal
  // when users later copy/export text to CSV or re-save it in Excel.
  return /^[\s]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value;
}

function tCell(ref: string, value: string, style = 0): string {
  return '<c r="' + ref + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' +
    xmlEscape(excelLiteral(value)) + "</t></is></c>";
}
function nCell(ref: string, value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 20)
    throw new Error("Moyenne scolaire invalide.");
  return '<c r="' + ref + '" s="4"><v>' + value.toFixed(2) + "</v></c>";
}
function row(n: number, cells: string[], height?: number) {
  return '<row r="' + n + '"' + (height ? ' ht="' + height + '" customHeight="1"' : "") +
    ">" + cells.join("") + "</row>";
}

function worksheet(doc: FictionalExportDocument): string {
  const rows = [
    row(1, [tCell("A1", "SCHOOLNET | " + doc.title, 1)], 32),
    row(2, [tCell("A2", FICTIONAL_EXPORT_LABEL, 5)], 27),
    row(3, [tCell("A3", FICTIONAL_TEST_LABEL, 5)], 24),
    row(4, [tCell("A4", "Établissement", 3), tCell("B4", doc.schoolName),
      tCell("C4", "Année scolaire", 3), tCell("D4", doc.schoolYear)], 26),
    row(5, [tCell("A5", "Classe", 3), tCell("B5", doc.className),
      tCell("C5", "Période", 3), tCell("D5", doc.periodName)], 26),
    row(6, [], 11),
    row(7, [
      tCell("A7", "Code fictif", 2),
      tCell("B7", "Élève fictif", 2),
      tCell("C7", "État", 2),
      tCell("D7", "Complétude", 2),
      tCell("E7", "Moyenne /20", 2),
    ], 30),
  ];
  doc.rows.forEach((item, index) => {
    const n = index + 8;
    rows.push(row(n, [
      tCell("A" + n, item.studentCode),
      tCell("B" + n, item.studentName),
      tCell("C" + n, frenchStatus(item.state)),
      tCell("D" + n, item.readySubjects + " / " + item.expectedSubjects + " matières"),
      item.state === "ready" && item.averageOn20 !== null
        ? nCell("E" + n, item.averageOn20) : tCell("E" + n, "—"),
    ], 23));
  });
  const end = doc.rows.length + 7;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:E' + end + '"/>' +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' +
    '<pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    '<cols><col min="1" max="1" width="19" customWidth="1"/>' +
    '<col min="2" max="2" width="37" customWidth="1"/>' +
    '<col min="3" max="3" width="22" customWidth="1"/>' +
    '<col min="4" max="4" width="22" customWidth="1"/>' +
    '<col min="5" max="5" width="19" customWidth="1"/></cols>' +
    '<sheetData>' + rows.join("") + '</sheetData>' +
    '<mergeCells count="3"><mergeCell ref="A1:E1"/>' +
    '<mergeCell ref="A2:E2"/><mergeCell ref="A3:E3"/></mergeCells>' +
    '<autoFilter ref="A7:E' + end + '"/>' +
    '<printOptions horizontalCentered="1"/>' +
    '<pageMargins left="0.3" right="0.3" top="0.55" bottom="0.55" ' +
    'header="0.2" footer="0.2"/>' +
    '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1"/>' +
    '</worksheet>';
}

const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="4">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF473489"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="5">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF172E5B"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF354FA5"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0ECFF"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFill="1" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" applyFill="1" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="0" applyFill="1" applyFont="1"/>' +
  '</cellXfs></styleSheet>';

type ZipEntry = { name: string; data: Uint8Array };
function crc32(data: Uint8Array): number {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

function join(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, item) => sum + item.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const item of parts) {
    result.set(item, offset);
    offset += item.byteLength;
  }
  return result;
}

function zipStore(files: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = utf8.encode(file.name), data = file.data;
    if (name.length > 65535 || data.length > 0xffffffff || offset > 0xffffffff)
      throw new Error("Archive Excel trop volumineuse.");
    const crc = crc32(data);
    const local = new Uint8Array(30);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    chunks.push(local, name, data);

    const central = new Uint8Array(46);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  if (files.length > 65535) throw new Error("Trop de fichiers Excel.");
  const directoryLength = directory.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directoryLength, true);
  e.setUint32(16, offset, true);
  return join([...chunks, ...directory, end]);
}

export function renderFictionalXlsx(doc: FictionalExportDocument): Uint8Array {
  assertFictionalExportDocument(doc);
  const source = "SCHOOLNET - RELEVÉ FICTIF LOCAL";
  const createdAt = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(doc.generatedAt)
    ? doc.generatedAt.slice(0, 19) + "Z" : "2026-11-26T00:00:00Z";
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView/></bookViews><sheets>' +
      '<sheet name="Relevé fictif" sheetId="1" r:id="rId1"/>' +
      '</sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>',
    "xl/worksheets/sheet1.xml": worksheet(doc),
    "xl/styles.xml": styles,
    "docProps/core.xml":
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:creator>' + xmlEscape(source) + '</dc:creator>' +
      '<dc:title>' + xmlEscape(FICTIONAL_EXPORT_LABEL) + '</dc:title>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + createdAt + '</dcterms:created>' +
      '</cp:coreProperties>',
    "docProps/app.xml":
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>SCHOOLNET V2 - TEST FICTIF</Application></Properties>',
  };
  return zipStore(Object.entries(files).map(([name, content]) => ({
    name, data: utf8.encode(content),
  })));
}
