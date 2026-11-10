import { supabase } from "@/lib/supabaseClient";

export type SchoolRecord = {
  id: string;
  code: string;
  name: string;
  contact_email: string | null;
  status: "active" | "suspended";
  created_at: string;
  created_by: string;
};

export type SchoolMembership = {
  id: string;
  school_id: string;
  user_id: string;
  member_role: "school_admin" | "teacher" | "student" | "parent";
  status: "active" | "revoked";
};

type ErrorData = { code?: string; message?: string; details?: string };

export function isSchoolSetupPending(error: unknown): boolean {
  const e = (error ?? {}) as ErrorData;
  const message = String(e.message ?? "") + " " + String(e.details ?? "");
  return e.code === "42P01" || e.code === "PGRST205" ||
    e.code === "PGRST202" ||
    (message.includes("schoolnet_schools") &&
      (message.includes("schema cache") || message.includes("does not exist")));
}

export function schoolManagementError(error: unknown): string {
  const e = (error ?? {}) as ErrorData;
  if (e.code === "23505") return "Ce code d'établissement existe déjà.";
  if (e.code === "42501") return "Action réservée au Super Administrateur SCHOOLNET.";
  return e.message || "Impossible de traiter cette opération.";
}

export async function getAdminSchools(): Promise<SchoolRecord[]> {
  const { data, error } = await supabase
    .from("schoolnet_schools")
    .select("id,code,name,contact_email,status,created_at,created_by")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SchoolRecord[];
}

export async function getActiveSchoolAdmins(): Promise<SchoolMembership[]> {
  const { data, error } = await supabase
    .from("schoolnet_school_memberships")
    .select("id,school_id,user_id,member_role,status")
    .eq("member_role", "school_admin")
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as SchoolMembership[];
}

export async function createAdminSchool(input: {
  name: string;
  code: string;
  contactEmail: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("schoolnet_admin_create_school", {
    p_name: input.name.trim(),
    p_code: input.code.trim().toUpperCase(),
    p_contact_email: input.contactEmail.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Création non confirmée par Supabase.");
  return data;
}


export type SchoolAdminInvitation = {
  school_id: string;
  user_id: string;
  email: string;
  first_prepared_at: string;
  last_prepared_at: string;
  generation_count: number;
  sent_declared_at: string | null;
};

export type PreparedSchoolAdminInvitation = {
  success: true;
  status: "prepared";
  user_id: string;
  email: string;
  full_name: string | null;
  school_id: string;
  school_name: string;
  link: string; // sensible : seulement dans l'etat React en memoire
  invitation_type: "invite" | "recovery";
  generation_count: number;
};

export async function getSchoolAdminInvitations(): Promise<SchoolAdminInvitation[]> {
  const { data, error } = await supabase
    .from("schoolnet_school_admin_invitations")
    .select("school_id,user_id,email,first_prepared_at,last_prepared_at,generation_count,sent_declared_at")
    .order("last_prepared_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SchoolAdminInvitation[];
}

export async function prepareSchoolAdminInvitation(input: {
  action: "create" | "renew";
  schoolId: string;
  email: string;
  fullName?: string;
}): Promise<PreparedSchoolAdminInvitation> {
  const { data, error } = await supabase.functions.invoke("schoolnet-admin-invitation", {
    body: {
      action: input.action,
      school_id: input.schoolId,
      email: input.email.trim().toLowerCase(),
      full_name: input.fullName?.trim() ?? "",
    },
  });
  if (error) {
    let message = error.message;
    if ("context" in error && error.context instanceof Response) {
      try {
        const body = (await error.context.clone().json()) as { error?: string };
        if (typeof body.error === "string" && body.error) message = body.error;
      } catch {
        // Message technique non expose en detail.
      }
    }
    throw new Error(message || "Impossible de préparer l'invitation.");
  }
  const invite = data as Partial<PreparedSchoolAdminInvitation> | null;
  if (!invite || invite.success !== true || typeof invite.link !== "string" ||
      !invite.link.startsWith("https://") || !invite.user_id || !invite.school_name) {
    throw new Error("Le serveur n'a pas confirmé la préparation du lien.");
  }
  return invite as PreparedSchoolAdminInvitation;
}

export async function markSchoolAdminInvitationSent(schoolId: string, userId: string) {
  const { error } = await supabase.rpc("schoolnet_admin_mark_school_invitation_sent", {
    p_school_id: schoolId,
    p_user_id: userId,
  });
  if (error) throw error;
}
