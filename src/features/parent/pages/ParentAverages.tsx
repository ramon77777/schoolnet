import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

type ParentProfileRow = {
  id: string;
  child_ids: string[] | null;
};

type ChildProfileRow = {
  id: string;
  full_name: string | null;
  class_name: string | null;
  role: string | null;
};

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string | null;
};

type ChildView = {
  id: string;
  name: string;
  classLabel: string;
};

type GradingPeriodRow = {
  id: string;
  code: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  scale: number | string | null;
  is_published: boolean | null;
};

type AcademicSubjectRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number | null;
  is_active: boolean | null;
};

type PeriodAverageRow = {
  student_id: string;
  period_id: string;
  general_average: number | string | null;
  subjects_count: number | string | null;
  subjects_coefficient_total: number | string | null;
};

type SubjectAverageRow = {
  student_id: string;
  subject_id: string;
  period_id: string;
  subject_average: number | string | null;
  assessments_count: number | string | null;
  assessments_coefficient_total: number | string | null;
};

type RankingRow = {
  student_id: string;
  period_id: string;
  class_id: string | null;
  general_average: number | string | null;
  rank_position: number | string | null;
  ranked_students_count: number | string | null;
};

type SubjectAverageView = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  average: number;
  assessmentsCount: number;
  coefficientTotal: number;
  sortOrder: number;
};

const DEFAULT_PAGE_SIZE = 10;

function toNumber(
  value: number | string | null | undefined,
  fallback = 0,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  ).format(date);
}

export default function ParentAverages() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [children, setChildren] =
    useState<ChildView[]>([]);

  const [periods, setPeriods] =
    useState<GradingPeriodRow[]>([]);

  const [subjects, setSubjects] =
    useState<AcademicSubjectRow[]>([]);

  const [
    periodAverages,
    setPeriodAverages,
  ] = useState<PeriodAverageRow[]>([]);

  const [
    subjectAverages,
    setSubjectAverages,
  ] = useState<SubjectAverageRow[]>([]);

  const [rankings, setRankings] =
    useState<RankingRow[]>([]);

  const [
    selectedChildId,
    setSelectedChildId,
  ] = useState("");

  const [
    selectedPeriodId,
    setSelectedPeriodId,
  ] = useState("");

  const [search, setSearch] =
    useState("");

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(DEFAULT_PAGE_SIZE);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (
        !user ||
        user.isDemo
      ) {
        setChildren([]);
        setPeriods([]);
        setSubjects([]);
        setPeriodAverages([]);
        setSubjectAverages([]);
        setRankings([]);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        if (!silent) {
          setLoading(true);
        }

        setError(null);

        /*
         * 1. Profil du Parent / Tuteur.
         */
        const {
          data: parentProfileData,
          error: parentProfileError,
        } = await supabase
          .from("profiles")
          .select("id, child_ids")
          .eq("id", user.id)
          .eq("role", "parent")
          .maybeSingle();

        if (parentProfileError) {
          throw parentProfileError;
        }

        const parentProfile =
          parentProfileData as
            | ParentProfileRow
            | null;

        if (!parentProfile) {
          throw new Error(
            "Le profil Parent / Tuteur est introuvable.",
          );
        }

        const childIds = Array.from(
          new Set(
            (
              parentProfile.child_ids ??
              []
            ).filter(
              (
                childId,
              ): childId is string =>
                typeof childId ===
                  "string" &&
                childId.trim().length >
                  0,
            ),
          ),
        );

        if (
          childIds.length === 0
        ) {
          setChildren([]);
          setPeriods([]);
          setSubjects([]);
          setPeriodAverages([]);
          setSubjectAverages([]);
          setRankings([]);
          setSelectedChildId("");
          setSelectedPeriodId("");
          return;
        }

        /*
         * 2. Charger les profils des enfants.
         */
        const {
          data: childProfilesData,
          error: childProfilesError,
        } = await supabase
          .from("profiles")
          .select(
            `
              id,
              full_name,
              class_name,
              role
            `,
          )
          .in("id", childIds)
          .eq("role", "student")
          .order("full_name");

        if (childProfilesError) {
          throw childProfilesError;
        }

        const childProfiles =
          (childProfilesData ??
            []) as unknown as ChildProfileRow[];

        /*
         * 3. Charger toutes les données scolaires
         * nécessaires au module.
         */
        const [
          periodsResult,
          subjectsResult,
          periodAverageResult,
          subjectAverageResult,
          rankingsResult,
          classStudentsResult,
        ] = await Promise.all([
          supabase
            .from(
              "grading_periods",
            )
            .select(
              `
                id,
                code,
                name,
                starts_on,
                ends_on,
                scale,
                is_published
              `,
            )
            .eq(
              "is_published",
              true,
            )
            .order("starts_on", {
              ascending: false,
            }),

          supabase
            .from(
              "academic_subjects",
            )
            .select(
              `
                id,
                code,
                name,
                sort_order,
                is_active
              `,
            )
            .order(
              "sort_order",
              {
                ascending: true,
              },
            )
            .order("name", {
              ascending: true,
            }),

          supabase
            .from(
              "student_period_averages",
            )
            .select(
              `
                student_id,
                period_id,
                general_average,
                subjects_count,
                subjects_coefficient_total
              `,
            )
            .in(
              "student_id",
              childIds,
            ),

          supabase
            .from(
              "student_subject_averages",
            )
            .select(
              `
                student_id,
                subject_id,
                period_id,
                subject_average,
                assessments_count,
                assessments_coefficient_total
              `,
            )
            .in(
              "student_id",
              childIds,
            ),

          supabase
            .from(
              "student_period_rankings",
            )
            .select(
              `
                student_id,
                period_id,
                class_id,
                general_average,
                rank_position,
                ranked_students_count
              `,
            )
            .in(
              "student_id",
              childIds,
            ),

          /*
           * Important :
           * la vraie appartenance de l'élève
           * à une classe vient de class_students.
           */
          supabase
            .from("class_students")
            .select(
              `
                student_id,
                class_id
              `,
            )
            .in(
              "student_id",
              childIds,
            ),
        ]);

        if (
          periodsResult.error
        ) {
          throw periodsResult.error;
        }

        if (
          subjectsResult.error
        ) {
          throw subjectsResult.error;
        }

        if (
          periodAverageResult.error
        ) {
          throw periodAverageResult.error;
        }

        if (
          subjectAverageResult.error
        ) {
          throw subjectAverageResult.error;
        }

        if (
          rankingsResult.error
        ) {
          throw rankingsResult.error;
        }

        if (
          classStudentsResult.error
        ) {
          throw classStudentsResult.error;
        }

        const periodRows =
          (periodsResult.data ??
            []) as unknown as GradingPeriodRow[];

        const subjectRows =
          (subjectsResult.data ??
            []) as unknown as AcademicSubjectRow[];

        const averageRows =
          (periodAverageResult.data ??
            []) as unknown as PeriodAverageRow[];

        const subjectAverageRows =
          (subjectAverageResult.data ??
            []) as unknown as SubjectAverageRow[];

        const rankingRows =
          (rankingsResult.data ??
            []) as unknown as RankingRow[];

        const classStudentRows =
          (classStudentsResult.data ??
            []) as unknown as ClassStudentRow[];

        /*
         * 4. Récupérer les classes réellement
         * associées aux élèves.
         *
         * On utilise :
         * - class_students
         * - les class_id déjà présentes dans
         *   student_period_rankings
         */
        const classIds = Array.from(
          new Set(
            [
              ...classStudentRows.map(
                (row) =>
                  row.class_id,
              ),

              ...rankingRows
                .map(
                  (row) =>
                    row.class_id,
                )
                .filter(
                  (
                    classId,
                  ): classId is string =>
                    typeof classId ===
                      "string" &&
                    classId.trim()
                      .length > 0,
                ),
            ].filter(
              (
                classId,
              ): classId is string =>
                typeof classId ===
                  "string" &&
                classId.trim()
                  .length > 0,
            ),
          ),
        );

        let classRows: ClassRow[] =
          [];

        if (classIds.length > 0) {
          const {
            data: classesData,
            error: classesError,
          } = await supabase
            .from("classes")
            .select(
              `
                id,
                name
              `,
            )
            .in(
              "id",
              classIds,
            );

          if (classesError) {
            throw classesError;
          }

          classRows =
            (classesData ??
              []) as unknown as ClassRow[];
        }

        const classById =
          new Map<
            string,
            ClassRow
          >(
            classRows.map(
              (classRow) => [
                classRow.id,
                classRow,
              ],
            ),
          );

        const profileById =
          new Map<
            string,
            ChildProfileRow
          >(
            childProfiles.map(
              (profile) => [
                profile.id,
                profile,
              ],
            ),
          );

        /*
         * L'ordre des périodes est déjà du
         * plus récent au plus ancien.
         *
         * Cela permet de privilégier la classe
         * liée au classement le plus récent.
         */
        const periodOrder =
          new Map<
            string,
            number
          >(
            periodRows.map(
              (
                period,
                index,
              ) => [
                period.id,
                index,
              ],
            ),
          );

        const getClassLabelForStudent =
          (
            studentId: string,
            profile:
              | ChildProfileRow
              | undefined,
          ) => {
            /*
             * Priorité 1 :
             * classe réellement utilisée
             * par le moteur de classement.
             */
            const rankingClass =
              rankingRows
                .filter(
                  (row) =>
                    row.student_id ===
                      studentId &&
                    Boolean(
                      row.class_id,
                    ),
                )
                .sort(
                  (a, b) =>
                    (
                      periodOrder.get(
                        a.period_id,
                      ) ?? 9999
                    ) -
                    (
                      periodOrder.get(
                        b.period_id,
                      ) ?? 9999
                    ),
                )
                .find(
                  (row) =>
                    row.class_id &&
                    classById.has(
                      row.class_id,
                    ),
                );

            if (
              rankingClass?.class_id
            ) {
              const className =
                classById
                  .get(
                    rankingClass.class_id,
                  )
                  ?.name?.trim();

              if (className) {
                return className;
              }
            }

            /*
             * Priorité 2 :
             * appartenance enregistrée
             * dans class_students.
             */
            const membership =
              classStudentRows.find(
                (row) =>
                  row.student_id ===
                  studentId &&
                  classById.has(
                    row.class_id,
                  ),
              );

            if (membership) {
              const className =
                classById
                  .get(
                    membership.class_id,
                  )
                  ?.name?.trim();

              if (className) {
                return className;
              }
            }

            /*
             * Priorité 3 :
             * ancien champ profiles.class_name
             * uniquement comme solution
             * de secours.
             */
            const fallbackClassName =
              profile?.class_name?.trim();

            if (
              fallbackClassName
            ) {
              return fallbackClassName;
            }

            return "Classe non renseignée";
          };

        /*
         * 5. Construire les enfants avec leur
         * vraie classe.
         */
        const finalChildren =
          childIds
            .map((childId) => {
              const profile =
                profileById.get(
                  childId,
                );

              if (!profile) {
                return null;
              }

              return {
                id: profile.id,

                name:
                  profile.full_name?.trim() ||
                  "Élève",

                classLabel:
                  getClassLabelForStudent(
                    profile.id,
                    profile,
                  ),
              };
            })
            .filter(
              (
                child,
              ): child is ChildView =>
                child !== null,
            );

        setChildren(
          finalChildren,
        );

        setPeriods(
          periodRows,
        );

        setSubjects(
          subjectRows,
        );

        setPeriodAverages(
          averageRows,
        );

        setSubjectAverages(
          subjectAverageRows,
        );

        setRankings(
          rankingRows,
        );

        /*
         * 6. Sélection automatique du premier
         * enfant puis de sa première période
         * disponible.
         */
        const nextChildId =
          finalChildren.some(
            (child) =>
              child.id ===
              selectedChildId,
          )
            ? selectedChildId
            : finalChildren[0]
                ?.id ?? "";

        setSelectedChildId(
          nextChildId,
        );

        const childPeriodIds =
          averageRows
            .filter(
              (row) =>
                row.student_id ===
                nextChildId,
            )
            .map(
              (row) =>
                row.period_id,
            );

        const currentPeriodStillValid =
          childPeriodIds.includes(
            selectedPeriodId,
          );

        if (
          currentPeriodStillValid
        ) {
          return;
        }

        const firstAvailablePeriod =
          periodRows.find(
            (period) =>
              childPeriodIds.includes(
                period.id,
              ),
          );

        setSelectedPeriodId(
          firstAvailablePeriod?.id ??
            childPeriodIds[0] ??
            "",
        );
      } catch (err) {
        console.error(
          "[ParentAverages] loadData error:",
          err,
        );

        setError(
          "Impossible de charger les moyennes des enfants liés à ce compte.",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      user,
      selectedChildId,
      selectedPeriodId,
    ],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadData();
  }, [
    authLoading,
    loadData,
  ]);

  /*
   * Enfant actuellement sélectionné.
   */
  const selectedChild =
    useMemo(
      () =>
        children.find(
          (child) =>
            child.id ===
            selectedChildId,
        ) ?? null,
      [
        children,
        selectedChildId,
      ],
    );

  /*
   * Périodes réellement disponibles
   * pour l'enfant sélectionné.
   */
  const availablePeriods =
    useMemo(() => {
      const periodIds =
        new Set(
          periodAverages
            .filter(
              (row) =>
                row.student_id ===
                selectedChildId,
            )
            .map(
              (row) =>
                row.period_id,
            ),
        );

      return periods.filter(
        (period) =>
          periodIds.has(
            period.id,
          ),
      );
    }, [
      periodAverages,
      periods,
      selectedChildId,
    ]);

  /*
   * Moyenne générale sélectionnée.
   */
  const selectedPeriodAverage =
    useMemo(
      () =>
        periodAverages.find(
          (row) =>
            row.student_id ===
              selectedChildId &&
            row.period_id ===
              selectedPeriodId,
        ) ?? null,
      [
        periodAverages,
        selectedChildId,
        selectedPeriodId,
      ],
    );

  /*
   * Rang de l'enfant.
   */
  const selectedRanking =
    useMemo(
      () =>
        rankings.find(
          (row) =>
            row.student_id ===
              selectedChildId &&
            row.period_id ===
              selectedPeriodId,
        ) ?? null,
      [
        rankings,
        selectedChildId,
        selectedPeriodId,
      ],
    );

  const selectedPeriod =
    useMemo(
      () =>
        periods.find(
          (period) =>
            period.id ===
            selectedPeriodId,
        ) ?? null,
      [
        periods,
        selectedPeriodId,
      ],
    );

  /*
   * Référentiel des matières.
   */
  const subjectById =
    useMemo(
      () =>
        new Map(
          subjects.map(
            (subject) => [
              subject.id,
              subject,
            ],
          ),
        ),
      [subjects],
    );

  /*
   * Moyennes par matière.
   */
  const subjectRows =
    useMemo<
      SubjectAverageView[]
    >(() => {
      return subjectAverages
        .filter(
          (row) =>
            row.student_id ===
              selectedChildId &&
            row.period_id ===
              selectedPeriodId,
        )
        .map((row) => {
          const subject =
            subjectById.get(
              row.subject_id,
            );

          return {
            subjectId:
              row.subject_id,

            subjectName:
              subject?.name ??
              "Matière",

            subjectCode:
              subject?.code ??
              "",

            average:
              toNumber(
                row.subject_average,
              ),

            assessmentsCount:
              toNumber(
                row.assessments_count,
              ),

            coefficientTotal:
              toNumber(
                row.assessments_coefficient_total,
              ),

            sortOrder:
              subject?.sort_order ??
              9999,
          };
        })
        .sort(
          (a, b) =>
            a.sortOrder -
              b.sortOrder ||
            a.subjectName.localeCompare(
              b.subjectName,
              "fr",
            ),
        );
    }, [
      selectedChildId,
      selectedPeriodId,
      subjectAverages,
      subjectById,
    ]);

  /*
   * Recherche matières.
   */
  const filteredSubjects =
    useMemo(() => {
      const normalizedSearch =
        search
          .trim()
          .toLocaleLowerCase(
            "fr",
          );

      if (!normalizedSearch) {
        return subjectRows;
      }

      return subjectRows.filter(
        (row) =>
          row.subjectName
            .toLocaleLowerCase(
              "fr",
            )
            .includes(
              normalizedSearch,
            ) ||
          row.subjectCode
            .toLocaleLowerCase(
              "fr",
            )
            .includes(
              normalizedSearch,
            ),
      );
    }, [
      search,
      subjectRows,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredSubjects.length /
          pageSize,
      ),
    );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [
    page,
    totalPages,
  ]);

  const paginatedSubjects =
    useMemo(() => {
      const start =
        (page - 1) *
        pageSize;

      return filteredSubjects.slice(
        start,
        start + pageSize,
      );
    }, [
      filteredSubjects,
      page,
      pageSize,
    ]);

  const isLoading =
    authLoading || loading;

  const generalAverage =
    selectedPeriodAverage
      ? toNumber(
          selectedPeriodAverage.general_average,
        )
      : null;

  const subjectsCount =
    selectedPeriodAverage
      ? toNumber(
          selectedPeriodAverage.subjects_count,
        )
      : 0;

  const subjectsCoefficientTotal =
    selectedPeriodAverage
      ? toNumber(
          selectedPeriodAverage.subjects_coefficient_total,
        )
      : 0;

  const rankPosition =
    selectedRanking
      ? toNumber(
          selectedRanking.rank_position,
        )
      : 0;

  const rankedStudentsCount =
    selectedRanking
      ? toNumber(
          selectedRanking.ranked_students_count,
        )
      : 0;

  function handleChildChange(
    childId: string,
  ) {
    setSelectedChildId(
      childId,
    );

    setSearch("");
    setPage(1);

    const childPeriodIds =
      periodAverages
        .filter(
          (row) =>
            row.student_id ===
            childId,
        )
        .map(
          (row) =>
            row.period_id,
        );

    const firstPeriod =
      periods.find(
        (period) =>
          childPeriodIds.includes(
            period.id,
          ),
      );

    setSelectedPeriodId(
      firstPeriod?.id ??
        childPeriodIds[0] ??
        "",
    );
  }

  if (
    user?.isDemo
  ) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xl font-semibold">
            Moyennes
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Consultez les moyennes et classements de vos enfants.
          </div>
        </div>

        <div className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
          Mode démo actif : les données réelles des moyennes ne sont pas chargées.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Moyennes
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Consultez les moyennes, classements et résultats par matière de vos enfants.
          </div>
        </div>

        {!isLoading && (
          <button
            type="button"
            className="sn-btn-ghost"
            onClick={() =>
              void loadData(true)
            }
          >
            ↻ Actualiser
          </button>
        )}
      </div>

      {isLoading && (
        <div className="sn-card p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="h-12 rounded-xl bg-gray-100" />

            <div className="grid gap-4 md:grid-cols-4">
              {Array.from({
                length: 4,
              }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="h-28 rounded-2xl bg-gray-100"
                  />
                ),
              )}
            </div>
          </div>
        </div>
      )}

      {!isLoading &&
        error && (
          <div className="sn-card border border-red-200 bg-red-50 p-5">
            <div className="font-semibold text-red-700">
              Chargement impossible
            </div>

            <div className="mt-1 text-sm text-red-600">
              {error}
            </div>

            <button
              type="button"
              className="sn-btn-ghost mt-4"
              onClick={() =>
                void loadData()
              }
            >
              Réessayer
            </button>
          </div>
        )}

      {!isLoading &&
        !error &&
        children.length ===
          0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-base font-semibold">
              Aucun enfant lié
            </div>

            <div className="mt-2 text-sm text-gray-500">
              Aucun profil élève n&apos;est actuellement rattaché à ce compte Parent / Tuteur.
            </div>
          </div>
        )}

      {!isLoading &&
        !error &&
        children.length >
          0 && (
          <>
            <div className="sn-card p-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Enfant
                  </label>

                  <select
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    value={
                      selectedChildId
                    }
                    onChange={(
                      event,
                    ) =>
                      handleChildChange(
                        event.target
                          .value,
                      )
                    }
                  >
                    {children.map(
                      (child) => (
                        <option
                          key={
                            child.id
                          }
                          value={
                            child.id
                          }
                        >
                          {child.name} —{" "}
                          {
                            child.classLabel
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Période
                  </label>

                  <select
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    value={
                      selectedPeriodId
                    }
                    disabled={
                      availablePeriods.length ===
                      0
                    }
                    onChange={(
                      event,
                    ) => {
                      setSelectedPeriodId(
                        event
                          .target
                          .value,
                      );

                      setSearch(
                        "",
                      );

                      setPage(
                        1,
                      );
                    }}
                  >
                    {availablePeriods.length ===
                    0 ? (
                      <option value="">
                        Aucune période disponible
                      </option>
                    ) : (
                      availablePeriods.map(
                        (
                          period,
                        ) => (
                          <option
                            key={
                              period.id
                            }
                            value={
                              period.id
                            }
                          >
                            {
                              period.name
                            }
                          </option>
                        ),
                      )
                    )}
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

                      {selectedPeriod.scale
                        ? ` · Barème /${formatNumber(
                            toNumber(
                              selectedPeriod.scale,
                              20,
                            ),
                          )}`
                        : ""}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {selectedChild &&
              !selectedPeriodAverage && (
                <div className="sn-card p-8 text-center">
                  <div className="text-base font-semibold">
                    Aucune moyenne disponible
                  </div>

                  <div className="mt-2 text-sm text-gray-500">
                    Aucune moyenne publiée n&apos;est disponible pour{" "}
                    {selectedChild.name}.
                  </div>
                </div>
              )}

            {selectedChild &&
              selectedPeriodAverage && (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="sn-card p-5">
                      <div className="text-sm text-gray-500">
                        Élève
                      </div>

                      <div className="mt-3 text-xl font-bold text-gray-900">
                        {
                          selectedChild.name
                        }
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {
                          selectedChild.classLabel
                        }
                      </div>
                    </div>

                    <div className="sn-card p-5">
                      <div className="text-sm text-gray-500">
                        Moyenne générale
                      </div>

                      <div className="mt-3 text-2xl font-bold text-blue-600">
                        {generalAverage !==
                        null
                          ? `${formatNumber(
                              generalAverage,
                            )}/20`
                          : "—"}
                      </div>
                    </div>

                    <div className="sn-card p-5">
                      <div className="text-sm text-gray-500">
                        Rang
                      </div>

                      <div className="mt-3 text-2xl font-bold text-emerald-600">
                        {rankPosition >
                          0 &&
                        rankedStudentsCount >
                          0
                          ? `${rankPosition} / ${rankedStudentsCount}`
                          : "—"}
                      </div>
                    </div>

                    <div className="sn-card p-5">
                      <div className="text-sm text-gray-500">
                        Matières calculées
                      </div>

                      <div className="mt-3 text-2xl font-bold text-violet-600">
                        {
                          subjectsCount
                        }
                      </div>
                    </div>

                    <div className="sn-card p-5">
                      <div className="text-sm text-gray-500">
                        Total coefficients
                      </div>

                      <div className="mt-3 text-2xl font-bold text-amber-600">
                        {formatNumber(
                          subjectsCoefficientTotal,
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sn-card overflow-hidden">
                    <div className="border-b border-gray-100 px-5 py-4">
                      <div className="font-semibold text-gray-900">
                        Moyennes par matière
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        Détail des matières prises en compte pour la période sélectionnée.
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <input
                        type="search"
                        value={
                          search
                        }
                        onChange={(
                          event,
                        ) => {
                          setSearch(
                            event
                              .target
                              .value,
                          );

                          setPage(
                            1,
                          );
                        }}
                        placeholder="Rechercher une matière ou un code..."
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:max-w-sm"
                      />

                      <select
                        value={
                          pageSize
                        }
                        onChange={(
                          event,
                        ) => {
                          setPageSize(
                            Number(
                              event
                                .target
                                .value,
                            ),
                          );

                          setPage(
                            1,
                          );
                        }}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value={10}>
                          10 / page
                        </option>

                        <option value={25}>
                          25 / page
                        </option>

                        <option value={50}>
                          50 / page
                        </option>
                      </select>
                    </div>

                    {paginatedSubjects.length ===
                    0 ? (
                      <div className="px-5 py-10 text-center text-sm text-gray-500">
                        Aucun résultat disponible pour les critères sélectionnés.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
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
                            {paginatedSubjects.map(
                              (
                                row,
                              ) => (
                                <tr
                                  key={
                                    row.subjectId
                                  }
                                >
                                  <td className="px-5 py-4">
                                    <div className="font-semibold text-gray-900">
                                      {
                                        row.subjectName
                                      }
                                    </div>

                                    {row.subjectCode && (
                                      <div className="mt-0.5 text-xs text-gray-400">
                                        {
                                          row.subjectCode
                                        }
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-5 py-4 font-bold text-blue-600">
                                    {formatNumber(
                                      row.average,
                                    )}
                                    /20
                                  </td>

                                  <td className="px-5 py-4">
                                    {
                                      row.assessmentsCount
                                    }
                                  </td>

                                  <td className="px-5 py-4">
                                    {formatNumber(
                                      row.coefficientTotal,
                                    )}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-gray-500">
                        {
                          filteredSubjects.length
                        }{" "}
                        {filteredSubjects.length >
                        1
                          ? "résultats"
                          : "résultat"}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={
                            page <=
                            1
                          }
                          className="sn-btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() =>
                            setPage(
                              (
                                current,
                              ) =>
                                Math.max(
                                  1,
                                  current -
                                    1,
                                ),
                            )
                          }
                        >
                          ← Précédent
                        </button>

                        <div className="rounded-xl bg-gray-50 px-4 py-2 font-medium">
                          Page{" "}
                          {
                            page
                          }{" "}
                          /{" "}
                          {
                            totalPages
                          }
                        </div>

                        <button
                          type="button"
                          disabled={
                            page >=
                            totalPages
                          }
                          className="sn-btn-ghost disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() =>
                            setPage(
                              (
                                current,
                              ) =>
                                Math.min(
                                  totalPages,
                                  current +
                                    1,
                                ),
                            )
                          }
                        >
                          Suivant →
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
          </>
        )}
    </div>
  );
}