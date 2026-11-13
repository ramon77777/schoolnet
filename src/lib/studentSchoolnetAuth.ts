// SCHOOLNET B2.D/E - Login sans adresse e-mail personnelle, sandbox uniquement.
// Aucun secret serveur ni e-mail technique n'est demandé par le navigateur.
import { supabase } from '@/lib/supabaseClient';
import { buildAndCacheAuthUserFromSupabaseUser, clearAuthUser } from '@/lib/auth';

const SANDBOX_URL = 'https://onqlsvphmrqhelislpry.supabase.co';

export function studentSchoolnetLoginAvailable(): boolean {
  return import.meta.env.VITE_SUPABASE_URL === SANDBOX_URL &&
    import.meta.env.VITE_SCHOOLNET_STUDENT_LOGIN_ENABLED === 'true';
}

export async function signInWithSchoolnetStudent(
  phone: string, studentCode: string, password: string,
) {
  if (!studentSchoolnetLoginAvailable()) {
    throw new Error('Connexion scolaire non disponible dans cet environnement.');
  }
  if (!phone.trim() || !studentCode.trim() || !password) {
    throw new Error('Renseignez votre téléphone familial, votre identifiant SCHOOLNET et votre mot de passe.');
  }
  if (phone.length > 64 || studentCode.length > 60 || password.length > 256) {
    throw new Error('Identifiants scolaires invalides.');
  }
  const { data, error } = await supabase.functions.invoke('schoolnet-student-login', {
    body: { phone: phone.trim(), studentCode: studentCode.trim(), password },
  });
  const payload = data as {
    ok?: boolean;
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;
  if (error || payload?.ok !== true ||
      typeof payload.access_token !== 'string' ||
      typeof payload.refresh_token !== 'string') {
    throw new Error('Connexion scolaire indisponible ou identifiants incorrects.');
  }
  const { data: session, error: setSessionError } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (setSessionError || !session.user || !session.session) {
    throw new Error('Impossible de vérifier la session scolaire.');
  }
  try {
    const profile = await buildAndCacheAuthUserFromSupabaseUser({
      id: session.user.id, email: session.user.email,
    });
    if (profile.role !== 'student') {
      throw new Error('Profil scolaire non valide.');
    }
    return profile;
  } catch {
    await supabase.auth.signOut();
    clearAuthUser();
    throw new Error('Profil scolaire non vérifié : contactez votre établissement.');
  }
}
