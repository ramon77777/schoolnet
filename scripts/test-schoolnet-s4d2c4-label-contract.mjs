import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  SCHOOLNET_EXPORT_LABELS_RPC, makeServerExportLabelArgs,
  verifyServerExportLabels,
} from "../src/features/official-documents/lib/schoolOfficialExportServerLabels.ts";
import {SCHOOLNET_REAL_EXPORTS_RELEASED} from "../src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts";
import {makeSyntheticExportCase} from "./fixtures/schoolnet-s4d2c2-synthetic-preview.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const fake=(opts={})=>{
  const f=makeSyntheticExportCase(opts);
  return {
    f,
    labels:{
      source:"schoolnet_v2_db_scoped_labels_v1",previewOnly:true,
      kind:f.request.kind,roleScope:f.viewer.role,
      schoolId:f.request.scope.schoolId,
      schoolYearId:f.request.scope.schoolYearId,
      classId:f.request.scope.classId,
      periodId:f.request.scope.periodId,
      subjectId:f.request.subjectId,
      schoolName:"Collège synthétique A",
      schoolYear:"2026-2027 (simulation)",
      className:"6e B (simulation)",
      periodName:"Premier trimestre (T1)",
      subjectName:f.request.kind==="subject_period"?"Mathématiques fictives":null,
      activeRosterCount:f.projection.studentCount,
    },
  };
};
const call=(obj)=>verifyServerExportLabels(obj.labels,obj.f.request,
  obj.f.viewer,obj.f.projection);
const fresh=(obj)=>structuredClone(obj);

test("S4-D.2c.4: metadata RPC has 5 allowlisted inputs, no actor or grades",()=>{
  const {f}=fake();
  assert.equal(SCHOOLNET_EXPORT_LABELS_RPC,"schoolnet_official_export_labels");
  assert.deepEqual(makeServerExportLabelArgs(f.request,f.viewer),{
    p_school_id:f.request.scope.schoolId,
    p_period_id:f.request.scope.periodId,
    p_class_id:f.request.scope.classId,
    p_kind:"subject_period",
    p_subject_id:f.request.subjectId,
  });
  assert.ok(!JSON.stringify(makeServerExportLabelArgs(f.request,f.viewer)).includes(f.viewer.id));
  assert.ok(!JSON.stringify(makeServerExportLabelArgs(f.request,f.viewer)).includes(f.request.scope.schoolYearId));
});
test("S4-D.2c.4: server-bound teacher labels match source and validated V2 grade projection",()=>{
 const t=fake();
 assert.deepEqual(call(t),t.labels);
 const c=fake({kind:"class_general",format:"xlsx"});
 assert.deepEqual(call(c),c.labels);
 assert.equal(c.labels.subjectName,null);
 assert.equal(c.labels.roleScope,"school_admin");
});
test("S4-D.2c.4: mismatched school/year/class/period/subject/role fail closed",()=>{
 const f=fake();
 for(const key of ["schoolId","schoolYearId","classId","periodId","subjectId"]){
   const obj=fresh(f);
   obj.labels[key]="00000000-0000-4000-8000-000000000999";
   assert.throws(()=>call(obj),key);
 }
 let obj=fresh(f);obj.labels.roleScope="school_admin";assert.throws(()=>call(obj));
 obj=fresh(f);obj.labels.kind="class_general";assert.throws(()=>call(obj));
 obj=fresh(f);obj.labels.previewOnly=false;assert.throws(()=>call(obj));
 obj=fresh(f);obj.labels.source="browser-supplied";assert.throws(()=>call(obj));
});
test("S4-D.2c.4: invalid labels, missing and extra JSON fields never pass",()=>{
 const f=fake();
 for(const key of ["schoolName","schoolYear","className","periodName","subjectName"]){
  for(const invalid of [null,"", " leading", "\t", "A\nB","X".repeat(130)]){
   const obj=fresh(f);
   obj.labels[key]=invalid;
   assert.throws(()=>call(obj),key+"="+String(invalid));
  }
 }
 const obj=fresh(f);obj.labels.user_metadata="forged";assert.throws(()=>call(obj));
 const other=fresh(f);delete other.labels.schoolYear;assert.throws(()=>call(other));
});
test("S4-D.2c.4: roster count must match PREVIEW, not caller-supplied count",()=>{
 const f=fake();
 for(const n of [0,1,14,251,-1,1.5,"13",null]){
   const obj=fresh(f);obj.labels.activeRosterCount=n;
   assert.throws(()=>call(obj),"roster="+String(n));
 }
 assert.equal(call(f).activeRosterCount,13);
});
test("S4-D.2c.4: true zero and missing grades stay unchanged after label verification",()=>{
 const t=fake();
 const json=JSON.stringify(t.f.projection);
 call(t);
 assert.equal(JSON.stringify(t.f.projection),json);
 assert.equal(t.f.projection.students[1].averageOn20,0);
 assert.equal(t.f.projection.students[2].averageOn20,null);
 const bad=fresh(t);bad.f.projection.students[2].averageOn20=0;
 assert.throws(()=>call(bad));
});
test("S4-D.2c.4: annual, published, mismatched viewer and subjectless teacher rejected",()=>{
 const t=fake();
 let obj=fresh(t);obj.f.request.cadence="annual";assert.throws(()=>call(obj));
 obj=fresh(t);obj.f.request.state="published";assert.throws(()=>call(obj));
 obj=fresh(t);obj.f.viewer.isDemo=true;assert.throws(()=>call(obj));
 obj=fresh(t);obj.f.request.viewerId="00000000-0000-4000-8000-000000009999";
 assert.throws(()=>call(obj));
 obj=fresh(t);obj.f.request.subjectId=null;assert.throws(()=>call(obj));
});
test("S4-D.2c.4: private SQL requires live JWT, active membership and approved catalog",()=>{
 const sql=read("supabase/proposals/s4d2c4_school_export_authorized_labels.sql");
 for(const v of [
  "auth.uid()","public.get_my_role()","schoolnet_school_memberships",
  "m.status='active' AND m.revoked_at IS NULL","school.status='active'",
  "assignment.status='active' AND assignment.revoked_at IS NULL",
  "curriculum.status='approved'","school_period_subject_coefficients",
  "schoolnet_school_student_class_assignments","count(DISTINCT assignment.student_id)",
  "SECURITY DEFINER SET search_path=pg_catalog",
  "SECURITY INVOKER SET search_path=pg_catalog",
  "GRANT EXECUTE ON FUNCTION public.schoolnet_official_export_labels",
  "has_function_privilege('anon'"
 ]) assert.ok(sql.includes(v),"missing SQL protection: "+v);
 assert.doesNotMatch(sql,/SELECT\s+[^;]*?(?:submission|grade|score|assessment_submissions)/i);
 assert.doesNotMatch(sql,/(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?(?:public|schoolnet_private)\./i);
 assert.doesNotMatch(sql,/CREATE TABLE/);
});
test("S4-D.2c.4: no browser import, SQL production install, or Vercel branch release",()=>{
 const hub=read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
 const bridge=read("src/features/official-documents/lib/schoolOfficialExportPreviewBridge.ts");
 const model=read("src/features/official-documents/lib/schoolOfficialExportServerLabels.ts");
 const ci=read(".github/workflows/schoolnet-s4d2c4-authorized-labels-ci.yml");
 const vercel=JSON.parse(read("vercel.json"));
 const p=JSON.parse(read("package.json"));
 assert.ok(!hub.includes("schoolOfficialExportServerLabels"));
 assert.equal(SCHOOLNET_REAL_EXPORTS_RELEASED,false);
 assert.match(bridge,/SCHOOLNET_REAL_EXPORTS_RELEASED = false/);
 assert.equal(vercel.git.deploymentEnabled[
   "feature/schoolnet-s4d2c4-authorized-metadata-20261126"],false);
 assert.equal(p.scripts["qa:s4d2c4"],
 "node --experimental-strip-types --test scripts/test-schoolnet-s4d2c4-label-contract.mjs");
 assert.match(ci,/permissions:\n  contents: read/);
 assert.match(ci,/persist-credentials: false/);
 assert.match(ci,/S4D2C4_DISPOSABLE/);
 for(const x of [ci,model]){
  assert.doesNotMatch(x,/secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN|db push|migration repair|--linked|vercel deploy|supabase\.from|supabase\.rpc/i);
 }
});

test("S4-D.2c.4: disposable Auth fixture recognizes full 8-4-4-4-12 UUID",()=>{
 const runner=read("tests/s4c3c35-supabase-ci/export-labels-http.mjs");
 const expected="const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;";
 assert.ok(runner.includes(expected),"GoTrue JWT UUID validation must include every UUID group");
});
