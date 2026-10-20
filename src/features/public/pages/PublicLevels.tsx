import PublicPageContent from "@/features/public/components/PublicPageContent";

export default function PublicLevels() {
  return (
    <PublicPageContent slug="niveaux">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
              {page.eyebrow?.trim() ||
                "Parcours éducatifs"}
            </div>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              {page.title?.trim() ||
                page.nav_title ||
                "Niveaux scolaires"}
            </h1>

            <p className="mt-5 leading-8 text-slate-600">
              {page.intro?.trim() ||
                "Découvrez l'ensemble des niveaux scolaires pris en charge par SchoolNet."}
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="text-4xl">
              🎓
            </div>

            <div className="mx-auto mt-4 max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-600">
              {page.body?.trim() ||
                "Les niveaux configurés apparaîtront ici."}
            </div>
          </div>
        </section>
      )}
    </PublicPageContent>
  );
}