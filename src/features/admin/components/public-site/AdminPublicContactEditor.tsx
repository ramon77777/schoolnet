import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

type ContactItem = {
  id: string;
  item_key: string;
  item_type: string;
  label: string;
  value: string;
  href: string | null;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

type ContactForm = {
  item_type: string;
  label: string;
  value: string;
  href: string;
  description: string;
  icon: string;
  sort_order: string;
  is_visible: boolean;
};

type Props = {
  onChanged?: () => void | Promise<void>;
};

const CONTACT_TYPES = [
  {
    value: "info",
    label: "Information",
  },
  {
    value: "email",
    label: "Adresse e-mail",
  },
  {
    value: "phone",
    label: "Téléphone",
  },
  {
    value: "address",
    label: "Adresse",
  },
  {
    value: "hours",
    label: "Horaires",
  },
  {
    value: "link",
    label: "Lien / Réseau social",
  },
];

const CONTACT_ICONS = [
  "💬",
  "✉️",
  "📧",
  "📞",
  "📱",
  "📍",
  "🏢",
  "🕒",
  "🌐",
  "🔗",
  "💡",
  "🤝",
  "📚",
  "🎓",
  "⭐",
  "ℹ️",
];

const EMPTY_FORM: ContactForm = {
  item_type: "info",
  label: "",
  value: "",
  href: "",
  description: "",
  icon: "",
  sort_order: "10",
  is_visible: true,
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

function createItemKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildHref(
  itemType: string,
  value: string,
  href: string
) {
  const manualHref = href.trim();

  if (manualHref) {
    return manualHref;
  }

  const cleanValue = value.trim();

  if (
    !cleanValue ||
    cleanValue.toLowerCase() ===
      "à renseigner"
  ) {
    return null;
  }

  if (itemType === "email") {
    return `mailto:${cleanValue}`;
  }

  if (itemType === "phone") {
    const phone = cleanValue.replace(
      /[^\d+]/g,
      ""
    );

    return phone
      ? `tel:${phone}`
      : null;
  }

  return null;
}

export default function AdminPublicContactEditor({
  onChanged,
}: Props) {
  const [items, setItems] = useState<
    ContactItem[]
  >([]);

  const [search, setSearch] = useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] = useState<
    string | null
  >(null);

  const [success, setSuccess] = useState<
    string | null
  >(null);

  const [formOpen, setFormOpen] =
    useState(false);

  const [editingItem, setEditingItem] =
    useState<ContactItem | null>(null);

  const [form, setForm] =
    useState<ContactForm>(EMPTY_FORM);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } =
        await supabase
          .from("public_contact_items")
          .select(
            `
              id,
              item_key,
              item_type,
              label,
              value,
              href,
              description,
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

      setItems(
        (data ?? []) as ContactItem[]
      );
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          "Impossible de charger les informations de contact."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const term = search
      .trim()
      .toLowerCase();

    if (!term) {
      return items;
    }

    return items.filter((item) => {
      const values = [
        item.item_key,
        item.item_type,
        item.label,
        item.value,
        item.description,
      ];

      return values.some((value) =>
        value
          ?.toLowerCase()
          .includes(term)
      );
    });
  }, [items, search]);

  const openCreateForm = () => {
    const nextOrder =
      items.length > 0
        ? Math.max(
            ...items.map(
              (item) =>
                item.sort_order
            )
          ) + 10
        : 10;

    setEditingItem(null);

    setForm({
      ...EMPTY_FORM,
      sort_order: String(nextOrder),
    });

    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const openEditForm = (
    item: ContactItem
  ) => {
    setEditingItem(item);

    setForm({
      item_type: item.item_type,
      label: item.label,
      value: item.value,
      href: item.href ?? "",
      description:
        item.description ?? "",
      icon: item.icon ?? "",
      sort_order: String(
        item.sort_order
      ),
      is_visible: item.is_visible,
    });

    setError(null);
    setSuccess(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
  };

  const createUniqueItemKey = (
    label: string
  ) => {
    const baseKey =
      createItemKey(label) || "contact";

    const existingKeys = new Set(
      items.map(
        (item) => item.item_key
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
    const label = form.label.trim();
    const value = form.value.trim();

    if (!label) {
      setError(
        "Le libellé est obligatoire."
      );
      return;
    }

    if (!value) {
      setError(
        "La valeur est obligatoire."
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
        item_type: form.item_type,
        label,
        value,

        href: buildHref(
          form.item_type,
          value,
          form.href
        ),

        description:
          form.description.trim() ||
          null,

        icon:
          form.icon.trim() || null,

        sort_order: sortOrder,

        is_visible: form.is_visible,

        updated_at:
          new Date().toISOString(),

        updated_by:
          user?.id ?? null,
      };

      if (editingItem) {
        const { error: updateError } =
          await supabase
            .from(
              "public_contact_items"
            )
            .update(commonPayload)
            .eq("id", editingItem.id);

        if (updateError) {
          throw updateError;
        }

        setSuccess(
          "L’information de contact a été modifiée avec succès."
        );
      } else {
        const itemKey =
          createUniqueItemKey(label);

        const { error: insertError } =
          await supabase
            .from(
              "public_contact_items"
            )
            .insert({
              item_key: itemKey,
              ...commonPayload,
              created_by:
                user?.id ?? null,
            });

        if (insertError) {
          throw insertError;
        }

        setSuccess(
          "L’information de contact a été ajoutée avec succès."
        );
      }

      closeForm();

      await loadItems();

      if (onChanged) {
        await onChanged();
      }
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer l’information de contact."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (
    item: ContactItem
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
            "public_contact_items"
          )
          .update({
            is_visible:
              !item.is_visible,

            updated_at:
              new Date().toISOString(),

            updated_by:
              user?.id ?? null,
          })
          .eq("id", item.id);

      if (updateError) {
        throw updateError;
      }

      setSuccess(
        item.is_visible
          ? "L’information a été masquée du site public."
          : "L’information est maintenant visible sur le site public."
      );

      await loadItems();

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
    item: ContactItem
  ) => {
    const confirmed = window.confirm(
      `Supprimer définitivement « ${item.label} » ?`
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
            "public_contact_items"
          )
          .delete()
          .eq("id", item.id);

      if (deleteError) {
        throw deleteError;
      }

      if (
        editingItem?.id === item.id
      ) {
        closeForm();
      }

      setSuccess(
        "L’information de contact a été supprimée avec succès."
      );

      await loadItems();

      if (onChanged) {
        await onChanged();
      }
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer l’information de contact."
        )
      );
    }
  };

  return (
    <section className="sn-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-gray-900">
            Coordonnées de contact
          </div>

          <p className="mt-1 text-sm leading-6 text-gray-500">
            Gérez les coordonnées,
            horaires, informations et liens
            affichés sur la page Contact.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateForm}
          className="sn-btn-primary sn-press"
        >
          + Ajouter une information
        </button>
      </div>

      <div className="mt-5">
        <input
          type="search"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Rechercher par libellé, type, valeur…"
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
                {editingItem
                  ? "Modifier l’information"
                  : "Nouvelle information"}
              </div>

              {editingItem && (
                <div className="mt-1 text-xs text-gray-500">
                  Identifiant technique :{" "}
                  <span className="font-mono">
                    {editingItem.item_key}
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
                Type
              </label>

              <select
                value={form.item_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    item_type:
                      event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {CONTACT_TYPES.map(
                  (type) => (
                    <option
                      key={type.value}
                      value={type.value}
                    >
                      {type.label}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Libellé *
              </label>

              <input
                type="text"
                value={form.label}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    label:
                      event.target.value,
                  }))
                }
                placeholder="Ex. Téléphone"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">
                Valeur *
              </label>

              <input
                type="text"
                value={form.value}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    value:
                      event.target.value,
                  }))
                }
                placeholder="Ex. +225 01 23 45 67 89"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">
                Lien
              </label>

              <input
                type="text"
                value={form.href}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    href:
                      event.target.value,
                  }))
                }
                placeholder="Ex. https://..., mailto:..., tel:..."
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />

              <p className="mt-1 text-xs text-gray-400">
                Pour un téléphone ou un e-mail,
                le lien est généré automatiquement
                si ce champ reste vide.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">
                Description
              </label>

              <textarea
                rows={4}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }))
                }
                placeholder="Information complémentaire…"
                className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-gray-700">
                Icône
              </label>

              <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-4">
                <div className="grid grid-cols-8 gap-2 sm:grid-cols-12">
                  {CONTACT_ICONS.map(
                    (icon) => {
                      const selected =
                        form.icon === icon;

                      return (
                        <button
                          key={icon}
                          type="button"
                          onClick={() =>
                            setForm(
                              (current) => ({
                                ...current,
                                icon,
                              })
                            )
                          }
                          className={[
                            "flex h-11 items-center justify-center rounded-xl border text-xl transition",
                            selected
                              ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                              : "border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50",
                          ].join(" ")}
                        >
                          {icon}
                        </button>
                      );
                    }
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                    {form.icon || "✦"}
                  </div>

                  <input
                    type="text"
                    value={form.icon}
                    onChange={(event) =>
                      setForm(
                        (current) => ({
                          ...current,
                          icon:
                            event.target.value,
                        })
                      )
                    }
                    placeholder="Ou coller un autre emoji…"
                    className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />

                  {form.icon && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm(
                          (current) => ({
                            ...current,
                            icon: "",
                          })
                        )
                      }
                      className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-semibold text-gray-500"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
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
                    Peut être masqué sans être
                    supprimé.
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
                : editingItem
                  ? "Enregistrer les modifications"
                  : "Ajouter l’information"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
            Chargement des coordonnées…
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
            Aucune information trouvée.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredItems.map(
              (item) => (
                <article
                  key={item.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                        {item.icon || "✦"}
                      </div>

                      <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                          {item.item_type}
                        </div>

                        <div className="mt-1 font-semibold text-gray-900">
                          {item.label}
                        </div>

                        <div className="mt-1 break-words text-sm text-gray-600">
                          {item.value}
                        </div>
                      </div>
                    </div>

                    <span
                      className={[
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                        item.is_visible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {item.is_visible
                        ? "Visible"
                        : "Masquée"}
                    </span>
                  </div>

                  {item.description && (
                    <p className="mt-4 text-sm leading-6 text-gray-500">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                    <span className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
                      Ordre :{" "}
                      {item.sort_order}
                    </span>

                    <span className="rounded-lg bg-gray-50 px-2.5 py-1 font-mono text-xs text-gray-500">
                      {item.item_key}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openEditForm(item)
                      }
                      className="sn-btn-ghost sn-press"
                    >
                      Modifier
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleToggleVisibility(
                          item
                        )
                      }
                      className="sn-btn-ghost sn-press"
                    >
                      {item.is_visible
                        ? "Masquer"
                        : "Afficher"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleDelete(item)
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