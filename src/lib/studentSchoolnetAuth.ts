// SCHOOLNET B2.D/E - Login sans adresse e-mail personnelle, sandbox uniquement.
// Aucun secret serveur ni e-mail technique n'est demandé par le navigateur.
import { supabase } from '@/lib/supabaseClient';
import { buildAndCacheAuthUserFromSupabaseUser, clearAuthUser } from '@/lib/auth';
import { resolveStudentLoginFormMode, type StudentLoginFormMode } from '@/lib/studentLoginPreviewValidation';

export function studentSchoolnetLoginMode(): StudentLoginFormMode {
  // Vite local development is UI preview only: it never sends credentials.
  return resolveStudentLoginFormMode({
    isDev: import.meta.env.DEV,
    projectUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
    sandboxEnabled: import.meta.env.VITE_SCHOOLNET_STUDENT_LOGIN_ENABLED === 'true',
    // Mise en service du pilote SCHOOLNET sur le projet de production autorisé.
    // Le backend impose toujours CAPTCHA, limites, et UUID de dossier pilote.
    productionEnabled: import.meta.env.PROD,
  });
}

export function studentSchoolnetLoginAvailable(): boolean {
  return studentSchoolnetLoginMode() !== 'hidden';
}

export async function signInWithSchoolnetStudent(
  phone: string, studentCode: string, password: string, captchaToken?: string,
) {
  // Never submit credentials from local UI preview or unapproved production builds.
  const mode = studentSchoolnetLoginMode();
  if (mode !== 'sandbox' && mode !== 'production') {
    throw new Error('Connexion scolaire non disponible dans cet environnement.');
  }
  if (!phone.trim() || !studentCode.trim() || !password) {
    throw new Error('Renseignez votre téléphone familial, votre identifiant SCHOOLNET et votre mot de passe.');
  }
  if (phone.length > 64 || studentCode.length > 60 || password.length > 256) {
    throw new Error('Identifiants scolaires invalides.');
  }
  if (mode === 'production' && (!captchaToken || captchaToken.length > 2048)) {
    throw new Error('Vérification de sécurité requise.');
  }
  const action = mode === 'production' ? 'schoolnet-student-login-release' : 'schoolnet-student-login';
  const body = mode === 'production'
    ? { phone:phone.trim(), studentCode:studentCode.trim(), password, captchaToken }
    : { phone:phone.trim(), studentCode:studentCode.trim(), password };
  const { data, error } = await supabase.functions.invoke(action, { body });
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
