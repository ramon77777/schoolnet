type AttendanceFoundationItem = {
  title: string;
  description: string;
};

type AttendanceFoundationPageProps = {
  icon: string;
  eyebrow: string;
  title: string;
  description: string;
  items: AttendanceFoundationItem[];
};

export default function AttendanceFoundationPage({
  icon,
  eyebrow,
  title,
  description,
  items,
}: AttendanceFoundationPageProps) {
  return (
    <div className="space-y-6">
      <section
        className="
          overflow-hidden rounded-3xl
          border border-slate-200
          bg-gradient-to-br
          from-white via-white to-blue-50
          shadow-sm
        "
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className="
                flex h-14 w-14 shrink-0
                items-center justify-center
                rounded-2xl
                bg-blue-600
                text-2xl
                shadow-lg shadow-blue-100
              "
            >
              {icon}
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="
                  text-xs font-black uppercase
                  tracking-[0.18em] text-blue-600
                "
              >
                {eyebrow}
              </div>

              <h1
                className="
                  mt-2 text-2xl font-black
                  tracking-tight text-slate-950
                  sm:text-3xl
                "
              >
                {title}
              </h1>

              <p
                className="
                  mt-3 max-w-3xl
                  text-sm leading-7 text-slate-600
                  sm:text-base
                "
              >
                {description}
              </p>
            </div>

            <div
              className="
                inline-flex w-fit items-center gap-2
                rounded-full border border-emerald-200
                bg-emerald-50 px-3 py-1.5
                text-xs font-bold text-emerald-700
              "
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Module en préparation
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-black text-slate-950">
            Ce que cet espace permettra de faire
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Le module sera activé progressivement sans perturber
            les fonctionnalités actuelles de SchoolNet.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={item.title}
              className="
                rounded-2xl
                border border-slate-200
                bg-white p-5
                shadow-sm
                transition
                hover:-translate-y-0.5
                hover:border-blue-200
                hover:shadow-md
              "
            >
              <div
                className="
                  flex h-9 w-9 items-center justify-center
                  rounded-xl bg-blue-50
                  text-sm font-black text-blue-700
                "
              >
                {String(index + 1).padStart(2, "0")}
              </div>

              <h3 className="mt-4 font-black text-slate-900">
                {item.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}