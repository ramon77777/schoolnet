// SCHOOLNET Lot 5D-I; all tests offline, no network or SQL calls.
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {readVerifiedParentAnnualClasses} from
  "../supabase/functions/_shared/lot5diParentAnnualRead.ts";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
const links=[{student_id:"student-a"},{student_id:"student-b"}];
const year=[{id:"year-current"}];
const entry=(student,yearId,classId,status="active")=>({
 student_id:student,school_year_id:yearId,class_id:classId,status
});
const make=(override={})=>{
 const calls=[];
 const adapter={
  parentId:"parent-from-auth",
  getConfirmedRole:async(id)=>{calls.push(["role",id]);return "parent";},
  getVerifiedLinks:async(id)=>{calls.push(["links",id]);return links;},
  getCurrentYears:async()=>{calls.push(["year"]);return year;},
  getAnnualEnrollments:async(ids,id)=>{calls.push(["enrollments",ids,id]);
    return [entry("student-a","year-old","old"),
      entry("student-a","year-current","new")];},
  getYearClasses:async(ids,id)=>{calls.push(["classes",ids,id]);
    return [{id:"new",name:"5e B",school_year_id:"year-current"}];},
  ...override,
 };
 return {calls,run:()=>readVerifiedParentAnnualClasses(adapter)};
};
test("I 01 - role from server is first authority check",async()=>{
 const x=make();const result=await x.run();
 assert.equal(x.calls[0][0],"role");assert.equal(x.calls[1][0],"links");
 assert.equal(x.calls[0][1],"parent-from-auth");
 assert.equal(result.schoolYearId,"year-current");
});
test("I 02 - non-Parent roles cannot enumerate family",async()=>{
 for(const role of ["teacher","student","admin","school_admin",null]){
  const x=make({getConfirmedRole:async()=>role});
  await assert.rejects(x.run(),/parent_role_required/);
  assert.equal(x.calls.length,0);
 }
});
test("I 03 - no verified identity denies all calls",async()=>{
 const x=make({parentId:""});
 await assert.rejects(x.run(),/unverified_parent/);
 assert.equal(x.calls.length,0);
});
test("I 04 - no links returns empty without year lookup",async()=>{
 const x=make({getVerifiedLinks:async()=>[]});
 assert.deepEqual(await x.run(),{schoolYearId:null,children:[]});
 assert.equal(x.calls.some(c=>c[0]==="year"),false);
});
test("I 05 - current class wins over historical assignment",async()=>{
 const r=await make().run();
 assert.deepEqual(r.children.map(c=>c.studentId),["student-a","student-b"]);
 assert.equal(r.children[0].className,"5e B");
 assert.equal(r.children[0].state,"current");
 assert.equal(r.children[1].state,"unassigned");
});
test("I 06 - extra student rows cannot leak to another Parent",async()=>{
 const x=make({getAnnualEnrollments:async()=>[
  entry("student-x","year-current","secret"),
  entry("student-a","year-current","new")
 ],getYearClasses:async()=>[
  {id:"secret",name:"SECRET CLASS",school_year_id:"year-current"},
  {id:"new",name:"5e B",school_year_id:"year-current"}
 ]});
 const r=await x.run();
 assert.equal(r.children.length,2);
 assert.equal(JSON.stringify(r).includes("SECRET CLASS"),false);
});
test("I 07 - missing current year returns unavailable",async()=>{
 const x=make({getCurrentYears:async()=>[]});
 const r=await x.run();
 assert.equal(r.schoolYearId,null);
 assert.ok(r.children.every(c=>c.state==="unavailable"));
 assert.equal(x.calls.some(c=>c[0]==="enrollments"),false);
});
test("I 08 - two current years cannot be guessed",async()=>{
 const x=make({getCurrentYears:async()=>[year[0],{id:"other"}]});
 const r=await x.run();
 assert.ok(r.children.every(c=>c.state==="unavailable"));
});
test("I 09 - inactive enrollment statuses are not current classes",async()=>{
 const x=make({getAnnualEnrollments:async()=>[
  entry("student-a","year-current","new","draft"),
  entry("student-b","year-current","new","withdrawn")
 ]});
 const r=await x.run();
 assert.ok(r.children.every(c=>c.state==="unassigned"));
});
test("I 10 - classes from a different year are denied",async()=>{
 const x=make({getYearClasses:async()=>[
  {id:"new",name:"OLD",school_year_id:"year-old"}
 ]});
 const r=await x.run();
 assert.equal(r.children[0].state,"unavailable");
});
test("I 11 - class not readable must stay unavailable",async()=>{
 const x=make({getYearClasses:async()=>[]});
 assert.equal((await x.run()).children[0].state,"unavailable");
});
test("I 12 - contradictory active enrollments do not pick latest",async()=>{
 const x=make({getAnnualEnrollments:async()=>[
  entry("student-a","year-current","new"),
  entry("student-a","year-current","other")
 ]});
 const r=await x.run();
 assert.equal(r.children[0].state,"conflict");
 assert.equal(r.children[0].className,null);
});
test("I 13 - private DB errors fail closed",async()=>{
 const x=make({getAnnualEnrollments:async()=>{throw Error("db unavailable");}});
 await assert.rejects(x.run(),/db unavailable/);
});
test("I 14 - oversized family data refused",async()=>{
 const x=make({getVerifiedLinks:async()=>Array.from({length:101},
  (_,i)=>({student_id:"id-"+i}))});
 await assert.rejects(x.run(),/too_many_links/);
});
test("I 15 - oversized annual data refused",async()=>{
 const x=make({getAnnualEnrollments:async()=>Array.from({length:201},
  ()=>entry("student-a","year-current","new"))});
 await assert.rejects(x.run(),/too_many_enrollments/);
});
test("I 16 - duplicate parent links never create duplicate cards",async()=>{
 const x=make({getVerifiedLinks:async()=>[
  {student_id:"student-a"},{student_id:"student-a"}]});
 const r=await x.run();
 assert.deepEqual(r.children.map(c=>c.studentId),["student-a"]);
});
test("I 17 - Edge function requires exact project, origin and server opt-in",async()=>{
 const x=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.match(x,/SCHOOLNET_LOT5DI_PARENT_READ_ENABLED/);
 assert.match(x,/https:\/\/anttmbhaphkhmkoqsofd\.supabase\.co/);
 assert.match(x,/https:\/\/schoolnet-snowy\.vercel\.app/);
 assert.match(x,/origin !== EXPECTED_ORIGIN/);
});
test("I 18 - Edge Auth getUser and fresh role lookup enforce Parent",async()=>{
 const x=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.match(x,/auth\.getUser\(bearer\.slice\(7\)\)/);
 assert.match(x,/\.from\("profiles"\)/);
 assert.match(x,/getConfirmedRole/);
});
test("I 19 - browser cannot supply Parent/Student IDs in Edge body",async()=>{
 const x=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.match(x,/Object\.keys\(parsed\)\.length !== 1/);
 assert.match(x,/action !== "list_current_classes"/);
 assert.match(x,/parentId: actorId/);
 assert.doesNotMatch(x,/parsed\.parent_id|parsed\.student_id|parsed\.role/);
});
test("I 20 - parent links, year and student list scoped server-side",async()=>{
 const x=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.match(x,/\.eq\("parent_id", parentId\)/);
 assert.match(x,/\.eq\("school_year_id", year\)\.eq\("status", "active"\)/);
 assert.match(x,/\.in\("student_id", \[\.\.\.ids\]\)/);
});
test("I 21 - response discloses only permitted class labels",async()=>{
 const x=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.match(x,/student_id: row\.studentId, state: row\.state, class_name: row\.className/);
 assert.match(x,/cache-control": "no-store/);
});
test("I 22 - Edge is NOT deployed or called by Parent UI",async()=>{
 const cfg=await read("../supabase/config.toml");
 const ui=await read("../src/features/parent/pages/ParentChildren.tsx");
 assert.doesNotMatch(cfg,/schoolnet-parent-current-class/);
 assert.doesNotMatch(ui,/schoolnet-parent-current-class/);
});
test("I 23 - private SQL candidate guarded to PG17 sandbox",async()=>{
 const x=await read("../supabase/proposals/20261118_schoolnet_lot5di_document_review_SANDBOX_ONLY.sql");
 assert.match(x,/SANDBOX_ONLY/);
 assert.match(x,/current_database\(\)<>'schoolnet_lot5d_ci'/);
 assert.match(x,/server_version_num/);
 assert.match(x,/document_deletion_review_events/);
});
test("I 24 - no grants to clients or direct data deletion",async()=>{
 const x=await read("../supabase/proposals/20261118_schoolnet_lot5di_document_review_SANDBOX_ONLY.sql");
 assert.match(x,/REVOKE ALL ON FUNCTION/);
 assert.doesNotMatch(x,/\bGRANT EXECUTE\b|\bGRANT ALL\b/i);
 assert.doesNotMatch(x,/\bDELETE\s+FROM\s+(?:public\.student_enrollment_documents|storage\.objects)/i);
});
test("I 25 - operation idempotence and annual lock before rows",async()=>{
 const x=await read("../supabase/proposals/20261118_schoolnet_lot5di_document_review_SANDBOX_ONLY.sql");
 assert.match(x,/LOCK TABLE public\.school_years IN SHARE MODE/);
 assert.match(x,/operation_id uuid PRIMARY KEY/);
 assert.match(x,/document_id uuid NOT NULL UNIQUE/);
 assert.match(x,/already_requested/);
});
test("I 26 - unresolved document review blocks school year finalizer",async()=>{
 const x=await read("../supabase/proposals/20261118_schoolnet_lot5di_document_review_SANDBOX_ONLY.sql");
 assert.match(x,/guard_year_with_pending_document_review/);
 assert.match(x,/OLD\.is_current IS TRUE AND NEW\.is_current IS FALSE/);
});
test("I 27 - PG17 tests cover Admin, retry, role denial and no mutation",async()=>{
 const x=await read("./lot5d/5di_document_review_postgresql17.sql");
 for(const word of ["I 01","I 02","I 03","I 04","I 05","I 06","I 07","I 08"])
  assert.ok(x.includes(word),word);
 assert.match(x,/^ROLLBACK;/m);
});
test("I 28 - old document remove control stays disabled",async()=>{
 const ui=await read("../src/features/enrollments/components/AdminEnrollmentDocuments.tsx");
 assert.match(ui,/Suppression suspendue/);
 assert.doesNotMatch(ui,/\.remove\(\[item\.storage_path\]\)/);
});
test("I 29 - CI runs I tests with separate PG17 instance",async()=>{
 const wf=await read("../.github/workflows/schoolnet-quality.yml");
 assert.match(wf,/lot5d_document_review:/);
 assert.match(wf,/qa:lot5d:i/);
 assert.match(wf,/deno check.*schoolnet-parent-current-class\/index\.ts/);
 assert.doesNotMatch(wf,/supabase db push|vercel --prod/i);
});
test("I 30 - new Edge read never writes or removes Storage objects",async()=>{
 const x=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.doesNotMatch(x,/\.insert\(|\.delete\(|\.update\(|storage\.from\(/);
 assert.match(x,/getVerifiedLinks/);
});
