// SCHOOLNET Lot 5D-M: ACTUAL Edge Runtime HTTP via disposable Supabase CLI.
// This is NOT a mock. It uses real local GoTrue, PostgREST and PostgreSQL,
// with synthetic students/parents ONLY. No hosted Supabase account/secret.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";

const url=process.env.SCHOOLNET_K_LOCAL_URL??"";
const dbUrl=process.env.SCHOOLNET_K_LOCAL_DB_URL??"";
const anon=process.env.SCHOOLNET_K_LOCAL_ANON_KEY??"";
const secret=process.env.SCHOOLNET_K_LOCAL_SERVICE_KEY??"";
let a,d;
try {a=new URL(url);d=new URL(dbUrl);}
catch {throw Error("5D-M: missing disposable local Supabase stack");}
if(a.protocol!=="http:"||a.hostname!=="127.0.0.1"||a.port!=="54321"||
  a.pathname!=="/" || !anon || !secret ||
  (d.protocol!=="postgresql:" && d.protocol!=="postgres:")||
  d.hostname!=="127.0.0.1"||d.port!=="54322"||d.pathname!=="/postgres")
  throw Error("5D-M: refused a non-local API or database");
for(const name of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL",
 "SUPABASE_PROJECT_ID","VITE_SUPABASE_URL"]){
 if(process.env[name])throw Error("5D-M: hosted Supabase environment is forbidden");
}
const ORIGIN="http://127.0.0.1:54321";
const endpoint=url.replace(/\/$/,"")+"/functions/v1/schoolnet-parent-current-class";
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const service=createClient(url,secret,opts);
const client=()=>createClient(url,anon,opts);
const pwd="schoolnet-m-fixture-only!2026";
const uu=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const users={},emails={},clients={},sessions={},school={},classes={};
function unwrap(r,label){if(r.error)throw Error(label+": "+r.error.message);return r.data;}
function sql(q) {
 return execFileSync("psql",[dbUrl,"-X","-q","-t","-A","-v",
  "ON_ERROR_STOP=1","-c",q],{encoding:"utf8",timeout:15000,
  env:{...process.env,PGCONNECT_TIMEOUT:"5"}}).trim();
}
function count(id){
 assert.match(id,uu);
 return Number(sql("SELECT COALESCE((SELECT request_count FROM "+
  "schoolnet_private.parent_read_rate_windows WHERE actor_id='"+
  id+"'::uuid),0)"));
}
async function call({method="POST",origin=ORIGIN,bearer=null,
 body={action:"list_current_classes"},contentType="application/json"}={}) {
 const headers={apikey:anon,origin};
 if(bearer!==null)headers.authorization="Bearer "+bearer;
 if(contentType)headers["content-type"]=contentType;
 const requestBody=method==="POST" ? (typeof body==="string"?body:JSON.stringify(body)) : undefined;
 const response=await fetch(endpoint,{method,headers,body:requestBody,
   redirect:"error",signal:AbortSignal.timeout(20000)});
 const text=await response.text();
 let json=null;
 try{json=JSON.parse(text);}catch{}
 return {status:response.status,headers:response.headers,text,json};
}
async function create(name,role,tag){
 emails[name]="lot5dm-"+name.toLowerCase()+"-"+tag+"@example.test";
 const user=unwrap(await service.auth.admin.createUser({
   email:emails[name],password:pwd,email_confirm:true,
 }),"create fictive local Auth user").user;
 assert.match(user.id,uu);
 users[name]=user.id;
 return {id:user.id,role,full_name:name+" fictif"};
}
async function login(name){
 const c=client();
 const data=unwrap(await c.auth.signInWithPassword({
  email:emails[name],password:pwd,
 }),"local sign-in "+name);
 assert.equal(data.user.id,users[name]);
 clients[name]=c;sessions[name]=data.session;
 return data.session.access_token;
}
test("5D-M - actual LOCAL Edge HTTP end-to-end",async t=>{
 await t.test("M01 - OPTIONS reaches real Edge with local Origin and cache prevention",async()=>{
  const r=await call({method:"OPTIONS"});
  assert.equal(r.status,200,"Edge must accept local fixture CORS");
  assert.equal(r.json?.ok,true);
  assert.equal(r.headers.get("cache-control"),"no-store, max-age=0");
  assert.equal(r.headers.get("access-control-allow-origin"),ORIGIN);
 });
 await t.test("M02 - invalid Origin refused by actual Edge runtime",async()=>{
  const r=await call({method:"OPTIONS",origin:"https://attacker.invalid"});
  assert.equal(r.status,403);
  assert.equal(r.json?.children,undefined);
 });
 await t.test("M03 - create ONLY five synthetic Auth users and annual school records",async()=>{
  const tag=randomUUID().slice(0,8);
  const data=[];
  for(const [name,role] of [["parentA","parent"],["parentB","parent"],
    ["studentA","student"],["studentB","student"],["admin","admin"]]){
    data.push(await create(name,role,tag));
  }
  unwrap(await service.from("profiles").insert(data),"seed synthetic profiles");
  unwrap(await service.from("parent_links").insert([
    {parent_id:users.parentA,student_id:users.studentA},
    {parent_id:users.parentB,student_id:users.studentB},
  ]),"seed verified family links");
  school.old=unwrap(await service.from("school_years")
    .insert({name:"2025-2026",is_current:false})
    .select("id").single(),"old synthetic year").id;
  school.current=unwrap(await service.from("school_years")
    .insert({name:"2026-2027",is_current:true})
    .select("id").single(),"current synthetic year").id;
  const rows=unwrap(await service.from("classes").insert([
    {name:"6e A",school_year_id:school.old},
    {name:"5e B",school_year_id:school.current},
    {name:"4e C",school_year_id:school.current},
  ]).select("id,name"),"seed school classes");
  for(const x of rows)classes[x.name]=x.id;
  unwrap(await service.from("student_enrollments").insert([
    {student_id:users.studentA,school_year_id:school.old,
      class_id:classes["6e A"],status:"completed"},
    {student_id:users.studentA,school_year_id:school.current,
      class_id:classes["5e B"],status:"active"},
    {student_id:users.studentB,school_year_id:school.current,
      class_id:classes["4e C"],status:"active"},
  ]),"seed annual enrollments");
  assert.equal(sql("SELECT count(*) FROM public.student_enrollments"),"3");
 });
 await t.test("M04 - real GoTrue sign-in returns independent valid Parent JWTs",async()=>{
  for(const name of ["parentA","parentB","studentA","admin"]){
    const token=await login(name);
    assert.ok(token.length>50);
  }
  assert.notEqual(sessions.parentA.access_token,sessions.parentB.access_token);
 });
 await t.test("M05 - original JWTs match fresh Auth server users",async()=>{
  for(const name of ["parentA","parentB","studentA","admin"]){
    const r=await service.auth.getUser(sessions[name].access_token);
    assert.ifError(r.error);assert.equal(r.data.user.id,users[name]);
  }
 });
 await t.test("M06 - GET blocked by Edge (405)",async()=>{
  assert.equal((await call({method:"GET",bearer:sessions.parentA.access_token})).status,405);
 });
 await t.test("M07 - Bearer missing reaches Edge and fails 401",async()=>{
  assert.equal((await call()).status,401);
 });
 await t.test("M08 - malformed JSON is rejected 400 without reading children",async()=>{
  const r=await call({bearer:sessions.parentA.access_token,body:"{"});
  assert.equal(r.status,400);assert.equal(r.json?.children,undefined);
 });
 await t.test("M09 - unknown action cannot invoke annual reader",async()=>{
  const r=await call({bearer:sessions.parentA.access_token,body:{action:"list_all"}});
  assert.equal(r.status,400);
 });
 await t.test("M10 - browser-supplied parent/child IDs rejected",async()=>{
  for(const key of ["parent_id","student_id","role"]){
   const r=await call({bearer:sessions.parentA.access_token,
    body:{action:"list_current_classes",[key]:users.parentB}});
   assert.equal(r.status,400);
  }
 });
 await t.test("M11 - overly large body rejected 413",async()=>{
  const r=await call({bearer:sessions.parentA.access_token,
    body:{action:"list_current_classes",data:"x".repeat(400)}});
  assert.equal(r.status,413);
 });
 await t.test("M12 - content-type validation rejects plain text 405",async()=>{
  const r=await call({bearer:sessions.parentA.access_token,
    contentType:"text/plain",body:"list_current_classes"});
  assert.equal(r.status,405);
 });
 await t.test("M13 - Parent A sees ONLY child A current class, not older one",async()=>{
  const r=await call({bearer:sessions.parentA.access_token});
  assert.equal(r.status,200,"first actual HTTP parent read");
  assert.equal(r.json?.ok,true);
  assert.equal(r.json?.school_year_id,school.current);
  assert.deepEqual(r.json?.children,[{
    student_id:users.studentA,state:"current",class_name:"5e B",
  }]);
  assert.equal(r.headers.get("cache-control"),"no-store, max-age=0");
  assert.equal(JSON.stringify(r.json).includes("6e A"),false);
  assert.equal(JSON.stringify(r.json).includes(users.studentB),false);
  assert.equal(Object.hasOwn(r.json,"email"),false);
 });
 await t.test("M14 - Parent B sees ONLY child B, never Parent A's data",async()=>{
  const r=await call({bearer:sessions.parentB.access_token});
  assert.equal(r.status,200);
  assert.deepEqual(r.json?.children,[{
    student_id:users.studentB,state:"current",class_name:"4e C",
  }]);
  assert.equal(JSON.stringify(r.json).includes(users.studentA),false);
 });
 await t.test("M15 - signed-in Admin is NOT allowed to use Parent read",async()=>{
  const r=await call({bearer:sessions.admin.access_token});
  assert.equal(r.status,403);
  assert.equal(r.json?.children,undefined);
 });
 await t.test("M16 - signed-in Student is NOT allowed to use Parent read",async()=>{
  const r=await call({bearer:sessions.studentA.access_token});
  assert.equal(r.status,403);
  assert.equal(r.json?.children,undefined);
 });
 await t.test("M17 - browser cannot invoke private RPC or read enrollment rows",async()=>{
  const p=await clients.parentA.rpc("schoolnet_parent_read_gate",{
    p_actor_id:users.parentA,p_session_id:randomUUID(),
  });
  assert.ok(p.error);
  const s=await clients.parentA.from("student_enrollments")
    .select("student_id").limit(1);
  assert.ok(s.error);
 });
 await t.test("M18 - forged access token fails 401 (no SQL data exposed)",async()=>{
  const r=await call({bearer:"not-a-real-supabase-jwt"});
  assert.equal(r.status,401);
  assert.equal(r.json?.children,undefined);
 });
 await t.test("M19 - rejected requests never consume valid Parent quota",async()=>{
  assert.equal(count(users.parentA),1);
  assert.equal(count(users.parentB),1);
  assert.equal(count(users.admin),0);
  assert.equal(count(users.studentA),0);
 });
 await t.test("M20 - 12 actual HTTP requests per minute then 429",async()=>{
  for(let i=0;i<11;i++){
    const r=await call({bearer:sessions.parentA.access_token});
    assert.equal(r.status,200,"authorized HTTP call "+i);
  }
  assert.equal((await call({bearer:sessions.parentA.access_token})).status,429);
  assert.equal(count(users.parentA),12);
  // Account B has an independent counter, not shared with Parent A.
  assert.equal((await call({bearer:sessions.parentB.access_token})).status,200);
  assert.equal(count(users.parentB),2);
 });
 await t.test("M21 - a second genuine Auth session cannot bypass Parent A quota",async()=>{
  const c=client();
  const login2=unwrap(await c.auth.signInWithPassword({
    email:emails.parentA,password:pwd,
  }),"second Parent A Auth session");
  const r=await call({bearer:login2.session.access_token});
  assert.equal(r.status,429);
  assert.equal(count(users.parentA),12);
 });
 await t.test("M22 - actual signOut revokes Parent B's old access immediately",async()=>{
  const oldJwt=sessions.parentB.access_token;
  unwrap(await clients.parentB.auth.signOut(),"Parent B logout");
  const r=await call({bearer:oldJwt});
  assert.equal(r.status,401);
  assert.equal(r.json?.children,undefined);
  assert.equal(count(users.parentB),2);
 });
 await t.test("M23 - role downgrade blocks newly signed-in Parent without leaking child",async()=>{
  const fresh=await login("parentB");
  unwrap(await service.from("profiles").update({role:"teacher"})
    .eq("id",users.parentB),"synthetic profile role downgrade");
  const r=await call({bearer:fresh});
  assert.equal(r.status,403);
  assert.equal(r.json?.children,undefined);
  assert.equal(count(users.parentB),2);
 });
 await t.test("M24 - SQL gate outage produces HTTP 503, no family data leak",async()=>{
  sql("REVOKE EXECUTE ON FUNCTION public.schoolnet_parent_read_gate(uuid,uuid) FROM service_role");
  try {
    const r=await call({bearer:sessions.parentA.access_token});
    assert.equal(r.status,503);
    assert.equal(r.json?.children,undefined);
    assert.equal(JSON.stringify(r.json).includes("schoolnet_private"),false);
  } finally {
    sql("GRANT EXECUTE ON FUNCTION public.schoolnet_parent_read_gate(uuid,uuid) TO service_role");
  }
 });
 await t.test("M25 - school history and source rows remain unchanged",async()=>{
  assert.equal(sql("SELECT count(*) FROM public.profiles"),"5");
  assert.equal(sql("SELECT count(*) FROM public.parent_links"),"2");
  assert.equal(sql("SELECT count(*) FROM public.school_years"),"2");
  assert.equal(sql("SELECT count(*) FROM public.student_enrollments"),"3");
  assert.equal(sql("SELECT count(*) FROM public.student_enrollment_documents"),"0");
  assert.equal(sql("SELECT count(*) FROM public.school_years WHERE is_current"),"1");
 });
});
