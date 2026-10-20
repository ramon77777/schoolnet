import PublicPageContent from "@/features/public/components/PublicPageContent";

export default function PublicAbout() {
  return (
    <PublicPageContent slug="a-propos">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
                {page.eyebrow?.trim() ||
                  "Notre vision"}
              </div>

              <h1 className="mt-3 text-4xl font-black tracking-tight">
                {page.title?.trim() ||
                  page.nav_title ||
                  "À propos de SchoolNet"}
              </h1>

              <p className="mt-5 leading-8 text-slate-600">
                {page.intro?.trim() ||
                  "SchoolNet ambitionne de simplifier le quotidien scolaire en réunissant apprentissage, communication, évaluation et suivi pédagogique dans un même environnement numérique."}
              </p>

              {page.body?.trim() && (
                <p className="mt-5 whitespace-pre-line leading-8 text-slate-600">
                  {page.body}
                </p>
              )}
            </div>

            <div className="rounded-[2rem] bg-gradient-to-br from-blue-600 to-violet-600 p-10 text-white shadow-xl">
              <div className="text-4xl">
                🚀
              </div>

              <div className="mt-5 text-2xl font-black">
                Connecter toute la communauté
                éducative.
              </div>

              <p className="mt-4 leading-7 text-blue-100">
                Élèves, enseignants, parents et
                administrateurs disposent chacun
                d'un espace adapté à leur rôle.
              </p>
            </div>
          </div>
        </section>
      )}
    </PublicPageContent>
  );
}