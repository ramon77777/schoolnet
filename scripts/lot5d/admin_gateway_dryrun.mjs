// SCHOOLNET LOT 5D-E | TEST-ONLY ADMIN GATEWAY REFERENCE.
// NEVER import this file in src/ or supabase/functions/.
// NO HTTP SERVER, NO Supabase client, NO real network, NO SQL driver.
// Uses injected mocks only. NOT a production authentication implementation.
import { inspectLot5dGatewayContract } from "./admin_gateway_contract_mock.mjs";

const denied = (code) => Object.freeze({ok:false,code});
const serverOperations = Object.freeze({
  decision: "schoolnet_private.save_lot5d_legacy_decision",
  finalize: "schoolnet_private.finalize_lot5d_legacy_year",
});

/**
 * @param {object} adapters - all functions supplied by offline tests.
 * @returns sandbox handler, NOT an HTTP handler, never registered as a route.
 */
export function createLot5dSandboxGateway(adapters = {}) {
  const {
    config, verifyAuthToken, findProfileById, mockDbTransaction,
  } = adapters;

  return async function inspectSandboxOperation(request) {
    // Fail closed BEFORE parsing any untrusted request or contacting adapters.
    if (!config || config.mode !== "isolated_fixture" ||
        config.explicitlyEnabled !== true) return denied("locked");
    if (config.dbHost !== "127.0.0.1" ||
        config.dbName !== "schoolnet_lot5d_ci" ||
        typeof config.sandboxOrigin !== "string" ||
        !config.sandboxOrigin.endsWith(".invalid")) return denied("not_isolated");

    if (typeof verifyAuthToken !== "function" ||
        typeof findProfileById !== "function" ||
        typeof mockDbTransaction !== "function") return denied("missing_mock_adapter");

    // This is only a format check. Real implementation MUST call Auth getUser,
    // check the session server-side, and use a DB role with least privilege.
    if (typeof request?.authorization !== "string" ||
        !/^Bearer [^\s]+$/.test(request.authorization)) return denied("missing_bearer");

    let verified;
    try {
      verified=await verifyAuthToken(request.authorization.slice("Bearer ".length));
    } catch {
      return denied("auth_unavailable");
    }
    if (!verified || verified.authoritativelyVerified !== true ||
        typeof verified.userId !== "string" ||
        typeof verified.sessionId !== "string") return denied("unverified_session");

    let dbProfile;
    try {
      dbProfile=await findProfileById(verified.userId);
    } catch {
      return denied("profile_unavailable");
    }
    const contract=inspectLot5dGatewayContract(request,{
      ...config,
      sessionVerifiedByAuth:verified.authoritativelyVerified === true,
      authUserId:verified.userId,
      sessionId:verified.sessionId,
      dbProfileId:dbProfile?.id,
      dbConfirmedRole:dbProfile?.role,
    });
    if (!contract.ok) return contract;

    // The server owns the mapping. The request cannot choose SQL function,
    // actor ID, database name, or any privileged role.
    const functionName=serverOperations[contract.action];
    if (!functionName) return denied("unknown_action");

    try {
      const result=await mockDbTransaction({
        functionName,
        actorId:contract.actorId,
        args: contract.action==="decision"
          ? {
            sourceYearId:contract.sourceYearId,
            targetYearId:contract.targetYearId,
            studentId:contract.studentId,
            decision:contract.decision,
            targetClassId:contract.targetClassId,
            note:contract.note,
          }
          : {
            sourceYearId:contract.sourceYearId,
            targetYearId:contract.targetYearId,
            confirmation:contract.confirmation,
            operationId:contract.operationId,
          },
      });
      // Do not return arbitrary DB payloads; this is intentionally minimal.
      if (!result || result.ok !== true) return denied("transaction_unconfirmed");
      return Object.freeze({ok:true,action:contract.action,confirmed:true});
    } catch {
      return denied("transaction_failed");
    }
  };
}
