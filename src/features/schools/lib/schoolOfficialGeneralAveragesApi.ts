import { supabase } from "@/lib/supabaseClient";
import {
  isOfficialCurriculum, isOfficialGeneralPreview,
  type GeneralScope, type OfficialCurriculum, type OfficialGeneralPreview,
} from "./schoolOfficialGeneralAveragesModel";

type RpcError = { code?: string; message?: string; details?: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireScope(scope: GeneralScope): void {
  if (!Object.values(scope).every((value) => typeof value === "string" && uuid.test(value))) {
    throw new Error("Contexte scolaire officiel invalide.");
  }
}

export function officialGeneralActivationPending(error: unknown): boolean {
  const e = (error ?? {}) as RpcError;
  const message = [e.message, e.details].filter((v): v is string => typeof v === "string")
    .join(" ").toLowerCase();
  return e.code === "PGRST202" || e.code === "42883" ||
    ((message.includes("schoolnet_school_official_curriculum") ||
      message.includes("schoolnet_school_official_general_averages")) &&
      (message.includes("schema cache") || message.includes("not find") ||
       message.includes("does not exist")));
}

function assertCurriculum(result: unknown, scope: GeneralScope): OfficialCurriculum {
  if (!isOfficialCurriculum(result, scope))
    throw new Error("Réponse de programme non conforme au périmètre scolaire.");
  return result;
}

export async function readOfficialCurriculum(scope: GeneralScope): Promise<OfficialCurriculum> {
  requireScope(scope);
  const { data, error } = await supabase.rpc("schoolnet_school_official_curriculum", {
    p_school_id: scope.schoolId,
    p_period_id: scope.periodId,
    p_class_id: scope.classId,
    p_action: "read",
    p_subject_ids: null,
  });
  if (error) throw error;
  return assertCurriculum(data, scope);
}

export async function saveOfficialCurriculum(
  scope: GeneralScope,
  subjectIds: readonly string[],
): Promise<OfficialCurriculum> {
  requireScope(scope);
  if (!Array.isArray(subjectIds) || subjectIds.length < 1 || subjectIds.length > 60 ||
      subjectIds.some((value) => !uuid.test(value)) ||
      new Set(subjectIds).size !== subjectIds.length) {
    throw new Error("Sélectionnez 1 à 60 matières distinctes et valides.");
  }
  const { data, error } = await supabase.rpc("schoolnet_school_official_curriculum", {
    p_school_id: scope.schoolId,
    p_period_id: scope.periodId,
    p_class_id: scope.classId,
    p_action: "set",
    p_subject_ids: [...subjectIds],
  });
  if (error) throw error;
  return assertCurriculum(data, scope);
}

export async function approveOfficialCurriculum(
  scope: GeneralScope,
): Promise<OfficialCurriculum> {
  requireScope(scope);
  const { data, error } = await supabase.rpc("schoolnet_school_official_curriculum", {
    p_school_id: scope.schoolId,
    p_period_id: scope.periodId,
    p_class_id: scope.classId,
    p_action: "approve",
    p_subject_ids: null,
  });
  if (error) throw error;
  const result = assertCurriculum(data, scope);
  if (result.status !== "approved") throw new Error("Approbation non confirmée par le serveur.");
  return result;
}

export async function readOfficialGeneralPreview(
  scope: GeneralScope,
): Promise<OfficialGeneralPreview> {
  requireScope(scope);
  const { data, error } = await supabase.rpc("schoolnet_school_official_general_averages", {
    p_school_id: scope.schoolId,
    p_period_id: scope.periodId,
    p_class_id: scope.classId,
  });
  if (error) throw error;
  if (!isOfficialGeneralPreview(data, scope))
    throw new Error("Résultats de moyenne non conformes au périmètre scolaire.");
  return data;
}
