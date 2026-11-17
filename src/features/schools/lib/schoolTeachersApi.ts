import { supabase } from "@/lib/supabaseClient";
import {
  areSchoolTeachersReadOnly,
  SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE,
} from "./schoolTeacherWritePolicy";

export type LocalSchoolTeacher = {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  status: "active" | "revoked";
  assigned_at: string;
  revoked_at: string | null;
};

export type LocalSchoolTeacherRoster = {
  school_id: string;
  teachers: LocalSchoolTeacher[];
};

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
};

export function isSchoolTeachersActivationPending(cause: unknown): boolean {
  const error = (cause ?? {}) as RpcError;
  const message = [error.message, error.details].filter(Boolean).join(" ").toLowerCase();
  return error.code === "PGRST202" ||
    (message.includes("schoolnet_school_teacher_") &&
      (message.includes("schema cache") || message.includes("not find")));
}

export function schoolTeacherErrorMessage(cause: unknown): string {
  const error = (cause ?? {}) as RpcError;
  if (error.message === SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE) {
    return SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE;
  }
  if (error.code === "23505") {
    return "Cet enseignant est déjà rattaché à l'établissement. Réactivez son affiliation si nécessaire.";
  }
  if (error.code === "42501") {
    return "Action refusée : vérifiez votre établissement, vos droits et l'environnement utilisé.";
  }
  if (error.code === "22023") {
    return "Compte enseignant introuvable ou non éligible. Vérifiez son adresse e-mail et son activation.";
  }
  return "Impossible de traiter cette opération. Réessayez ou contactez l'administration SCHOOLNET.";
}

function isTeacherRoster(value: unknown, schoolId: string): value is LocalSchoolTeacherRoster {
  if (!value || typeof value !== "object") return false;
  const roster = value as Record<string, unknown>;
  if (roster.school_id !== schoolId || !Array.isArray(roster.teachers)) return false;
  return roster.teachers.every((value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const teacher = value as Record<string, unknown>;
    return typeof teacher.membership_id === "string" &&
      typeof teacher.user_id === "string" &&
      typeof teacher.full_name === "string" &&
      typeof teacher.email === "string" &&
      (teacher.status === "active" || teacher.status === "revoked") &&
      typeof teacher.assigned_at === "string" &&
      (teacher.revoked_at === null || typeof teacher.revoked_at === "string");
  });
}

export async function getLocalSchoolTeacherRoster(
  schoolId: string,
): Promise<LocalSchoolTeacherRoster> {
  const { data, error } = await supabase.rpc("schoolnet_school_teacher_roster", {
    p_school_id: schoolId,
  });
  if (error) throw error;
  if (!isTeacherRoster(data, schoolId)) {
    throw new Error("Répertoire enseignants invalide.");
  }
  return data;
}

export async function attachLocalSchoolTeacher(
  schoolId: string,
  email: string,
): Promise<string> {
  // Interdit toute ecriture depuis localhost, Preview Vercel et SSR.
  // Le serveur recontrole auth.uid(), role, ecole et Origin.
  if (areSchoolTeachersReadOnly()) {
    throw new Error(SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE);
  }
  const { data, error } = await supabase.rpc("schoolnet_school_teacher_attach", {
    p_school_id: schoolId,
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Rattachement non confirmé.");
  return data;
}

export async function setLocalSchoolTeacherActive(
  schoolId: string,
  membershipId: string,
  active: boolean,
): Promise<string> {
  if (areSchoolTeachersReadOnly()) {
    throw new Error(SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE);
  }
  const { data, error } = await supabase.rpc("schoolnet_school_teacher_set_active", {
    p_school_id: schoolId,
    p_membership_id: membershipId,
    p_active: active,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Changement d'affiliation non confirmé.");
  return data;
}
