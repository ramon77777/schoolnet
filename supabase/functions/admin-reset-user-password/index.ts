import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Méthode non autorisée." },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          error:
            "Configuration serveur Supabase incomplète.",
        },
        500,
      );
    }

    const authorization =
      req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Authentification requise." },
        401,
      );
    }

    const accessToken = authorization.slice(7);

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Vérifier l'utilisateur connecté.
    const {
      data: { user: currentUser },
      error: currentUserError,
    } = await adminClient.auth.getUser(accessToken);

    if (currentUserError || !currentUser) {
      return jsonResponse(
        { error: "Session invalide ou expirée." },
        401,
      );
    }

    // Vérifier qu'il s'agit d'un administrateur SchoolNet.
    const {
      data: currentProfile,
      error: profileError,
    } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (
      profileError ||
      !currentProfile ||
      currentProfile.role !== "admin"
    ) {
      return jsonResponse(
        {
          error:
            "Seul un administrateur peut réinitialiser un mot de passe.",
        },
        403,
      );
    }

    const body = await req.json();

    const userId =
      typeof body.user_id === "string"
        ? body.user_id.trim()
        : "";

    const newPassword =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!userId) {
      return jsonResponse(
        {
          error:
            "L'utilisateur à modifier est obligatoire.",
        },
        400,
      );
    }

    if (newPassword.length < 8) {
      return jsonResponse(
        {
          error:
            "Le nouveau mot de passe doit contenir au moins 8 caractères.",
        },
        400,
      );
    }

    // Vérifier que le compte existe.
    const {
      data: targetUserResult,
      error: targetUserError,
    } = await adminClient.auth.admin.getUserById(
      userId,
    );

    if (
      targetUserError ||
      !targetUserResult.user
    ) {
      return jsonResponse(
        {
          error:
            "Compte utilisateur introuvable.",
        },
        404,
      );
    }

    // Modifier uniquement le mot de passe.
    const {
      error: updateError,
    } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        password: newPassword,
      },
    );

    if (updateError) {
      return jsonResponse(
        {
          error:
            "Impossible de réinitialiser le mot de passe.",
          details: updateError.message,
        },
        500,
      );
    }

    return jsonResponse({
      success: true,
      message:
        "Le mot de passe a été réinitialisé avec succès.",
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inattendue.",
      },
      500,
    );
  }
});