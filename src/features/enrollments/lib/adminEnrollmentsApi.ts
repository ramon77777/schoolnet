// src/features/enrollments/lib/adminEnrollmentsApi.ts
// SCHOOLNET | Lot 5 - Contrats d'acces aux inscriptions (admin uniquement).
import { supabase } from "@/lib/supabaseClient";

export type EnrollmentStatus =
  | "draft"
  | "active"
  | "withdrawn"
  | "completed"
  | "cancelled";

export type AdmissionType =
  | "new"
  | "continuing"
  | "transfer"
  | "reentry";

// Identite de l'apprenant (stockee dans profiles, pas dans chaque dossier annuel).
export type StudentGender = "male" | "female";

export type AdminEnrollment = {
  enrollment_id: string;
  enrollment_number: string | null;
  student_id: string;
  student_name: string | null;
  school_year_id: string;
  school_year_name: string;
  class_id: string;
  class_name: string;
  status: EnrollmentStatus;
  enrolled_on: string;
  admission_type: AdmissionType;
  previous_school: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EnrollmentEvent = {
  event_id: string;
  event_type: string;
  from_class_id: string | null;
  from_class_name: string | null;
  to_class_id: string | null;
  to_class_name: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

export type EnrollmentSchoolYear = {
  id: string;
  name: string;
  starts_on: string;
  is_current: boolean;
};

export type EnrollmentClass = {
  id: string;
  name: string;
  school_year_id: string | null;
  school_year: string;
};

export type EnrollmentStudent = {
  id: string;
  full_name: string | null;
  gender: StudentGender | null;
};

export type EnrollmentCatalog = {
  years: EnrollmentSchoolYear[];
  classes: EnrollmentClass[];
  students: EnrollmentStudent[];
};

export type EnrollmentFilters = {
  schoolYearId?: string | null;
  classId?: string | null;
  status?: EnrollmentStatus | null;
  search?: string | null;
};

export type EnrollmentSaveInput = {
  studentId: string;
  classId: string;
  gender: StudentGender;
  enrolledOn: string;
  admissionType: AdmissionType;
  previousSchool?: string | null;
  notes?: string | null;
};

export type EnrollmentSaveResult = {
  enrollment_id: string;
  enrollment_number: string | null;
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  school_year_id: string;
  school_year: string;
  previous_class: string | null;
  transferred: boolean;
  status: EnrollmentStatus;
};

export function enrollmentErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Une erreur inattendue s'est produite.";
}

export async function getAdminEnrollmentCatalog(): Promise<EnrollmentCatalog> {
  const [yearsResult, classesResult, studentsResult] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, name, starts_on, is_current")
      .order("starts_on", { ascending: false }),
    supabase
      .from("classes")
      .select("id, name, school_year_id, school_year")
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, gender")
      .eq("role", "student")
      .not("full_name", "is", null)
      .order("full_name", { ascending: true }),
  ]);

  if (yearsResult.error) throw yearsResult.error;
  if (classesResult.error) throw classesResult.error;
  if (studentsResult.error) throw studentsResult.error;

  return {
    years: (yearsResult.data ?? []) as EnrollmentSchoolYear[],
    classes: (classesResult.data ?? []) as EnrollmentClass[],
    // Ne jamais proposer un compte sans nom dans un formulaire d'inscription.
    students: ((studentsResult.data ?? []) as EnrollmentStudent[])
      .filter((student) => Boolean(student.full_name?.trim())),
  };
}

export async function getAdminEnrollments(
  filters: EnrollmentFilters = {},
): Promise<AdminEnrollment[]> {
  const { data, error } = await supabase.rpc("get_admin_student_enrollments", {
    p_school_year_id: filters.schoolYearId || null,
    p_class_id: filters.classId || null,
    p_status: filters.status || null,
    p_search: filters.search?.trim() || null,
  });
  if (error) throw error;
  return (data ?? []) as AdminEnrollment[];
}

export async function saveAdminEnrollment(
  input: EnrollmentSaveInput,
): Promise<EnrollmentSaveResult> {
  // Une seule transaction SQL pour dossier annuel + genre du profil.
  const { data, error } = await supabase.rpc(
    "admin_upsert_student_enrollment_with_gender",
    {
      p_student_id: input.studentId,
      p_class_id: input.classId,
      p_enrolled_on: input.enrolledOn || null,
      p_admission_type: input.admissionType,
      p_previous_school: input.previousSchool?.trim() || null,
      p_notes: input.notes?.trim() || null,
      p_gender: input.gender,
    },
  );
  if (error) throw error;
  return data as EnrollmentSaveResult;
}

export async function setAdminEnrollmentStatus(
  enrollmentId: string,
  status: EnrollmentStatus,
  note?: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_student_enrollment_status", {
    p_enrollment_id: enrollmentId,
    p_status: status,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
}

export async function getAdminEnrollmentHistory(
  enrollmentId: string,
): Promise<EnrollmentEvent[]> {
  const { data, error } = await supabase.rpc(
    "get_admin_student_enrollment_history",
    { p_enrollment_id: enrollmentId },
  );
  if (error) throw error;
  return (data ?? []) as EnrollmentEvent[];
}
