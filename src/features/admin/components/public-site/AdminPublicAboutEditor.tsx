import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

type AboutSection = {
  id: string;
  section_key: string;
  eyebrow: string | null;
  title: string;
  content: string | null;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

type AboutForm = {
  eyebrow: string;
  title: string;
  content: string;
  icon: string;
  sort_order: string;
  is_visible: boolean;
};

type Props = {
  onChanged?: () => void | Promise<void>;
};

const EMPTY_FORM: AboutForm = {
  eyebrow: "",
  title: "",
  content: "",
  icon: "",
  sort_order: "10",
  is_visible: true,
};

const ABOUT_ICONS = [
  "🎯",
  "🌍",
  "🤝",
  "💡",
  "🚀",
  "📚",
  "🎓",
  "🧪",
  "🏫",
  "🧠",
  "📈",
  "🏆",
  "⭐",
  "🌱",
  "💬",
  "🛡️",
  "❤️",
  "✨",
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

function createSectionKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function AdminPublicAboutEditor({
  onChanged,
}: Props) {
  const [sections, setSections] = useState<
    AboutSection[]
  >([]);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<
    string | null
  >(null);

  const [success, setSuccess] = useState<
    string | null
  >(null);

  const [formOpen, setFormOpen] =
    useState(false);

  const [editingSection, setEditingSection] =
    useState<AboutSection | null>(null);

  const [form, setForm] =
    useState<AboutForm>(EMPTY_FORM);

  const loadSections = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } =
        await supabase
          .from("public_about_sections")
          .select(
            `
              id,
              section_key,
              eyebrow,
              title,
              content,
              icon,
              sort_order,
              is_visible,
              created_at,
              updated_at,
              created_by,
              updated_by
            `
          )
          .order("sort_order", {
            ascending: true,
          })
          .order("created_at", {
            ascending: true,
          });

      if (loadError) {
        throw loadError;
      }

      setSections(
        (data ?? []) as AboutSection[]
      );
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          "Impossible de charger les sections À propos."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  const filteredSections = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase();

    if (!term) {
      return sections;
    }

    return sections.filter((section) => {
      const values = [
        section.section_key,
        section.eyebrow,
        section.title,
        section.content,
      ];

      return values.some((value) =>
        value
          ?.toLowerCase()
          .includes(term)
      );
    });
  }, [search, sections]);

  const openCreateForm = () => {
    const nextOrder =
      sections.length > 0
        ? Math.max(
            ...sections.map(
              (section) =>
                section.sort_order
            )
          ) + 10
        : 10;

    setEditingSection(null);

    setForm({
      ...EMPTY_FORM,
      sort_order: String(nextOrder),
    });

    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const openEditForm = (
    section: AboutSection
  ) => {
    setEditingSection(section);

    setForm({
      eyebrow: section.eyebrow ?? "",
      title: section.title,
      content: section.content ?? "",
      icon: section.icon ?? "",
      sort_order: String(
        section.sort_order
      ),
      is_visible: section.is_visible,
    });

    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingSection(null);
    setForm(EMPTY_FORM);
  };

  const createUniqueSectionKey = (
    title: string
  ) => {
    const baseKey =
      createSectionKey(title) || "section";

    const existingKeys = new Set(
      sections.map(
        (section) =>
          section.section_key
      )
    );

    if (!existingKeys.has(baseKey)) {
      return baseKey;
    }

    let index = 2;

    while (
      existingKeys.has(
        `${baseKey}_${index}`
      )
    ) {
      index += 1;
    }

    return `${baseKey}_${index}`;
  };

  const handleSave = async () => {
    const title = form.title.trim();

    if (!title) {
      setError(
        "Le titre de la section est obligatoire."
      );
      return;
    }

    const sortOrder = Number.parseInt(
      form.sort_order,
      10
    );

    if (!Number.isFinite(sortOrder)) {
      setError(
        "L’ordre d’affichage doit être un nombre valide."
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const commonPayload = {
        eyebrow:
          form.eyebrow.trim() || null,

        title,

        content:
          form.content.trim() || null,

        icon:
          form.icon.trim() || null,

        sort_order: sortOrder,

        is_visible: form.is_visible,

        updated_at:
          new Date().toISOString(),

        updated_by: user?.id ?? null,
      };

      if (editingSection) {
        const { error: updateError } =
          await supabase
            .from(
              "public_about_sections"
            )
            .update(commonPayload)
            .eq(
              "id",
              editingSection.id
            );

        if (updateError) {
          throw updateError;
        }

        setSuccess(
          "La section a été modifiée avec succès."
        );
      } else {
        const sectionKey =
          createUniqueSectionKey(title);

        const { error: insertError } =
          await supabase
            .from(
              "public_about_sections"
            )
            .insert({
              section_key: sectionKey,
              ...commonPayload,
              created_by:
                user?.id ?? null,
            });

        if (insertError) {
          throw insertError;
        }

        setSuccess(
          "La section a été ajoutée avec succès."
        );
      }

      closeForm();

      await loadSections();

      if (onChanged) {
        await onChanged();
      }
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer la section."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (
    section: AboutSection
  ) => {
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error: updateError } =
        await supabase
          .from(
            "public_about_sections"
          )
          .update({
            is_visible:
              !section.is_visible,

            updated_at:
              new Date().toISOString(),

            updated_by:
              user?.id ?? null,
          })
          .eq("id", section.id);

      if (updateError) {
        throw updateError;
      }

      setSuccess(
        section.is_visible
          ? "La section a été masquée du site public."
          : "La section est maintenant visible sur le site public."
      );

      await loadSections();

      if (onChanged) {
        await onChanged();
      }
    } catch (toggleError) {
      setError(
        getErrorMessage(
          toggleError,
          "Impossible de modifier la visibilité."
        )
      );
    }
  };

  const handleDelete = async (
    section: AboutSection
  ) => {
    const confirmed = window.confirm(
      `Supprimer définitivement la section « ${section.title} » ?`
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const { error: deleteError } =
        await supabase
          .from(
            "public_about_sections"
          )
          .delete()
          .eq("id", section.id);

      if (deleteError) {
        throw deleteError;
      }

      if (
        editingSection?.id === section.id
      ) {
        closeForm();
      }

      setSuccess(
        "La section a été supprimée avec succès."
      );

      await loadSections();

      if (onChanged) {
        await onChanged();
      }
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer la section."
        )
      );
    }
  };

  return (
    <section className="sn-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            Sections À propos
          </div>

          <p className="mt-1 text-sm leading-6 text-gray-500">
            Gérez la mission, la vision, les
            engagements et les autres contenus
            affichés sur la page À propos.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="sn-btn-primary sn-press"
        >
          + Ajouter une section
        </button>
      </div>

      <div className="mt-5">
        <label
          htmlFor="about-search"
          className="sr-only"
        >
          Rechercher une section
        </label>

        <input
          id="about-search"
          type="search"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Rechercher par titre, rubrique, contenu…"
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
        />
      </div>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {formOpen && (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/40 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-semibold text-gray-900">
                {editingSection
                  ? "Modifier la section"
                  : "Nouvelle section"}
              </div>

              {editingSection && (
                <div className="mt-1 text-xs text-gray-500">
                  Identifiant technique :{" "}
                  <span className="font-mono">
                    {
                      editingSection.section_key
                    }
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={closeForm}
              className="sn-btn-ghost sn-press"
            >
              Annuler
            </button>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-gray-700">
                Rubrique / accroche
              </label>

              <input
                type="text"
                value={form.eyebrow}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    eyebrow:
                      event.target.value,
                  }))
                }
                placeholder="Ex. Notre mission"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
                <label className="text-sm font-semibold text-gray-700">
                    Icône
                </label>

                <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
                    {ABOUT_ICONS.map((icon) => {
                        const selected =
                        form.icon === icon;

                        return (
                        <button
                            key={icon}
                            type="button"
                            title={`Utiliser ${icon}`}
                            aria-label={`Utiliser l’icône ${icon}`}
                            onClick={() =>
                            setForm((current) => ({
                                ...current,
                                icon,
                            }))
                            }
                            className={[
                            "flex h-11 w-full items-center justify-center rounded-xl border text-xl transition",
                            selected
                                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                                : "border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50",
                            ].join(" ")}
                        >
                            {icon}
                        </button>
                        );
                    })}
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                        {form.icon || "✦"}
                    </div>

                    <div className="min-w-0 flex-1">
                        <input
                        type="text"
                        value={form.icon}
                        onChange={(event) =>
                            setForm((current) => ({
                            ...current,
                            icon:
                                event.target.value,
                            }))
                        }
                        placeholder="Ou coller un autre emoji…"
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                        />
                    </div>

                    {form.icon && (
                        <button
                        type="button"
                        onClick={() =>
                            setForm((current) => ({
                            ...current,
                            icon: "",
                            }))
                        }
                        className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
                        >
                        Retirer
                        </button>
                    )}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-gray-400">
                    Sélectionnez une icône proposée ou
                    saisissez un emoji personnalisé.
                    </p>
                </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">
                Titre *
              </label>

              <input
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title:
                      event.target.value,
                  }))
                }
                placeholder="Titre de la section"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">
                Contenu
              </label>

              <textarea
                value={form.content}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    content:
                      event.target.value,
                  }))
                }
                rows={5}
                placeholder="Texte affiché sur la page À propos…"
                className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Ordre d’affichage
              </label>

              <input
                type="number"
                value={form.sort_order}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sort_order:
                      event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    Visible sur le site
                  </div>

                  <div className="mt-0.5 text-xs text-gray-400">
                    Les sections masquées restent
                    disponibles dans l’administration.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={form.is_visible}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_visible:
                        event.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-gray-300 text-blue-600"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() =>
                void handleSave()
              }
              disabled={saving}
              className="sn-btn-primary sn-press"
            >
              {saving
                ? "Enregistrement…"
                : editingSection
                  ? "Enregistrer les modifications"
                  : "Ajouter la section"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
            Chargement des sections…
          </div>
        ) : filteredSections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center">
            <div className="font-semibold text-gray-700">
              Aucune section trouvée
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Modifie ta recherche ou ajoute une
              nouvelle section.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredSections.map(
              (section) => (
                <article
                  key={section.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                        {section.icon || "✦"}
                      </div>

                      <div className="min-w-0">
                        {section.eyebrow && (
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                            {
                              section.eyebrow
                            }
                          </div>
                        )}

                        <div className="mt-1 font-semibold text-gray-900">
                          {section.title}
                        </div>
                      </div>
                    </div>

                    <span
                      className={[
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        section.is_visible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {section.is_visible
                        ? "Visible"
                        : "Masquée"}
                    </span>
                  </div>

                  {section.content && (
                    <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm leading-6 text-gray-600">
                      {section.content}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
                    <span className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                      Ordre :{" "}
                      {section.sort_order}
                    </span>

                    <span className="max-w-full truncate rounded-lg bg-gray-50 px-2.5 py-1 font-mono text-xs text-gray-500">
                      {section.section_key}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openEditForm(
                          section
                        )
                      }
                      className="sn-btn-ghost sn-press"
                    >
                      Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleToggleVisibility(
                          section
                        )
                      }
                      className="sn-btn-ghost sn-press"
                    >
                      {section.is_visible
                        ? "Masquer"
                        : "Afficher"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleDelete(
                          section
                        )
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}