// src/lib/auth/AuthProvider.tsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "student" | "parent" | "teacher" | "admin";

export type AuthUser = {
  id: string;
  email?: string | null;
  role: UserRole;
  fullName?: string | null;
  isDemo?: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  setDemoRole: (role: UserRole) => void;
  clearDemo: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_KEY = "sn_demo_role";

function readDemoRole(): UserRole | null {
  const v = localStorage.getItem(DEMO_KEY);
  if (v === "student" || v === "parent" || v === "teacher" || v === "admin") return v;
  return null;
}
function writeDemoRole(role: UserRole | null) {
  if (!role) localStorage.removeItem(DEMO_KEY);
  else localStorage.setItem(DEMO_KEY, role);
}

async function withTimeout<T>(p: PromiseLike<T>, ms: number, label = "timeout"): Promise<T> {
  return await Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms)),
  ]);
}

async function fetchProfileSafe(userId: string): Promise<{ role: UserRole; full_name: string | null }> {
  try {
    const req = supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", userId)
      .maybeSingle();

    const { data, error } = await withTimeout(req, 6000, "profiles.select");
    if (error) throw error;

    return {
      role: (data?.role as UserRole) ?? "student",
      full_name: data?.full_name ?? null,
    };
  } catch (e) {
    // ✅ IMPORTANT: on NE BLOQUE JAMAIS l'app si profiles est lent / RLS / row manquante
    console.warn("[AuthProvider] profile fetch failed, fallback student:", e);
    return { role: "student", full_name: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // ✅ charge un mode démo si présent (immédiat)
    const demo = readDemoRole();
    if (demo) setUser({ id: "demo", role: demo, isDemo: true });

    const applySession = async (session: Session | null) => {
      try {
        if (!mountedRef.current) return;

        // Tant qu’on traite, on peut afficher loading
        setLoading(true);

        if (!session?.user) {
          // Pas de session: on garde démo si existe sinon null
          const demo2 = readDemoRole();
          setUser(demo2 ? { id: "demo", role: demo2, isDemo: true } : null);
          return;
        }

        const profile = await fetchProfileSafe(session.user.id);

        if (!mountedRef.current) return;

        setUser({
          id: session.user.id,
          email: session.user.email,
          role: profile.role,
          fullName: profile.full_name,
          isDemo: false,
        });

        // si session réelle => on coupe le démo
        writeDemoRole(null);
      } finally {
        // ✅ QUOI QU’IL ARRIVE on sort de loading
        if (mountedRef.current) setLoading(false);
      }
    };

    // 1) session initiale
    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch((e) => {
        console.error("[AuthProvider] getSession error:", e);
        if (mountedRef.current) setLoading(false);
      });

    // 2) listener auth
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // ⚠️ pas d'async direct ici: on lance et on gère nous-même
      void applySession(session);
    });

    return () => {
      mountedRef.current = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setDemoRole = (role: UserRole) => {
    writeDemoRole(role);
    setUser({ id: "demo", role, isDemo: true });
    setLoading(false);
  };

  const clearDemo = () => {
    writeDemoRole(null);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, setDemoRole, clearDemo }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
