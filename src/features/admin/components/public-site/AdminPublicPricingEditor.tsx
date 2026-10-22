import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

import type {
  PublicPricingPlan,
} from "@/features/public/lib/publicCms";

type Props = {
  onChanged?: () =>
    void | Promise<void>;
};

type PricingForm = {
  name: string;
  slug: string;
  eyebrow: string;
  description: string;

  priceAmount: string;
  currency: string;
  billingPeriod: string;

  featuresText: string;

  ctaLabel: string;
  ctaPath: string;

  sortOrder: number;

  isFeatured: boolean;
  isVisible: boolean;
};

const EMPTY_FORM: PricingForm = {
  name: "",
  slug: "",
  eyebrow: "",
  description: "",

  priceAmount: "",
  currency: "XOF",
  billingPeriod: "",

  featuresText: "",

  ctaLabel: "Nous contacter",
  ctaPath: "/contact",

  sortOrder: 10,

  isFeatured: false,
  isVisible: true,
};

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as {
      message?: unknown;
    }).message === "string"
  ) {
    return (
      error as {
        message: string;
      }
    ).message;
  }

  return fallback;
}

function makeSlug(
  value: string,
) {
  return value
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .trim()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(/^-+|-+$/g, "");
}

function nullableText(
  value: string,
) {
  const clean = value.trim();

  return clean || null;
}

function normalizeSearchText(
  value?: string | null,
) {
  return (value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .trim();
}

function priceLabel(
  plan: PublicPricingPlan,
) {
  if (
    plan.price_amount === null ||
    plan.price_amount === undefined
  ) {
    return (
      plan.billing_period ||
      "Tarif non défini"
    );
  }

  const amount =
    Number(plan.price_amount);

  if (amount === 0) {
    return "Gratuit";
  }

  const formatted =
    new Intl.NumberFormat(
      "fr-FR",
    ).format(amount);

  if (
    plan.currency
      .toUpperCase() === "XOF"
  ) {
    return `${formatted} FCFA`;
  }

  return `${formatted} ${plan.currency}`;
}

export default function AdminPublicPricingEditor({
  onChanged,
}: Props) {
  const [plans, setPlans] =
    useState<PublicPricingPlan[]>(
      [],
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [showEditor, setShowEditor] =
    useState(false);

  const [editingPlan, setEditingPlan] =
    useState<
      PublicPricingPlan | null
    >(null);

  const [
    pendingDelete,
    setPendingDelete,
  ] = useState<
    PublicPricingPlan | null
  >(null);

  const [form, setForm] =
    useState<PricingForm>(
      EMPTY_FORM,
    );

  const loadData =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data,
          error: loadError,
        } = await supabase
          .from(
            "public_pricing_plans",
          )
          .select("*")
          .order("sort_order", {
            ascending: true,
          })
          .order("created_at", {
            ascending: true,
          });

        if (loadError) {
          throw loadError;
        }

        setPlans(
          (data as
            | PublicPricingPlan[]
            | null) ?? [],
        );
      } catch (loadError) {
        setError(
          getErrorMessage(
            loadError,
            "Impossible de charger les tarifs.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const orderedPlans =
    useMemo(
      () =>
        [...plans].sort(
          (a, b) =>
            a.sort_order -
              b.sort_order ||
            a.created_at.localeCompare(
              b.created_at,
            ),
        ),
      [plans],
    );

  const visibleCount =
    useMemo(
      () =>
        plans.filter(
          (plan) =>
            plan.is_visible,
        ).length,
      [plans],
    );

  const featuredCount =
    useMemo(
      () =>
        plans.filter(
          (plan) =>
            plan.is_featured,
        ).length,
      [plans],
    );

  const normalizedSearch =
    normalizeSearchText(
      searchTerm,
    );

  const filteredPlans =
    normalizedSearch
      ? orderedPlans.filter(
          (plan) => {
            const searchable =
              normalizeSearchText(
                [
                  plan.name,
                  plan.slug,
                  plan.eyebrow,
                  plan.description,
                  plan.currency,
                  plan.billing_period,
                  plan.cta_label,
                  plan.cta_path,
                  ...(Array.isArray(
                    plan.features,
                  )
                    ? plan.features
                    : []),
                ].join(" "),
              );

            return searchable.includes(
              normalizedSearch,
            );
          },
        )
      : orderedPlans;

  function updateForm(
    patch: Partial<PricingForm>,
  ) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));

    setError(null);
    setSuccess(null);
  }

  function openCreate() {
    const maxOrder =
      plans.reduce(
        (max, plan) =>
          Math.max(
            max,
            plan.sort_order,
          ),
        0,
      );

    setEditingPlan(null);

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
    plan: PublicPricingPlan,
  ) {
    setEditingPlan(plan);

    setForm({
      name: plan.name,
      slug: plan.slug,

      eyebrow:
        plan.eyebrow ?? "",

      description:
        plan.description ?? "",

      priceAmount:
        plan.price_amount ===
          null ||
        plan.price_amount ===
          undefined
          ? ""
          : String(
              plan.price_amount,
            ),

      currency:
        plan.currency || "XOF",

      billingPeriod:
        plan.billing_period ??
        "",

      featuresText:
        Array.isArray(
          plan.features,
        )
          ? plan.features.join(
              "\n",
            )
          : "",

      ctaLabel:
        plan.cta_label ||
        "Nous contacter",

      ctaPath:
        plan.cta_path ||
        "/contact",

      sortOrder:
        plan.sort_order,

      isFeatured:
        plan.is_featured,

      isVisible:
        plan.is_visible,
    });

    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setShowEditor(false);
    setEditingPlan(null);

    setForm(EMPTY_FORM);
    setError(null);
  }

  async function savePlan() {
    const name =
      form.name.trim();

    const slug =
      form.slug.trim() ||
      makeSlug(name);

    if (!name) {
      setError(
        "Le nom de l’offre est obligatoire.",
      );
      return;
    }

    if (!slug) {
      setError(
        "Le slug est obligatoire.",
      );
      return;
    }

    const priceText =
      form.priceAmount.trim();

    const price =
      priceText === ""
        ? null
        : Number(priceText);

    if (
      price !== null &&
      (!Number.isFinite(price) ||
        price < 0)
    ) {
      setError(
        "Le montant saisi est invalide.",
      );
      return;
    }

    const features =
      form.featuresText
        .split("\n")
        .map((feature) =>
          feature.trim(),
        )
        .filter(Boolean);

    const payload = {
      name,
      slug,

      eyebrow:
        nullableText(
          form.eyebrow,
        ),

      description:
        nullableText(
          form.description,
        ),

      price_amount: price,

      currency:
        form.currency
          .trim()
          .toUpperCase() ||
        "XOF",

      billing_period:
        nullableText(
          form.billingPeriod,
        ),

      features,

      cta_label:
        form.ctaLabel.trim() ||
        "Nous contacter",

      cta_path:
        form.ctaPath.trim() ||
        "/contact",

      sort_order:
        form.sortOrder,

      is_featured:
        form.isFeatured,

      is_visible:
        form.isVisible,
    };

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingPlan) {
        const {
          error: updateError,
        } = await supabase
          .from(
            "public_pricing_plans",
          )
          .update(payload)
          .eq(
            "id",
            editingPlan.id,
          );

        if (updateError) {
          throw updateError;
        }
      } else {
        const {
          error: insertError,
        } = await supabase
          .from(
            "public_pricing_plans",
          )
          .insert(payload);

        if (insertError) {
          throw insertError;
        }
      }

      const message =
        editingPlan
          ? `L’offre « ${name} » a été modifiée avec succès.`
          : `L’offre « ${name} » a été ajoutée avec succès.`;

      setShowEditor(false);
      setEditingPlan(null);
      setForm(EMPTY_FORM);

      await loadData();
      await onChanged?.();

      setSuccess(message);
    } catch (saveError) {
      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer cette offre.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateFlags(
    plan: PublicPricingPlan,
    patch: Partial<
      Pick<
        PublicPricingPlan,
        | "is_visible"
        | "is_featured"
      >
    >,
  ) {
    setWorkingId(plan.id);
    setError(null);
    setSuccess(null);

    try {
      const {
        error: updateError,
      } = await supabase
        .from(
          "public_pricing_plans",
        )
        .update(patch)
        .eq("id", plan.id);

      if (updateError) {
        throw updateError;
      }

      await loadData();
      await onChanged?.();
    } catch (updateError) {
      setError(
        getErrorMessage(
          updateError,
          "Impossible de modifier cette offre.",
        ),
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function movePlan(
    plan: PublicPricingPlan,
    direction: -1 | 1,
  ) {
    const index =
      orderedPlans.findIndex(
        (row) =>
          row.id === plan.id,
      );

    const targetIndex =
      index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >=
        orderedPlans.length
    ) {
      return;
    }

    const target =
      orderedPlans[targetIndex];

    setWorkingId(plan.id);
    setError(null);

    try {
      const [
        firstResult,
        secondResult,
      ] = await Promise.all([
        supabase
          .from(
            "public_pricing_plans",
          )
          .update({
            sort_order:
              target.sort_order,
          })
          .eq("id", plan.id),

        supabase
          .from(
            "public_pricing_plans",
          )
          .update({
            sort_order:
              plan.sort_order,
          })
          .eq("id", target.id),
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
          "Impossible de déplacer cette offre.",
        ),
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function deletePlan() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);

    const name =
      pendingDelete.name;

    try {
      const {
        error: deleteError,
      } = await supabase
        .from(
          "public_pricing_plans",
        )
        .delete()
        .eq(
          "id",
          pendingDelete.id,
        );

      if (deleteError) {
        throw deleteError;
      }

      setPendingDelete(null);

      await loadData();
      await onChanged?.();

      setSuccess(
        `L’offre « ${name} » a été supprimée définitivement.`,
      );
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer cette offre.",
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
          Chargement des tarifs…
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
              💳 Gestion des tarifs
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Gérez les offres, prix,
              avantages et appels à
              l’action du site public.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {plans.length} offre(s)
            </span>

            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              {visibleCount} visible(s)
            </span>

            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              {featuredCount} recommandée(s)
            </span>

            <button
              type="button"
              onClick={openCreate}
              className="sn-btn-primary sn-press"
            >
              + Ajouter une offre
            </button>

            <a
              href="/tarifs"
              target="_blank"
              rel="noreferrer"
              className="sn-btn-ghost sn-press"
            >
              Voir les tarifs ↗
            </a>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">
            <strong>
              Erreur :
            </strong>{" "}
            {error}
          </div>
        )}

        {success && (
          <div className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-6">
            ✅ {success}
          </div>
        )}

        {orderedPlans.length > 0 && (
          <div className="mx-5 mt-5 rounded-2xl border border-gray-200 bg-white p-4 sm:mx-6">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Rechercher une offre
            </label>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  🔎
                </span>

                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) =>
                    setSearchTerm(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Famille, établissement, gratuit..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="whitespace-nowrap text-sm text-gray-500">
                <strong className="text-gray-900">
                  {
                    filteredPlans.length
                  }
                </strong>{" "}
                résultat(s) sur{" "}
                <strong className="text-gray-900">
                  {orderedPlans.length}
                </strong>
              </div>

              {searchTerm.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    setSearchTerm("")
                  }
                  className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        )}

        {filteredPlans.length ===
          0 &&
        searchTerm.trim() && (
          <div className="mx-5 my-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center sm:mx-6">
            🔎 Aucun tarif ne
            correspond à cette recherche.
          </div>
        )}

        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-2">
          {filteredPlans.map(
            (plan) => {
              const actualIndex =
                orderedPlans.findIndex(
                  (row) =>
                    row.id ===
                    plan.id,
                );

              const busy =
                workingId ===
                plan.id;

              return (
                <article
                  key={plan.id}
                  className={[
                    "rounded-3xl border bg-white p-6 shadow-sm",
                    plan.is_featured
                      ? "border-blue-300 ring-1 ring-blue-100"
                      : "border-gray-200",
                    plan.is_visible
                      ? ""
                      : "opacity-65",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Offre{" "}
                        {actualIndex +
                          1}
                      </div>

                      <h3 className="mt-1 text-xl font-semibold text-gray-900">
                        {plan.name}
                      </h3>

                      <div className="mt-1 font-mono text-[11px] text-gray-400">
                        /{plan.slug}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void updateFlags(
                          plan,
                          {
                            is_visible:
                              !plan.is_visible,
                          },
                        )
                      }
                      className={[
                        "rounded-full px-3 py-1.5 text-xs font-semibold",
                        plan.is_visible
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600",
                      ].join(" ")}
                    >
                      {plan.is_visible
                        ? "● Visible"
                        : "● Masquée"}
                    </button>
                  </div>

                  <div className="mt-5 text-2xl font-black text-slate-900">
                    {priceLabel(plan)}
                  </div>

                  {plan.billing_period &&
                    plan.price_amount !==
                      null &&
                    Number(
                      plan.price_amount,
                    ) > 0 && (
                      <div className="mt-1 text-xs text-gray-400">
                        {
                          plan.billing_period
                        }
                      </div>
                    )}

                  {plan.description && (
                    <p className="mt-4 text-sm leading-6 text-gray-500">
                      {
                        plan.description
                      }
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                      Ordre{" "}
                      {plan.sort_order}
                    </span>

                    {plan.is_featured && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        ⭐ Recommandée
                      </span>
                    )}

                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                      {
                        plan.features
                          ?.length ?? 0
                      }{" "}
                      avantage(s)
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openEdit(plan)
                      }
                      className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
                    >
                      ✏️ Modifier
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void updateFlags(
                          plan,
                          {
                            is_featured:
                              !plan.is_featured,
                          },
                        )
                      }
                      className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700"
                    >
                      {plan.is_featured
                        ? "★ Retirer recommandation"
                        : "☆ Recommander"}
                    </button>

                    <button
                      type="button"
                      disabled={
                        actualIndex ===
                          0 ||
                        busy
                      }
                      onClick={() =>
                        void movePlan(
                          plan,
                          -1,
                        )
                      }
                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-30"
                    >
                      ↑
                    </button>

                    <button
                      type="button"
                      disabled={
                        actualIndex ===
                          orderedPlans.length -
                            1 ||
                        busy
                      }
                      onClick={() =>
                        void movePlan(
                          plan,
                          1,
                        )
                      }
                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-30"
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete(
                          plan,
                        )
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600"
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
          <div className="mx-auto my-8 w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingPlan
                    ? "Modifier l’offre"
                    : "Ajouter une offre"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Configurez le prix,
                  les avantages et
                  l’appel à l’action.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Nom *
                  </label>

                  <input
                    value={form.name}
                    onChange={(event) => {
                      const name =
                        event.target
                          .value;

                      updateForm({
                        name,

                        ...(!editingPlan
                          ? {
                              slug:
                                makeSlug(
                                  name,
                                ),
                            }
                          : {}),
                      });
                    }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Slug *
                  </label>

                  <input
                    value={form.slug}
                    onChange={(event) =>
                      updateForm({
                        slug:
                          makeSlug(
                            event.target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Surtitre
                  </label>

                  <input
                    value={
                      form.eyebrow
                    }
                    onChange={(event) =>
                      updateForm({
                        eyebrow:
                          event.target
                            .value,
                      })
                    }
                    placeholder="Pour les familles"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Ordre
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={
                      form.sortOrder
                    }
                    onChange={(event) =>
                      updateForm({
                        sortOrder:
                          Number(
                            event.target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Description
                </label>

                <textarea
                  rows={3}
                  value={
                    form.description
                  }
                  onChange={(event) =>
                    updateForm({
                      description:
                        event.target
                          .value,
                    })
                  }
                  className="w-full rounded-xl border border-gray-200 px-4 py-3"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Prix
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={
                      form.priceAmount
                    }
                    onChange={(event) =>
                      updateForm({
                        priceAmount:
                          event.target
                            .value,
                      })
                    }
                    placeholder="Laisser vide si sur devis"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Devise
                  </label>

                  <input
                    value={
                      form.currency
                    }
                    onChange={(event) =>
                      updateForm({
                        currency:
                          event.target
                            .value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Période
                  </label>

                  <input
                    value={
                      form.billingPeriod
                    }
                    onChange={(event) =>
                      updateForm({
                        billingPeriod:
                          event.target
                            .value,
                      })
                    }
                    placeholder="Par mois, Sur devis..."
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Avantages
                </label>

                <textarea
                  rows={6}
                  value={
                    form.featuresText
                  }
                  onChange={(event) =>
                    updateForm({
                      featuresText:
                        event.target
                          .value,
                    })
                  }
                  placeholder={"Un avantage par ligne\nAccès aux ressources\nSuivi scolaire\nNotifications"}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3"
                />

                <p className="mt-2 text-xs text-gray-400">
                  Un avantage par ligne.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Texte du bouton
                  </label>

                  <input
                    value={
                      form.ctaLabel
                    }
                    onChange={(event) =>
                      updateForm({
                        ctaLabel:
                          event.target
                            .value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold">
                    Destination
                  </label>

                  <input
                    value={
                      form.ctaPath
                    }
                    onChange={(event) =>
                      updateForm({
                        ctaPath:
                          event.target
                            .value,
                      })
                    }
                    placeholder="/contact"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <strong>
                      Visible
                    </strong>

                    <p className="mt-1 text-xs text-gray-500">
                      Publier cette offre.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      form.isVisible
                    }
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

                <label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <strong>
                      Recommandée
                    </strong>

                    <p className="mt-1 text-xs text-gray-500">
                      Mettre visuellement en avant.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      form.isFeatured
                    }
                    onChange={(event) =>
                      updateForm({
                        isFeatured:
                          event.target
                            .checked,
                      })
                    }
                    className="h-5 w-5 accent-amber-500"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={closeEditor}
                className="sn-btn-ghost"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void savePlan()
                }
                disabled={saving}
                className="sn-btn-primary"
              >
                {saving
                  ? "Enregistrement…"
                  : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="text-4xl">
              🗑
            </div>

            <h2 className="mt-4 text-xl font-semibold">
              Supprimer cette offre ?
            </h2>

            <p className="mt-3 text-sm text-gray-500">
              <strong>
                {pendingDelete.name}
              </strong>{" "}
              sera supprimée définitivement.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() =>
                  setPendingDelete(
                    null,
                  )
                }
                className="sn-btn-ghost"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void deletePlan()
                }
                disabled={deleting}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white"
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