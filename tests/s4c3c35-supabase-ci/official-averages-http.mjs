import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// HARD NETWORK GUARD: only the disposable local GoTrue/REST runner.
// Secrets originate from local Supabase CLI; never print them.
const API=process.env.API_URL;
const ANON=process.env.ANON_KEY;
const SERVICE=process.env.SERVICE_ROLE_KEY;
assert.equal(API,"http://127.0.0.1:55421","Only ephemeral local Supabase is permitted");
assert.ok(ANON && SERVICE,"Missing local Supabase runner keys");
const SCHOOL_A="00000000-0000-4000-8000-000000000010";
const SCHOOL_B="00000000-0000-4000-8000-000000000011";
const CLASS_A="00000000-0000-4000-8000-000000000030";
const CLASS_B="00000000-0000-4000-8000-000000000031";
const PERIOD_A="00000000-0000-4000-8000-000000000040";
const PERIOD_B="00000000-0000-4000-8000-000000000041";
const MATH="00000000-0000-4000-8000-000000000050";
const FRENCH="00000000-0000-4000-8000-000000000051";
const ASSESSMENT_FRENCH="00000000-0000-4000-8000-0000000000b1";
const keys=[
 "admin_a","admin_b","teacher_a","teacher_b","parent_a",
 "student_a1","student_a2","student_a3","student_b1","student_transfer"
];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function api(path,user,method="GET",body){
 const access=user==="service" ? SERVICE : user==="anon" ? ANON : user.jwt;
 const res=await fetch(API+path,{
  method,
  headers:{
   apikey:user==="service"?SERVICE:ANON,
   Authorization:"Bearer "+access,
   "Content-Type":"application/json"
  },
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  signal:AbortSignal.timeout(20_000)
 });
 const raw=await res.text();
 let json=null;
 try {json=raw?JSON.parse(raw):null;} catch { /* no secret output */ }
 return {status:res.status,json};
}
function success(result,label){
 assert.ok(result.status>=200 && result.status<300,
   label+": HTTP "+result.status+" ("+(result.json?.code??"no-code")+")");
 return result.json;
}
function forbidden(result,label){
 assert.ok([401,403].includes(result.status),
   label+": expected 401/403, got "+result.status+" ("+(result.json?.code??"no-code")+")");
}
async function rpc(name,user,body){
 return api("/rest/v1/rpc/"+name,user,"POST",body);
}
const args=(school,period,cls)=>({p_school_id:school,p_period_id:period,p_class_id:cls});
const catalog=(user,scope,action,subjectIds)=>{
 const body={...scope,p_action:action};
 if(subjectIds!==undefined) body.p_subject_ids=subjectIds;
 return rpc("schoolnet_school_official_curriculum",user,body);
};
const preview=(user,scope)=>rpc("schoolnet_school_official_general_averages",user,scope);
function psql(flags){
 return execFileSync("psql",[
   "-X","-h","127.0.0.1","-p","55422","-U","postgres","-d","postgres",
   "-v","ON_ERROR_STOP=1",...flags
 ],{encoding:"utf8",env:{...process.env,PGPASSWORD:"postgres"},timeout:30_000,
   stdio:["ignore","pipe","pipe"]});
}
function sql(statement){
 assert.ok(!/;\s*\S/.test(statement.trim().replace(/;$/,"")),
   "One trusted SQL fixture statement only");
 psql(["-c",statement]);
}
function roster(result,id){
 return result.students.find(s=>s.studentId===id);
}
function minimalProjection(data){
 assert.equal(data.schoolAdminScoped,true);
 assert.equal(data.previewOnly,true);
 const asText=JSON.stringify(data);
 for(const field of ["score","maxScore","publishedAt","assessmentId","feedback","ranking"]){
   assert.ok(!new RegExp('"'+field+'"',"i").test(asText),
     "Private note/field "+field+" leaked in aggregate preview");
 }
}

test("C3-C.3.5.2: real GoTrue JWT to unchanged school-admin official averages RPC",async t=>{
 const users={};
 await t.test("create and sign in ten fictional local Auth users",async()=>{
  for(const key of keys){
   const email="schoolnet-c352-"+key+"-"+randomUUID()+"@example.test";
   const password=randomBytes(20).toString("hex");
   const created=success(await api("/auth/v1/admin/users","service","POST",{
     email,password,email_confirm:true
   }),"local Auth admin create");
   assert.match(created.id??"",uuid);
   const signed=success(await api("/auth/v1/token?grant_type=password","anon","POST",{
     email,password
   }),"local Auth login");
   assert.equal(signed.user?.id,created.id);
   assert.ok(signed.access_token?.length>30);
   users[key]={id:created.id,jwt:signed.access_token};
  }
  assert.equal(new Set(Object.values(users).map(u=>u.id)).size,10);
 });
 await t.test("seed DB using only real GoTrue user IDs",async()=>{
  const vars=keys.flatMap(k=>["-v",k+"="+users[k].id]);
  for(const key of keys) assert.match(users[key].id,uuid);
  const result=psql([...vars,"-f","fixtures/official-averages-auth-seed.sql"]);
  assert.match(result,/C3C352_REAL_AUTH_FIXTURE_READY/);
 });
 await t.test("anonymous cannot access any official RPC or raw grade table",async()=>{
  const scope=args(SCHOOL_A,PERIOD_A,CLASS_A);
  forbidden(await preview("anon",scope),"anonymous general preview");
  forbidden(await catalog("anon",scope,"read"),"anonymous catalog");
  forbidden(await api("/rest/v1/assessment_submissions?select=*","anon"),
    "anonymous raw submissions");
 });
 await t.test("teacher, parent, and student JWTs never gain admin rights",async()=>{
  const scope=args(SCHOOL_A,PERIOD_A,CLASS_A);
  for(const role of ["teacher_a","teacher_b","parent_a","student_a1","student_b1"]){
   forbidden(await preview(users[role],scope),role+" preview");
   forbidden(await catalog(users[role],scope,"read"),role+" catalog");
  }
  const injection=await rpc("schoolnet_school_official_general_averages",
    users.teacher_a,{...scope,p_teacher_id:users.admin_a.id});
  assert.ok([400,401,403,404].includes(injection.status),
    "Caller-supplied extra identity must never authorize access");
  forbidden(await api("/rest/v1/assessment_submissions?select=*",
    users.student_a1),"student raw submissions");
 });
 await t.test("admins A/B cannot cross schools or mix foreign class/period IDs",async()=>{
  forbidden(await preview(users.admin_a,args(SCHOOL_B,PERIOD_B,CLASS_B)),
    "admin A reading B");
  forbidden(await catalog(users.admin_a,args(SCHOOL_B,PERIOD_B,CLASS_B),"read"),
    "admin A catalog B");
  forbidden(await preview(users.admin_b,args(SCHOOL_A,PERIOD_A,CLASS_A)),
    "admin B reading A");
  forbidden(await preview(users.admin_a,args(SCHOOL_A,PERIOD_A,CLASS_B)),
    "admin A mixing A period and B class");
  forbidden(await preview(users.admin_b,args(SCHOOL_B,PERIOD_A,CLASS_B)),
    "admin B mixing B school and A period");
 });
 const a=args(SCHOOL_A,PERIOD_A,CLASS_A),b=args(SCHOOL_B,PERIOD_B,CLASS_B);
 await t.test("unapproved catalogs reveal no averages",async()=>{
  const blank=success(await preview(users.admin_a,a),"draft school");
  assert.equal(blank.state,"not_configured");
  assert.deepEqual(blank.students,[]);
  const read=success(await catalog(users.admin_a,a,"read"),"read missing catalog");
  assert.equal(read.status,"missing");
  assert.equal((await catalog(users.admin_a,a,"approve")).status,400);
 });
 await t.test("school A approves Maths + French; school B only Maths",async()=>{
  for(const [user,scope,subjects] of [
   [users.admin_a,a,[MATH,FRENCH]],
   [users.admin_b,b,[MATH]]
  ]){
   const draft=success(await catalog(user,scope,"set",subjects),"set curriculum");
   assert.equal(draft.status,"draft");
   assert.equal(draft.subjects.length,subjects.length);
   const hidden=success(await preview(user,scope),"draft hides grades");
   assert.equal(hidden.state,"not_configured");
   const approved=success(await catalog(user,scope,"approve"),"approve curriculum");
   assert.equal(approved.status,"approved");
   assert.equal(approved.subjects.length,subjects.length);
  }
 });
 await t.test("real HTTP average: weighted 16.67, true zero, missing and transfer",async()=>{
  const result=success(await preview(users.admin_a,a),"school A preview");
  minimalProjection(result);
  assert.equal(result.state,"preview");
  assert.equal(result.studentCount,4);
  assert.equal(result.expectedSubjects,2);
  assert.equal(result.students.length,4);
  const one=roster(result,users.student_a1.id);
  assert.equal(one.state,"ready");
  assert.equal(one.averageOn20,16.67);
  assert.equal(one.readySubjects,2);
  const zero=roster(result,users.student_a3.id);
  assert.equal(zero.state,"ready");
  assert.equal(zero.averageOn20,0);
  const incomplete=roster(result,users.student_a2.id);
  assert.equal(incomplete.state,"incomplete");
  assert.equal(incomplete.averageOn20,null);
  const transfer=roster(result,users.student_transfer.id);
  assert.equal(transfer.state,"incomplete");
  assert.equal(transfer.averageOn20,null);
  assert.ok(!result.students.some(s=>s.studentId===users.student_b1.id));
 });
 await t.test("school B sees only its own roster and 17/20 Maths average",async()=>{
  const result=success(await preview(users.admin_b,b),"school B preview");
  minimalProjection(result);
  assert.equal(result.studentCount,2);
  assert.equal(result.expectedSubjects,1);
  assert.equal(roster(result,users.student_b1.id)?.averageOn20,17);
  assert.equal(roster(result,users.student_transfer.id)?.averageOn20,null);
  assert.ok(!result.students.some(s=>s.studentId===users.student_a1.id));
 });
 await t.test("unpublishing a submission hides its score without implicit zero",async()=>{
  sql("UPDATE public.assessment_submissions SET status='graded',published_at=NULL"+
      " WHERE assessment_id='"+ASSESSMENT_FRENCH+"' AND student_id='"+users.student_a1.id+"'");
  const hidden=success(await preview(users.admin_a,a),"unpublished preview");
  assert.equal(roster(hidden,users.student_a1.id)?.averageOn20,null);
  assert.equal(roster(hidden,users.student_a1.id)?.state,"incomplete");
  sql("UPDATE public.assessment_submissions SET status='published',published_at=now()"+
      " WHERE assessment_id='"+ASSESSMENT_FRENCH+"' AND student_id='"+users.student_a1.id+"'");
  const restored=success(await preview(users.admin_a,a),"republished preview");
  assert.equal(roster(restored,users.student_a1.id)?.averageOn20,16.67);
 });
 await t.test("teacher membership revocation immediately removes eligible evaluations",async()=>{
  sql("UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()"+
      " WHERE school_id='"+SCHOOL_A+"' AND user_id='"+users.teacher_a.id+"'");
  const revoked=success(await preview(users.admin_a,a),"teacher revoked");
  assert.equal(revoked.studentCount,4);
  assert.equal(roster(revoked,users.student_a1.id)?.averageOn20,null);
  assert.equal(roster(revoked,users.student_a1.id)?.state,"not_configured");
  sql("UPDATE public.schoolnet_school_memberships SET status='active',revoked_at=NULL"+
      " WHERE school_id='"+SCHOOL_A+"' AND user_id='"+users.teacher_a.id+"'");
  const restored=success(await preview(users.admin_a,a),"teacher restored");
  assert.equal(roster(restored,users.student_a1.id)?.averageOn20,16.67);
 });
 await t.test("locked period blocks configuration but not authorized previews",async()=>{
  sql("UPDATE schoolnet_private.school_grading_periods SET is_locked=true"+
      " WHERE id='"+PERIOD_A+"'");
  forbidden(await catalog(users.admin_a,a,"set",[MATH,FRENCH]),"locked edit");
  const read=success(await catalog(users.admin_a,a,"read"),"locked read");
  assert.equal(read.status,"approved");
  const res=success(await preview(users.admin_a,a),"locked preview");
  assert.equal(roster(res,users.student_a1.id)?.averageOn20,16.67);
  sql("UPDATE schoolnet_private.school_grading_periods SET is_locked=false"+
      " WHERE id='"+PERIOD_A+"'");
 });
 await t.test("previously valid admin B token is rejected after membership revocation",async()=>{
  sql("UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()"+
      " WHERE school_id='"+SCHOOL_B+"' AND user_id='"+users.admin_b.id+"'");
  forbidden(await preview(users.admin_b,b),"revoked B admin preview");
  forbidden(await catalog(users.admin_b,b,"read"),"revoked B admin catalog");
  const aStill=success(await preview(users.admin_a,a),"unaffected admin A");
  assert.equal(roster(aStill,users.student_a1.id)?.averageOn20,16.67);
 });
 await t.test("no raw data access, private helper exposure, or original grade mutation",async()=>{
  for(const path of [
   "/rest/v1/assessment_submissions?select=score",
   "/rest/v1/profiles?select=*",
   "/rest/v1/schoolnet_school_memberships?select=*"
  ]) forbidden(await api(path,users.admin_a),"direct read blocked");
  const hidden=await api("/rest/v1/rpc/school_official_general_averages",
     users.admin_a,"POST",a);
  assert.equal(hidden.status,404,"private schema must remain unexposed");
  const count=psql(["-At","-c","SELECT count(*) FROM public.assessment_submissions;"]);
  assert.equal(Number(count.trim()),11,"Fixture grades must remain unchanged");
 });
});
