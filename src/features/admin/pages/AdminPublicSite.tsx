import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";
import AdminPublicHomeEditor from "@/features/admin/components/public-site/AdminPublicHomeEditor";
import AdminPublicPagesEditor from "@/features/admin/components/public-site/AdminPublicPagesEditor";
import AdminPublicNavigationEditor from "@/features/admin/components/public-site/AdminPublicNavigationEditor";
import AdminPublicFooterEditor from "@/features/admin/components/public-site/AdminPublicFooterEditor";

type TabKey =
  | "home"
  | "navigation"
  | "pages"
  | "footer";

type CmsCounts = {
  siteSettings: number;
  navigationItems: number;
  homeCards: number;
  pages: number;
  footerLinks: number;
};

const EMPTY_COUNTS: CmsCounts = {
  siteSettings: 0,
  navigationItems: 0,
  homeCards: 0,
  pages: 0,
  footerLinks: 0,
};

const tabs: Array<{
  key: TabKey;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    key: "home",
    label: "Accueil",
    icon: "🏠",
    description:
      "Hero, présentation, utilisateurs, avantages et appel à l’action.",
  },
  {
    key: "navigation",
    label: "Navigation",
    icon: "🧭",
    description:
      "Libellés, ordre, visibilité et liens de la barre de navigation.",
  },
  {
    key: "pages",
    label: "Pages",
    icon: "📄",
    description:
      "Bibliothèque, niveaux, tarifs, à propos et contact.",
  },
  {
    key: "footer",
    label: "Footer",
    icon: "🧩",
    description:
      "Description, groupes de liens, ambition et mentions de bas de page.",
  },
];

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

export default function AdminPublicSite() {
  const [activeTab, setActiveTab] =
    useState<TabKey>("home");

  const [counts, setCounts] =
    useState<CmsCounts>(EMPTY_COUNTS);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        siteSettingsResult,
        navigationResult,
        homeCardsResult,
        pagesResult,
        footerResult,
      ] = await Promise.all([
        supabase
          .from("public_site_settings")
          .select("*", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("public_navigation_items")
          .select("*", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("public_home_cards")
          .select("*", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("public_pages")
          .select("*", {
            count: "exact",
            head: true,
          }),

        supabase
          .from("public_footer_links")
          .select("*", {
            count: "exact",
            head: true,
          }),
      ]);

      const firstError =
        siteSettingsResult.error ??
        navigationResult.error ??
        homeCardsResult.error ??
        pagesResult.error ??
        footerResult.error;

      if (firstError) {
        throw firstError;
      }

      setCounts({
        siteSettings:
          siteSettingsResult.count ?? 0,
        navigationItems:
          navigationResult.count ?? 0,
        homeCards:
          homeCardsResult.count ?? 0,
        pages:
          pagesResult.count ?? 0,
        footerLinks:
          footerResult.count ?? 0,
      });
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          "Impossible de charger les données du site public."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const activeConfig = useMemo(
    () =>
      tabs.find(
        (tab) => tab.key === activeTab
      ) ?? tabs[0],
    [activeTab]
  );

  const activeCount = useMemo(() => {
    switch (activeTab) {
      case "home":
        return (
          counts.siteSettings +
          counts.homeCards
        );

      case "navigation":
        return counts.navigationItems;

      case "pages":
        return counts.pages;

      case "footer":
        return counts.footerLinks;

      default:
        return 0;
    }
  }, [activeTab, counts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xl font-semibold text-gray-900">
            Site public
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Gérez l’ensemble des contenus visibles
            sur la vitrine publique de SchoolNet.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="sn-btn-ghost sn-press"
          >
            {loading
              ? "Actualisation…"
              : "↻ Actualiser"}
          </button>

          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="sn-btn-primary sn-press inline-flex items-center justify-center"
          >
            Voir le site public ↗
          </a>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <div className="font-semibold">
            Impossible de charger le CMS
          </div>

          <div className="mt-1">
            {error}
          </div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-xl lg:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 right-32 h-64 w-64 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-50">
              🌐 Administration du site public
            </div>

            <h1 className="mt-4 text-2xl font-bold sm:text-3xl">
              Pilotez toute la vitrine SchoolNet
              depuis un seul espace.
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
              Les textes, sections, liens et pages
              publiques sont centralisés dans
              Supabase et peuvent être administrés
              sans modifier le code de la plateforme.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[430px]">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-xs text-blue-100">
                Navigation
              </div>

              <div className="mt-1 text-2xl font-bold">
                {loading
                  ? "…"
                  : counts.navigationItems}
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-xs text-blue-100">
                Cartes accueil
              </div>

              <div className="mt-1 text-2xl font-bold">
                {loading
                  ? "…"
                  : counts.homeCards}
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-xs text-blue-100">
                Pages
              </div>

              <div className="mt-1 text-2xl font-bold">
                {loading
                  ? "…"
                  : counts.pages}
              </div>
            </div>

            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <div className="text-xs text-blue-100">
                Liens footer
              </div>

              <div className="mt-1 text-2xl font-bold">
                {loading
                  ? "…"
                  : counts.footerLinks}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sn-card overflow-hidden">
        <div className="border-b border-gray-100 px-4 pt-4 sm:px-6">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {tabs.map((tab) => {
              const selected =
                activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setActiveTab(tab.key)
                  }
                  className={[
                    "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                    selected
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  ].join(" ")}
                >
                  <span className="mr-2">
                    {tab.icon}
                  </span>

                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.6fr_0.9fr]">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
                    {activeConfig.icon}{" "}
                    {activeConfig.label}
                  </div>

                  <div className="mt-2 text-lg font-semibold text-gray-900">
                    Gestion de la section{" "}
                    {activeConfig.label.toLowerCase()}
                  </div>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                    {activeConfig.description}
                  </p>
                </div>

                <div className="rounded-xl bg-blue-50 px-3 py-2 text-center">
                  <div className="text-xl font-bold text-blue-700">
                    {loading
                      ? "…"
                      : activeCount}
                  </div>

                  <div className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">
                    éléments
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5">
                <div className="font-semibold text-gray-900">
                  CMS public opérationnel
                </div>

                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Cette section est entièrement raccordée à Supabase.
                  Les contenus, leur visibilité et leur organisation
                  peuvent être administrés directement depuis cet espace.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 p-5 text-white">
              <div className="text-sm font-semibold">
                État du CMS public
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">
                    Paramètres généraux
                  </span>

                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    {counts.siteSettings > 0
                      ? "Prêt"
                      : "À vérifier"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">
                    Navigation
                  </span>

                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    {counts.navigationItems} élément(s)
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">
                    Pages publiques
                  </span>

                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    {counts.pages} page(s)
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-300">
                    Footer
                  </span>

                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    {counts.footerLinks} lien(s)
                  </span>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-400">
                Les permissions administrateur et
                les politiques RLS déjà créées
                restent utilisées.
              </div>
            </div>
          </div>
        </div>
      </section>

      {activeTab === "home" && (
        <AdminPublicHomeEditor />
      )}

      {activeTab === "pages" && (
        <AdminPublicPagesEditor />
      )}

      {activeTab === "navigation" && (
        <AdminPublicNavigationEditor onChanged={loadOverview} />
      )}

      {activeTab === "footer" && (
        <AdminPublicFooterEditor onChanged={loadOverview} />
      )}
    </div>
  );
}
