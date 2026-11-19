// SCHOOLNET 5D-K: static contract checks. Never connects to a DB or HTTP.
// Real Supabase Auth/Storage integration runs separately in disposable CI.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=p=>readFile(new URL(p,import.meta.url),"utf8");
const sql=()=>read("./lot5d/5dk_local_supabase_real_api_fixture.sql");
const live=()=>read("./test-schoolnet-lot5d-k-real-supabase.mjs");
const wf=()=>read("../.github/workflows/schoolnet-quality.yml");
test("K 01 - ephemeral SQL fixture guards loopback TCP and empty schema",async()=>{
 const s=await sql();assert.match(s,/inet_server_addr\(\)/);
 assert.match(s,/current_database\(\) <> 'postgres'/);
 assert.match(s,/n\.nspname='public' AND c\.relname='profiles'/);
});
test("K 02 - no runtime installation under supabase/migrations",async()=>{
 const w=await wf();
 assert.match(w,/5dk_local_supabase_real_api_fixture\.sql/);
 assert.match(w,/lot5d_supabase_local_real_api:/);
 assert.doesNotMatch(w,/supabase db push|supabase functions deploy|vercel --prod/i);
});
test("K 03 - explicit isolation from hosted Supabase accounts",async()=>{
 const s=await live();
 assert.match(s,/api\.hostname!=="127\.0\.0\.1"/);
 assert.match(s,/db\.hostname!=="127\.0\.0\.1"/);
 assert.match(s,/api\.port!=="54321"/);
 assert.match(s,/db\.port!=="54322"/);
});
test("K 04 - production environment variables must fail closed",async()=>{
 const s=await live();
 for(const field of ["SUPABASE_ACCESS_TOKEN","SUPABASE_DB_URL","DATABASE_URL","VITE_SUPABASE_URL","SUPABASE_PROJECT_ID"])
  assert.ok(s.includes(field),field);
});
test("K 05 - user creation uses local Auth Admin API (never SQL auth.users)",async()=>{
 const s=await live();assert.match(s,/auth\.admin\.createUser/);
 assert.match(s,/email_confirm:true/);
 assert.doesNotMatch(s,/\bINSERT INTO auth\.users\b/i);
});
test("K 06 - JWT identity verified by real Auth getUser",async()=>{
 const s=await live();assert.match(s,/service\.auth\.getUser\(sessions\[name\]\.access_token\)/);
});
test("K 07 - session liveness uses auth.sessions and owner ID",async()=>{
 const s=await live();assert.match(s,/FROM auth\.sessions WHERE user_id=/);
 assert.match(s,/not_after IS NULL OR not_after>now\(\)/);
 assert.match(s,/session_id/);
});
test("K 08 - revocation through real signOut and check for missing session",async()=>{
 const s=await live();assert.match(s,/\.auth\.signOut\(\)/);
 assert.match(s,/liveSession\(ids\.parentA,sessions\.parentA\.session_id\),false/);
});
test("K 09 - authentic user metadata cannot elevate Parent DB role",async()=>{
 const s=await live();assert.match(s,/data:\{role:"admin",is_admin:true\}/);
 assert.match(s,/\.eq\("id",ids\.parentA\)/);
});
test("K 10 - two unrelated families seeded independently",async()=>{
 const s=await live();assert.match(s,/parent_id:ids\.parentA,student_id:ids\.studentA/);
 assert.match(s,/parent_id:ids\.parentB,student_id:ids\.studentB/);
});
test("K 11 - family rows protected by RLS auth.uid",async()=>{
 const s=await sql();assert.match(s,/ALTER TABLE public\.parent_links ENABLE ROW LEVEL SECURITY/);
 assert.match(s,/parent_id=\(SELECT auth\.uid\(\)\)/);
});
test("K 12 - enrollment SELECT intentionally revoked to browser",async()=>{
 const s=await sql();assert.match(s,/REVOKE ALL ON public\.student_enrollments FROM anon,authenticated/);
 assert.match(s,/CREATE POLICY k_parent_annual_rls/);
});
test("K 13 - server annual read scoped to verified Parent links and current year",async()=>{
 const s=await live();assert.match(s,/readVerifiedParentAnnualClasses\(/);
 assert.match(s,/\.eq\("parent_id",id\)\.limit\(101\)/);
 assert.match(s,/\.eq\("school_year_id",year\)\.eq\("status","active"\)/);
});
test("K 14 - two private buckets created with real Storage API",async()=>{
 const s=await live();assert.match(s,/storage\.createBucket/);
 assert.match(s,/public:false/);
 assert.match(s,/schoolnet-k-retention/);
});
test("K 15 - live upload and download use Storage API instead of metadata SQL",async()=>{
 const s=await live();assert.match(s,/\.storage\.from\(SRC\)/);
 assert.match(s,/\.upload\(documentPath/);
 assert.match(s,/\.download\(documentPath\)/);
});
test("K 16 - Admin direct DELETE rejected under SQL RLS policy",async()=>{
 const s=await sql();assert.match(s,/k_storage_source_delete_deny/);
 assert.match(s,/FOR DELETE TO authenticated USING \(false\)/);
});
test("K 17 - retention is server-only (no authenticated policy)",async()=>{
 const s=await sql();assert.match(s,/schoolnet-k-source/);
 assert.doesNotMatch(s,/CREATE POLICY k_storage_retention_/);
});
test("K 18 - backup reads back bytes and checks SHA-256 before attestation",async()=>{
 const s=await live();assert.match(s,/service\.storage\.from\(BACKUP\)\.upload/);
 assert.match(s,/service\.storage\.from\(BACKUP\)\s*\.download/);
 assert.match(s,/sha\(copyBytes\),sha\(bytes\)/);
});
test("K 19 - hosted schoolnet-auth-sandbox is not a test target",async()=>{
 const s=await live();assert.doesNotMatch(s,/onqlsvphmrqhelislpry/);
 assert.doesNotMatch(s,/anttmbhaphkhmkoqsofd/);
});
test("K 20 - CI intentionally uses fresh scratch Supabase instance",async()=>{
 const w=await wf();assert.match(w,/supabase\/setup-cli@v3/);
 assert.match(w,/supabase init/);assert.match(w,/supabase start/);
 assert.match(w,/SCHOOLNET_K_LOCAL_URL/);
});
