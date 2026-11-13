// SCHOOLNET — Lot 5.C-B.2 / 2.D — sandbox Auth backend (pure/testable logic).
// The password is handled exclusively by Supabase Auth; it never reaches SQL.
// No log of phone, code, password, IP, Auth alias or sessions.
import { normalizeSchoolnetFamilyPhone, normalizeSchoolnetStudentCode, studentCodeLookupDigest } from "./schoolnetStudentIdentity.ts";

export type LoginOutcome = "rate_limited" | "denied" | "authenticated" | "server_error";
export type LoginGate = { rateAllowed: boolean; userId: string | null };
export type LoginSession = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};
export type LoginDeps = {
  gate(input: {phone: string; codeHmac: string; phoneHmac: string; ipHmac: string}): Promise<LoginGate>;
  getAuthUser(userId: string): Promise<{email: string | null; sandboxStudent: boolean} | null>;
  signIn(email: string, password: string): Promise<LoginSession | null>;
  verifyAccess(accessToken: string): Promise<string | null>;
  isEnabled(userId: string, phone: string, codeHmac: string): Promise<boolean>;
  audit(outcome: LoginOutcome): Promise<void>;
};
export type LoginResult = {status: number; body: Record<string, unknown>};

const INVALID_CREDENTIALS = "Identifiants ou mot de passe incorrects.";
const UNAVAILABLE = "Connexion momentanement indisponible.";
const DUMMY_ALIAS = "schoolnet-student-nonexistent-b2d@schoolnet.invalid";
const TEST_ALIAS = /^schoolnet-b2b-student-0[12]@schoolnet\.invalid$/;

function response(status: number, message: string): LoginResult {
  return {status,body:{ok:false,message}};
}

export async function privateBucketHmac(
  namespace: "phone" | "ip", value: string, pepper: string,
): Promise<string> {
  if (typeof pepper !== "string" || new TextEncoder().encode(pepper).length < 32) {
    throw new Error("Missing server login secret");
  }
  const key = await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(pepper),{name:"HMAC",hash:"SHA-256"},false,["sign"],
  );
  const data = new TextEncoder().encode(`schoolnet/student-login/${namespace}/v1:${value}`);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC",key,data));
  return Array.from(signed,v=>v.toString(16).padStart(2,"0")).join("");
}

export async function runSandboxStudentLogin(
  input: unknown, trustedIp: string, pepper: string, deps: LoginDeps,
): Promise<LoginResult> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      !trustedIp || typeof trustedIp !== "string" || trustedIp.length > 128 ||
      typeof pepper !== "string" || new TextEncoder().encode(pepper).length < 32) {
    return response(503, UNAVAILABLE);
  }
  const obj = input as Record<string, unknown>;
  if (Object.keys(obj).sort().join(",") !== "password,phone,studentCode" ||
      typeof obj.phone !== "string" || typeof obj.studentCode !== "string" ||
      typeof obj.password !== "string" || !obj.password || obj.password.length > 256) {
    return response(400, "Requete invalide.");
  }

  let phone: string, code: string;
  try {
    phone = normalizeSchoolnetFamilyPhone(obj.phone);
    code = normalizeSchoolnetStudentCode(obj.studentCode);
  } catch {
    return response(401, INVALID_CREDENTIALS);
  }

  try {
    const [codeHmac,phoneHmac,ipHmac] = await Promise.all([
      studentCodeLookupDigest(code,pepper),
      privateBucketHmac("phone",phone,pepper),
      privateBucketHmac("ip",trustedIp,pepper),
    ]);
    const gate = await deps.gate({phone,codeHmac,phoneHmac,ipHmac});
    if (!gate.rateAllowed) {
      await deps.audit("rate_limited");
      return response(429,"Trop de tentatives. Reessayez plus tard.");
    }

    // A dummy signIn attempt keeps unknown codes on the same Auth path.
    const profile = gate.userId ? await deps.getAuthUser(gate.userId) : null;
    const trustedAlias = profile?.sandboxStudent === true && profile.email &&
      TEST_ALIAS.test(profile.email) ? profile.email : null;
    const session = await deps.signIn(trustedAlias || DUMMY_ALIAS,obj.password);
    if (!gate.userId || !trustedAlias || !session || session.userId !== gate.userId) {
      await deps.audit("denied");
      return response(401,INVALID_CREDENTIALS);
    }
    if (await deps.verifyAccess(session.accessToken) !== gate.userId ||
        !(await deps.isEnabled(gate.userId,phone,codeHmac))) {
      await deps.audit("denied");
      return response(401,INVALID_CREDENTIALS);
    }
    await deps.audit("authenticated");
    return {status:200,body:{
      ok:true,access_token:session.accessToken,refresh_token:session.refreshToken,
      token_type:"bearer",expires_in:session.expiresIn,
    }};
  } catch {
    // Never echo raw PostgREST, Auth or secret-related exceptions to callers.
    try { await deps.audit("server_error"); } catch { /* security audit unavailable */ }
    return response(503,UNAVAILABLE);
  }
}
