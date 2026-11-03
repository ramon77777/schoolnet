import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getTeacherReportCardErrorMessage,
  getTeacherReportCardSubjects,
  updateTeacherReportCardComment,
  type TeacherReportCardSubject,
} from "@/features/report-cards/lib/teacherReportCardsApi";

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

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function formatAverage(
  value: number | string | null | undefined,
) {
  const numeric = numericValue(value);

  if (numeric === null) {
    return "—";
  }

  return `${numeric
    .toFixed(2)
    .replace(".", ",")} / 20`;
}

function statusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Brouillon";

    case "published":
      return "Publié";

    case "locked":
      return "Verrouillé";

    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "draft":
      return "bg-amber-50 text-amber-700";

    case "published":
      return "bg-emerald-50 text-emerald-700";

    case "locked":
      return "bg-slate-100 text-slate-600";

    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function TeacherReportCards() {
  const [
    rows,
    setRows,
  ] = useState<
    TeacherReportCardSubject[]
  >([]);

  const [
    comments,
    setComments,
  ] = useState<
    Record<string, string>
  >({});

  const [
    selectedClassId,
    setSelectedClassId,
  ] = useState("all");

  const [
    selectedPeriodId,
    setSelectedPeriodId,
  ] = useState("all");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    savingId,
    setSavingId,
  ] = useState<string | null>(
    null,
  );

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

  const loadData =
    useCallback(
      async () => {
        setLoading(true);
        setErrorMessage(null);

        try {
          const data =
            await getTeacherReportCardSubjects();

          setRows(data);

          const nextComments:
            Record<string, string> =
              {};

          for (
            const item
            of data
          ) {
            nextComments[
              item.report_card_subject_id
            ] =
              item.teacher_comment ??
              "";
          }

          setComments(
            nextComments,
          );
        } catch (error) {
          console.error(
            "Impossible de charger les appréciations.",
            error,
          );

          setRows([]);

          setErrorMessage(
            getTeacherReportCardErrorMessage(
              error,
            ),
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const classes =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      for (
        const row
        of rows
      ) {
        map.set(
          row.class_id,
          row.class_name,
        );
      }

      return Array.from(
        map.entries(),
      )
        .map(
          ([
            id,
            name,
          ]) => ({
            id,
            name,
          }),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              "fr",
            ),
        );
    }, [rows]);

  const periods =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      for (
        const row
        of rows
      ) {
        map.set(
          row.period_id,
          row.period_name,
        );
      }

      return Array.from(
        map.entries(),
      )
        .map(
          ([
            id,
            name,
          ]) => ({
            id,
            name,
          }),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              "fr",
            ),
        );
    }, [rows]);

  const filteredRows =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLocaleLowerCase(
            "fr",
          );

      return rows.filter(
        (row) => {
          if (
            selectedClassId !==
              "all" &&
            row.class_id !==
              selectedClassId
          ) {
            return false;
          }

          if (
            selectedPeriodId !==
              "all" &&
            row.period_id !==
              selectedPeriodId
          ) {
            return false;
          }

          if (
            normalizedSearch
          ) {
            const haystack =
              [
                row.student_name,
                row.class_name,
                row.subject_name,
                row.period_name,
              ]
                .join(" ")
                .toLocaleLowerCase(
                  "fr",
                );

            if (
              !haystack.includes(
                normalizedSearch,
              )
            ) {
              return false;
            }
          }

          return true;
        },
      );
    }, [
      rows,
      search,
      selectedClassId,
      selectedPeriodId,
    ]);

  const uniqueStudents =
    useMemo(
      () =>
        new Set(
          filteredRows.map(
            (row) =>
              row.student_id,
          ),
        ).size,
      [filteredRows],
    );

  const draftCount =
    useMemo(
      () =>
        filteredRows.filter(
          (row) =>
            row.report_card_status ===
            "draft",
        ).length,
      [filteredRows],
    );

  const commentsFilled =
    useMemo(
      () =>
        filteredRows.filter(
          (row) =>
            Boolean(
              (
                comments[
                  row
                    .report_card_subject_id
                ] ?? ""
              ).trim(),
            ),
        ).length,
      [
        comments,
        filteredRows,
      ],
    );

  async function handleSave(
    row: TeacherReportCardSubject,
  ) {
    const id =
      row.report_card_subject_id;

    if (
      row.report_card_status !==
      "draft"
    ) {
      return;
    }

    setSavingId(id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const value =
        comments[id] ?? "";

      const result =
        await updateTeacherReportCardComment(
          id,
          value,
        );

      setRows(
        (current) =>
          current.map(
            (item) =>
              item.report_card_subject_id ===
              id
                ? {
                    ...item,
                    teacher_comment:
                      result
                        ?.teacher_comment ??
                      null,
                  }
                : item,
          ),
      );

      setSuccessMessage(
        `L'appréciation de ${row.student_name} a été enregistrée.`,
      );
    } catch (error) {
      console.error(
        "Impossible d'enregistrer l'appréciation.",
        error,
      );

      setErrorMessage(
        getTeacherReportCardErrorMessage(
          error,
        ),
      );
    } finally {
      setSavingId(null);
    }
  }

  function resetFilters() {
    setSelectedClassId(
      "all",
    );

    setSelectedPeriodId(
      "all",
    );

    setSearch("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-blue-100 bg-gradient-to-r from-white via-white to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              📝
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Bulletins
              </p>

              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Appréciations
                des élèves
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Consultez les
                moyennes calculées
                et renseignez vos
                appréciations pour
                les matières qui
                vous sont
                affectées.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↻ Actualiser
          </button>
        </div>
      </section>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          ✅ {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          ⚠️ {errorMessage}
        </div>
      ) : null}

      <section>
        <div>
          <h2 className="text-base font-bold text-slate-950">
            Vue enseignant
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Les indicateurs
            s'adaptent aux
            filtres
            sélectionnés.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Élèves
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-950">
              {uniqueStudents}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Matières
              à renseigner
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-950">
              {
                filteredRows.length
              }
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Brouillons
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-950">
              {draftCount}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              Appréciations
              renseignées
            </p>

            <p className="mt-2 text-2xl font-bold text-slate-950">
              {
                commentsFilled
              }
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Filtres
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Retrouvez
              rapidement une
              classe, une période
              ou un élève.
            </p>
          </div>

          <button
            type="button"
            onClick={
              resetFilters
            }
            className="self-start rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Réinitialiser
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Classe
            </span>

            <select
              value={
                selectedClassId
              }
              onChange={(event) =>
                setSelectedClassId(
                  event.target
                    .value,
                )
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">
                Toutes les
                classes
              </option>

              {classes.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Période
            </span>

            <select
              value={
                selectedPeriodId
              }
              onChange={(event) =>
                setSelectedPeriodId(
                  event.target
                    .value,
                )
              }
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">
                Toutes les
                périodes
              </option>

              {periods.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">
              Recherche
            </span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target
                    .value,
                )
              }
              placeholder="Nom de l'élève, matière..."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-base font-bold text-slate-950">
            Appréciations
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {
              filteredRows.length
            }{" "}
            ligne
            {filteredRows.length >
            1
              ? "s"
              : ""}{" "}
            de bulletin.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
            Chargement des
            bulletins...
          </div>
        ) : filteredRows.length ===
          0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="text-3xl">
              📝
            </div>

            <h3 className="mt-3 text-base font-bold text-slate-950">
              Aucune
              appréciation
              disponible
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Aucun bulletin
              correspondant aux
              filtres sélectionnés
              ne vous est
              actuellement
              affecté.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredRows.map(
              (row) => {
                const id =
                  row.report_card_subject_id;

                const editable =
                  row.report_card_status ===
                  "draft";

                const isSaving =
                  savingId === id;

                return (
                  <article
                    key={id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">
                          {
                            row.class_name
                          }{" "}
                          •{" "}
                          {
                            row.period_name
                          }
                        </p>

                        <h3 className="mt-2 text-lg font-bold text-slate-950">
                          {
                            row.student_name
                          }
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          {
                            row.school_year_name
                          }
                        </p>
                      </div>

                      <span
                        className={[
                          "self-start rounded-full px-3 py-1 text-xs font-semibold",
                          statusClass(
                            row.report_card_status,
                          ),
                        ].join(
                          " ",
                        )}
                      >
                        {statusLabel(
                          row.report_card_status,
                        )}
                      </span>
                    </div>

                    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-500">
                            Matière
                          </p>

                          <p className="mt-1 font-bold text-slate-950">
                            {
                              row.subject_name
                            }
                          </p>
                        </div>

                        <div className="sm:text-right">
                          <p className="text-xs font-medium text-slate-500">
                            Moyenne
                          </p>

                          <p className="mt-1 text-lg font-bold text-blue-700">
                            {formatAverage(
                              row.subject_average,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-slate-500">
                        Coefficient :{" "}
                        {numericValue(
                          row.subject_coefficient,
                        ) ??
                          "—"}
                      </div>
                    </div>

                    <label className="mt-5 block">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-700">
                          Appréciation
                        </span>

                        <span className="text-xs text-slate-400">
                          {
                            (
                              comments[
                                id
                              ] ?? ""
                            ).length
                          }{" "}
                          caractère
                          {(
                            comments[
                              id
                            ] ?? ""
                          ).length >
                          1
                            ? "s"
                            : ""}
                        </span>
                      </div>

                      <textarea
                        value={
                          comments[
                            id
                          ] ?? ""
                        }
                        onChange={(
                          event,
                        ) =>
                          setComments(
                            (
                              current,
                            ) => ({
                              ...current,
                              [id]:
                                event
                                  .target
                                  .value,
                            }),
                          )
                        }
                        disabled={
                          !editable ||
                          isSaving
                        }
                        rows={4}
                        placeholder="Ex. Très bon travail. Les notions sont bien maîtrisées."
                        className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </label>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-500">
                        {editable
                          ? "Vous pouvez modifier cette appréciation tant que le bulletin reste en brouillon."
                          : "Ce bulletin n'est plus modifiable par l'enseignant."}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          void handleSave(
                            row,
                          )
                        }
                        disabled={
                          !editable ||
                          isSaving
                        }
                        className="shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {isSaving
                          ? "Enregistrement..."
                          : "✓ Enregistrer"}
                      </button>
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>
    </div>
  );
}