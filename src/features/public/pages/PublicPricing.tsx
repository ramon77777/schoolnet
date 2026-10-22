import {
  useEffect,
  useState,
} from "react";

import { Link } from "react-router-dom";

import PublicPageContent from "@/features/public/components/PublicPageContent";

import {
  loadPublicPricingPlans,
  type PublicPricingPlan,
} from "@/features/public/lib/publicCms";

function formatPrice(
  plan: PublicPricingPlan,
) {
  if (
    plan.price_amount === null ||
    plan.price_amount === undefined
  ) {
    return (
      plan.billing_period?.trim() ||
      "Nous contacter"
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
      .trim()
      .toUpperCase() === "XOF"
  ) {
    return `${formatted} FCFA`;
  }

  return `${formatted} ${plan.currency}`;
}

function PlanButton({
  plan,
}: {
  plan: PublicPricingPlan;
}) {
  const path =
    plan.cta_path?.trim() ||
    "/contact";

  const label =
    plan.cta_label?.trim() ||
    "Nous contacter";

  const classes = [
    "mt-7 flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-bold transition",
    plan.is_featured
      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
      : "bg-slate-900 text-white hover:bg-slate-800",
  ].join(" ");

  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return (
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className={classes}
      >
        {label}
        <span className="ml-2">
          ↗
        </span>
      </a>
    );
  }

  return (
    <Link
      to={path}
      className={classes}
    >
      {label}
      <span className="ml-2">
        →
      </span>
    </Link>
  );
}

export default function PublicPricing() {
  const [plans, setPlans] =
    useState<PublicPricingPlan[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const rows =
          await loadPublicPricingPlans();

        if (!cancelled) {
          setPlans(rows);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Impossible de charger les tarifs.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PublicPageContent slug="tarifs">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 px-7 py-12 text-white shadow-xl sm:px-10 lg:px-14">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />

            <div className="relative z-10 mx-auto max-w-3xl text-center">
              <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
                💳{" "}
                {page.eyebrow?.trim() ||
                  "Adhésion SchoolNet"}
              </div>

              <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                {page.title?.trim() ||
                  page.nav_title ||
                  "Des tarifs clairs et adaptés"}
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-blue-100 sm:text-lg">
                {page.intro?.trim() ||
                  "Choisissez la formule SchoolNet adaptée à vos besoins."}
              </p>

              <div className="mt-7 inline-flex rounded-2xl border border-white/10 bg-white/10 px-5 py-3 backdrop-blur">
                <strong className="mr-2 text-xl">
                  {loading
                    ? "…"
                    : plans.length}
                </strong>

                <span className="text-sm text-blue-100">
                  offre
                  {plans.length > 1
                    ? "s"
                    : ""}{" "}
                  disponible
                  {plans.length > 1
                    ? "s"
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {page.body?.trim() && (
            <div className="mx-auto mt-8 max-w-4xl rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
              <p className="whitespace-pre-line text-sm leading-7 text-slate-600">
                {page.body}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

              <p className="mt-4 text-sm text-slate-500">
                Chargement des offres…
              </p>
            </div>
          )}

          {!loading &&
            !error &&
            plans.length === 0 && (
              <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <div className="text-5xl">
                  💳
                </div>

                <h2 className="mt-4 text-xl font-black">
                  Aucune offre publiée
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Les offres ajoutées par
                  l’administration
                  apparaîtront ici.
                </p>
              </div>
            )}

          {!loading &&
            !error &&
            plans.length > 0 && (
              <div className="mt-10 grid gap-6 lg:grid-cols-3">
                {plans.map((plan) => {
                  const features =
                    Array.isArray(
                      plan.features,
                    )
                      ? plan.features
                      : [];

                  return (
                    <article
                      key={plan.id}
                      className={[
                        "relative flex h-full flex-col overflow-hidden rounded-[2rem] border bg-white p-7 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-8",
                        plan.is_featured
                          ? "border-blue-300 ring-2 ring-blue-100"
                          : "border-slate-200",
                      ].join(" ")}
                    >
                      {plan.is_featured && (
                        <div className="absolute right-5 top-5 rounded-full bg-blue-600 px-3 py-1.5 text-[11px] font-black text-white shadow">
                          ⭐ Recommandée
                        </div>
                      )}

                      <div className="pr-24">
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">
                          {plan.eyebrow ||
                            "Offre SchoolNet"}
                        </div>

                        <h2 className="mt-3 text-2xl font-black text-slate-900">
                          {plan.name}
                        </h2>
                      </div>

                      <div className="mt-7">
                        <div className="text-3xl font-black text-slate-950">
                          {formatPrice(plan)}
                        </div>

                        {plan.price_amount !==
                          null &&
                          Number(
                            plan.price_amount,
                          ) > 0 &&
                          plan.billing_period && (
                            <div className="mt-1 text-sm text-slate-400">
                              {
                                plan.billing_period
                              }
                            </div>
                          )}
                      </div>

                      {plan.description && (
                        <p className="mt-5 text-sm leading-7 text-slate-600">
                          {plan.description}
                        </p>
                      )}

                      <div className="my-6 border-t border-slate-100" />

                      <div className="flex-1 space-y-3">
                        {features.map(
                          (
                            feature,
                            index,
                          ) => (
                            <div
                              key={`${plan.id}-${index}`}
                              className="flex gap-3 text-sm leading-6 text-slate-600"
                            >
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-black text-emerald-600">
                                ✓
                              </span>

                              <span>
                                {feature}
                              </span>
                            </div>
                          ),
                        )}
                      </div>

                      <PlanButton
                        plan={plan}
                      />
                    </article>
                  );
                })}
              </div>
            )}

          <div className="mt-12 rounded-[2rem] bg-slate-950 px-8 py-10 text-white sm:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                  Besoin d’aide ?
                </div>

                <h2 className="mt-3 text-2xl font-black">
                  Trouvons ensemble l’offre adaptée.
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                  Pour une école, une famille ou
                  un besoin particulier, l’équipe
                  SchoolNet peut vous orienter.
                </p>
              </div>

              <Link
                to="/contact"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-slate-100"
              >
                Nous contacter
                <span className="ml-2">
                  →
                </span>
              </Link>
            </div>
          </div>
        </section>
      )}
    </PublicPageContent>
  );
}