// SCHOOLNET Lot 5D-F | offline-only, no database/client/network use.
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
const path="../supabase/proposals/20261118_schoolnet_lot5df_legacy_full_lock_SANDBOX_ONLY.sql";
const names=[
 "admin_upsert_student_enrollment",
 "admin_upsert_student_enrollment_with_gender",
 "admin_set_student_enrollment_status",
 "admin_assign_student_to_class",
 "admin_remove_student_from_class",
];

test("5D-F 01 - proposition SQL marque SANDBOX_ONLY et database guard",async()=>{
 const x=await read(path);
 assert.match(x,/SANDBOX_ONLY/);
 assert.match(x,/current_database\(\)\s*<>\s*'schoolnet_lot5d_ci'/);
 assert.match(x,/server_version_num/);
 assert.match(x,/to_regclass\('public\.school_year_rollover_runs'\)/);
 assert.doesNotMatch(x,/\bGRANT\s+EXECUTE\b/i);
});
test("5D-F 02 - cinq signatures RPC completes avec search_path durci",async()=>{
 const x=await read(path);
 for(const name of names){
  assert.match(x,new RegExp("CREATE OR REPLACE FUNCTION public\\."+name+"\\("));
 }
 assert.equal((x.match(/CREATE OR REPLACE FUNCTION public\./g)||[]).length,5);
 assert.equal((x.match(/SET search_path TO 'pg_catalog'/g)||[]).length,5);
});
test("5D-F 03 - chaque RPC verifie Admin puis verrouille annee avant SELECT",async()=>{
 const x=await read(path);
 for(const [i,name] of names.entries()){
  const start=x.indexOf("CREATE OR REPLACE FUNCTION public."+name+"(");
  const next=i===names.length-1?x.indexOf("-- NO GRANT",start):x.indexOf("-- "+names[i+1]+" |",start);
  const fn=x.slice(start,next);
  const role=fn.indexOf("if not public.is_admin() then");
  const lock=fn.indexOf("LOCK TABLE public.school_years IN SHARE MODE");
  assert.ok(role>0 && lock>role,name);
  assert.equal((fn.match(/LOCK TABLE public\.school_years IN SHARE MODE/g)||[]).length,1,name);
  assert.ok(fn.indexOf("select ",lock+1)>lock || name==="admin_upsert_student_enrollment_with_gender",name);
 }
});
test("5D-F 04 - les signatures conservent les contrats existants",async()=>{
 const x=await read(path);
 for(const field of ["enrollment_number","previous_class","transferred",
    "student_name","school_year_id","enrollment_id","notes","gender","removed"]){
  assert.match(x,new RegExp("\\b"+field+"\\b"));
 }
 assert.match(x,/p_admission_type text DEFAULT 'continuing'/);
 assert.match(x,/p_note text DEFAULT NULL/);
 assert.match(x,/FOR UPDATE OF se/i);
 assert.match(x,/coalesce\(v_admission_type,\s*'continuing'\)/i);
 assert.match(x,/student_enrollments/);
});
test("5D-F 05 - SQL simulatif isole de supabase migrations",async()=>{
 const x=await read(path);
 assert.match(x,/NEVER MOVE TO supabase\/migrations/);
 assert.match(x,/NOT AN INSTALLABLE MIGRATION/);
 assert.match(x,/NO GRANT/);
});
test("5D-F 06 - fixture PG17 ajoute seulement le genre fictif",async()=>{
 const x=await read("./lot5d/5df_fixture_enhance_postgresql17.sql");
 assert.match(x,/ALTER TABLE public\.profiles ADD COLUMN gender text/);
 assert.match(x,/current_database\(\)<>'schoolnet_lot5d_ci'/);
});
test("5D-F 07 - avant la bascule les contrats existants sont rejoues et annules",async()=>{
 const x=await read("./lot5d/5df_full_regression_pre_postgresql17.sql");
 for(const name of names)assert.match(x,new RegExp("public\\."+name+"\\("));
 assert.match(x,/F-PRE 12/);
 assert.match(x,/^ROLLBACK;/m);
});
test("5D-F 08 - apres la bascule les archives et statuts sont verifies sous ROLLBACK",async()=>{
 const x=await read("./lot5d/5df_full_regression_post_postgresql17.sql");
 for(const item of ["parent_links","report_cards","student_enrollment_documents",
   "class_students","parent_child_ids"]){
  assert.match(x,new RegExp(item));
 }
 assert.match(x,/F-POST 13/);
 assert.match(x,/^ROLLBACK;/m);
});
test("5D-F 09 - deux chemins concurrents DISTINCTS upsert et statut",async()=>{
 const runner=await read("./lot5d/5df_run_cross_postgresql17.sh");
 assert.match(runner,/case "\$scenario" in/);
 assert.match(runner,/5df_cross_upsert_b\.sql/);
 assert.match(runner,/5df_cross_status_b\.sql/);
 assert.match(runner,/pg_stat_activity/);
 assert.match(runner,/lock timeout/);
 assert.match(runner,/127\.0\.0\.1/);
 assert.match(runner,/schoolnet_lot5d_ci/);
});
test("5D-F 10 - la simulation de concurrence est sans cle cloud",async()=>{
 const runner=await read("./lot5d/5df_run_cross_postgresql17.sh");
 for(const name of ["SUPABASE_DB_URL","DATABASE_URL","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_URL"]){
  assert.match(runner,new RegExp(name));
 }
});
test("5D-F 11 - aucun nouvel endpoint et SQL prive non expose",async()=>{
 const x=await read(path);
 assert.doesNotMatch(x,/\bCREATE\s+ROLE\b|\bGRANT\s+EXECUTE\b/i);
 const wf=await read("../.github/workflows/schoolnet-quality.yml");
 assert.match(wf,/lot5d_full_rpc:/);
 assert.match(wf,/lot5d_full_status:/);
 assert.match(wf,/postgres:17-alpine/);
 assert.doesNotMatch(wf,/supabase db push|vercel --prod/i);
});
test("5D-F 12 - code client 5D reste verrouille",async()=>{
 const x=await read("../src/features/enrollments/lib/schoolYearRolloverWritePolicy.ts");
 assert.match(x,/VITE_SCHOOLNET_LOT5D_WRITES_ENABLED/);
});
