import { supabase } from "@/lib/supabaseClient";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

export type StudentReportCard = {
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

  general_average: number | string | null;

  rank_position: number | string | null;
  ranked_students_count: number | string | null;

  subjects_count: number | string | null;
  subjects_coefficient_total:
    | number
    | string
    | null;

  general_comment: string | null;
  decision: string | null;

  published_at: string | null;
};

export type StudentReportCardSubject = {
  report_card_subject_id: string;
  report_card_id: string;

  subject_id: string;
  subject_name: string;

  subject_average: number | string | null;
  subject_coefficient: number | string | null;

  assessments_count: number | string | null;
  assessments_coefficient_total:
    | number
    | string
    | null;

  teacher_id: string | null;
  teacher_name: string | null;
  teacher_comment: string | null;

  sort_order: number | null;
};

/*
 * ============================================================
 * BULLETINS
 * ============================================================
 */

export async function getStudentReportCards() {
  const { data, error } = await supabase.rpc(
    "get_student_report_cards",
  );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as unknown as StudentReportCard[]
  );
}

/*
 * ============================================================
 * DETAIL DU BULLETIN
 * ============================================================
 */

export async function getStudentReportCardSubjects(
  reportCardId: string,
) {
  const { data, error } = await supabase.rpc(
    "get_student_report_card_subjects",
    {
      p_report_card_id: reportCardId,
    },
  );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as unknown as StudentReportCardSubject[]
  );
}

/*
 * ============================================================
 * ERREURS
 * ============================================================
 */

export function getStudentReportCardErrorMessage(
  error: unknown,
  fallback =
    "Une erreur inattendue est survenue.",
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}