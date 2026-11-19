// SCHOOLNET 5D-L — 30 offline tests, NO Supabase/Storage/network calls.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {authorizeParentSession} from
  "../supabase/functions/_shared/lot5dlParentSessionGate.ts";
const read=(p)=>readFile(new URL(p,import.meta.url),"utf8");
const actor="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const session="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW=Date.parse("2026-11-19T10:00:00Z");
const token=(fields={})=>{
 const head={alg:"HS256",typ:"JWT"};
 const claims={sub:actor,role:"authenticated",session_id:session,
   iat:Math.floor(NOW/1000)-60,exp:Math.floor(NOW/1000)+3600,...fields};
 const b64=x=>Buffer.from(JSON.stringify(x)).toString("base64url");
 return [b64(head),b64(claims),Buffer.from("fictional-fake-signature")
   .toString("base64url")].join(".");
};
const counter=[];
const adapters=(override={})=>({
 verifyAuthUser:async()=>{counter.push("getUser");return {id:actor};},
 checkSessionAndRate:async(id,sid)=>{counter.push(["gate",id,sid]);
   return "authorized";},
 ...override,
});
const run=(t=token(),a=adapters(),time=NOW)=>
  authorizeParentSession(t,a,time);

test("L 01 - verified getUser THEN private gate in correct order",async()=>{
 counter.length=0;const r=await run();
 assert.deepEqual(r,{allowed:true,status:200,actorId:actor});
 assert.equal(counter[0],"getUser");
 assert.deepEqual(counter[1],["gate",actor,session]);
});
test("L 02 - no token fails closed before callbacks",async()=>{
 counter.length=0;assert.equal((await run("")).allowed,false);
 assert.deepEqual(counter,[]);
});
test("L 03 - absent adapters fail with server unavailable",async()=>{
 assert.equal((await authorizeParentSession(token(),null,NOW)).status,503);
});
test("L 04 - Auth outage blocks without DB access",async()=>{
 counter.length=0;
 const a=adapters({verifyAuthUser:async()=>{throw Error("Auth offline");}});
 assert.equal((await run(token(),a)).status,401);assert.deepEqual(counter,[]);
});
test("L 05 - null Auth user rejected",async()=>{
 assert.equal((await run(token(),adapters({verifyAuthUser:async()=>null}))).status,401);
});
test("L 06 - user id must be real UUID",async()=>{
 const r=await run(token(),adapters({verifyAuthUser:async()=>({id:"not-uuid"})}));
 assert.equal(r.status,401);
});
test("L 07 - JWT sub must match freshly verified user",async()=>{
 const r=await run(token({sub:other}));
 assert.equal(r.status,401);
});
test("L 08 - missing session_id rejected",async()=>{
 const r=await run(token({session_id:null}));
 assert.equal(r.status,401);
});
test("L 09 - invalid session_id format rejected",async()=>{
 const r=await run(token({session_id:"unknown"}));
 assert.equal(r.status,401);
});
test("L 10 - fake admin JWT role cannot pass session gate",async()=>{
 const r=await run(token({role:"service_role"}));
 assert.equal(r.status,401);
});
test("L 11 - user_metadata role is not used for authorization",async()=>{
 const r=await run(token({user_metadata:{role:"admin"}}));
 assert.deepEqual(r,{allowed:true,status:200,actorId:actor});
});
test("L 12 - expired JWT fails after Auth and BEFORE the SQL gate",async()=>{
 counter.length=0;
 const r=await run(token({exp:Math.floor(NOW/1000)-1}));
 assert.equal(r.status,401);
 assert.deepEqual(counter,["getUser"],"No private DB authorization may run");
});
test("L 13 - expiry at exact current second is rejected",async()=>{
 const r=await run(token({exp:Math.floor(NOW/1000)}));
 assert.equal(r.status,401);
});
test("L 14 - future iat outside tolerance rejected",async()=>{
 const r=await run(token({iat:Math.floor(NOW/1000)+100}));
 assert.equal(r.status,401);
});
test("L 15 - bad token component count refused",async()=>{
 assert.equal((await run(token()+".another")).status,401);
});
test("L 16 - corrupted JWT payload fails without leaking error",async()=>{
 const r=await run("a."+Buffer.from("not-json").toString("base64url")+".c");
 assert.equal(r.status,401);
});
test("L 17 - oversized token is rejected",async()=>{
 assert.equal((await run("a.".padEnd(8200,"A")+".b")).status,401);
});
test("L 18 - revoked session maps to authentication denied",async()=>{
 const r=await run(token(),adapters({checkSessionAndRate:async()=> "session_denied"}));
 assert.deepEqual(r,{allowed:false,status:401,actorId:null});
});
test("L 19 - non-Parent role is blocked by the DB",async()=>{
 const r=await run(token(),adapters({checkSessionAndRate:async()=> "role_denied"}));
 assert.equal(r.status,403);assert.equal(r.actorId,null);
});
test("L 20 - persistent quota reached maps to 429",async()=>{
 const r=await run(token(),adapters({checkSessionAndRate:async()=> "rate_limited"}));
 assert.equal(r.status,429);
});
test("L 21 - database outage fails closed, no child data",async()=>{
 const r=await run(token(),adapters({checkSessionAndRate:async()=>{throw Error("DB SQL details");}}));
 assert.deepEqual(r,{allowed:false,status:503,actorId:null});
});
test("L 22 - unexpected DB status refused",async()=>{
 const r=await run(token(),adapters({checkSessionAndRate:async()=> "bypass"}));
 assert.equal(r.status,503);
});
test("L 23 - SQL proposal protected by Docker private network and marker",async()=>{
 const sql=await read("./lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql");
 assert.match(sql,/SANDBOX_ONLY/);
 assert.match(sql,/current_database\(\) <> 'postgres'/);
 assert.match(sql,/schoolnet_5dl_local_ci/);
 assert.match(sql,/policyname='k_profile_self'/);
});
test("L 24 - private auth.sessions and DB role checked before quota",async()=>{
 const sql=await read("./lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql");
 const a=sql.indexOf("FROM auth.sessions s");
 const b=sql.indexOf("FROM public.profiles p");
 const c=sql.indexOf("INSERT INTO schoolnet_private.parent_read_rate_windows");
 assert.ok(a>0&&a<b&&b<c);
 assert.match(sql,/s\.id=p_session_id AND s\.user_id=p_actor_id/);
 assert.match(sql,/p\.role::text='parent'/);
});
test("L 25 - atomic shared counter limits to twelve per minute",async()=>{
 const sql=await read("./lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql");
 assert.match(sql,/actor_id uuid PRIMARY KEY/);
 assert.match(sql,/request_count BETWEEN 1 AND 12/);
 assert.match(sql,/ON CONFLICT\(actor_id\) DO UPDATE/);
 assert.match(sql,/request_count<12/);
 assert.match(sql,/interval '60 seconds'/);
});
test("L 26 - public wrapper SECURITY INVOKER, private SECURITY DEFINER",async()=>{
 const sql=await read("./lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql");
 assert.match(sql,/LANGUAGE plpgsql SECURITY DEFINER/);
 assert.match(sql,/LANGUAGE sql SECURITY INVOKER/);
 assert.match(sql,/SET search_path = pg_catalog/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.schoolnet_parent_read_gate/);
});
test("L 27 - service only execute; browser roles can never invoke",async()=>{
 const sql=await read("./lot5d/5dl_parent_session_rate_local_SANDBOX_ONLY.sql");
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/TO service_role/);
 assert.match(sql,/has_function_privilege\('authenticated'/);
});
test("L 28 - Edge actually invokes verified session/role/quota gate",async()=>{
 const edge=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 assert.match(edge,/authorizeParentSession\(bearer\.slice\(7\)/);
 assert.match(edge,/auth\.getUser\(bearer\.slice\(7\)\)/);
 assert.match(edge,/\.rpc\("schoolnet_parent_read_gate"/);
 assert.match(edge,/if \(!access\.allowed\) return deny\(access\.status, origin\)/);
});
test("L 29 - Edge remains OFF, frontend not connected",async()=>{
 const edge=await read("../supabase/functions/schoolnet-parent-current-class/index.ts");
 const ui=await read("../src/features/parent/pages/ParentChildren.tsx");
 const cfg=await read("../supabase/config.toml");
 assert.match(edge,/SCHOOLNET_LOT5DI_PARENT_READ_ENABLED/);
 assert.doesNotMatch(ui,/schoolnet-parent-current-class/);
 assert.doesNotMatch(cfg,/schoolnet-parent-current-class/);
});
test("L 30 - CI must run sandbox tests, never deploy SQL or Edge",async()=>{
 const wf=await read("../.github/workflows/schoolnet-quality.yml");
 assert.match(wf,/npm run qa:lot5d:l/);
 assert.match(wf,/5dl_parent_session_rate_local_SANDBOX_ONLY\.sql/);
 assert.match(wf,/qa:lot5d:l:integration/);
 assert.doesNotMatch(wf,/supabase db push|supabase functions deploy|vercel --prod/i);
});
