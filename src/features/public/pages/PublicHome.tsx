import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Link } from "react-router-dom";

import {
  loadPublicHomeContent,
  type PublicHomeContent,
} from "../lib/publicCms";

type DisplayCard = {
  icon: string;
  title: string;
  description: string;
};

const fallbackHeroFeatures: DisplayCard[] = [
  {
    icon: "📚",
    title: "Cours centralisés",
    description: "",
  },
  {
    icon: "🧪",
    title: "Évaluations",
    description: "",
  },
  {
    icon: "📈",
    title: "Progression",
    description: "",
  },
  {
    icon: "👨‍👩‍👧",
    title: "Suivi familial",
    description: "",
  },
];

const fallbackAudiences: DisplayCard[] = [
  {
    icon: "🎓",
    title: "Apprenants",
    description:
      "Cours, quiz, devoirs, examens, ressources et suivi de progression dans un espace unique.",
  },
  {
    icon: "👨‍🏫",
    title: "Enseignants",
    description:
      "Organisation des cours, évaluations, corrections et suivi pédagogique des apprenants.",
  },
  {
    icon: "👨‍👩‍👧",
    title: "Parents / Tuteurs",
    description:
      "Une vision claire des résultats, échéances et progrès scolaires des enfants.",
  },
  {
    icon: "🏫",
    title: "Administration",
    description:
      "Pilotage des utilisateurs, classes, contenus, années scolaires et paramètres de la plateforme.",
  },
];

const fallbackBenefits: DisplayCard[] = [
  {
    icon: "⚡",
    title: "Simple et rapide",
    description:
      "Une interface conçue pour rester facile à utiliser.",
  },
  {
    icon: "📱",
    title: "Accessible",
    description:
      "Un environnement adapté aux différents écrans.",
  },
  {
    icon: "📊",
    title: "Suivi intelligent",
    description:
      "Des indicateurs clairs pour mieux comprendre la progression.",
  },
  {
    icon: "🔐",
    title: "Espaces sécurisés",
    description:
      "Chaque profil accède uniquement aux fonctions qui le concernent.",
  },
];

function textOrFallback(
  value: string | null | undefined,
  fallback: string,
) {
  const normalized = value?.trim();

  return normalized ? normalized : fallback;
}

function ActionLink({
  to,
  className,
  children,
}: {
  to: string;
  className: string;
  children: ReactNode;
}) {
  const external = /^https?:\/\//i.test(to);

  if (external) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export default function PublicHome() {
  const [content, setContent] =
    useState<PublicHomeContent | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadPublicHomeContent()
      .then((loadedContent) => {
        if (!cancelled) {
          setContent(loadedContent);
        }
      })
      .catch((error: unknown) => {
        console.error(
          "[PublicHome] Impossible de charger le contenu public :",
          error,
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const settings = content?.settings;

  const heroBadge = textOrFallback(
    settings?.hero_badge,
    "✨ L'éducation connectée autrement",
  );

  const heroTitle = textOrFallback(
    settings?.hero_title,
    "Une nouvelle façon",
  );

  const heroHighlight = textOrFallback(
    settings?.hero_highlight,
    "d'apprendre et de réussir.",
  );

  const heroDescription = textOrFallback(
    settings?.hero_description,
    "Bienvenue sur SchoolNet, l'environnement numérique qui réunit cours, évaluations, ressources pédagogiques et suivi scolaire pour toute la communauté éducative.",
  );

  const heroPrimaryLabel = textOrFallback(
    settings?.hero_primary_label,
    "Explorer la bibliothèque",
  );

  const heroPrimaryPath = textOrFallback(
    settings?.hero_primary_path,
    "/bibliotheque",
  );

  const heroSecondaryLabel = textOrFallback(
    settings?.hero_secondary_label,
    "Accéder à mon espace",
  );

  const heroSecondaryPath = textOrFallback(
    settings?.hero_secondary_path,
    "/auth/login",
  );

  const heroPanelTitle = textOrFallback(
    settings?.hero_panel_title,
    "Votre réussite en un coup d'œil",
  );

  const heroPanelSubtitle = textOrFallback(
    settings?.hero_panel_subtitle,
    "Un environnement clair, moderne et connecté",
  );

  const heroPanelBanner = textOrFallback(
    settings?.hero_panel_banner,
    "Toute votre vie scolaire, au même endroit.",
  );

  const introEyebrow = textOrFallback(
    settings?.intro_eyebrow,
    "Découvrez SchoolNet",
  );

  const introTitle = textOrFallback(
    settings?.intro_title,
    "Une plateforme pensée pour simplifier l'expérience scolaire",
  );

  const introDescription = textOrFallback(
    settings?.intro_description,
    "SchoolNet rassemble les principaux outils pédagogiques dans une interface accessible, moderne et adaptée aux différents acteurs de l'établissement.",
  );

  const whyEyebrow = textOrFallback(
    settings?.why_eyebrow,
    "Pourquoi SchoolNet ?",
  );

  const whyTitle = textOrFallback(
    settings?.why_title,
    "Plus qu'une plateforme, un véritable environnement éducatif.",
  );

  const whyDescription = textOrFallback(
    settings?.why_description,
    "SchoolNet facilite la circulation de l'information pédagogique, renforce le suivi de l'apprenant et donne à chaque utilisateur les outils dont il a réellement besoin.",
  );

  const ctaEyebrow = textOrFallback(
    settings?.cta_eyebrow,
    "Commencez maintenant",
  );

  const ctaTitle = textOrFallback(
    settings?.cta_title,
    "Votre espace SchoolNet vous attend.",
  );

  const ctaDescription = textOrFallback(
    settings?.cta_description,
    "Retrouvez vos cours, évaluations, résultats et outils de suivi depuis un environnement sécurisé.",
  );

  const ctaButtonLabel = textOrFallback(
    settings?.cta_button_label,
    "Se connecter",
  );

  const ctaButtonPath = textOrFallback(
    settings?.cta_button_path,
    "/auth/login",
  );

  const heroFeatures =
    content?.heroFeatures &&
    content.heroFeatures.length > 0
      ? content.heroFeatures.map((item) => ({
          icon: textOrFallback(item.icon, "📘"),
          title: item.title,
          description: textOrFallback(
            item.description,
            "",
          ),
        }))
      : fallbackHeroFeatures;

  const audiences =
    content?.audiences &&
    content.audiences.length > 0
      ? content.audiences.map((item) => ({
          icon: textOrFallback(item.icon, "🎓"),
          title: item.title,
          description: textOrFallback(
            item.description,
            "",
          ),
        }))
      : fallbackAudiences;

  const benefits =
    content?.benefits &&
    content.benefits.length > 0
      ? content.benefits.map((item) => ({
          icon: textOrFallback(item.icon, "✨"),
          title: item.title,
          description: textOrFallback(
            item.description,
            "",
          ),
        }))
      : fallbackBenefits;

  return (
    <div>
      <section className="relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.35),transparent_35%),radial-gradient(circle_at_85%_30%,rgba(124,58,237,0.30),transparent_35%)]" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:py-32">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-200">
              {heroBadge}
            </div>

            <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              {heroTitle}

              <span className="block bg-gradient-to-r from-blue-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
                {heroHighlight}
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              {heroDescription}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <ActionLink
                to={heroPrimaryPath}
                className="rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-500"
              >
                {heroPrimaryLabel}
              </ActionLink>

              <ActionLink
                to={heroSecondaryPath}
                className="rounded-xl border border-white/15 bg-white/10 px-6 py-3.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/15"
              >
                {heroSecondaryLabel}
              </ActionLink>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[1.5rem] bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      {heroPanelTitle}
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      {heroPanelSubtitle}
                    </div>
                  </div>

                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-lg">
                    📊
                  </div>
                </div>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  {heroFeatures.slice(0, 4).map(
                    (item, index) => (
                      <div
                        key={`${item.title}-${index}`}
                        className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                      >
                        <div className="text-xl">
                          {item.icon}
                        </div>

                        <div className="mt-3 text-sm font-bold text-slate-800">
                          {item.title}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                <div className="mt-4 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 p-5 text-white">
                  <div className="text-xs font-semibold text-blue-100">
                    SchoolNet
                  </div>

                  <div className="mt-1 text-lg font-black">
                    {heroPanelBanner}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
            {introEyebrow}
          </div>

          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            {introTitle}
          </h2>

          <p className="mt-5 text-base leading-8 text-slate-600">
            {introDescription}
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {audiences.map((profile, index) => (
            <article
              key={`${profile.title}-${index}`}
              className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                {profile.icon}
              </div>

              <h3 className="mt-5 text-lg font-black text-slate-950">
                {profile.title}
              </h3>

              <p className="mt-3 text-sm leading-6 text-slate-600">
                {profile.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-violet-600">
              {whyEyebrow}
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              {whyTitle}
            </h2>

            <p className="mt-5 text-base leading-8 text-slate-600">
              {whyDescription}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {benefits.map((benefit, index) => (
              <div
                key={`${benefit.title}-${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="text-2xl">
                  {benefit.icon}
                </div>

                <div className="mt-4 font-black text-slate-900">
                  {benefit.title}
                </div>

                <div className="mt-2 text-sm leading-6 text-slate-600">
                  {benefit.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-7 py-12 text-white shadow-2xl sm:px-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.18em] text-blue-100">
                {ctaEyebrow}
              </div>

              <h2 className="mt-3 text-3xl font-black tracking-tight">
                {ctaTitle}
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100">
                {ctaDescription}
              </p>
            </div>

            <ActionLink
              to={ctaButtonPath}
              className="w-fit rounded-xl bg-white px-6 py-3.5 text-sm font-black text-blue-700 shadow-lg transition hover:bg-blue-50"
            >
              {ctaButtonLabel}
            </ActionLink>
          </div>
        </div>
      </section>
    </div>
  );
}