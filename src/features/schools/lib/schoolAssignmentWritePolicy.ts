import { canWriteSchoolClassesFromRuntime } from "./schoolClassWritePolicy";

/**
 * S3-C: la lecture des affectations peut etre autorisee en Preview.
 * Les ecritures restent strictement reservees au build officiel et au projet
 * Supabase principal. C'est une protection UX, jamais une autorisation SQL.
 */
export function canWriteSchoolAssignmentsFromRuntime(
  origin: string | undefined,
  supabaseUrl: string | undefined,
  isProductionBuild: boolean,
): boolean {
  return canWriteSchoolClassesFromRuntime(origin, supabaseUrl, isProductionBuild);
}

export function areSchoolAssignmentsReadOnly(): boolean {
  if (typeof window === "undefined") return true;

  return !canWriteSchoolAssignmentsFromRuntime(
    window.location.origin,
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.PROD,
  );
}

export const SCHOOL_ASSIGNMENT_PREVIEW_READ_ONLY_MESSAGE =
  "Aperçu SCHOOLNET en lecture seule : les affectations pédagogiques ne " +
  "peuvent être modifiées que sur le site officiel après activation S3-C.";
