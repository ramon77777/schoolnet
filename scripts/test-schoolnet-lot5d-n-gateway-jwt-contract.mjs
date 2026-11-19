// SCHOOLNET Lot 5D-N -- offline security/config contracts only.
// No Docker, Supabase, network or private credentials required.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const file=p=>readFile(new URL(p,import.meta.url),"utf8");
const prep=()=>file("./lot5d/5dn_prepare_jwt_verified_edge_fixture.mjs");
const real=()=>file("./test-schoolnet-lot5d-n-gateway-jwt-real.mjs");
const edge=()=>file("../supabase/functions/schoolnet-parent-current-class/index.ts");
const workflow=()=>file("../.github/workflows/schoolnet-quality.yml");
test("N 01 - isolated preparer runs only in CI",async()=>{
 const s=await prep();assert.match(s,/process\.env\.CI!=="true"/);
});
test("N 02 - completely separate N disposable scratch directory",async()=>{
 const s=await prep();assert.match(s,/schoolnet-5dn-stack/);
 assert.doesNotMatch(s,/schoolnet-5dm-stack/);
});
test("N 03 - prohibits environment with hosted Supabase connections",async()=>{
 const s=await prep();
 for(const name of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL",
 "SUPABASE_PROJECT_ID","VITE_SUPABASE_URL"])assert.ok(s.includes(name),name);
});
test("N 04 - true gateway verification set explicitly on temporary config",async()=>{
 const s=await prep();assert.match(s,/"verify_jwt = true\\n"/);
});
test("N 05 - only N scratch config is written, never repo config",async()=>{
 const s=await prep();assert.match(s,/join\(dest,"supabase\/config.toml"\)/);
 assert.doesNotMatch(s,/join\(repo,"supabase\/config.toml"\)/);
});
test("N 06 - source is copied byte-for-byte and verified",async()=>{
 const s=await prep();assert.match(s,/await cp\(join\(repo,path\),join\(dest,path\)\)/);
 assert.match(s,/assert\.deepEqual\(await readFile\(join\(dest,path\)\),await readFile\(join\(repo,path\)\)\)/);
});
test("N 07 - no hosted credentials or real records in N test fixture",async()=>{
 const s=await real();assert.match(s,/@example\.test/);
 assert.doesNotMatch(s,/@gmail\.com|@yahoo\./);
 assert.match(s,/auth\.admin\.createUser/);
});
test("N 08 - production project and Origin constants remain unchanged",async()=>{
 const s=await edge();assert.match(s,/EXPECTED_PROJECT = "https:\/\/anttmbhaphkhmkoqsofd\.supabase\.co"/);
 assert.match(s,/EXPECTED_ORIGIN = "https:\/\/schoolnet-snowy\.vercel\.app"/);
});
test("N 09 - gateway N scratch still needs 5D-M local-only runtime flag",async()=>{
 const s=await prep();
 assert.match(s,/SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP=loopback-fixture-20261119/);
});
test("N 10 - user-facing hosted Edge remains OFF and not wired to Parent UI",async()=>{
 const s=await edge();
 const ui=await file("../src/features/parent/pages/ParentChildren.tsx");
 assert.match(s,/SCHOOLNET_LOT5DI_PARENT_READ_ENABLED/);
 assert.doesNotMatch(ui,/schoolnet-parent-current-class/);
});
test("N 11 - scratch N gateway config cannot use the unsafe M false flag",async()=>{
 const s=await prep();
 assert.match(s,/assert\.doesNotMatch\(section,\/verify_jwt = false\//);
});
test("N 12 - no deployment commands or remote mutations in CI",async()=>{
 const s=await workflow();
 assert.doesNotMatch(s,/supabase db push|supabase functions deploy|vercel --prod/i);
});
test("N 13 - N GitHub job pins supported Supabase CLI v3",async()=>{
 const s=await workflow();assert.match(s,/lot5d_n_gateway_jwt:/);
 assert.match(s,/supabase\/setup-cli@v3[\s\S]*version: 3\.0\.0/);
});
test("N 14 - N GitHub job starts with new local configuration",async()=>{
 const s=await workflow();assert.match(s,/5dn_prepare_jwt_verified_edge_fixture\.mjs/);
 assert.match(s,/supabase init --yes/);
});
test("N 15 - runtime Edge not excluded from Supabase start",async()=>{
 const s=await workflow();assert.match(s,/lot5d_n_gateway_jwt:/);
 const n=s.split("  lot5d_n_gateway_jwt:")[1]??"";
 assert.match(n,/supabase start --exclude studio,imgproxy,logflare,vector,realtime,supavisor,postgres-meta/);
 assert.doesNotMatch(n,/--exclude[^\n]*edge-runtime/);
});
test("N 16 - no hosted secrets injected in N job",async()=>{
 const s=await workflow();
 const n=s.split("  lot5d_n_gateway_jwt:")[1]??"";
 assert.doesNotMatch(n,/\$\{\{\s*secrets\./);
 assert.match(n,/SUPABASE_ACCESS_TOKEN SUPABASE_DB_URL DATABASE_URL/);
});
test("N 17 - protected fixtures K and L only applied to disposable Postgres",async()=>{
 const s=await workflow();
 const n=s.split("  lot5d_n_gateway_jwt:")[1]??"";
 assert.match(n,/PGAPPNAME=schoolnet_5dk_local_ci/);
 assert.match(n,/PGAPPNAME=schoolnet_5dl_local_ci/);
 assert.match(n,/5dl_parent_session_rate_local_SANDBOX_ONLY\.sql/);
});
test("N 18 - test runner refuses cloud API/DB URLs",async()=>{
 const s=await real();assert.match(s,/api\.hostname!=="127\.0\.0\.1"/);
 assert.match(s,/db\.hostname!=="127\.0\.0\.1"/);
 assert.match(s,/api\.port!=="54321"/);
 assert.match(s,/db\.port!=="54322"/);
});
test("N 19 - test script proves actual JWT-on config from scratch",async()=>{
 const s=await real();assert.match(s,/verify_jwt = true/);
 assert.match(s,/assert\.doesNotMatch\(section,\/verify_jwt = false\//);
});
test("N 20 - HTTP calls use true Edge route, no internal mock",async()=>{
 const s=await real();
 assert.match(s,/\/functions\/v1\/schoolnet-parent-current-class/);
 assert.match(s,/await fetch\(endpoint/);
});
test("N 21 - signed JWT and API key sent in distinct headers",async()=>{
 const s=await real();assert.match(s,/headers\.apikey=anon/);
 assert.match(s,/headers\.authorization="Bearer "\+bearer/);
});
test("N 22 - tests probe gateway invalid/missing JWT before malformed JSON",async()=>{
 const s=await real();assert.match(s,/includeApikey:false,body:"\{"/);
 assert.match(s,/const forged=\[pieces\[0\]/);
 assert.match(s,/assert\.equal\(r\.status,401\)/);
});
test("N 23 - runtime checks session revocation, role and persistent quota",async()=>{
 const s=await real();
 assert.match(s,/auth\.signOut\(\)/);
 assert.match(s,/rate_limited|quota is still enforced via real HTTP/);
 assert.match(s,/schoolnet_parent_read_gate/);
});
test("N 24 - script and CI runner are not an install or release command",async()=>{
 const s=await workflow();
 assert.match(s,/npm run qa:lot5d:n/);
 assert.match(s,/npm run qa:lot5d:n:integration/);
 const prepCode=await prep();
 assert.doesNotMatch(prepCode,/execFile|functions deploy|db push/);
});
