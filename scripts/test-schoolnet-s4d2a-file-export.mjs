import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planSchoolOfficialExport } from "../src/features/official-documents/lib/schoolOfficialExportPlanning.ts";
import {
  assertFictionalExportDocument, makeFictionalExportDocument,
} from "../src/features/official-documents/lib/schoolFictitiousExportDocument.ts";
import { renderFictionalPdf } from "../src/features/official-documents/lib/schoolFictitiousPdf.ts";
import { renderFictionalXlsx } from "../src/features/official-documents/lib/schoolFictitiousXlsx.ts";
import { generateFictionalDownloadBytes } from "../src/features/official-documents/lib/schoolFictitiousExportDownload.ts";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g,"\n");
const page = read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
const down = read("src/features/official-documents/lib/schoolFictitiousExportDownload.ts");
const xmlCode = read("src/features/official-documents/lib/schoolFictitiousXlsx.ts");
const pdfCode = read("src/features/official-documents/lib/schoolFictitiousPdf.ts");
const ci = read(".github/workflows/schoolnet-s4d2a-fictitious-file-export-ci.yml");
const vercel = JSON.parse(read("vercel.json"));
const pkg = JSON.parse(read("package.json"));
const docFile = read("docs/releases/SCHOOLNET_S4D2A_FICTITIOUS_EXPORTS_2026-11-26.md");
const branch = "feature/schoolnet-s4d2a-fictitious-pdf-xlsx-renderers-20261126";
const scope = {schoolId:"00000000-0000-4000-8000-000000000100",schoolYearId:"00000000-0000-4000-8000-000000000110",
 classId:"00000000-0000-4000-8000-000000000120",periodId:"00000000-0000-4000-8000-000000000130"};
const request = {viewerId:"synthetic-admin",role:"school_admin",scope,kind:"class_general",
 cadence:"trimester",format:"pdf",state:"provisional",subjectId:null};
const context = {viewerId:"synthetic-admin",role:"school_admin",membershipActive:true,
 allowedSchoolIds:[scope.schoolId],teacherSubjectAssignments:[],
 summaryExportDelegations:[],periodConfigured:true,annualPolicyApproved:false,
 annualPeriodsComplete:false,v2ProjectionAvailable:true,publishedSnapshotId:null};
const prepare = (r=request,c=context)=>planSchoolOfficialExport(r,c);
const fixture = (r=request,c=context)=>makeFictionalExportDocument(r,prepare(r,c));
const t = new TextDecoder("utf-8");
const latin = bytes => Buffer.from(bytes).toString("latin1");

function zipEntries(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= bytes.length && v.getUint32(offset,true) === 0x04034b50) {
    const compressed = v.getUint32(offset+18,true);
    const nameLen = v.getUint16(offset+26,true);
    const extraLen = v.getUint16(offset+28,true);
    const name = t.decode(bytes.slice(offset+30,offset+30+nameLen));
    const start = offset + 30 + nameLen + extraLen;
    files.set(name, bytes.slice(start,start+compressed));
    offset = start + compressed;
  }
  assert.ok(offset + 22 <= bytes.length);
  assert.equal(v.getUint32(bytes.length - 22,true), 0x06054b50);
  assert.equal(v.getUint16(bytes.length - 12,true), files.size);
  return files;
}
function crc32(bytes) {
 let crc=-1;
 for(const byte of bytes) {
  crc ^= byte;
  for(let j=0;j<8;j++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 return (crc^-1)>>>0;
}

test("S4-D.2a: document fixture is explicitly fictional, 13 complete/incomplete cases incl. real zero",()=>{
 const doc=fixture();assert.doesNotThrow(()=>assertFictionalExportDocument(doc));
 assert.equal(doc.source,"SCHOOLNET_LOCAL_FICTITIOUS");
 assert.equal(doc.provisionalOnly,true);
 assert.equal(doc.rows.length,13);
 assert.equal(doc.rows.filter(r=>r.state==="ready").length,8);
 assert.equal(doc.rows.filter(r=>r.state==="incomplete").length,3);
 assert.equal(doc.rows.filter(r=>r.state==="not_configured").length,2);
 assert.equal(doc.rows.filter(r=>r.state==="ready" && r.averageOn20===0).length,1);
 assert.equal(doc.rows.filter(r=>r.state!=="ready" && r.averageOn20===null).length,5);
});
test("S4-D.2a: a provisional generator fails closed on unknown tenant, annual, published, unapproved rights",()=>{
 assert.throws(()=>fixture({...request,scope:{...scope,schoolId:"school-B"}}));
 assert.throws(()=>fixture({...request,cadence:"annual",scope:{...scope,periodId:null}}));
 assert.throws(()=>fixture({...request,state:"published"}));
 assert.throws(()=>fixture({...request,kind:"class_subjects"}));
 assert.throws(()=>fixture({...request,format:"unknown"}));
});
test("S4-D.2a: unknown source, missing score, and invalid numeric score never serialize",()=>{
 const doc=fixture();
 assert.throws(()=>renderFictionalPdf({...doc,source:"PRODUCTION"}));
 assert.throws(()=>renderFictionalXlsx({...doc,provisionalOnly:false}));
 const corrupted={...doc,rows:doc.rows.map((r,i)=>i===0?{...r,averageOn20:null}:r)};
 assert.throws(()=>renderFictionalPdf(corrupted));
 const low={...doc,rows:doc.rows.map((r,i)=>i===1?{...r,averageOn20:-1}:r)};
 assert.throws(()=>renderFictionalXlsx(low));
});
test("S4-D.2a: PDF is genuine A4 with consistent xref offsets and clear provisional/test markers",()=>{
 const bytes=renderFictionalPdf(fixture());
 const pdf=latin(bytes);
 assert.ok(pdf.startsWith("%PDF-1.4\n"));
 assert.ok(pdf.includes("/Type /Catalog"));
 assert.ok(pdf.includes("/MediaBox [0 0 595 842]"));
 assert.ok(pdf.includes("/Encoding /WinAnsiEncoding"));
 assert.ok(pdf.includes("RELEV"));
 assert.ok(pdf.includes("Page 1/1"));
 assert.ok(pdf.endsWith("%%EOF\n"));
 const match=pdf.match(/startxref\n(\d+)\n%%EOF/);assert.ok(match);
 assert.equal(pdf.slice(Number(match[1]),Number(match[1])+5),"xref\n");
 const refs=[...pdf.matchAll(/(\d+) 0 obj\n/g)];
 assert.ok(refs.length>=6);
 for(const r of refs)assert.equal(pdf.slice(r.index).startsWith(r[1]+" 0 obj"),true);
 const offs=[...pdf.matchAll(/(\d{10}) 00000 n/g)];
 assert.equal(offs.length,refs.length);
 for(let i=0;i<refs.length;i++)assert.equal(pdf.slice(Number(offs[i][1])).startsWith((i+1)+" 0 obj"),true);
});
test("S4-D.2a: PDF paginates 70 fictional rows and repeats headers/footers",()=>{
 const doc=fixture();
 doc.rows=Array.from({length:70},(_,i)=>({...doc.rows[i%doc.rows.length],studentCode:"TEST-"+(i+1)}));
 const pdf=latin(renderFictionalPdf(doc));
 assert.match(pdf,/\/Count 3 >>/);
 assert.match(pdf,/Page 1\/3/);assert.match(pdf,/Page 2\/3/);assert.match(pdf,/Page 3\/3/);
});
test("S4-D.2a: XLSX is a proper ZIP/OOXML package with exactly one visible sheet",()=>{
 const bytes=renderFictionalXlsx(fixture());
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const files=zipEntries(bytes);
 assert.ok(files.has("[Content_Types].xml"));
 assert.ok(files.has("_rels/.rels"));
 assert.ok(files.has("xl/workbook.xml"));
 assert.ok(files.has("xl/worksheets/sheet1.xml"));
 assert.ok(files.has("xl/styles.xml"));
 assert.equal(files.size,8);
 const sheet=t.decode(files.get("xl/worksheets/sheet1.xml"));
 const book=t.decode(files.get("xl/workbook.xml"));
 assert.match(book,/name="Relevé fictif"/);
 assert.doesNotMatch(book,/state="hidden"/);
 assert.match(sheet,/<autoFilter ref="A7:E20"/);
 assert.match(sheet,/<pane ySplit="7"/);
 assert.match(sheet,/<v>0.00<\/v>/);
 assert.match(sheet,/t="inlineStr"/);
 assert.doesNotMatch(sheet,/<f\b|externalLink|formula|vbaProject/);
});
test("S4-D.2a: XLSX local file headers match central directory CRC and uncompressed sizes",()=>{
 const bytes=renderFictionalXlsx(fixture());
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let offset=0,count=0;
 while (v.getUint32(offset,true)===0x04034b50) {
  const size=v.getUint32(offset+18,true),crc=v.getUint32(offset+14,true);
  const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
  assert.equal(crc32(bytes.slice(start,start+size)),crc);
  offset=start+size;count++;
 }
 assert.equal(count,8);
 assert.equal(v.getUint32(offset,true),0x02014b50);
});
test("S4-D.2a: text formula-injection, xml entities, and null values stay literal",()=>{
 const doc=fixture();
 doc.rows[0].studentName="=SUM(1,2) & <script>";
 doc.rows[1].studentName="\t+HYPERLINK(\"x\")";
 const sheet=t.decode(zipEntries(renderFictionalXlsx(doc)).get("xl/worksheets/sheet1.xml"));
 assert.ok(sheet.includes("&lt;script&gt;"));
 assert.ok(sheet.includes("&amp;"));
 assert.ok(sheet.includes("&apos;=SUM"));
 assert.ok(sheet.includes("&apos;\t+HYPERLINK"));
 assert.doesNotMatch(sheet,/<f\b/);
 assert.equal(doc.rows[2].averageOn20,null);
});
test("S4-D.2a: export format choice produces real binary bytes and standard extensions",()=>{
 const pdf=generateFictionalDownloadBytes(request,prepare());
 const r2={...request,format:"xlsx"};
 const excel=generateFictionalDownloadBytes(r2,prepare(r2));
 assert.match(pdf.fileName,/\.pdf$/);
 assert.match(excel.fileName,/\.xlsx$/);
 assert.match(pdf.mimeType,/pdf/);
 assert.match(excel.mimeType,/spreadsheetml/);
 assert.ok(pdf.bytes.length>1200);
 assert.ok(excel.bytes.length>1500);
});
test("S4-D.2a: local-only enabled test buttons stay isolated from disabled production exports",()=>{
 assert.match(page,/Générateur PDF \/ Excel — documents fictifs uniquement/);
 assert.match(page,/Télécharger PDF fictif/);
 assert.match(page,/Télécharger Excel fictif/);
 assert.match(page,/import\.meta\.env\.DEV/);
 assert.match(page,/schoolnet_s4d_demo/);
 assert.match(page,/!demoFileEligible/);
 assert.match(page,/Exporter PDF — bientôt/);
 assert.match(page,/Exporter Excel \(\.xlsx\) — bientôt/);
 assert.match(down,/import\.meta\.env\.DEV/);
 assert.match(down,/SCHOOLNET_LOCAL_FICTITIOUS|makeFictionalExportDocument/);
 assert.match(down,/URL\.revokeObjectURL/);
 assert.doesNotMatch(page,/\.from\(|supabase\.rpc|student_period_averages/);
});
test("S4-D.2a: no embedded CDN, external image, or server data path in renderers",()=>{
 assert.doesNotMatch(xmlCode,/fetch\(|https?:\/\/[^"'\s]*\.(?:js|png|jpg)|student_period_averages|service_role/);
 assert.doesNotMatch(pdfCode,/fetch\(|student_period_averages|service_role|supabase/);
 assert.doesNotMatch(down,/fetch\(|supabase\.rpc|student_period_averages|service_role/);
 assert.match(docFile,/RPC/);
 assert.match(docFile,/fictif/i);
});
test("S4-D.2a: isolated CI, no new deployment or SQL mutation",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d2a"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d2a-file-export.mjs");
 assert.match(ci,/pull_request:/);
 assert.match(ci,/feature\/schoolnet-s4d1-reportcards-exports-foundation-20261126/);
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.doesNotMatch(ci,/supabase (?:link|db push|db reset|migration repair)|secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|deploy/);
});
