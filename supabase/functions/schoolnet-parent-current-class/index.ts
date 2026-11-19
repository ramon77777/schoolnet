// SCHOOLNET 5D-M | AUTH/SESSION/RATE-LIMIT Edge: isolated HTTP fixture. NOT DEPLOYED.
 // No supabase/config.toml entry or UI caller. Disabled without explicit
 // server flag and exact production project + origin. No write operations.
 // Must pass Auth/Storage sandbox review and separate user GO before deploy.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import {
  readVerifiedParentAnnualClasses,
} from "../_shared/lot5diParentAnnualRead.ts";
import {
  authorizeParentSession,
  type ParentGateStatus,
} from "../_shared/lot5dlParentSessionGate.ts";

const EXPECTED_PROJECT = "https://anttmbhaphkhmkoqsofd.supabase.co";
const EXPECTED_ORIGIN = "https://schoolnet-snowy.vercel.app";
// 5D-M: explicitly opt-in to disposable Supabase CLI Docker ONLY.
// Hosted URLs can NEVER match these local addresses. Not a deployment flag.
const ISOLATED_TEST_ORIGIN = "http://127.0.0.1:54321";
const ISOLATED_TEST_PROJECTS = new Set([
  "http://kong:8000", "http://127.0.0.1:54321",
]);
const OPTIONS = {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function respond(status: number, body: Record<string, unknown>, origin: string) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  };
  return new Response(JSON.stringify(body), {status, headers});
}
const deny = (code: number, origin: string) =>
  respond(code, {ok: false, message: "Lecture annuelle indisponible."}, origin);

Deno.serve(async (req: Request) => {
  // Remains OFF unless separately approved. The 5D-L SQL gate exists ONLY
  // in disposable CI; it is NOT installed on either hosted Supabase project.
  const enabled = Deno.env.get("SCHOOLNET_LOT5DI_PARENT_READ_ENABLED") === "true";
  const project = Deno.env.get("SUPABASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowHostedConfiguration =
    !(project !== EXPECTED_PROJECT || origin !== EXPECTED_ORIGIN);
  const allowDisposableLocalFixture =
    Deno.env.get("SCHOOLNET_LOT5DM_DISPOSABLE_EDGE_HTTP") ===
      "loopback-fixture-20261119" &&
    !Deno.env.get("DENO_DEPLOYMENT_ID") &&
    ISOLATED_TEST_PROJECTS.has(project) &&
    origin === ISOLATED_TEST_ORIGIN;
  if (!enabled || !(allowHostedConfiguration || allowDisposableLocalFixture)) {
    return new Response("Forbidden", {status: 403});
  }
  if (req.method === "OPTIONS") return respond(200, {ok: true}, origin);
  if (req.method !== "POST" ||
      req.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return deny(405, origin);
  const bearer = req.headers.get("authorization") ?? "";
  if (!/^Bearer [^\s]+$/.test(bearer)) return deny(401, origin);
  let parsed: unknown;
  try {
    if (Number(req.headers.get("content-length") || "0") > 256) return deny(413, origin);
    const raw = await req.text();
    if (raw.length > 256) return deny(413, origin);
    parsed = JSON.parse(raw);
  } catch {
    return deny(400, origin);
  }
  // Only a fixed action is accepted. No parent_id, student_id or role from body.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      Object.keys(parsed).length !== 1 ||
      (parsed as Record<string, unknown>).action !== "list_current_classes")
    return deny(400, origin);
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret) return deny(503, origin);

  const service = createClient(project, secret, OPTIONS);
  // 5D-L: getUser verifies identity, then a PRIVATE service-role-only RPC
  // checks auth.sessions AND consumes a persistent, atomic per-Parent quota.
  // Any uninstalled DB gate, outage or unexpected result fails closed.
  const access = await authorizeParentSession(bearer.slice(7), {
    verifyAuthUser: async () => {
      const verified = await service.auth.getUser(bearer.slice(7));
      if (verified.error) return null;
      return verified.data.user ?? null;
    },
    checkSessionAndRate: async (actor, session) => {
      const {data, error} = await service.rpc("schoolnet_parent_read_gate", {
        p_actor_id: actor,
        p_session_id: session,
      });
      if (error || typeof data !== "string") throw new Error("session_gate_unavailable");
      return data as ParentGateStatus;
    },
  });
  if (!access.allowed) return deny(access.status, origin);
  const actorId = access.actorId ?? "";
  if (!UUID.test(actorId)) return deny(401, origin);

  try {
    const data = await readVerifiedParentAnnualClasses({
      parentId: actorId,
      getConfirmedRole: async (parentId) => {
        const {data, error} = await service.from("profiles")
          .select("role").eq("id", parentId).maybeSingle();
        if (error) throw error;
        return data?.role ?? null;
      },
      getVerifiedLinks: async (parentId) => {
        const {data, error} = await service.from("parent_links")
          .select("student_id").eq("parent_id", parentId).limit(101);
        if (error) throw error;
        return data ?? [];
      },
      getCurrentYears: async () => {
        const {data, error} = await service.from("school_years")
          .select("id").eq("is_current", true).limit(2);
        if (error) throw error;
        return data ?? [];
      },
      getAnnualEnrollments: async (ids, year) => {
        const {data, error} = await service.from("student_enrollments")
          .select("student_id,school_year_id,class_id,status")
          .eq("school_year_id", year).eq("status", "active")
          .in("student_id", [...ids]).limit(201);
        if (error) throw error;
        return data ?? [];
      },
      getYearClasses: async (ids, year) => {
        const {data, error} = await service.from("classes")
          .select("id,name,school_year_id")
          .eq("school_year_id", year).in("id", [...ids]).limit(201);
        if (error) throw error;
        return data ?? [];
      },
    });
    // Only linked student IDs + current class state, never child names,
    // arbitrary profiles or historical dossier details.
    return respond(200, {ok: true, school_year_id: data.schoolYearId,
      children: data.children.map((row) => ({
        student_id: row.studentId, state: row.state, class_name: row.className,
      }))}, origin);
  } catch {
    return deny(403, origin); // No SQL errors / family data leak.
  }
});
