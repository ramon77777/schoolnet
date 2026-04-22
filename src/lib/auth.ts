// src/lib/auth.ts
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "student" | "parent" | "teacher" | "admin";

export type AuthUser = {
  id: string;
  email: string | null;
  role: UserRole;
  full_name?: string | null;
};

const LS_KEY = "sn_auth_user_v1";

export function setAuthUser(user: AuthUser | null) {
  if (!user) localStorage.removeItem(LS_KEY);
  else localStorage.setItem(LS_KEY, JSON.stringify(user));
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearAuthUser() {
  localStorage.removeItem(LS_KEY);
}

export function getDefaultPathByRole(role: UserRole) {
  if (role === "admin") return "/app/admin/dashboard";
  if (role === "teacher") return "/app/teacher/grading";
  if (role === "parent") return "/app/parent/home";
  return "/app/student/courses";
}

async function withTimeout<T>(p: PromiseLike<T>, ms: number, label = "timeout"): Promise<T> {
  return await Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms)),
  ]);
}

export async function fetchProfileRole(userId: string) {
  const req = supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const { data, error } = await withTimeout(req, 6000, "fetchProfileRole");
  if (error) throw error;

  const role = (data?.role as UserRole) ?? "student";
  return { role, full_name: data?.full_name ?? null };
}

export async function buildAndCacheAuthUserFromSupabaseUser(user: { id: string; email?: string | null }) {
  let role: UserRole = "student";
  let full_name: string | null = null;

  try {
    const profile = await fetchProfileRole(user.id);
    role = profile.role;
    full_name = profile.full_name ?? null;
  } catch (e) {
    console.warn("[auth] profile fetch failed, fallback student:", e);
  }

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? null,
    role,
    full_name,
  };

  setAuthUser(authUser);
  return authUser;
}

export async function signInWithPassword(email: string, password: string) {
  // ✅ timeout sur le login aussi (évite le “signal is aborted…” + blocage)
  const res = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    8000,
    "signInWithPassword"
  );

  const { data, error } = res;
  if (error) throw error;

  if (!data.user) throw new Error("Connexion réussie mais user introuvable.");

  return await buildAndCacheAuthUserFromSupabaseUser({
    id: data.user.id,
    email: data.user.email,
  });
}

export async function signInWithMagicLink(email: string) {
  const redirectTo = `${window.location.origin}/auth/login`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
  clearAuthUser();
}
