import {
  useEffect,
  useMemo,
  useState,
} from "react";

import PublicPageContent from "@/features/public/components/PublicPageContent";

import {
  loadPublicLevels,
  type PublicLevel,
} from "@/features/public/lib/publicCms";

type LevelGroup = {
  key: string;
  title: string;
  levels: PublicLevel[];
};

function audienceIcon(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("mater")) {
    return "🧸";
  }

  if (normalized.includes("primaire")) {
    return "📘";
  }

  if (
    normalized.includes("college") ||
    normalized.includes("secondaire")
  ) {
    return "🎒";
  }

  if (normalized.includes("lycee")) {
    return "🎓";
  }

  return "🏫";
}

function groupLevels(
  levels: PublicLevel[],
): LevelGroup[] {
  const groups = new Map<
    string,
    LevelGroup
  >();

  levels.forEach((level) => {
    const title =
      level.audience?.trim() ||
      "Autres niveaux";

    const key = title.toLowerCase();

    const existing = groups.get(key);

    if (existing) {
      existing.levels.push(level);
      return;
    }

    groups.set(key, {
      key,
      title,
      levels: [level],
    });
  });

  return Array.from(groups.values());
}

export default function PublicLevels() {
  const [levels, setLevels] = useState<
    PublicLevel[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadPublicLevels()
      .then((loadedLevels) => {
        if (cancelled) return;

        setLevels(loadedLevels);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;

        console.error(
          "[PublicLevels] Impossible de charger les niveaux publics :",
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger les niveaux scolaires.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => groupLevels(levels),
    [levels],
  );

  return (
    <PublicPageContent slug="niveaux">
      {(page) => {
        const bodyText =
          page.body?.trim();

        const showBody =
          Boolean(bodyText) &&
          bodyText !==
            "Les niveaux configurés apparaîtront ici.";

        return (
          <section className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-blue-50/80 via-violet-50/40 to-transparent" />

            <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
              {/* En-tête */}
              <div className="mx-auto max-w-3xl text-center">
                <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">
                  {page.eyebrow?.trim() ||
                    "Parcours éducatifs"}
                </div>

                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                  {page.title?.trim() ||
                    page.nav_title ||
                    "Niveaux scolaires"}
                </h1>

                <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">
                  {page.intro?.trim() ||
                    "Découvrez l'ensemble des niveaux scolaires pris en charge par SchoolNet."}
                </p>

                {showBody && (
                  <p className="mx-auto mt-4 max-w-2xl whitespace-pre-line text-sm leading-7 text-slate-500">
                    {bodyText}
                  </p>
                )}

                {!loading &&
                  !error &&
                  levels.length > 0 && (
                    <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">
                      <span>🎓</span>

                      <span>
                        {levels.length} niveau
                        {levels.length > 1
                          ? "x"
                          : ""}{" "}
                        disponible
                        {levels.length > 1
                          ? "s"
                          : ""}
                      </span>
                    </div>
                  )}
              </div>

              {/* Chargement */}
              {loading && (
                <div className="mt-12 rounded-[2rem] border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
                    🎓
                  </div>

                  <div className="mt-5 text-lg font-black text-slate-900">
                    Chargement des niveaux…
                  </div>

                  <p className="mt-2 text-sm text-slate-500">
                    Les parcours scolaires
                    SchoolNet sont en cours de
                    chargement.
                  </p>
                </div>
              )}

              {/* Erreur */}
              {!loading && error && (
                <div className="mt-12 rounded-[2rem] border border-red-100 bg-red-50 p-8 text-center">
                  <div className="text-3xl">
                    ⚠️
                  </div>

                  <div className="mt-4 font-black text-red-900">
                    Impossible de charger les
                    niveaux
                  </div>

                  <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-red-700">
                    {error}
                  </p>
                </div>
              )}

              {/* Aucun niveau */}
              {!loading &&
                !error &&
                levels.length === 0 && (
                  <div className="mt-12 rounded-[2rem] border border-slate-200 bg-white p-12 text-center shadow-sm">
                    <div className="text-4xl">
                      🎓
                    </div>

                    <div className="mt-4 font-black text-slate-900">
                      Aucun niveau disponible
                    </div>

                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                      Aucun niveau scolaire
                      visible n'est actuellement
                      publié.
                    </p>
                  </div>
                )}

              {/* Groupes de niveaux */}
              {!loading &&
                !error &&
                groups.length > 0 && (
                  <div className="mt-14 space-y-10">
                    {groups.map((group) => (
                      <section
                        key={group.key}
                        className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur sm:p-7 lg:p-8"
                      >
                        {/* Titre du groupe */}
                        <div className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 text-2xl">
                              {audienceIcon(
                                group.title,
                              )}
                            </div>

                            <div>
                              <h2 className="text-xl font-black text-slate-950 sm:text-2xl">
                                {group.title}
                              </h2>

                              <p className="mt-1 text-sm text-slate-500">
                                {
                                  group.levels
                                    .length
                                }{" "}
                                niveau
                                {group.levels
                                  .length > 1
                                  ? "x"
                                  : ""}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Cartes */}
                        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {group.levels.map(
                            (level) => (
                              <article
                                key={level.id}
                                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 p-5 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-xl"
                              >
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500 opacity-0 transition group-hover:opacity-100" />

                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm ring-1 ring-slate-100">
                                    🎓
                                  </div>

                                  {level.short_label?.trim() && (
                                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-blue-700">
                                      {
                                        level.short_label
                                      }
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-5 text-lg font-black text-slate-950">
                                  {level.name}
                                </h3>

                                {level.description?.trim() && (
                                  <p className="mt-3 text-sm leading-6 text-slate-600">
                                    {
                                      level.description
                                    }
                                  </p>
                                )}

                                {!level.description?.trim() && (
                                  <p className="mt-3 text-sm leading-6 text-slate-500">
                                    Parcours scolaire
                                    disponible sur
                                    SchoolNet.
                                  </p>
                                )}
                              </article>
                            ),
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
            </div>
          </section>
        );
      }}
    </PublicPageContent>
  );
}