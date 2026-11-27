import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// REAL local GoTrue JWT, PostgREST and PostgreSQL. NEVER hosted Supabase.
const API=process.env.API_URL, ANON=process.env.ANON_KEY, SERVICE=process.env.SERVICE_ROLE_KEY;
assert.equal(API,"http://127.0.0.1:55421","S4-D.3k refuses any non-local Supabase API");
assert.ok(ANON&&SERVICE,"Missing strictly local disposable Auth keys");
const A="00000000-0000-4000-8000-000000000010";
const B="00000000-0000-4000-8000-000000000011";
const AC="00000000-0000-4000-8000-000000000030";
const BC="00000000-0000-4000-8000-000000000031";
const AP="00000000-0000-4000-8000-000000000040";
const BP="00000000-0000-4000-8000-000000000041";
const FR_ASSESSMENT="00000000-0000-4000-8000-0000000000b1";
const MATH="00000000-0000-4000-8000-000000000050";
const FRENCH="00000000-0000-4000-8000-000000000051";
const accounts=[
 "admin_a","admin_b","teacher_a","teacher_b","parent_a",
 "student_a1","student_a2","student_a3","student_b1","student_transfer",
 "approver_a",
];
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function req(path,user,body){
  const token=user==="anon"?ANON:user==="service"?SERVICE:user.jwt;
  const r=await fetch(API+path,{
    method:body===undefined?"GET":"POST",
    headers:{
      apikey:user==="service"?SERVICE:ANON,
      Authorization:"Bearer "+token,
      "Content-Type":"application/json",
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(25000),
  });
  const raw=await r.text();let data=null;
  try{data=raw?JSON.parse(raw):null}catch{ /* no token logs */ }
  return {status:r.status,data};
}
const rpc=(name,user,body)=>req("/rest/v1/rpc/"+name,user,body);
const assertOK=(response,label)=>{
 assert.ok(response.status>=200&&response.status<300,
  label+" unexpected HTTP "+response.status+" code="+(response.data?.code||"unknown"));
 return response.data;
};
const assertDENIED=(response,label)=>{
 assert.ok([400,401,403,404,409].includes(response.status),
  label+": expected 4xx, got "+response.status);
};
const db=(args)=>execFileSync("psql",[
 "-X","-h","127.0.0.1","-p","55422","-U","postgres","-d","postgres",
 "-v","ON_ERROR_STOP=1",...args,
],{encoding:"utf8",env:{...process.env,PGPASSWORD:"postgres"},
  timeout:30000,stdio:["ignore","pipe","pipe"]});
const scalar=sql=>db(["-At","-c",sql]).trim();
const cmd=sql=>db(["-c",sql]);
const open=(who,school,period,cls,student,key)=>
  rpc("schoolnet_bulletin_v2_prototype_open_case",who,{
    p_school_id:school,p_period_id:period,p_class_id:cls,
    p_student_id:student,p_idempotency_key:key,
  });
const transition=(who,id,action,version,key,reason=null)=>
  rpc("schoolnet_bulletin_v2_prototype_transition",who,{
    p_case_id:id,p_action:action,p_expected_version:version,
    p_idempotency_key:key,p_reason:reason,
  });
const catalog=(who,school,period,cls,action,subjects)=>
  rpc("schoolnet_school_official_curriculum",who,{
    p_school_id:school,p_period_id:period,p_class_id:cls,p_action:action,
    ...(subjects===undefined?{}:{p_subject_ids:subjects}),
  });
const count=table=>Number(scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_"+table+";"));
const key=()=>randomUUID();
const people={};
let aCase=null,bCase=null,zeroCase=null;

test("S4-D.3k: REAL disposable Supabase Auth, RPC, PostgreSQL and RLS lifecycle",async t=>{
 await t.test("11 real LOCAL GoTrue identities and password JWT logins",async()=>{
  for(const name of accounts){
   const email="s4d3k-"+name+"-"+randomUUID()+"@example.test";
   const password=randomBytes(24).toString("hex");
   const created=assertOK(await req("/auth/v1/admin/users","service",{
     email,password,email_confirm:true,
   }),"local admin create");
   assert.match(created.id,uid);
   const logged=assertOK(await req("/auth/v1/token?grant_type=password","anon",{
     email,password,
   }),"local auth login");
   assert.equal(logged.user?.id,created.id);
   assert.ok(logged.access_token);
   people[name]={id:created.id,jwt:logged.access_token};
  }
  assert.equal(new Set(Object.values(people).map(v=>v.id)).size,11);
 });
 await t.test("reuse existing fake V2 SCHOOLNET school schema/seed, plus two-person school-A mandates",async()=>{
  const args=accounts.filter(n=>n!=="approver_a").flatMap(n=>["-v",n+"="+people[n].id]);
  assert.match(db([...args,"-f","fixtures/official-averages-auth-seed.sql"]),
    /C3C352_REAL_AUTH_FIXTURE_READY/);
  for(const [who,school,period,cls,subjects] of [
    [people.admin_a,A,AP,AC,[MATH,FRENCH]],
    [people.admin_b,B,BP,BC,[MATH]],
  ]){
    assertOK(await catalog(who,school,period,cls,"set",subjects),"set curriculum");
    const approved=assertOK(await catalog(who,school,period,cls,"approve"),"approve curriculum");
    assert.equal(approved.status,"approved");
  }
  assert.match(db(["-v","admin_a="+people.admin_a.id,
    "-v","admin_b="+people.admin_b.id,
    "-v","approver_a="+people.approver_a.id,
    "-f","../s4d3k/disposable-seed.sql"]),/S4D3K_DISPOSABLE_MANDATES_READY/);
  assert.equal(count("grants"),4);
  assert.equal(count("policy_versions"),2);
 });
 await t.test("RLS and grants prevent client reads, private table exposure and anonymous function calls",async()=>{
  const flags=scalar("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace"+
   " WHERE n.nspname='schoolnet_private' AND c.relname LIKE 'school_bulletin_v2_%'"+
   " AND c.relkind='r' AND c.relrowsecurity");
  assert.equal(Number(flags),6);
  const exposed=await req("/rest/v1/school_bulletin_v2_cases?select=*",people.admin_a);
  assert.ok([401,403,404].includes(exposed.status));
  assertDENIED(await open("anon",A,AP,AC,people.student_a1.id,key()),"anon open");
  assertDENIED(await open(people.teacher_a,A,AP,AC,people.student_a1.id,key()),"teacher open");
  assertDENIED(await open(people.parent_a,A,AP,AC,people.student_a1.id,key()),"parent open");
 });
 await t.test("cross-school and student/class IDOR fail for real JWTs",async()=>{
  assertDENIED(await open(people.admin_a,B,BP,BC,people.student_b1.id,key()),"A to B");
  assertDENIED(await open(people.admin_b,A,AP,AC,people.student_a1.id,key()),"B to A");
  assertDENIED(await open(people.admin_a,A,AP,AC,people.student_b1.id,key()),"foreign student");
  assertDENIED(await open(people.approver_a,A,AP,AC,people.student_a1.id,key()),"approver lacks submit");
 });
 await t.test("incomplete grade and ambiguous transferred student cannot create cases",async()=>{
  assertDENIED(await open(people.admin_a,A,AP,AC,people.student_a2.id,key()),"missing French");
  assertDENIED(await open(people.admin_a,A,AP,AC,people.student_transfer.id,key()),"transfer");
  assert.equal(count("cases"),0);
 });
 await t.test("open a real SQL case from the already authorized V2 grade kernel",async()=>{
  const openKey=key();
  aCase=assertOK(await open(people.admin_a,A,AP,AC,people.student_a1.id,openKey),"open A1");
  assert.match(aCase.caseId,uid);assert.equal(aCase.state,"draft");
  assert.equal(aCase.version,1);assert.equal(aCase.replayed,false);
  const replay=assertOK(await open(people.admin_a,A,AP,AC,people.student_a1.id,openKey),"open retry");
  assert.equal(replay.caseId,aCase.caseId);assert.equal(replay.replayed,true);
  assertDENIED(await open(people.admin_a,A,AP,AC,people.student_a1.id,key()),"duplicate other key");
  assert.equal(count("snapshots"),1);assert.equal(count("cases"),1);assert.equal(count("events"),1);
  assert.equal(scalar("SELECT (source_projection->>'averageOn20')"+
    " FROM schoolnet_private.school_bulletin_v2_snapshots LIMIT 1"),"16.67");
  assert.equal(Number(scalar("SELECT min(length(source_digest)) FROM"+
    " schoolnet_private.school_bulletin_v2_snapshots")),64);
 });
 await t.test("cannot forge an actor, skip a state or approve own request",async()=>{
  assertDENIED(await rpc("schoolnet_bulletin_v2_prototype_transition",people.admin_a,{
    p_case_id:aCase.caseId,p_action:"review_submitted",p_expected_version:1,
    p_idempotency_key:key(),p_actor_id:people.approver_a.id,
  }),"actor injection");
  assertDENIED(await transition(people.approver_a,aCase.caseId,"approval_granted",1,key()),"approve before submit");
  const sent=assertOK(await transition(people.admin_a,aCase.caseId,"review_submitted",1,key()),"submit A1");
  assert.equal(sent.state,"submitted");assert.equal(sent.version,2);
  assertDENIED(await transition(people.admin_a,aCase.caseId,"approval_granted",2,key()),"self approve");
 });
 await t.test("published grade changed after snapshot blocks approval until restored",async()=>{
  cmd("UPDATE public.assessment_submissions SET score=7 WHERE assessment_id='"+
     FR_ASSESSMENT+"' AND student_id='"+people.student_a1.id+"'");
  assertDENIED(await transition(people.approver_a,aCase.caseId,"approval_granted",2,key()),"source drift");
  cmd("UPDATE public.assessment_submissions SET score=5 WHERE assessment_id='"+
     FR_ASSESSMENT+"' AND student_id='"+people.student_a1.id+"'");
  assert.equal(Number(scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_events"+
    " WHERE case_id='"+aCase.caseId+"'")),2);
 });
 await t.test("revoked active-school affiliation and mandate deny the decision immediately",async()=>{
  cmd("UPDATE public.schoolnet_school_memberships SET status='revoked'"+
    " WHERE school_id='"+A+"' AND user_id='"+people.approver_a.id+"'");
  assertDENIED(await transition(people.approver_a,aCase.caseId,"approval_granted",2,key()),"revoked membership");
  cmd("UPDATE public.schoolnet_school_memberships SET status='active'"+
    " WHERE school_id='"+A+"' AND user_id='"+people.approver_a.id+"'");
  cmd("UPDATE schoolnet_private.school_bulletin_v2_grants SET revoked_at=now()"+
    " WHERE school_id='"+A+"' AND user_id='"+people.approver_a.id+"'"+
    " AND capability='decide'");
  assertDENIED(await transition(people.approver_a,aCase.caseId,"approval_granted",2,key()),"revoked mandate");
  cmd("UPDATE schoolnet_private.school_bulletin_v2_grants SET revoked_at=NULL"+
    " WHERE school_id='"+A+"' AND user_id='"+people.approver_a.id+"'"+
    " AND capability='decide'");
 });
 await t.test("distinct school-A decision maker APPROVES via real transactional RPC + append-only event",async()=>{
  const decisionKey=key();
  const approved=assertOK(await transition(people.approver_a,aCase.caseId,
    "approval_granted",2,decisionKey),"approve A1");
  assert.equal(approved.state,"approved");assert.equal(approved.version,3);
  const replay=assertOK(await transition(people.approver_a,aCase.caseId,
    "approval_granted",2,decisionKey),"decision idempotent replay");
  assert.equal(replay.replayed,true);assert.equal(replay.version,3);
  assertDENIED(await transition(people.approver_a,aCase.caseId,
    "approval_granted",2,key()),"stale version");
  const countA=scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_events"+
    " WHERE case_id='"+aCase.caseId+"'");
  assert.equal(countA,"3");
 });
 await t.test("approval does not publish: only separately granted publication authorization advances",async()=>{
  assertDENIED(await transition(people.admin_a,aCase.caseId,
    "publication_authorized",3,key()),"requester no publish grant");
  const done=assertOK(await transition(people.approver_a,aCase.caseId,
    "publication_authorized",3,key()),"publish authorization");
  assert.equal(done.state,"authorized_for_publication");assert.equal(done.version,4);
  assertDENIED(await transition(people.approver_a,aCase.caseId,
    "publication_executed",4,key()),"no PDF or storage implementation");
  assert.equal(count("publications"),0);
  assert.equal(scalar("SELECT state FROM schoolnet_private.school_bulletin_v2_cases"+
    " WHERE id='"+aCase.caseId+"'"),"authorized_for_publication");
 });
 await t.test("published zero is a legitimate separate snapshot; motivated refusal persists",async()=>{
  zeroCase=assertOK(await open(people.admin_a,A,AP,AC,people.student_a3.id,key()),"zero open");
  assert.equal(zeroCase.state,"draft");
  const zeroAvg=scalar("SELECT source_projection->>'averageOn20'"+
    " FROM schoolnet_private.school_bulletin_v2_snapshots"+
    " WHERE id=(SELECT snapshot_id FROM schoolnet_private.school_bulletin_v2_cases"+
    " WHERE id='"+zeroCase.caseId+"')");
  assert.equal(zeroAvg,"0");
  assertOK(await transition(people.admin_a,zeroCase.caseId,"review_submitted",1,key()),"zero submit");
  assertDENIED(await transition(people.approver_a,zeroCase.caseId,
    "approval_refused",2,key(),""),"refusal reason required");
  const result=assertOK(await transition(people.approver_a,zeroCase.caseId,
    "approval_refused",2,key(),"Refus fictif pour contrôle"),"motivated refusal");
  assert.equal(result.state,"refused");
  assert.equal(scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_events"+
    " WHERE case_id='"+zeroCase.caseId+"'"),"3");
 });
 await t.test("two parallel real HTTP submissions to school B cannot both commit",async()=>{
  bCase=assertOK(await open(people.admin_b,B,BP,BC,people.student_b1.id,key()),"B case");
  const responses=await Promise.all([
    transition(people.admin_b,bCase.caseId,"review_submitted",1,key()),
    transition(people.admin_b,bCase.caseId,"review_submitted",1,key()),
  ]);
  assert.equal(responses.filter(r=>r.status>=200&&r.status<300).length,1);
  assert.equal(responses.filter(r=>r.status>=400).length,1);
  assert.equal(scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_events"+
   " WHERE case_id='"+bCase.caseId+"'"),"2");
  assertDENIED(await transition(people.approver_a,bCase.caseId,
    "approval_granted",2,key()),"A approver cannot decide for B");
 });
 await t.test("immutability triggers deny changes to snapshots and signed event history",async()=>{
  assert.throws(()=>cmd("DELETE FROM schoolnet_private.school_bulletin_v2_events"+
    " WHERE case_id='"+aCase.caseId+"'"),/S4D3K_IMMUTABLE/);
  assert.throws(()=>cmd("UPDATE schoolnet_private.school_bulletin_v2_snapshots"+
    " SET source_digest=repeat('a',64) WHERE id="+
    "(SELECT snapshot_id FROM schoolnet_private.school_bulletin_v2_cases"+
    " WHERE id='"+aCase.caseId+"')"),/S4D3K_IMMUTABLE/);
 });
 await t.test("final SQL evidence: active authorization is NOT a publication",async()=>{
  assert.equal(count("cases"),3);
  assert.equal(count("snapshots"),3);
  assert.equal(count("events"),9);
  assert.equal(count("publications"),0);
  assert.equal(scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_cases"+
    " WHERE state='published'"),"0");
  assert.equal(scalar("SELECT count(*) FROM schoolnet_private.school_bulletin_v2_cases"+
    " WHERE state='authorized_for_publication'"),"1");
  const check=scalar("SELECT count(*) FROM information_schema.role_table_grants"+
    " WHERE grantee IN ('anon','authenticated')"+
    " AND table_schema='schoolnet_private'"+
    " AND table_name LIKE 'school_bulletin_v2_%'");
  assert.equal(check,"0");
 });
});
