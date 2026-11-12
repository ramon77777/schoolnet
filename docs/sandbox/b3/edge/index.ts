// SCHOOLNET / 5.C-B.2 / B.3 — SANDBOX ONLY, ONE-TIME AUTH RECIPE.
// TARGET LOCK: onqlsvphmrqhelislpry ; NEVER deploy to SCHOOLNET production.
// Protected by verified GitHub Actions OIDC, NOT by a public apikey.
// No passwords, sessions, OTPs or recovery links are logged or returned.
// No SQL mutations; creates only two fixed, synthetic Auth users in sandbox.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const REF = "onqlsvphmrqhelislpry";
const EXPECTED_URL = "https://" + REF + ".supabase.co";
const EXPECTED_REPO = "ramon77777/schoolnet";
const EXPECTED_BRANCH = "refs/heads/feature/schoolnet-multi-etablissements";
const EXPECTED_WORKFLOW = EXPECTED_REPO +
  "/.github/workflows/schoolnet-auth-sandbox-b3-once.yml@" + EXPECTED_BRANCH;
const AUDIENCE = "schoolnet-auth-sandbox-b3";
const ISSUER = "https://token.actions.githubusercontent.com";
const jwks = createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks"));

const USERS = [
  { recipient: "parent", email: "schoolnet-b3-parent@example.test" },
  { recipient: "student", email: "schoolnet-b3-student@example.test" },
] as const;

function reply(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function failure(stage: string, code = 422): Response {
  // Never return exception messages, user objects, tokens or URLs.
  return reply(code, { ok: false, stage, sandbox_only: true });
}

function password(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return "S!8a" + Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
}

async function authorized(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length > 7000) return false;
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
      maxTokenAge: "5m",
    });
    return payload.repository === EXPECTED_REPO &&
      payload.ref === EXPECTED_BRANCH &&
      payload.event_name === "push" &&
      payload.workflow_ref === EXPECTED_WORKFLOW &&
      typeof payload.run_id === "string" &&
      payload.sub === "repo:" + EXPECTED_REPO + ":ref:" + EXPECTED_BRANCH;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return failure("method", 405);
  const url = Deno.env.get("SUPABASE_URL");
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (url !== EXPECTED_URL || !adminKey || !anonKey) {
    return failure("wrong_supabase_project", 503);
  }
  if (!(await authorized(req))) return failure("oidc_required", 401);

  let mode = "";
  try {
    const body = await req.json();
    mode = body?.mode === "preflight" ? "preflight" :
      body?.mode === "run" ? "run" : "";
  } catch {
    return failure("invalid_json", 400);
  }
  if (!mode) return failure("invalid_mode", 400);

  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(url, adminKey, options);
  const { data: roster, error: rosterError } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (rosterError || !roster) return failure("cannot_inspect_sandbox_users", 503);
  if (roster.users.length !== 0) return failure("sandbox_users_already_exist", 409);

  if (mode === "preflight") {
    return reply(200, { ok: true, mode, sandbox_only: true, empty_auth: true });
  }

  const client = () => createClient(url, anonKey, options);
  let stage = "create_parent";
  try {
    const secrets: string[] = [password(), password()];
    const userIds: string[] = [];
    for (let i = 0; i < USERS.length; i++) {
      stage = i === 0 ? "create_parent" : "create_student";
      const { data, error } = await admin.auth.admin.createUser({
        email: USERS[i].email,
        password: secrets[i],
        email_confirm: true,
        app_metadata: {
          schoolnet_sandbox: true,
          test_stage: "B3",
          synthetic_recipient: USERS[i].recipient,
        },
      });
      if (error || !data?.user?.id || data.user.email !== USERS[i].email) {
        return failure(stage);
      }
      userIds.push(data.user.id);
    }

    stage = "wrong_password";
    const wrong = await client().auth.signInWithPassword({
      email: USERS[0].email, password: "DefinitelyWrongPassword7!",
    });
    if (!wrong.error || wrong.data?.session) return failure(stage);

    stage = "password_login_parent";
    const validParent = await client().auth.signInWithPassword({
      email: USERS[0].email, password: secrets[0],
    });
    if (validParent.error || !validParent.data?.session ||
      validParent.data.user?.id !== userIds[0]) return failure(stage);

    stage = "password_login_student";
    const validStudent = await client().auth.signInWithPassword({
      email: USERS[1].email, password: secrets[1],
    });
    if (validStudent.error || !validStudent.data?.session ||
      validStudent.data.user?.id !== userIds[1]) return failure(stage);

    stage = "generate_recovery_without_email";
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery", email: USERS[0].email,
    });
    const hash = linkData?.properties?.hashed_token;
    if (linkError || !hash || linkData?.properties?.verification_type !== "recovery") {
      return failure(stage);
    }

    stage = "consume_recovery_token";
    const recoveryClient = client();
    const recovery = await recoveryClient.auth.verifyOtp({
      token_hash: hash, type: "recovery",
    });
    if (recovery.error || !recovery.data?.session ||
      recovery.data.user?.id !== userIds[0]) return failure(stage);

    stage = "set_password_via_recovery";
    const newSecret = password();
    const changed = await recoveryClient.auth.updateUser({ password: newSecret });
    if (changed.error || changed.data.user?.id !== userIds[0]) {
      return failure(stage);
    }

    stage = "recovery_token_replay";
    const replay = await client().auth.verifyOtp({
      token_hash: hash, type: "recovery",
    });
    if (!replay.error || replay.data?.session) return failure(stage);

    stage = "old_password_must_fail";
    const oldLogin = await client().auth.signInWithPassword({
      email: USERS[0].email, password: secrets[0],
    });
    if (!oldLogin.error || oldLogin.data?.session) return failure(stage);

    stage = "first_new_password_login";
    const finalLogin = await client().auth.signInWithPassword({
      email: USERS[0].email, password: newSecret,
    });
    if (finalLogin.error || !finalLogin.data?.session ||
      finalLogin.data.user?.id !== userIds[0]) return failure(stage);

    stage = "auth_users_confirmed";
    const getParent = await admin.auth.admin.getUserById(userIds[0]);
    const getStudent = await admin.auth.admin.getUserById(userIds[1]);
    if (getParent.error || getStudent.error ||
      getParent.data.user?.email !== USERS[0].email ||
      getStudent.data.user?.email !== USERS[1].email) return failure(stage);

    // The backend of Supabase records Auth events, but an external
    // durable/provenance proof pipeline is NOT enabled by this recipe.
    // No mutation of schoolnet_auth_sandbox.* and no activated status.
    return reply(200, {
      ok: true,
      mode: "run",
      sandbox_only: true,
      created_auth_accounts: 2,
      no_email_dispatch_requested: true,
      password_login_parent: true,
      password_login_student: true,
      wrong_password_rejected: true,
      recovery_link_generated_without_email: true,
      recovery_token_consumed: true,
      password_updated_via_recovery: true,
      recovery_token_replay_rejected: true,
      previous_password_rejected: true,
      new_password_login_verified: true,
      evidence_registry_unchanged: true,
      activation_confirmed: false,
    });
  } catch {
    return failure(stage, 500);
  }
});
