// SCHOOLNET 5.C-B.2 B.3 -- SANDBOX-ONLY endpoint now disabled.
// The single-use authenticated test ran successfully; remove the capability
// to create accounts / generate recovery links from the deployed function.
// Any future B.3 execution requires a fresh authorization and a new review.
Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, stage: "b3_completed_disabled" }), {
    status: 410,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
);
