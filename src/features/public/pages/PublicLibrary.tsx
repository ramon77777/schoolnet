import PublicPageContent from "@/features/public/components/PublicPageContent";

export default function PublicLibrary() {
  return (
    <PublicPageContent slug="bibliotheque">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-10 text-white">
            <div className="text-sm font-bold uppercase tracking-[0.18em] text-blue-100">
              {page.eyebrow?.trim() ||
                "Ressources pédagogiques"}
            </div>

            <h1 className="mt-3 text-4xl font-black">
              {page.title?.trim() ||
                page.nav_title ||
                "Bibliothèque"}
            </h1>

            <p className="mt-4 max-w-2xl leading-7 text-blue-100">
              {page.intro?.trim() ||
                "Retrouvez les livres et ressources pédagogiques publiés par l'administration de SchoolNet, organisés par niveau scolaire."}
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="text-4xl">
              📚
            </div>

            {page.body?.trim() ? (
              <p className="mx-auto mt-4 max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-600">
                {page.body}
              </p>
            ) : (
              <>
                <h2 className="mt-4 text-xl font-black">
                  Catalogue en préparation
                </h2>

                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                  Les ouvrages ajoutés par
                  l'administrateur apparaîtront ici
                  avec leurs niveaux, catégories et
                  informations de consultation.
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </PublicPageContent>
  );
}