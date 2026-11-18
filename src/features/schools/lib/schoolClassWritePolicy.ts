/**
 * S2-B - garde-fou contre les mutations accidentelles depuis une Preview
 * Vercel ou un environnement local connecté au Supabase principal.
 *
 * Ce contrôle d'interface n'est PAS une autorisation : le SQL doit vérifier
 * auth.uid(), le rôle réel, l'appartenance active à l'école et la requête.
 * Les origines et projets sont comparés EXACTEMENT (pas de sous-domaines).
 */
export const SCHOOLNET_MAIN_APP_ORIGIN = "https://schoolnet-snowy.vercel.app";
export const SCHOOLNET_MAIN_SUPABASE_URL = "https://anttmbhaphkhmkoqsofd.supabase.co";

export function canWriteSchoolClassesFromRuntime(
  origin: string | undefined,
  supabaseUrl: string | undefined,
  isProductionBuild: boolean,
): boolean {
  return isProductionBuild === true &&
    origin === SCHOOLNET_MAIN_APP_ORIGIN &&
    supabaseUrl === SCHOOLNET_MAIN_SUPABASE_URL;
}

/** Lecture seule par défaut, y compris côté SSR/tests sans navigateur. */
export function areSchoolClassesReadOnly(): boolean {
  if (typeof window === "undefined") return true;

  return !canWriteSchoolClassesFromRuntime(
    window.location.origin,
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.PROD,
  );
}

export const SCHOOL_CLASS_PREVIEW_READ_ONLY_MESSAGE =
  "Aperçu SCHOOLNET en lecture seule : la création de classe est réservée " +
  "au site officiel après activation de S2-B par l'administration.";
