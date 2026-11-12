import { supabase } from "@/lib/supabaseClient";

// Lot 5.C-B.2 — Service d'invitations familiales, appel explicite Admin.
// Les mutations ne sont possibles que sur l'origine de production et
// après vérification de l'identité, avec permissions serveur strictes.
export type FamilyInvitationRecipient = "parent" | "student";

export type FamilyInvitationInspection = {
  success: true;
  no_write: true;
  request_id: string;
  reference: string;
  recipient: FamilyInvitationRecipient;
  role: "parent" | "student";
  email: string;
  full_name: string;
  decision: "new_invitation_possible" | "reuse_after_verification" | "manual_review" |
    "already_prepared" | "already_activated";
  invitation_status?: string | null;
  /** Available after Edge A.2 has been deployed under a separate GO. */
  delivery_status?: "not_declared" | "ready_to_declare" | "declared_by_admin";
  delivery_declared_at?: string | null;
  activation_status?: "not_confirmed" | "recorded_in_registry";
  /** Registry state is not, by itself, proof of a password change. */
  activation_evidence_verified?: boolean;
  activation_proof_state?: "not_applicable" | "awaiting_delivery" |
    "evidence_source_unavailable" | "identity_mismatch" |
    "invalid_chronology" | "requires_review" | "awaiting_password_login" | "verified";
  can_confirm_activation?: boolean;
  can_resume?: boolean;
  can_renew?: boolean;
  can_flag_review?: boolean;
};

export type PreparedFamilyInvitation = {
  success: true;
  status: "prepared";
  request_id: string;
  recipient: FamilyInvitationRecipient;
  user_id: string;
  email: string;
  full_name: string;
  role: "parent" | "student";
  link: string;
  generation_count: number;
  no_email_sent: true;
};

type FamilyInvitationError = { error?: string };

async function invokeFamilyInvitation<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "schoolnet-family-invitation",
    { body },
  );
  if (error) {
    let message = "Service d'invitation familiale indisponible.";
    if ("context" in error && error.context instanceof Response) {
      try {
        const info = await error.context.clone().json() as FamilyInvitationError;
        if (typeof info.error === "string" && info.error) message = info.error;
      } catch {
        // Ne jamais lire ni afficher les donnees sensibles d'une reponse invalide.
      }
    }
    throw new Error(message);
  }
  return data as T;
}

/** Inspection sans écriture. Une preuve n'est vraie qu'après vérification SQL. */
export async function inspectFamilyInvitation(
  requestId: string,
  recipient: FamilyInvitationRecipient,
): Promise<FamilyInvitationInspection> {
  const result = await invokeFamilyInvitation<FamilyInvitationInspection>({
    action: "inspect",
    request_id: requestId,
    recipient,
  });
  if (!result?.success || !result.no_write || result.request_id !== requestId ||
    result.recipient !== recipient) {
    throw new Error("La recherche n'a pas ete confirmee par le serveur.");
  }
  return result;
}

/**
 * ECRITURE SENSIBLE. Réservée au Super Admin après validation explicite
 * de l'identité et du dossier. Le serveur contrôle aussi l'origine.
 */
export async function prepareFamilyInvitation(input: {
  requestId: string;
  recipient: FamilyInvitationRecipient;
  verified: boolean;
  verificationNote: string;
}): Promise<PreparedFamilyInvitation> {
  if (!input.verified || input.verificationNote.trim().length < 10) {
    throw new Error("Verifiez l'identite et justifiez votre decision avant de preparer un acces.");
  }
  const result = await invokeFamilyInvitation<PreparedFamilyInvitation>({
    action: "prepare",
    request_id: input.requestId,
    recipient: input.recipient,
    verified: true,
    verification_note: input.verificationNote.trim(),
  });
  if (!result?.success || result.status !== "prepared" ||
    !result.link || result.request_id !== input.requestId ||
    result.recipient !== input.recipient || result.no_email_sent !== true) {
    throw new Error("Le lien d'activation n'a pas ete confirme par le serveur.");
  }
  return result;
}

/**
 * Attestation de transmission MANUELLE, sans envoi automatique.
 * Ne confirme jamais l'activation ni la prise de connaissance du lien.
 */
export async function declareFamilyInvitationSent(input: {
  requestId: string;
  recipient: FamilyInvitationRecipient;
  verified: boolean;
  deliveryConfirmed: boolean;
  verificationNote: string;
  deliveryMethod: "manual_email" | "in_person";
}): Promise<{
  success: true;
  status: "sent_declared";
  request_id: string;
  recipient: FamilyInvitationRecipient;
  delivery_declared_at: string;
  delivery_confirmed_by_admin: true;
  recipient_activation_verified: false;
  no_email_sent: true;
  no_link_in_response: true;
}> {
  if (!input.verified || !input.deliveryConfirmed ||
    input.verificationNote.trim().length < 10 ||
    !["manual_email", "in_person"].includes(input.deliveryMethod)) {
    throw new Error("La transmission doit etre verifiee et justifiee par l'administration.");
  }
  const result = await invokeFamilyInvitation<{
    success: true;
    status: "sent_declared";
    request_id: string;
    recipient: FamilyInvitationRecipient;
    delivery_declared_at: string;
    delivery_confirmed_by_admin: true;
    recipient_activation_verified: false;
    no_email_sent: true;
    no_link_in_response: true;
  }>({
    action: "declare_sent",
    request_id: input.requestId,
    recipient: input.recipient,
    verified: true,
    delivery_confirmed: true,
    delivery_method: input.deliveryMethod,
    verification_note: input.verificationNote.trim(),
  });
  if (!result?.success || result.status !== "sent_declared" ||
    result.request_id !== input.requestId || result.recipient !== input.recipient ||
    !result.delivery_declared_at || result.no_email_sent !== true ||
    result.no_link_in_response !== true ||
    result.recipient_activation_verified !== false) {
    throw new Error("La declaration de transmission n'a pas ete confirmee par le serveur.");
  }
  return result;
}

/**
 * Recuperation controlee d'un compte deja lie au registre, ou renouvellement
 * d'un lien perdu/expire. Aucune creation Auth dans ces deux operations.
 * Le serveur refuse les reprises incohérentes et conserve un audit.
 */
export async function retryFamilyInvitation(input: {
  action: "resume" | "renew";
  requestId: string;
  recipient: FamilyInvitationRecipient;
  verified: boolean;
  verificationNote: string;
}): Promise<PreparedFamilyInvitation> {
  if (!input.verified || input.verificationNote.trim().length < 10) {
    throw new Error("L'administrateur doit verifier le dossier et motiver la reprise.");
  }
  const result = await invokeFamilyInvitation<PreparedFamilyInvitation>({
    action: input.action,
    request_id: input.requestId,
    recipient: input.recipient,
    verified: true,
    verification_note: input.verificationNote.trim(),
  });
  if (!result?.success || result.status !== "prepared" ||
    !result.link || result.request_id !== input.requestId ||
    result.recipient !== input.recipient || result.no_email_sent !== true) {
    throw new Error("La reprise ou le renouvellement n'a pas ete confirme.");
  }
  return result;
}

/**
 * Signale une operation en cours depuis trop longtemps, sans toucher a Auth.
 * Réservé aux états interrompus et après vérification humaine.
 */
export async function flagStaleFamilyInvitation(input: {
  requestId: string;
  recipient: FamilyInvitationRecipient;
  verified: boolean;
  verificationNote: string;
}): Promise<{success: true; status: "requires_review"; has_bound_auth_user: boolean}> {
  if (!input.verified || input.verificationNote.trim().length < 10) {
    throw new Error("Justifiez la mise en revue de l'invitation.");
  }
  const data = await invokeFamilyInvitation<{
    success: true; status: "requires_review"; has_bound_auth_user: boolean;
  }>({
    action: "flag_review",
    request_id: input.requestId,
    recipient: input.recipient,
    verified: true,
    verification_note: input.verificationNote.trim(),
  });
  if (!data?.success || data.status !== "requires_review") {
    throw new Error("La mise en revue n'a pas ete confirmee.");
  }
  return data;
}

/** Confirmation serveur, distincte de la déclaration de transmission. */
export async function confirmFamilyInvitationActivation(input: {
  requestId: string;
  recipient: FamilyInvitationRecipient;
  verified: boolean;
  verificationNote: string;
}): Promise<{
  success: true;
  status: "activated";
  request_id: string;
  recipient: FamilyInvitationRecipient;
  activation_evidence_verified: true;
  no_link_in_response: true;
}> {
  if (!input.verified || input.verificationNote.trim().length < 10) {
    throw new Error("Confirmez le contrôle d'identité et justifiez l'activation.");
  }
  const result = await invokeFamilyInvitation<{
    success: true;
    status: "activated";
    request_id: string;
    recipient: FamilyInvitationRecipient;
    activation_evidence_verified: true;
    no_link_in_response: true;
  }>({
    action: "confirm_activation",
    request_id: input.requestId,
    recipient: input.recipient,
    verified: true,
    verification_note: input.verificationNote.trim(),
  });
  if (!result?.success || result.status !== "activated" ||
    result.request_id !== input.requestId || result.recipient !== input.recipient ||
    result.activation_evidence_verified !== true ||
    result.no_link_in_response !== true) {
    throw new Error("L'activation n'a pas été prouvée côté serveur.");
  }
  return result;
}

/** Message en texte brut, que l'administrateur transmet manuellement. */
export function formatFamilyInvitationEmail(invite: PreparedFamilyInvitation): {
  to: string;
  subject: string;
  body: string;
} {
  const subject = "SCHOOLNET — Activation de votre acces " +
    (invite.recipient === "parent" ? "Parent / Tuteur" : "Apprenant");
  const body = [
    "Bonjour " + invite.full_name + ",",
    "",
    invite.recipient === "parent"
      ? "Votre acces Parent / Tuteur SCHOOLNET a ete prepare apres verification par l'administration."
      : "Votre acces Apprenant SCHOOLNET a ete prepare apres verification par l'administration.",
    "",
    "Adresse de connexion : " + invite.email,
    "Lien personnel et temporaire d'activation :",
    invite.link,
    "",
    "Ouvrez ce lien pour choisir vous-meme votre mot de passe.",
    "Ne communiquez ce lien a personne. Si le lien expire, contactez l'administration.",
    "",
    "Site officiel : https://schoolnet-snowy.vercel.app/",
    "",
    "Cordialement,",
    "L'administration SCHOOLNET",
  ].join("\n");
  return { to: invite.email, subject, body };
}
