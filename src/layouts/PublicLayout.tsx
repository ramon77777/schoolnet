import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import {
  loadPublicShellContent,
  type PublicFooterLink,
  type PublicNavigationItem,
  type PublicSiteSettings,
} from "@/features/public/lib/publicCms";

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
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-sm font-black text-white shadow-lg shadow-blue-500/20">
              SN
            </div>

            <div className="min-w-0">
              <div className="truncate text-lg font-black tracking-tight text-slate-950">
                SchoolNet
              </div>

              <div className="truncate text-xs font-medium text-slate-500">
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
                    "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                    isActive
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
            className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            {loginLabel}
          </Link>
        </div>

        <div className="border-t border-slate-100 px-4 py-2 xl:hidden">
          <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) =>
                  [
                    "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold",
                    isActive
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

      <footer className="mt-20 bg-slate-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <div className="text-xl font-black text-white">
              SchoolNet
            </div>

            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
              {footerDescription}
            </p>
          </div>

          {footerGroups.slice(0, 2).map((group) => (
            <div key={group.key}>
              <div className="font-bold text-white">
                {group.title}
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {group.links.map((link) => (
                  <Link
                    key={link.id}
                    className="block hover:text-white"
                    to={link.path}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div>
            <div className="font-bold text-white">
              {ambitionTitle}
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-400">
              {ambitionText}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-800">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <span>{copyrightText}</span>
            <span>{bottomText}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
