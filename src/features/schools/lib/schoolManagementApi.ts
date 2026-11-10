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
