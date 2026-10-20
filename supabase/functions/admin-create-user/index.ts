import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedRoles = new Set([
  "admin",
  "teacher",
  "student",
  "parent",
]);

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

    const authorization = req.headers.get("Authorization");

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

    // 1. Vérifier l'utilisateur qui appelle la fonction.
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

    // 2. Vérifier qu'il s'agit réellement d'un administrateur SchoolNet.
    const {
      data: currentProfile,
      error: currentProfileError,
    } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", currentUser.id)
      .single();

    if (currentProfileError || !currentProfile) {
      return jsonResponse(
        { error: "Profil administrateur introuvable." },
        403,
      );
    }

    if (currentProfile.role !== "admin") {
      return jsonResponse(
        {
          error:
            "Seul un administrateur peut créer un utilisateur.",
        },
        403,
      );
    }

    // 3. Lire et contrôler les données reçues.
    const body = await req.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    const fullName =
      typeof body.full_name === "string"
        ? body.full_name.trim()
        : "";

    const role =
      typeof body.role === "string"
        ? body.role.trim()
        : "";

    const phone =
      typeof body.phone === "string" &&
      body.phone.trim()
        ? body.phone.trim()
        : null;

    const classId =
      role === "student" &&
      typeof body.class_id === "string" &&
      body.class_id.trim()
        ? body.class_id.trim()
        : null;

    if (!email) {
      return jsonResponse(
        { error: "L’adresse e-mail est obligatoire." },
        400,
      );
    }

    if (!fullName) {
      return jsonResponse(
        { error: "Le nom complet est obligatoire." },
        400,
      );
    }

    if (!allowedRoles.has(role)) {
      return jsonResponse(
        { error: "Le rôle sélectionné est invalide." },
        400,
      );
    }

    if (password.length < 8) {
      return jsonResponse(
        {
          error:
            "Le mot de passe doit contenir au moins 8 caractères.",
        },
        400,
      );
    }

    // Vérifier la classe sélectionnée et récupérer son vrai nom.
    let className: string | null = null;

    if (role === "student" && classId) {
      const {
        data: selectedClass,
        error: selectedClassError,
      } = await adminClient
        .from("classes")
        .select("id, name")
        .eq("id", classId)
        .maybeSingle();

      if (selectedClassError || !selectedClass) {
        return jsonResponse(
          {
            error:
              "La classe sélectionnée est introuvable ou n'est plus disponible.",
          },
          400,
        );
      }

      className =
        typeof selectedClass.name === "string"
          ? selectedClass.name.trim()
          : null;
    }

    // 4. Créer le compte Supabase Auth.
    const {
      data: createResult,
      error: createError,
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createError || !createResult.user) {
      return jsonResponse(
        {
          error:
            createError?.message ??
            "Impossible de créer le compte utilisateur.",
        },
        400,
      );
    }

    const newUser = createResult.user;

    // Le trigger handle_new_user() vient normalement de créer
    // profiles(id, role='student', full_name=NULL).
    // L'upsert permet néanmoins de rendre l'opération robuste.
    const {
      error: profileError,
    } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: newUser.id,
          role,
          full_name: fullName,
          phone,
          class_name: className,
        },
        {
          onConflict: "id",
        },
      );

    if (profileError) {
      // Éviter de laisser un compte Auth orphelin
      // si le profil ne peut pas être finalisé.
      await adminClient.auth.admin.deleteUser(
        newUser.id,
      );

      return jsonResponse(
        {
          error:
            "Le compte n’a pas pu être finalisé dans SchoolNet.",
          details: profileError.message,
        },
        500,
      );
    }

    // Si l'utilisateur est un apprenant et qu'une classe a été choisie,
    // créer le véritable rattachement pédagogique.
    if (role === "student" && classId) {
      const {
        error: classStudentError,
      } = await adminClient
        .from("class_students")
        .insert({
          class_id: classId,
          student_id: newUser.id,
        });

      if (classStudentError) {
        // Ne pas laisser un utilisateur partiellement créé.
        await adminClient
          .from("profiles")
          .delete()
          .eq("id", newUser.id);

        await adminClient.auth.admin.deleteUser(
          newUser.id,
        );

        return jsonResponse(
          {
            error:
              "Le compte n'a pas pu être rattaché à la classe sélectionnée.",
            details: classStudentError.message,
          },
          500,
        );
      }
    }

    return jsonResponse({
      success: true,
      message: `L’utilisateur « ${fullName} » a été créé avec succès.`,
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: fullName,
        role,
        phone,
        class_id: classId,
        class_name: className,
      },
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