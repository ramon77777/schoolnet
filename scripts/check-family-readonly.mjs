// SCHOOLNET — Garde de publication des invitations familiales.
// Aucune requête réseau ou écriture. Assertions statiques avant build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const edge = readFileSync("supabase/functions/schoolnet-family-invitation/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const manager = readFileSync(
  "src/features/enrollments/components/AdminFamilyInvitationManager.tsx",
  "utf8",
);
const sql = readFileSync(
  "supabase/proposals/20261112_family_password_auth_hook_proof.sql",
  "utf8",
);

assert.match(edge, /const READ_ONLY_DEPLOYMENT = false;/,
  "Le code doit correspondre au parcours autorisé, pas à l'ancienne version consultative.");
assert.match(edge, /Deno\.env\.get\("SCHOOLNET_FAMILY_INVITES_ENABLED"\) !== "false"/,
  "L'arrêt d'urgence par variable serveur doit rester possible.");
assert.match(edge, /url !== PRODUCTION_PROJECT_URL/,
  "Les opérations doivent être limitées au projet Supabase officiel.");
assert.match(edge, /const PRODUCTION_PROJECT_URL = "https:\/\/anttmbhaphkhmkoqsofd\.supabase\.co";/,
  "Le projet principal doit être explicitement vérifié côté serveur.");
assert.match(edge, /action !== "inspect" && origin !== PRODUCTION_ORIGIN/,
  "Toute mutation doit être refusée hors origine de production.");
assert.match(edge, /callerProfile\?\.role !== "admin"/,
  "Le rôle de Super Administrateur doit être vérifié en base.");
assert.match(edge, /service\.auth\.getUser\(authHeader\.slice\(7\)\)/,
  "Le JWT doit être vérifié par Supabase Auth.");
assert.match(edge, /Deno\.env\.get\("SCHOOLNET_FAMILY_PILOT_REQUEST_ID"\)/,
  "Le verrou facultatif de demande pilote doit être conservé.");
assert.match(edge, /Deno\.env\.get\("SCHOOLNET_FAMILY_PILOT_RECIPIENT"\)/,
  "Le verrou facultatif de destinataire pilote doit être conservé.");
assert.match(edge, /\.from\("schoolnet_family_invitation_records"\)/,
  "Le registre et les transitions CAS ne doivent pas être contournés.");
assert.match(edge, /advance\("prepared", "sent_declared"/,
  "Déclaration d'envoi distincte obligatoire.");
assert.match(edge, /advance\("sent_declared", "activated"\)/,
  "L'activation requiert une transition serveur spécifique.");
assert.match(edge, /schoolnet_family_password_session_proof/,
  "L'activation exige une preuve JWT password corrélée à une vraie session.");
assert.match(edge, /type: "invite", email, options: \{ redirectTo \}/,
  "Les comptes nouveaux doivent recevoir un lien Supabase temporaire sans mail automatique.");
assert.match(edge, /schoolnet_family_invitation: true/,
  "Le marqueur de preuve Auth doit rester dans app_metadata géré par le serveur.");
assert.doesNotMatch(edge, /auth\.admin\.deleteUser/,
  "Ne jamais supprimer automatiquement un compte Auth pour effacer un incident.");
assert.doesNotMatch(edge, /sendEmail\(|sendMail\(/,
  "Aucun envoi d'e-mail à l'insu de l'administrateur.");
assert.match(config, /\[functions\.schoolnet-family-invitation\][\s\S]*?verify_jwt = true/,
  "La vérification JWT côté Supabase Edge doit rester active.");
assert.match(manager, /confirmFamilyInvitationActivation\(/,
  "L'interface doit proposer une confirmation sécurisée après preuve Auth.");
assert.match(manager, /declareFamilyInvitationSent\(/,
  "La transmission doit être déclarée séparément.");
assert.match(sql, /SECURITY INVOKER/,
  "Le hook Auth doit être sans élévation de privilège.");
assert.match(sql, /schoolnet_family_password_session_proof/,
  "La preuve de session doit être disponible avant de confirmer l'activation.");
assert.doesNotMatch(sql, /GRANT SELECT ON schoolnet_family_auth_proof\.token_issue_observations TO (?:anon|authenticated)/,
  "Les observations ne doivent jamais être exposées directement au navigateur.");
