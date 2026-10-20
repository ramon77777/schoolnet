import PublicPageContent from "@/features/public/components/PublicPageContent";

export default function PublicPricing() {
  return (
    <PublicPageContent slug="tarifs">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
              {page.eyebrow?.trim() ||
                "Adhésion"}
            </div>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              {page.title?.trim() ||
                page.nav_title ||
                "Des tarifs clairs et adaptés"}
            </h1>

            <p className="mt-5 leading-8 text-slate-600">
              {page.intro?.trim() ||
                "Découvrez les différentes offres SchoolNet et leurs conditions d’adhésion."}
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="text-4xl">
              💳
            </div>

            <div className="mt-4 text-xl font-black">
              Tarification SchoolNet
            </div>

            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-500">
              {page.body?.trim() ||
                "Les formules, prix, avantages et périodes d'adhésion seront configurables depuis l'espace administrateur."}
            </p>
          </div>
        </section>
      )}
    </PublicPageContent>
  );
}