// SCHOOLNET - Lot 5.D: decisions et changement controle d'annee.
import { supabase } from "@/lib/supabaseClient";

export type RolloverDecisionType = "pending" | "re_enroll" | "repeat" | "leave";

export type RolloverDecision = {
  source_year_id: string;
  target_year_id: string;
  student_id: string;
  source_enrollment_id: string;
  decision: RolloverDecisionType;
  target_class_id: string | null;
  note: string | null;
  decided_by: string;
  decided_at: string;
};

export type RolloverRun = {
  source_year_id: string;
  target_year_id: string;
  finalized_by: string;
  finalized_at: string;
  source_students: number;
  re_enrolled: number;
  repeated: number;
  departed: number;
};

export type RolloverResult = {
  source_year_id: string;
  target_year_id: string;
  source_students: number;
  re_enrolled: number;
  repeated: number;
  departed: number;
  already_finalized: boolean;
};

export type RolloverDraftInput = {
  sourceYearId: string;
  targetYearId: string;
  studentId: string;
  decision: RolloverDecisionType;
  targetClassId: string | null;
  note: string;
};

type PostgrestFailure = {
  code?: string;
  message?: string;
  details?: string;
};

export function rolloverErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error &&
      typeof error.message === "string") return error.message;
  return "Une erreur inattendue est survenue.";
}

export function isRolloverMigrationMissing(error: unknown): boolean {
  const data = (error ?? {}) as PostgrestFailure;
  const raw = String(data.message ?? "") + " " + String(data.details ?? "");
  return data.code === "42P01" || data.code === "PGRST205" ||
    data.code === "PGRST202" ||
    (raw.includes("school_year_rollover_") &&
      (raw.includes("schema cache") || raw.includes("does not exist")));
}

export async function getRolloverRecords(
  sourceYearId: string,
  targetYearId: string,
): Promise<{ decisions: RolloverDecision[]; run: RolloverRun | null; migrationPending: boolean }> {
  const [decisionsResult, runResult] = await Promise.all([
    supabase
      .from("school_year_rollover_decisions")
      .select("source_year_id,target_year_id,student_id,source_enrollment_id,decision,target_class_id,note,decided_by,decided_at")
      .eq("source_year_id", sourceYearId)
      .eq("target_year_id", targetYearId),
    supabase
      .from("school_year_rollover_runs")
      .select("source_year_id,target_year_id,finalized_by,finalized_at,source_students,re_enrolled,repeated,departed")
      .eq("source_year_id", sourceYearId)
      .maybeSingle(),
  ]);
  if (decisionsResult.error || runResult.error) {
    const error = decisionsResult.error ?? runResult.error;
    if (isRolloverMigrationMissing(error)) {
      return { decisions: [], run: null, migrationPending: true };
    }
    throw error;
  }
  return {
    decisions: (decisionsResult.data ?? []) as RolloverDecision[],
    run: (runResult.data ?? null) as RolloverRun | null,
    migrationPending: false,
  };
}

export async function saveRolloverDecision(input: RolloverDraftInput): Promise<void> {
  const { error } = await supabase.rpc("admin_save_school_year_rollover_decision", {
    p_source_year_id: input.sourceYearId,
    p_target_year_id: input.targetYearId,
    p_student_id: input.studentId,
    p_decision: input.decision,
    p_target_class_id: input.targetClassId,
    p_note: input.note.trim() || null,
  });
  if (error) throw error;
}

export async function finalizeSchoolYearRollover(
  sourceYearId: string,
  targetYearId: string,
  confirmYearName: string,
): Promise<RolloverResult> {
  const { data, error } = await supabase.rpc("admin_finalize_school_year_rollover", {
    p_source_year_id: sourceYearId,
    p_target_year_id: targetYearId,
    p_confirm_year_name: confirmYearName,
  });
  if (error) throw error;
  return data as RolloverResult;
}
