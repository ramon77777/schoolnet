import { supabase } from "@/lib/supabaseClient";
import {
  isSchoolPedagogyOverview,
  type SchoolPedagogyOverview,
} from "./schoolPedagogyOverview";

// Cette RPC ne renvoie que des effectifs et des metadonnees de classe.
// Ne jamais se rabattre sur le catalogue nominatif S3-C si elle est absente.
export async function getLocalSchoolPedagogyOverview(
  schoolId: string,
): Promise<SchoolPedagogyOverview> {
  if (!schoolId) throw new Error("Établissement requis.");
  const { data, error } = await supabase.rpc("schoolnet_school_pedagogy_overview", {
    p_school_id: schoolId,
  });
  if (error) throw error;
  if (!isSchoolPedagogyOverview(data, schoolId)) {
    throw new Error("Synthèse pédagogique reçue non conforme.");
  }
  return data;
}

export function isSchoolPedagogyOverviewActivationPending(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { code?: unknown; message?: unknown; details?: unknown };
  const message = [error.message, error.details]
    .filter((v): v is string => typeof v === "string")
    .join(" ").toLowerCase();
  return error.code === "PGRST202" || (
    message.includes("schoolnet_school_pedagogy_overview") &&
    (message.includes("schema cache") || message.includes("not find"))
  );
}
