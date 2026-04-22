// src/layouts/DashboardLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useCallback } from "react";
import { useAuth, type UserRole } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { getDefaultPathByRole } from "@/lib/auth";

const navItem = ({ isActive }: { isActive: boolean }) =>
  `sn-nav-item ${isActive ? "sn-nav-item-active" : "sn-nav-item-inactive"}`;

function roleLabel(role: UserRole) {
  if (role === "admin") return "Admin";
  if (role === "teacher") return "Enseignant";
  if (role === "parent") return "Parent / Tuteur";
  return "Apprenant";
}

function roleInitial(role: UserRole) {
  if (role === "admin") return "AD";
  if (role === "teacher") return "E";
  if (role === "parent") return "P";
  return "A";
}

function spaceLabel(role: UserRole) {
  if (role === "admin") return "🛠️ Espace Admin";
  if (role === "teacher") return "👩‍🏫 Espace Enseignant";
  if (role === "parent") return "👨‍👩‍👧 Espace Parent / Tuteur";
  return "🎓 Espace Apprenant";
}

function subtitle(role: UserRole) {
  if (role === "admin") return "Gestion de la plateforme et des utilisateurs";
  if (role === "teacher") return "Gestion de vos classes et évaluations";
  if (role === "parent") return "Suivi et informations pour vos enfants";
  return "Ravi de te revoir sur Schoolnet";
}

function isPathAllowedForRole(pathname: string, role: UserRole) {
  if (role === "admin") return pathname.startsWith("/app/admin");
  if (role === "teacher") return pathname.startsWith("/app/teacher");
  if (role === "parent") return pathname.startsWith("/app/parent");
  return pathname.startsWith("/app/student");
}

export default function DashboardLayout() {
  const { user, loading, clearDemo } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // ✅ IMPORTANT: pas de Navigate en "render" qui change les hooks.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/auth/login", { replace: true });
      return;
    }
    if (!isPathAllowedForRole(pathname, user.role)) {
      navigate(getDefaultPathByRole(user.role), { replace: true });
    }
  }, [loading, user, pathname, navigate]);

  const displayName = user?.fullName ?? user?.email ?? "Utilisateur";
  const rLabel = user ? roleLabel(user.role) : "";
  const rInitial = user ? roleInitial(user.role) : "";
  const rSubtitle = user ? subtitle(user.role) : "";
  const rSpace = user ? spaceLabel(user.role) : "";

  const onLogout = useCallback(async () => {
    // Nettoie le mode démo + session supabase
    clearDemo();
    await supabase.auth.signOut();
    navigate("/auth/login", { replace: true });
  }, [clearDemo, navigate]);

  const nav = useMemo(() => {
    if (!user) return null;

    return (
      <nav className="sn-card p-2 space-y-1">
        {user.role === "student" && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Espace apprenant
            </div>
            <NavLink className={navItem} to="/app/student/courses">📘 Mes cours</NavLink>
            <NavLink className={navItem} to="/app/student/homework">📝 Devoirs</NavLink>
            <NavLink className={navItem} to="/app/student/assessments">🧪 Évaluations</NavLink>
            <NavLink className={navItem} to="/app/student/progress">📊 Progression</NavLink>
          </>
        )}

        {user.role === "parent" && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Espace parent
            </div>
            <NavLink className={navItem} to="/app/parent/home">🧭 Résumé du mois</NavLink>
            <NavLink className={navItem} to="/app/parent/children">🧒 Mes enfants</NavLink>
            <NavLink className={navItem} to="/app/parent/deadlines">📅 Échéances</NavLink>
            <NavLink className={navItem} to="/app/parent/results">📈 Résultats</NavLink>
          </>
        )}

        {user.role === "teacher" && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Espace enseignant
            </div>
            <NavLink className={navItem} to="/app/teacher/courses">📚 Mes cours</NavLink>
            <NavLink className={navItem} to="/app/teacher/classes">🏫 Mes classes</NavLink>
            <NavLink className={navItem} to="/app/teacher/assessments">🧪 Évaluations</NavLink>
            <NavLink className={navItem} to="/app/teacher/grading">✅ Corrections</NavLink>
          </>
        )}

        {user.role === "admin" && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Administration
            </div>
            <NavLink className={navItem} to="/app/admin/dashboard">📊 Tableau de bord</NavLink>
            <NavLink className={navItem} to="/app/admin/users">👥 Utilisateurs</NavLink>
            <NavLink className={navItem} to="/app/admin/classes">🏫 Classes</NavLink>
            <NavLink className={navItem} to="/app/admin/content">📚 Contenu</NavLink>
            <NavLink className={navItem} to="/app/admin/settings">⚙️ Paramètres</NavLink>
          </>
        )}

        <div className="h-px bg-gray-100 my-2" />

        <button
          type="button"
          className="w-full sn-btn-ghost sn-press flex items-center justify-between"
          onClick={onLogout}
        >
          <span>🚪 Déconnexion</span>
          <span className="text-xs text-gray-400">logout</span>
        </button>
      </nav>
    );
  }, [user, onLogout]);

  // ✅ Loading UI (évite les redirections pendant loading)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="sn-card p-6 text-sm text-gray-600">Chargement…</div>
      </div>
    );
  }

  // ✅ Si pas d'user, l'useEffect va naviguer. On évite de rendre un layout cassé.
  if (!user) return null;

  return (
    <div className="min-h-screen sn-soft-bg">
      <div className="flex">
        <aside className="w-72 p-4 space-y-4">
          <div className="sn-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">Schoolnet</div>
                <div className="text-xs text-gray-500">{rSpace}</div>
              </div>
              <div className="h-10 min-w-10 px-3 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shadow-sm">
                {rInitial}
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Connecté : <span className="font-semibold text-gray-700">{displayName}</span>
            </div>
          </div>

          {nav}

          <div className="text-xs text-gray-500 px-2">
            Astuce : les accès sont protégés par rôle. Si tu tapes une URL d’un autre rôle,
            tu seras redirigé automatiquement.
          </div>
        </aside>

        <main className="flex-1 p-6 space-y-6">
          <div className="sn-card sn-card-hover px-6 py-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">
                Bonjour 👋 <span className="text-gray-900">{displayName}</span>
              </div>
              <div className="text-sm text-gray-500">{rSubtitle}</div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">{rLabel}</div>
                <div className="text-xs text-gray-500">{user.isDemo ? "Mode démo" : "Compte réel"}</div>
              </div>

              <div className="h-10 min-w-10 px-3 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shadow-sm">
                {rInitial}
              </div>
            </div>
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  );
}
