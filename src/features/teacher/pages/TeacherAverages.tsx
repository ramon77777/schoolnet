import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

type TeacherClassRow = {
  class_id: string;
  class_name: string;
  school_year_id: string | null;
};

type AverageResultRow = {
  student_id: string;
  student_name: string | null;
  period_id: string;
  period_name: string;
  general_average: number | string | null;
  rank_position: number | string | null;
  ranked_students_count: number | string | null;
};

type SubjectAverageRow = {
  subject_id: string;
  subject_name: string;
  subject_average: number | string | null;
  assessments_count: number | string | null;
  assessments_coefficient_total: number | string | null;
};

type PeriodOption = {
  id: string;
  name: string;
};

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function numberValue(
  value: number | string | null | undefined,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatAverage(
  value: number | string | null | undefined,
) {
  const numericValue = numberValue(value);

  if (numericValue === null) {
    return "—";
  }

  return `${numericValue
    .toFixed(2)
    .replace(".", ",")}/20`;
}

function formatNumber(
  value: number | string | null | undefined,
) {
  const numericValue = numberValue(value);

  if (numericValue === null) {
    return "—";
  }

  return numericValue.toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
  });
}

export default function TeacherAverages() {
  const [classes, setClasses] =
    useState<TeacherClassRow[]>([]);

  const [results, setResults] =
    useState<AverageResultRow[]>([]);

  const [selectedClassId, setSelectedClassId] =
    useState("");

  const [selectedPeriodId, setSelectedPeriodId] =
    useState("all");

  const [search, setSearch] = useState("");

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [loadingClasses, setLoadingClasses] =
    useState(true);

  const [loadingResults, setLoadingResults] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [detailRow, setDetailRow] =
    useState<AverageResultRow | null>(null);

  const [subjectAverages, setSubjectAverages] =
    useState<SubjectAverageRow[]>([]);

  const [loadingDetails, setLoadingDetails] =
    useState(false);

  const loadClasses = useCallback(async () => {
    setLoadingClasses(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc(
        "teacher_average_classes",
      );

      if (error) {
        throw error;
      }

      const rows =
        (data ?? []) as unknown as TeacherClassRow[];

      setClasses(rows);

      setSelectedClassId((current) => {
        if (
          current &&
          rows.some(
            (item) => item.class_id === current,
          )
        ) {
          return current;
        }

        return rows[0]?.class_id ?? "";
      });
    } catch (error) {
      console.error(
        "Impossible de charger les classes de l'enseignant.",
        error,
      );

      setErrorMessage(
        "Impossible de charger vos classes.",
      );
    } finally {
      setLoadingClasses(false);
    }
  }, []);

  const loadResults = useCallback(
    async (classId: string) => {
      if (!classId) {
        setResults([]);
        return;
      }

      setLoadingResults(true);
      setErrorMessage(null);

      try {
        const { data, error } = await supabase.rpc(
          "teacher_class_average_results",
          {
            p_class_id: classId,
            p_period_id: null,
          },
        );

        if (error) {
          throw error;
        }

        setResults(
          (data ?? []) as unknown as AverageResultRow[],
        );
      } catch (error) {
        console.error(
          "Impossible de charger les moyennes de la classe.",
          error,
        );

        setResults([]);

        setErrorMessage(
          "Impossible de charger les moyennes de cette classe.",
        );
      } finally {
        setLoadingResults(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  useEffect(() => {
    setSelectedPeriodId("all");
    setSearch("");
    setPage(1);
    setDetailRow(null);
    setSubjectAverages([]);

    if (selectedClassId) {
      void loadResults(selectedClassId);
    } else {
      setResults([]);
    }
  }, [selectedClassId, loadResults]);

  const periods = useMemo<PeriodOption[]>(() => {
    const map = new Map<string, string>();

    results.forEach((row) => {
      if (!map.has(row.period_id)) {
        map.set(
          row.period_id,
          row.period_name || "Période",
        );
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({
        id,
        name,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "fr"),
      );
  }, [results]);

  const selectedClass = useMemo(
    () =>
      classes.find(
        (item) =>
          item.class_id === selectedClassId,
      ) ?? null,
    [classes, selectedClassId],
  );

  const filteredResults = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return results.filter((row) => {
      if (
        selectedPeriodId !== "all" &&
        row.period_id !== selectedPeriodId
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        row.student_name ?? "",
        row.period_name ?? "",
      ].some((value) =>
        value
          .toLowerCase()
          .includes(normalizedSearch),
      );
    });
  }, [
    results,
    search,
    selectedPeriodId,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredResults.length / pageSize,
    ),
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedResults = useMemo(() => {
    const start = (page - 1) * pageSize;

    return filteredResults.slice(
      start,
      start + pageSize,
    );
  }, [
    filteredResults,
    page,
    pageSize,
  ]);

  const studentsCount = useMemo(
    () =>
      new Set(
        filteredResults.map(
          (row) => row.student_id,
        ),
      ).size,
    [filteredResults],
  );

  const averageOfClass = useMemo(() => {
    const values = filteredResults
      .map((row) =>
        numberValue(row.general_average),
      )
      .filter(
        (value): value is number =>
          value !== null,
      );

    if (values.length === 0) {
      return null;
    }

    return (
      values.reduce(
        (total, value) =>
          total + value,
        0,
      ) / values.length
    );
  }, [filteredResults]);

  async function openDetails(
    row: AverageResultRow,
  ) {
    if (!selectedClassId) {
      return;
    }

    setDetailRow(row);
    setSubjectAverages([]);
    setLoadingDetails(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc(
        "teacher_student_subject_averages",
        {
          p_class_id: selectedClassId,
          p_student_id: row.student_id,
          p_period_id: row.period_id,
        },
      );

      if (error) {
        throw error;
      }

      setSubjectAverages(
        (data ?? []) as unknown as SubjectAverageRow[],
      );
    } catch (error) {
      console.error(
        "Impossible de charger le détail des moyennes.",
        error,
      );

      setErrorMessage(
        "Impossible de charger le détail de cet élève.",
      );
    } finally {
      setLoadingDetails(false);
    }
  }

  async function refresh() {
    await loadClasses();

    if (selectedClassId) {
      await loadResults(selectedClassId);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Moyennes
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Consultez les moyennes et classements
            des classes que vous enseignez.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
          className="sn-btn-ghost sn-press"
        >
          ↻ Actualiser
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="sn-card p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Classe
            </label>

            <select
              value={selectedClassId}
              disabled={loadingClasses}
              onChange={(event) => {
                setSelectedClassId(
                  event.target.value,
                );
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              {classes.length === 0 && (
                <option value="">
                  Aucune classe disponible
                </option>
              )}

              {classes.map((item) => (
                <option
                  key={item.class_id}
                  value={item.class_id}
                >
                  {item.class_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Période
            </label>

            <select
              value={selectedPeriodId}
              onChange={(event) => {
                setSelectedPeriodId(
                  event.target.value,
                );
                setPage(1);
                setDetailRow(null);
                setSubjectAverages([]);
              }}
              disabled={!selectedClassId}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">
                Toutes les périodes
              </option>

              {periods.map((period) => (
                <option
                  key={period.id}
                  value={period.id}
                >
                  {period.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Recherche
            </label>

            <input
              type="search"
              value={search}
              placeholder="Rechercher un élève..."
              onChange={(event) => {
                setSearch(
                  event.target.value,
                );
                setPage(1);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            Classe
          </div>

          <div className="mt-2 text-2xl font-bold text-gray-900">
            {selectedClass?.class_name ?? "—"}
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            Élèves classés
          </div>

          <div className="mt-2 text-2xl font-bold text-blue-600">
            {studentsCount}
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            Résultats
          </div>

          <div className="mt-2 text-2xl font-bold text-violet-600">
            {filteredResults.length}
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="text-sm text-gray-500">
            Moyenne de classe
          </div>

          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {formatAverage(
              averageOfClass,
            )}
          </div>
        </div>
      </div>

      <div className="sn-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold text-gray-900">
              Résultats de la classe
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Moyennes générales et rangs par
              période.
            </div>
          </div>

          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(
                Number(event.target.value),
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
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

        {loadingResults ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Chargement des moyennes…
          </div>
        ) : !selectedClassId ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Aucune classe n'est associée à votre
            compte enseignant.
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            Aucun résultat disponible pour les
            critères sélectionnés.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-4">
                      Élève
                    </th>

                    <th className="px-5 py-4">
                      Période
                    </th>

                    <th className="px-5 py-4">
                      Moyenne
                    </th>

                    <th className="px-5 py-4">
                      Rang
                    </th>

                    <th className="px-5 py-4 text-right">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {paginatedResults.map(
                    (row) => {
                      const rank =
                        numberValue(
                          row.rank_position,
                        );

                      const total =
                        numberValue(
                          row.ranked_students_count,
                        );

                      return (
                        <tr
                          key={`${row.student_id}-${row.period_id}`}
                          className="hover:bg-gray-50/80"
                        >
                          <td className="px-5 py-4 font-semibold text-gray-900">
                            {row.student_name ||
                              "Élève"}
                          </td>

                          <td className="px-5 py-4 text-sm text-gray-600">
                            {row.period_name}
                          </td>

                          <td className="px-5 py-4 font-bold text-blue-600">
                            {formatAverage(
                              row.general_average,
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              {rank !== null &&
                              total !== null
                                ? `${rank}/${total}`
                                : "—"}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                void openDetails(
                                  row,
                                );
                              }}
                              className="rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                            >
                              Voir le détail
                            </button>
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-500">
                {filteredResults.length} résultat
                {filteredResults.length > 1
                  ? "s"
                  : ""}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((current) =>
                      Math.max(
                        1,
                        current - 1,
                      ),
                    )
                  }
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Précédent
                </button>

                <div className="rounded-xl bg-gray-50 px-4 py-2 text-sm font-semibold">
                  Page {page} / {totalPages}
                </div>

                <button
                  type="button"
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
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Suivant →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {detailRow && (
        <div className="sn-card overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Détail des moyennes
              </div>

              <h2 className="mt-1 text-lg font-bold text-gray-900">
                {detailRow.student_name ||
                  "Élève"}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {detailRow.period_name} ·{" "}
                {formatAverage(
                  detailRow.general_average,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setDetailRow(null);
                setSubjectAverages([]);
              }}
              className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
            >
              Fermer
            </button>
          </div>

          {loadingDetails ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Chargement du détail…
            </div>
          ) : subjectAverages.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Aucun détail par matière disponible.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left">
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
                  {subjectAverages.map(
                    (subject) => (
                      <tr
                        key={subject.subject_id}
                      >
                        <td className="px-5 py-4 font-semibold text-gray-900">
                          {subject.subject_name}
                        </td>

                        <td className="px-5 py-4 font-bold text-blue-600">
                          {formatAverage(
                            subject.subject_average,
                          )}
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {formatNumber(
                            subject.assessments_count,
                          )}
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {formatNumber(
                            subject.assessments_coefficient_total,
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
      )}
    </div>
  );
}