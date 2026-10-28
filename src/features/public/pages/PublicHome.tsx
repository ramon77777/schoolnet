import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Link } from "react-router-dom";
import schoolnetHeroImage from "@/assets/public/home/schoolnet-hero.png";
import schoolnetLibraryImage from "@/assets/public/home/schoolnet-library.png";
import schoolnetFamilyImage from "@/assets/public/home/schoolnet-family.png";

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

type AudienceDetail = {
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
};

const audienceDetails: AudienceDetail[] = [
  {
    eyebrow: "Espace Apprenant",
    title: "Apprendre, s'évaluer et suivre sa progression",
    description:
      "L'apprenant retrouve dans un même espace les outils nécessaires à son parcours scolaire et peut suivre son évolution au fil des activités.",
    features: [
      "Consulter ses cours et ressources pédagogiques",
      "Participer aux quiz et évaluations",
      "Consulter et réaliser ses devoirs",
      "Accéder aux examens disponibles",
      "Consulter ses moyennes et ses résultats",
      "Suivre sa progression scolaire",
      "Échanger grâce à la messagerie",
      "Suivre les informations publiées dans l'espace de classe",
    ],
  },
  {
    eyebrow: "Espace Enseignant",
    title: "Organiser l'enseignement et accompagner les apprenants",
    description:
      "L'enseignant dispose des outils nécessaires pour organiser ses classes, proposer des activités pédagogiques et suivre le travail de ses apprenants.",
    features: [
      "Gérer ses cours et contenus pédagogiques",
      "Consulter et organiser ses classes",
      "Créer et gérer des évaluations",
      "Suivre les travaux soumis par les apprenants",
      "Corriger les évaluations et publier les résultats",
      "Gérer et consulter les moyennes",
      "Communiquer grâce à la messagerie",
      "Publier et consulter les informations de l'espace de classe",
    ],
  },
  {
    eyebrow: "Espace Parent / Tuteur",
    title: "Suivre la scolarité et rester connecté à l'établissement",
    description:
      "Le parent ou tuteur bénéficie d'une vision claire de la situation scolaire de ses enfants et peut suivre les informations importantes de leur parcours.",
    features: [
      "Consulter les enfants associés au compte",
      "Suivre les échéances scolaires",
      "Consulter les résultats obtenus",
      "Consulter les moyennes",
      "Suivre l'évolution scolaire des enfants",
      "Échanger grâce à la messagerie",
      "Consulter les informations de l'espace de classe",
    ],
  },
  {
    eyebrow: "Espace Administration",
    title: "Piloter et administrer l'ensemble de SchoolNet",
    description:
      "L'administration dispose des outils de pilotage nécessaires pour organiser les utilisateurs, les classes, les contenus et le fonctionnement général de SchoolNet.",
    features: [
      "Gérer les utilisateurs et leurs rôles",
      "Gérer les classes",
      "Gérer les années scolaires",
      "Administrer les moyennes",
      "Utiliser la messagerie",
      "Administrer l'espace de classe",
      "Gérer les contenus pédagogiques",
      "Administrer le site public SchoolNet",
      "Configurer les paramètres de la plateforme",
    ],
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

  const [selectedAudienceIndex, setSelectedAudienceIndex] =
    useState<number | null>(null);

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

  const heroImageUrl =
    settings?.hero_image_url?.trim() || "";

  const heroImageAlt = textOrFallback(
    settings?.hero_image_alt,
    "Élèves utilisant SchoolNet dans un environnement éducatif numérique",
  );

  const heroImage =
    heroImageUrl || schoolnetHeroImage;


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
      <section className="relative isolate overflow-hidden bg-[#06132f] text-white">
        {/* Fond SchoolNet */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_22%,rgba(37,99,235,0.55),transparent_33%),radial-gradient(circle_at_92%_22%,rgba(124,58,237,0.40),transparent_38%)]" />

        {/* Illustration principale desktop */}
        <div className="absolute inset-y-0 right-0 hidden w-[64%] lg:block">
          <img
            src={heroImage}
            alt={heroImageAlt}
            className="h-full w-full object-cover object-[62%_center]"
          />

          {/* Fusion progressive vers le fond bleu gauche */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#06132f] via-[#06132f]/35 to-transparent" />

          {/* Assombrissement léger pour garder le contraste */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#06132f]/60 via-transparent to-[#06132f]/10" />
        </div>

        {/* Contenu principal */}
        <div className="relative mx-auto min-h-[720px] max-w-[1680px] px-6 pb-40 pt-24 sm:px-8 lg:px-12 xl:px-16">
          <div className="flex min-h-[500px] items-center">
            <div className="relative z-10 w-full lg:max-w-[47%]">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur-md">
                {heroBadge}
              </div>

              <h1 className="mt-7 max-w-[760px] text-5xl font-black leading-[0.97] tracking-[-0.045em] text-white sm:text-6xl lg:text-[72px] xl:text-[82px]">
                {heroTitle}

                <span className="mt-1 block bg-gradient-to-r from-[#3b9cff] via-[#53c8ff] to-[#a778ff] bg-clip-text text-transparent">
                  {heroHighlight}
                </span>
              </h1>

              <p className="mt-7 max-w-[660px] text-base leading-8 text-slate-200 sm:text-lg">
                {heroDescription}
              </p>

              <div className="mt-9 flex flex-wrap gap-4">
                <ActionLink
                  to={heroPrimaryPath}
                  className="inline-flex items-center gap-3 rounded-2xl bg-blue-600 px-7 py-4 text-sm font-black text-white shadow-2xl shadow-blue-600/30 transition duration-300 hover:-translate-y-1 hover:bg-blue-500"
                >
                  <span className="text-base">📖</span>
                  {heroPrimaryLabel}
                  <span aria-hidden="true">→</span>
                </ActionLink>

                <ActionLink
                  to={heroSecondaryPath}
                  className="inline-flex items-center gap-3 rounded-2xl border border-white/30 bg-white/5 px-7 py-4 text-sm font-black text-white backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:bg-white/10"
                >
                  <span className="text-base">👤</span>
                  {heroSecondaryLabel}
                </ActionLink>
              </div>

              {/* Fonctions principales */}
              <div className="mt-11 grid max-w-[720px] grid-cols-2 gap-y-5 sm:grid-cols-4">
                {heroFeatures.slice(0, 4).map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className="flex items-center gap-3 border-white/15 pr-4 sm:border-r sm:pl-4 sm:first:pl-0 sm:last:border-r-0"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl shadow-lg backdrop-blur-md">
                      {item.icon}
                    </div>

                    <div className="text-xs font-bold leading-5 text-white">
                      {item.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Version mobile/tablette de l'illustration */}
        <div className="relative mx-auto -mt-28 block max-w-4xl px-5 pb-36 sm:px-8 lg:hidden">
          <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-white/5 p-2 shadow-2xl">
            <img
              src={heroImage}
              alt={heroImageAlt}
              className="aspect-[16/10] w-full rounded-[1.6rem] object-cover object-center"
            />
          </div>
        </div>

        {/* Bandeau inférieur */}
        <div className="absolute inset-x-0 bottom-0 z-30">
          <div className="mx-auto max-w-[1680px] px-6 sm:px-8 lg:px-12 xl:px-16">
            <div className="grid overflow-hidden rounded-t-[2rem] bg-white shadow-[0_-10px_40px_rgba(15,23,42,0.18)] sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-6 text-slate-900 sm:border-r lg:border-b-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                  🎓
                </div>

                <div>
                  <div className="text-sm font-black">
                    Pour tous les niveaux
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Maternelle · Primaire · Secondaire
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-6 text-slate-900 lg:border-b-0 lg:border-r">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                  📱
                </div>

                <div>
                  <div className="text-sm font-black">
                    Accessible partout
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Ordinateur · Tablette · Mobile
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-6 text-slate-900 sm:border-r sm:border-b-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                  🛡️
                </div>

                <div>
                  <div className="text-sm font-black">
                    Données sécurisées
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Accès protégés et données maîtrisées
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 px-6 py-6 text-slate-900">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
                  👥
                </div>

                <div>
                  <div className="text-sm font-black">
                    Une communauté éducative
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Élèves · Enseignants · Parents · Administration
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-slate-50 py-24">
        {/* Décoration de fond */}
        <div className="pointer-events-none absolute -left-32 top-24 h-80 w-80 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-20 h-80 w-80 rounded-full bg-violet-100/60 blur-3xl" />

        <div className="relative mx-auto max-w-[1680px] px-6 sm:px-8 lg:px-12 xl:px-16">
          {/* Bloc présentation */}
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] xl:gap-20">
            {/* Texte */}
            <div className="max-w-2xl">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
                {introEyebrow}
              </div>

              <h2 className="mt-5 text-4xl font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl lg:text-[3.5rem]">
                {introTitle}
              </h2>

              <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                {introDescription}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <ActionLink
                  to="/bibliotheque"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-500 sm:w-auto"
                >
                  <span>📚</span>
                  Découvrir la bibliothèque
                  <span aria-hidden="true">→</span>
                </ActionLink>

                <ActionLink
                  to="/niveaux"
                  className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 sm:w-auto"
                >
                  Voir les niveaux
                </ActionLink>
              </div>

              {/* Mini indicateurs */}
              <div className="mt-10 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-2xl">📖</div>
                  <div className="mt-3 text-sm font-black text-slate-900">
                    Ressources
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Cours et supports pédagogiques.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-2xl">🎯</div>
                  <div className="mt-3 text-sm font-black text-slate-900">
                    Apprentissage
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Un parcours adapté à chaque niveau.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-2xl">📈</div>
                  <div className="mt-3 text-sm font-black text-slate-900">
                    Progression
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Un suivi clair et centralisé.
                  </div>
                </div>
              </div>
            </div>

            {/* Illustration bibliothèque */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-blue-200/40 via-transparent to-violet-200/50 blur-2xl" />

              <div className="relative overflow-hidden rounded-[2.5rem] border border-white bg-white p-2 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
                <img
                  src={schoolnetLibraryImage}
                  alt="Élèves utilisant la bibliothèque numérique SchoolNet"
                  className="aspect-[16/10] w-full rounded-[2rem] object-cover"
                />
              </div>

              {/* Carte flottante */}
              <div className="absolute bottom-5 left-5 hidden rounded-2xl border border-white/80 bg-white/95 px-5 py-4 shadow-xl backdrop-blur sm:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">
                    📚
                  </div>

                  <div>
                    <div className="text-sm font-black text-slate-950">
                      Bibliothèque SchoolNet
                    </div>

                    <div className="mt-1 text-xs text-slate-500">
                      Ressources accessibles à tout moment
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute right-5 top-5 hidden rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-xl backdrop-blur md:block">
                <div className="text-xs font-black text-blue-600">
                  ✓ Apprendre autrement
                </div>
              </div>
            </div>
          </div>

          {/* Profils utilisateurs */}
          <div className="mt-28">
            <div className="mx-auto max-w-3xl text-center">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-violet-600">
                Pour toute la communauté éducative
              </div>

              <h3 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Un espace adapté à chaque utilisateur
              </h3>

              <p className="mt-4 text-base leading-7 text-slate-600">
                SchoolNet propose à chacun les outils utiles à son rôle,
                dans une expérience simple, cohérente et sécurisée.
              </p>
            </div>

            <div className="mt-10 grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {audiences.map((profile, index) => {
                const detail =
                  audienceDetails[index] ?? {
                    eyebrow: "Espace SchoolNet",
                    title: profile.title,
                    description: profile.description,
                    features: [
                      "Accéder aux fonctionnalités adaptées à ce profil",
                      "Retrouver les informations utiles dans un espace sécurisé",
                    ],
                  };

                const isOpen =
                  selectedAudienceIndex === index;

                return (
                  <article
                    key={`${profile.title}-${index}`}
                    className={`
                      group relative overflow-hidden
                      rounded-[1.75rem]
                      border bg-white p-6
                      transition duration-300
                      ${
                        isOpen
                          ? "border-blue-300 shadow-xl"
                          : "border-slate-200 shadow-sm hover:-translate-y-2 hover:border-blue-200 hover:shadow-xl"
                      }
                    `}
                  >
                    <div
                      className={`
                        absolute inset-x-0 top-0 h-1
                        bg-gradient-to-r
                        from-blue-500 via-indigo-500 to-violet-500
                        transition
                        ${
                          isOpen
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        }
                      `}
                    />

                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl transition group-hover:scale-110">
                      {profile.icon}
                    </div>

                    <h3 className="mt-5 text-lg font-black text-slate-950">
                      {profile.title}
                    </h3>

                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {profile.description}
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAudienceIndex(
                          isOpen ? null : index,
                        );
                      }}
                      aria-expanded={isOpen}
                      aria-controls={`audience-details-${index}`}
                      className="
                        mt-5 inline-flex items-center gap-2
                        rounded-xl
                        text-xs font-black text-blue-600
                        transition
                        hover:gap-3 hover:text-blue-700
                        focus:outline-none
                        focus-visible:ring-2
                        focus-visible:ring-blue-500
                        focus-visible:ring-offset-2
                      "
                    >
                      {isOpen ? "Réduire" : "Découvrir"}

                      <span
                        aria-hidden="true"
                        className={`
                          transition-transform duration-300
                          ${isOpen ? "rotate-90" : ""}
                        `}
                      >
                        →
                      </span>
                    </button>

                    {isOpen && (
                      <div
                        id={`audience-details-${index}`}
                        className="
                          mt-6
                          border-t border-slate-100
                          pt-6
                          animate-in fade-in
                        "
                      >
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-600">
                          {detail.eyebrow}
                        </div>

                        <h4 className="mt-3 text-base font-black leading-6 text-slate-950">
                          {detail.title}
                        </h4>

                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          {detail.description}
                        </p>

                        <div className="mt-5 space-y-3">
                          {detail.features.map(
                            (feature, featureIndex) => (
                              <div
                                key={`${feature}-${featureIndex}`}
                                className="flex items-start gap-3"
                              >
                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[10px] font-black text-emerald-600">
                                  ✓
                                </div>

                                <div className="text-xs leading-5 text-slate-600">
                                  {feature}
                                </div>
                              </div>
                            ),
                          )}
                        </div>

                        <ActionLink
                          to="/auth/login"
                          className="
                            mt-6 inline-flex w-full
                            items-center justify-center gap-2
                            rounded-xl bg-slate-950
                            px-4 py-3
                            text-xs font-black text-white
                            transition
                            hover:-translate-y-0.5
                            hover:bg-blue-600
                          "
                        >
                          <span>👤</span>
                          Accéder à mon espace
                          <span aria-hidden="true">→</span>
                        </ActionLink>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white py-24">
        {/* Décoration */}
        <div className="pointer-events-none absolute -left-40 bottom-0 h-96 w-96 rounded-full bg-violet-100/50 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 top-10 h-96 w-96 rounded-full bg-blue-100/50 blur-3xl" />

        <div className="relative mx-auto max-w-[1680px] px-6 sm:px-8 lg:px-12 xl:px-16">
          <div className="grid items-center gap-14 lg:grid-cols-[1.08fr_.92fr] xl:gap-20">
            {/* Illustration famille */}
            <div className="relative order-2 lg:order-1">
              <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-violet-200/40 via-transparent to-blue-200/50 blur-2xl" />

              <div className="relative overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white p-2 shadow-[0_30px_80px_rgba(15,23,42,0.16)]">
                <img
                  src={schoolnetFamilyImage}
                  alt="Parent, élève et communauté éducative utilisant SchoolNet pour le suivi scolaire"
                  className="aspect-[16/10] w-full rounded-[2rem] object-cover"
                />
              </div>

              {/* Carte flottante suivi familial */}
              <div className="absolute bottom-5 right-5 hidden max-w-[260px] rounded-2xl border border-white/80 bg-white/95 p-5 shadow-xl backdrop-blur sm:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-xl">
                    👨‍👩‍👧
                  </div>

                  <div>
                    <div className="text-sm font-black text-slate-950">
                      Suivi familial
                    </div>

                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Parents et école restent connectés.
                    </div>
                  </div>
                </div>
              </div>

              {/* Carte flottante progression */}
              <div className="absolute left-5 top-5 hidden rounded-2xl border border-white/80 bg-white/95 px-5 py-4 shadow-xl backdrop-blur md:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                    📈
                  </div>

                  <div>
                    <div className="text-xs font-black text-slate-950">
                      Progression visible
                    </div>

                    <div className="mt-1 text-[11px] text-slate-500">
                      Un suivi clair des résultats
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Texte */}
            <div className="order-1 lg:order-2">
              <div className="text-sm font-black uppercase tracking-[0.18em] text-violet-600">
                {whyEyebrow}
              </div>

              <h2 className="mt-5 max-w-2xl text-4xl font-black leading-tight tracking-[-0.03em] text-slate-950 sm:text-5xl lg:text-[3.5rem]">
                {whyTitle}
              </h2>

              <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">
                {whyDescription}
              </p>

              <div className="mt-9 grid gap-4 sm:grid-cols-2">
                {benefits.map((benefit, index) => (
                  <article
                    key={`${benefit.title}-${index}`}
                    className="group rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 transition duration-300 hover:-translate-y-1 hover:border-violet-200 hover:bg-white hover:shadow-lg"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm transition group-hover:scale-110">
                        {benefit.icon}
                      </div>

                      <div>
                        <div className="font-black text-slate-950">
                          {benefit.title}
                        </div>

                        <div className="mt-2 text-sm leading-6 text-slate-600">
                          {benefit.description}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-9">
                <ActionLink
                  to="/a-propos"
                  className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:text-violet-700 hover:shadow-md"
                >
                  En savoir plus sur SchoolNet
                  <span aria-hidden="true">→</span>
                </ActionLink>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-slate-50 py-24">
        <div className="mx-auto max-w-[1680px] px-6 sm:px-8 lg:px-12 xl:px-16">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-[#071735] px-7 py-12 text-white shadow-[0_30px_80px_rgba(15,23,42,0.20)] sm:px-12 lg:px-16 lg:py-16">
            {/* Décor */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_30%,rgba(37,99,235,0.50),transparent_35%),radial-gradient(circle_at_90%_20%,rgba(124,58,237,0.45),transparent_35%)]" />

            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-white/10" />

            <div className="pointer-events-none absolute -bottom-28 right-20 h-80 w-80 rounded-full border border-white/10" />

            <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur">
                  ✨ {ctaEyebrow}
                </div>

                <h2 className="mt-6 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                  {ctaTitle}
                </h2>

                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
                  {ctaDescription}
                </p>

                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                      ✓
                    </span>
                    Accès sécurisé
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-400/15 text-blue-300">
                      ✓
                    </span>
                    Tous vos outils au même endroit
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-400/15 text-violet-300">
                      ✓
                    </span>
                    Accessible sur tous vos appareils
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-4 lg:items-end">
                <ActionLink
                  to={ctaButtonPath}
                  className="inline-flex items-center gap-3 rounded-2xl bg-white px-7 py-4 text-sm font-black text-blue-700 shadow-2xl transition duration-300 hover:-translate-y-1 hover:bg-blue-50"
                >
                  <span>👤</span>
                  {ctaButtonLabel}
                  <span aria-hidden="true">→</span>
                </ActionLink>

                <div className="text-xs text-slate-400">
                  Apprenants · Enseignants · Parents · Administration
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}