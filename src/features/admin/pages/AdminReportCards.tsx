import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  generateAdminReportCardsForClass,
  getAdminReportCardCatalog,
  getAdminReportCardErrorMessage,
  getAdminReportCards,
  getAdminReportCardSubjects,
  publishAdminReportCard,
  updateAdminReportCardReview,
  type AdminReportCard,
  type AdminReportCardCatalog,
  type AdminReportCardStatus,
  type AdminReportCardSubject,
} from "@/features/report-cards/lib/adminReportCardsApi";

const EMPTY_CATALOG: AdminReportCardCatalog = {
  schoolYears: [],
  classes: [],
  periods: [],
};

function numericValue(
  value: number | string | null,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatNumber(
  value: number | string | null,
  digits = 2,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return number.toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits:
        digits,
      maximumFractionDigits:
        digits,
    },
  );
}

function statusLabel(
  status: string,
) {
  if (status === "published") {
    return "Publié";
  }

  return "Brouillon";
}

function statusClassName(
  status: string,
) {
  if (status === "published") {
    return [
      "border",
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700",
    ].join(" ");
  }

  return [
    "border",
    "border-amber-200",
    "bg-amber-50",
    "text-amber-700",
  ].join(" ");
}

export default function AdminReportCards() {
  /*
   * ========================================================
   * DONNEES
   * ========================================================
   */

  const [
    catalog,
    setCatalog,
  ] = useState<AdminReportCardCatalog>(
    EMPTY_CATALOG,
  );

  const [
    reportCards,
    setReportCards,
  ] = useState<AdminReportCard[]>(
    [],
  );

  const [
    subjects,
    setSubjects,
  ] = useState<
    AdminReportCardSubject[]
  >([]);

  /*
   * ========================================================
   * FILTRES
   * ========================================================
   */

  const [
    schoolYearFilter,
    setSchoolYearFilter,
  ] = useState("all");

  const [
    classFilter,
    setClassFilter,
  ] = useState("all");

  const [
    periodFilter,
    setPeriodFilter,
  ] = useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<
    "all" | AdminReportCardStatus
  >("all");

  const [
    search,
    setSearch,
  ] = useState("");

  /*
   * ========================================================
   * GENERATION
   * ========================================================
   */

  const [
    generationClassId,
    setGenerationClassId,
  ] = useState("");

  const [
    generationPeriodId,
    setGenerationPeriodId,
  ] = useState("");

  const [
    generating,
    setGenerating,
  ] = useState(false);

  /*
   * ========================================================
   * DETAIL / REVUE
   * ========================================================
   */

  const [
    selectedReportCardId,
    setSelectedReportCardId,
  ] = useState<string | null>(
    null,
  );

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [
    generalComment,
    setGeneralComment,
  ] = useState("");

  const [
    decision,
    setDecision,
  ] = useState("");

  const [
    savingReview,
    setSavingReview,
  ] = useState(false);

  const [
    publishing,
    setPublishing,
  ] = useState(false);

  /*
   * ========================================================
   * ETATS GENERAUX
   * ========================================================
   */

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(
    null,
  );

  const [
    successMessage,
    setSuccessMessage,
  ] = useState<string | null>(
    null,
  );

  /*
   * ========================================================
   * CHARGEMENT CATALOGUE
   * ========================================================
   */

  const loadCatalog =
    useCallback(
      async () => {
        try {
          const data =
            await getAdminReportCardCatalog();

          setCatalog(data);

          setGenerationClassId(
            (current) =>
              current ||
              data.classes[0]?.id ||
              "",
          );

          setGenerationPeriodId(
            (current) =>
              current ||
              data.periods.find(
                (period) =>
                  period.is_active,
              )?.id ||
              data.periods[0]?.id ||
              "",
          );
        } catch (error) {
          console.error(
            "Impossible de charger le catalogue des bulletins.",
            error,
          );

          setErrorMessage(
            getAdminReportCardErrorMessage(
              error,
            ),
          );
        }
      },
      [],
    );

  /*
   * ========================================================
   * CHARGEMENT BULLETINS
   * ========================================================
   */

  const loadReportCards =
    useCallback(
      async (
        mode:
          | "initial"
          | "refresh" =
          "initial",
      ) => {
        if (
          mode === "initial"
        ) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        setErrorMessage(null);

        try {
          const data =
            await getAdminReportCards(
              {
                schoolYearId:
                  schoolYearFilter ===
                  "all"
                    ? null
                    : schoolYearFilter,

                classId:
                  classFilter ===
                  "all"
                    ? null
                    : classFilter,

                periodId:
                  periodFilter ===
                  "all"
                    ? null
                    : periodFilter,

                status:
                  statusFilter ===
                  "all"
                    ? null
                    : statusFilter,
              },
            );

          setReportCards(data);

          setSelectedReportCardId(
            (current) => {
              if (!current) {
                return null;
              }

              const stillExists =
                data.some(
                  (item) =>
                    item.report_card_id ===
                    current,
                );

              return stillExists
                ? current
                : null;
            },
          );
        } catch (error) {
          console.error(
            "Impossible de charger les bulletins.",
            error,
          );

          setReportCards([]);

          setErrorMessage(
            getAdminReportCardErrorMessage(
              error,
            ),
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        schoolYearFilter,
        classFilter,
        periodFilter,
        statusFilter,
      ],
    );

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadReportCards();
  }, [loadReportCards]);

  /*
   * ========================================================
   * DONNEES CALCULEES
   * ========================================================
   */

  const visiblePeriods =
    useMemo(
      () => {
        if (
          schoolYearFilter ===
          "all"
        ) {
          return catalog.periods;
        }

        return catalog.periods.filter(
          (period) =>
            period.school_year_id ===
            schoolYearFilter,
        );
      },
      [
        catalog.periods,
        schoolYearFilter,
      ],
    );

  const filteredReportCards =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLocaleLowerCase(
              "fr-FR",
            );

        if (!query) {
          return reportCards;
        }

        return reportCards.filter(
          (item) =>
            [
              item.student_name,
              item.class_name,
              item.period_name,
              item.school_year_name,
              item.decision ?? "",
            ].some((value) =>
              value
                .toLocaleLowerCase(
                  "fr-FR",
                )
                .includes(query),
            ),
        );
      },
      [
        reportCards,
        search,
      ],
    );

  const selectedReportCard =
    useMemo(
      () =>
        reportCards.find(
          (item) =>
            item.report_card_id ===
            selectedReportCardId,
        ) ?? null,
      [
        reportCards,
        selectedReportCardId,
      ],
    );

  const draftCount =
    useMemo(
      () =>
        reportCards.filter(
          (item) =>
            item.report_card_status ===
            "draft",
        ).length,
      [reportCards],
    );

  const publishedCount =
    useMemo(
      () =>
        reportCards.filter(
          (item) =>
            item.report_card_status ===
            "published",
        ).length,
      [reportCards],
    );

  const completeTeacherCommentsCount =
    useMemo(
      () =>
        reportCards.filter(
          (item) => {
            const expected =
              numericValue(
                item.teacher_subjects_count,
              );

            const filled =
              numericValue(
                item.teacher_comments_count,
              );

            return (
              expected > 0 &&
              filled >= expected
            );
          },
        ).length,
      [reportCards],
    );

  /*
   * ========================================================
   * DETAIL
   * ========================================================
   */

  async function handleOpenReportCard(
    reportCard: AdminReportCard,
  ) {
    setSelectedReportCardId(
      reportCard.report_card_id,
    );

    setGeneralComment(
      reportCard.general_comment ??
        "",
    );

    setDecision(
      reportCard.decision ??
        "",
    );

    setSubjects([]);

    setDetailLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const data =
        await getAdminReportCardSubjects(
          reportCard.report_card_id,
        );

      setSubjects(data);
    } catch (error) {
      console.error(
        "Impossible de charger le détail du bulletin.",
        error,
      );

      setErrorMessage(
        getAdminReportCardErrorMessage(
          error,
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseDetail() {
    setSelectedReportCardId(
      null,
    );

    setSubjects([]);

    setGeneralComment("");
    setDecision("");
  }

  /*
   * ========================================================
   * GENERATION
   * ========================================================
   */

  async function handleGenerateClass() {
    if (
      !generationClassId ||
      !generationPeriodId
    ) {
      setErrorMessage(
        "Sélectionnez une classe et une période.",
      );

      return;
    }

    const className =
      catalog.classes.find(
        (item) =>
          item.id ===
          generationClassId,
      )?.name ??
      "la classe sélectionnée";

    const periodName =
      catalog.periods.find(
        (item) =>
          item.id ===
          generationPeriodId,
      )?.name ??
      "la période sélectionnée";

    const confirmed =
      window.confirm(
        [
          `Générer ou recalculer les bulletins de ${className} pour « ${periodName} » ?`,
          "",
          "Les bulletins resteront en brouillon tant que l'administration ne les publie pas.",
        ].join("\n"),
      );

    if (!confirmed) {
      return;
    }

    setGenerating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const generated =
        await generateAdminReportCardsForClass(
          generationClassId,
          generationPeriodId,
        );

      setClassFilter(
        generationClassId,
      );

      setPeriodFilter(
        generationPeriodId,
      );

      setStatusFilter(
        "draft",
      );

      setSuccessMessage(
        `${generated.length} bulletin(s) généré(s) ou recalculé(s) avec succès.`,
      );
    } catch (error) {
      console.error(
        "Impossible de générer les bulletins.",
        error,
      );

      setErrorMessage(
        getAdminReportCardErrorMessage(
          error,
        ),
      );
    } finally {
      setGenerating(false);
    }
  }

  /*
   * ========================================================
   * REVUE ADMIN
   * ========================================================
   */

  async function handleSaveReview() {
    if (!selectedReportCard) {
      return;
    }

    if (
      selectedReportCard
        .report_card_status ===
      "published"
    ) {
      setErrorMessage(
        "Ce bulletin est déjà publié et ne peut plus être modifié.",
      );

      return;
    }

    setSavingReview(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await updateAdminReportCardReview(
        selectedReportCard.report_card_id,
        generalComment.trim(),
        decision.trim(),
      );

      setSuccessMessage(
        `La revue du bulletin de ${selectedReportCard.student_name} a été enregistrée.`,
      );

      await loadReportCards(
        "refresh",
      );
    } catch (error) {
      console.error(
        "Impossible d'enregistrer la revue du bulletin.",
        error,
      );

      setErrorMessage(
        getAdminReportCardErrorMessage(
          error,
        ),
      );
    } finally {
      setSavingReview(false);
    }
  }

  /*
   * ========================================================
   * PUBLICATION
   * ========================================================
   */

  async function handlePublish() {
    if (!selectedReportCard) {
      return;
    }

    if (
      selectedReportCard
        .report_card_status ===
      "published"
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        [
          `Publier définitivement le bulletin de ${selectedReportCard.student_name} ?`,
          "",
          "Après publication, le bulletin sera considéré comme finalisé.",
        ].join("\n"),
      );

    if (!confirmed) {
      return;
    }

    setPublishing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await publishAdminReportCard(
        selectedReportCard.report_card_id,
      );

      setSuccessMessage(
        `Le bulletin de ${selectedReportCard.student_name} a été publié avec succès.`,
      );

      await loadReportCards(
        "refresh",
      );
    } catch (error) {
      console.error(
        "Impossible de publier le bulletin.",
        error,
      );

      setErrorMessage(
        getAdminReportCardErrorMessage(
          error,
        ),
      );
    } finally {
      setPublishing(false);
    }
  }

  /*
   * ========================================================
   * RAFRAICHISSEMENT
   * ========================================================
   */

  async function handleRefresh() {
    setSuccessMessage(null);

    await Promise.all([
      loadCatalog(),
      loadReportCards(
        "refresh",
      ),
    ]);

    if (
      selectedReportCardId
    ) {
      try {
        const data =
          await getAdminReportCardSubjects(
            selectedReportCardId,
          );

        setSubjects(data);
      } catch {
        // Le message principal est géré
        // lors du chargement général.
      }
    }
  }

  function handleResetFilters() {
    setSchoolYearFilter(
      "all",
    );

    setClassFilter(
      "all",
    );

    setPeriodFilter(
      "all",
    );

    setStatusFilter(
      "all",
    );

    setSearch("");
  }

  /*
   * ========================================================
   * RENDU
   * ========================================================
   */

  return (
    <div className="space-y-5">
      {/* ===================================================
          HERO
         =================================================== */}

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-blue-50/70 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              📄
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Bulletins
              </p>

              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Pilotage des bulletins
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Générez, contrôlez et publiez les bulletins scolaires à partir des moyennes calculées et des appréciations des enseignants.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void handleRefresh()
            }
            disabled={
              refreshing ||
              loading
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing
              ? "Actualisation..."
              : "↻ Actualiser"}
          </button>
        </div>
      </section>

      {/* ===================================================
          ALERTES
         =================================================== */}

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          ✅ {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          ⚠️ {errorMessage}
        </div>
      ) : null}

      {/* ===================================================
          GENERATION
         =================================================== */}

      <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Administration
            </p>

            <h2 className="mt-1 text-lg font-bold text-slate-950">
              Génération des bulletins
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Générez les bulletins d'une classe pour une période scolaire.
            </p>
          </div>

          <div className="grid w-full gap-3 md:grid-cols-2 xl:max-w-4xl xl:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Classe
              </span>

              <select
                value={
                  generationClassId
                }
                onChange={(event) =>
                  setGenerationClassId(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="">
                  Sélectionner une classe
                </option>

                {catalog.classes.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">
                Période
              </span>

              <select
                value={
                  generationPeriodId
                }
                onChange={(event) =>
                  setGenerationPeriodId(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="">
                  Sélectionner une période
                </option>

                {catalog.periods.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                      {item.is_locked
                        ? " • verrouillée"
                        : ""}
                    </option>
                  ),
                )}
              </select>
            </label>

            <button
              type="button"
              onClick={() =>
                void handleGenerateClass()
              }
              disabled={
                generating ||
                !generationClassId ||
                !generationPeriodId
              }
              className="h-[42px] self-end rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating
                ? "Génération..."
                : "⚙ Générer"}
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================
          KPI
         =================================================== */}

      <section>
        <div>
          <h2 className="text-base font-bold text-slate-950">
            Vue établissement
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Les indicateurs correspondent aux filtres actuellement sélectionnés.
          </p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Bulletins
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-950">
              {reportCards.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Brouillons
            </p>

            <p className="mt-2 text-2xl font-bold text-amber-600">
              {draftCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Publiés
            </p>

            <p className="mt-2 text-2xl font-bold text-emerald-600">
              {publishedCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Appréciations complètes
            </p>

            <p className="mt-2 text-2xl font-bold text-blue-600">
              {
                completeTeacherCommentsCount
              }
            </p>
          </div>
        </div>
      </section>

      {/* ===================================================
          FILTRES
         =================================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Filtres
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Recherchez les bulletins par année, classe, période ou statut.
            </p>
          </div>

          <button
            type="button"
            onClick={
              handleResetFilters
            }
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
          >
            Réinitialiser
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">
              Année scolaire
            </span>

            <select
              value={
                schoolYearFilter
              }
              onChange={(event) => {
                setSchoolYearFilter(
                  event.target.value,
                );

                setPeriodFilter(
                  "all",
                );
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            >
              <option value="all">
                Toutes les années
              </option>

              {catalog.schoolYears.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">
              Classe
            </span>

            <select
              value={
                classFilter
              }
              onChange={(event) =>
                setClassFilter(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            >
              <option value="all">
                Toutes les classes
              </option>

              {catalog.classes.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">
              Période
            </span>

            <select
              value={
                periodFilter
              }
              onChange={(event) =>
                setPeriodFilter(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            >
              <option value="all">
                Toutes les périodes
              </option>

              {visiblePeriods.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">
              Statut
            </span>

            <select
              value={
                statusFilter
              }
              onChange={(event) =>
                setStatusFilter(
                  event.target
                    .value as
                    | "all"
                    | AdminReportCardStatus,
                )
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            >
              <option value="all">
                Tous les statuts
              </option>

              <option value="draft">
                Brouillons
              </option>

              <option value="published">
                Publiés
              </option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700">
              Recherche
            </span>

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Élève, classe..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
          </label>
        </div>
      </section>

      {/* ===================================================
          LISTE
         =================================================== */}

      <section>
        <div>
          <h2 className="text-base font-bold text-slate-950">
            Bulletins scolaires
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {
              filteredReportCards.length
            }{" "}
            bulletin
            {filteredReportCards.length >
            1
              ? "s"
              : ""}{" "}
            correspondant aux critères.
          </p>
        </div>

        {loading ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Chargement des bulletins...
            </p>
          </div>
        ) : filteredReportCards.length ===
          0 ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="text-3xl">
              📄
            </div>

            <h3 className="mt-3 text-base font-bold text-slate-950">
              Aucun bulletin correspondant
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Générez des bulletins ou modifiez les filtres sélectionnés.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {filteredReportCards.map(
              (item) => {
                const teacherSubjects =
                  numericValue(
                    item.teacher_subjects_count,
                  );

                const teacherComments =
                  numericValue(
                    item.teacher_comments_count,
                  );

                const commentsComplete =
                  teacherSubjects >
                    0 &&
                  teacherComments >=
                    teacherSubjects;

                return (
                  <article
                    key={
                      item.report_card_id
                    }
                    className={[
                      "rounded-2xl border bg-white p-5 shadow-sm transition",
                      selectedReportCardId ===
                      item.report_card_id
                        ? "border-blue-400 ring-4 ring-blue-50"
                        : "border-slate-200 hover:border-blue-200",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-bold",
                              statusClassName(
                                item.report_card_status,
                              ),
                            ].join(
                              " ",
                            )}
                          >
                            {statusLabel(
                              item.report_card_status,
                            )}
                          </span>

                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {
                              item.period_name
                            }
                          </span>
                        </div>

                        <h3 className="mt-3 text-lg font-bold text-slate-950">
                          {
                            item.student_name
                          }
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          {
                            item.class_name
                          }{" "}
                          ·{" "}
                          {
                            item.school_year_name
                          }
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void handleOpenReportCard(
                            item,
                          )
                        }
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                      >
                        Examiner
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Moyenne
                        </p>

                        <p className="mt-1 font-bold text-blue-700">
                          {formatNumber(
                            item.general_average,
                          )}{" "}
                          / 20
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Rang
                        </p>

                        <p className="mt-1 font-bold text-slate-900">
                          {item.rank_position ??
                            "—"}
                          {item.ranked_students_count
                            ? ` / ${item.ranked_students_count}`
                            : ""}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Matières
                        </p>

                        <p className="mt-1 font-bold text-slate-900">
                          {
                            item.subjects_count
                          }
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-[11px] font-medium text-slate-500">
                          Appréciations
                        </p>

                        <p
                          className={[
                            "mt-1 font-bold",
                            commentsComplete
                              ? "text-emerald-600"
                              : "text-amber-600",
                          ].join(
                            " ",
                          )}
                        >
                          {
                            teacherComments
                          }
                          /
                          {
                            teacherSubjects
                          }
                        </p>
                      </div>
                    </div>

                    {item.decision ? (
                      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <span className="font-semibold text-slate-700">
                          Décision :
                        </span>{" "}
                        {
                          item.decision
                        }
                      </div>
                    ) : null}
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>

      {/* ===================================================
          DETAIL
         =================================================== */}

      {selectedReportCard ? (
        <section className="rounded-2xl border border-blue-200 bg-white shadow-sm">
          <header className="flex flex-col gap-4 border-b border-slate-100 bg-blue-50/40 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                Revue du bulletin
              </p>

              <h2 className="mt-1 text-xl font-bold text-slate-950">
                {
                  selectedReportCard.student_name
                }
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {
                  selectedReportCard.class_name
                }{" "}
                ·{" "}
                {
                  selectedReportCard.period_name
                }{" "}
                ·{" "}
                {
                  selectedReportCard.school_year_name
                }
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-bold",
                  statusClassName(
                    selectedReportCard.report_card_status,
                  ),
                ].join(" ")}
              >
                {statusLabel(
                  selectedReportCard.report_card_status,
                )}
              </span>

              <button
                type="button"
                onClick={
                  handleCloseDetail
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ✕ Fermer
              </button>
            </div>
          </header>

          <div className="space-y-6 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Moyenne générale
                </p>

                <p className="mt-2 text-xl font-bold text-blue-700">
                  {formatNumber(
                    selectedReportCard.general_average,
                  )}{" "}
                  / 20
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Rang
                </p>

                <p className="mt-2 text-xl font-bold text-slate-950">
                  {selectedReportCard.rank_position ??
                    "—"}
                  {selectedReportCard.ranked_students_count
                    ? ` / ${selectedReportCard.ranked_students_count}`
                    : ""}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Matières
                </p>

                <p className="mt-2 text-xl font-bold text-slate-950">
                  {
                    selectedReportCard.subjects_count
                  }
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-950">
                Résultats par matière
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Moyennes et appréciations transmises par les enseignants.
              </p>

              {detailLoading ? (
                <div className="mt-3 rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                  Chargement du détail...
                </div>
              ) : subjects.length ===
                0 ? (
                <div className="mt-3 rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
                  Aucune matière enregistrée dans ce bulletin.
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Matière
                        </th>

                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Moyenne
                        </th>

                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Coef.
                        </th>

                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Enseignant
                        </th>

                        <th className="px-4 py-3 text-left font-semibold text-slate-700">
                          Appréciation
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 bg-white">
                      {subjects.map(
                        (subject) => (
                          <tr
                            key={
                              subject.report_card_subject_id
                            }
                            className="align-top"
                          >
                            <td className="px-4 py-4 font-semibold text-slate-900">
                              {
                                subject.subject_name
                              }
                            </td>

                            <td className="px-4 py-4 font-bold text-blue-700">
                              {formatNumber(
                                subject.subject_average,
                              )}{" "}
                              / 20
                            </td>

                            <td className="px-4 py-4 text-slate-600">
                              {formatNumber(
                                subject.subject_coefficient,
                                1,
                              )}
                            </td>

                            <td className="px-4 py-4 text-slate-600">
                              {subject.teacher_name ??
                                "Non affecté"}
                            </td>

                            <td className="max-w-xl px-4 py-4 text-slate-600">
                              {subject.teacher_comment ? (
                                subject.teacher_comment
                              ) : (
                                <span className="font-medium text-amber-600">
                                  Appréciation non renseignée
                                </span>
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-800">
                  Appréciation générale
                </span>

                <textarea
                  value={
                    generalComment
                  }
                  onChange={(event) =>
                    setGeneralComment(
                      event.target.value,
                    )
                  }
                  disabled={
                    selectedReportCard.report_card_status ===
                    "published"
                  }
                  rows={5}
                  placeholder="Ex. Très bon trimestre. Résultats réguliers et comportement satisfaisant."
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-800">
                  Décision / mention
                </span>

                <textarea
                  value={
                    decision
                  }
                  onChange={(event) =>
                    setDecision(
                      event.target.value,
                    )
                  }
                  disabled={
                    selectedReportCard.report_card_status ===
                    "published"
                  }
                  rows={5}
                  placeholder="Ex. Admis(e) en classe supérieure, Félicitations, Encouragements..."
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-100"
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Validation administrative
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Enregistrez d'abord l'appréciation générale et la décision, puis publiez le bulletin lorsqu'il est prêt.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedReportCard.report_card_status !==
                "published" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void handleSaveReview()
                      }
                      disabled={
                        savingReview ||
                        publishing
                      }
                      className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingReview
                        ? "Enregistrement..."
                        : "✓ Enregistrer la revue"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handlePublish()
                      }
                      disabled={
                        savingReview ||
                        publishing
                      }
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {publishing
                        ? "Publication..."
                        : "✓ Publier le bulletin"}
                    </button>
                  </>
                ) : (
                  <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">
                    ✓ Bulletin publié
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}