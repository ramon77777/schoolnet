import { canWriteSchoolClassesFromRuntime } from "./schoolClassWritePolicy";

/**
 * S3-B reprend les restrictions de S2-B/S3-A sur les ecritures.
 * Elles n'accordent aucun droit ; les RPC revalident Auth/role/ecole.
 */
export function canWriteSchoolStudentsFromRuntime(
  origin: string | undefined,
  supabaseUrl: string | undefined,
  isProductionBuild: boolean,
): boolean {
  return canWriteSchoolClassesFromRuntime(origin, supabaseUrl, isProductionBuild);
}

export function areSchoolStudentsReadOnly(): boolean {
  if (typeof window === "undefined") return true;
  return !canWriteSchoolStudentsFromRuntime(
    window.location.origin,
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.PROD,
  );
}

export const SCHOOL_STUDENT_PREVIEW_READ_ONLY_MESSAGE =
  "SCHOOLNET en lecture seule : les rattachements des élèves sont " +
  "réservés au site officiel après activation de S3-B.";
