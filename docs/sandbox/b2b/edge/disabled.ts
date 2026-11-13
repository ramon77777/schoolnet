// SCHOOLNET 5.C-B.2 - Test sandbox B2B neutralise apres recette.
// Aucune lecture de secret ni capacite de creation, invitation ou connexion.
Deno.serve(() => new Response(
  JSON.stringify({ok:false, stage:"b2b_completed_disabled"}),
  {status:410, headers:{"content-type":"application/json; charset=utf-8", "cache-control":"no-store"}},
));
