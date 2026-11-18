// SCHOOLNET 5D-D: REFERENCE DE CONTRAT, PAS UN BACKEND.
// Never imported into Vite or any Supabase Edge Function.
// ZERO network requests and ZERO writes. No production origin enabled.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = (code) => Object.freeze({ ok: false, code });
const isUUID = (value) => typeof value === "string" && UUID.test(value) && value !== "00000000-0000-0000-0000-000000000000";
const safeKeys = (body, names) =>
  body && typeof body === "object" && !Array.isArray(body) &&
  Object.keys(body).every((key) => names.has(key)) &&
  Object.getPrototypeOf(body) === Object.prototype;

/**
 * Pure sandbox reference for security requirements, never a real authorization engine.
 * The server object must be independently verified with server Auth + profile lookup.
 * A browser-provided object must NEVER be treated as a trusted server object.
 */
export function inspectLot5dGatewayContract(request, server) {
  if (server?.mode !== "isolated_fixture" || server?.explicitlyEnabled !== true)
    return DENIED("locked");
  if (server?.dbName !== "schoolnet_lot5d_ci" || server?.dbHost !== "127.0.0.1")
    return DENIED("not_isolated");
  if (request?.method !== "POST" || request?.contentType !== "application/json")
    return DENIED("request_format");
  if (typeof server?.sandboxOrigin !== "string" ||
      !server.sandboxOrigin.endsWith(".invalid") ||
      request.origin !== server.sandboxOrigin)
    return DENIED("untrusted_origin");
  if (typeof request?.authorization !== "string" ||
      !/^Bearer [^\s]+$/.test(request.authorization))
    return DENIED("missing_bearer");
  if (server?.sessionVerifiedByAuth !== true || !isUUID(server?.authUserId) ||
      !isUUID(server?.sessionId))
    return DENIED("unverified_session");
  if (server?.dbConfirmedRole !== "admin" || server?.dbProfileId !== server.authUserId)
    return DENIED("not_global_admin");

  const body = request.body;
  const common = new Set(["action", "sourceYearId", "targetYearId"]);
  const action = body?.action;
  if (action === "finalize") {
    const allowed = new Set([...common, "confirmation", "operationId"]);
    if (!safeKeys(body, allowed) || !isUUID(body.sourceYearId) ||
        !isUUID(body.targetYearId) || body.sourceYearId === body.targetYearId ||
        !isUUID(body.operationId) || typeof body.confirmation !== "string" ||
        !/^\d{4}-\d{4}$/.test(body.confirmation))
      return DENIED("payload");
    return Object.freeze({
      ok: true, action, actorId: server.authUserId,
      sourceYearId: body.sourceYearId, targetYearId: body.targetYearId,
      confirmation: body.confirmation, operationId: body.operationId
    });
  }
  if (action === "decision") {
    const allowed = new Set([...common, "studentId", "decision", "targetClassId", "note"]);
    if (!safeKeys(body, allowed) || !isUUID(body.sourceYearId) ||
        !isUUID(body.targetYearId) || body.sourceYearId === body.targetYearId ||
        !isUUID(body.studentId) ||
        !["pending", "repeat", "re_enroll", "leave"].includes(body.decision) ||
        (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 1000)))
      return DENIED("payload");
    const requiresClass = ["repeat", "re_enroll"].includes(body.decision);
    if ((requiresClass && !isUUID(body.targetClassId)) ||
        (!requiresClass && body.targetClassId !== null && body.targetClassId !== undefined))
      return DENIED("decision_class");
    return Object.freeze({
      ok: true, action, actorId: server.authUserId,
      sourceYearId: body.sourceYearId, targetYearId: body.targetYearId,
      studentId: body.studentId, decision: body.decision,
      targetClassId: requiresClass ? body.targetClassId : null,
      note: body.note ?? null
    });
  }
  return DENIED("unknown_action");
}
