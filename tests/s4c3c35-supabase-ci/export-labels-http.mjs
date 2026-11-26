import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// Every request is restricted to the local, disposable Supabase runner.
const API=process.env.API_URL;
const ANON=process.env.ANON_KEY;
const SERVICE=process.env.SERVICE_ROLE_KEY;
assert.equal(API,"http://127.0.0.1:55421");
assert.ok(ANON && SERVICE);
const ids={
 schoolA:"00000000-0000-4000-8000-000000000010",
 schoolB:"00000000-0000-4000-8000-000000000011",
 classA:"00000000-0000-4000-8000-000000000030",
 classB:"00000000-0000-4000-8000-000000000031",
 periodA:"00000000-0000-4000-8000-000000000040",
 periodB:"00000000-0000-4000-8000-000000000041",
 periodExtra:"00000000-0000-4000-8000-000000000042",
 math:"00000000-0000-4000-8000-000000000050",
 french:"00000000-0000-4000-8000-000000000051"
};
const roleKeys=[
 "admin_a","admin_b","teacher_a","teacher_b","parent_a",
 "student_a1","student_a2","student_a3","student_b1","student_transfer"
];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const scope=(school,period,cls)=>({
 p_school_id:school,p_period_id:period,p_class_id:cls
});
const A=scope(ids.schoolA,ids.periodA,ids.classA);
const B=scope(ids.schoolB,ids.periodB,ids.classB);
async function api(path,user,method="GET",body){
 const auth=user==="service"?SERVICE:user==="anon"?ANON:user.jwt;
 const response=await fetch(API+path,{
   method,headers:{
    apikey:user==="service"?SERVICE:ANON,
    Authorization:"Bearer "+auth,"Content-Type":"application/json"
   },
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   signal:AbortSignal.timeout(20_000)
 });
 const raw=await response.text();let data=null;
 try{data=raw?JSON.parse(raw):null;}catch{/*no untrusted log*/ }
 return {status:response.status,data};
}
const rpc=(name,user,args)=>api("/rest/v1/rpc/"+name,user,"POST",args);
const labels=(user,s,kind,subject=null)=>
 rpc("schoolnet_official_export_labels",user,{
  ...s,p_kind:kind,p_subject_id:subject
 });
const catalog=(user,s,action,subjects)=>{
 const body={...s,p_action:action};
 if(subjects!==undefined)body.p_subject_ids=subjects;
 return rpc("schoolnet_school_official_curriculum",user,body);
};
const ok=(r,message)=>{
 assert.ok(r.status>=200&&r.status<300,
  message+": HTTP "+r.status+" / "+String(r.data?.code??"none"));
 return r.data;
};
const denied=(r,label)=>assert.ok([400,401,403].includes(r.status),
 label+": expected authorization failure, got HTTP "+r.status);
const psql=args=>execFileSync("psql",[
 "-X","-h","127.0.0.1","-p","55422","-U","postgres","-d","postgres",
 "-v","ON_ERROR_STOP=1",...args
],{encoding:"utf8",timeout:30_000,
 env:{...process.env,PGPASSWORD:"postgres"},stdio:["ignore","pipe","pipe"]});
const sql=statement=>{
 assert.ok(!/;\s*\S/.test(statement.trim().replace(/;$/,"")));
 return psql(["-At","-c",statement]).trim();
};
const check=(data,s,role,kind,subject,roster)=>{
 assert.deepEqual(Object.keys(data).sort(),[
  "source","previewOnly","kind","roleScope","schoolId","schoolYearId",
  "classId","periodId","subjectId","schoolName","schoolYear","className",
  "periodName","subjectName","activeRosterCount"
 ].sort());
 assert.equal(data.source,"schoolnet_v2_db_scoped_labels_v1");
 assert.equal(data.previewOnly,true);
 assert.equal(data.roleScope,role);
 assert.equal(data.schoolId,s.p_school_id);
 assert.equal(data.schoolYearId,"00000000-0000-4000-8000-000000000020");
 assert.equal(data.classId,s.p_class_id);
 assert.equal(data.periodId,s.p_period_id);
 assert.equal(data.kind,kind);
 assert.equal(data.subjectId,subject);
 assert.equal(data.activeRosterCount,roster);
 assert.ok(!/\"(?:studentId|studentName|score|averageOn20|grade|email|token|jwt|assessmentId)\"/i
   .test(JSON.stringify(data)),"private student data must never be projected");
};
test("S4-D.2c.4: real Auth/JWT metadata from disposable school labels",async t=>{
 const users={};
 await t.test("create ten unrelated local GoTrue users and real JWTs",async()=>{
  for(const k of roleKeys){
   const email="schoolnet-s4d2c4-"+k+"-"+randomUUID()+"@example.test";
   const password=randomBytes(20).toString("hex");
   const u=ok(await api("/auth/v1/admin/users","service","POST",{
    email,password,email_confirm:true
   }),"create "+k);
   assert.match(u.id??"",uuid);
   const signed=ok(await api("/auth/v1/token?grant_type=password","anon","POST",{
    email,password
   }),"sign-in "+k);
   assert.equal(signed.user.id,u.id);
   users[k]={id:u.id,jwt:signed.access_token};
  }
  assert.equal(new Set(Object.values(users).map(u=>u.id)).size,10);
 });
 await t.test("seed existing real-GoTrue fixture and synthetic DB display names",async()=>{
  const vars=roleKeys.flatMap(k=>["-v",k+"="+users[k].id]);
  for(const k of roleKeys)assert.match(users[k].id,uuid);
  const seeded=psql([...vars,"-f","fixtures/official-averages-auth-seed.sql"]);
  assert.match(seeded,/C3C352_REAL_AUTH_FIXTURE_READY/);
  const names=psql(["-f","fixtures/s4d2c4_disposable_names_seed.sql"]);
  assert.match(names,/S4D2C4_SYNTHETIC_NAMES_READY_DISPOSABLE_ONLY/);
 });
 await t.test("anonymous, parent, students and unassigned users denied",async()=>{
  for(const user of ["anon",users.parent_a,users.student_a1,users.student_b1]){
   denied(await labels(user,A,"class_general"),"unauthorized caller");
  }
  denied(await labels(users.teacher_a,A,"class_general"),"teacher forbidden general");
  denied(await labels(users.admin_a,A,"subject_period",ids.math),"admin not teacher");
 });
 await t.test("admin cannot obtain metadata before curriculum approval",async()=>{
  denied(await labels(users.admin_a,A,"class_general"),"unapproved");
  const t1=ok(await labels(users.teacher_a,A,"subject_period",ids.math),
   "assigned teacher before approval");
  check(t1,A,"teacher","subject_period",ids.math,4);
  assert.equal(t1.schoolName,"Collège synthétique A");
  assert.equal(t1.className,"6e B (simulation)");
  assert.equal(t1.subjectName,"Mathématiques fictives");
 });
 await t.test("approve two separate curricula using real signed school admins",async()=>{
  for(const [user,s,subjects] of [
   [users.admin_a,A,[ids.math,ids.french]],
   [users.admin_b,B,[ids.math]]
  ]){
   const draft=ok(await catalog(user,s,"set",subjects),"draft");
   assert.equal(draft.status,"draft");
   const approval=ok(await catalog(user,s,"approve"),"approve");
   assert.equal(approval.status,"approved");
  }
 });
 await t.test("admin A and teacher A receive only authorized A labels",async()=>{
  const a=ok(await labels(users.admin_a,A,"class_general"),"admin A");
  check(a,A,"school_admin","class_general",null,4);
  assert.equal(a.subjectName,null);
  assert.equal(a.periodName,"Premier trimestre (T1)");
  assert.equal(a.schoolYear,"2026-2027 (simulation)");
  const tA=ok(await labels(users.teacher_a,A,"subject_period",ids.french),"teacher French");
  check(tA,A,"teacher","subject_period",ids.french,4);
  assert.equal(tA.subjectName,"Français fictif");
 });
 await t.test("school B labels and roster stay isolated from school A",async()=>{
  const b=ok(await labels(users.admin_b,B,"class_general"),"admin B");
  check(b,B,"school_admin","class_general",null,2);
  assert.equal(b.schoolName,"Collège synthétique B");
  assert.equal(b.className,"5e A (simulation)");
  const tb=ok(await labels(users.teacher_b,B,"subject_period",ids.math),"teacher B");
  check(tb,B,"teacher","subject_period",ids.math,2);
  for(const [u,s,k,sub] of [
   [users.admin_a,B,"class_general",null],
   [users.admin_b,A,"class_general",null],
   [users.teacher_a,B,"subject_period",ids.math],
   [users.teacher_b,A,"subject_period",ids.math],
   [users.admin_a,scope(ids.schoolA,ids.periodB,ids.classA),"class_general",null],
   [users.admin_a,scope(ids.schoolA,ids.periodA,ids.classB),"class_general",null],
   [users.teacher_a,scope(ids.schoolA,ids.periodExtra,ids.classA),"subject_period",ids.math],
   [users.teacher_a,A,"subject_period","00000000-0000-4000-8000-000000000999"]
  ]) denied(await labels(u,s,k,sub),"foreign school/class/period/subject");
 });
 await t.test("revoking teacher membership or subject assignment denies old JWT",async()=>{
  sql("UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()"+
   " WHERE school_id='"+ids.schoolA+"' AND user_id='"+users.teacher_a.id+"'");
  denied(await labels(users.teacher_a,A,"subject_period",ids.math),"teacher revoked");
  sql("UPDATE public.schoolnet_school_memberships SET status='active',revoked_at=NULL"+
   " WHERE school_id='"+ids.schoolA+"' AND user_id='"+users.teacher_a.id+"'");
  sql("UPDATE public.schoolnet_school_teacher_subject_assignments SET status='revoked',revoked_at=now()"+
   " WHERE school_id='"+ids.schoolA+"' AND teacher_id='"+users.teacher_a.id+"'"+
   " AND subject_id='"+ids.math+"'");
  denied(await labels(users.teacher_a,A,"subject_period",ids.math),"subject assignment revoked");
  sql("UPDATE public.schoolnet_school_teacher_subject_assignments SET status='active',revoked_at=NULL"+
   " WHERE school_id='"+ids.schoolA+"' AND teacher_id='"+users.teacher_a.id+"'"+
   " AND subject_id='"+ids.math+"'");
  check(ok(await labels(users.teacher_a,A,"subject_period",ids.math),"restored"),
   A,"teacher","subject_period",ids.math,4);
 });
 await t.test("inactive school and invalid DB-sourced labels fail closed",async()=>{
  sql("UPDATE public.schoolnet_schools SET status='suspended' WHERE id='"+ids.schoolA+"'");
  denied(await labels(users.admin_a,A,"class_general"),"school suspended");
  sql("UPDATE public.schoolnet_schools SET status='active' WHERE id='"+ids.schoolA+"'");
  sql("UPDATE public.classes SET name=NULL WHERE id='"+ids.classA+"'");
  denied(await labels(users.admin_a,A,"class_general"),"missing class name");
  sql("UPDATE public.classes SET name=' 6e B' WHERE id='"+ids.classA+"'");
  denied(await labels(users.admin_a,A,"class_general"),"bad trimmed name");
  sql("UPDATE public.classes SET name='6e B (simulation)' WHERE id='"+ids.classA+"'");
  check(ok(await labels(users.admin_a,A,"class_general"),"restored labels"),
   A,"school_admin","class_general",null,4);
 });
 await t.test("student affiliation removal updates aggregate without leaking names",async()=>{
  sql("UPDATE public.schoolnet_school_student_class_assignments"+
   " SET status='revoked',revoked_at=now()"+
   " WHERE class_id='"+ids.classA+"' AND student_id='"+users.student_a2.id+"'");
  const c=ok(await labels(users.admin_a,A,"class_general"),"reduced roster");
  check(c,A,"school_admin","class_general",null,3);
  sql("UPDATE public.schoolnet_school_student_class_assignments"+
   " SET status='active',revoked_at=NULL"+
   " WHERE class_id='"+ids.classA+"' AND student_id='"+users.student_a2.id+"'");
  check(ok(await labels(users.admin_a,A,"class_general"),"restored roster"),
   A,"school_admin","class_general",null,4);
 });
 await t.test("revoked admin JWT rejected, no raw rows, no audit/grade changes",async()=>{
  sql("UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()"+
   " WHERE school_id='"+ids.schoolB+"' AND user_id='"+users.admin_b.id+"'");
  denied(await labels(users.admin_b,B,"class_general"),"revoked admin B");
  const hidden=await api("/rest/v1/rpc/school_official_export_labels",
   users.admin_a,"POST",{...A,p_kind:"class_general",p_subject_id:null});
  assert.equal(hidden.status,404,"private schema must not be exposed");
  denied(await api("/rest/v1/profiles?select=*",users.admin_a),"no direct profile read");
  assert.equal(Number(sql("SELECT count(*) FROM public.assessment_submissions")),11);
  assert.equal(Number(sql(
   "SELECT count(*) FROM schoolnet_private.school_export_preview_audit")),0);
 });
});
