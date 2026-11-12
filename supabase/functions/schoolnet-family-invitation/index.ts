// SCHOOLNET — Lot 5.C-B.2. Parcours de comptes et invitations familiales.
// Uniquement SUPER ADMIN et origine officielle pour les mutations.
// Le serveur genere des liens temporaires, n'envoie AUCUN email.
// L'activation exige une transmission declaree, un login Auth password
// observe et une session reelle correspondante, sans token en base.
// Le service-role ne doit jamais etre expose au navigateur.
import { createClient } from "jsr:@supabase/supabase-js@2";

type Action = "inspect" | "prepare" | "resume" | "renew" | "flag_review" | "declare_sent" | "confirm_activation";
type Recipient = "parent" | "student";
type RequestRow = {
  id: string;
  reference: string;
  request_type: string;
  status: string;
  guardian_email: string | null;
  guardian_full_name: string;
  student_email: string | null;
  student_full_name: string;
  student_gender: string | null;
};
type Lookup = {
  exists: boolean;
  user_id: string | null;
  role: string | null;
  email_confirmed?: boolean;
};
type InvitationRecord = {
  request_id: string;
  recipient: Recipient;
  expected_role: string;
  email: string;
  user_id: string | null;
  status: string;
  generation_count: number;
  first_prepared_at: string;
  last_prepared_at: string;
  updated_at: string;
  sent_declared_at: string | null;
  sent_declared_by: string | null;
};
type AuthUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string;
  app_metadata?: Record<string, unknown>;
};
type Body = {
  action?: unknown;
  request_id?: unknown;
  recipient?: unknown;
  verified?: unknown;
  verification_note?: unknown;
  delivery_confirmed?: unknown;
  delivery_method?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// La recette se fait d'abord en local : cette origine ne pourra utiliser que "inspect".
const LOCAL_INSPECT_ORIGIN = "http://localhost:5173";
const PRODUCTION_ORIGIN = "https://schoolnet-snowy.vercel.app";
const PRODUCTION_PROJECT_URL = "https://anttmbhaphkhmkoqsofd.supabase.co";
const allowedOrigins = new Set([
  LOCAL_INSPECT_ORIGIN,
  PRODUCTION_ORIGIN,
  "https://schoolnet-git-feature-schoolnet-mul-4bbbf5-ramon77777s-projects.vercel.app",
  ...(Deno.env.get("SCHOOLNET_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean),
]);
const previewOrigin =
  "https://schoolnet-git-feature-schoolnet-mul-4bbbf5-ramon77777s-projects.vercel.app";
const prodRedirect =
  "https://schoolnet-snowy.vercel.app/auth/reset-password?mode=family-invite";
const previewRedirect = previewOrigin + "/auth/reset-password?mode=family-invite";

function send(req: Request, value: Record<string, unknown>, status = 200): Response {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "pragma": "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, x-client-info, content-type",
  };
  if (allowedOrigins.has(origin)) headers["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(value), { status, headers });
}
function reject(req: Request, status: number, message: string): Response {
  return send(req, { success: false, error: message }, status);
}
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function emailOf(row: RequestRow, recipient: Recipient): string {
  return (recipient === "parent" ? row.guardian_email : row.student_email)?.trim().toLowerCase() ?? "";
}
function nameOf(row: RequestRow, recipient: Recipient): string {
  return clean(recipient === "parent" ? row.guardian_full_name : row.student_full_name);
}
function destination(origin: string): string | null {
  const raw = origin === previewOrigin
    ? previewRedirect
    : Deno.env.get("SCHOOLNET_FAMILY_INVITE_REDIRECT_URL") ?? prodRedirect;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash ||
      url.pathname !== "/auth/reset-password" ||
      url.searchParams.get("mode") !== "family-invite" ||
      url.searchParams.size !== 1 ||
      !allowedOrigins.has(url.origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (!origin || !allowedOrigins.has(origin)) {
    return reject(req, 403, "Origine non autorisee.");
  }
  if (req.method === "OPTIONS") return send(req, { success: true });
  if (req.method !== "POST") return reject(req, 405, "Methode non autorisee.");

  // Publication pilote SCHOOLNET : écritures possibles uniquement depuis
  // l'origine de production, par un Super Administrateur vérifié par Auth.
  // Variable d'urgence SCHOOLNET_FAMILY_INVITES_ENABLED=false : désactivation
  // sans redéploiement de l'interface. Le blocage local demeure permanent.
  const READ_ONLY_DEPLOYMENT = false;
  const enabled = !READ_ONLY_DEPLOYMENT &&
    Deno.env.get("SCHOOLNET_FAMILY_INVITES_ENABLED") !== "false";
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return reject(req, 401, "Connexion administrateur requise.");
  }
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (url !== PRODUCTION_PROJECT_URL || !anonKey || !serviceKey) {
    return reject(req, 503, "Service SCHOOLNET non configure sur le projet attendu.");
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const scoped = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verifiedUser, error: userError } =
    await service.auth.getUser(authHeader.slice(7));
  if (userError || !verifiedUser.user) {
    return reject(req, 401, "Session expiree.");
  }
  const callerId = verifiedUser.user.id;
  const { data: callerProfile, error: profileError } = await service
    .from("profiles").select("role").eq("id", callerId).maybeSingle();
  if (profileError || callerProfile?.role !== "admin") {
    return reject(req, 403, "Action reservee au Super Administrateur SCHOOLNET.");
  }

  let body: Body;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return reject(req, 413, "Formulaire trop volumineux.");
    body = JSON.parse(raw) as Body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
  } catch {
    return reject(req, 400, "Parametres incorrects.");
  }
  const action = clean(body.action) as Action;
  // Toute mutation est interdite aux builds locaux, previews et autres domaines.
  if (action !== "inspect" && origin !== PRODUCTION_ORIGIN) {
    return reject(req, 403, "Les mutations sont reservees au domaine officiel SCHOOLNET.");
  }
  const requestId = clean(body.request_id);
  const recipient = clean(body.recipient) as Recipient;
  if (!["inspect", "prepare", "resume", "renew", "flag_review", "declare_sent", "confirm_activation"].includes(action) ||
    !uuidPattern.test(requestId) ||
    (recipient !== "parent" && recipient !== "student")) {
    return reject(req, 400, "Demande ou destinataire invalide.");
  }

  const { data: request, error: requestError } = await service
    .from("public_enrollment_requests")
    .select("id,reference,request_type,status,guardian_email,guardian_full_name,student_email,student_full_name,student_gender")
    .eq("id", requestId).maybeSingle();
  if (requestError) return reject(req, 503, "Lecture de la demande indisponible.");
  const row = request as RequestRow | null;
  if (!row) return reject(req, 404, "Demande introuvable.");
  if (row.status === "rejected") {
    return reject(req, 409, "Une demande refusee ne peut pas recevoir d'invitation.");
  }
  if (row.request_type !== "student_enrollment" && row.request_type !== "parent_access") {
    return reject(req, 409, "Type de demande non reconnu.");
  }
  if (recipient === "student" && row.request_type !== "student_enrollment") {
    return reject(req, 409, "Aucun compte apprenant a preparer pour ce type de demande.");
  }
  const email = emailOf(row, recipient);
  const expectedRole = recipient === "parent" ? "parent" : "student";
  const name = nameOf(row, recipient);
  if (!email || !emailPattern.test(email) || email.length > 254 ||
    name.length < 3 || name.length > 160) {
    return reject(req, 422, "Adresse personnelle manquante ou informations incompletes.");
  }
  const otherEmail = emailOf(row, recipient === "parent" ? "student" : "parent");
  if (email === otherEmail) {
    return reject(req, 409, "L'e-mail du responsable ne peut servir a deux comptes distincts.");
  }
  const { data: resolution, error: resolutionError } = await service
    .from("public_enrollment_request_resolutions")
    .select("request_id").eq("request_id", requestId).maybeSingle();
  if (resolutionError) return reject(req, 503, "Verification de finalisation indisponible.");
  // Une demande deja finalisee peut ENCORE suivre ses invitations,
  // sans creer de nouvel utilisateur. Les actions de creation sont
  // filtrees apres lecture du registre.

  const { data: foundData, error: lookupError } = await scoped
    .rpc("schoolnet_admin_lookup_auth_email", { p_email: email });
  if (lookupError) return reject(req, 503, "Recherche des comptes indisponible.");
  const found = foundData as Lookup | null;

  // Registre en lecture seule : seul le service-role serveur peut y acceder.
  // Les deux tables ont ete installees lors de la migration ciblee 5.C-B.2.
  const { data: existingRecord, error: recordError } = await service
    .from("schoolnet_family_invitation_records")
    .select("request_id,recipient,expected_role,email,user_id,status,generation_count,first_prepared_at,last_prepared_at,updated_at,sent_declared_at,sent_declared_by")
    .eq("request_id", requestId).eq("recipient", recipient).maybeSingle();
  if (recordError) {
    return reject(req, 503, "Registre familial non active. Migration a valider.");
  }
  const previous = existingRecord as InvitationRecord | null;
  if ((row.status === "processed" || resolution) && !previous) {
    return reject(req, 409, "Demande finalisee sans invitation familiale : revue manuelle requise.");
  }

  // Preuve Auth: un hook non modificateur enregistre la methode password
  // puis le serveur verifie l'existence d'une session persistee APRES l'envoi.
  // Le registre seul et un email confirme ne suffisent jamais.
  async function observedPasswordLogin(invite: InvitationRecord | null): Promise<{
    verified: boolean; unavailable: boolean;
  }> {
    if (!invite?.user_id || !invite.sent_declared_at ||
      !["sent_declared", "activated"].includes(invite.status)) {
      return { verified: false, unavailable: false };
    }
    const { data, error } = await service.rpc(
      "schoolnet_family_password_session_proof", {
        p_user_id: invite.user_id,
        p_after: invite.sent_declared_at,
      },
    );
    return { verified: !error && data === true, unavailable: Boolean(error) };
  }

  if (action === "inspect") {
    // La preuve doit être lue côté serveur depuis une méthode JWT
    // observée, liée au même utilisateur et à une vraie session Auth.
    const methodProof = await observedPasswordLogin(previous);
    const activationProof = {
      verified: methodProof.verified,
      state: methodProof.verified ? "verified" :
        methodProof.unavailable ? "evidence_source_unavailable" :
        previous?.status === "sent_declared" ? "awaiting_password_login" :
        previous?.status === "activated" ? "requires_review" :
        previous?.status === "prepared" ? "awaiting_delivery" : "not_applicable",
    };
    const decision = previous
      ? previous.status === "activated" && !activationProof.verified ? "manual_review"
        : previous.status === "activated" ? "already_activated"
        : previous.status === "prepared" || previous.status === "sent_declared"
          ? "already_prepared" : "manual_review"
      : found?.exists
        ? found.role === expectedRole ? "reuse_after_verification" : "manual_review"
        : "new_invitation_possible";
    return send(req, {
      success: true, request_id: requestId, reference: row.reference,
      recipient, role: expectedRole, email, full_name: name,
      decision, invitation_status: previous?.status ?? null,
      // A.2 : etats purement consultatifs. Jamais de lien ni de jeton.
      delivery_status: previous?.sent_declared_at
        ? "declared_by_admin" : previous?.status === "prepared"
          ? "ready_to_declare" : "not_declared",
      delivery_declared_at: previous?.sent_declared_at ?? null,
      activation_status: previous?.status === "activated"
        ? "recorded_in_registry" : "not_confirmed",
      // Une valeur "activated" existante n'est pas une preuve Auth en soi.
      // La validation serveur d'un changement de mot de passe reste a construire.
      activation_evidence_verified: activationProof.verified,
      activation_proof_state: activationProof.state,
      // Hors du pilote isole : aucune preuve serveur ne peut etre fournie.
      can_confirm_activation: Boolean(previous?.user_id && previous.status === "sent_declared" &&
        found?.exists && found?.user_id === previous.user_id &&
        found?.role === expectedRole && activationProof.verified),
      can_resume: Boolean(previous?.user_id) &&
        ["auth_created", "profile_ready", "requires_review"].includes(previous?.status ?? ""),
      can_renew: Boolean(previous?.user_id) &&
        ["prepared", "sent_declared"].includes(previous?.status ?? ""),
      can_flag_review: Boolean(previous) &&
        ["preparing", "auth_created", "profile_ready", "renewing"].includes(previous?.status ?? "") &&
        Number.isFinite(Date.parse(previous?.updated_at ?? "")) &&
        Date.now() - Date.parse(previous?.updated_at ?? "") >= 120_000,
      no_write: true,
    });
  }

  // Arrêt d'urgence: aucun traitement serveur possible si désactivé.
  if (!enabled) {
    return reject(req, 503, "Les invitations familiales sont temporairement suspendues.");
  }

  // Option de restriction d'un essai à UNE demande, configurable côté serveur.
  // Sans ces variables la fonction traite les demandes sous contrôle Admin.
  const pilotRequestId = clean(Deno.env.get("SCHOOLNET_FAMILY_PILOT_REQUEST_ID")).toLowerCase();
  const pilotRecipient = clean(Deno.env.get("SCHOOLNET_FAMILY_PILOT_RECIPIENT"));
  if ((pilotRequestId && pilotRequestId !== requestId.toLowerCase()) ||
    (pilotRecipient && pilotRecipient !== recipient)) {
    return reject(req, 403, "Cette demande ou ce destinataire est hors du pilote autorise.");
  }
  if (row.status === "processed" && action === "prepare") {
    return reject(req, 409, "Le dossier finalise ne permet pas de nouveau compte.");
  }

  // Aucune preparation Auth vers une adresse fictive ou reservee pour les recettes.
  const domain = email.split("@")[1] ?? "";
  if (domain === "example.test" || domain === "example.com" ||
    domain === "example.org" || domain === "example.net" ||
    domain === "invalid" || domain.endsWith(".invalid") ||
    domain === "test" || domain.endsWith(".test")) {
    return reject(req, 422, "Adresse de recette interdite pour la creation d'un compte.");
  }

  if (body.verified !== true) {
    return reject(req, 422, "Une verification administrative explicite est requise.");
  }
  const verificationNote = clean(body.verification_note);
  if (verificationNote.length < 10 || verificationNote.length > 1000) {
    return reject(req, 422, "Justification de verification requise (10 a 1000 caracteres).");
  }
  const redirectTo = destination(origin);
  if (!redirectTo) return reject(req, 503, "Redirection d'activation non autorisee.");

  // Mises a jour atomiques via CAS (request_id + recipient + status).
  // Ni les identifiants ni les liens d'activation ne sont journalises.
  async function advance(
    fromStatus: string,
    nextStatus: string,
    patch: Record<string, unknown> = {},
  ): Promise<boolean> {
    const { data, error } = await service.from("schoolnet_family_invitation_records")
      .update({
        ...patch, status: nextStatus, last_action_by: callerId,
      })
      .eq("request_id", requestId).eq("recipient", recipient).eq("status", fromStatus)
      .select("status").maybeSingle();
    return !error && data?.status === nextStatus;
  }

  async function markReview(fromStatus: string, errorCode: string): Promise<void> {
    // Une revue humaine bloque toute creation aleatoire et conserve l'historique.
    await advance(fromStatus, "requires_review", { last_error_code: errorCode });
  }

  function linkResult(userId: string, link: string, generationCount: number) {
    return send(req, {
      success: true, status: "prepared",
      request_id: requestId, recipient, user_id: userId, email, full_name: name,
      role: expectedRole, link, generation_count: generationCount,
      no_email_sent: true,
    });
  }

  // Attestation de transmission manuelle: aucune preuve de reception
  // ni aucune preuve de connexion n'est deduite de ce seul geste.
  if (action === "declare_sent") {
    if (body.delivery_confirmed !== true) {
      return reject(req, 422, "Confirmez avoir transmis le lien par un canal externe.");
    }
    const deliveryMethod = clean(body.delivery_method);
    if (deliveryMethod !== "manual_email" && deliveryMethod !== "in_person") {
      return reject(req, 422, "Canal de transmission manuelle invalide.");
    }
    const sensitiveNote = verificationNote.toLowerCase();
    if (["http:", "https:", "access_token", "refresh_token", "bearer "]
      .some((fragment) => sensitiveNote.includes(fragment))) {
      return reject(req, 422, "Ne conservez aucun lien ou jeton dans la justification.");
    }
    if (!previous || previous.status !== "prepared" || !previous.user_id ||
      previous.generation_count < 1 || previous.sent_declared_at ||
      previous.sent_declared_by || previous.email !== email ||
      previous.expected_role !== expectedRole) {
      return reject(req, 409, "Aucun lien prepare non declare et coherent pour cette personne.");
    }
    if (!found?.exists || found.user_id !== previous.user_id ||
      found.role !== expectedRole) {
      return reject(req, 409, "Compte Auth incoherent : revue manuelle requise.");
    }
    const { data: recipientAuthData, error: recipientAuthError } =
      await service.auth.admin.getUserById(previous.user_id);
    const recipientAuth = recipientAuthData?.user;
    if (recipientAuthError || !recipientAuth ||
      recipientAuth.email?.trim().toLowerCase() !== email) {
      return reject(req, 409, "Compte Auth de l'invitation introuvable ou different.");
    }
    const { data: recipientProfile, error: recipientProfileError } = await service
      .from("profiles").select("role,full_name").eq("id", previous.user_id)
      .maybeSingle();
    if (recipientProfileError || recipientProfile?.role !== expectedRole ||
      recipientProfile?.full_name !== name) {
      return reject(req, 409, "Profil du destinataire incoherent.");
    }
    const deliveryNote = "DELIVERY_" + deliveryMethod.toUpperCase() +
      ": " + verificationNote;
    if (deliveryNote.length > 1000) {
      return reject(req, 422, "Justification trop longue pour l'historique.");
    }
    const declaredAt = new Date().toISOString();
    const declared = await advance("prepared", "sent_declared", {
      sent_declared_at: declaredAt, sent_declared_by: callerId,
      recovery_note: deliveryNote,
    });
    if (!declared) {
      return reject(req, 409, "Etat de l'invitation modifie : actualisez avant de declarer l'envoi.");
    }
    // Ne jamais retourner ou recreer un lien via cette action.
    return send(req, {
      success: true, status: "sent_declared",
      request_id: requestId, recipient, delivery_declared_at: declaredAt,
      delivery_confirmed_by_admin: true, recipient_activation_verified: false,
      no_email_sent: true, no_link_in_response: true,
    });
  }

  // Confirmation par le Super Admin apres preuve de mot de passe.
  // Cette action reste distincte de "declare_sent": aucune activation
  // sur une simple declaration d'envoi ou un status client.
  if (action === "confirm_activation") {
    if (!previous || !previous.user_id || previous.email !== email ||
      previous.expected_role !== expectedRole ||
      !previous.sent_declared_at ||
      !["sent_declared", "activated"].includes(previous.status) ||
      !found?.exists || found.user_id !== previous.user_id ||
      found.role !== expectedRole) {
      return reject(req, 409, "Aucune invitation envoyee et liee a ce compte.");
    }
    const proof = await observedPasswordLogin(previous);
    if (proof.unavailable) {
      return reject(req, 503, "La preuve Auth est indisponible : aucune activation.");
    }
    if (!proof.verified) {
      return reject(req, 409,
        "Le destinataire doit d'abord choisir son mot de passe et se connecter.");
    }
    const authCheck = await service.auth.admin.getUserById(previous.user_id);
    const authUser = authCheck.data?.user;
    if (authCheck.error || !authUser ||
      authUser.email?.trim().toLowerCase() !== email ||
      !authUser.email_confirmed_at) {
      return reject(req, 409, "Le compte Auth n'est pas confirme ou est different.");
    }
    const profileCheck = await service.from("profiles")
      .select("role,full_name").eq("id", previous.user_id).maybeSingle();
    if (profileCheck.error || profileCheck.data?.role !== expectedRole ||
      profileCheck.data?.full_name !== name) {
      return reject(req, 409, "Role ou identite du profil non confirme.");
    }
    if (previous.status === "sent_declared" &&
      !await advance("sent_declared", "activated")) {
      return reject(req, 409, "Statut modifie entre-temps : actualisez la demande.");
    }
    return send(req, {
      success: true, status: "activated", recipient, request_id: requestId,
      activation_evidence_verified: true, no_link_in_response: true,
    });
  }

  // Requalification manuelle d'une operation bloquee depuis au moins 2 min.
  // Aucun compte Auth ni jeton n'est cree ici. Les etats incertains sans user_id
  // restent bloques apres revue : pas de recreation automatique.
  if (action === "flag_review") {
    if (!previous || !["preparing", "auth_created", "profile_ready", "renewing"]
      .includes(previous.status)) {
      return reject(req, 409, "Aucune operation interrompue a examiner.");
    }
    const updatedMs = Date.parse(previous.updated_at);
    if (!Number.isFinite(updatedMs) || Date.now() - updatedMs < 120_000) {
      return reject(req, 429, "Preparation recente : ne pas interrompre l'operation en cours.");
    }
    if (!await advance(previous.status, "requires_review", {
      recovery_note: verificationNote,
      last_error_code: "OPERATION_INTERRUPTED",
    })) {
      return reject(req, 409, "Etat modifie entre-temps. Actualisez avant de recommencer.");
    }
    return send(req, {
      success: true, status: "requires_review", request_id: requestId,
      recipient, has_bound_auth_user: Boolean(previous.user_id), no_write_auth: true,
    });
  }

  if (action === "prepare") {
    if (previous) {
      return reject(req, 409,
        "Preparation deja reservee. Consultez son statut : aucun nouveau compte ne sera cree.");
    }
    if (found?.exists) {
      return reject(req, 409,
        found.role === expectedRole
          ? "Ce compte existe deja : verifiez-le puis reutilisez-le."
          : "Adresse utilisee par un autre role : examen manuel obligatoire.");
    }

    // Reservation unique AVANT toute action sur Auth (anti-doublon SQL).
    const { data: reserved, error: reserveError } = await service
      .from("schoolnet_family_invitation_records")
      .insert({
        request_id: requestId, recipient, expected_role: expectedRole,
        email, verification_note: verificationNote, prepared_by: callerId,
        last_action_by: callerId, status: "preparing", generation_count: 0,
      })
      .select("request_id,status").maybeSingle();
    if (reserveError || !reserved) {
      return reject(req, reserveError?.code === "42P01" || reserveError?.code === "PGRST205"
        ? 503 : 409,
      "Impossible de reserver la preparation. Verifiez les invitations existantes.");
    }

    // Une invitation Auth cree le compte SANS email envoye automatiquement.
    // Le jeton n'est renvoye au Super Admin qu'apres les verifications serveur.
    const startedAt = Date.now();
    const { data: initialLinkData, error: createError } =
      await service.auth.admin.generateLink({
        type: "invite", email, options: { redirectTo },
      });
    const created = initialLinkData?.user;
    const initialActionLink = initialLinkData?.properties?.action_link;
    const createdAt = Date.parse(created?.created_at ?? "");
    if (createError || !created || !initialActionLink ||
      created.email?.trim().toLowerCase() !== email ||
      !Number.isFinite(createdAt) || createdAt < startedAt - 15_000 ||
      Boolean(created.last_sign_in_at) || Boolean(created.email_confirmed_at)) {
      await markReview("preparing", "AUTH_CREATION_UNCERTAIN");
      return reject(req, 409,
        "Creation ou invitation Auth incertaine. Controle manuel obligatoire, aucun nouvel essai.");
    }

    // Lier le compte Auth au registre avant d'exposer le lien au navigateur.
    // Si cette ecriture echoue, le compte est conserve pour revue.
    const linked = await advance("preparing", "auth_created", {
      user_id: created.id, last_error_code: null,
    });
    if (!linked) {
      await markReview("preparing", "AUTH_LINK_FAILED");
      return reject(req, 503,
        "Compte cree, mais association interrompue. Controle manuel necessaire.");
    }

    // Marqueur serveur non modifiable par les utilisateurs : l'Auth Hook
    // ne journalise ensuite que ces nouveaux comptes familiaux.
    const marker = await service.auth.admin.updateUserById(created.id, {
      app_metadata: {
        ...(created.app_metadata ?? {}), schoolnet_family_invitation: true,
      },
    });
    if (marker.error || marker.data?.user?.id !== created.id ||
      marker.data?.user?.app_metadata?.schoolnet_family_invitation !== true) {
      await markReview("auth_created", "AUTH_MARKER_FAILED");
      return reject(req, 503, "Marqueur Auth indisponible : invitation non transmissible.");
    }

    const { data: provisional, error: provisionalError } = await service
      .from("profiles").select("id,role,full_name").eq("id", created.id).maybeSingle();
    if (provisionalError || !provisional ||
      provisional.role !== "student" || Boolean(provisional.full_name)) {
      await markReview("auth_created", "PROVISIONAL_PROFILE_INVALID");
      return reject(req, 409,
        "Profil provisoire inattendu. Ne transmettez aucun lien.");
    }
    const profilePatch: Record<string, unknown> = {
      role: expectedRole, full_name: name,
    };
    if (recipient === "student" &&
      ["male", "female"].includes(row.student_gender ?? "")) {
      profilePatch.gender = row.student_gender;
    }
    const { data: updatedProfile, error: profileError } = await service
      .from("profiles").update(profilePatch).eq("id", created.id)
      .eq("role", "student").select("id,role,full_name").maybeSingle();
    if (profileError || !updatedProfile || updatedProfile.role !== expectedRole ||
      updatedProfile.full_name !== name) {
      await markReview("auth_created", "PROFILE_UPDATE_FAILED");
      return reject(req, 503,
        "Profil non valide. Reprise supervisee requise.");
    }
    if (!await advance("auth_created", "profile_ready")) {
      await markReview("auth_created", "PROFILE_STAGE_FAILED");
      return reject(req, 503, "Sauvegarde du profil interrompue.");
    }

    // Lien initial d'invitation deja genere par Supabase Auth. Aucune
    // seconde generation recovery n'est requise pour un compte neuf.
    if (!await advance("profile_ready", "prepared", {
      generation_count: 1, last_prepared_at: new Date().toISOString(),
      last_error_code: null,
    })) {
      await markReview("profile_ready", "LINK_STAGE_FAILED");
      return reject(req, 503,
        "Lien non confirme dans le registre. Ne le transmettez pas.");
    }
    return linkResult(created.id, initialActionLink, 1);
  }

  // Reprise ou renouvellement exclusivement d'un compte DEJA lie au registre.
  // Un etat preparing / requires_review sans user_id ne peut jamais se recreer
  // automatiquement : la creation Auth pourrait avoir reussi en parallele.
  if (!previous || !previous.user_id || previous.email !== email ||
    previous.expected_role !== expectedRole) {
    return reject(req, 409,
      "Compte lie absent ou incoherent : revue manuelle requise.");
  }
  const allowedStates = action === "resume"
    ? ["auth_created", "profile_ready", "requires_review"]
    : ["prepared", "sent_declared"];
  if (!allowedStates.includes(previous.status)) {
    return reject(req, 409, "Etat non eligible pour cette operation.");
  }
  const lastUpdated = new Date(previous.updated_at).getTime();
  const lastPrepared = new Date(previous.last_prepared_at).getTime();
  const cooldownMs = action === "resume" ? 120_000 : 60_000;
  const referenceTime = action === "resume" ? lastUpdated : lastPrepared;
  if (!Number.isFinite(referenceTime) || Date.now() - referenceTime < cooldownMs) {
    return reject(req, 429,
      "Operation recente ou en cours : attendre avant toute reprise.");
  }
  if (previous.generation_count >= 5) {
    return reject(req, 409, "Limite de regenerations atteinte : revue manuelle.");
  }
  const { data: existingAuth, error: authError } =
    await service.auth.admin.getUserById(previous.user_id);
  const authUser = existingAuth.user as AuthUser | null;
  if (authError || !authUser || authUser.id !== previous.user_id ||
    authUser.email?.toLowerCase() !== email ||
    Boolean(authUser.last_sign_in_at) || Boolean(authUser.email_confirmed_at)) {
    return reject(req, 409,
      "Compte deja active, utilise ou incoherent : intervention manuelle.");
  }
  if (!found?.exists || found.user_id !== previous.user_id) {
    return reject(req, 409,
      "Identite Auth non coherente avec le registre : reprise interdite.");
  }
  const { data: profile, error: linkedProfileError } = await service
    .from("profiles").select("role,full_name").eq("id", previous.user_id)
    .maybeSingle();
  if (linkedProfileError || !profile) {
    return reject(req, 409, "Profil introuvable : reprise interdite.");
  }
  const isExpectedProfile = profile.role === expectedRole && profile.full_name === name;
  const isProvisional = action === "resume" && profile.role === "student" &&
    !profile.full_name;
  if (!isExpectedProfile && !isProvisional) {
    return reject(req, 409,
      "Le role ou l'identite du profil a change : revue manuelle.");
  }

  // Compare-and-swap : un seul operateur peut obtenir l'etat renewing.
  const locked = await advance(previous.status, "renewing", {
    recovery_note: verificationNote, last_error_code: null,
    sent_declared_at: null, sent_declared_by: null,
  });
  if (!locked) {
    return reject(req, 409,
      "Une autre operation a modifie l'invitation. Actualisez l'historique.");
  }

  if (isProvisional) {
    const patch: Record<string, unknown> = { role: expectedRole, full_name: name };
    if (recipient === "student" &&
      ["male", "female"].includes(row.student_gender ?? "")) {
      patch.gender = row.student_gender;
    }
    const { data: fixedProfile, error: fixedError } = await service
      .from("profiles").update(patch).eq("id", previous.user_id)
      .eq("role", "student").is("full_name", null)
      .select("role,full_name").maybeSingle();
    if (fixedError || !fixedProfile ||
      fixedProfile.role !== expectedRole || fixedProfile.full_name !== name) {
      await markReview("renewing", "RECOVERY_PROFILE_FAILED");
      return reject(req, 503, "Le profil ne peut pas etre repris automatiquement.");
    }
  }

  const { data: recoveryLink, error: recoveryError } =
    await service.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo },
    });
  if (recoveryError || !recoveryLink?.properties?.action_link ||
    recoveryLink.user?.id !== previous.user_id) {
    await markReview("renewing", "RECOVERY_LINK_FAILED");
    return reject(req, 503, "Renouvellement interrompu : suivi manuel necessaire.");
  }

  const nextCount = previous.generation_count + 1;
  if (!await advance("renewing", "prepared", {
    generation_count: nextCount, last_prepared_at: new Date().toISOString(),
    last_error_code: null,
  })) {
    await markReview("renewing", "RECOVERY_STAGE_FAILED");
    return reject(req, 503,
      "Lien genere mais non confirme. Ne le transmettez pas.");
  }
  return linkResult(previous.user_id, recoveryLink.properties.action_link, nextCount);
});
