import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/lib/auth/AuthProvider";

import {
  getStudentReportCardErrorMessage,
  getStudentReportCards,
  getStudentReportCardSubjects,
  type StudentReportCard,
  type StudentReportCardSubject,
} from "@/features/report-cards/lib/studentReportCardsApi";

/*
 * ============================================================
 * OUTILS
 * ============================================================
 */

function numericValue(
  value: number | string | null | undefined,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function formatNumber(
  value: number | string | null | undefined,
) {
  const numeric = numericValue(value);

  if (numeric === null) {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatAverage(
  value: number | string | null | undefined,
) {
  const formatted = formatNumber(value);

  return formatted === "—"
    ? "—"
    : `${formatted} / 20`;
}

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
  }).format(date);
}

/*
 * ============================================================
 * PAGE
 * ============================================================
 */

export default function StudentReportCards() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [
    reportCards,
    setReportCards,
  ] = useState<StudentReportCard[]>([]);

  const [
    selectedReportCardId,
    setSelectedReportCardId,
  ] = useState("");

  const [
    subjects,
    setSubjects,
  ] = useState<StudentReportCardSubject[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  const [
    detailsErrorMessage,
    setDetailsErrorMessage,
  ] = useState<string | null>(null);

  /*
   * ========================================================
   * CHARGEMENT DES BULLETINS
   * ========================================================
   */

  const loadReportCards = useCallback(
    async (manualRefresh = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (user.isDemo) {
        setReportCards([]);
        setSelectedReportCardId("");
        setSubjects([]);

        setErrorMessage(
          "Les bulletins réels ne sont pas disponibles avec le compte de démonstration.",
        );

        setLoading(false);
        return;
      }

      try {
        if (manualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setErrorMessage(null);

        const rows =
          await getStudentReportCards();

        setReportCards(rows);

        setSelectedReportCardId(
          (current) => {
            if (
              current &&
              rows.some(
                (row) =>
                  row.report_card_id === current,
              )
            ) {
              return current;
            }

            return (
              rows[0]?.report_card_id ?? ""
            );
          },
        );

        if (rows.length === 0) {
          setSubjects([]);
        }
      } catch (error) {
        console.error(
          "[StudentReportCards] loadReportCards error:",
          error,
        );

        setReportCards([]);
        setSelectedReportCardId("");
        setSubjects([]);

        setErrorMessage(
          getStudentReportCardErrorMessage(
            error,
            "Impossible de charger les bulletins.",
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadReportCards();
  }, [
    authLoading,
    loadReportCards,
  ]);

  /*
   * ========================================================
   * BULLETIN SELECTIONNE
   * ========================================================
   */

  const selectedReportCard = useMemo(
    () =>
      reportCards.find(
        (row) =>
          row.report_card_id ===
          selectedReportCardId,
      ) ?? null,
    [
      reportCards,
      selectedReportCardId,
    ],
  );

  /*
   * ========================================================
   * DETAIL DES MATIERES
   * ========================================================
   */

  const loadSubjects = useCallback(
    async (reportCardId: string) => {
      if (!reportCardId) {
        setSubjects([]);
        setDetailsErrorMessage(null);
        return;
      }

      try {
        setDetailsLoading(true);
        setDetailsErrorMessage(null);

        const rows =
          await getStudentReportCardSubjects(
            reportCardId,
          );

        setSubjects(rows);
      } catch (error) {
        console.error(
          "[StudentReportCards] loadSubjects error:",
          error,
        );

        setSubjects([]);

        setDetailsErrorMessage(
          getStudentReportCardErrorMessage(
            error,
            "Impossible de charger le détail du bulletin.",
          ),
        );
      } finally {
        setDetailsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadSubjects(
      selectedReportCardId,
    );
  }, [
    selectedReportCardId,
    loadSubjects,
  ]);

  /*
   * ========================================================
   * INDICATEURS
   * ========================================================
   */

  const latestReportCard =
    reportCards[0] ?? null;

  const bestRank = useMemo(() => {
    const ranks = reportCards
      .map((row) =>
        numericValue(row.rank_position),
      )
      .filter(
        (value): value is number =>
          value !== null && value > 0,
      );

    if (ranks.length === 0) {
      return null;
    }

    return Math.min(...ranks);
  }, [reportCards]);

  /*
   * ========================================================
   * CHARGEMENT
   * ========================================================
   */

  if (authLoading || loading) {
    return (
      <div className="space-y-5">
        <section className="sn-card p-6">
          <div className="h-6 w-48 animate-pulse rounded bg-gray-200" />

          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-gray-100" />
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="sn-card h-24 animate-pulse" />
          <div className="sn-card h-24 animate-pulse" />
          <div className="sn-card h-24 animate-pulse" />
        </div>
      </div>
    );
  }

  /*
   * ========================================================
   * AFFICHAGE
   * ========================================================
   */

  return (
    <div className="space-y-5">
      {/* ===================================================
          EN-TETE
          =================================================== */}

      <section className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              📄
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Bulletins scolaires
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-950">
                Mes bulletins
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Consulte tes bulletins publiés,
                tes moyennes, ton classement et
                les appréciations de tes enseignants.
              </p>
            </div>
          </div>

          {!user?.isDemo && (
            <button
              type="button"
              className="sn-btn-ghost sn-press"
              disabled={refreshing}
              onClick={() =>
                void loadReportCards(true)
              }
            >
              {refreshing
                ? "Actualisation..."
                : "↻ Actualiser"}
            </button>
          )}
        </div>
      </section>

      {/* ===================================================
          ERREUR
          =================================================== */}

      {errorMessage && (
        <section className="sn-card border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {errorMessage}
        </section>
      )}

      {/* ===================================================
          AUCUN BULLETIN
          =================================================== */}

      {!errorMessage &&
        reportCards.length === 0 && (
          <section className="sn-card p-10 text-center">
            <div className="text-4xl">
              📭
            </div>

            <h2 className="mt-4 text-lg font-bold text-gray-950">
              Aucun bulletin publié
            </h2>

            <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
              Aucun bulletin scolaire n’est
              actuellement disponible. Il
              apparaîtra ici dès sa publication
              par l’administration.
            </p>
          </section>
        )}

      {!errorMessage &&
        reportCards.length > 0 && (
          <>
            {/* ===============================================
                INDICATEURS
                =============================================== */}

            <section>
              <div className="mb-3">
                <h2 className="font-bold text-gray-950">
                  Vue d’ensemble
                </h2>

                <p className="text-sm text-gray-500">
                  Synthèse de tes bulletins
                  actuellement publiés.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <article className="sn-card p-5">
                  <div className="text-xs font-medium text-gray-500">
                    Bulletins disponibles
                  </div>

                  <div className="mt-2 text-3xl font-bold text-gray-950">
                    {reportCards.length}
                  </div>
                </article>

                <article className="sn-card p-5">
                  <div className="text-xs font-medium text-gray-500">
                    Dernière moyenne générale
                  </div>

                  <div className="mt-2 text-3xl font-bold text-blue-600">
                    {formatAverage(
                      latestReportCard
                        ?.general_average,
                    )}
                  </div>
                </article>

                <article className="sn-card p-5">
                  <div className="text-xs font-medium text-gray-500">
                    Meilleur rang
                  </div>

                  <div className="mt-2 text-3xl font-bold text-emerald-600">
                    {bestRank !== null
                      ? `${bestRank}ᵉ`
                      : "—"}
                  </div>
                </article>
              </div>
            </section>

            {/* ===============================================
                LISTE
                =============================================== */}

            <section>
              <div className="mb-3">
                <h2 className="font-bold text-gray-950">
                  Bulletins publiés
                </h2>

                <p className="text-sm text-gray-500">
                  Sélectionne un bulletin pour
                  consulter son détail.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reportCards.map(
                  (reportCard) => {
                    const selected =
                      reportCard.report_card_id ===
                      selectedReportCardId;

                    return (
                      <button
                        key={
                          reportCard.report_card_id
                        }
                        type="button"
                        onClick={() =>
                          setSelectedReportCardId(
                            reportCard.report_card_id,
                          )
                        }
                        className={[
                          "sn-card text-left transition",
                          "p-5",
                          selected
                            ? "border-blue-500 ring-2 ring-blue-100"
                            : "hover:border-blue-200 hover:shadow-sm",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                              {
                                reportCard.period_name
                              }
                            </div>

                            <div className="mt-1 font-bold text-gray-950">
                              {
                                reportCard.class_name
                              }
                            </div>

                            <div className="mt-1 text-xs text-gray-500">
                              {
                                reportCard.school_year_name
                              }
                            </div>
                          </div>

                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Publié
                          </span>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-blue-50 p-3">
                            <div className="text-[11px] text-gray-500">
                              Moyenne générale
                            </div>

                            <div className="mt-1 font-bold text-blue-700">
                              {formatAverage(
                                reportCard.general_average,
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl bg-gray-50 p-3">
                            <div className="text-[11px] text-gray-500">
                              Rang
                            </div>

                            <div className="mt-1 font-bold text-gray-950">
                              {reportCard.rank_position
                                ? `${reportCard.rank_position} / ${
                                    reportCard.ranked_students_count ??
                                    "—"
                                  }`
                                : "—"}
                            </div>
                          </div>
                        </div>

                        {reportCard.decision && (
                          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                            <strong>
                              Décision :
                            </strong>{" "}
                            {
                              reportCard.decision
                            }
                          </div>
                        )}
                      </button>
                    );
                  },
                )}
              </div>
            </section>

            {/* ===============================================
                DETAIL
                =============================================== */}

            {selectedReportCard && (
              <section className="sn-card overflow-hidden">
                <div className="border-b border-gray-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                        Bulletin scolaire
                      </div>

                      <h2 className="mt-1 text-xl font-bold text-gray-950">
                        {
                          selectedReportCard.period_name
                        }
                      </h2>

                      <p className="mt-1 text-sm text-gray-500">
                        {
                          selectedReportCard.student_name
                        }
                        {" · "}
                        {
                          selectedReportCard.class_name
                        }
                        {" · "}
                        {
                          selectedReportCard.school_year_name
                        }
                      </p>
                    </div>

                    <div className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-bold text-emerald-700">
                      ✓ Bulletin publié
                    </div>
                  </div>
                </div>

                <div className="space-y-6 p-6">
                  {/* -----------------------------------------
                      KPI
                      ----------------------------------------- */}

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-blue-50 p-5">
                      <div className="text-xs text-gray-500">
                        Moyenne générale
                      </div>

                      <div className="mt-2 text-2xl font-bold text-blue-700">
                        {formatAverage(
                          selectedReportCard.general_average,
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-gray-50 p-5">
                      <div className="text-xs text-gray-500">
                        Rang
                      </div>

                      <div className="mt-2 text-2xl font-bold text-gray-950">
                        {selectedReportCard.rank_position
                          ? `${selectedReportCard.rank_position} / ${
                              selectedReportCard.ranked_students_count ??
                              "—"
                            }`
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-violet-50 p-5">
                      <div className="text-xs text-gray-500">
                        Matières
                      </div>

                      <div className="mt-2 text-2xl font-bold text-violet-700">
                        {
                          selectedReportCard.subjects_count
                        }
                      </div>
                    </div>
                  </div>

                  {/* -----------------------------------------
                      APPRECIATION GENERALE
                      ----------------------------------------- */}

                  <div className="grid gap-4 lg:grid-cols-2">
                    <article className="rounded-2xl border border-gray-100 bg-white p-5">
                      <div className="text-sm font-bold text-gray-950">
                        Appréciation générale
                      </div>

                      <p className="mt-3 text-sm leading-6 text-gray-600">
                        {selectedReportCard.general_comment?.trim() ||
                          "Aucune appréciation générale renseignée."}
                      </p>
                    </article>

                    <article className="rounded-2xl border border-gray-100 bg-white p-5">
                      <div className="text-sm font-bold text-gray-950">
                        Décision / mention
                      </div>

                      <p className="mt-3 text-sm leading-6 text-gray-600">
                        {selectedReportCard.decision?.trim() ||
                          "Aucune décision renseignée."}
                      </p>
                    </article>
                  </div>

                  {/* -----------------------------------------
                      MATIERES
                      ----------------------------------------- */}

                  <div>
                    <div className="mb-3">
                      <h3 className="font-bold text-gray-950">
                        Résultats par matière
                      </h3>

                      <p className="text-sm text-gray-500">
                        Moyennes et appréciations
                        figurant sur le bulletin.
                      </p>
                    </div>

                    {detailsErrorMessage && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {
                          detailsErrorMessage
                        }
                      </div>
                    )}

                    {detailsLoading ? (
                      <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
                    ) : !detailsErrorMessage &&
                      subjects.length === 0 ? (
                      <div className="rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-500">
                        Aucun résultat par matière
                        disponible.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-gray-100">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-gray-50 text-xs text-gray-500">
                            <tr>
                              <th className="px-4 py-3 font-semibold">
                                Matière
                              </th>

                              <th className="px-4 py-3 font-semibold">
                                Moyenne
                              </th>

                              <th className="px-4 py-3 font-semibold">
                                Coef.
                              </th>

                              <th className="px-4 py-3 font-semibold">
                                Enseignant
                              </th>

                              <th className="px-4 py-3 font-semibold">
                                Appréciation
                              </th>
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-gray-100 bg-white">
                            {subjects.map(
                              (subject) => (
                                <tr
                                  key={
                                    subject.report_card_subject_id
                                  }
                                >
                                  <td className="px-4 py-4 font-semibold text-gray-950">
                                    {
                                      subject.subject_name
                                    }
                                  </td>

                                  <td className="px-4 py-4 font-bold text-blue-700">
                                    {formatAverage(
                                      subject.subject_average,
                                    )}
                                  </td>

                                  <td className="px-4 py-4 text-gray-600">
                                    {formatNumber(
                                      subject.subject_coefficient,
                                    )}
                                  </td>

                                  <td className="px-4 py-4 text-gray-600">
                                    {subject.teacher_name ||
                                      "—"}
                                  </td>

                                  <td className="max-w-lg px-4 py-4 text-gray-600">
                                    {subject.teacher_comment?.trim() ||
                                      "Aucune appréciation."}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-gray-400">
                    Publié le{" "}
                    {formatDateTime(
                      selectedReportCard.published_at,
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
    </div>
  );
}