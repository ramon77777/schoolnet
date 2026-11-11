// SCHOOLNET — Lot 5.C-B.2. FONCTION PREPAREE, NON DEPLOYEE.
// Elle ne doit etre activee qu'apres creation + recette du registre SQL
// schoolnet_family_invitation_records et approbation de la migration.
// AUCUN email n'est envoye : le responsable scolaire transmet le lien manuellement.
// Le service-role ne doit jamais etre expose au navigateur.
import { createClient } from "jsr:@supabase/supabase-js@2";

type Action = "inspect" | "prepare";
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
type Body = {
  action?: unknown;
  request_id?: unknown;
  recipient?: unknown;
  verified?: unknown;
  verification_note?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedOrigins = new Set([
  "https://schoolnet-snowy.vercel.app",
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

  // Garde-fou serveur : ce code reste inactif meme apres un deploiement
  // accidentel tant que le registre et la recette ne sont pas autorises.
  const enabled = Deno.env.get("SCHOOLNET_FAMILY_INVITES_ENABLED") === "true";
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return reject(req, 401, "Connexion administrateur requise.");
  }
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !anonKey || !serviceKey) {
    return reject(req, 503, "Service indisponible.");
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
  const requestId = clean(body.request_id);
  const recipient = clean(body.recipient) as Recipient;
  if ((action !== "inspect" && action !== "prepare") ||
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
  if (row.status === "rejected" || row.status === "processed") {
    return reject(req, 409, "Cette demande ne permet pas une nouvelle invitation.");
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
  if (resolution) return reject(req, 409, "Demande deja finalisee.");

  const { data: foundData, error: lookupError } = await scoped
    .rpc("schoolnet_admin_lookup_auth_email", { p_email: email });
  if (lookupError) return reject(req, 503, "Recherche des comptes indisponible.");
  const found = foundData as Lookup | null;
  if (action === "inspect") {
    return send(req, {
      success: true,
      request_id: requestId,
      reference: row.reference,
      recipient,
      role: expectedRole,
      email,
      full_name: name,
      decision: found?.exists
        ? found.role === expectedRole ? "reuse_after_verification" : "manual_review"
        : "new_invitation_possible",
      no_write: true,
    });
  }

  if (!enabled) {
    return reject(req, 503, "Les invitations familiales ne sont pas encore activees.");
  }
  if (body.verified !== true) {
    return reject(req, 422, "Une verification administrative explicite est requise.");
  }
  const verificationNote = clean(body.verification_note);
  if (verificationNote.length < 10 || verificationNote.length > 1000) {
    return reject(req, 422, "Ajoutez une note de verification de 10 a 1000 caracteres.");
  }
  if (found?.exists) {
    return reject(req, 409,
      found.role === expectedRole
        ? "Ce compte existe deja. Reutilisez-le apres verification, sans lui envoyer une invitation de creation."
        : "Cet e-mail appartient a un autre role : controle manuel obligatoire.");
  }
  const redirectTo = destination(origin);
  if (!redirectTo) return reject(req, 503, "Redirection d'activation non autorisee.");

  // Reserve d'abord la demande dans un registre unique (request_id, recipient)
  // pour bloquer doubles clics et executions paralleles.
  // Cette table n'existe pas encore : elle necessite une migration APPROUVEE.
  const { data: reservation, error: reserveError } = await service
    .from("schoolnet_family_invitation_records")
    .insert({
      request_id: requestId,
      recipient,
      expected_role: expectedRole,
      email,
      verification_note: verificationNote,
      prepared_by: callerId,
      status: "preparing",
      generation_count: 0,
    })
    .select("request_id,recipient,status").single();
  if (reserveError || !reservation) {
    const isMissing = reserveError?.code === "42P01" || reserveError?.code === "PGRST205";
    return reject(req, isMissing ? 503 : 409, isMissing
      ? "Registre d'invitations non active : migration a valider."
      : "Une preparation existe deja ou le registre est indisponible. Verifiez l'historique avant de recommencer.");
  }

  // Aucune creation de mot de passe en clair. Un compte Auth provisoire
  // est cree par generateLink(invite) et le destinataire choisit son secret.
  const startedAt = Date.now();
  const { data: invite, error: inviteError } = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  const candidate = invite?.user;
  const createdAt = Date.parse(candidate?.created_at ?? "");
  if (inviteError || !candidate || candidate.email?.toLowerCase() !== email ||
    !Number.isFinite(createdAt) || createdAt < startedAt - 15_000 ||
    Boolean(candidate.last_sign_in_at) || Boolean(candidate.email_confirmed_at) ||
    !invite.properties?.action_link) {
    // Jamais de suppression automatique : une personne pourrait deja utiliser
    // ce compte. Le registre "preparing" bloque la reprise aveugle.
    return reject(req, 409,
      "Preparation interrompue : verifiez le compte Auth provisoire avant toute nouvelle tentative.");
  }

  const { data: provisional, error: provisionalError } = await service.from("profiles")
    .select("id,role,full_name").eq("id", candidate.id).maybeSingle();
  if (provisionalError || !provisional || provisional.role !== "student" ||
    Boolean(provisional.full_name)) {
    return reject(req, 409,
      "Profil provisoire incoherent : controle manuel necessaire avant toute invitation.");
  }
  const nextProfile: Record<string, unknown> = {
    role: expectedRole, full_name: name,
  };
  if (recipient === "student" && (row.student_gender === "male" || row.student_gender === "female")) {
    nextProfile.gender = row.student_gender;
  }
  const { data: updatedProfile, error: updateError } = await service.from("profiles")
    .update(nextProfile).eq("id", candidate.id).eq("role", "student")
    .select("id,role").single();
  if (updateError || !updatedProfile || updatedProfile.role !== expectedRole) {
    return reject(req, 503,
      "Compte provisoire non finalise. Controle technique requis avant transmission.");
  }

  const { data: saved, error: saveError } = await service.from("schoolnet_family_invitation_records")
    .update({
      user_id: candidate.id,
      status: "prepared",
      generation_count: 1,
      last_prepared_at: new Date().toISOString(),
    })
    .eq("request_id", requestId)
    .eq("recipient", recipient)
    .eq("status", "preparing")
    .eq("prepared_by", callerId)
    .select("user_id,status").single();
  if (saveError || saved?.user_id !== candidate.id || saved.status !== "prepared") {
    return reject(req, 503,
      "Invitation non finalisee. Ne transmettez aucun lien ; intervention requise.");
  }
  // Lien sensible renvoye UNE SEULE FOIS ; jamais de stockage SQL ou journal.
  return send(req, {
    success: true,
    status: "prepared",
    request_id: requestId,
    recipient,
    user_id: candidate.id,
    email,
    full_name: name,
    role: expectedRole,
    link: invite.properties.action_link,
    no_email_sent: true,
  });
});
