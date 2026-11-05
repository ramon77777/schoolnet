// src/layouts/AuthLayout.tsx
// Habillage commun des pages de connexion et de recuperation.
import { Link, Outlet, useLocation } from "react-router-dom";
import schoolnetLogo from "@/assets/branding/schoolnet-logo.png";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/auth/forgot-password": {
    title: "Premier accès / Mot de passe oublie",
    description: "Recevez un lien sécurisé sur l'adresse e-mail de votre compte.",
  },
  "/auth/reset-password": {
    title: "Choisir mon mot de passe",
    description: "Définissez votre mot de passe personnel pour accéder a SCHOOLNET.",
  },
};

export default function AuthLayout() {
  const { pathname } = useLocation();
  const page = pageTitles[pathname] ?? {
    title: "Connexion",
    description: "Connectez-vous pour accéder a votre espace scolaire.",
  };

  return (
    <div className="min-h-screen w-full bg-gray-50">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-200 opacity-60 blur-3xl" />
        <div className="absolute -right-24 top-32 h-72 w-72 rounded-full bg-indigo-200 opacity-60 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 bg-cyan-200 opacity-40 blur-3xl" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100">
          <div className="grid md:grid-cols-2">
            <div className="relative hidden p-10 md:block">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500" />
              <div className="relative z-10 text-white">
                <img
                  src={schoolnetLogo}
                  alt="SchoolNet"
                  className="mb-6 h-24 w-auto rounded-2xl bg-white p-2 object-contain shadow-sm"
                />
                <div className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-1 text-sm">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  Plateforme E-learning
                </div>
                <p className="mt-3 text-white/90">
                  Une expérience simple, moderne et efficace pour{" "}
                  <span className="font-semibold">Maternelle - Secondaire</span>.
                </p>
                <div className="mt-8 space-y-3">
                  <Feature text="Cours, ressources, devoirs, quiz et examens" />
                  <Feature text="Suivi apprenant et acces Parent / Tuteur" />
                  <Feature text="Tableaux de bord Enseignant et Admin" />
                </div>
                <div className="mt-10 rounded-2xl bg-white/15 p-4 text-sm leading-6 text-white/90">
                  Votre compte est personnel. Ne partagez jamais votre mot de passe.
                  Si vous n'avez pas de compte, utilisez la demande d'inscription.
                </div>
              </div>
            </div>
            <div className="p-8 md:p-10">
              <div className="mb-6">
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-blue-600"
                >
                  <span aria-hidden="true">&larr;</span>
                  Retour à l'accueil
                </Link>
              </div>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">{page.title}</h1>
                <p className="mt-1 text-sm leading-6 text-gray-500">{page.description}</p>
              </div>
              <Outlet />
              <div className="mt-8 text-xs text-gray-400">
                &copy; {new Date().getFullYear()} SchoolNet. Tous droits réservés.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
      <div className="text-sm text-white/90">{text}</div>
    </div>
  );
}
