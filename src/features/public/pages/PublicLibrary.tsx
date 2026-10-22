import {
  useEffect,
  useMemo,
  useState,
} from "react";

import PublicPageContent from "@/features/public/components/PublicPageContent";

import {
  loadPublicLibraryContent,
  type PublicLevel,
  type PublicLibraryItem,
  type PublicSubject,
} from "@/features/public/lib/publicCms";

/* ============================================================
   IMAGES AUTOMATIQUES DE SECOURS
   ------------------------------------------------------------
   cover_url défini par l'administrateur reste toujours prioritaire.
   Ces images ne sont utilisées que lorsqu'aucune couverture
   personnalisée n'a été renseignée.
   ============================================================ */

const LIBRARY_IMAGES = {
  mathematics:
    "https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&w=1200&q=85",

  french:
    "https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=1200&q=85",

  science:
    "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=85",

  methodology:
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=85",

  reading:
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=85",

  students:
    "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85",

  classroom:
    "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=85",

  default:
    "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1200&q=85",
};

function resourceTypeLabel(type: string) {
  switch (type) {
    case "exercise":
      return "Exercice";

    case "guide":
      return "Guide";

    case "video":
      return "Vidéo";

    case "book":
      return "Livre";

    case "course":
      return "Cours";

    case "worksheet":
      return "Fiche";

    default:
      return "Document";
  }
}

function resourceTypeIcon(type: string) {
  switch (type) {
    case "exercise":
      return "✏️";

    case "guide":
      return "🧭";

    case "video":
      return "▶️";

    case "book":
      return "📖";

    case "course":
      return "🎓";

    case "worksheet":
      return "📄";

    default:
      return "📚";
  }
}

function normalizeText(value?: string | null) {
  return (
    value
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() ?? ""
  );
}

function getAutomaticImage(
  item: PublicLibraryItem,
) {
  /*
   * 1. L'image choisie par l'administrateur est toujours prioritaire.
   */
  const adminCover = item.cover_url?.trim();

  if (adminCover) {
    return adminCover;
  }

  /*
   * 2. Sinon SchoolNet détermine automatiquement
   *    une illustration en fonction du contenu.
   */
  const subject = normalizeText(item.subject);
  const title = normalizeText(item.title);
  const type = normalizeText(item.resource_type);

  const text = `${subject} ${title} ${type}`;

  if (
    text.includes("math") ||
    text.includes("calcul") ||
    text.includes("geometr")
  ) {
    return LIBRARY_IMAGES.mathematics;
  }

  if (
    text.includes("francais") ||
    text.includes("grammaire") ||
    text.includes("orthographe") ||
    text.includes("lecture") ||
    text.includes("texte")
  ) {
    return LIBRARY_IMAGES.french;
  }

  if (
    text.includes("science") ||
    text.includes("svt") ||
    text.includes("physique") ||
    text.includes("chimie") ||
    text.includes("vivant")
  ) {
    return LIBRARY_IMAGES.science;
  }

  if (
    text.includes("method") ||
    text.includes("organisation") ||
    text.includes("travail scolaire")
  ) {
    return LIBRARY_IMAGES.methodology;
  }

  if (
    type === "book" ||
    text.includes("livre")
  ) {
    return LIBRARY_IMAGES.reading;
  }

  if (
    type === "exercise" ||
    text.includes("exercice")
  ) {
    return LIBRARY_IMAGES.classroom;
  }

  if (
    item.level?.audience
      ?.toLowerCase()
      .includes("primaire")
  ) {
    return LIBRARY_IMAGES.reading;
  }

  if (
    item.level?.audience
      ?.toLowerCase()
      .includes("college")
  ) {
    return LIBRARY_IMAGES.students;
  }

  if (
    item.level?.audience
      ?.toLowerCase()
      .includes("lycee")
  ) {
    return LIBRARY_IMAGES.classroom;
  }

  return LIBRARY_IMAGES.default;
}

function getSubjectIcon(
  subject?: string | null,
) {
  const normalized = normalizeText(subject);

  if (normalized.includes("math")) {
    return "➗";
  }

  if (
    normalized.includes("francais") ||
    normalized.includes("lecture")
  ) {
    return "📖";
  }

  if (
    normalized.includes("science") ||
    normalized.includes("svt")
  ) {
    return "🔬";
  }

  if (
    normalized.includes("method")
  ) {
    return "🧠";
  }

  return "📚";
}

export default function PublicLibrary() {
  const [items, setItems] =
    useState<PublicLibraryItem[]>([]);

  const [levels, setLevels] =
    useState<PublicLevel[]>([]);

  const [subjects, setSubjects] =
    useState<PublicSubject[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] =
    useState("all");

  const [selectedSubject, setSelectedSubject] =
    useState("all");

  const [search, setSearch] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const content =
          await loadPublicLibraryContent();

        if (!cancelled) {
          setItems(content.items);
          setLevels(content.levels);
          setSubjects(content.subjects);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Impossible de charger la bibliothèque.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const featuredCount = useMemo(
    () =>
      items.filter(
        (item) => item.is_featured,
      ).length,
    [items],
  );


  const filteredItems = useMemo(() => {
    const normalizedSearch =
      normalizeText(search);

    return items.filter((item) => {
      if (
        selectedLevel !== "all" &&
        item.level_id !== selectedLevel
      ) {
        return false;
      }

      if (
        selectedSubject !== "all" &&
        item.subject_id !== selectedSubject
      ) {
        return false;
      }

      if (normalizedSearch) {
        const searchable = normalizeText(
          [
            item.title,
            item.description,
            item.subject,
            item.author,
            item.level?.name,
            item.level?.short_label,
          ]
            .filter(Boolean)
            .join(" "),
        );

        if (
          !searchable.includes(
            normalizedSearch,
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    items,
    search,
    selectedLevel,
    selectedSubject,
  ]);

  const hasFilters =
    search.trim().length > 0 ||
    selectedLevel !== "all" ||
    selectedSubject !== "all";

  function resetFilters() {
    setSearch("");
    setSelectedLevel("all");
    setSelectedSubject("all");
  }

  return (
    <PublicPageContent slug="bibliotheque">
      {(page) => (
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          {/* ==================================================
              HERO
              ================================================== */}

          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white shadow-xl">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
            <div className="absolute -bottom-36 right-40 h-80 w-80 rounded-full bg-white/5" />

            <div className="relative z-10 grid gap-8 p-8 sm:p-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:p-12">
              <div>
                <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-100 backdrop-blur">
                  📚{" "}
                  {page.eyebrow?.trim() ||
                    "Ressources pédagogiques SchoolNet"}
                </div>

                <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                  {page.title?.trim() ||
                    page.nav_title ||
                    "Bibliothèque"}
                </h1>

                <p className="mt-5 max-w-2xl text-base leading-8 text-blue-100 sm:text-lg">
                  {page.intro?.trim() ||
                    "Explorez les ressources pédagogiques proposées pour accompagner les élèves dans leur apprentissage."}
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur-sm">
                    <div className="text-2xl font-black">
                      {loading
                        ? "…"
                        : items.length}
                    </div>

                    <div className="mt-1 text-xs text-blue-100">
                      ressources disponibles
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur-sm">
                    <div className="text-2xl font-black">
                      {loading
                        ? "…"
                        : featuredCount}
                    </div>

                    <div className="mt-1 text-xs text-blue-100">
                      mises en avant
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 backdrop-blur-sm">
                    <div className="text-2xl font-black">
                      {loading
                        ? "…"
                        : levels.length}
                    </div>

                    <div className="mt-1 text-xs text-blue-100">
                      niveaux représentés
                    </div>
                  </div>
                </div>
              </div>

              {/* Illustration hero */}

              <div className="hidden lg:block">
                <div className="relative mx-auto max-w-md">
                  <div className="absolute -inset-4 rounded-[2rem] bg-white/10 blur-xl" />

                  <img
                    src={
                      LIBRARY_IMAGES.students
                    }
                    alt="Élèves utilisant des ressources pédagogiques"
                    className="relative h-72 w-full rounded-[2rem] border border-white/20 object-cover shadow-2xl"
                  />

                  <div className="absolute -bottom-5 -left-5 rounded-2xl border border-white/20 bg-white/95 px-5 py-4 text-slate-900 shadow-xl">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      SchoolNet
                    </div>

                    <div className="mt-1 font-black">
                      Apprendre autrement
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================
              TEXTE PRINCIPAL
              ================================================== */}

          {page.body?.trim() && (
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
              <p className="whitespace-pre-line text-sm leading-7 text-slate-600">
                {page.body}
              </p>
            </div>
          )}

          {/* ==================================================
              RECHERCHE / FILTRES
              ================================================== */}

          {!loading &&
            !error &&
            items.length > 0 && (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div className="flex-1">
                    <div className="text-lg font-black text-slate-900">
                      Trouver une ressource
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      Recherchez par titre,
                      matière ou niveau scolaire.
                    </p>
                  </div>

                  <div className="grid flex-[2] gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-500">
                        Recherche
                      </label>

                      <input
                        value={search}
                        onChange={(event) =>
                          setSearch(
                            event.target.value,
                          )
                        }
                        placeholder="Mathématiques, lecture..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-500">
                        Niveau
                      </label>

                      <select
                        value={
                          selectedLevel
                        }
                        onChange={(event) =>
                          setSelectedLevel(
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">
                          Tous les niveaux
                        </option>

                        {levels.map(
                          (level) => (
                            <option
                              key={level.id}
                              value={level.id}
                            >
                              {level.short_label ||
                                level.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-500">
                        Matière
                      </label>

                      <select
                        value={
                          selectedSubject
                        }
                        onChange={(event) =>
                          setSelectedSubject(
                            event.target.value,
                          )
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="all">
                          Toutes les matières
                        </option>

                        {subjects.map(
                          (subject) => (
                            <option
                              key={subject.id}
                              value={subject.id}
                            >
                              {subject.name}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="text-sm text-slate-500">
                    <strong className="text-slate-900">
                      {
                        filteredItems.length
                      }
                    </strong>{" "}
                    ressource
                    {filteredItems.length >
                    1
                      ? "s"
                      : ""}{" "}
                    affichée
                    {filteredItems.length >
                    1
                      ? "s"
                      : ""}
                  </div>

                  {hasFilters && (
                    <button
                      type="button"
                      onClick={
                        resetFilters
                      }
                      className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      Réinitialiser les
                      filtres
                    </button>
                  )}
                </div>
              </div>
            )}

          {/* ==================================================
              ERREUR
              ================================================== */}

          {error && (
            <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              <div className="font-bold">
                Impossible de charger la
                bibliothèque
              </div>

              <div className="mt-1">
                {error}
              </div>
            </div>
          )}

          {/* ==================================================
              CHARGEMENT
              ================================================== */}

          {loading && (
            <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />

              <div className="mt-4 text-sm font-medium text-slate-500">
                Chargement de la
                bibliothèque…
              </div>
            </div>
          )}

          {/* ==================================================
              AUCUNE RESSOURCE
              ================================================== */}

          {!loading &&
            !error &&
            items.length === 0 && (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <div className="text-5xl">
                  📚
                </div>

                <h2 className="mt-5 text-2xl font-black text-slate-900">
                  Aucune ressource publiée
                </h2>

                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                  Les ressources ajoutées
                  par l’administrateur
                  apparaîtront ici.
                </p>
              </div>
            )}

          {/* ==================================================
              AUCUN RESULTAT DE FILTRE
              ================================================== */}

          {!loading &&
            !error &&
            items.length > 0 &&
            filteredItems.length === 0 && (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <div className="text-5xl">
                  🔎
                </div>

                <h2 className="mt-5 text-xl font-black text-slate-900">
                  Aucun résultat
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Aucune ressource ne
                  correspond aux critères
                  sélectionnés.
                </p>

                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Voir toutes les ressources
                </button>
              </div>
            )}

          {/* ==================================================
              CARTES BIBLIOTHEQUE
              ================================================== */}

          {!loading &&
            !error &&
            filteredItems.length >
              0 && (
              <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map(
                  (item) => {
                    const resourceUrl =
                      item.file_url?.trim() ||
                      item.external_url?.trim() ||
                      "";

                    const coverImage =
                      getAutomaticImage(
                        item,
                      );

                    return (
                      <article
                        key={item.id}
                        className={[
                          "group flex h-full flex-col overflow-hidden rounded-[1.75rem] border bg-white shadow-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-xl",
                          item.is_featured
                            ? "border-blue-200 ring-1 ring-blue-100"
                            : "border-slate-200",
                        ].join(" ")}
                      >
                        {/* Image */}

                        <div className="relative h-56 overflow-hidden bg-slate-100">
                          <img
                            src={coverImage}
                            alt={
                              item.title
                            }
                            loading="lazy"
                            onError={(
                              event,
                            ) => {
                              event.currentTarget.src =
                                LIBRARY_IMAGES.default;
                            }}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />

                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />

                          {item.is_featured && (
                            <div className="absolute left-4 top-4 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-black text-amber-950 shadow-lg">
                              ⭐ En vedette
                            </div>
                          )}

                          <div className="absolute bottom-4 left-4 flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-lg shadow-lg backdrop-blur">
                              {getSubjectIcon(
                                item.subject,
                              )}
                            </div>

                            {item.level && (
                              <div className="rounded-xl bg-white/95 px-3 py-2 text-xs font-black text-slate-800 shadow-lg backdrop-blur">
                                {item.level
                                  .short_label ||
                                  item.level
                                    .name}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Contenu */}

                        <div className="flex flex-1 flex-col p-6">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">
                              {resourceTypeIcon(
                                item.resource_type,
                              )}{" "}
                              {resourceTypeLabel(
                                item.resource_type,
                              )}
                            </span>

                            {(item.subjectRef ||
                              item.subject) && (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                {item.subjectRef?.name ||
                                  item.subject}
                              </span>
                            )}
                          </div>

                          <h2 className="mt-4 text-xl font-black leading-snug text-slate-900">
                            {item.title}
                          </h2>

                          {item.description && (
                            <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">
                              {
                                item.description
                              }
                            </p>
                          )}

                          <div className="mt-5 border-t border-slate-100 pt-4">
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <div className="text-slate-400">
                                {item.author ? (
                                  <>
                                    Par{" "}
                                    <span className="font-semibold text-slate-600">
                                      {
                                        item.author
                                      }
                                    </span>
                                  </>
                                ) : (
                                  "Ressource SchoolNet"
                                )}
                              </div>

                              {item.level && (
                                <div className="font-semibold text-blue-600">
                                  {
                                    item.level
                                      .name
                                  }
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-5">
                            {resourceUrl ? (
                              <a
                                href={
                                  resourceUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
                              >
                                {item.download_label ||
                                  "Consulter"}

                                <span className="ml-2">
                                  ↗
                                </span>
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="w-full cursor-not-allowed rounded-xl bg-slate-100 px-4 py-3.5 text-sm font-semibold text-slate-400"
                              >
                                Ressource bientôt
                                disponible
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}

          {/* ==================================================
              BLOC FINAL
              ================================================== */}

          {!loading &&
            !error &&
            items.length > 0 && (
              <div className="relative mt-12 overflow-hidden rounded-[2rem] bg-slate-950 px-8 py-10 text-white sm:px-10">
                <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">
                      SchoolNet Bibliothèque
                    </div>

                    <h2 className="mt-3 text-2xl font-black">
                      Des ressources pour
                      apprendre à son rythme.
                    </h2>

                    <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                      La bibliothèque
                      s’enrichira progressivement
                      avec de nouveaux cours,
                      exercices, guides et supports
                      pédagogiques.
                    </p>
                  </div>

                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-3xl">
                    📖
                  </div>
                </div>
              </div>
            )}
        </section>
      )}
    </PublicPageContent>
  );
}