import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";
import type { PublicNavigationItem } from "@/features/public/lib/publicCms";

type Props = {
  onChanged?: () => void | Promise<void>;
};

type NewNavigationForm = {
  label: string;
  path: string;
  isVisible: boolean;
};

const EMPTY_NEW_ITEM: NewNavigationForm = {
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
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

function normalizePath(value: string) {
  let path = value.trim();

  if (!path) {
    return "";
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  path = path.replace(/\/{2,}/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }

  return path;
}

function sortItems(items: PublicNavigationItem[]) {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }

    return a.id.localeCompare(b.id);
  });
}

function comparable(items: PublicNavigationItem[]) {
  return sortItems(items).map((item) => ({
    id: item.id,
    label: item.label,
    path: item.path,
    sort_order: item.sort_order,
    is_visible: item.is_visible,
  }));
}

export default function AdminPublicNavigationEditor({
  onChanged,
}: Props) {
  const [items, setItems] = useState<PublicNavigationItem[]>([]);
  const [initialItems, setInitialItems] =
    useState<PublicNavigationItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] =
    useState(false);

  const [newItem, setNewItem] =
    useState<NewNavigationForm>(EMPTY_NEW_ITEM);

  const [pendingDelete, setPendingDelete] =
    useState<PublicNavigationItem | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } = await supabase
        .from("public_navigation_items")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (loadError) {
        throw loadError;
      }

      const rows = sortItems(
        (data as PublicNavigationItem[] | null) ?? []
      );

      setItems(rows);
      setInitialItems(rows);
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          "Impossible de charger la navigation publique."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const dirty = useMemo(
    () =>
      JSON.stringify(comparable(items)) !==
      JSON.stringify(comparable(initialItems)),
    [items, initialItems]
  );

  const visibleCount = useMemo(
    () => items.filter((item) => item.is_visible).length,
    [items]
  );

  const hiddenCount = items.length - visibleCount;

  const updateItem = (
    id: string,
    values: Partial<
      Pick<
        PublicNavigationItem,
        "label" | "path" | "sort_order" | "is_visible"
      >
    >
  ) => {
    setSuccess(null);
    setError(null);

    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...values,
            }
          : item
      )
    );
  };

  const moveItem = (
    id: string,
    direction: -1 | 1
  ) => {
    setItems((current) => {
      const ordered = sortItems(current);
      const index = ordered.findIndex(
        (item) => item.id === id
      );

      if (index < 0) {
        return current;
      }

      const targetIndex = index + direction;

      if (
        targetIndex < 0 ||
        targetIndex >= ordered.length
      ) {
        return current;
      }

      const source = ordered[index];
      const target = ordered[targetIndex];

      ordered[index] = {
        ...source,
        sort_order: target.sort_order,
      };

      ordered[targetIndex] = {
        ...target,
        sort_order: source.sort_order,
      };

      setSuccess(null);
      setError(null);

      return sortItems(ordered);
    });
  };

  const resetChanges = () => {
    setItems(sortItems(initialItems));
    setError(null);
    setSuccess(null);
  };

  const validateItems = (
    values: PublicNavigationItem[]
  ) => {
    const normalizedPaths = new Map<string, string>();

    for (const item of values) {
      const label = item.label.trim();
      const path = normalizePath(item.path);

      if (!label) {
        return "Chaque élément doit posséder un libellé.";
      }

      if (!path) {
        return `Le lien « ${label} » doit posséder un chemin.`;
      }

      if (
        !Number.isFinite(item.sort_order) ||
        item.sort_order < 0
      ) {
        return `L'ordre de « ${label} » est invalide.`;
      }

      const pathKey = path.toLowerCase();

      if (normalizedPaths.has(pathKey)) {
        return `Le chemin « ${path} » est déjà utilisé par un autre élément.`;
      }

      normalizedPaths.set(pathKey, item.id);
    }

    const orders = values.map(
      (item) => item.sort_order
    );

    if (new Set(orders).size !== orders.length) {
      return "Deux éléments ne doivent pas avoir le même ordre.";
    }

    return null;
  };

  const save = async () => {
    const validationError = validateItems(items);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const now = new Date().toISOString();

      for (const item of items) {
        const { error: updateError } = await supabase
          .from("public_navigation_items")
          .update({
            label: item.label.trim(),
            path: normalizePath(item.path),
            sort_order: item.sort_order,
            is_visible: item.is_visible,
            updated_at: now,
            updated_by: user?.id ?? null,
          })
          .eq("id", item.id);

        if (updateError) {
          throw updateError;
        }
      }

      await loadItems();

      setSuccess(
        "La navigation publique a été enregistrée avec succès."
      );
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d'enregistrer la navigation publique."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    if (dirty) {
      setError(
        "Enregistrez ou annulez d'abord les modifications en cours avant d'ajouter un nouvel élément."
      );
      return;
    }

    setNewItem(EMPTY_NEW_ITEM);
    setError(null);
    setSuccess(null);
    setShowCreateModal(true);
  };

  const createNavigationItem = async () => {
    const label = newItem.label.trim();
    const path = normalizePath(newItem.path);

    if (!label) {
      setError(
        "Veuillez renseigner le libellé du nouvel élément."
      );
      return;
    }

    if (!path) {
      setError(
        "Veuillez renseigner le chemin du nouvel élément."
      );
      return;
    }

    const duplicate = items.some(
      (item) =>
        normalizePath(item.path).toLowerCase() ===
        path.toLowerCase()
    );

    if (duplicate) {
      setError(
        `Le chemin « ${path} » est déjà utilisé dans la navigation.`
      );
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const maxOrder = items.reduce(
        (max, item) =>
          Math.max(max, item.sort_order),
        0
      );

      const nextOrder = maxOrder + 10;

      const { error: insertError } = await supabase
        .from("public_navigation_items")
        .insert({
          label,
          path,
          sort_order: nextOrder,
          is_visible: newItem.isVisible,
          updated_by: user?.id ?? null,
        });

      if (insertError) {
        throw insertError;
      }

      setShowCreateModal(false);
      setNewItem(EMPTY_NEW_ITEM);

      await loadItems();
      await onChanged?.();

      setSuccess(
        `Le lien « ${label} » a été ajouté avec succès.`
      );
    } catch (createError) {
      setError(
        getErrorMessage(
          createError,
          "Impossible d'ajouter le nouvel élément."
        )
      );
    } finally {
      setCreating(false);
    }
  };

  const askDelete = (
    item: PublicNavigationItem
  ) => {
    if (dirty) {
      setError(
        "Enregistrez ou annulez d'abord les modifications en cours avant de supprimer un élément."
      );
      return;
    }

    if (normalizePath(item.path) === "/") {
      setError(
        "Le lien Accueil est protégé et ne peut pas être supprimé."
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setPendingDelete(item);
  };

  const deleteNavigationItem = async () => {
    if (!pendingDelete) {
      return;
    }

    if (
      normalizePath(pendingDelete.path) === "/"
    ) {
      setPendingDelete(null);
      setError(
        "Le lien Accueil est protégé et ne peut pas être supprimé."
      );
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    const deletedLabel = pendingDelete.label;

    try {
      const { error: deleteError } = await supabase
        .from("public_navigation_items")
        .delete()
        .eq("id", pendingDelete.id);

      if (deleteError) {
        throw deleteError;
      }

      setPendingDelete(null);

      await loadItems();
      await onChanged?.();

      setSuccess(
        `Le lien « ${deletedLabel} » a été supprimé avec succès.`
      );
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer cet élément."
        )
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="sn-card p-6 text-sm text-gray-600">
        Chargement de la navigation publique…
      </div>
    );
  }

  const orderedItems = sortItems(items);

  return (
    <>
      <section className="sn-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              🧭 Éditeur de la navigation
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Modifiez les liens affichés dans la barre de navigation publique.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              {visibleCount} visible(s)
            </span>

            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
              {hiddenCount} masqué(s)
            </span>

            <button
              type="button"
              onClick={openCreateModal}
              disabled={saving || creating || deleting}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Ajouter un lien
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">
            <strong>Erreur :</strong> {error}
          </div>
        )}

        {success && (
          <div className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-6">
            ✅ {success}
          </div>
        )}

        {dirty && (
          <div className="mx-5 mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 sm:mx-6">
            Des modifications sont en attente. Enregistrez-les ou annulez-les avant d'ajouter ou supprimer un élément.
          </div>
        )}

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
          {orderedItems.map(
            (item, index) => {
              const isHome =
                normalizePath(item.path) === "/";

              return (
                <article
                  key={item.id}
                  className={[
                    "rounded-2xl border p-5 transition",
                    item.is_visible
                      ? "border-gray-200 bg-white shadow-sm"
                      : "border-gray-200 bg-gray-50",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Élément {index + 1}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                        <span>
                          {item.label || "Sans titre"}
                        </span>

                        {isHome && (
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                            Protégé
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateItem(item.id, {
                          is_visible:
                            !item.is_visible,
                        })
                      }
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-semibold",
                        item.is_visible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-200 text-gray-600",
                      ].join(" ")}
                    >
                      {item.is_visible
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
                        value={item.label}
                        onChange={(event) =>
                          updateItem(item.id, {
                            label:
                              event.target.value,
                          })
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
                        value={item.path}
                        disabled={isHome}
                        onChange={(event) =>
                          updateItem(item.id, {
                            path:
                              event.target.value,
                          })
                        }
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 font-mono text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
                      />

                      {isHome && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          Le chemin de la page d'accueil est protégé.
                        </p>
                      )}
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
                        value={item.sort_order}
                        onChange={(event) =>
                          updateItem(item.id, {
                            sort_order: Number(
                              event.target.value
                            ),
                          })
                        }
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() =>
                          moveItem(item.id, -1)
                        }
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↑ Monter
                      </button>

                      <button
                        type="button"
                        disabled={
                          index ===
                          orderedItems.length - 1
                        }
                        onClick={() =>
                          moveItem(item.id, 1)
                        }
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        ↓ Descendre
                      </button>

                      <a
                        href={normalizePath(
                          item.path
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
                          isHome ||
                          dirty ||
                          deleting
                        }
                        onClick={() =>
                          askDelete(item)
                        }
                        title={
                          isHome
                            ? "La page d'accueil est protégée."
                            : dirty
                              ? "Enregistrez ou annulez les modifications avant la suppression."
                              : "Supprimer cet élément"
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
              onClick={resetChanges}
              disabled={!dirty || saving}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 ring-1 ring-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                  Ajouter un élément
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  Ajoutez un nouveau lien à la barre de navigation publique.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(false)
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
                  Libellé
                </label>

                <input
                  type="text"
                  value={newItem.label}
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
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
                  value={newItem.path}
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      path: event.target.value,
                    }))
                  }
                  placeholder="/actualites"
                  disabled={creating}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-1 text-xs text-gray-400">
                  Le / initial sera ajouté automatiquement si nécessaire.
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    Afficher immédiatement
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Le lien sera visible dans la navbar dès sa création.
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={newItem.isVisible}
                  onChange={(event) =>
                    setNewItem((current) => ({
                      ...current,
                      isVisible:
                        event.target.checked,
                    }))
                  }
                  disabled={creating}
                  className="h-5 w-5 accent-blue-600"
                />
              </label>

              <div className="rounded-2xl bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
                L'ordre sera déterminé automatiquement après le dernier élément existant.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setShowCreateModal(false)
                }
                disabled={creating}
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void createNavigationItem()
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
                sera supprimé de la navigation publique.
              </p>

              <div className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 font-mono text-sm text-gray-600">
                {pendingDelete.path}
              </div>

              <p className="mt-4 text-xs leading-5 text-red-600">
                Cette action supprimera l'entrée de navigation dans Supabase. Elle ne supprimera pas automatiquement la page associée.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setPendingDelete(null)
                }
                disabled={deleting}
                className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void deleteNavigationItem()
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
