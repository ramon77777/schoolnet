import { supabase } from "@/lib/supabaseClient";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

export type AdminReportCardStatus =
  | "draft"
  | "published";

export type AdminReportCard = {
  report_card_id: string;

  student_id: string;
  student_name: string;

  class_id: string;
  class_name: string;

  period_id: string;
  period_name: string;

  school_year_id: string;
  school_year_name: string;

  report_card_status:
    | AdminReportCardStatus
    | string;

  general_average:
    | number
    | string
    | null;

  rank_position:
    | number
    | string
    | null;

  ranked_students_count:
    | number
    | string
    | null;

  subjects_count:
    | number
    | string
    | null;

  subjects_coefficient_total:
    | number
    | string
    | null;

  teacher_subjects_count:
    | number
    | string
    | null;

  teacher_comments_count:
    | number
    | string
    | null;

  general_comment: string | null;
  decision: string | null;

  generated_at: string | null;
  published_at: string | null;
};

export type AdminReportCardSubject = {
  report_card_subject_id: string;

  subject_id: string;
  subject_name: string;

  subject_average:
    | number
    | string
    | null;

  subject_coefficient:
    | number
    | string
    | null;

  assessments_count:
    | number
    | string
    | null;

  assessments_coefficient_total:
    | number
    | string
    | null;

  teacher_id: string | null;
  teacher_name: string | null;
  teacher_comment: string | null;

  sort_order: number | null;
};

export type AdminReportCardFilters = {
  schoolYearId?: string | null;
  classId?: string | null;
  periodId?: string | null;
  status?: AdminReportCardStatus | null;
};

export type AdminReportCardReviewResult = {
  report_card_id: string;
  general_comment: string | null;
  decision: string | null;
  updated_at: string;
};

export type AdminReportCardPublishResult = {
  report_card_id: string;
  report_card_status: string;
  published_at: string;
  published_by: string;
};

export type GeneratedReportCardForClass = {
  student_id: string;
  report_card_id: string;
};

export type AdminReportCardSchoolYear = {
  id: string;
  name: string;
};

export type AdminReportCardClass = {
  id: string;
  name: string;
};

export type AdminReportCardPeriod = {
  id: string;
  school_year_id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
  is_published: boolean;
  is_locked: boolean;
};

export type AdminReportCardCatalog = {
  schoolYears: AdminReportCardSchoolYear[];
  classes: AdminReportCardClass[];
  periods: AdminReportCardPeriod[];
};

/*
 * ============================================================
 * CATALOGUE
 * ============================================================
 */

export async function getAdminReportCardCatalog():
Promise<AdminReportCardCatalog> {
  const [
    schoolYearsResult,
    classesResult,
    periodsResult,
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select("id, name")
      .order(
        "name",
        {
          ascending: false,
        },
      ),

    supabase
      .from("classes")
      .select("id, name")
      .order(
        "name",
        {
          ascending: true,
        },
      ),

    supabase
      .from("grading_periods")
      .select(
        [
          "id",
          "school_year_id",
          "name",
          "sort_order",
          "is_active",
          "is_published",
          "is_locked",
        ].join(", "),
      )
      .order(
        "sort_order",
        {
          ascending: true,
        },
      ),
  ]);

  if (schoolYearsResult.error) {
    throw schoolYearsResult.error;
  }

  if (classesResult.error) {
    throw classesResult.error;
  }

  if (periodsResult.error) {
    throw periodsResult.error;
  }

  return {
    schoolYears:
      (
        schoolYearsResult.data ??
        []
      ) as AdminReportCardSchoolYear[],

    classes:
      (
        classesResult.data ??
        []
      ) as AdminReportCardClass[],

    periods:
      (
        periodsResult.data ??
        []
      ) as unknown as AdminReportCardPeriod[],
  };
}

/*
 * ============================================================
 * LECTURE ADMIN
 * ============================================================
 */

export async function getAdminReportCards(
  filters: AdminReportCardFilters = {},
) {
  const { data, error } =
    await supabase.rpc(
      "get_admin_report_cards",
      {
        p_school_year_id:
          filters.schoolYearId ?? null,

        p_class_id:
          filters.classId ?? null,

        p_period_id:
          filters.periodId ?? null,

        p_status:
          filters.status ?? null,
      },
    );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as unknown as AdminReportCard[]
  );
}

export async function getAdminReportCardSubjects(
  reportCardId: string,
) {
  const { data, error } =
    await supabase.rpc(
      "get_admin_report_card_subjects",
      {
        p_report_card_id:
          reportCardId,
      },
    );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as unknown as AdminReportCardSubject[]
  );
}

/*
 * ============================================================
 * GENERATION
 * ============================================================
 */

export async function generateAdminReportCard(
  studentId: string,
  periodId: string,
) {
  const { data, error } =
    await supabase.rpc(
      "generate_report_card",
      {
        p_student_id:
          studentId,

        p_period_id:
          periodId,
      },
    );

  if (error) {
    throw error;
  }

  return data;
}

export async function generateAdminReportCardsForClass(
  classId: string,
  periodId: string,
) {
  const { data, error } =
    await supabase.rpc(
      "generate_report_cards_for_class",
      {
        p_class_id:
          classId,

        p_period_id:
          periodId,
      },
    );

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as unknown as GeneratedReportCardForClass[]
  );
}

/*
 * ============================================================
 * REVUE ADMIN
 * ============================================================
 */

export async function updateAdminReportCardReview(
  reportCardId: string,
  generalComment: string,
  decision: string,
) {
  const { data, error } =
    await supabase.rpc(
      "update_admin_report_card_review",
      {
        p_report_card_id:
          reportCardId,

        p_general_comment:
          generalComment,

        p_decision:
          decision,
      },
    );

  if (error) {
    throw error;
  }

  const rows =
    (data ?? []) as unknown as AdminReportCardReviewResult[];

  return rows[0] ?? null;
}

/*
 * ============================================================
 * PUBLICATION
 * ============================================================
 */

export async function publishAdminReportCard(
  reportCardId: string,
) {
  const { data, error } =
    await supabase.rpc(
      "publish_admin_report_card",
      {
        p_report_card_id:
          reportCardId,
      },
    );

  if (error) {
    throw error;
  }

  const rows =
    (data ?? []) as unknown as AdminReportCardPublishResult[];

  return rows[0] ?? null;
}

/*
 * ============================================================
 * ERREURS
 * ============================================================
 */

export function getAdminReportCardErrorMessage(
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