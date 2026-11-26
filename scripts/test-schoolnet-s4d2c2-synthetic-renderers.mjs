import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
 makeSyntheticPreviewDocument, assertSyntheticPreviewDocument,
 SYNTHETIC_EXPORT_LABEL, SYNTHETIC_TEST_LABEL,
} from "../src/features/official-documents/lib/schoolSyntheticPreviewDocument.ts";
import { renderSyntheticPreviewPdf } from "../src/features/official-documents/lib/schoolSyntheticPreviewPdf.ts";
import { renderSyntheticPreviewXlsx } from "../src/features/official-documents/lib/schoolSyntheticPreviewXlsx.ts";
import { renderSyntheticPreviewBytes } from "../src/features/official-documents/lib/schoolSyntheticPreviewBytes.ts";
import { makeSyntheticExportCase } from "./fixtures/schoolnet-s4d2c2-synthetic-preview.mjs";

const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const latin = bytes => Buffer.from(bytes).toString("latin1");
const decode = bytes => new TextDecoder("utf-8",{fatal:true}).decode(bytes);
const makeDoc = (options={}) => {
 const f=makeSyntheticExportCase(options);
 return makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,f.labels,f.generatedAt);
};
const copy = x => structuredClone(x);
function crc32(bytes) {
 let crc=-1;
 for(const b of bytes){
  crc ^= b;
  for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 return (crc^-1)>>>0;
}
function zipEntries(bytes) {
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const files=new Map();
 let offset=0;
 while(offset+30<=bytes.length && v.getUint32(offset,true)===0x04034b50){
  const crc=v.getUint32(offset+14,true),size=v.getUint32(offset+18,true);
  const len=v.getUint16(offset+26,true),extra=v.getUint16(offset+28,true);
  const start=offset+30+len+extra;
  assert.ok(start+size<=bytes.length,"ZIP entry fits");
  const name=decode(bytes.slice(offset+30,offset+30+len));
  const body=bytes.slice(start,start+size);
  assert.equal(crc32(body),crc,"local ZIP CRC32: "+name);
  files.set(name,body);
  offset=start+size;
 }
 assert.equal(files.size,8,"exactly eight OOXML parts");
 assert.equal(v.getUint32(offset,true),0x02014b50);
 assert.equal(v.getUint32(bytes.length-22,true),0x06054b50);
 assert.equal(v.getUint16(bytes.length-12,true),files.size);
 return files;
}

test("S4-D.2c.2: document is an exact synthetic V2 projection, never V1 or real",()=>{
 const d=makeDoc();
 assert.doesNotThrow(()=>assertSyntheticPreviewDocument(d));
 assert.equal(d.source,"SCHOOLNET_V2_SYNTHETIC_QA_ONLY");
 assert.equal(d.syntheticOnly,true);
 assert.equal(d.provisionalOnly,true);
 assert.equal(d.rows.length,13);
 assert.equal(d.rows.filter(r=>r.state==="ready").length,8);
 assert.equal(d.rows.filter(r=>r.state==="incomplete").length,3);
 assert.equal(d.rows.filter(r=>r.state==="not_configured").length,2);
 assert.ok(d.rows.every(r=>!Object.hasOwn(r,"studentId")));
 assert.ok(d.rows.every(r=>!Object.hasOwn(r,"score")));
 assert.equal(d.auditId,"00000000-0000-4000-8000-000000000090");
 assert.equal(d.generatedAt,"2026-11-26T12:00:00.000Z");
});
test("S4-D.2c.2: school general and subject document units and scores differ",()=>{
 const s=makeDoc(),g=makeDoc({kind:"class_general"});
 assert.equal(s.completionUnit,"évaluations");
 assert.equal(g.completionUnit,"matières");
 assert.equal(s.kind,"subject_period");
 assert.equal(g.kind,"class_general");
 assert.equal(s.rows[0].averageOn20,17.25);
 assert.equal(g.rows[0].averageOn20,16.67);
 assert.equal(s.rows[1].averageOn20,0);
 assert.equal(g.rows[1].averageOn20,0);
 assert.equal(s.rows[2].averageOn20,null);
 assert.equal(g.rows[2].averageOn20,null);
 assert.equal(s.rows[2].completedItems,2);
 assert.equal(g.rows[2].completedItems,2);
 assert.match(s.title,/Mathématiques/);
 assert.match(g.title,/Moyennes générales/);
});
test("S4-D.2c.2: wrong tenant/year/class/period identity and publication blocked",()=>{
 const f=makeSyntheticExportCase();
 const mutate=(prop,val)=>makeSyntheticPreviewDocument(
  {...f.projection,[prop]:val},f.request,f.viewer,f.labels,f.generatedAt);
 for(const key of ["schoolId","schoolYearId","classId","periodId"]){
  assert.throws(()=>mutate(key,"00000000-0000-4000-8000-000000000999"),key);
 }
 assert.throws(()=>mutate("documentState","published"));
 assert.throws(()=>mutate("previewOnly",false));
 assert.throws(()=>mutate("studentCount",25));
 assert.throws(()=>mutate("completionUnit","matières"));
 assert.throws(()=>mutate("auditId","bad"));
 assert.throws(()=>mutate("unexpectedSecret","private"));
});
test("S4-D.2c.2: fake display labels never authorize a changed scope",()=>{
 const f=makeSyntheticExportCase();
 assert.throws(()=>makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,
  {...f.labels,schoolId:"00000000-0000-4000-8000-000000009999"},f.generatedAt));
 assert.throws(()=>makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,
  {...f.labels,subjectName:null},f.generatedAt));
 assert.throws(()=>makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,
  {...f.labels,periodName:" 1er trimestre"},f.generatedAt));
 assert.throws(()=>makeSyntheticPreviewDocument(f.projection,f.request,
  {...f.viewer,isDemo:true},f.labels,f.generatedAt));
 assert.throws(()=>makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,
  f.labels,"bogus"));
});
test("S4-D.2c.2: forged render input or average missing must not produce files",()=>{
 const d=makeDoc();
 for(const [field,value] of [["source","SCHOOLNET_REAL"],["syntheticOnly",false],
  ["provisionalOnly",false],["format","unknown"],["auditId","bad"],
  ["schoolYearId","bad"],["completionUnit","matières"],["extra","score"]]){
   assert.throws(()=>renderSyntheticPreviewPdf({...d,[field]:value}));
 }
 let r=copy(d);r.rows[0].averageOn20=null;
 assert.throws(()=>renderSyntheticPreviewPdf(r));
 r=copy(d);r.rows[0].averageOn20=21;
 assert.throws(()=>renderSyntheticPreviewPdf(r));
 r=copy(d);r.rows[2].averageOn20=0;
 assert.throws(()=>renderSyntheticPreviewPdf(r));
 r=copy(d);r.rows[0].studentName="\n";
 assert.throws(()=>renderSyntheticPreviewPdf(r));
});
test("S4-D.2c.2: real A4 PDF is paginated and has a consistent xref table",()=>{
 const pdf=latin(renderSyntheticPreviewPdf(makeDoc()));
 assert.ok(pdf.startsWith("%PDF-1.4\n"));
 assert.match(pdf,/\/MediaBox \[0 0 595 842\]/);
 assert.match(pdf,/\/Count 1 >>/);
 assert.match(pdf,/RELEV/);
 assert.match(pdf,/DONN/);
 assert.match(pdf,/17,25/);
 assert.match(pdf,/0,00/);
 assert.match(pdf,/3 évaluations/);
 assert.match(pdf,/Référence de recette/);
 assert.match(pdf,/Page 1\/1/);
 assert.ok(pdf.endsWith("%%EOF\n"));
 const match=pdf.match(/startxref\n(\d+)\n%%EOF/);
 assert.ok(match);
 assert.equal(pdf.slice(Number(match[1]),Number(match[1])+5),"xref\n");
 const refs=[...pdf.matchAll(/(\d+) 0 obj\n/g)];
 const offsets=[...pdf.matchAll(/(\d{10}) 00000 n/g)];
 assert.equal(refs.length,offsets.length);
 for(let i=0;i<refs.length;i++){
  assert.equal(pdf.slice(Number(offsets[i][1])).startsWith((i+1)+" 0 obj"),true);
 }
});
test("S4-D.2c.2: seventy students paginate into three A4 pages with no missing headers",()=>{
 const d=makeDoc({rowCount:70});
 const pdf=latin(renderSyntheticPreviewPdf(d));
 assert.match(pdf,/\/Count 3 >>/);
 assert.match(pdf,/Page 1\/3/);
 assert.match(pdf,/Page 2\/3/);
 assert.match(pdf,/Page 3\/3/);
 assert.equal((pdf.match(/SCHOOLNET/g)||[]).length,3);
});
test("S4-D.2c.2: XLSX has valid CRC ZIP and a single visible worksheet",()=>{
 const d=makeDoc({format:"xlsx"});
 const bytes=renderSyntheticPreviewXlsx(d);
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const parts=zipEntries(bytes);
 for(const name of ["[Content_Types].xml","_rels/.rels","xl/workbook.xml",
  "xl/worksheets/sheet1.xml","xl/styles.xml"]){
  assert.ok(parts.has(name),name);
 }
 const sheet=decode(parts.get("xl/worksheets/sheet1.xml"));
 const book=decode(parts.get("xl/workbook.xml"));
 assert.match(book,/name="Relevé V2 test"/);
 assert.doesNotMatch(book,/state="hidden"/);
 assert.match(sheet,/<autoFilter ref="A7:E20"/);
 assert.match(sheet,/<pane ySplit="7"/);
 assert.match(sheet,/<v>17.25<\/v>/);
 assert.match(sheet,/<v>0.00<\/v>/);
 assert.match(sheet,/3 \/ 3 évaluations/);
 assert.match(sheet,/00000000-0000-4000-8000-000000000090/);
 assert.match(decode(parts.get("xl/styles.xml")),/<cellStyles count="1">/);
 assert.doesNotMatch(sheet,/<f\b|externalLink|vbaProject/i);
 assert.equal((sheet.match(/<row r="/g)||[]).length,20);
});
test("S4-D.2c.2: semantic general grades are numeric and not subject grades",()=>{
 const doc=makeDoc({format:"xlsx",kind:"class_general"});
 const sheet=decode(zipEntries(renderSyntheticPreviewXlsx(doc)).get("xl/worksheets/sheet1.xml"));
 assert.match(sheet,/3 \/ 3 matières/);
 assert.match(sheet,/<v>16.67<\/v>/);
 assert.doesNotMatch(sheet,/<v>17.25<\/v>/);
 assert.match(sheet,/Élève \(simulation\)/);
});
test("S4-D.2c.2: Excel formula injection, XML entities and missing grades cannot execute",()=>{
 const f=makeSyntheticExportCase({format:"xlsx"});
 f.projection.students[0].studentName="=SUM(1,2) & <script>";
 f.projection.students[1].studentName="+HYPERLINK(\"x\")";
 const doc=makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,f.labels,f.generatedAt);
 const sheet=decode(zipEntries(renderSyntheticPreviewXlsx(doc)).get("xl/worksheets/sheet1.xml"));
 assert.match(sheet,/&apos;=SUM\(1,2\)/);
 assert.match(sheet,/&amp; &lt;script&gt;/);
 assert.match(sheet,/&apos;\+HYPERLINK/);
 assert.match(sheet,/t="inlineStr"/);
 assert.doesNotMatch(sheet,/<f\b|externalLink|vbaProject/i);
 assert.match(sheet,/<c r="E10"[^>]*><is><t xml:space="preserve">—<\/t>/);
});
test("S4-D.2c.2: bytes factory accepts each matching format, never cross format",()=>{
 const pdfDoc=makeDoc(),excelDoc=makeDoc({format:"xlsx"});
 const p=renderSyntheticPreviewBytes(pdfDoc),e=renderSyntheticPreviewBytes(excelDoc);
 assert.match(p.fileName,/synthetique.*\.pdf$/);
 assert.match(e.fileName,/synthetique.*\.xlsx$/);
 assert.equal(p.mimeType,"application/pdf");
 assert.match(e.mimeType,/spreadsheetml/);
 assert.ok(p.bytes.length>1500);
 assert.ok(e.bytes.length>2000);
 assert.throws(()=>renderSyntheticPreviewXlsx(pdfDoc));
 assert.throws(()=>renderSyntheticPreviewPdf(excelDoc));
});
test("S4-D.2c.2: no browser input can render or download a synthetic document",()=>{
 const d=makeDoc();
 const old=globalThis.window;
 try {
  globalThis.window={location:{href:"about:blank"}};
  assert.throws(()=>renderSyntheticPreviewPdf(d),/navigateur/);
  assert.throws(()=>renderSyntheticPreviewBytes(d),/navigateur/);
  const f=makeSyntheticExportCase();
  assert.throws(()=>makeSyntheticPreviewDocument(f.projection,f.request,f.viewer,f.labels,f.generatedAt));
 } finally {
  if(old===undefined)delete globalThis.window; else globalThis.window=old;
 }
});
test("S4-D.2c.2: QA only, original fictional renderers untouched, no Supabase or Vercel release",()=>{
 const hub=read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
 const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 const pdf=read("src/features/official-documents/lib/schoolSyntheticPreviewPdf.ts");
 const xlsx=read("src/features/official-documents/lib/schoolSyntheticPreviewXlsx.ts");
 const bytes=read("src/features/official-documents/lib/schoolSyntheticPreviewBytes.ts");
 const doc=read("src/features/official-documents/lib/schoolSyntheticPreviewDocument.ts");
 const ci=read(".github/workflows/schoolnet-s4d2c2-synthetic-renderers-ci.yml");
 const pkg=JSON.parse(read("package.json"));
 const vercel=JSON.parse(read("vercel.json"));
 const branch="feature/schoolnet-s4d2c2-synthetic-preview-renderers-20261126";
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d2c2"],
  "node --experimental-strip-types --test scripts/test-schoolnet-s4d2c2-synthetic-renderers.mjs");
 assert.equal(pkg.scripts["demo:s4d2c2"],
  "node --experimental-strip-types scripts/generate-schoolnet-s4d2c2-samples.mjs");
 assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
 assert.ok(!hub.includes("schoolSyntheticPreview"));
 assert.ok(!hub.includes("schoolnet_official_export_preview"));
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 for(const text of [pdf,xlsx,bytes,doc,ci]){
  assert.doesNotMatch(text,/supabase\.rpc|supabase\.from|service_role|SUPABASE_DB_URL|db push|migration repair|fetch\(/i);
 }
 assert.doesNotMatch(ci,/secrets\.|vercel deploy|supabase start/);
 assert.match(read("src/features/official-documents/lib/schoolFictitiousPdf.ts"),/renderFictionalPdf/);
 assert.match(read("src/features/official-documents/lib/schoolFictitiousXlsx.ts"),/renderFictionalXlsx/);
 assert.match(read("docs/releases/SCHOOLNET_S4D2C2_SYNTHETIC_RENDERERS_2026-11-26.md"),/synthétique/i);
});
