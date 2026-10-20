import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

import type {
  PublicFooterLink,
  PublicSiteSettings,
} from "@/features/public/lib/publicCms";

type Props = {
  onChanged?: () => void | Promise<void>;
};

type FooterSettingsDraft = {
  footer_description: string;
  footer_ambition_title: string;
  footer_ambition_text: string;
  copyright_text: string;
  footer_bottom_text: string;
};

type FooterGroupKey =
  | "discover"
  | "schoolnet";

type NewLinkForm = {
  groupKey: FooterGroupKey;
  label: string;
  path: string;
  isVisible: boolean;
};

const GROUP_META: Record<
  FooterGroupKey,
  {
    title: string;
    order: number;
  }
> = {
  discover: {
    title: "Découvrir",
    order: 10,
  },
  schoolnet: {
    title: "SchoolNet",
    order: 20,
  },
};

const EMPTY_NEW_LINK: NewLinkForm = {
  groupKey: "discover",
  label: "",
  path: "",
  isVisible: true,
};

function getErrorMessage(
  error: unknown,
  fallback: string
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message ===
      "string"
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

function normalizePath(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return trimmed;
  }

  return trimmed.startsWith("/")
    ? trimmed
    : `/${trimmed}`;
}

function nullableText(value: string) {
  const cleanValue = value.trim();

  return cleanValue.length > 0
    ? cleanValue
    : null;
}

function sortLinks(
  links: PublicFooterLink[]
) {
  return [...links].sort((a, b) => {
    if (
      a.group_sort_order !==
      b.group_sort_order
    ) {
      return (
        a.group_sort_order -
        b.group_sort_order
      );
    }

    if (
      a.link_sort_order !==
      b.link_sort_order
    ) {
      return (
        a.link_sort_order -
        b.link_sort_order
      );
    }

    return a.label.localeCompare(
      b.label,
      "fr"
    );
  });
}

export default function AdminPublicFooterEditor({
  onChanged,
}: Props) {
  const [settings, setSettings] =
    useState<FooterSettingsDraft | null>(
      null
    );

  const [links, setLinks] =
    useState<PublicFooterLink[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [creating, setCreating] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [dirty, setDirty] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [
    showCreateModal,
    setShowCreateModal,
  ] = useState(false);

  const [
    pendingDelete,
    setPendingDelete,
  ] =
    useState<PublicFooterLink | null>(
      null
    );

  const [newLink, setNewLink] =
    useState<NewLinkForm>(
      EMPTY_NEW_LINK
    );

  const loadFooter =
    useCallback(async () => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const [
          settingsResult,
          linksResult,
        ] = await Promise.all([
          supabase
            .from(
              "public_site_settings"
            )
            .select("*")
            .eq("id", 1)
            .maybeSingle(),

          supabase
            .from(
              "public_footer_links"
            )
            .select("*")
            .order(
              "group_sort_order",
              {
                ascending: true,
              }
            )
            .order(
              "link_sort_order",
              {
                ascending: true,
              }
            ),
        ]);

        if (settingsResult.error) {
          throw settingsResult.error;
        }

        if (linksResult.error) {
          throw linksResult.error;
        }

        const row =
          settingsResult.data as
            | PublicSiteSettings
            | null;

        if (!row) {
          throw new Error(
            "Les paramètres généraux du site public sont introuvables."
          );
        }

        setSettings({
          footer_description:
            row.footer_description ??
            "",
          footer_ambition_title:
            row.footer_ambition_title ??
            "",
          footer_ambition_text:
            row.footer_ambition_text ??
            "",
          copyright_text:
            row.copyright_text ??
            "",
          footer_bottom_text:
            row.footer_bottom_text ??
            "",
        });

        setLinks(
          sortLinks(
            (linksResult.data as
              | PublicFooterLink[]
              | null) ?? []
          )
        );

        setDirty(false);
      } catch (loadError) {
        setError(
          getErrorMessage(
            loadError,
            "Impossible de charger le Footer public."
          )
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadFooter();
  }, [loadFooter]);

  const orderedLinks = useMemo(
    () => sortLinks(links),
    [links]
  );

  const visibleCount = useMemo(
    () =>
      links.filter(
        (link) => link.is_visible
      ).length,
    [links]
  );

  const hiddenCount =
    links.length - visibleCount;

  function updateSettings(
    patch: Partial<FooterSettingsDraft>
  ) {
    setSettings((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current
    );

    setDirty(true);
    setSuccess(null);
  }

  function updateLink(
    id: string,
    patch: Partial<PublicFooterLink>
  ) {
    setLinks((current) =>
      current.map((link) =>
        link.id === id
          ? {
              ...link,
              ...patch,
            }
          : link
      )
    );

    setDirty(true);
    setSuccess(null);
  }

  function updateGroupTitle(
    groupKey: FooterGroupKey,
    value: string
  ) {
    setLinks((current) =>
      current.map((link) =>
        link.group_key === groupKey
          ? {
              ...link,
              group_title: value,
            }
          : link
      )
    );

    setDirty(true);
    setSuccess(null);
  }

  function getGroupTitle(
    groupKey: FooterGroupKey
  ) {
    return (
      links.find(
        (link) =>
          link.group_key === groupKey
      )?.group_title ??
      GROUP_META[groupKey].title
    );
  }

  function moveLink(
    id: string,
    direction: -1 | 1
  ) {
    const target =
      links.find(
        (link) => link.id === id
      );

    if (!target) {
      return;
    }

    const groupLinks =
      sortLinks(
        links.filter(
          (link) =>
            link.group_key ===
            target.group_key
        )
      );

    const index =
      groupLinks.findIndex(
        (link) => link.id === id
      );

    const nextIndex =
      index + direction;

    if (
      index < 0 ||
      nextIndex < 0 ||
      nextIndex >=
        groupLinks.length
    ) {
      return;
    }

    const reordered = [
      ...groupLinks,
    ];

    const currentItem =
      reordered[index];

    reordered[index] =
      reordered[nextIndex];

    reordered[nextIndex] =
      currentItem;

    const orderMap =
      new Map<string, number>();

    reordered.forEach(
      (link, linkIndex) => {
        orderMap.set(
          link.id,
          (linkIndex + 1) * 10
        );
      }
    );

    setLinks((current) =>
      current.map((link) =>
        link.group_key ===
        target.group_key
          ? {
              ...link,
              link_sort_order:
                orderMap.get(
                  link.id
                ) ??
                link.link_sort_order,
            }
          : link
      )
    );

    setDirty(true);
    setSuccess(null);
  }

  function openCreateModal() {
    if (dirty) {
      setError(
        "Enregistrez ou annulez les modifications en attente avant d’ajouter un lien."
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setNewLink(EMPTY_NEW_LINK);
    setShowCreateModal(true);
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (!settings) {
      setError(
        "Les paramètres du Footer ne sont pas chargés."
      );
      return;
    }

    const invalidLink =
      links.find(
        (link) =>
          !link.group_title.trim() ||
          !link.label.trim() ||
          !normalizePath(
            link.path
          )
      );

    if (invalidLink) {
      setError(
        `Le lien « ${
          invalidLink.label ||
          "Sans titre"
        } » comporte un champ obligatoire vide.`
      );
      return;
    }

    setSaving(true);

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      const updatedAt =
        new Date().toISOString();

      const settingsResult =
        await supabase
          .from(
            "public_site_settings"
          )
          .update({
            footer_description:
              nullableText(
                settings.footer_description
              ),
            footer_ambition_title:
              nullableText(
                settings.footer_ambition_title
              ),
            footer_ambition_text:
              nullableText(
                settings.footer_ambition_text
              ),
            copyright_text:
              nullableText(
                settings.copyright_text
              ),
            footer_bottom_text:
              nullableText(
                settings.footer_bottom_text
              ),
            updated_at: updatedAt,
            updated_by:
              user?.id ?? null,
          })
          .eq("id", 1);

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      const results =
        await Promise.all(
          links.map((link) =>
            supabase
              .from(
                "public_footer_links"
              )
              .update({
                group_key:
                  link.group_key,
                group_title:
                  link.group_title.trim(),
                label:
                  link.label.trim(),
                path:
                  normalizePath(
                    link.path
                  ),
                group_sort_order:
                  link.group_sort_order,
                link_sort_order:
                  link.link_sort_order,
                is_visible:
                  link.is_visible,
                updated_at:
                  updatedAt,
                updated_by:
                  user?.id ?? null,
              })
              .eq("id", link.id)
          )
        );

      const firstError =
        results.find(
          (result) =>
            result.error
        )?.error;

      if (firstError) {
        throw firstError;
      }

      await loadFooter();

      setSuccess(
        "Le Footer public a été enregistré avec succès."
      );

      await onChanged?.();
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer le Footer public."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function createFooterLink() {
    setError(null);
    setSuccess(null);

    const label =
      newLink.label.trim();

    const path =
      normalizePath(
        newLink.path
      );

    if (!label) {
      setError(
        "Le libellé du nouveau lien est obligatoire."
      );
      return;
    }

    if (!path) {
      setError(
        "Le chemin du nouveau lien est obligatoire."
      );
      return;
    }

    setCreating(true);

    try {
      const {
        data: { user },
      } =
        await supabase.auth.getUser();

      const groupMeta =
        GROUP_META[
          newLink.groupKey
        ];

      const currentGroupLinks =
        links.filter(
          (link) =>
            link.group_key ===
            newLink.groupKey
        );

      const nextOrder =
        currentGroupLinks.length >
        0
          ? Math.max(
              ...currentGroupLinks.map(
                (link) =>
                  link.link_sort_order
              )
            ) + 10
          : 10;

      const groupTitle =
        currentGroupLinks[0]
          ?.group_title ??
        groupMeta.title;

      const {
        error: createError,
      } = await supabase
        .from(
          "public_footer_links"
        )
        .insert({
          group_key:
            newLink.groupKey,
          group_title:
            groupTitle,
          label,
          path,
          group_sort_order:
            groupMeta.order,
          link_sort_order:
            nextOrder,
          is_visible:
            newLink.isVisible,
          updated_by:
            user?.id ?? null,
        });

      if (createError) {
        throw createError;
      }

      setShowCreateModal(
        false
      );

      setNewLink(
        EMPTY_NEW_LINK
      );

      await loadFooter();

      setSuccess(
        `Le lien « ${label} » a été ajouté avec succès.`
      );

      await onChanged?.();
    } catch (createError) {
      setError(
        getErrorMessage(
          createError,
          "Impossible d’ajouter le lien au Footer."
        )
      );
    } finally {
      setCreating(false);
    }
  }

  function askDelete(
    link: PublicFooterLink
  ) {
    if (dirty) {
      setError(
        "Enregistrez ou annulez les modifications en attente avant de supprimer un lien."
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setPendingDelete(link);
  }

  async function deleteFooterLink() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    const deletedLabel =
      pendingDelete.label;

    try {
      const { error: deleteError } =
        await supabase
          .from(
            "public_footer_links"
          )
          .delete()
          .eq(
            "id",
            pendingDelete.id
          );

      if (deleteError) {
        throw deleteError;
      }

      setPendingDelete(null);

      await loadFooter();

      setSuccess(
        `Le lien « ${deletedLabel} » a été supprimé avec succès.`
      );

      await onChanged?.();
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer le lien du Footer."
        )
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <section className="sn-card p-6">
        <div className="text-sm text-gray-500">
          Chargement du Footer public…
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="sn-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              🧩 Éditeur du Footer
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Modifiez les textes,
              groupes et liens affichés
              au bas du site public.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              {visibleCount} visible(s)
            </span>

            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
              {hiddenCount} masqué(s)
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <strong>
                Erreur :
              </strong>{" "}
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              ✅ {success}
            </div>
          )}

          {dirty && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Des modifications sont
              en attente. Enregistrez-les
              ou annulez-les avant
              d’ajouter ou supprimer un
              lien.
            </div>
          )}

          {settings && (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-base font-semibold text-gray-900">
                  📝 Textes généraux
                </div>

                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Ces contenus apparaissent
                  dans les différentes zones
                  du Footer public.
                </p>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-xs font-semibold text-gray-600">
                      Description SchoolNet
                    </label>

                    <textarea
                      rows={3}
                      value={
                        settings.footer_description
                      }
                      onChange={(
                        event
                      ) =>
                        updateSettings(
                          {
                            footer_description:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-gray-600">
                      Titre de l’ambition
                    </label>

                    <input
                      type="text"
                      value={
                        settings.footer_ambition_title
                      }
                      onChange={(
                        event
                      ) =>
                        updateSettings(
                          {
                            footer_ambition_title:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-gray-600">
                      Texte inférieur
                    </label>

                    <input
                      type="text"
                      value={
                        settings.footer_bottom_text
                      }
                      onChange={(
                        event
                      ) =>
                        updateSettings(
                          {
                            footer_bottom_text:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-xs font-semibold text-gray-600">
                      Texte de l’ambition
                    </label>

                    <textarea
                      rows={3}
                      value={
                        settings.footer_ambition_text
                      }
                      onChange={(
                        event
                      ) =>
                        updateSettings(
                          {
                            footer_ambition_text:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="mb-2 block text-xs font-semibold text-gray-600">
                      Copyright
                    </label>

                    <input
                      type="text"
                      value={
                        settings.copyright_text
                      }
                      onChange={(
                        event
                      ) =>
                        updateSettings(
                          {
                            copyright_text:
                              event
                                .target
                                .value,
                          }
                        )
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-base font-semibold text-gray-900">
                  🗂 Titres des groupes
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {(
                    [
                      "discover",
                      "schoolnet",
                    ] as FooterGroupKey[]
                  ).map(
                    (groupKey) => {
                      const hasLinks =
                        links.some(
                          (link) =>
                            link.group_key ===
                            groupKey
                        );

                      return (
                        <div
                          key={
                            groupKey
                          }
                        >
                          <label className="mb-2 block text-xs font-semibold text-gray-600">
                            {
                              GROUP_META[
                                groupKey
                              ].title
                            }
                          </label>

                          <input
                            type="text"
                            value={getGroupTitle(
                              groupKey
                            )}
                            disabled={
                              !hasLinks
                            }
                            onChange={(
                              event
                            ) =>
                              updateGroupTitle(
                                groupKey,
                                event
                                  .target
                                  .value
                              )
                            }
                            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
                          />

                          {!hasLinks && (
                            <p className="mt-1 text-[11px] text-gray-400">
                              Ajoutez au
                              moins un lien
                              dans ce groupe
                              pour l’activer.
                            </p>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="sn-card mt-6 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              🔗 Liens du Footer
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Gérez les liens visibles dans
              les groupes Découvrir et
              SchoolNet.
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            disabled={
              saving ||
              creating ||
              deleting
            }
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Ajouter un lien
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
          {orderedLinks.map(
            (link) => {
              const groupLinks =
                orderedLinks.filter(
                  (item) =>
                    item.group_key ===
                    link.group_key
                );

              const indexInGroup =
                groupLinks.findIndex(
                  (item) =>
                    item.id ===
                    link.id
                );

              return (
                <article
                  key={link.id}
                  className={[
                    "rounded-2xl border p-5 transition",
                    link.is_visible
                      ? "border-gray-200 bg-white shadow-sm"
                      : "border-gray-200 bg-gray-50",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                        {link.group_title}
                      </div>

                      <div className="mt-1 font-semibold text-gray-900">
                        {link.label ||
                          "Sans titre"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateLink(
                          link.id,
                          {
                            is_visible:
                              !link.is_visible,
                          }
                        )
                      }
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                        link.is_visible
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-gray-200 text-gray-600 hover:bg-gray-300",
                      ].join(" ")}
                    >
                      {link.is_visible
                        ? "● Visible"
                        : "● Masqué"}
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-gray-600">
                        Libellé
                      </label>

                      <input
                        type="text"
                        value={
                          link.label
                        }
                        onChange={(
                          event
                        ) =>
                          updateLink(
                            link.id,
                            {
                              label:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-gray-600">
                        Chemin
                      </label>

                      <input
                        type="text"
                        value={
                          link.path
                        }
                        onChange={(
                          event
                        ) =>
                          updateLink(
                            link.id,
                            {
                              path:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 font-mono text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="w-28">
                      <label className="mb-2 block text-xs font-semibold text-gray-600">
                        Ordre
                      </label>

                      <input
                        type="number"
                        min="0"
                        value={
                          link.link_sort_order
                        }
                        onChange={(
                          event
                        ) =>
                          updateLink(
                            link.id,
                            {
                              link_sort_order:
                                Number(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          indexInGroup ===
                          0
                        }
                        onClick={() =>
                          moveLink(
                            link.id,
                            -1
                          )
                        }
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↑ Monter
                      </button>

                      <button
                        type="button"
                        disabled={
                          indexInGroup ===
                          groupLinks.length -
                            1
                        }
                        onClick={() =>
                          moveLink(
                            link.id,
                            1
                          )
                        }
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↓ Descendre
                      </button>

                      <a
                        href={normalizePath(
                          link.path
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                      >
                        Tester ↗
                      </a>

                      <button
                        type="button"
                        disabled={
                          dirty ||
                          deleting
                        }
                        onClick={() =>
                          askDelete(
                            link
                          )
                        }
                        title={
                          dirty
                            ? "Enregistrez ou annulez les modifications avant la suppression."
                            : "Supprimer ce lien"
                        }
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        🗑 Supprimer
                      </button>
                    </div>
                  </div>
                </article>
              );
            }
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-xs text-gray-500">
            {dirty
              ? "Des modifications ne sont pas encore enregistrées."
              : "Les données affichées sont enregistrées."}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                void loadFooter()
              }
              disabled={
                !dirty || saving
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
                !dirty || saving
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

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <div className="text-lg font-semibold text-gray-900">
                  Ajouter un lien au Footer
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  Sélectionnez son groupe
                  puis renseignez le libellé
                  et le chemin.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(
                    false
                  )
                }
                disabled={creating}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Groupe
                </label>

                <select
                  value={
                    newLink.groupKey
                  }
                  onChange={(
                    event
                  ) =>
                    setNewLink(
                      (current) => ({
                        ...current,
                        groupKey:
                          event
                            .target
                            .value as FooterGroupKey,
                      })
                    )
                  }
                  disabled={creating}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="discover">
                    Découvrir
                  </option>

                  <option value="schoolnet">
                    SchoolNet
                  </option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Libellé
                </label>

                <input
                  type="text"
                  value={
                    newLink.label
                  }
                  onChange={(
                    event
                  ) =>
                    setNewLink(
                      (current) => ({
                        ...current,
                        label:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                  placeholder="Ex. Actualités"
                  disabled={creating}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Chemin
                </label>

                <input
                  type="text"
                  value={
                    newLink.path
                  }
                  onChange={(
                    event
                  ) =>
                    setNewLink(
                      (current) => ({
                        ...current,
                        path:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                  placeholder="/actualites"
                  disabled={creating}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-1 text-xs text-gray-400">
                  Les liens internes peuvent
                  être saisis avec ou sans /
                  initial.
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Afficher immédiatement
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Le lien sera visible
                    dans le Footer dès sa
                    création.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    newLink.isVisible
                  }
                  onChange={(
                    event
                  ) =>
                    setNewLink(
                      (current) => ({
                        ...current,
                        isVisible:
                          event
                            .target
                            .checked,
                      })
                    )
                  }
                  disabled={creating}
                  className="h-5 w-5 accent-blue-600"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(
                    false
                  )
                }
                disabled={creating}
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void createFooterLink()
                }
                disabled={creating}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {creating
                  ? "Ajout en cours…"
                  : "Ajouter le lien"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="px-6 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl">
                🗑
              </div>

              <h2 className="mt-5 text-xl font-semibold text-gray-900">
                Supprimer ce lien ?
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Le lien{" "}
                <strong className="text-gray-800">
                  {pendingDelete.label}
                </strong>{" "}
                sera supprimé
                définitivement du Footer.
              </p>

              <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 font-mono text-sm text-gray-600">
                {pendingDelete.path}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setPendingDelete(
                    null
                  )
                }
                disabled={deleting}
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void deleteFooterLink()
                }
                disabled={deleting}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleting
                  ? "Suppression…"
                  : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
