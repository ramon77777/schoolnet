import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

type PeriodAverageRow = {
  student_id: string;
  period_id: string;
  general_average: number | string | null;
  subjects_count: number | null;
  subjects_coefficient_total: number | string | null;
};

type SubjectAverageRow = {
  student_id: string;
  subject_id: string;
  period_id: string;
  subject_average: number | string | null;
  assessments_count: number | null;
  assessments_coefficient_total: number | string | null;
};

type RankingRow = {
  student_id: string;
  period_id: string;
  class_id: string | null;
  general_average: number | string | null;
  rank_position: number | null;
  ranked_students_count: number | null;
};

type PeriodRow = {
  id: string;
  code: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  scale: number | string | null;
};

type SubjectRow = {
  id: string;
  code: string;
  name: string;
};

type SubjectAverageDisplay = {
  subjectId: string;
  code: string;
  name: string;
  average: number;
  assessmentsCount: number;
  coefficientTotal: number;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function safeErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: string;
      details?: string;
      error_description?: string;
    };

    return (
      maybeError.message ||
      maybeError.details ||
      maybeError.error_description ||
      fallback
    );
  }

  return fallback;
}

function numberValue(
  value: number | string | null | undefined,
) {
  const numericValue = Number(value ?? 0);

  return Number.isFinite(numericValue)
    ? numericValue
    : 0;
}

function formatScore(
  value: number,
  scale: number,
) {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}/${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(scale)}`;
}

function formatCoefficient(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(date);
}

export default function StudentAverages() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [periodAverages, setPeriodAverages] =
    useState<PeriodAverageRow[]>([]);

  const [subjectAverages, setSubjectAverages] =
    useState<SubjectAverageRow[]>([]);

  const [rankings, setRankings] =
    useState<RankingRow[]>([]);

  const [periods, setPeriods] =
    useState<PeriodRow[]>([]);

  const [subjects, setSubjects] =
    useState<SubjectRow[]>([]);

  const [selectedPeriodId, setSelectedPeriodId] =
    useState("");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadData = useCallback(
    async (manualRefresh = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (user.isDemo) {
        setPeriodAverages([]);
        setSubjectAverages([]);
        setRankings([]);
        setPeriods([]);
        setSubjects([]);
        setError(
          "Les moyennes réelles ne sont pas disponibles avec le compte de démonstration.",
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

        setError(null);

        const [
          periodAverageResult,
          subjectAverageResult,
          rankingsResult,
        ] = await Promise.all([
          supabase
            .from("student_period_averages")
            .select(
              [
                "student_id",
                "period_id",
                "general_average",
                "subjects_count",
                "subjects_coefficient_total",
              ].join(","),
            )
            .eq("student_id", user.id),

          supabase
            .from("student_subject_averages")
            .select(
              [
                "student_id",
                "subject_id",
                "period_id",
                "subject_average",
                "assessments_count",
                "assessments_coefficient_total",
              ].join(","),
            )
            .eq("student_id", user.id),

          supabase
            .from("student_period_rankings")
            .select(
              [
                "student_id",
                "period_id",
                "class_id",
                "general_average",
                "rank_position",
                "ranked_students_count",
              ].join(","),
            )
            .eq("student_id", user.id),
        ]);

        if (periodAverageResult.error) {
          throw periodAverageResult.error;
        }

        if (subjectAverageResult.error) {
          throw subjectAverageResult.error;
        }

        if (rankingsResult.error) {
          throw rankingsResult.error;
        }

        const periodAverageRows =
            (periodAverageResult.data ?? []) as unknown as PeriodAverageRow[];

        const subjectAverageRows =
            (subjectAverageResult.data ?? []) as unknown as SubjectAverageRow[];

        const rankingRows =
            (rankingsResult.data ?? []) as unknown as RankingRow[];

        const periodIds = [
          ...new Set([
            ...periodAverageRows.map(
              (row) => row.period_id,
            ),
            ...subjectAverageRows.map(
              (row) => row.period_id,
            ),
          ]),
        ];

        const subjectIds = [
          ...new Set(
            subjectAverageRows.map(
              (row) => row.subject_id,
            ),
          ),
        ];

        let periodRows: PeriodRow[] = [];
        let subjectRows: SubjectRow[] = [];

        if (periodIds.length > 0) {
          const periodResult = await supabase
            .from("grading_periods")
            .select(
              "id, code, name, starts_on, ends_on, scale",
            )
            .in("id", periodIds);

          if (periodResult.error) {
            throw periodResult.error;
          }

          periodRows =
            (periodResult.data ?? []) as PeriodRow[];
        }

        if (subjectIds.length > 0) {
          const subjectResult = await supabase
            .from("academic_subjects")
            .select("id, code, name")
            .in("id", subjectIds);

          if (subjectResult.error) {
            throw subjectResult.error;
          }

          subjectRows =
            (subjectResult.data ?? []) as SubjectRow[];
        }

        periodRows.sort((a, b) => {
          const aDate =
            a.starts_on ?? "";
          const bDate =
            b.starts_on ?? "";

          return bDate.localeCompare(aDate);
        });

        subjectRows.sort((a, b) =>
          a.name.localeCompare(b.name, "fr"),
        );

        setPeriodAverages(periodAverageRows);
        setSubjectAverages(subjectAverageRows);
        setRankings(rankingRows);
        setPeriods(periodRows);
        setSubjects(subjectRows);

        setSelectedPeriodId((current) => {
          if (
            current &&
            periodIds.includes(current)
          ) {
            return current;
          }

          return periodRows[0]?.id ?? "";
        });
      } catch (loadError) {
        console.error(
          "[StudentAverages] loadData error:",
          loadError,
        );

        setPeriodAverages([]);
        setSubjectAverages([]);
        setRankings([]);
        setPeriods([]);
        setSubjects([]);

        setError(
          safeErrorMessage(
            loadError,
            "Impossible de charger les moyennes.",
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
    if (authLoading) return;

    void loadData();
  }, [authLoading, loadData]);

  const selectedPeriod = useMemo(
    () =>
      periods.find(
        (period) =>
          period.id === selectedPeriodId,
      ) ?? null,
    [periods, selectedPeriodId],
  );

  const selectedPeriodAverage = useMemo(
    () =>
      periodAverages.find(
        (row) =>
          row.period_id === selectedPeriodId,
      ) ?? null,
    [periodAverages, selectedPeriodId],
  );

  const selectedRanking = useMemo(
    () =>
      rankings.find(
        (row) =>
          row.period_id === selectedPeriodId,
      ) ?? null,
    [rankings, selectedPeriodId],
  );

  const subjectById = useMemo(
    () =>
      new Map(
        subjects.map((subject) => [
          subject.id,
          subject,
        ]),
      ),
    [subjects],
  );

  const subjectRows = useMemo<
    SubjectAverageDisplay[]
  >(
    () =>
      subjectAverages
        .filter(
          (row) =>
            row.period_id === selectedPeriodId,
        )
        .map((row) => {
          const subject = subjectById.get(
            row.subject_id,
          );

          return {
            subjectId: row.subject_id,
            code:
              subject?.code ??
              "",
            name:
              subject?.name ??
              "Matière",
            average: numberValue(
              row.subject_average,
            ),
            assessmentsCount:
              row.assessments_count ?? 0,
            coefficientTotal: numberValue(
              row.assessments_coefficient_total,
            ),
          };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, "fr"),
        ),
    [
      subjectAverages,
      selectedPeriodId,
      subjectById,
    ],
  );

  const normalizedSearch =
    search.trim().toLocaleLowerCase("fr");

  const filteredSubjectRows = useMemo(
    () =>
      subjectRows.filter((row) => {
        if (!normalizedSearch) return true;

        return (
          row.name
            .toLocaleLowerCase("fr")
            .includes(normalizedSearch) ||
          row.code
            .toLocaleLowerCase("fr")
            .includes(normalizedSearch)
        );
      }),
    [subjectRows, normalizedSearch],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredSubjectRows.length / pageSize,
    ),
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedSubjectRows = useMemo(() => {
    const start = (page - 1) * pageSize;

    return filteredSubjectRows.slice(
      start,
      start + pageSize,
    );
  }, [filteredSubjectRows, page, pageSize]);

  const scale = Math.max(
    1,
    numberValue(selectedPeriod?.scale || 20),
  );

  if (authLoading || loading) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xl font-semibold">
            Moyennes
          </div>

          <div className="text-sm text-gray-500">
            Consultation de tes résultats scolaires.
          </div>
        </div>

        <div className="sn-card p-6 animate-pulse">
          <div className="h-5 w-48 rounded bg-gray-200" />

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
            <div className="h-24 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Moyennes
          </div>

          <div className="text-sm text-gray-500">
            Consulte tes moyennes, ton classement et
            le détail de tes résultats par matière.
          </div>
        </div>

        {!user?.isDemo && (
          <button
            type="button"
            className="sn-btn-ghost sn-press"
            disabled={refreshing}
            onClick={() => void loadData(true)}
          >
            {refreshing
              ? "Actualisation..."
              : "↻ Actualiser"}
          </button>
        )}
      </div>

      {error && (
        <div className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && periods.length === 0 && (
        <div className="sn-card p-6">
          <div className="font-semibold">
            Aucune moyenne disponible
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Aucune période contenant des résultats
            publiés n’est disponible actuellement.
          </div>
        </div>
      )}

      {!error && periods.length > 0 && (
        <>
          <div className="sn-card p-5">
            <label
              htmlFor="student-average-period"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Période
            </label>

            <select
              id="student-average-period"
              className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              value={selectedPeriodId}
              onChange={(event) => {
                setSelectedPeriodId(
                  event.target.value,
                );
                setSearch("");
                setPage(1);
              }}
            >
              {periods.map((period) => (
                <option
                  key={period.id}
                  value={period.id}
                >
                  {period.name}
                </option>
              ))}
            </select>

            {selectedPeriod && (
              <div className="mt-2 text-xs text-gray-500">
                {selectedPeriod.code}
                {selectedPeriod.starts_on
                  ? ` · ${formatDate(
                      selectedPeriod.starts_on,
                    )}`
                  : ""}
                {selectedPeriod.ends_on
                  ? ` → ${formatDate(
                      selectedPeriod.ends_on,
                    )}`
                  : ""}
                {` · Barème /${scale}`}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Moyenne générale
              </div>

              <div className="mt-2 text-3xl font-bold text-blue-600">
                {selectedPeriodAverage
                  ? formatScore(
                      numberValue(
                        selectedPeriodAverage.general_average,
                      ),
                      scale,
                    )
                  : "—"}
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Rang
              </div>

              <div className="mt-2 text-3xl font-bold text-emerald-600">
                {selectedRanking?.rank_position
                  ? `${selectedRanking.rank_position}/${selectedRanking.ranked_students_count ?? "—"}`
                  : "—"}
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Matières calculées
              </div>

              <div className="mt-2 text-3xl font-bold text-violet-600">
                {selectedPeriodAverage?.subjects_count ??
                  subjectRows.length}
              </div>
            </div>

            <div className="sn-card p-5">
              <div className="text-sm text-gray-500">
                Total coefficients
              </div>

              <div className="mt-2 text-3xl font-bold text-amber-600">
                {formatCoefficient(
                  numberValue(
                    selectedPeriodAverage
                      ?.subjects_coefficient_total,
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="sn-card overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="font-semibold">
                Moyennes par matière
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Détail des résultats pris en compte
                pour la période sélectionnée.
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="search"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:max-w-md"
                placeholder="Rechercher une matière ou un code..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />

              <select
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(
                    Number(event.target.value),
                  );
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map(
                  (size) => (
                    <option
                      key={size}
                      value={size}
                    >
                      {size} / page
                    </option>
                  ),
                )}
              </select>
            </div>

            {paginatedSubjectRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Aucun résultat disponible pour les
                critères sélectionnés.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-5 py-4">
                          Matière
                        </th>
                        <th className="px-5 py-4">
                          Moyenne
                        </th>
                        <th className="px-5 py-4">
                          Évaluations
                        </th>
                        <th className="px-5 py-4">
                          Total coefficients
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100">
                      {paginatedSubjectRows.map(
                        (row) => (
                          <tr
                            key={row.subjectId}
                            className="hover:bg-gray-50/70"
                          >
                            <td className="px-5 py-4">
                              <div className="font-semibold text-gray-900">
                                {row.name}
                              </div>

                              {row.code && (
                                <div className="mt-0.5 text-xs text-gray-500">
                                  {row.code}
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-4 font-bold text-blue-600">
                              {formatScore(
                                row.average,
                                scale,
                              )}
                            </td>

                            <td className="px-5 py-4">
                              {row.assessmentsCount}
                            </td>

                            <td className="px-5 py-4">
                              {formatCoefficient(
                                row.coefficientTotal,
                              )}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-gray-500">
                    {filteredSubjectRows.length} résultat
                    {filteredSubjectRows.length > 1
                      ? "s"
                      : ""}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="sn-btn-ghost sn-press"
                      disabled={page <= 1}
                      onClick={() =>
                        setPage((current) =>
                          Math.max(
                            1,
                            current - 1,
                          ),
                        )
                      }
                    >
                      ← Précédent
                    </button>

                    <span className="rounded-xl bg-gray-50 px-3 py-2 font-medium">
                      Page {page} / {totalPages}
                    </span>

                    <button
                      type="button"
                      className="sn-btn-ghost sn-press"
                      disabled={
                        page >= totalPages
                      }
                      onClick={() =>
                        setPage((current) =>
                          Math.min(
                            totalPages,
                            current + 1,
                          ),
                        )
                      }
                    >
                      Suivant →
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}