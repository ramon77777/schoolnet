/**
 * SCHOOLNET 5D-L — fail-closed Parent session gate (no SQL or network here).
 * A Supabase Auth server adapter validates the access token BEFORE its
 * session_id claim is inspected. Client-provided IDs/roles are never used.
 * Quota/session status MUST come from a service-only PostgreSQL RPC.
 */
export type ParentGateStatus =
  | "authorized"
  | "session_denied"
  | "role_denied"
  | "rate_limited";

export type ParentGateResult = {
  allowed: boolean;
  status: 200 | 401 | 403 | 429 | 503;
  actorId: string | null;
};

type VerifiedIdentity = {id: string} | null;
type ParentSessionGateAdapters = {
  verifyAuthUser: (token: string) => Promise<VerifiedIdentity>;
  checkSessionAndRate: (actorId: string, sessionId: string) => Promise<ParentGateStatus>;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const B64=/^[A-Za-z0-9_-]+$/;

/** Decode claims only AFTER getUser verified the exact supplied bearer. */
function readVerifiedJwtSession(token: string, actorId: string, nowMs: number) {
  if (token.length > 8192 || token.length < 30) return null;
  const parts=token.split(".");
  if (parts.length!==3 || parts.some((s) => !B64.test(s))) return null;
  try {
    const b64=parts[1].replace(/-/g,"+").replace(/_/g,"/");
    const padded=b64.padEnd(Math.ceil(b64.length/4)*4,"=");
    const value=JSON.parse(atob(padded));
    if (!value || typeof value!=="object" ||
        value.sub!==actorId || value.role!=="authenticated" ||
        !UUID.test(value.session_id ?? "") ||
        typeof value.exp!=="number" ||
        !Number.isSafeInteger(value.exp) ||
        value.exp*1000<=nowMs ||
        (value.iat!=null &&
          (typeof value.iat!=="number" || value.iat*1000>nowMs+30000)))
      return null;
    return value.session_id as string;
  } catch {return null;}
}

export async function authorizeParentSession(
  token: string,
  adapters: ParentSessionGateAdapters,
  nowMs=Date.now(),
): Promise<ParentGateResult> {
  const denied=(status: ParentGateResult["status"]):ParentGateResult=>({
    allowed:false,status,actorId:null,
  });
  if (!token || !adapters || !Number.isFinite(nowMs) ||
      typeof adapters.verifyAuthUser!=="function" ||
      typeof adapters.checkSessionAndRate!=="function")
    return denied(503);
  let user:VerifiedIdentity;
  try {user=await adapters.verifyAuthUser(token);}
  catch {return denied(401);}
  if (!user || !UUID.test(user.id)) return denied(401);
  const sessionId=readVerifiedJwtSession(token,user.id,nowMs);
  if (!sessionId) return denied(401);
  let outcome:ParentGateStatus;
  try {outcome=await adapters.checkSessionAndRate(user.id,sessionId);}
  catch {return denied(503);}
  if (outcome==="session_denied") return denied(401);
  if (outcome==="role_denied") return denied(403);
  if (outcome==="rate_limited") return denied(429);
  if (outcome!=="authorized") return denied(503);
  return {allowed:true,status:200,actorId:user.id};
}
