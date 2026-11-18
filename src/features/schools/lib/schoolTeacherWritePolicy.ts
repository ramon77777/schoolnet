import {
  canWriteSchoolClassesFromRuntime,
} from "./schoolClassWritePolicy";

/**
 * S3-A : la même politique de production que S2-B.
 * Ce contrôle côté navigateur ne remplace jamais les autorisations SQL.
 */
export function canWriteSchoolTeachersFromRuntime(
  origin: string | undefined,
  supabaseUrl: string | undefined,
  isProductionBuild: boolean,
): boolean {
  return canWriteSchoolClassesFromRuntime(origin, supabaseUrl, isProductionBuild);
}

export function areSchoolTeachersReadOnly(): boolean {
  if (typeof window === "undefined") return true;
  return !canWriteSchoolTeachersFromRuntime(
    window.location.origin,
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.PROD,
  );
}

export const SCHOOL_TEACHER_PREVIEW_READ_ONLY_MESSAGE =
  "SCHOOLNET en lecture seule : la gestion des enseignants est réservée " +
  "au site officiel après activation de S3-A.";
