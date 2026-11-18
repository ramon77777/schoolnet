import { supabase } from "@/lib/supabaseClient";
import {
  areSchoolAssignmentsReadOnly,
  SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE,
} from "./schoolAssignmentWritePolicy";

export type SchoolAssignmentClass = {
  id: string;
  name: string;
  school_year_id: string;
  school_year: string;
  level_name: string;
};

export type SchoolAssignmentMember = {
  id: string;
  full_name: string;
  status: "active";
};

export type SchoolAssignmentSubject = {
  id: string;
  name: string;
  code: string;
};

export type StudentClassAssignment = {
  id: string;
  class_id: string;
  school_year_id: string;
  student_id: string;
  student_name: string;
  status: "active" | "revoked";
  effective_active: boolean;
  assigned_at: string;
  revoked_at: string | null;
};

export type TeacherSubjectAssignment = {
  id: string;
  class_id: string;
  school_year_id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string;
  subject_name: string;
  status: "active" | "revoked";
  effective_active: boolean;
  assigned_at: string;
  revoked_at: string | null;
};

export type SchoolAssignmentEvent = {
  id: string;
  class_id: string;
  assignment_kind: "student_class" | "teacher_subject";
  action: "assigned" | "revoked" | "reactivated";
  member_name: string;
  subject_name: string | null;
  actor_name: string;
  created_at: string;
};

export type SchoolAssignmentsCatalog = {
  school_id: string;
  events: SchoolAssignmentEvent[];
  classes: SchoolAssignmentClass[];
  students: SchoolAssignmentMember[];
  teachers: SchoolAssignmentMember[];
  subjects: SchoolAssignmentSubject[];
  student_assignments: StudentClassAssignment[];
  teacher_assignments: TeacherSubjectAssignment[];
};

type RpcError = { code?: string; message?: string; details?: string };

export function isSchoolAssignmentsActivationPending(cause: unknown): boolean {
  const error = (cause ?? {}) as RpcError;
  const message = [error.message, error.details].filter(Boolean).join(" ").toLowerCase();
  return error.code === "PGRST202" ||
    (message.includes("schoolnet_school_assignment_") &&
      (message.includes("schema cache") || message.includes("not find")));
}

export function schoolAssignmentsErrorMessage(cause: unknown): string {
  const error = (cause ?? {}) as RpcError;
  if (error.message === SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE) {
    return SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE;
  }
  if (error.code === "23505") {
    return "Affectation en doublon, ou élève déjà affecté à une autre classe pour cette année. Révoquez l'affectation précédente avant de changer de classe.";
  }
  if (error.code === "42501") {
    return "Action refusée : vérifiez vos droits, le rattachement actif de la personne et votre établissement.";
  }
  if (error.code === "22023" || error.code === "23514" || error.code === "23503") {
    return "Classe, matière, année scolaire ou affectation invalide. Actualisez les données et réessayez.";
  }
  return "Impossible de traiter cette affectation. Réessayez ou contactez l'administration SCHOOLNET.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isText(value: unknown): value is string {
  return typeof value === "string";
}
function isStatus(value: unknown): value is "active" | "revoked" {
  return value === "active" || value === "revoked";
}
function isNullableDate(value: unknown): boolean {
  return value === null || isText(value);
}

export function isSchoolAssignmentsCatalog(
  value: unknown,
  schoolId: string,
): value is SchoolAssignmentsCatalog {
  if (!isRecord(value) || value.school_id !== schoolId) return false;
  const { classes, students, teachers, subjects, events, student_assignments, teacher_assignments } = value;
  if (!Array.isArray(classes) || !Array.isArray(students) ||
    !Array.isArray(teachers) || !Array.isArray(subjects) ||
    !Array.isArray(events) || !Array.isArray(student_assignments) ||
    !Array.isArray(teacher_assignments)) {
    return false;
  }
  return classes.every((row: unknown) => isRecord(row) &&
    isText(row.id) && isText(row.name) && isText(row.school_year_id) &&
    isText(row.school_year) && isText(row.level_name)) &&
    [...students, ...teachers].every((row: unknown) => isRecord(row) &&
      isText(row.id) && isText(row.full_name) && row.status === "active") &&
    subjects.every((row: unknown) => isRecord(row) &&
      isText(row.id) && isText(row.name) && isText(row.code)) &&
    events.every((row: unknown) => isRecord(row) &&
      isText(row.id) && isText(row.class_id) &&
      (row.assignment_kind === "student_class" || row.assignment_kind === "teacher_subject") &&
      (row.action === "assigned" || row.action === "revoked" || row.action === "reactivated") &&
      isText(row.member_name) && isText(row.actor_name) &&
      (row.subject_name === null || isText(row.subject_name)) &&
      isText(row.created_at)) &&
    student_assignments.every((row: unknown) => isRecord(row) &&
      isText(row.id) && isText(row.class_id) && isText(row.school_year_id) &&
      isText(row.student_id) && isText(row.student_name) &&
      isStatus(row.status) && typeof row.effective_active === "boolean" &&
      isText(row.assigned_at) && isNullableDate(row.revoked_at)) &&
    teacher_assignments.every((row: unknown) => isRecord(row) &&
      isText(row.id) && isText(row.class_id) && isText(row.school_year_id) &&
      isText(row.teacher_id) && isText(row.teacher_name) &&
      isText(row.subject_id) && isText(row.subject_name) &&
      isStatus(row.status) && typeof row.effective_active === "boolean" &&
      isText(row.assigned_at) && isNullableDate(row.revoked_at));
}

export async function getLocalSchoolAssignmentsCatalog(
  schoolId: string,
): Promise<SchoolAssignmentsCatalog> {
  const { data, error } = await supabase.rpc("schoolnet_school_assignment_catalog", {
    p_school_id: schoolId,
  });
  if (error) throw error;
  if (!isSchoolAssignmentsCatalog(data, schoolId)) {
    throw new Error("Catalogue des affectations scolaires invalide.");
  }
  return data;
}

export async function assignStudentToSchoolClass(
  schoolId: string,
  classId: string,
  studentId: string,
): Promise<string> {
  if (areSchoolAssignmentsReadOnly()) throw new Error(SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE);
  const { data, error } = await supabase.rpc("schoolnet_school_assign_student", {
    p_school_id: schoolId,
    p_class_id: classId,
    p_student_id: studentId,
  });
  if (error) throw error;
  if (!isText(data)) throw new Error("Affectation élève non confirmée.");
  return data;
}

export async function setStudentSchoolAssignmentActive(
  schoolId: string,
  assignmentId: string,
  active: boolean,
): Promise<string> {
  if (areSchoolAssignmentsReadOnly()) throw new Error(SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE);
  const { data, error } = await supabase.rpc("schoolnet_school_set_student_assignment_active", {
    p_school_id: schoolId,
    p_assignment_id: assignmentId,
    p_active: active,
  });
  if (error) throw error;
  if (!isText(data)) throw new Error("Modification d'affectation élève non confirmée.");
  return data;
}

export async function assignTeacherToSchoolClassSubject(
  schoolId: string,
  classId: string,
  teacherId: string,
  subjectId: string,
): Promise<string> {
  if (areSchoolAssignmentsReadOnly()) throw new Error(SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE);
  const { data, error } = await supabase.rpc("schoolnet_school_assign_teacher_subject", {
    p_school_id: schoolId,
    p_class_id: classId,
    p_teacher_id: teacherId,
    p_subject_id: subjectId,
  });
  if (error) throw error;
  if (!isText(data)) throw new Error("Affectation enseignant non confirmée.");
  return data;
}

export async function setTeacherSchoolAssignmentActive(
  schoolId: string,
  assignmentId: string,
  active: boolean,
): Promise<string> {
  if (areSchoolAssignmentsReadOnly()) throw new Error(SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE);
  const { data, error } = await supabase.rpc("schoolnet_school_set_teacher_subject_assignment_active", {
    p_school_id: schoolId,
    p_assignment_id: assignmentId,
    p_active: active,
  });
  if (error) throw error;
  if (!isText(data)) throw new Error("Modification d'affectation enseignant non confirmée.");
  return data;
}
