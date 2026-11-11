// SCHOOLNET — Lot 5.C-B.2: garde de compilation sans effet de bord.
// Verifie statiquement que le build n'est pas lance si l'un des verrous
// d'invitations familiales est retire par inadvertance.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edge = readFileSync("supabase/functions/schoolnet-family-invitation/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const preflight = readFileSync(
  "src/features/enrollments/components/AdminEnrollmentRequestPreflight.tsx",
  "utf8",
);

assert.match(edge, /const READ_ONLY_DEPLOYMENT = true;/, "Le verrou permanent doit rester actif.");
assert.match(
  edge,
  /const enabled = !READ_ONLY_DEPLOYMENT &&/,
  "Le flag d'environnement ne peut pas contourner le verrou permanent.",
);
assert.match(edge, /pilotRequestId !== requestId\.toLowerCase\(\)/, "Le dossier pilote doit etre borne par le serveur.");
assert.match(edge, /pilotRecipient !== recipient/, "Le destinataire pilote doit etre borne par le serveur.");
assert.match(
  edge,
  /origin === LOCAL_INSPECT_ORIGIN && action !== "inspect"/,
  "Le navigateur local ne doit jamais effectuer d'ecriture.",
);
assert.match(
  config,
  /\[functions\.schoolnet-family-invitation\][\s\S]*?verify_jwt = true/,
  "La verification du JWT doit etre explicite dans config.toml.",
);
assert.doesNotMatch(
  preflight,
  /\b(?:prepareFamilyInvitation|retryFamilyInvitation|flagStaleFamilyInvitation)\s*\(/,
  "Aucun bouton de mutation ne doit etre raccorde dans le panneau de preflight.",
);
