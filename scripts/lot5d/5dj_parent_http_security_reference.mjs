// SCHOOLNET Lot 5D-J — AUTH/SESSION/RATE-LIMIT contract in ISOLATED HTTP fixtures.
// NOT an Edge Function. No Supabase provider URL, no real JWT or production key.
// Requires separate Auth/session adapter implementation before any real deploy.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set(["current", "unassigned", "unavailable", "conflict"]);
const fail = (status) => ({status, body:{ok:false,message:"Lecture indisponible."}});

function fixtureEnabled(config) {
  if(config?.mode!=="loopback-fixture" || config?.enabled!==true ||
     config?.allowedOrigin!=="https://schoolnet-test.invalid") return false;
  try {
    const u=new URL(config.baseUrl);
    return u.protocol==="http:" && u.hostname==="127.0.0.1" &&
      !!u.port && (u.pathname==="/" || u.pathname==="") &&
      u.username==="" && u.password==="";
  } catch {return false;}
}

export function makeIsolatedParentGateway(config, deps) {
  return async (req) => {
    if(!fixtureEnabled(config)) return fail(503);
    if(req?.origin!==config.allowedOrigin) return fail(403);
    if(req?.method!=="POST" || req?.contentType!=="application/json")
      return fail(405);
    const body=req?.body;
    if(!body || typeof body!=="object" || Array.isArray(body) ||
       Object.keys(body).length!==1 || body.action!=="list_current_classes")
      return fail(400);
    const bearer=req.authorization;
    if(typeof bearer!=="string" || !/^Bearer [a-zA-Z0-9._-]+$/.test(bearer))
      return fail(401);
    const mandatory=["getAuthIdentity","getLiveSession","getRateLimit",
      "getConfirmedRole","readAuthorizedAnnualClasses"];
    if(mandatory.some(k=>typeof deps?.[k]!=="function")) return fail(503);

    let identity;
    try {identity=await deps.getAuthIdentity(bearer.slice(7));}
    catch {return fail(401);}
    if(identity?.verified!==true || !UUID.test(identity.userId??"") ||
       !UUID.test(identity.sessionId??"")) return fail(401);

    // Auth.getUser confirms user identity, NOT immediate session liveness.
    let session;
    try {session=await deps.getLiveSession(identity.userId,identity.sessionId);}
    catch {return fail(503);}
    if(session?.present!==true || session.active!==true ||
       session.revoked===true || session.userId!==identity.userId ||
       session.sessionId!==identity.sessionId ||
       (session.notAfterMs!=null &&
         (!Number.isFinite(session.notAfterMs) || session.notAfterMs<=Date.now())))
      return fail(401);

    let limit;
    try {limit=await deps.getRateLimit(identity.userId,identity.sessionId);}
    catch {return fail(503);}
    if(limit?.allowed!==true) return fail(429);

    let role;
    try {role=await deps.getConfirmedRole(identity.userId);}
    catch {return fail(503);}
    if(role!=="parent") return fail(403);

    let data;
    try {data=await deps.readAuthorizedAnnualClasses(identity.userId);}
    catch {return fail(503);}
    if(data==null || !Array.isArray(data.children) || data.children.length>100 ||
       !(typeof data.schoolYearId==="string" || data.schoolYearId===null))
      return fail(503);
    const children=[];
    for(const item of data.children) {
      if(!UUID.test(item?.studentId??"") || !STATES.has(item?.state) ||
         !(typeof item.className==="string" || item.className===null))
        return fail(503);
      // Do not leak any additional property supplied by a faulty adapter.
      children.push({student_id:item.studentId,state:item.state,
        class_name:item.state==="current"?item.className:null});
    }
    return {status:200,body:{ok:true,school_year_id:data.schoolYearId,children}};
  };
}

// HTTP transport is deliberately restricted to 127.0.0.1. This is not
// the Supabase Auth API contract, only a miniature test provider.
export function makeLoopbackAuthTransport(baseUrl, fetcher=fetch) {
  if(!fixtureEnabled({mode:"loopback-fixture",enabled:true,
    allowedOrigin:"https://schoolnet-test.invalid",baseUrl}))
    throw new Error("refuse_non_loopback");
  const root=baseUrl.replace(/\/$/,"");
  async function get(path, bearer) {
    const r=await fetcher(root+path,{method:"GET",
      headers:{authorization:"Bearer "+bearer},redirect:"error",
      signal:AbortSignal.timeout(2500)});
    if(!r.ok) throw new Error("fixture_http_unavailable");
    return await r.json();
  }
  return {
    getAuthIdentity: async(token)=>get("/auth/v1/user",token),
    getLiveSession: async(userId,sessionId)=>
      get("/_fixture/session?user="+encodeURIComponent(userId)+
        "&session="+encodeURIComponent(sessionId),"fixture"),
    getRateLimit: async(userId,sessionId)=>
      get("/_fixture/rate?user="+encodeURIComponent(userId)+
        "&session="+encodeURIComponent(sessionId),"fixture"),
    getConfirmedRole: async(userId)=>
      (await get("/_fixture/profile?user="+encodeURIComponent(userId),"fixture")).role,
  };
}
