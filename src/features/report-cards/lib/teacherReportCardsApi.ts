import { supabase } from "@/lib/supabaseClient";

export type TeacherReportCardSubject = {
  report_card_subject_id: string;
  report_card_id: string;

  student_id: string;
  student_name: string;

  class_id: string;
  class_name: string;

  period_id: string;
  period_name: string;

  school_year_id: string;
  school_year_name: string;

  report_card_status: string;

  subject_id: string;
  subject_name: string;

  subject_average: number | string | null;
  subject_coefficient: number | string | null;

  teacher_comment: string | null;
  sort_order: number | null;
};

type UpdateTeacherCommentResult = {
  report_card_subject_id: string;
  teacher_comment: string | null;
  updated_at: string;
};

export async function getTeacherReportCardSubjects() {
  const { data, error } = await supabase.rpc(
    "get_teacher_report_card_subjects",
  );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as unknown as TeacherReportCardSubject[]
  );
}

export async function updateTeacherReportCardComment(
  reportCardSubjectId: string,
  teacherComment: string,
) {
  const { data, error } = await supabase.rpc(
    "update_teacher_report_card_comment",
    {
      p_report_card_subject_id: reportCardSubjectId,
      p_teacher_comment: teacherComment,
    },
  );

  if (error) {
    throw error;
  }

  const rows =
    (data ?? []) as unknown as UpdateTeacherCommentResult[];

  return rows[0] ?? null;
}

export function getTeacherReportCardErrorMessage(
  error: unknown,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Une erreur inattendue est survenue.";
}