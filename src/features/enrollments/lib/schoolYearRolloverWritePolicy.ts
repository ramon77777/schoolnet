/**
 * SCHOOLNET | Lot 5D-A - preparation du passage d'annee en lecture seule.
 *
 * Defense d'interface uniquement : le serveur doit verifier les droits Admin,
 * l'origine de production, le perimetre scolaire et l'integrite des dossiers.
 * L'absence du flag vaut REFUS, y compris sur le domaine de production.
 */
import {
  SCHOOLNET_MAIN_APP_ORIGIN,
  SCHOOLNET_MAIN_SUPABASE_URL,
} from "@/features/schools/lib/schoolClassWritePolicy";

export function canWriteSchoolYearRolloverFromRuntime(
  origin: string | undefined,
  supabaseUrl: string | undefined,
  isProductionBuild: boolean,
  explicitWriteFlag: string | undefined,
): boolean {
  return explicitWriteFlag === "true" &&
    isProductionBuild === true &&
    origin === SCHOOLNET_MAIN_APP_ORIGIN &&
    supabaseUrl === SCHOOLNET_MAIN_SUPABASE_URL;
}

export function areSchoolYearRolloverWritesBlocked(): boolean {
  if (typeof window === "undefined") return true;
  return !canWriteSchoolYearRolloverFromRuntime(
    window.location.origin,
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.PROD,
    import.meta.env.VITE_SCHOOLNET_LOT5D_WRITES_ENABLED,
  );
}

export const SCHOOLNET_YEAR_ROLLOVER_READ_ONLY_MESSAGE =
  "Lot 5D-A : consultation seulement. Aucune decision de reinscription " +
  "ni bascule annuelle depuis localhost, une Preview ou un site non active. " +
  "Une autorisation et une verification serveur distinctes seront necessaires.";
