// SCHOOLNET Lot 5D-L — REAL GoTrue/Auth + atomic rate gate on a 5D-K
// disposable, loopback-only Supabase stack. NO hosted SQL or connections.
import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {authorizeParentSession} from
  "../supabase/functions/_shared/lot5dlParentSessionGate.ts";

const url=process.env.SCHOOLNET_K_LOCAL_URL??"";
const pg=process.env.SCHOOLNET_K_LOCAL_DB_URL??"";
const anon=process.env.SCHOOLNET_K_LOCAL_ANON_KEY??"";
const serviceKey=process.env.SCHOOLNET_K_LOCAL_SERVICE_KEY??"";
let a,d;
try{a=new URL(url);d=new URL(pg);}catch{throw Error("L: disposable Supabase is required");}
if(a.protocol!=="http:"||a.hostname!=="127.0.0.1"||a.port!=="54321"||
   (d.protocol!=="postgresql:"&&d.protocol!=="postgres:")||
   d.hostname!=="127.0.0.1"||d.port!=="54322"||d.pathname!=="/postgres"||
   !anon||!serviceKey) throw Error("L: refuse hosted Supabase/DB targets");
for(const key of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL",
 "DATABASE_URL","SUPABASE_PROJECT_ID","VITE_SUPABASE_URL"]){
 if(process.env[key])throw Error("L: hosted project env prohibited");
}
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const service=createClient(url,serviceKey,options);
const pub=()=>createClient(url,anon,options);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ids={},emails={},clients={},sessions={},sid={};
const pwd="Lot5D-L-local-only!2026";
function unwrap(r,label){if(r.error)throw Error(label+": "+r.error.message);return r.data;}
function sql(q) {
 return execFileSync("psql",[pg,"-X","-A","-t","-q","-v","ON_ERROR_STOP=1","-c",q],
   {encoding:"utf8",timeout:15000,env:{...process.env,PGCONNECT_TIMEOUT:"5"}}).trim();
}
function claim(token){
 const v=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());
 assert.match(v.session_id,UUID);return v;
}
async function rpc(actorId,sessionId,client=service) {
 const {data,error}=await client.rpc("schoolnet_parent_read_gate",
    {p_actor_id:actorId,p_session_id:sessionId});
 if(error)throw Error("Parent private gate: "+error.message);
 return data;
}
async function invoke(token){
 return authorizeParentSession(token,{
  verifyAuthUser:async t=>{
   const r=await service.auth.getUser(t);
   if(r.error)return null;
   return {id:r.data.user.id};
  },
  checkSessionAndRate:async(id,sessionId)=>rpc(id,sessionId),
 });
}
test("L - real Supabase Auth/session/quota on local stack only",async t=>{
 await t.test("L01 - local DB and service-only RPC installed",async()=>{
  assert.equal(sql("SELECT current_database()"),"postgres");
  assert.equal(sql("SELECT to_regprocedure('public.schoolnet_parent_read_gate(uuid,uuid)') IS NOT NULL"),"t");
  assert.equal(sql("SELECT has_function_privilege('service_role','public.schoolnet_parent_read_gate(uuid,uuid)','EXECUTE')"),"t");
 });
 await t.test("L02 - create three new fictitious users",async()=>{
  const tag=randomUUID().slice(0,8);
  for(const role of ["parentA","parentB","admin"]){
   emails[role]="schoolnet-5dl-"+role.toLowerCase()+"-"+tag+"@example.test";
   const u=unwrap(await service.auth.admin.createUser({
    email:emails[role],password:pwd,email_confirm:true,
   }),"create synthetic Auth user").user;
   assert.match(u.id,UUID);ids[role]=u.id;
  }
  unwrap(await service.from("profiles").insert([
   {id:ids.parentA,role:"parent",full_name:"Parent A 5D-L fictif"},
   {id:ids.parentB,role:"parent",full_name:"Parent B 5D-L fictif"},
   {id:ids.admin,role:"admin",full_name:"Admin 5D-L fictif"},
  ]),"local profiles");
 });
 await t.test("L03 - real password sign-ins produce independent sessions",async()=>{
  for(const role of ["parentA","parentB","admin"]){
   clients[role]=pub();
   const data=unwrap(await clients[role].auth.signInWithPassword({
     email:emails[role],password:pwd,
   }),"real local sign-in");
   assert.equal(data.user.id,ids[role]);
   sessions[role]=data.session;
   const claims=claim(data.session.access_token);
   assert.equal(claims.sub,ids[role]);sid[role]=claims.session_id;
  }
  assert.notEqual(sid.parentA,sid.parentB);
 });
 await t.test("L04 - verified Auth getUser matches JWT actor",async()=>{
  for(const role of ["parentA","parentB","admin"]){
   const result=await service.auth.getUser(sessions[role].access_token);
   assert.ifError(result.error);assert.equal(result.data.user.id,ids[role]);
  }
 });
 await t.test("L05 - anon/authenticated lack any EXECUTE on DB gate",async()=>{
  assert.equal(sql("SELECT has_function_privilege('authenticated','public.schoolnet_parent_read_gate(uuid,uuid)','EXECUTE')"),"f");
  assert.equal(sql("SELECT has_function_privilege('anon','public.schoolnet_parent_read_gate(uuid,uuid)','EXECUTE')"),"f");
  assert.equal(sql("SELECT has_table_privilege('authenticated','schoolnet_private.parent_read_rate_windows','SELECT')"),"f");
 });
 await t.test("L06 - real anonymous Data API rejects RPC",async()=>{
  const r=await pub().rpc("schoolnet_parent_read_gate",
   {p_actor_id:ids.parentA,p_session_id:sid.parentA});
  assert.ok(r.error,"anon must be denied");
 });
 await t.test("L07 - real authenticated Parent cannot invoke service-only RPC",async()=>{
  const r=await clients.parentA.rpc("schoolnet_parent_read_gate",
   {p_actor_id:ids.parentA,p_session_id:sid.parentA});
  assert.ok(r.error,"browser RPC must be denied");
 });
 await t.test("L08 - authorized backend checks live session and consumes quota",async()=>{
  assert.equal(await rpc(ids.parentA,sid.parentA),"authorized");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentA+"'::uuid"),"1");
 });
 await t.test("L09 - Admin cannot access Parent gate, no Admin counter",async()=>{
  assert.equal(await rpc(ids.admin,sid.admin),"role_denied");
  assert.equal(sql("SELECT count(*) FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.admin+"'::uuid"),"0");
 });
 await t.test("L10 - session ID of another Parent cannot authorize",async()=>{
  assert.equal(await rpc(ids.parentA,sid.parentB),"session_denied");
  assert.equal(await rpc(ids.parentB,sid.parentA),"session_denied");
 });
 await t.test("L11 - nonexistent session fails closed",async()=>{
  assert.equal(await rpc(ids.parentA,randomUUID()),"session_denied");
 });
 await t.test("L12 - second true session of SAME Parent shares quota",async()=>{
  clients.parentASecond=pub();
  sessions.parentASecond=unwrap(await clients.parentASecond.auth.signInWithPassword({
    email:emails.parentA,password:pwd,
  }),"second login").session;
  sid.parentASecond=claim(sessions.parentASecond.access_token).session_id;
  assert.notEqual(sid.parentA,sid.parentASecond);
  assert.equal(await rpc(ids.parentA,sid.parentASecond),"authorized");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentA+"'::uuid"),"2");
 });
 await t.test("L13 - persistent quota accepts exactly twelve per 60s",async()=>{
  for(let i=0;i<10;i++)assert.equal(await rpc(ids.parentA,sid.parentA),"authorized");
  assert.equal(await rpc(ids.parentA,sid.parentA),"rate_limited");
  assert.equal(await rpc(ids.parentA,sid.parentASecond),"rate_limited");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentA+"'::uuid"),"12");
 });
 await t.test("L14 - atomic concurrent requests globally admit only twelve",async()=>{
  const results=await Promise.all(Array.from({length:24},()=>rpc(ids.parentB,sid.parentB)));
  assert.equal(results.filter(x=>x==="authorized").length,12);
  assert.equal(results.filter(x=>x==="rate_limited").length,12);
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentB+"'::uuid"),"12");
 });
 await t.test("L15 - user_metadata is never authorization authority",async()=>{
  unwrap(await clients.parentA.auth.updateUser({data:{role:"admin",can_skip_quota:true}}),"metadata");
  assert.equal(await rpc(ids.parentA,sid.parentA),"rate_limited");
  assert.equal(unwrap(await service.from("profiles").select("role").eq("id",ids.parentA).single(),"role").role,"parent");
 });
 await t.test("L16 - moving an expired quota window resets counter to 1",async()=>{
  sql("UPDATE schoolnet_private.parent_read_rate_windows SET window_started_at=now()-interval '61 seconds' WHERE actor_id='"+ids.parentA+"'::uuid");
  assert.equal(await rpc(ids.parentA,sid.parentA),"authorized");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentA+"'::uuid"),"1");
 });
 await t.test("L17 - expired auth.sessions.not_after is rejected by DB",async()=>{
  sql("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='"+sid.parentA+"'::uuid AND user_id='"+ids.parentA+"'::uuid");
  assert.equal(await rpc(ids.parentA,sid.parentA),"session_denied");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentA+"'::uuid"),"1");
 });
 await t.test("L18 - other active session remains valid for the same user",async()=>{
  assert.equal(await rpc(ids.parentA,sid.parentASecond),"authorized");
 });
 await t.test("L19 - actual signOut revokes session despite still issued JWT",async()=>{
  unwrap(await clients.parentASecond.auth.signOut(),"logout local");
  assert.equal(sql("SELECT count(*) FROM auth.sessions WHERE id='"+sid.parentASecond+"'::uuid"),"0");
  assert.equal(await rpc(ids.parentA,sid.parentASecond),"session_denied");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentA+"'::uuid"),"2");
 });
 await t.test("L20 - cross-Parent quota isolation and private rate rows",async()=>{
  assert.equal(sql("SELECT count(*) FROM schoolnet_private.parent_read_rate_windows"),"2");
  assert.equal(sql("SELECT request_count FROM schoolnet_private.parent_read_rate_windows WHERE actor_id='"+ids.parentB+"'::uuid"),"12");
  const r=await clients.parentB.from("parent_read_rate_windows").select("*");
  assert.ok(r.error,"private table must not be reachable via PostgREST");
 });
 await t.test("L21 - verified JWT+live DB gate fail closed after signOut",async()=>{
  const token=sessions.parentASecond.access_token;
  const x=await invoke(token);
  assert.equal(x.allowed,false);
  assert.ok([401,503].includes(x.status),"no access after revocation");
 });
});
