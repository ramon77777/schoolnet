import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

import type {
  PublicLevel,
  PublicSubject,
} from "@/features/public/lib/publicCms";

type Props = {
  onChanged?: () => void | Promise<void>;
};

type Mode = "levels" | "subjects";

type LibraryReference = {
  id: string;
  level_id: string | null;
  subject_id: string | null;
};

type EditorForm = {
  name: string;
  slug: string;
  shortLabel: string;
  description: string;
  audience: string;
  sortOrder: number;
  isVisible: boolean;
};

type EditableRow =
  | {
      kind: "level";
      data: PublicLevel;
    }
  | {
      kind: "subject";
      data: PublicSubject;
    };

const EMPTY_FORM: EditorForm = {
  name: "",
  slug: "",
  shortLabel: "",
  description: "",
  audience: "",
  sortOrder: 10,
  isVisible: true,
};

function makeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nullableText(value: string) {
  const clean = value.trim();

  return clean.length > 0
    ? clean
    : null;
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown })
      .message === "string"
  ) {
    return (error as { message: string })
      .message;
  }

  return fallback;
}

function normalizeSearchText(
  value?: string | null,
) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sortLevels(
  rows: PublicLevel[],
) {
  return [...rows].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.name.localeCompare(
        b.name,
        "fr",
      ),
  );
}

function sortSubjects(
  rows: PublicSubject[],
) {
  return [...rows].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.name.localeCompare(
        b.name,
        "fr",
      ),
  );
}

export default function AdminPublicTaxonomiesEditor({
  onChanged,
}: Props) {
  const [mode, setMode] =
    useState<Mode>("levels");

  const [levels, setLevels] =
    useState<PublicLevel[]>([]);

  const [subjects, setSubjects] =
    useState<PublicSubject[]>([]);

  const [references, setReferences] =
    useState<LibraryReference[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  const [deleting, setDeleting] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [showEditor, setShowEditor] =
    useState(false);

  const [editingRow, setEditingRow] =
    useState<EditableRow | null>(null);

  const [pendingDelete, setPendingDelete] =
    useState<EditableRow | null>(null);

  const [form, setForm] =
    useState<EditorForm>(EMPTY_FORM);

  const [searchTerm, setSearchTerm] =
    useState("");

  const loadData =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          levelsResult,
          subjectsResult,
          referencesResult,
        ] = await Promise.all([
          supabase
            .from("public_levels")
            .select("*")
            .order("sort_order", {
              ascending: true,
            }),

          supabase
            .from("public_subjects")
            .select("*")
            .order("sort_order", {
              ascending: true,
            }),

          supabase
            .from(
              "public_library_items",
            )
            .select(
              "id, level_id, subject_id",
            ),
        ]);

        const firstError =
          levelsResult.error ??
          subjectsResult.error ??
          referencesResult.error;

        if (firstError) {
          throw firstError;
        }

        setLevels(
          sortLevels(
            (levelsResult.data as
              | PublicLevel[]
              | null) ?? [],
          ),
        );

        setSubjects(
          sortSubjects(
            (subjectsResult.data as
              | PublicSubject[]
              | null) ?? [],
          ),
        );

        setReferences(
          (referencesResult.data as
            | LibraryReference[]
            | null) ?? [],
        );
      } catch (loadError) {
        setError(
          getErrorMessage(
            loadError,
            "Impossible de charger les niveaux et matières.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleLevels = useMemo(
    () =>
      levels.filter(
        (row) => row.is_visible,
      ).length,
    [levels],
  );

  const visibleSubjects = useMemo(
    () =>
      subjects.filter(
        (row) => row.is_visible,
      ).length,
    [subjects],
  );

  function levelUsage(id: string) {
    return references.filter(
      (row) => row.level_id === id,
    ).length;
  }

  function subjectUsage(id: string) {
    return references.filter(
      (row) => row.subject_id === id,
    ).length;
  }

  function updateForm(
    patch: Partial<EditorForm>,
  ) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));

    setError(null);
    setSuccess(null);
  }

  function openCreate() {
    const rows =
      mode === "levels"
        ? levels
        : subjects;

    const maxOrder =
      rows.reduce(
        (max, row) =>
          Math.max(
            max,
            row.sort_order,
          ),
        0,
      );

    setEditingRow(null);

    setForm({
      ...EMPTY_FORM,
      sortOrder:
        maxOrder > 0
          ? maxOrder + 10
          : 10,
    });

    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function openEdit(
    row: EditableRow,
  ) {
    setEditingRow(row);

    if (row.kind === "level") {
      setForm({
        name: row.data.name,
        slug: row.data.slug,
        shortLabel:
          row.data.short_label ?? "",
        description:
          row.data.description ?? "",
        audience:
          row.data.audience ?? "",
        sortOrder:
          row.data.sort_order,
        isVisible:
          row.data.is_visible,
      });
    } else {
      setForm({
        name: row.data.name,
        slug: row.data.slug,
        shortLabel:
          row.data.short_label ?? "",
        description:
          row.data.description ?? "",
        audience: "",
        sortOrder:
          row.data.sort_order,
        isVisible:
          row.data.is_visible,
      });
    }

    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setShowEditor(false);
    setEditingRow(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function saveRow() {
    const name =
      form.name.trim();

    const slug =
      form.slug.trim() ||
      makeSlug(name);

    if (!name) {
      setError(
        "Le nom est obligatoire.",
      );
      return;
    }

    if (!slug) {
      setError(
        "Le slug est obligatoire.",
      );
      return;
    }

    if (
      !Number.isFinite(
        form.sortOrder,
      ) ||
      form.sortOrder < 0
    ) {
      setError(
        "L’ordre est invalide.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "levels") {
        const payload = {
          name,
          slug,

          short_label:
            nullableText(
              form.shortLabel,
            ),

          description:
            nullableText(
              form.description,
            ),

          audience:
            nullableText(
              form.audience,
            ),

          sort_order:
            form.sortOrder,

          is_visible:
            form.isVisible,
        };

        if (
          editingRow?.kind ===
          "level"
        ) {
          const {
            error: updateError,
          } = await supabase
            .from("public_levels")
            .update(payload)
            .eq(
              "id",
              editingRow.data.id,
            );

          if (updateError) {
            throw updateError;
          }
        } else {
          const {
            error: insertError,
          } = await supabase
            .from("public_levels")
            .insert(payload);

          if (insertError) {
            throw insertError;
          }
        }
      } else {
        const payload = {
          name,
          slug,

          short_label:
            nullableText(
              form.shortLabel,
            ),

          description:
            nullableText(
              form.description,
            ),

          sort_order:
            form.sortOrder,

          is_visible:
            form.isVisible,
        };

        if (
          editingRow?.kind ===
          "subject"
        ) {
          const {
            error: updateError,
          } = await supabase
            .from(
              "public_subjects",
            )
            .update(payload)
            .eq(
              "id",
              editingRow.data.id,
            );

          if (updateError) {
            throw updateError;
          }
        } else {
          const {
            error: insertError,
          } = await supabase
            .from(
              "public_subjects",
            )
            .insert(payload);

          if (insertError) {
            throw insertError;
          }
        }
      }

      const action =
        editingRow
          ? "modifié"
          : "ajouté";

      const label =
        mode === "levels"
          ? "Le niveau"
          : "La matière";

      setShowEditor(false);
      setEditingRow(null);
      setForm(EMPTY_FORM);

      await loadData();
      await onChanged?.();

      setSuccess(
        `${label} « ${name} » a été ${action} avec succès.`,
      );
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer cet élément.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(
    row: EditableRow,
  ) {
    setWorkingId(row.data.id);
    setError(null);
    setSuccess(null);

    try {
      const table =
        row.kind === "level"
          ? "public_levels"
          : "public_subjects";

      const {
        error: updateError,
      } = await supabase
        .from(table)
        .update({
          is_visible:
            !row.data.is_visible,
        })
        .eq(
          "id",
          row.data.id,
        );

      if (updateError) {
        throw updateError;
      }

      await loadData();
      await onChanged?.();
    } catch (updateError) {
      setError(
        getErrorMessage(
          updateError,
          "Impossible de modifier la visibilité.",
        ),
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function moveRow(
    row: EditableRow,
    direction: -1 | 1,
  ) {
    const sourceRows =
      row.kind === "level"
        ? sortLevels(levels)
        : sortSubjects(subjects);

    const index =
      sourceRows.findIndex(
        (current) =>
          current.id === row.data.id,
      );

    const targetIndex =
      index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >=
        sourceRows.length
    ) {
      return;
    }

    const target =
      sourceRows[targetIndex];

    const table =
      row.kind === "level"
        ? "public_levels"
        : "public_subjects";

    setWorkingId(row.data.id);
    setError(null);

    try {
      const [
        firstResult,
        secondResult,
      ] = await Promise.all([
        supabase
          .from(table)
          .update({
            sort_order:
              target.sort_order,
          })
          .eq(
            "id",
            row.data.id,
          ),

        supabase
          .from(table)
          .update({
            sort_order:
              row.data.sort_order,
          })
          .eq(
            "id",
            target.id,
          ),
      ]);

      const firstError =
        firstResult.error ??
        secondResult.error;

      if (firstError) {
        throw firstError;
      }

      await loadData();
      await onChanged?.();
    } catch (moveError) {
      setError(
        getErrorMessage(
          moveError,
          "Impossible de déplacer cet élément.",
        ),
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteRow() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const table =
        pendingDelete.kind ===
        "level"
          ? "public_levels"
          : "public_subjects";

      const {
        error: deleteError,
      } = await supabase
        .from(table)
        .delete()
        .eq(
          "id",
          pendingDelete.data.id,
        );

      if (deleteError) {
        throw deleteError;
      }

      const deletedName =
        pendingDelete.data.name;

      setPendingDelete(null);

      await loadData();
      await onChanged?.();

      setSuccess(
        `« ${deletedName} » a été supprimé définitivement.`,
      );
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer cet élément.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <section className="sn-card p-6">
        <div className="text-sm text-gray-500">
          Chargement des niveaux et matières…
        </div>
      </section>
    );
  }

  const allCurrentRows =
    mode === "levels"
        ? sortLevels(levels)
        : sortSubjects(subjects);

 const normalizedSearch =
    normalizeSearchText(searchTerm);

 const currentRows =
    normalizedSearch.length === 0
        ? allCurrentRows
        : allCurrentRows.filter(
            (item) => {
            const audience =
                mode === "levels"
                ? (
                    item as PublicLevel
                    ).audience
                : null;

            const searchable =
                normalizeSearchText(
                [
                    item.name,
                    item.slug,
                    item.short_label,
                    item.description,
                    audience,
                ].join(" "),
                );

            return searchable.includes(
                normalizedSearch,
            );
            },
        );

  return (
    <>
      <section className="sn-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              🎓 Niveaux & Matières
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Gérez les référentiels utilisés par la bibliothèque et les pages publiques SchoolNet.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              {levels.length} niveaux
            </span>

            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {subjects.length} matières
            </span>

            <button
              type="button"
              onClick={openCreate}
              className="sn-btn-primary sn-press"
            >
              + Ajouter{" "}
              {mode === "levels"
                ? "un niveau"
                : "une matière"}
            </button>
          </div>
        </div>

        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("levels");
                setSearchTerm("");
              }}
              className={[
                "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                mode === "levels"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              ].join(" ")}
            >
              🎓 Niveaux
              <span className="ml-2 opacity-75">
                {visibleLevels}/
                {levels.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("subjects");
                setSearchTerm("");
              }}
              className={[
                "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                mode === "subjects"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              ].join(" ")}
            >
              📘 Matières
              <span className="ml-2 opacity-75">
                {visibleSubjects}/
                {subjects.length}
              </span>
            </button>
          </div>
        </div>

        <div className="border-b border-gray-100 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="w-full max-w-2xl">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {mode === "levels"
                    ? "Rechercher un niveau"
                    : "Rechercher une matière"}
                </label>

                <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    🔎
                    </span>

                    <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) =>
                        setSearchTerm(
                        event.target.value,
                        )
                    }
                    placeholder={
                        mode === "levels"
                        ? "PS, CM2, Maternelle, Collège..."
                        : "Mathématiques, Sciences, Anglais..."
                    }
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                </div>
                </div>

                <div className="flex items-center gap-3">
                <div className="whitespace-nowrap text-sm text-gray-500">
                    <strong className="text-gray-900">
                    {currentRows.length}
                    </strong>{" "}
                    résultat
                    {currentRows.length > 1
                    ? "s"
                    : ""}{" "}
                    sur{" "}
                    <strong className="text-gray-900">
                    {allCurrentRows.length}
                    </strong>
                </div>

                {searchTerm.trim() && (
                    <button
                    type="button"
                    onClick={() =>
                        setSearchTerm("")
                    }
                    className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-200"
                    >
                    Réinitialiser
                    </button>
                )}
                </div>
            </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">
            <strong>Erreur :</strong>{" "}
            {error}
          </div>
        )}

        {success && (
          <div className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-6">
            ✅ {success}
          </div>
        )}

        {currentRows.length === 0 &&
            searchTerm.trim() && (
                <div className="mx-5 mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center sm:mx-6">
                <div className="text-4xl">
                    🔎
                </div>

                <div className="mt-3 font-semibold text-gray-900">
                    Aucun résultat
                </div>

                <p className="mt-1 text-sm text-gray-500">
                    Aucun{" "}
                    {mode === "levels"
                    ? "niveau"
                    : "matière"}{" "}
                    ne correspond à
                    « {searchTerm} ».
                </p>

                <button
                    type="button"
                    onClick={() =>
                    setSearchTerm("")
                    }
                    className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                    Réinitialiser la recherche
                </button>
                </div>
            )
        }

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
          {currentRows.map(
            (item) => {
                const actualIndex =
                allCurrentRows.findIndex(
                    (current) =>
                    current.id === item.id,
                );
              const row: EditableRow =
                mode === "levels"
                  ? {
                      kind: "level",
                      data:
                        item as PublicLevel,
                    }
                  : {
                      kind: "subject",
                      data:
                        item as PublicSubject,
                    };

              const usage =
                row.kind === "level"
                  ? levelUsage(
                      row.data.id,
                    )
                  : subjectUsage(
                      row.data.id,
                    );

              const busy =
                workingId ===
                row.data.id;

              return (
                <article
                  key={row.data.id}
                  className={[
                    "rounded-2xl border p-5 shadow-sm transition",
                    row.data.is_visible
                      ? "border-gray-200 bg-white"
                      : "border-gray-200 bg-gray-50 opacity-70",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {mode === "levels"
                          ? `Niveau ${
                              actualIndex + 1
                            }`
                          : `Matière ${
                              actualIndex + 1
                            }`}
                      </div>

                      <h3 className="mt-1 text-lg font-semibold text-gray-900">
                        {row.data.name}
                      </h3>

                      <div className="mt-1 font-mono text-[11px] text-gray-400">
                        {row.data.slug}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void toggleVisibility(
                          row,
                        )
                      }
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-semibold",
                        row.data.is_visible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-200 text-gray-600",
                      ].join(" ")}
                    >
                      {row.data.is_visible
                        ? "● Visible"
                        : "● Masqué"}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.data.short_label && (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        {
                          row.data
                            .short_label
                        }
                      </span>
                    )}

                    {row.kind ===
                      "level" &&
                      row.data.audience && (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                          {
                            row.data
                              .audience
                          }
                        </span>
                      )}

                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                      Ordre{" "}
                      {
                        row.data
                          .sort_order
                      }
                    </span>

                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        usage > 0
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {usage} ressource
                      {usage > 1
                        ? "s"
                        : ""}
                    </span>
                  </div>

                  {row.data.description && (
                    <p className="mt-4 text-sm leading-6 text-gray-500">
                      {
                        row.data
                          .description
                      }
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        openEdit(row)
                      }
                      className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      ✏️ Modifier
                    </button>

                    <button
                      type="button"
                      disabled={
                        actualIndex === 0 ||
                        busy
                      }
                      onClick={() =>
                        void moveRow(
                          row,
                          -1,
                        )
                      }
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-30"
                    >
                      ↑ Monter
                    </button>

                    <button
                      type="button"
                      disabled={
                        actualIndex === allCurrentRows.length - 1 ||
                        busy
                      }
                      onClick={() =>
                        void moveRow(
                          row,
                          1,
                        )
                      }
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-30"
                    >
                      ↓ Descendre
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPendingDelete(
                          row,
                        )
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      🗑 Supprimer
                    </button>
                  </div>
                </article>
              );
            },
          )}
        </div>
      </section>

      {showEditor && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="mx-auto my-8 w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingRow
                    ? "Modifier"
                    : "Ajouter"}{" "}
                  {mode === "levels"
                    ? "un niveau"
                    : "une matière"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Ces données seront utilisées dans la bibliothèque et les pages publiques.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Nom *
                </label>

                <input
                  value={form.name}
                  disabled={saving}
                  onChange={(event) => {
                    const name =
                      event.target.value;

                    updateForm({
                      name,

                      ...(!editingRow &&
                      (!form.slug ||
                        form.slug ===
                          makeSlug(
                            form.name,
                          ))
                        ? {
                            slug:
                              makeSlug(
                                name,
                              ),
                          }
                        : {}),
                    });
                  }}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Slug *
                  </label>

                  <input
                    value={form.slug}
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        slug:
                          makeSlug(
                            event.target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Libellé court
                  </label>

                  <input
                    value={
                      form.shortLabel
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        shortLabel:
                          event.target
                            .value,
                      })
                    }
                    placeholder={
                      mode === "levels"
                        ? "Ex. CM2"
                        : "Ex. Maths"
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {mode === "levels" && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Cycle / public
                  </label>

                  <input
                    value={
                      form.audience
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        audience:
                          event.target
                            .value,
                      })
                    }
                    placeholder="Primaire, Collège, Lycée..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Description
                </label>

                <textarea
                  rows={4}
                  value={
                    form.description
                  }
                  disabled={saving}
                  onChange={(event) =>
                    updateForm({
                      description:
                        event.target
                          .value,
                    })
                  }
                  className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Ordre
                </label>

                <input
                  type="number"
                  min="0"
                  value={
                    form.sortOrder
                  }
                  disabled={saving}
                  onChange={(event) =>
                    updateForm({
                      sortOrder:
                        Number(
                          event.target
                            .value,
                        ),
                    })
                  }
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <div>
                  <div className="font-semibold text-gray-900">
                    Visible
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Disponible dans les filtres et pages publiques.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={
                    form.isVisible
                  }
                  disabled={saving}
                  onChange={(event) =>
                    updateForm({
                      isVisible:
                        event.target
                          .checked,
                    })
                  }
                  className="h-5 w-5 accent-blue-600"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-5">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="sn-btn-ghost sn-press"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveRow()
                }
                disabled={saving}
                className="sn-btn-primary sn-press"
              >
                {saving
                  ? "Enregistrement…"
                  : editingRow
                    ? "Enregistrer les modifications"
                    : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="px-6 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl">
                🗑
              </div>

              <h2 className="mt-5 text-xl font-semibold text-gray-900">
                Supprimer{" "}
                {pendingDelete.kind ===
                "level"
                  ? "ce niveau"
                  : "cette matière"}
                ?
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-500">
                <strong className="text-gray-900">
                  {
                    pendingDelete.data
                      .name
                  }
                </strong>{" "}
                sera supprimé définitivement.
              </p>

              {(
                pendingDelete.kind ===
                "level"
                  ? levelUsage(
                      pendingDelete.data
                        .id,
                    )
                  : subjectUsage(
                      pendingDelete.data
                        .id,
                    )
              ) > 0 && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  ⚠️ Cet élément est actuellement utilisé par{" "}
                  <strong>
                    {pendingDelete.kind ===
                    "level"
                      ? levelUsage(
                          pendingDelete.data
                            .id,
                        )
                      : subjectUsage(
                          pendingDelete.data
                            .id,
                        )}
                  </strong>{" "}
                  ressource(s). La suppression ne supprimera pas les ressources, mais leur association sera retirée automatiquement.
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">
                Cette action est définitive. Vous pouvez simplement masquer l’élément si vous souhaitez conserver son historique.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setPendingDelete(
                    null,
                  )
                }
                disabled={deleting}
                className="sn-btn-ghost sn-press"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void deleteRow()
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