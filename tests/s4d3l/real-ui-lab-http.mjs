import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";

const credentials=JSON.parse(readFileSync(new URL("./.lab-credentials.local",import.meta.url),"utf8"));
const envText=readFileSync(new URL("../../.env.s4d3l.local",import.meta.url),"utf8");
const ANON=envText.match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m)?.[1];
const API=envText.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1];
assert.equal(API,"http://127.0.0.1:55421");
assert.ok(ANON);
const SCHOOL_A="00000000-0000-4000-8000-000000000010";
const SCHOOL_B="00000000-0000-4000-8000-000000000011";
const CLASS_A="00000000-0000-4000-8000-000000000030";
const CLASS_B="00000000-0000-4000-8000-000000000031";
const PERIOD_A="00000000-0000-4000-8000-000000000040";
const PERIOD_B="00000000-0000-4000-8000-000000000041";
const YEAR="00000000-0000-4000-8000-000000000020";

async function http(path,token,body){
 const r=await fetch(API+path,{
   method:body===undefined?"GET":"POST",
   headers:{"apikey":ANON,Authorization:"Bearer "+token,
     "Content-Type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   signal:AbortSignal.timeout(20_000),
 });
 const content=await r.json().catch(()=>null);
 return {status:r.status,data:content};
}
const rpc=(user,name,body)=>http("/rest/v1/rpc/"+name,user,body);
async function login({email,password}){
 const r=await http("/auth/v1/token?grant_type=password",ANON,{email,password});
 assert.equal(r.status,200,"Local login failed");
 assert.ok(r.data?.access_token);
 assert.ok(r.data?.user?.id);
 return {id:r.data.user.id,jwt:r.data.access_token};
}
function ok(r){
 assert.ok(r.status>=200&&r.status<300,
  "Expected 2xx HTTP, got "+r.status+" code="+String(r.data?.code??""));
 return r.data;
}
function denied(r){
 assert.ok([400,401,403,404,409].includes(r.status),
  "Expected local server 4xx denial, got "+r.status);
}
const caseFor=(jwt,school,cls,period,student)=>
 rpc(jwt,"schoolnet_bulletin_v2_prototype_case_for_student",{
  p_school_id:school,p_class_id:cls,p_period_id:period,p_student_id:student,
 });
const averages=(jwt,school,cls,period)=>
 rpc(jwt,"schoolnet_school_official_general_averages",{
  p_school_id:school,p_period_id:period,p_class_id:cls,
 });
const open=(jwt,school,cls,period,student)=>
 rpc(jwt,"schoolnet_bulletin_v2_prototype_open_case",{
  p_school_id:school,p_period_id:period,p_class_id:cls,
  p_student_id:student,p_idempotency_key:randomUUID(),
 });
const change=(jwt,caseId,state,version,reason=null)=>
 rpc(jwt,"schoolnet_bulletin_v2_prototype_transition",{
  p_case_id:caseId,p_action:state,p_expected_version:version,
  p_idempotency_key:randomUUID(),p_reason:reason,
 });
function db(query){
 const project="supabase_db_schoolnet_s4c3c35_full_auth_http_ci";
 const r=spawnSync("docker",["exec","-i",project,"psql","-At","-X",
  "-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-c",query],{
   encoding:"utf8",timeout:20_000,
 });
 if(r.status!==0)throw Error("Isolated docker SQL query unavailable");
 return r.stdout.trim();
}

test("S4-D.3l: UI lab uses real AUTH profiles, dossier and persisted audit",async t=>{
 const requester=await login(credentials.requester);
 const decider=await login(credentials.decisionMaker);
 let studentA1,studentA2,studentA3,caseId;
 await t.test("localhost school_admin can SELECT only their own profile through RLS",async()=>{
  const profile=ok(await http("/rest/v1/profiles?select=id,role,full_name",requester.jwt));
  assert.equal(profile.length,1);
  assert.equal(profile[0].id,requester.id);
  assert.equal(profile[0].role,"school_admin");
  const forbidden=ok(await http(
    "/rest/v1/profiles?select=id&"+new URLSearchParams({id:"eq."+decider.id}),
    requester.jwt));
  assert.deepEqual(forbidden,[]);
 });
 await t.test("real authorized V2 roster includes complete, incomplete and valid zero",async()=>{
  const general=ok(await averages(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A));
  assert.equal(general.schoolId,SCHOOL_A);
  assert.equal(general.schoolYearId,YEAR);
  studentA1=general.students.find(x=>x.studentName.includes("A1"));
  studentA2=general.students.find(x=>x.studentName.includes("A2"));
  studentA3=general.students.find(x=>x.studentName.includes("A3"));
  assert.ok(studentA1&&studentA2&&studentA3);
  assert.equal(studentA1.state,"ready");
  assert.equal(studentA2.state,"incomplete");
  assert.equal(studentA3.state,"ready");
  assert.equal(Number(studentA3.averageOn20),0);
 });
 await t.test("case lookup before opening returns null and true capability only",async()=>{
  const requesterRead=ok(await caseFor(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(requesterRead.case,null);
  assert.deepEqual(requesterRead.capabilities,["submit"]);
  const approverRead=ok(await caseFor(decider.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(approverRead.case,null);
  assert.deepEqual(approverRead.capabilities,["authorize_publication","decide"]);
 });
 await t.test("RPC lookup rejects anonymous access and foreign school despite a valid JWT",async()=>{
  denied(await caseFor(ANON,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  denied(await caseFor(requester.jwt,SCHOOL_B,CLASS_B,PERIOD_B,studentA1.studentId));
  denied(await caseFor(decider.jwt,SCHOOL_B,CLASS_B,PERIOD_B,studentA1.studentId));
 });
 await t.test("incomplete student cannot start a dossier through the functional API",async()=>{
  denied(await open(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA2.studentId));
  const r=ok(await caseFor(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA2.studentId));
  assert.equal(r.case,null);
 });
 await t.test("requester opens a real dossier, and PostgreSQL returns its stored audit event",async()=>{
  const initial=ok(await open(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(initial.state,"draft");
  caseId=initial.caseId;
  const read=ok(await caseFor(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(read.case.caseId,caseId);
  assert.equal(read.case.state,"draft");
  assert.equal(read.case.audit.length,1);
  assert.equal(read.case.audit[0].action,"case_opened");
  assert.equal(read.case.audit[0].actorId,requester.id);
  assert.equal(read.case.version,1);
  assert.equal(JSON.stringify(read).includes("source_projection"),false);
  assert.equal(JSON.stringify(read).includes("averageOn20"),false);
 });
 await t.test("requester SUBMITS with a persistent server state and event",async()=>{
  const result=ok(await change(requester.jwt,caseId,"review_submitted",1));
  assert.equal(result.state,"submitted");
  const read=ok(await caseFor(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(read.case.state,"submitted");
  assert.equal(read.case.version,2);
  assert.equal(read.case.requesterId,requester.id);
  assert.deepEqual(read.case.audit.map(x=>x.action),["case_opened","review_submitted"]);
 });
 await t.test("requester cannot self approve, decider sees the same dossier through another JWT",async()=>{
  denied(await change(requester.jwt,caseId,"approval_granted",2));
  const read=ok(await caseFor(decider.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(read.case.state,"submitted");
  assert.equal(read.case.version,2);
  assert.equal(read.case.audit.length,2);
 });
 await t.test("distinct decider APPROVES, then separately AUTHORIZES publication",async()=>{
  const approved=ok(await change(decider.jwt,caseId,"approval_granted",2));
  assert.equal(approved.state,"approved");
  let read=ok(await caseFor(decider.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(read.case.audit.length,3);
  assert.equal(read.case.approverId,decider.id);
  const authorized=ok(await change(decider.jwt,caseId,"publication_authorized",3));
  assert.equal(authorized.state,"authorized_for_publication");
  read=ok(await caseFor(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(read.case.version,4);
  assert.equal(read.case.publicationAuthorizerId,decider.id);
  assert.deepEqual(read.case.audit.map(x=>x.action),[
   "case_opened","review_submitted","approval_granted","publication_authorized",
  ]);
  denied(await change(decider.jwt,caseId,"publication_executed",4));
 });
 await t.test("zero grade student may have a dossier, without publication",async()=>{
  const result=ok(await open(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA3.studentId));
  assert.equal(result.state,"draft");
  const read=ok(await caseFor(decider.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA3.studentId));
  assert.equal(read.case.state,"draft");
 });
 await t.test("revoked school membership prevents reading previously visible audit",async()=>{
  db("UPDATE public.schoolnet_school_memberships SET status='revoked'"+
   " WHERE school_id='"+SCHOOL_A+"' AND user_id='"+decider.id+"'");
  denied(await caseFor(decider.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  const still=ok(await caseFor(requester.jwt,SCHOOL_A,CLASS_A,PERIOD_A,studentA1.studentId));
  assert.equal(still.case.state,"authorized_for_publication");
 });
 await t.test("final SQL: four real events for A1, no published PDF or family access",async()=>{
  assert.equal(db("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_events"+
    " WHERE case_id='"+caseId+"'"),"4");
  assert.equal(db("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_publications"),"0");
  assert.equal(db("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_cases"+
    " WHERE state='published'"),"0");
 });
});
