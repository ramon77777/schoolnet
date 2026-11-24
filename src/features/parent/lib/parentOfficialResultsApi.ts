import { supabase } from "@/lib/supabaseClient";
import {
  isParentOfficialResultDetail,
  isParentOfficialResults,
  isParentOfficialUuid,
} from "./parentOfficialResultsModel";

export async function getParentOfficialResults() {
  const { data, error } = await supabase.rpc("schoolnet_parent_official_results");
  if (error) throw error;
  if (!isParentOfficialResults(data)) throw new Error("Réponse de résultats officiels invalide.");
  return data;
}

export async function getParentOfficialResult(childId: string, assessmentId: string) {
  if (!isParentOfficialUuid(childId) || !isParentOfficialUuid(assessmentId)) {
    throw new Error("Identifiant de résultat invalide.");
  }
  const { data, error } = await supabase.rpc("schoolnet_parent_official_result", {
    p_child_id: childId,
    p_assessment_id: assessmentId,
  });
  if (error) throw error;
  if (!isParentOfficialResultDetail(data)
    || (data.found && (data.result.childId.toLowerCase() !== childId.toLowerCase()
      || data.result.assessmentId.toLowerCase() !== assessmentId.toLowerCase()))) {
    throw new Error("Réponse de résultat officiel invalide.");
  }
  return data;
}
