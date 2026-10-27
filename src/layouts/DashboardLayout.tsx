// src/layouts/DashboardLayout.tsx
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  usePlatformBranding,
} from "@/lib/platform/usePlatformBranding";
import { useAuth, type UserRole } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { getDefaultPathByRole } from "@/lib/auth";
import NotificationBell from "@/features/notifications/components/NotificationBell";
import { useMessagingNotifications } from "@/features/messaging/hooks/useMessagingNotifications";
import schoolnetLogo from "@/assets/branding/schoolnet-logo.png";
import { createPortal } from "react-dom";

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

function messagingPath(role: UserRole) {
  if (role === "admin") return "/app/admin/messages";
  if (role === "teacher") return "/app/teacher/messages";
  if (role === "parent") return "/app/parent/messages";
  return "/app/student/messages";
}

function UnreadMessagesBadge({
  count,
}: {
  count: number;
}) {
  if (count <= 0) return null;

  return (
    <span
      className="
        flex min-w-5 h-5 items-center justify-center
        rounded-full bg-red-500 px-1.5
        text-[10px] font-bold text-white
        shadow-sm
      "
      aria-label={`${count} message${count > 1 ? "s" : ""} non lu${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}


function spaceLabel(role: UserRole) {
  if (role === "admin") return "🛠️ Espace Admin";
  if (role === "teacher") return "👩‍🏫 Espace Enseignant";
  if (role === "parent") return "👨‍👩‍👧 Espace Parent / Tuteur";
  return "🎓 Espace Apprenant";
}

function subtitle(
  role: UserRole,
  platformName: string
) {
  if (role === "admin") {
    return "Gestion de la plateforme et des utilisateurs";
  }

  if (role === "teacher") {
    return "Gestion de vos classes et évaluations";
  }

  if (role === "parent") {
    return "Suivi et informations pour vos enfants";
  }

  return `Ravi de te revoir sur ${platformName}`;
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
  const { branding } = usePlatformBranding();
  const {
    unreadCount,
    incomingAlert,
    dismissIncomingAlert,
    requestBrowserNotificationPermission,
  } = useMessagingNotifications();

  const [failedLogoUrl, setFailedLogoUrl] =
    useState<string | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const platformName = branding.platformName;
  const institutionName = branding.institutionName;
  const logoUrl = branding.logoUrl;

  const brandLogoError =
    Boolean(
      logoUrl &&
        failedLogoUrl === logoUrl
    );

  useEffect(() => {
    document.title = platformName;
  }, [platformName]);


  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

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
  const rSubtitle = user
    ? subtitle(user.role, platformName)
    : "";
  const rSpace = user ? spaceLabel(user.role) : "";
  const messagesUrl = user
    ? messagingPath(user.role)
    : "/app";

  const showIncomingMessageAlert =
    Boolean(incomingAlert) &&
    !pathname.includes("/messages");

  const canRequestBrowserNotifications =
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "default";

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

            <NavLink
              className={navItem}
              to="/app/student/dashboard"
            >
              📊 Tableau de bord
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/courses"
            >
              📘 Mes cours
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/quiz"
            >
              🧪 Quiz
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/homework"
            >
              📫 Devoirs
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/exams"
            >
              📝 Examens
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/averages"
            >
              📊 Moyennes
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/progress"
            >
              📈 Progression
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/messages"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span>💬 Messagerie</span>
                <UnreadMessagesBadge count={unreadCount} />
              </span>
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/student/class-feed"
            >
              🏫 Espace de classe
            </NavLink>
          </>
        )}

        {user.role === "parent" && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Espace parent
            </div>

            <NavLink
              className={navItem}
              to="/app/parent/dashboard"
            >
              📊 Tableau de bord
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/parent/children"
            >
              👧 Mes enfants
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/parent/deadlines"
            >
              🗓️ Échéances
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/parent/results"
            >
              📈 Résultats
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/parent/averages"
            >
              📊 Moyennes
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/parent/messages"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span>💬</span>

                <span>Messagerie</span>
              </span>

              {unreadCount > 0 && (
                <span
                  className="
                    ml-auto
                    flex h-5 min-w-5 shrink-0
                    items-center justify-center
                    rounded-full
                    bg-red-500 px-1.5
                    text-[10px] font-bold text-white
                    shadow-sm
                  "
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/parent/class-feed"
            >
              🏫 Espace de classe
            </NavLink>
          </>
        )}

        {user.role === "teacher" && (
          <>
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Espace enseignant
            </div>

            <NavLink
              className={navItem}
              to="/app/teacher/dashboard"
            >
              📊 Tableau de bord
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/courses"
            >
              📚 Mes cours
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/classes"
            >
              🏫 Mes classes
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/assessments"
            >
              🧪 Évaluations
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/grading"
            >
              ✅ Corrections
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/averages"
            >
              📊 Moyennes
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/messages"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span>💬</span>
                <span>Messagerie</span>
              </span>

              {unreadCount > 0 && (
                <span
                  className="
                    ml-auto
                    flex h-5 min-w-5 shrink-0
                    items-center justify-center
                    rounded-full
                    bg-red-500 px-1.5
                    text-[10px] font-bold text-white
                    shadow-sm
                  "
                >
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
            </NavLink>

            <NavLink
              className={navItem}
              to="/app/teacher/class-feed"
            >
              🏫 Espace de classe
            </NavLink>
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
            <NavLink className={navItem} to="/app/admin/school-years">📅 Années scolaires</NavLink>
            <NavLink className={navItem} to="/app/admin/averages"> 🧮 Moyennes</NavLink>
            <NavLink
              className={navItem}
              to="/app/admin/messages"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span>💬 Messagerie</span>
                <UnreadMessagesBadge count={unreadCount} />
              </span>
            </NavLink>
            <NavLink
              className={navItem}
              to="/app/admin/class-feed"
            >
              🏫 Espace de classe
            </NavLink>
            <NavLink className={navItem} to="/app/admin/content">📚 Contenu</NavLink>
            <NavLink className={navItem} to="/app/admin/public-site">🌐 Site public</NavLink>
            <NavLink className={navItem} to="/app/admin/settings">⚙️ Paramètres</NavLink>
          </>
        )}

        <div className="h-px bg-gray-100 my-2" />

        <button
          type="button"
          onClick={onLogout}
          className="
            group
            w-full
            flex items-center justify-between gap-3
            rounded-2xl
            border border-gray-100
            bg-white
            px-3 py-2.5
            text-left
            shadow-sm
            transition-all duration-200
            hover:-translate-y-0.5
            hover:border-red-100
            hover:bg-red-50
            hover:shadow-md
            active:translate-y-0
          "
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="
                flex h-9 w-9 shrink-0
                items-center justify-center
                rounded-xl
                bg-gray-50
                text-gray-500
                transition-all duration-200
                group-hover:bg-red-100
                group-hover:text-red-600
              "
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4.5 w-4.5"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>

            <div className="min-w-0">
              <div
                className="
                  text-sm font-semibold text-gray-700
                  transition-colors duration-200
                  group-hover:text-red-700
                "
              >
                Déconnexion
              </div>

              <div
                className="
                  truncate text-[11px] text-gray-400
                  transition-colors duration-200
                  group-hover:text-red-500
                "
              >
                Quitter votre espace
              </div>
            </div>
          </div>

          <div
            className="
              flex h-7 w-7 shrink-0
              items-center justify-center
              rounded-full
              text-sm text-gray-400
              transition-all duration-200
              group-hover:translate-x-0.5
              group-hover:bg-red-100
              group-hover:text-red-600
            "
          >
            →
          </div>
        </button>
      </nav>
    );
  }, [user, onLogout, unreadCount]);

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
    <div className="min-h-screen overflow-x-hidden sn-soft-bg">
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          {/* Fond sombre */}
          <button
            type="button"
            aria-label="Fermer le menu"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer */}
          <aside
            className="
              absolute inset-y-0 left-0
              w-[min(88vw,320px)]
              overflow-y-auto
              bg-slate-50
              p-4
              shadow-2xl
            "
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <Link
                to="/"
                title="Retour au site public"
                onClick={() => setMobileMenuOpen(false)}
                className="
                  flex h-14 w-14 shrink-0
                  items-center justify-center
                  overflow-hidden rounded-2xl
                  border border-gray-100
                  bg-white p-1.5 shadow-sm
                "
              >
                <img
                  src={
                    logoUrl && !brandLogoError
                      ? logoUrl
                      : schoolnetLogo
                  }
                  alt={`Logo ${platformName}`}
                  className="h-full w-full object-contain"
                  onError={() => {
                    if (logoUrl) {
                      setFailedLogoUrl(logoUrl);
                    }
                  }}
                  onLoad={() => {
                    if (logoUrl) {
                      setFailedLogoUrl(null);
                    }
                  }}
                />
              </Link>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="
                  flex h-10 w-10
                  items-center justify-center
                  rounded-xl
                  border border-slate-200
                  bg-white
                  text-xl font-bold text-slate-500
                  shadow-sm
                  transition
                  hover:bg-slate-100
                  hover:text-slate-900
                "
                aria-label="Fermer le menu"
              >
                ×
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className="
                    flex h-10 min-w-10
                    items-center justify-center
                    rounded-full
                    bg-blue-600 px-3
                    font-semibold text-white
                  "
                >
                  {rInitial}
                </div>

                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">
                    {displayName}
                  </div>

                  <div className="text-xs text-slate-500">
                    {rLabel}
                  </div>
                </div>
              </div>
            </div>

            <div
              onClick={(event) => {
                const target = event.target as HTMLElement;

                if (target.closest("a")) {
                  setMobileMenuOpen(false);
                }
              }}
            >
              {nav}
            </div>

            <div className="mt-4 px-2 text-xs leading-5 text-gray-500">
              Astuce : les accès sont protégés par rôle. Si tu tapes
              une URL d’un autre rôle, tu seras redirigé
              automatiquement.
            </div>
          </aside>
        </div>
      )}
      <div className="min-h-screen lg:flex">
        <aside className="hidden w-72 shrink-0 space-y-4 p-4 lg:block">
          <div className="sn-card p-4">
            <div className="flex items-start justify-between gap-3">
              <Link
                to="/"
                title="Retour au site public"
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm transition hover:shadow-md"
              >
                <img
                  src={
                    logoUrl && !brandLogoError
                      ? logoUrl
                      : schoolnetLogo
                  }
                  alt={`Logo ${platformName}`}
                  className="h-full w-full object-contain"
                  onError={() => {
                    if (logoUrl) {
                      setFailedLogoUrl(logoUrl);
                    }
                  }}
                  onLoad={() => {
                    if (logoUrl) {
                      setFailedLogoUrl(null);
                    }
                  }}
                />
              </Link>

              <div className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 px-3 font-semibold text-white shadow-sm">
                {rInitial}
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
              Connecté :{" "}
              <span className="font-semibold text-gray-700">
                {displayName}
              </span>
            </div>
          </div>

          {nav}

          <div className="text-xs text-gray-500 px-2">
            Astuce : les accès sont protégés par rôle. Si tu tapes une URL d’un autre rôle,
            tu seras redirigé automatiquement.
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6 p-4 sm:p-5 lg:p-6">
          <div
            className="
              sn-card sn-card-hover
              flex flex-col gap-4
              px-4 py-4
              sm:flex-row
              sm:items-center
              sm:justify-between
              sm:px-6
            "
          >
            <div className="flex min-w-0 items-start gap-3">
              {/* Bouton menu mobile */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="
                  flex h-11 w-11 shrink-0
                  items-center justify-center
                  rounded-xl
                  border border-slate-200
                  bg-white
                  text-slate-700
                  shadow-sm
                  transition
                  hover:border-blue-200
                  hover:bg-blue-50
                  hover:text-blue-700
                  lg:hidden
                "
                aria-label="Ouvrir le menu"
                aria-expanded={mobileMenuOpen}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <line x1="4" x2="20" y1="6" y2="6" />
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="18" y2="18" />
                </svg>
              </button>

              <div className="min-w-0">
                <div className="text-base font-semibold sm:text-lg">
                  Bonjour 👋{" "}
                  <span className="break-words text-gray-900">
                    {displayName}
                  </span>
                </div>

                <div className="mt-0.5 text-sm text-gray-500">
                  {rSubtitle}
                </div>

                {institutionName && (
                  <div className="mt-0.5 text-xs font-medium text-blue-600">
                    {institutionName}
                  </div>
                )}

                <div className="mt-0.5 text-xs text-gray-500">
                  {rSpace}
                </div>
              </div>
            </div>

            <div
              className="
                flex w-full items-center
                justify-between gap-3
                sm:w-auto
                sm:justify-end
              "
            >
              <div className="relative">
                <NotificationBell />

                {unreadCount > 0 && (
                  <span
                    className="
                      pointer-events-none
                      absolute -right-1 -top-1
                      flex h-5 min-w-5
                      items-center justify-center
                      rounded-full
                      border-2 border-white
                      bg-red-500 px-1
                      text-[9px] font-bold text-white
                      shadow-md
                    "
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>

              <div className="hidden text-right sm:block">
                <div className="text-sm font-medium">
                  {rLabel}
                </div>

                <div className="text-xs text-gray-500">
                  {user.isDemo ? "Mode démo" : "Compte réel"}
                </div>
              </div>

              <div
                className="
                  flex h-10 min-w-10
                  items-center justify-center
                  rounded-full
                  bg-blue-600 px-3
                  font-semibold text-white
                  shadow-sm
                "
              >
                {rInitial}
              </div>
            </div>
          </div>

          <Outlet />
        </main>
      </div>
      {showIncomingMessageAlert &&
        incomingAlert &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="
              fixed bottom-6 right-6 z-[9999]
              w-[min(420px,calc(100vw-2rem))]
              overflow-hidden rounded-3xl
              border border-blue-100
              bg-white
              shadow-[0_24px_70px_rgba(15,23,42,0.25)]
            "
          >
            <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />

            <div className="p-5">
              <div className="flex items-start gap-4">
                <div
                  className="
                    flex h-12 w-12 shrink-0 items-center justify-center
                    rounded-2xl
                    bg-gradient-to-br from-blue-600 to-indigo-600
                    text-xl text-white
                    shadow-lg shadow-blue-200
                  "
                >
                  💬
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Nouveau message
                      </div>

                      <div className="mt-1 text-base font-bold text-gray-900">
                        {incomingAlert.senderName}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={dismissIncomingAlert}
                      className="
                        flex h-8 w-8 shrink-0 items-center justify-center
                        rounded-full text-gray-400
                        transition hover:bg-gray-100 hover:text-gray-700
                      "
                      aria-label="Fermer l’alerte"
                    >
                      ×
                    </button>
                  </div>

                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                    {incomingAlert.body}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="
                        rounded-xl bg-blue-600
                        px-4 py-2
                        text-sm font-semibold text-white
                        shadow-sm transition
                        hover:bg-blue-700 hover:shadow-md
                      "
                      onClick={() => {
                        dismissIncomingAlert();
                        navigate(messagesUrl);
                      }}
                    >
                      Ouvrir la conversation
                    </button>

                    {canRequestBrowserNotifications && (
                      <button
                        type="button"
                        className="
                          rounded-xl border border-gray-200
                          bg-white px-3 py-2
                          text-xs font-medium text-gray-600
                          transition
                          hover:border-blue-200
                          hover:bg-blue-50
                          hover:text-blue-700
                        "
                        onClick={() => {
                          void requestBrowserNotificationPermission();
                        }}
                      >
                        🔔 Activer les alertes système
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
