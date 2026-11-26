import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";

// CI ONLY: two Supabase secrets come from the disposable LOCAL Supabase CLI.
const API=process.env.API_URL;
const ANON=process.env.ANON_KEY;
const SERVICE=process.env.SERVICE_ROLE_KEY;
assert.equal(API,"http://127.0.0.1:55421","Only localhost ephemeral Supabase allowed");
assert.ok(ANON&&SERVICE,"Missing ephemeral GoTrue test keys");

const A="00000000-0000-4000-8000-000000000010";
const B="00000000-0000-4000-8000-000000000011";
const A_CLASS="00000000-0000-4000-8000-000000000030";
const B_CLASS="00000000-0000-4000-8000-000000000031";
const A_PERIOD="00000000-0000-4000-8000-000000000040";
const B_PERIOD="00000000-0000-4000-8000-000000000041";
const MATH="00000000-0000-4000-8000-000000000050";
const FRENCH="00000000-0000-4000-8000-000000000051";
const FRENCH_ASSESSMENT="00000000-0000-4000-8000-0000000000b1";
const names=[
 "admin_a","admin_b","teacher_a","teacher_b","parent_a",
 "student_a1","student_a2","student_a3","student_b1","student_transfer"
];
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const authRequest=async(path,user,method="GET",body)=>{
 const access=user==="service"?SERVICE:user==="anon"?ANON:user.jwt;
 const resp=await fetch(API+path,{
  method,
  headers:{
   apikey:user==="service"?SERVICE:ANON,
   Authorization:"Bearer "+access,
   "Content-Type":"application/json",
  },
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(20000),
 });
 const raw=await resp.text();
 let data=null;
 try{data=raw?JSON.parse(raw):null;}catch{/* no credentials in errors */}
 return{status:resp.status,data};
};
const rpc=(name,user,body)=>authRequest("/rest/v1/rpc/"+name,user,"POST",body);
const args=(school,period,cls,student)=>({
 p_school_id:school,p_period_id:period,p_class_id:cls,p_student_id:student,
});
const catalogArgs=(school,period,cls,action,subjects)=>({
 p_school_id:school,p_period_id:period,p_class_id:cls,p_action:action,
 ...(subjects?{p_subject_ids:subjects}:{}),
});
const good=(response,label)=>{
 assert.ok(response.status>=200&&response.status<300,
  label+": status="+response.status+" error="+(response.data?.code??"unknown"));
 return response.data;
};
const denied=(response,label)=>{
 assert.ok([400,401,403,404].includes(response.status),
  label+": expected denial, status="+response.status);
};
const psql=(parts)=>execFileSync("psql",[
 "-X","-h","127.0.0.1","-p","55422","-U","postgres","-d","postgres",
 "-v","ON_ERROR_STOP=1",...parts
],{encoding:"utf8",env:{...process.env,PGPASSWORD:"postgres"},
  timeout:30000,stdio:["ignore","pipe","pipe"]});
const writeSql=sql=>{
 assert.ok(!/;\s*\S/.test(sql.trim().replace(/;$/,"")),"Single trusted SQL");
 psql(["-c",sql]);
};
const preview=(user,school,period,cls,student)=>rpc(
 "schoolnet_school_report_card_preview",user,args(school,period,cls,student),
);
const general=(user,school,period,cls)=>rpc(
 "schoolnet_school_official_general_averages",user,{
  p_school_id:school,p_period_id:period,p_class_id:cls,
 },
);
const forbiddenRaw=(projection)=>{
 const payload=JSON.stringify(projection);
 for(const word of [
  '"score"','"maxScore"','"assessmentId"','"publishedAt"',
  '"teacherId"','"ranking"','"comment"','"rawGrades"'
 ])assert.ok(!payload.includes(word),"Raw field leaked: "+word);
};
const subjects=(v)=>new Map(v.subjects.map(s=>[s.subjectId,s]));

test("S4-D.3b: real ephemeral Auth JWT isolates single-student report-card subjects",async t=>{
 const people={};
 await t.test("create ten fictional local Auth accounts and real tokens",async()=>{
  for(const name of names){
   const email="s4d3b-"+name+"-"+randomUUID()+"@example.test";
   const password=randomBytes(20).toString("hex");
   const created=good(await authRequest("/auth/v1/admin/users",
     "service","POST",{email,password,email_confirm:true}),
     "create local account");
   assert.match(created.id,uid);
   const signed=good(await authRequest("/auth/v1/token?grant_type=password",
     "anon","POST",{email,password}),"login local account");
   assert.equal(signed.user?.id,created.id);
   people[name]={id:created.id,jwt:signed.access_token};
  }
  assert.equal(new Set(Object.values(people).map(x=>x.id)).size,names.length);
 });
 await t.test("seed only the ten local auth IDs",async()=>{
  const flags=names.flatMap(k=>["-v",k+"="+people[k].id]);
  assert.match(psql([...flags,"-f",
   "fixtures/official-averages-auth-seed.sql"]),/C3C352_REAL_AUTH_FIXTURE_READY/);
 });
 await t.test("reject anonymous, teacher, student and parent, before curriculum",async()=>{
  for(const who of ["anon",people.teacher_a,people.parent_a,people.student_a1]){
   denied(await preview(who,A,A_PERIOD,A_CLASS,people.student_a1.id),
     "not school_admin");
  }
  denied(await preview(people.admin_a,A,A_PERIOD,A_CLASS,people.student_a1.id),
   "unapproved curriculum");
 });
 await t.test("approve only school-admin catalog A (Math/French) and B (Math)",async()=>{
  for(const [person,school,period,cls,ids] of [
   [people.admin_a,A,A_PERIOD,A_CLASS,[MATH,FRENCH]],
   [people.admin_b,B,B_PERIOD,B_CLASS,[MATH]],
  ]){
   good(await rpc("schoolnet_school_official_curriculum",person,
    catalogArgs(school,period,cls,"set",ids)),"set");
   const result=good(await rpc("schoolnet_school_official_curriculum",person,
    catalogArgs(school,period,cls,"approve")),"approve");
   assert.equal(result.status,"approved");
  }
 });
 await t.test("A1 receives actual numeric kernel Maths/French, 16.67/20, no raw notes",async()=>{
  const data=good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,people.student_a1.id),
   "A1");
  forbiddenRaw(data);
  assert.equal(data.projection,"schoolnet_v2_report_card_provisional_v1");
  assert.equal(data.previewOnly,true);
  assert.equal(data.schoolAdminScoped,true);
  assert.equal(data.documentState,"provisional");
  assert.equal(data.schoolId,A);
  assert.equal(data.classId,A_CLASS);
  assert.equal(data.studentId,people.student_a1.id);
  assert.equal(data.state,"ready");
  assert.equal(data.averageOn20,16.67);
  assert.equal(data.readySubjects,2);
  assert.equal(data.expectedSubjects,2);
  assert.equal(data.subjects.length,2);
  const by=subjects(data);
  assert.equal(by.get(MATH).averageOn20,20);
  assert.equal(by.get(MATH).coefficient,2);
  assert.equal(by.get(MATH).subjectName,"Mathématiques fictives");
  assert.equal(by.get(FRENCH).averageOn20,10);
  assert.equal(by.get(FRENCH).coefficient,1);
  assert.equal(by.get(FRENCH).subjectName,"Français fictif");
  assert.equal(by.get(MATH).publishedAssessments,1);
  assert.equal(by.get(FRENCH).publishedAssessments,1);
  const original=good(await general(people.admin_a,A,A_PERIOD,A_CLASS),"general");
  const originalRow=original.students.find(x=>x.studentId===people.student_a1.id);
  assert.equal(data.averageOn20,originalRow.averageOn20);
 });
 await t.test("true 0 / 20 remains a published number in both subject rows",async()=>{
  const data=good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,people.student_a3.id),
   "A3 zero");
  forbiddenRaw(data);
  assert.equal(data.averageOn20,0);
  assert.deepEqual(data.subjects.map(s=>s.averageOn20),[0,0]);
 });
 await t.test("incomplete French remains NULL while ready Maths is visible",async()=>{
  const data=good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,people.student_a2.id),
   "A2 incomplete");
  forbiddenRaw(data);
  assert.equal(data.state,"incomplete");
  assert.equal(data.averageOn20,null);
  assert.equal(data.readySubjects,1);
  const by=subjects(data);
  assert.equal(by.get(MATH).state,"ready");
  assert.equal(by.get(MATH).averageOn20,18);
  assert.equal(by.get(FRENCH).state,"incomplete");
  assert.equal(by.get(FRENCH).averageOn20,null);
  assert.equal(by.get(FRENCH).missingAssessments,1);
 });
 await t.test("ambiguous transfer cannot reveal a final average or raw subjects",async()=>{
  const data=good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,
   people.student_transfer.id),"transfer");
  assert.equal(data.state,"incomplete");
  assert.equal(data.averageOn20,null);
  assert.ok(data.subjects.every(s=>s.averageOn20===null));
 });
 await t.test("school B gets only its own fictitious student and 17/20",async()=>{
  const data=good(await preview(people.admin_b,B,B_PERIOD,B_CLASS,people.student_b1.id),
   "B1");
  assert.equal(data.averageOn20,17);
  assert.equal(data.subjects.length,1);
  assert.equal(data.subjects[0].averageOn20,17);
  forbiddenRaw(data);
 });
 await t.test("deny B school, cross-class, missing roster and extra forged identity",async()=>{
  denied(await preview(people.admin_a,B,B_PERIOD,B_CLASS,people.student_b1.id),"A/B");
  denied(await preview(people.admin_b,A,A_PERIOD,A_CLASS,people.student_a1.id),"B/A");
  denied(await preview(people.admin_a,A,A_PERIOD,A_CLASS,people.student_b1.id),"foreign pupil");
  denied(await preview(people.admin_a,A,A_PERIOD,B_CLASS,people.student_a1.id),"mixed class");
  denied(await preview(people.admin_a,B,A_PERIOD,B_CLASS,people.student_a1.id),"mixed school");
  denied(await rpc("schoolnet_school_report_card_preview",people.admin_a,{
   ...args(A,A_PERIOD,A_CLASS,people.student_a1.id),p_actor_id:people.admin_b.id,
  }),"forged actor argument");
 });
 await t.test("unpublish a copy -> French score hidden instantly, then restore",async()=>{
  writeSql("UPDATE public.assessment_submissions SET status='graded',published_at=NULL"+
    " WHERE assessment_id='"+FRENCH_ASSESSMENT+
    "' AND student_id='"+people.student_a1.id+"'");
  const data=good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,
    people.student_a1.id),"unpublished");
  assert.equal(data.averageOn20,null);
  assert.equal(subjects(data).get(FRENCH).averageOn20,null);
  assert.equal(subjects(data).get(MATH).averageOn20,20);
  writeSql("UPDATE public.assessment_submissions SET status='published',published_at=now()"+
    " WHERE assessment_id='"+FRENCH_ASSESSMENT+
    "' AND student_id='"+people.student_a1.id+"'");
  assert.equal(good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,
    people.student_a1.id),"republished").averageOn20,16.67);
 });
 await t.test("revoke school membership in live JWT session -> immediate 403",async()=>{
  writeSql("UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()"+
    " WHERE school_id='"+A+"' AND user_id='"+people.admin_a.id+"'");
  denied(await preview(people.admin_a,A,A_PERIOD,A_CLASS,people.student_a1.id),
   "admin revoked");
  writeSql("UPDATE public.schoolnet_school_memberships SET status='active',revoked_at=NULL"+
    " WHERE school_id='"+A+"' AND user_id='"+people.admin_a.id+"'");
  assert.equal(good(await preview(people.admin_a,A,A_PERIOD,A_CLASS,
    people.student_a1.id),"restored admin").averageOn20,16.67);
 });
 await t.test("private helper remains unexposed, original grades unchanged",async()=>{
  const hidden=await rpc("school_report_card_preview",people.admin_a,
   args(A,A_PERIOD,A_CLASS,people.student_a1.id));
  assert.equal(hidden.status,404);
  const raw=await authRequest("/rest/v1/assessment_submissions?select=score",
   people.admin_a);
  assert.ok([401,403].includes(raw.status)||Array.isArray(raw.data)&&raw.data.length===0);
  const count=psql(["-At","-c","SELECT count(*) FROM public.assessment_submissions;"]);
  assert.equal(Number(count.trim()),11);
 });
});
