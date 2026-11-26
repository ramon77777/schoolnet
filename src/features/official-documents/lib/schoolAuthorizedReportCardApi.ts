/** SCHOOLNET S4-D.3b — single-student authorized V2 report-card RPC.
 * The SQL proposal is NOT installed on hosted SCHOOLNET. Fail closed.
 */
import { supabase } from "@/lib/supabaseClient";
import {
  validateAuthorizedReportCardPreview,
  type AuthorizedReportCardPreview,
} from "./schoolAuthorizedReportCardModel";
import type {
  GeneralScope, OfficialCurriculum, OfficialGeneralPreview,
} from "../../schools/lib/schoolOfficialGeneralAveragesModel";

export const SCHOOL_REPORT_CARD_RPC = "schoolnet_school_report_card_preview" as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ReportCardViewer = {
  id: string; role: string; isDemo: boolean;
};

export function isReportCardRpcPending(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const value = error as {code?: unknown};
  return value.code === "PGRST202" || value.code === "42883";
}

/** Four scope/subject identifiers only. No grade, teacher, actor or permission
 * flag is passed by the browser. Server rechecks auth.uid() each call. */
export async function readAuthorizedStudentReportCard(
  scope: GeneralScope, studentId: string,
  curriculum: OfficialCurriculum, general: OfficialGeneralPreview,
  viewer: ReportCardViewer | null,
): Promise<AuthorizedReportCardPreview> {
  if (!viewer || viewer.isDemo || viewer.role !== "school_admin" ||
      !uuid.test(viewer.id) || !uuid.test(studentId) ||
      !Object.values(scope).every(v => uuid.test(v))) {
    throw new Error("Prévisualisation refusée : session ou périmètre scolaire invalide.");
  }
  const { data, error } = await supabase.rpc(SCHOOL_REPORT_CARD_RPC, {
    p_school_id: scope.schoolId,
    p_period_id: scope.periodId,
    p_class_id: scope.classId,
    p_student_id: studentId,
  });
  if (error) throw error;
  return validateAuthorizedReportCardPreview(
    data, scope, studentId, curriculum, general,
  );
}
