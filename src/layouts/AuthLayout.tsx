import { Outlet } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="min-h-screen w-full bg-gray-50">
      {/* fond premium */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-200 blur-3xl opacity-60" />
        <div className="absolute top-32 -right-24 h-72 w-72 rounded-full bg-indigo-200 blur-3xl opacity-60" />
        <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-200 blur-3xl opacity-40" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-gray-100">
          <div className="grid md:grid-cols-2">
            {/* Colonne gauche : branding */}
            <div className="relative hidden md:block p-10">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-cyan-500" />

              <div className="relative z-10 text-white">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-1 text-sm">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  Plateforme E-learning
                </div>

                <h1 className="mt-6 text-4xl font-bold leading-tight">
                  Schoolnet
                </h1>
                <p className="mt-3 text-white/90">
                  Une expérience simple, moderne et efficace pour{" "}
                  <span className="font-semibold">Maternelle → Secondaire</span>.
                </p>

                <div className="mt-8 space-y-3">
                  <Feature text="Cours, ressources, devoirs, quiz et examens" />
                  <Feature text="Suivi apprenant + accès Parent/Tuteur" />
                  <Feature text="Tableaux de bord Enseignant & Admin" />
                </div>

                <div className="mt-10 rounded-2xl bg-white/15 p-4 text-sm text-white/90">
                  Astuce : commence en mode démo, puis on branchera l’auth réelle.
                </div>
              </div>
            </div>

            {/* Colonne droite : formulaire */}
            <div className="p-8 md:p-10">
              <div className="mb-8">
                <div className="text-2xl font-bold text-gray-900">
                  Connexion
                </div>
                <div className="mt-1 text-sm text-gray-500">
                  Connectez-vous pour accéder à votre espace.
                </div>
              </div>

              <Outlet />

              <div className="mt-8 text-xs text-gray-400">
                © {new Date().getFullYear()} Schoolnet. Tous droits réservés.
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
      <div className="mt-1 h-5 w-5 rounded-full bg-white/25 flex items-center justify-center">
        <div className="h-2 w-2 rounded-full bg-white" />
      </div>
      <div className="text-sm text-white/90">{text}</div>
    </div>
  );
}
