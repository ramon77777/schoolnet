import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";
import type { PublicPage } from "@/features/public/lib/publicCms";

const PAGE_ORDER = [
  "bibliotheque",
  "niveaux",
  "tarifs",
  "a-propos",
  "contact",
];

const PAGE_LABELS: Record<string, string> = {
  bibliotheque: "Bibliothèque",
  niveaux: "Niveaux",
  tarifs: "Tarifs",
  "a-propos": "À propos",
  contact: "Contact",
};

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

function nullableText(value: string | null) {
  const cleanValue = value?.trim() ?? "";
  return cleanValue.length > 0 ? cleanValue : null;
}

export default function AdminPublicPagesEditor() {
  const [pages, setPages] = useState<PublicPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: loadError } = await supabase
        .from("public_pages")
        .select("*");

      if (loadError) {
        throw loadError;
      }

      const loadedPages =
        (data as PublicPage[] | null) ?? [];

      const sortedPages = [...loadedPages].sort(
        (a, b) => {
          const indexA = PAGE_ORDER.indexOf(a.slug);
          const indexB = PAGE_ORDER.indexOf(b.slug);

          const safeA =
            indexA === -1
              ? Number.MAX_SAFE_INTEGER
              : indexA;

          const safeB =
            indexB === -1
              ? Number.MAX_SAFE_INTEGER
              : indexB;

          return safeA - safeB;
        }
      );

      setPages(sortedPages);
      setDirty(false);
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          "Impossible de charger les pages publiques."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const visibleCount = useMemo(
    () =>
      pages.filter((page) => page.is_visible)
        .length,
    [pages]
  );

  const hiddenCount =
    pages.length - visibleCount;

  function updatePage(
    slug: string,
    patch: Partial<PublicPage>
  ) {
    setPages((current) =>
      current.map((page) =>
        page.slug === slug
          ? {
              ...page,
              ...patch,
            }
          : page
      )
    );

    setDirty(true);
    setSuccess(null);
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const invalidPage = pages.find(
      (page) =>
        !page.nav_title?.trim() ||
        !page.title?.trim()
    );

    if (invalidPage) {
      setError(
        `La page « ${
          PAGE_LABELS[invalidPage.slug] ??
          invalidPage.slug
        } » doit avoir un titre de navigation et un titre principal.`
      );

      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const updatedAt =
        new Date().toISOString();

      const results = await Promise.all(
        pages.map((page) =>
          supabase
            .from("public_pages")
            .update({
              nav_title:
                page.nav_title?.trim() ??
                page.slug,

              eyebrow:
                nullableText(page.eyebrow),

              title:
                page.title?.trim() ??
                page.slug,

              intro:
                nullableText(page.intro),

              body:
                nullableText(page.body),

              is_visible:
                page.is_visible,

              updated_at:
                updatedAt,

              updated_by:
                user?.id ?? null,
            })
            .eq("slug", page.slug)
        )
      );

      const firstError = results.find(
        (result) => result.error
      )?.error;

      if (firstError) {
        throw firstError;
      }

      setSuccess(
        "Les pages publiques ont été enregistrées avec succès."
      );

      await loadPages();

      setSuccess(
        "Les pages publiques ont été enregistrées avec succès."
      );
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer les pages publiques."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="sn-card p-6">
        <div className="text-sm text-gray-500">
          Chargement des pages publiques…
        </div>
      </section>
    );
  }

  return (
    <section className="sn-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            📄 Éditeur des pages publiques
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Modifiez les textes et la visibilité
            des cinq pages principales de la
            vitrine SchoolNet.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            {visibleCount} visible(s)
          </span>

          <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
            {hiddenCount} masquée(s)
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            ✅ {success}
          </div>
        )}

        {pages.map((page, index) => {
          const pageLabel =
            PAGE_LABELS[page.slug] ??
            page.nav_title ??
            page.slug;

          return (
            <article
              key={page.slug}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                    Page {index + 1}
                  </div>

                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {pageLabel}
                  </div>

                  <div className="mt-1 text-xs text-gray-400">
                    /{page.slug}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updatePage(
                        page.slug,
                        {
                          is_visible:
                            !page.is_visible,
                        }
                      )
                    }
                    className={[
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                      page.is_visible
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    ].join(" ")}
                  >
                    {page.is_visible
                      ? "● Visible"
                      : "● Masquée"}
                  </button>

                  <a
                    href={`/${page.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    Tester ↗
                  </a>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    Titre de navigation
                  </label>

                  <input
                    type="text"
                    value={
                      page.nav_title ?? ""
                    }
                    onChange={(event) =>
                      updatePage(
                        page.slug,
                        {
                          nav_title:
                            event.target.value,
                        }
                      )
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />

                  <p className="mt-1 text-[11px] text-gray-400">
                    Le menu principal reste géré
                    séparément dans l’onglet
                    Navigation.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    Slug / chemin technique
                  </label>

                  <input
                    type="text"
                    value={`/${page.slug}`}
                    disabled
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500"
                  />

                  <p className="mt-1 text-[11px] text-gray-400">
                    Protégé afin de ne pas casser
                    les routes existantes.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    Sur-titre
                  </label>

                  <input
                    type="text"
                    value={
                      page.eyebrow ?? ""
                    }
                    onChange={(event) =>
                      updatePage(
                        page.slug,
                        {
                          eyebrow:
                            event.target.value,
                        }
                      )
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    Titre principal
                  </label>

                  <input
                    type="text"
                    value={
                      page.title ?? ""
                    }
                    onChange={(event) =>
                      updatePage(
                        page.slug,
                        {
                          title:
                            event.target.value,
                        }
                      )
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold text-gray-600">
                  Introduction
                </label>

                <textarea
                  rows={3}
                  value={page.intro ?? ""}
                  onChange={(event) =>
                    updatePage(
                      page.slug,
                      {
                        intro:
                          event.target.value,
                      }
                    )
                  }
                  className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold text-gray-600">
                  Contenu principal
                </label>

                <textarea
                  rows={5}
                  value={page.body ?? ""}
                  onChange={(event) =>
                    updatePage(
                      page.slug,
                      {
                        body:
                          event.target.value,
                      }
                    )
                  }
                  placeholder="Texte complémentaire de la page…"
                  className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="text-xs text-gray-400">
          {dirty
            ? "Des modifications ne sont pas encore enregistrées."
            : "Les données affichées sont enregistrées."}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() =>
              void loadPages()
            }
            disabled={
              saving || !dirty
            }
            className="sn-btn-ghost sn-press disabled:cursor-not-allowed disabled:opacity-50"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={() =>
              void handleSave()
            }
            disabled={
              saving || !dirty
            }
            className="sn-btn-primary sn-press disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Enregistrement…"
              : "Enregistrer"}
          </button>
        </div>
      </div>
    </section>
  );
}