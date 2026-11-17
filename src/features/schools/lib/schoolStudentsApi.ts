import { supabase } from "@/lib/supabaseClient";
import {
  areSchoolStudentsReadOnly,
  SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE,
} from "./schoolStudentWritePolicy";

export type LocalSchoolStudent = {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  status: "active" | "revoked";
  assigned_at: string;
  revoked_at: string | null;
};

export type LocalSchoolStudentRoster = {
  school_id: string;
  students: LocalSchoolStudent[];
};

type RpcError = { code?: string; message?: string; details?: string };

export function isSchoolStudentsActivationPending(cause: unknown): boolean {
  const error = (cause ?? {}) as RpcError;
  const message = [error.message, error.details].filter(Boolean).join(" ").toLowerCase();
  return error.code === "PGRST202" ||
    (message.includes("schoolnet_school_student_") &&
      (message.includes("schema cache") || message.includes("not find")));
}

export function schoolStudentErrorMessage(cause: unknown): string {
  const error = (cause ?? {}) as RpcError;
  if (error.message === SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE) {
    return SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE;
  }
  if (error.code === "23505") {
    return "Cet élève est déjà rattaché à cet établissement. Réactivez son affiliation si nécessaire.";
  }
  if (error.code === "42501") {
    return "Action refusée : vérifiez vos droits, votre établissement et l'environnement.";
  }
  if (error.code === "22023") {
    return "Compte élève introuvable ou non éligible au rattachement par e-mail. Vérifiez son activation.";
  }
  return "Opération impossible pour le moment. Réessayez ou contactez l'administration SCHOOLNET.";
}

function isStudentRoster(value: unknown, schoolId: string): value is LocalSchoolStudentRoster {
  if (!value || typeof value !== "object") return false;
  const roster = value as Record<string, unknown>;
  if (roster.school_id !== schoolId || !Array.isArray(roster.students)) return false;
  return roster.students.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.membership_id === "string" &&
      typeof row.user_id === "string" &&
      typeof row.full_name === "string" &&
      (row.email === null || typeof row.email === "string") &&
      (row.status === "active" || row.status === "revoked") &&
      typeof row.assigned_at === "string" &&
      (row.revoked_at === null || typeof row.revoked_at === "string");
  });
}

export async function getLocalSchoolStudentRoster(
  schoolId: string,
): Promise<LocalSchoolStudentRoster> {
  const { data, error } = await supabase.rpc("schoolnet_school_student_roster", {
    p_school_id: schoolId,
  });
  if (error) throw error;
  if (!isStudentRoster(data, schoolId)) {
    throw new Error("Répertoire élèves invalide.");
  }
  return data;
}

export async function attachLocalSchoolStudent(
  schoolId: string,
  email: string,
): Promise<string> {
  // Pas de mutation si localhost, Preview, SSR ou projet Supabase inattendu.
  // La RPC verifie independamment la session et l'etablissement.
  if (areSchoolStudentsReadOnly()) {
    throw new Error(SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE);
  }
  const { data, error } = await supabase.rpc("schoolnet_school_student_attach", {
    p_school_id: schoolId,
    p_email: email.trim().toLowerCase(),
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Rattachement élève non confirmé.");
  return data;
}

export async function setLocalSchoolStudentActive(
  schoolId: string,
  membershipId: string,
  active: boolean,
): Promise<string> {
  if (areSchoolStudentsReadOnly()) {
    throw new Error(SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE);
  }
  const { data, error } = await supabase.rpc("schoolnet_school_student_set_active", {
    p_school_id: schoolId,
    p_membership_id: membershipId,
    p_active: active,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Modification de statut non confirmée.");
  return data;
}
