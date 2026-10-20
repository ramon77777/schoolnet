import PublicPageContent from "@/features/public/components/PublicPageContent";

export default function PublicContact() {
  return (
    <PublicPageContent slug="contact">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
              {page.eyebrow?.trim() ||
                "Nous contacter"}
            </div>

            <h1 className="mt-3 text-4xl font-black tracking-tight">
              {page.title?.trim() ||
                page.nav_title ||
                "Contact"}
            </h1>

            <p className="mt-5 leading-8 text-slate-600">
              {page.intro?.trim() ||
                "Besoin d'informations sur SchoolNet, l'adhésion ou le fonctionnement de la plateforme ?"}
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-3xl">
              ✉️
            </div>

            <div className="mt-4 text-lg font-black">
              Coordonnées de l'établissement
            </div>

            <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-500">
              {page.body?.trim() ||
                "Adresse, téléphone, e-mail et autres informations de contact seront alimentés automatiquement depuis les paramètres SchoolNet."}
            </p>
          </div>
        </section>
      )}
    </PublicPageContent>
  );
}