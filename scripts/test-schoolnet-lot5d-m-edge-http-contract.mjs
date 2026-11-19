// SCHOOLNET Lot 5D-M — offline/structural checks ONLY, NO network.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const file=p=>readFile(new URL(p,import.meta.url),"utf8");
const edge=()=>file("../supabase/functions/schoolnet-parent-current-class/index.ts");
const ci=()=>file("../.github/workflows/schoolnet-quality.yml");
const integration=()=>file("./test-schoolnet-lot5d-m-edge-http-real.mjs");
const setup=()=>file("./lot5d/5dm_prepare_edge_http_fixture.mjs");
test("M 01 - production project constant unchanged",async()=>{
 const s=await edge();assert.match(s,/EXPECTED_PROJECT = "https:\/\/anttmbhaphkhmkoqsofd\.supabase\.co"/);
});
test("M 02 - production allowed origin constant unchanged",async()=>{
 assert.match(await edge(),/EXPECTED_ORIGIN = "https:\/\/schoolnet-snowy\.vercel\.app"/);
});
test("M 03 - local test origin is strict loopback 54321",async()=>{
 assert.match(await edge(),/ISOLATED_TEST_ORIGIN = "http:\/\/127\.0\.0\.1:54321"/);
});
test("M 04 - local API hosts are an explicit allowlist",async()=>{
 const s=await edge();assert.match(s,/ISOLATED_TEST_PROJECTS = new Set/);
 assert.match(s,/"http:\/\/kong:8000"/);
 assert.match(s,/"http:\/\/127\.0\.0\.1:54321"/);
});
test("M 05 - hosted project cannot become a test fixture",async()=>{
 const s=await edge();const m=s.match(/ISOLATED_TEST_PROJECTS = new Set\(\[([\s\S]*?)\]\)/);
 assert.ok(m);assert.doesNotMatch(m[1],/supabase\.co|vercel\.app|https:\/\//);
});
test("M 06 - explicit test mode string is required",async()=>{
 assert.match(await edge(),/SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP/);
 assert.match(await edge(),/loopback-fixture-20261119/);
});
test("M 07 - hosted deployment runtime cannot use local test path",async()=>{
 assert.match(await edge(),/!Deno\.env\.get\("DENO_DEPLOYMENT_ID"\)/);
});
test("M 08 - server feature flag remains mandatory",async()=>{
 assert.match(await edge(),/SCHOOLNET_LOT5DI_PARENT_READ_ENABLED"\) === "true"/);
});
test("M 09 - failed mode/origin/project check returns Forbidden 403",async()=>{
 assert.match(await edge(),/if \(!enabled \|\| !\(allowHostedConfiguration \|\| allowDisposableLocalFixture\)\)/);
});
test("M 10 - local function never uses user metadata for role authorization",async()=>{
 const s=await edge();assert.doesNotMatch(s,/user_metadata|raw_user_meta_data/);
 assert.match(s,/authorizeParentSession/);
});
test("M 11 - Bearer and fixed action are checked before DB client",async()=>{
 const s=await edge();assert.ok(s.indexOf("const bearer =")<s.indexOf("const service ="));
 assert.match(s,/Object\.keys\(parsed\)\.length !== 1/);
});
test("M 12 - body-size limit and JSON error path are retained",async()=>{
 const s=await edge();assert.match(s,/raw\.length > 256/);
 assert.match(s,/deny\(413, origin\)/);
 assert.match(s,/deny\(400, origin\)/);
});
test("M 13 - rate limit and session authorization precede family query",async()=>{
 const s=await edge();assert.ok(s.indexOf("authorizeParentSession(")<s.indexOf("readVerifiedParentAnnualClasses("));
});
test("M 14 - service-only DB RPC remains the gate",async()=>{
 assert.match(await edge(),/\.rpc\("schoolnet_parent_read_gate"/);
});
test("M 15 - real getUser verifies identity before SQL gate",async()=>{
 const s=await edge();assert.match(s,/service\.auth\.getUser\(bearer\.slice\(7\)\)/);
 assert.match(s,/if \(!access\.allowed\) return deny\(access\.status, origin\)/);
});
test("M 16 - no writes to school enrollments or Storage in Edge",async()=>{
 const s=await edge();assert.doesNotMatch(s,/\.delete\(|\.remove\(|\.upsert\(|\.upload\(/);
});
test("M 17 - family links are limited to verified Parent id",async()=>{
 const s=await edge();assert.match(s,/\.eq\("parent_id", parentId\)\.limit\(101\)/);
 assert.match(s,/\.in\("student_id", \[\.\.\.ids\]\)/);
});
test("M 18 - no school year mutation",async()=>{
 const s=await edge();assert.match(s,/\.eq\("is_current", true\)/);
 assert.doesNotMatch(s,/school_years"\)\.update/);
});
test("M 19 - response is non-cacheable and does not include contacts",async()=>{
 const s=await edge();assert.match(s,/"cache-control": "no-store, max-age=0"/);
 assert.doesNotMatch(s,/full_name|phone|email|private_document/);
});
test("M 20 - real HTTP fixture creates ONLY synthetic Auth users",async()=>{
 const s=await integration();assert.match(s,/auth\.admin\.createUser/);
 assert.match(s,/@example\.test/);assert.doesNotMatch(s,/@gmail\.com|@yahoo\./);
});
test("M 21 - real HTTP tests cannot point at hosted Supabase",async()=>{
 const s=await integration();
 assert.match(s,/hostname!=="127\.0\.0\.1"/);
 assert.match(s,/port!=="54321"/);
 assert.match(s,/SUPABASE_ACCESS_TOKEN/);
});
test("M 22 - real test sends HTTP requests to actual Edge route",async()=>{
 const s=await integration();
 assert.match(s,/\/functions\/v1\/schoolnet-parent-current-class/);
 assert.match(s,/await fetch\(endpoint/);
});
test("M 23 - isolated staging never changes tracked config or production deployment",async()=>{
 const s=await setup();assert.match(s,/schoolnet-5dm-stack/);
 assert.match(s,/supabase\/config\.toml/);
 assert.match(s,/verify_jwt = false/);
 assert.match(s,/SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP/);
});
test("M 24 - CI isolates Docker, 5D-M contract and forbids deployment",async()=>{
 const s=await ci();assert.match(s,/lot5d_m_edge_http:/);
 assert.match(s,/npm run qa:lot5d:m/);
 assert.match(s,/npm run qa:lot5d:m:integration/);
 assert.doesNotMatch(s,/supabase db push|supabase functions deploy|vercel --prod/i);
});
