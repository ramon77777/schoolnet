// SCHOOLNET 2.0 — Invitations manuelles des administrateurs d'etablissement.
// Aucun email envoye : le super-admin copie une invitation a usage temporaire.
// IMPORTANT : ne pas deplacer la cle service_role dans le navigateur.
import { createClient } from "jsr:@supabase/supabase-js@2";

type Body = {
  action?: unknown;
  school_id?: unknown;
  email?: unknown;
  full_name?: unknown;
};
type Found = {
  exists: boolean;
  user_id: string | null;
  role: string | null;
};
type School = { id: string; name: string; status: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Exact origins only: the main site, this PR's preview, and configured extras.
// A preview URL changes across branches; never use a *.vercel.app wildcard.
const allowedOrigins = new Set([
  "https://schoolnet-snowy.vercel.app",
  "https://schoolnet-git-feature-schoolnet-mul-4bbbf5-ramon77777s-projects.vercel.app",
  ...(Deno.env.get("SCHOOLNET_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
]);

// Un lien genere depuis la Preview doit y revenir pour que school_admin
// puisse acceder au nouvel espace encore absent du site principal.
// La destination n'est JAMAIS fournie par le navigateur : seules
// les origines exactes connues ici determinent la redirection.
const previewOrigin =
  "https://schoolnet-git-feature-schoolnet-mul-4bbbf5-ramon77777s-projects.vercel.app";
const previewRedirectTo =
  previewOrigin + "/auth/reset-password?mode=school-invite";
const defaultRedirectTo = Deno.env.get("SCHOOLNET_INVITE_REDIRECT_URL") ??
  "https://schoolnet-snowy.vercel.app/auth/reset-password?mode=school-invite";

function response(req: Request, body: Record<string, unknown>, status = 200) {
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
  return new Response(JSON.stringify(body), { status, headers });
}
function rejected(req: Request, status: number, error: string) {
  return response(req, { success: false, error }, status);
}
function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  // Si le navigateur transmet Origin, ce domaine doit etre explicitement autorise.
  if (origin && !allowedOrigins.has(origin)) {
    return rejected(req, 403, "Domaine d'origine non autorise.");
  }
  if (req.method === "OPTIONS") {
    if (!origin) return rejected(req, 403, "Origine requise.");
    return response(req, { success: true });
  }
  if (req.method !== "POST") return rejected(req, 405, "Methode non autorisee.");
  if (!origin || !allowedOrigins.has(origin)) {
    return rejected(req, 403, "Origine de la requete non autorisee.");
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return rejected(req, 401, "Connexion administrateur requise.");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !publicKey) {
    return rejected(req, 503, "Service d'invitation non configure.");
  }
  // Les invitations emises depuis la Preview PR #6 retournent vers la
  // Preview. Depuis le site principal, la cible existante est conservee.
  const redirectTo = origin === previewOrigin ? previewRedirectTo : defaultRedirectTo;
  let redirect: URL;
  try {
    redirect = new URL(redirectTo);
    if (redirect.protocol !== "https:" || redirect.username ||
        redirect.password || redirect.hash || !redirect.pathname.endsWith("/auth/reset-password")) {
      throw new Error("Unsafe invitation redirect");
    }
  } catch {
    return rejected(req, 503, "URL d'activation SCHOOLNET non configuree.");
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const scoped = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authResult, error: authError } =
    await service.auth.getUser(authorization.slice(7));
  const caller = authResult.user;
  if (authError || !caller) return rejected(req, 401, "Session expiree.");
  const { data: callerProfile, error: callerError } =
    await service.from("profiles").select("role").eq("id", caller.id).maybeSingle();
  if (callerError || callerProfile?.role !== "admin") {
    return rejected(req, 403, "Action reservee au Super Administrateur SCHOOLNET.");
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return rejected(req, 400, "Formulaire invalide.");
  }
  const action = trim(body.action);
  const schoolId = trim(body.school_id);
  const email = trim(body.email).toLowerCase();
  const name = trim(body.full_name);
  if ((action !== "create" && action !== "renew") ||
      !uuidPattern.test(schoolId) || email.length > 254 || !emailPattern.test(email) ||
      (action === "create" && (name.length < 3 || name.length > 160))) {
    return rejected(req, 400, "Informations d'invitation invalides.");
  }
  const { data: schoolData, error: schoolError } = await service
    .from("schoolnet_schools").select("id,name,status")
    .eq("id", schoolId).maybeSingle();
  const school = schoolData as School | null;
  if (schoolError) return rejected(req, 503, "Gestion des etablissements non activee.");
  if (!school || school.status !== "active") {
    return rejected(req, 404, "Etablissement inexistant ou suspendu.");
  }

  const { data: foundData, error: foundError } =
    await scoped.rpc("schoolnet_admin_lookup_auth_email", { p_email: email });
  if (foundError) return rejected(req, 503, "Verification des comptes indisponible.");
  const found = foundData as Found | null;

  let userId = "";
  let newlyCreated = false;
  let link = "";
  let generated = false;

  if (action === "create") {
    if (found?.exists) {
      return rejected(req, 409,
        "Un compte utilise deja cet email. Aucun changement de role automatique : verifiez d'abord l'identite.");
    }
    // L'invitation Supabase cree un compte sans envoyer d'e-mail.
    // Le trigger Auth cree un profil provisoire 'student' qu'on remplacera.
    const startedAt = Date.now();
    const { data: generatedLink, error: linkError } =
      await service.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: redirect.toString() },
      });
    if (linkError || !generatedLink?.user) {
      return rejected(req, 502,
        "Generation du lien impossible. Verifiez l'email et reessayez.");
    }
    const candidate = generatedLink.user;
    const createdAt = Date.parse(candidate.created_at ?? "");
    // Securite anti-concurrence: ne JAMAIS promouvoir/supprimer un compte
    // preexistant, meme si la recherche initiale n'avait rien trouve.
    if (candidate.email?.toLowerCase() !== email ||
        !Number.isFinite(createdAt) ||
        createdAt < startedAt - 15_000 ||
        Boolean(candidate.last_sign_in_at) ||
        Boolean(candidate.email_confirmed_at)) {
      return rejected(req, 409,
        "Le compte existe deja ou a change pendant l'operation. Verification manuelle necessaire.");
    }
    userId = candidate.id;
    newlyCreated = true;
    generated = true;
    if (!generatedLink.properties?.action_link) {
      const { error: cleanupError } = await service.auth.admin.deleteUser(userId);
      return rejected(req, cleanupError ? 500 : 502, cleanupError
        ? "Compte provisoire a verifier manuellement avant de recommencer."
        : "Lien d'invitation non genere. Aucun compte n'a ete conserve.");
    }
    link = generatedLink.properties.action_link;
  } else {
    if (!found?.exists || !found.user_id || found.role !== "school_admin") {
      return rejected(req, 409,
        "Le compte administrateur local n'existe pas. Aucun rattachement automatique d'un autre role.");
    }
    userId = found.user_id;
    const { data: linked, error: linkedError } = await service
      .from("schoolnet_school_memberships")
      .select("id")
      .eq("school_id", schoolId)
      .eq("user_id", userId)
      .eq("member_role", "school_admin")
      .eq("status", "active")
      .maybeSingle();
    if (linkedError || !linked) {
      return rejected(req, 403,
        "Ce compte n'est pas administrateur de l'etablissement selectionne.");
    }
    const { data: previous, error: previousError } = await service
      .from("schoolnet_school_admin_invitations")
      .select("last_prepared_at")
      .eq("school_id", schoolId).eq("user_id", userId).maybeSingle();
    if (previousError || !previous) {
      return rejected(req, 409, "Invitation initiale introuvable. Contactez l'administration.");
    }
    if (Date.now() - new Date(previous.last_prepared_at as string).getTime() < 60_000) {
      return rejected(req, 429, "Un lien vient d'etre genere. Reessayez dans une minute.");
    }
    const { data: existingAuth, error: existingError } =
      await service.auth.admin.getUserById(userId);
    if (existingError || existingAuth.user?.email?.toLowerCase() !== email) {
      return rejected(req, 409, "Compte cible incoherent. Operation annulee.");
    }
    const { data: generatedLink, error: linkError } =
      await service.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: redirect.toString() },
      });
    if (linkError || !generatedLink.properties?.action_link) {
      return rejected(req, 502, "Impossible de regenerer le lien d'activation.");
    }
    link = generatedLink.properties.action_link;
    generated = true;
  }

  // Les deux actions Auth et SQL ne sont pas une transaction partagee.
  // En cas d'echec SQL, supprimer UNIQUEMENT un compte Auth tout juste cree.
  try {
    if (newlyCreated) {
      const { data: provisional, error: provisionalError } = await service
        .from("profiles").select("role,full_name").eq("id", userId).maybeSingle();
      if (provisionalError || provisional?.role !== "student" || provisional?.full_name) {
        throw new Error("PROFILE_PREEXISTING_OR_INCOMPATIBLE");
      }
      const { data: profile, error: profileError } = await service
        .from("profiles")
        .update({ role: "school_admin", full_name: name })
        .eq("id", userId)
        .select("id,role")
        .single();
      if (profileError || profile?.role !== "school_admin") {
        throw new Error("PROFILE_NOT_READY");
      }
    }
    const { data: record, error: recordError } = await scoped
      .rpc("schoolnet_admin_record_school_invitation", {
        p_school_id: schoolId,
        p_user_id: userId,
      });
    if (recordError || !record || record.user_id !== userId) {
      throw new Error("SCHOOL_ASSIGNMENT_NOT_READY");
    }

    // Valeur sensible renvoyee une seule fois au super-admin, sans log ni stockage.
    return response(req, {
      success: true,
      status: "prepared",
      user_id: userId,
      email,
      full_name: newlyCreated ? name : null,
      school_id: schoolId,
      school_name: school.name,
      link,
      invitation_type: newlyCreated ? "invite" : "recovery",
      generation_count: record.generation_count,
    });
  } catch {
    if (newlyCreated && generated && userId) {
      const { error: deleteError } = await service.auth.admin.deleteUser(userId);
      if (deleteError) {
        return rejected(req, 500,
          "Preparation incomplete : un compte provisoire peut exister. Demandez une verification avant de recommencer.");
      }
    }
    return rejected(req, 500,
      "Invitation non finalisee. Aucune invitation ne doit etre envoyee.");
  }
});
