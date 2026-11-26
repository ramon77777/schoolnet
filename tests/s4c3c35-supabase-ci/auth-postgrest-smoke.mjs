import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

const api = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY;
// Hard fail before making any network call if a hosted URL is accidentally supplied.
assert.equal(api, "http://127.0.0.1:55421",
  "C3-C.3.5 CI is allowed to contact ONLY the local disposable API");
assert.ok(anonKey && serviceKey, "Missing LOCAL Supabase CI keys");

async function request(path, token, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      apikey: token === "anon" ? anonKey : token === "service" ? serviceKey : anonKey,
      Authorization: `Bearer ${token === "anon" ? anonKey : token === "service" ? serviceKey : token}`,
      "Content-Type": "application/json",
      ...(body ? { Prefer: "return=minimal" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* no secret logs */ }
  return { status: response.status, json };
}
function checked(condition, message) { assert.ok(condition, message); }

test("C3-C.3.5.1: actual local Supabase Auth JWT + PostgREST RLS isolation", async t => {
  await t.test("local Auth HTTP is healthy", async () => {
    const res = await request("/auth/v1/health", "anon");
    checked(res.status >= 200 && res.status < 300, "Local GoTrue health failed");
  });

  const users = [];
  for (const label of ["alpha","beta"]) {
    const email = `c35-${label}-${randomUUID()}@example.test`;
    const password = randomBytes(24).toString("hex");
    const auth = await request("/auth/v1/signup", "anon", "POST", {email,password});
    checked(auth.status >= 200 && auth.status < 300, "Local signup failed for " + label);
    checked(!!auth.json?.access_token && !!auth.json?.user?.id,
      "No local Auth user and access token for " + label);
    users.push({id:auth.json.user.id, jwt:auth.json.access_token, label});
  }
  await t.test("two real Auth users receive separate JWT identities", async()=>{
    for(const user of users){
      const r=await request("/auth/v1/user",user.jwt);
      assert.equal(r.status,200);
      assert.equal(r.json?.id,user.id);
    }
  });

  // All writes below target only a brand-new local RLS canary table. The
  // service-role key is provided by local Supabase and never printed/exported.
  await t.test("service fixture can seed only the local probe",async()=>{
    const r=await request("/rest/v1/schoolnet_c35_http_probe","service","POST",
      users.map(({id,label})=>({owner_id:id,label})));
    assert.ok(r.status===201 || r.status===200, "Local fixture POST failed");
  });

  await t.test("anonymous caller cannot read the fixture",async()=>{
    const r=await request("/rest/v1/schoolnet_c35_http_probe?select=owner_id,label","anon");
    checked(r.status===401 || r.status===403 || (r.status===200 && r.json?.length===0),
      "Anonymous direct table access must be denied");
  });

  await t.test("RLS shows only current Auth user, never another user's row",async()=>{
    for(const user of users){
      const r=await request("/rest/v1/schoolnet_c35_http_probe?select=owner_id,label",user.jwt);
      assert.equal(r.status,200);
      assert.equal(r.json?.length,1);
      assert.equal(r.json[0]?.owner_id,user.id);
      assert.equal(r.json[0]?.label,user.label);
    }
    const forged=await request(
      `/rest/v1/schoolnet_c35_http_probe?select=owner_id,label&owner_id=eq.${users[1].id}`,
      users[0].jwt);
    assert.equal(forged.status,200);
    assert.deepEqual(forged.json,[]);
  });

  await t.test("no INSERT or UPDATE rights are granted to ordinary Auth users",async()=>{
    const bad=await request("/rest/v1/schoolnet_c35_http_probe",users[0].jwt,"POST",
      {owner_id:users[0].id,label:"unauthorized"});
    checked(bad.status===401 || bad.status===403,
      "Authenticated user must not write the RLS probe");
  });
});
