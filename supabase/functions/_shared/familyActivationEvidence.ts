// SCHOOLNET — 5.C-B.2 / A.2.2 — verification PURE, sans SQL, Auth ni effet de bord.
// ATTENTION : les preuves doivent provenir EXCLUSIVEMENT de sources serveur
// protegees, jamais du body HTTP, de user_metadata, du navigateur ou d'un JWT seul.
// Ce module ne collecte pas de preuve. Aucune source reelle n'est raccordee
// pour le moment : l'Edge Function passe explicitement des preuves nulles.

export type FamilyRecipient = "parent" | "student";
export type FamilyActivationProofState =
  | "not_applicable"
  | "awaiting_delivery"
  | "evidence_source_unavailable"
  | "identity_mismatch"
  | "invalid_chronology"
  | "requires_review"
  | "verified";

export type FamilyActivationRecord = {
  request_id: string;
  recipient: FamilyRecipient;
  user_id: string | null;
  email: string;
  expected_role: string;
  status: string;
  generation_count: number;
  last_prepared_at: string;
  sent_declared_at: string | null;
  sent_declared_by: string | null;
};

export type FamilyAuthIdentity = {
  id: string;
  email: string | null;
};

export type FamilyProfileIdentity = {
  id: string;
  role: string;
};

// Interface d'evenements internes a alimenter PLUS TARD avec un pipeline
// serveur protege. Le champ "source" n'est PAS une signature cryptographique.
// La provenance doit etre garantie par des lectures avec droits privilegies.
export type FamilyAuthAuditEvent = {
  source: "supabase_auth_audit";
  user_id: string;
  action: "user_updated_password" | "login";
  happened_at: string;
};

export type FamilyPasswordVerificationEvent = {
  source: "password_verification_hook";
  user_id: string;
  valid: true;
  happened_at: string;
};

export type FamilyActivationEvidenceInput = {
  invitation: FamilyActivationRecord | null;
  authUser: FamilyAuthIdentity | null;
  profile: FamilyProfileIdentity | null;
  passwordUpdated: FamilyAuthAuditEvent | null;
  validPasswordVerified: FamilyPasswordVerificationEvent | null;
  passwordLogin: FamilyAuthAuditEvent | null;
  nowIso: string;
};

export type FamilyActivationProofResult = {
  verified: boolean;
  state: FamilyActivationProofState;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

// Date.parse accepte quelques formats ambigus : ne retenir que des UTC ISO.
function instant(value: string | null | undefined): number | null {
  if (!value || !stamp.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function email(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

const fail = (state: FamilyActivationProofState): FamilyActivationProofResult =>
  ({ verified: false, state });

/**
 * Verification metier des preuves correlées, SANS authentifier leur provenance.
 *
 * Exigences : reservation liee a UN compte, livraison deja declaree,
 * evenement Auth du changement de mot de passe APRES la declaration,
 * verification positive du mot de passe par un hook Auth puis login Auth.
 * Toutes ces informations doivent etre lues par le SERVEUR dans une
 * source protegee et lies au meme user_id. Ne jamais les accepter d'un client.
 *
 * Tant que les journaux Auth et le hook ne sont pas integres de facon fiable,
 * appeler avec des preuves nulles : le resultat est obligatoirement non verifie.
 */
export function evaluateFamilyActivationProof(
  context: FamilyActivationEvidenceInput,
): FamilyActivationProofResult {
  const r = context.invitation;
  if (!r) return fail("not_applicable");

  // Le seul etat "activated" dans le registre n'est PAS une preuve Auth.
  const reject = (state: FamilyActivationProofState) =>
    fail(r.status === "activated" ? "requires_review" : state);

  if (!uuid.test(r.request_id) || !uuid.test(r.user_id ?? "") ||
    !["parent", "student"].includes(r.recipient) ||
    r.expected_role !== r.recipient ||
    !r.email || email(r.email) !== r.email ||
    !Number.isInteger(r.generation_count) || r.generation_count < 1) {
    return reject("identity_mismatch");
  }

  if (!["sent_declared", "activated"].includes(r.status) ||
    !r.sent_declared_at || !uuid.test(r.sent_declared_by ?? "")) {
    return reject("awaiting_delivery");
  }

  const preparedAt = instant(r.last_prepared_at);
  const sentAt = instant(r.sent_declared_at);
  const now = instant(context.nowIso);
  if (preparedAt === null || sentAt === null || now === null ||
    sentAt < preparedAt || sentAt > now) {
    return reject("invalid_chronology");
  }

  const { authUser, profile } = context;
  if (!authUser || !profile) return reject("evidence_source_unavailable");
  if (authUser.id !== r.user_id || email(authUser.email) !== r.email ||
    profile.id !== r.user_id || profile.role !== r.expected_role) {
    return reject("identity_mismatch");
  }

  const { passwordUpdated: update, validPasswordVerified: verification, passwordLogin: login } = context;
  if (!update || !verification || !login) return reject("evidence_source_unavailable");
  if (update.source !== "supabase_auth_audit" ||
    update.action !== "user_updated_password" ||
    verification.source !== "password_verification_hook" ||
    verification.valid !== true ||
    login.source !== "supabase_auth_audit" || login.action !== "login" ||
    [update.user_id, verification.user_id, login.user_id].some(id => id !== r.user_id)) {
    return reject("identity_mismatch");
  }

  const changedAt = instant(update.happened_at);
  const verifiedAt = instant(verification.happened_at);
  const loginAt = instant(login.happened_at);
  if (changedAt === null || verifiedAt === null || loginAt === null ||
    changedAt <= sentAt || changedAt <= preparedAt ||
    verifiedAt <= changedAt || loginAt < verifiedAt ||
    // Rapprochement strict d'une verification positive et d'un login.
    loginAt - verifiedAt > 120_000 ||
    // Une horloge decalee de plus de deux minutes n'est pas acceptee.
    loginAt > now + 120_000 || changedAt > now + 120_000) {
    return reject("invalid_chronology");
  }

  return { verified: true, state: "verified" };
}
