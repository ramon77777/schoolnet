// SCHOOLNET 5.C-B.2 / Etape 2.B — ESSAI UNIQUE SUR SANDBOX.
 // Ce code ne doit JAMAIS etre deploye dans le projet principal.
 // Aucune cle, session, OTP, identite ou lien ne quitte ce serveur.
 // Autorisation : JWT OIDC GitHub Actions verifie avec les cles publiques GitHub.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const REF = "onqlsvphmrqhelislpry";
const SANDBOX_URL = "https://" + REF + ".supabase.co";
const REPOSITORY = "ramon77777/schoolnet";
const BRANCH = "refs/heads/feature/schoolnet-student-sans-email";
const WORKFLOW = REPOSITORY +
  "/.github/workflows/schoolnet-auth-sandbox-b2b-once.yml@" + BRANCH;
const AUDIENCE = "schoolnet-sandbox-student-b2b-20261113";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks"));
const PREVIOUS_EMAILS = new Set([
  "schoolnet-b3-parent@example.test",
  "schoolnet-b3-student@example.test",
]);
const STUDENTS = [
  { email: "schoolnet-b2b-student-01@schoolnet.invalid", label: "A" },
  { email: "schoolnet-b2b-student-02@schoolnet.invalid", label: "B" },
] as const;
const DUMMY_SHARED_PHONE = "+2250799999999"; // fictif, pas renseigne dans auth.users.phone

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function stopped(stage: string, status = 422): Response {
  // Ne jamais retransmettre une erreur Auth brute ni un secret.
  return respond(status, { ok: false, stage, sandbox_only: true });
}

function randomPassword(): string {
  const data = crypto.getRandomValues(new Uint8Array(32));
  return "S!8a" + Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifiedGithubOIDC(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || header.length > 7000) return false;
  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
      maxTokenAge: "5m",
    });
    return payload.repository === REPOSITORY &&
      String(payload.repository_id) === "1219099137" &&
      payload.ref === BRANCH &&
      payload.workflow_ref === WORKFLOW &&
      payload.event_name === "push" &&
      payload.sub === "repo:" + REPOSITORY + ":ref:" + BRANCH &&
      typeof payload.run_id === "string";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return stopped("method_not_allowed", 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (url !== SANDBOX_URL || !serviceKey || !anonKey) {
    return stopped("wrong_project_or_missing_config", 503);
  }
  if (!(await verifiedGithubOIDC(req))) return stopped("oidc_required", 401);
  const text = await req.text();
  if (text.length > 128) return stopped("invalid_body", 400);
  let mode: "preflight" | "run";
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || !("mode" in body) ||
        (body.mode !== "preflight" && body.mode !== "run")) {
      return stopped("invalid_mode", 400);
    }
    mode = body.mode as "preflight" | "run";
  } catch {
    return stopped("invalid_json", 400);
  }

  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(url, serviceKey, options);
  const publicClient = () => createClient(url, anonKey, options);
  const roster = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (roster.error || !roster.data) return stopped("cannot_inspect_users", 503);
  const users = roster.data.users;
  const alreadyStarted = users.some((user) =>
    STUDENTS.some((student) => user.email?.toLowerCase() === student.email));
  if (alreadyStarted) return stopped("already_started_review_required", 409);
  if (users.length !== 2 || !users.every((user) =>
    PREVIOUS_EMAILS.has(user.email?.toLowerCase() ?? "") &&
    user.app_metadata?.schoolnet_sandbox === true)) {
    return stopped("unexpected_sandbox_roster", 409);
  }
  if (mode === "preflight") {
    return respond(200, {
      ok: true, mode, sandbox_only: true,
      previously_created_test_accounts: 2, new_test_accounts: 0,
    });
  }

  let stage = "start";
  try {
    const accountIds: string[] = [];
    const passwords: string[] = [];
    for (let i = 0; i < STUDENTS.length; i++) {
      const person = STUDENTS[i];
      stage = "generate_invite_" + person.label;
      const invite = await admin.auth.admin.generateLink({
        type: "invite",
        email: person.email,
      });
      const userId = invite.data?.user?.id;
      const tokenHash = invite.data?.properties?.hashed_token;
      if (invite.error || !userId || !tokenHash ||
          invite.data?.user?.email?.toLowerCase() !== person.email ||
          invite.data?.properties?.verification_type !== "invite") {
        return stopped(stage);
      }
      accountIds.push(userId);

      stage = "mark_sandbox_user_" + person.label;
      const marked = await admin.auth.admin.updateUserById(userId, {
        app_metadata: {
          schoolnet_sandbox: true,
          schoolnet_sandbox_student_b2b: true,
          test_stage: "B2B",
          shared_family_phone_test: DUMMY_SHARED_PHONE,
        },
      });
      if (marked.error || marked.data?.user?.id !== userId) return stopped(stage);

      stage = "consume_invite_" + person.label;
      const invitationClient = publicClient();
      const consumed = await invitationClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });
      if (consumed.error || !consumed.data?.session ||
          consumed.data?.user?.id !== userId) return stopped(stage);

      stage = "choose_password_" + person.label;
      const secret = randomPassword();
      const changed = await invitationClient.auth.updateUser({ password: secret });
      if (changed.error || changed.data?.user?.id !== userId) return stopped(stage);
      passwords.push(secret);

      stage = "close_invitation_session_" + person.label;
      const closed = await invitationClient.auth.signOut();
      if (closed.error) return stopped(stage);

      stage = "reject_invitation_replay_" + person.label;
      const replay = await publicClient().auth.verifyOtp({
        token_hash: tokenHash,
        type: "invite",
      });
      if (!replay.error || replay.data.session) return stopped(stage);
    }

    stage = "reject_wrong_password";
    const wrong = await publicClient().auth.signInWithPassword({
      email: STUDENTS[0].email,
      password: "DefinitelyIncorrect7!",
    });
    if (!wrong.error || wrong.data.session) return stopped(stage);

    stage = "distinct_password_logins";
    const sessions = await Promise.all(STUDENTS.map((person, index) =>
      publicClient().auth.signInWithPassword({
        email: person.email, password: passwords[index],
      })));
    if (sessions.some((res, i) =>
      Boolean(res.error) || !res.data.session || res.data.user?.id !== accountIds[i])) {
      return stopped(stage);
    }
    if (accountIds[0] === accountIds[1] ||
        sessions[0].data.session!.access_token === sessions[1].data.session!.access_token) {
      return stopped("sessions_not_distinct");
    }

    stage = "validate_sessions_with_auth";
    const [sessionA, sessionB] = await Promise.all(sessions.map((res) =>
      admin.auth.getUser(res.data.session!.access_token)));
    if (sessionA.error || sessionB.error ||
        sessionA.data.user?.id !== accountIds[0] ||
        sessionB.data.user?.id !== accountIds[1]) return stopped(stage);

    stage = "recovery_without_email";
    const recovery = await admin.auth.admin.generateLink({
      type: "recovery", email: STUDENTS[0].email,
    });
    const recoveryHash = recovery.data?.properties?.hashed_token;
    if (recovery.error || !recoveryHash ||
        recovery.data?.properties?.verification_type !== "recovery") return stopped(stage);

    stage = "consume_recovery";
    const resetClient = publicClient();
    const recovered = await resetClient.auth.verifyOtp({
      token_hash: recoveryHash,
      type: "recovery",
    });
    if (recovered.error || recovered.data.user?.id !== accountIds[0] ||
        !recovered.data.session) return stopped(stage);

    stage = "change_password_after_recovery";
    const freshPassword = randomPassword();
    const reset = await resetClient.auth.updateUser({ password: freshPassword });
    if (reset.error || reset.data.user?.id !== accountIds[0]) return stopped(stage);
    await resetClient.auth.signOut();

    stage = "reject_recovery_replay";
    const secondRecovery = await publicClient().auth.verifyOtp({
      token_hash: recoveryHash, type: "recovery",
    });
    if (!secondRecovery.error && secondRecovery.data.session) return stopped(stage);

    stage = "reject_old_password";
    const oldPasswordLogin = await publicClient().auth.signInWithPassword({
      email: STUDENTS[0].email, password: passwords[0],
    });
    if (!oldPasswordLogin.error || oldPasswordLogin.data.session) return stopped(stage);

    stage = "accept_new_password";
    const newPasswordLogin = await publicClient().auth.signInWithPassword({
      email: STUDENTS[0].email, password: freshPassword,
    });
    if (newPasswordLogin.error || newPasswordLogin.data.user?.id !== accountIds[0] ||
        !newPasswordLogin.data.session) return stopped(stage);

    stage = "other_student_still_connects";
    const secondStudentLogin = await publicClient().auth.signInWithPassword({
      email: STUDENTS[1].email, password: passwords[1],
    });
    if (secondStudentLogin.error || secondStudentLogin.data.user?.id !== accountIds[1] ||
        !secondStudentLogin.data.session) return stopped(stage);

    stage = "auth_phone_unset_and_metadata";
    const [userA, userB] = await Promise.all(accountIds.map((id) =>
      admin.auth.admin.getUserById(id)));
    if (userA.error || userB.error ||
        [userA, userB].some((r, i) =>
          r.data.user?.id !== accountIds[i] ||
          r.data.user?.app_metadata?.schoolnet_sandbox_student_b2b !== true ||
          r.data.user?.app_metadata?.shared_family_phone_test !== DUMMY_SHARED_PHONE ||
          Boolean(r.data.user?.phone))) return stopped(stage);

    return respond(200, {
      ok: true, mode: "run", sandbox_only: true,
      new_test_accounts: 2,
      two_distinct_auth_identities: true,
      shared_contact_not_auth_phone: true,
      invite_generated_without_sending_email: true,
      invite_consumed: true,
      invite_replay_rejected: true,
      password_logins_independent: true,
      wrong_password_rejected: true,
      sessions_verified_by_auth: true,
      recovery_generated_without_sending_email: true,
      recovery_consumed: true,
      recovery_replay_rejected: true,
      old_password_rejected: true,
      new_password_accepted: true,
      second_student_unaffected: true,
      production_untouched_by_function: true,
      family_linking_not_tested: true,
    });
  } catch {
    return stopped(stage, 500);
  }
});
