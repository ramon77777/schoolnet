import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";

import {
  loadPublicShellContent,
  type PublicFooterLink,
  type PublicNavigationItem,
  type PublicSiteSettings,
} from "@/features/public/lib/publicCms";

import schoolnetLogo from "@/assets/branding/schoolnet-logo.png";

const fallbackNavItems: PublicNavigationItem[] = [
  {
    id: "fallback-home",
    label: "Accueil",
    path: "/",
    sort_order: 1,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-library",
    label: "Bibliothèque",
    path: "/bibliotheque",
    sort_order: 2,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-levels",
    label: "Niveaux",
    path: "/niveaux",
    sort_order: 3,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-pricing",
    label: "Tarifs",
    path: "/tarifs",
    sort_order: 4,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-about",
    label: "À propos",
    path: "/a-propos",
    sort_order: 5,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-contact",
    label: "Contact",
    path: "/contact",
    sort_order: 6,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
];

const fallbackFooterLinks: PublicFooterLink[] = [
  {
    id: "fallback-footer-1",
    group_key: "discover",
    group_title: "Découvrir",
    label: "Bibliothèque",
    path: "/bibliotheque",
    group_sort_order: 1,
    link_sort_order: 1,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-footer-2",
    group_key: "discover",
    group_title: "Découvrir",
    label: "Niveaux",
    path: "/niveaux",
    group_sort_order: 1,
    link_sort_order: 2,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-footer-3",
    group_key: "discover",
    group_title: "Découvrir",
    label: "Tarifs",
    path: "/tarifs",
    group_sort_order: 1,
    link_sort_order: 3,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-footer-4",
    group_key: "schoolnet",
    group_title: "SchoolNet",
    label: "À propos",
    path: "/a-propos",
    group_sort_order: 2,
    link_sort_order: 1,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-footer-5",
    group_key: "schoolnet",
    group_title: "SchoolNet",
    label: "Contact",
    path: "/contact",
    group_sort_order: 2,
    link_sort_order: 2,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
  {
    id: "fallback-footer-6",
    group_key: "schoolnet",
    group_title: "SchoolNet",
    label: "Espace utilisateur",
    path: "/auth/login",
    group_sort_order: 2,
    link_sort_order: 3,
    is_visible: true,
    created_at: "",
    updated_at: "",
    updated_by: null,
  },
];

type FooterGroup = {
  key: string;
  title: string;
  links: PublicFooterLink[];
};

function groupFooterLinks(
  links: PublicFooterLink[],
): FooterGroup[] {
  const groups = new Map<string, FooterGroup>();

  links.forEach((link) => {
    const existing = groups.get(link.group_key);

    if (existing) {
      existing.links.push(link);
      return;
    }

    groups.set(link.group_key, {
      key: link.group_key,
      title: link.group_title?.trim() || "Liens utiles",
      links: [link],
    });
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    links: [...group.links].sort(
      (a, b) => a.link_sort_order - b.link_sort_order,
    ),
  }));
}

export default function PublicLayout() {
  const currentYear = new Date().getFullYear();

  const location = useLocation();

  const isHomePage = location.pathname === "/";

  const [settings, setSettings] =
    useState<PublicSiteSettings | null>(null);

  const [navigation, setNavigation] =
    useState<PublicNavigationItem[]>(fallbackNavItems);

  const [footerLinks, setFooterLinks] =
    useState<PublicFooterLink[]>(fallbackFooterLinks);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const content = await loadPublicShellContent();

        if (cancelled) return;

        if (content.settings) {
          setSettings(content.settings);
        }

        if (content.navigation.length > 0) {
          setNavigation(content.navigation);
        }

        if (content.footerLinks.length > 0) {
          setFooterLinks(content.footerLinks);
        }
      } catch (error) {
        console.error(
          "Impossible de charger le CMS public SchoolNet.",
          error,
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = useMemo(
    () =>
      [...navigation]
        .filter((item) => item.is_visible)
        .sort((a, b) => a.sort_order - b.sort_order),
    [navigation],
  );

  const footerGroups = useMemo(
    () =>
      groupFooterLinks(
        footerLinks
          .filter((item) => item.is_visible)
          .sort(
            (a, b) =>
              a.group_sort_order - b.group_sort_order ||
              a.link_sort_order - b.link_sort_order,
          ),
      ),
    [footerLinks],
  );

  const tagline =
    settings?.header_tagline?.trim() ||
    "Apprendre. Enseigner. Suivre.";

  const loginLabel =
    settings?.login_button_label?.trim() ||
    "Se connecter";

  const footerDescription =
    settings?.footer_description?.trim() ||
    "Une plateforme éducative moderne pensée pour rapprocher apprenants, enseignants, parents et établissements scolaires.";

  const ambitionTitle =
    settings?.footer_ambition_title?.trim() ||
    "Notre ambition";

  const ambitionText =
    settings?.footer_ambition_text?.trim() ||
    "Faciliter l'accès aux ressources pédagogiques et améliorer le suivi scolaire grâce au numérique.";

  const copyrightText =
    settings?.copyright_text?.trim() ||
    `© ${currentYear} SchoolNet. Tous droits réservés.`;

  const bottomText =
    settings?.footer_bottom_text?.trim() ||
    "Plateforme éducative numérique";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header
        className={[
          "z-50 transition-all duration-300",
          isHomePage
            ? "absolute inset-x-0 top-0 border-b border-white/10 bg-transparent"
            : "sticky top-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-6 px-6 py-4 sm:px-8 lg:px-12 xl:px-16">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3"
          >
            <div
              className={[
                "flex items-center justify-center rounded-2xl transition",
                isHomePage
                  ? "bg-white/95 px-2.5 py-1.5 shadow-lg"
                  : "",
              ].join(" ")}
            >
              <img
                src={schoolnetLogo}
                alt="SchoolNet"
                className="h-11 w-auto shrink-0 object-contain"
              />
            </div>

            <div className="min-w-0">
              <div
                className={[
                  "truncate text-xs font-semibold transition",
                  isHomePage
                    ? "text-blue-100"
                    : "text-slate-500",
                ].join(" ")}
              >
                {tagline}
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 xl:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  [
                    "rounded-xl px-4 py-2.5 text-sm font-bold transition",
                    isHomePage
                      ? isActive
                        ? "bg-white/15 text-white backdrop-blur-md"
                        : "text-blue-50 hover:bg-white/10 hover:text-white"
                      : isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Link
            to="/auth/login"
            className={[
              "shrink-0 rounded-2xl px-5 py-3 text-sm font-black transition",
              isHomePage
                ? "border border-white/80 bg-white text-blue-700 shadow-xl hover:-translate-y-0.5 hover:bg-blue-50"
                : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700",
            ].join(" ")}
          >
            {loginLabel}
          </Link>
        </div>

        <div
          className={[
            "px-4 py-2 xl:hidden",
            isHomePage
              ? "border-t border-white/10 bg-[#06132f]/80 backdrop-blur-xl"
              : "border-t border-slate-100 bg-white",
          ].join(" ")}
        >
          <nav className="mx-auto flex max-w-7xl flex-nowrap gap-1.5 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  [
                    "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-semibold sm:px-3 sm:text-xs",
                    isHomePage
                      ? isActive
                        ? "bg-white text-blue-700"
                        : "bg-white/10 text-white"
                      : isActive
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="relative overflow-hidden bg-[#020817] text-slate-300">
        {/* Décoration de fond */}
        <div className="pointer-events-none absolute -left-32 top-0 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-violet-600/10 blur-3xl" />

        <div className="relative mx-auto max-w-[1680px] px-6 py-16 sm:px-8 lg:px-12 xl:px-16">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_1fr] lg:gap-10">
            {/* Identité SchoolNet */}
            <div className="max-w-md">
              <Link
                to="/"
                className="inline-flex items-center gap-4"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white p-2 shadow-lg">
                  <img
                    src={schoolnetLogo}
                    alt="SchoolNet"
                    className="h-full w-full object-contain"
                  />
                </div>

                <div>
                  <div className="text-xl font-black tracking-tight text-white">
                    SchoolNet
                  </div>

                  <div className="mt-1 text-xs font-medium text-slate-500">
                    {tagline}
                  </div>
                </div>
              </Link>

              <p className="mt-6 max-w-sm text-sm leading-7 text-slate-400">
                {footerDescription}
              </p>

              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Plateforme éducative numérique
              </div>
            </div>

            {/* Groupes CMS */}
            {footerGroups.slice(0, 2).map((group) => (
              <div key={group.key}>
                <div className="text-sm font-black uppercase tracking-[0.12em] text-white">
                  {group.title}
                </div>

                <div className="mt-6 space-y-4 text-sm">
                  {group.links.map((link) => (
                    <Link
                      key={link.id}
                      to={link.path}
                      className="group flex w-fit items-center gap-2 text-slate-400 transition hover:text-white"
                    >
                      <span>{link.label}</span>

                      <span className="translate-x-0 text-xs text-blue-400 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Ambition */}
            <div>
              <div className="text-sm font-black uppercase tracking-[0.12em] text-white">
                {ambitionTitle}
              </div>

              <p className="mt-6 max-w-sm text-sm leading-7 text-slate-400">
                {ambitionText}
              </p>

              <Link
                to="/a-propos"
                className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-400 transition hover:text-blue-300"
              >
                Découvrir SchoolNet
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Bas du footer */}
        <div className="relative border-t border-white/[0.07]">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-6 py-6 text-xs text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12 xl:px-16">
            <span>{copyrightText}</span>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span>{bottomText}</span>

              <Link
                to="/auth/login"
                className="font-semibold text-slate-400 transition hover:text-white"
              >
                Espace utilisateur
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
