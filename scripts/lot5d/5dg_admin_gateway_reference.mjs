// SCHOOLNET 5D-G - CONTRACT-ONLY ADMIN GATEWAY (offline, disposable fixture).
// NO HTTP endpoint, NO Supabase client, NO SQL driver, NO network, NO secrets.
// NEVER import from src/ or supabase/functions/. Do NOT deploy this module.
// Server adapters here are fake by design; this is NOT real authentication.
import {inspectLot5dGatewayContract} from "./admin_gateway_contract_mock.mjs";

const deny=(code)=>Object.freeze({ok:false,code});
const methods=Object.freeze({
  finalize:"schoolnet_private.finalize_lot5d_legacy_year",
  decision:"schoolnet_private.save_lot5d_legacy_decision",
});

/** Build a fail-closed REFERENCE using explicit fake adapter functions only. */
export function createLot5dgOfflineAdminGateway({
  config,verifyAuthToken,verifyLiveSession,lookupAdminProfile,
  consumeRateLimit,loadPreflight,runMockTransaction,
}={}){
 return async function evaluateOfflineRequest(request){
  // Validation before adapter calls, cannot be turned on outside fixture.
  if(config?.mode!=="isolated_fixture"||config?.explicitlyEnabled!==true)
   return deny("disabled");
  if(config.dbName!=="schoolnet_lot5d_ci"||
     config.dbHost!=="127.0.0.1"||
     typeof config.sandboxOrigin!=="string"||
     !config.sandboxOrigin.endsWith(".invalid"))
   return deny("not_isolated");
  if([verifyAuthToken,verifyLiveSession,lookupAdminProfile,consumeRateLimit,
      loadPreflight,runMockTransaction].some(x=>typeof x!=="function"))
   return deny("missing_adapter");
  if(request?.method!=="POST"||request?.contentType!=="application/json")
   return deny("request_format");
  if(request?.origin!==config.sandboxOrigin)
   return deny("untrusted_origin");
  if(typeof request?.authorization!=="string"||
     !/^Bearer [^\s]+$/.test(request.authorization))
   return deny("missing_bearer");
  let user;
  try {
   user=await verifyAuthToken(request.authorization.slice(7));
  } catch {
   return deny("auth_unavailable");
  }
  if(user?.authoritativelyVerified!==true||!user.userId||!user.sessionId)
   return deny("unverified_session");

  let session;
  try {session=await verifyLiveSession(user.userId,user.sessionId);}
  catch {return deny("session_unavailable");}
  if(session?.active!==true||session?.revoked===true||
     session?.userId!==user.userId||session?.sessionId!==user.sessionId)
   return deny("session_inactive");

  let profile;
  try {profile=await lookupAdminProfile(user.userId);}
  catch {return deny("profile_unavailable");}
  const contract=inspectLot5dGatewayContract(request,{
   ...config,
   sessionVerifiedByAuth:true,authUserId:user.userId,
   sessionId:user.sessionId,
   dbProfileId:profile?.id,
   dbConfirmedRole:profile?.role,
  });
  if(!contract.ok)return contract;

  let limit;
  try {
   limit=await consumeRateLimit({
    actorId:user.userId,sessionId:user.sessionId,action:contract.action,
   });
  } catch {return deny("rate_limit_unavailable");}
  if(limit?.allowed!==true)return deny("rate_limited");

  // The authoritative preflight is SERVER-OWNED, never from browser payload.
  let preflight;
  try {
   preflight=await loadPreflight({
    actorId:user.userId,sourceYearId:contract.sourceYearId,
    targetYearId:contract.targetYearId,
    action:contract.action,
   });
  }catch{return deny("preflight_unavailable");}
  if(preflight?.allowed!==true||
    preflight?.sourceYearId!==contract.sourceYearId||
    preflight?.targetYearId!==contract.targetYearId||
    preflight?.sourceCurrent!==true||
    preflight?.targetEnrollmentCount!==0||
    preflight?.historicalIntegrity!==true||
    (contract.action==="finalize"&&preflight?.decisionsComplete!==true))
   return deny("preflight_blocked");

  // Only server mapping determines privileged operation, actor and context.
  const functionName=methods[contract.action];
  if(!functionName)return deny("unknown_action");
  let response;
  try {
   response=await runMockTransaction({
    functionName,actorId:user.userId,sessionId:user.sessionId,
    action:contract.action,sourceYearId:contract.sourceYearId,
    targetYearId:contract.targetYearId,
    args:contract.action==="finalize"?{
      confirmation:contract.confirmation,operationId:contract.operationId,
    }:{
      studentId:contract.studentId,decision:contract.decision,
      targetClassId:contract.targetClassId,note:contract.note,
    },
   });
  }catch{return deny("transaction_failed");}
  if(response?.committed!==true||response?.auditPersisted!==true||
     (contract.action==="finalize"&&response?.operationId!==contract.operationId))
   return deny("transaction_unconfirmed");
  // Never return row data, raw SQL errors, session IDs, or secrets.
  return Object.freeze({ok:true,action:contract.action,confirmed:true});
 };
}
