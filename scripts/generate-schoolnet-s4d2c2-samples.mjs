/** Generate ONLY synthetic PDF/XLSX for manual desktop review.
 * Writes OUTSIDE Git checkout into the current user's system temp folder.
 * No network, Supabase, JWT, SQL, or school record is accessed.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSyntheticExportCase } from "./fixtures/schoolnet-s4d2c2-synthetic-preview.mjs";
import { makeSyntheticPreviewDocument } from "../src/features/official-documents/lib/schoolSyntheticPreviewDocument.ts";
import { renderSyntheticPreviewBytes } from "../src/features/official-documents/lib/schoolSyntheticPreviewBytes.ts";

const folder = await mkdtemp(join(tmpdir(),"schoolnet-v2-s4d2c2-"));
const results = [];
for(const kind of ["subject_period","class_general"]){
 for(const format of ["pdf","xlsx"]){
  const f=makeSyntheticExportCase({kind,format});
  const document=makeSyntheticPreviewDocument(
   f.projection,f.request,f.viewer,f.labels,f.generatedAt);
  const result=renderSyntheticPreviewBytes(document);
  const target=join(folder,result.fileName);
  await writeFile(target,result.bytes,{flag:"wx"});
  results.push({target,size:result.bytes.length});
 }
}
process.stdout.write("SCHOOLNET V2 - S4-D.2c.2 - FICHIERS 100 % SYNTHÉTIQUES\n");
process.stdout.write("AUCUNE DONNÉE SCOLAIRE RÉELLE, AUCUNE PUBLICATION.\n");
for(const f of results)process.stdout.write(f.target+" ("+f.size+" octets)\n");
process.stdout.write("Dossier de test externe au dépôt : "+folder+"\n");
