import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";
import ParentOfficialResults from "../components/ParentOfficialResults";
import { linkedStudentIds, type ParentLinkRow } from "../lib/parentChildViews";
import { isParentOfficialUuid, parentResultsUrl } from "../lib/parentOfficialResultsModel";

type AssessmentType =
  | "quiz"
  | "assignment"
  | "exam";

type SubmissionStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "published";

type AssessmentStatus =
  | "draft"
  | "published"
  | "closed";

type ResultStatus =
  | "not_submitted"
  | "submitted"
  | "graded"
  | "published";

type ChildProfileRow = {
  id: string;
  full_name: string | null;
  class_name: string | null;
};

type EnrollmentRow = {
  course_id: string;
  student_id: string;
};

type CourseRow = {
  id: string;
  title: string;
};

type AssessmentRow = {
  id: string;
  course_id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  max_score: number | null;
  due_at: string | null;
};

type AssessmentSubmissionRpcRow = {
  assessment_id: string;
  status: SubmissionStatus;
  score: number | string | null;
  submitted_at: string | null;
  published_at: string | null;
  feedback?: string | null;
};

type HomeworkSubmissionRpcRow = {
  homework_id: string;
  status: SubmissionStatus;
  score: number | string | null;
  submitted_at: string | null;
  published_at: string | null;
  feedback?: string | null;
};

type ParentChild = {
  id: string;
  label: string;
  classLabel: string;
};

type UnifiedSubmission = {
  childId: string;
  assessmentId: string;
  status: SubmissionStatus;
  score: number | null;
  submittedAt: string | null;
  publishedAt: string | null;
  feedback: string | null;
};

type ResultRow = {
  assessmentId: string;
  childId: string;
  childLabel: string;
  classLabel: string;
  title: string;
  type: AssessmentType;
  courseTitle: string;
  assessmentStatus: AssessmentStatus;
  resultStatus: ResultStatus;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  publishedAt: string | null;
  dueAt: string | null;
  feedback: string | null;
};

type TypeFilter =
  | "all"
  | AssessmentType;

const ITEMS_PER_PAGE = 10;

function typeBadgeClass(
  type: AssessmentType,
) {
  if (type === "exam") {
    return "sn-badge sn-badge-red";
  }

  if (type === "assignment") {
    return "sn-badge sn-badge-blue";
  }

  return "sn-badge sn-badge-gray";
}

function typeLabel(
  type: AssessmentType,
) {
  if (type === "exam") {
    return "Examen";
  }

  if (type === "assignment") {
    return "Devoir";
  }

  return "Quiz";
}

function resultStatusLabel(
  status: ResultStatus,
) {
  if (status === "published") {
    return "Publié";
  }

  if (status === "graded") {
    return "Corrigé (non publié)";
  }

  if (status === "submitted") {
    return "En attente";
  }

  return "Non soumis";
}

function resultStatusBadgeClass(
  status: ResultStatus,
) {
  if (status === "published") {
    return "sn-badge sn-badge-green";
  }

  if (status === "submitted") {
    return "sn-badge sn-badge-blue";
  }

  if (status === "graded") {
    return [
      "rounded-full",
      "bg-amber-50",
      "px-2.5",
      "py-1",
      "text-xs",
      "font-medium",
      "text-amber-700",
    ].join(" ");
  }

  return "sn-badge sn-badge-gray";
}

function safeLower(
  value: unknown,
) {
  return String(value ?? "")
    .toLowerCase();
}

function formatDate(
  iso: string | null,
) {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);

  if (
    Number.isNaN(date.getTime())
  ) {
    return iso;
  }

  return new Intl.DateTimeFormat(
    "fr-FR",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

function formatScore(
  value: number,
) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(".", ",")
    .replace(/,00$/, "");
}

function scoreLabel(
  score: number | null,
  maxScore: number | null,
) {
  if (score === null) {
    return "—";
  }

  if (maxScore === null) {
    return formatScore(score);
  }

  return `${formatScore(
    score,
  )} / ${formatScore(maxScore)}`;
}

function toNumber(
  value: number | string | null,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function submissionRank(
  status: SubmissionStatus,
) {
  if (status === "published") {
    return 4;
  }

  if (status === "graded") {
    return 3;
  }

  if (status === "submitted") {
    return 2;
  }

  return 1;
}

function dateTimestamp(
  value: string | null,
) {
  if (!value) {
    return 0;
  }

  const timestamp =
    new Date(value).getTime();

  return Number.isNaN(timestamp)
    ? 0
    : timestamp;
}

function choosePreferredSubmission(
  current: UnifiedSubmission | undefined,
  candidate: UnifiedSubmission,
) {
  if (!current) {
    return candidate;
  }

  const currentRank =
    submissionRank(current.status);

  const candidateRank =
    submissionRank(candidate.status);

  if (
    candidateRank >
    currentRank
  ) {
    return candidate;
  }

  if (
    candidateRank <
    currentRank
  ) {
    return current;
  }

  const currentDate = Math.max(
    dateTimestamp(
      current.publishedAt,
    ),
    dateTimestamp(
      current.submittedAt,
    ),
  );

  const candidateDate = Math.max(
    dateTimestamp(
      candidate.publishedAt,
    ),
    dateTimestamp(
      candidate.submittedAt,
    ),
  );

  return candidateDate >=
    currentDate
    ? candidate
    : current;
}

function getResultStatus(
  submission:
    | UnifiedSubmission
    | undefined,
): ResultStatus {
  if (!submission) {
    return "not_submitted";
  }

  if (
    submission.status ===
      "published" ||
    submission.publishedAt
  ) {
    return "published";
  }

  if (
    submission.status === "graded"
  ) {
    return "graded";
  }

  if (
    submission.status ===
    "submitted"
  ) {
    return "submitted";
  }

  /*
   * Une tentative "in_progress"
   * n'est pas encore une remise.
   * Pour le portail Parent,
   * elle reste donc "Non soumis".
   */
  return "not_submitted";
}

function LegacyParentResults() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [children, setChildren] =
    useState<ParentChild[]>([]);

  const [rows, setRows] =
    useState<ResultRow[]>([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const childParam = searchParams.get("childId");
  const selectedChild = isParentOfficialUuid(childParam) ? childParam : "all";
  const setSelectedChild = useCallback((childId: string) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("source", "legacy");
      if (childId === "all") next.delete("childId");
      else next.set("childId", childId);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const generation = useRef(0);

  const [filter, setFilter] =
    useState<TypeFilter>("all");

  const [query, setQuery] =
    useState("");

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadResults =
    useCallback(async () => {
      const run = ++generation.current;
      const current = () => generation.current === run;
      if (!user || user.isDemo || user.role !== "parent") {
        setChildren([]);
        setRows([]);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Only canonical family links grant access; profile child_ids is not authority.
        const { data: linkData, error: linkError } = await supabase
          .from("parent_links")
          .select("student_id")
          .eq("parent_id", user.id);
        if (linkError) throw linkError;
        if (!current()) return;
        const childIds = linkedStudentIds((linkData ?? []) as ParentLinkRow[]);

        if (
          childIds.length === 0
        ) {
          setChildren([]);
          setRows([]);
          return;
        }

        /*
         * 2. Profils des enfants.
         */

        const {
          data:
            childProfilesData,
          error:
            childProfilesError,
        } = await supabase
          .from("profiles")
          .select(
            `
            id,
            full_name,
            class_name
            `,
          )
          .in("id", childIds)
          .eq("role", "student")
          .order("full_name");

        if (
          childProfilesError
        ) {
          throw childProfilesError;
        }

        const childProfiles =
          (childProfilesData ??
            []) as ChildProfileRow[];

        const childProfileMap =
          new Map(
            childProfiles.map(
              (child) => [
                child.id,
                child,
              ],
            ),
          );

        const childrenOptions =
          childIds
            .map(
              (
                childId,
              ): ParentChild | null => {
                const child =
                  childProfileMap.get(
                    childId,
                  );

                if (!child) {
                  return null;
                }

                return {
                  id: child.id,

                  label:
                    child.full_name?.trim() ||
                    "Élève",

                  classLabel:
                    child.class_name?.trim() ||
                    "Classe non renseignée",
                };
              },
            )
            .filter(
              (
                child,
              ): child is ParentChild =>
                child !== null,
            );

        if (!current()) return;
        setChildren(childrenOptions);

        /*
         * 3. Inscriptions aux cours.
         */

        const {
          data: enrollmentData,
          error: enrollmentError,
        } = await supabase
          .from(
            "course_enrollments",
          )
          .select(
            "course_id, student_id",
          )
          .in(
            "student_id",
            childIds,
          );

        if (enrollmentError) {
          throw enrollmentError;
        }

        const enrollments =
          (enrollmentData ??
            []) as EnrollmentRow[];

        const courseIds =
          Array.from(
            new Set(
              enrollments
                .map(
                  (row) =>
                    row.course_id,
                )
                .filter(Boolean),
            ),
          );

        if (!current()) return;
        if (
          courseIds.length === 0
        ) {
          setRows([]);
          return;
        }

        const courseIdsByChild =
          new Map<
            string,
            Set<string>
          >();

        for (
          const enrollment of
          enrollments
        ) {
          const existing =
            courseIdsByChild.get(
              enrollment.student_id,
            ) ?? new Set<string>();

          existing.add(
            enrollment.course_id,
          );

          courseIdsByChild.set(
            enrollment.student_id,
            existing,
          );
        }

        /*
         * 4. Cours + évaluations.
         *
         * On inclut published et closed :
         * une évaluation fermée ne doit
         * pas disparaître de l'historique.
         */

        const [
          coursesResult,
          assessmentsResult,
        ] = await Promise.all([
          supabase
            .from("courses")
            .select("id, title")
            .in("id", courseIds),

          supabase
            .from("assessments")
            .select(
              `
              id,
              course_id,
              title,
              type,
              status,
              max_score,
              due_at
              `,
            )
            .in(
              "course_id",
              courseIds,
            )
            .in("status", [
              "published",
              "closed",
            ]),
        ]);

        if (
          coursesResult.error
        ) {
          throw coursesResult.error;
        }

        if (
          assessmentsResult.error
        ) {
          throw assessmentsResult.error;
        }

        const courses =
          (coursesResult.data ??
            []) as CourseRow[];

        const assessments =
          (assessmentsResult.data ??
            []) as AssessmentRow[];

        const courseMap =
          new Map(
            courses.map(
              (course) => [
                course.id,
                course.title,
              ],
            ),
          );

        /*
         * 5. Soumissions sécurisées.
         *
         * Une paire de RPC est appelée
         * pour chacun des enfants liés.
         */

        const submissionBundles =
          await Promise.all(
            childIds.map(
              async (childId) => {
                const [
                  assessmentResult,
                  homeworkResult,
                ] =
                  await Promise.all([
                    supabase.rpc(
                      "get_parent_child_assessment_submissions",
                      {
                        p_child_id:
                          childId,
                      },
                    ),

                    supabase.rpc(
                      "get_parent_child_homework_submissions",
                      {
                        p_child_id:
                          childId,
                      },
                    ),
                  ]);

                if (
                  assessmentResult.error
                ) {
                  throw assessmentResult.error;
                }

                if (
                  homeworkResult.error
                ) {
                  throw homeworkResult.error;
                }

                return {
                  childId,

                  assessmentRows:
                    (assessmentResult.data ??
                      []) as AssessmentSubmissionRpcRow[],

                  homeworkRows:
                    (homeworkResult.data ??
                      []) as HomeworkSubmissionRpcRow[],
                };
              },
            ),
          );

        /*
         * 6. Fusion des deux familles
         * de soumissions.
         */

        const submissionMap =
          new Map<
            string,
            UnifiedSubmission
          >();

        for (
          const bundle of
          submissionBundles
        ) {
          for (
            const row of
            bundle.assessmentRows
          ) {
            const candidate:
              UnifiedSubmission = {
              childId:
                bundle.childId,

              assessmentId:
                row.assessment_id,

              status:
                row.status,

              score:
                toNumber(row.score),

              submittedAt:
                row.submitted_at,

              publishedAt:
                row.published_at,

              feedback:
                row.feedback ??
                null,
            };

            const key =
              `${bundle.childId}:${row.assessment_id}`;

            const current =
              submissionMap.get(
                key,
              );

            submissionMap.set(
              key,
              choosePreferredSubmission(
                current,
                candidate,
              ),
            );
          }

          for (
            const row of
            bundle.homeworkRows
          ) {
            const candidate:
              UnifiedSubmission = {
              childId:
                bundle.childId,

              assessmentId:
                row.homework_id,

              status:
                row.status,

              score:
                toNumber(row.score),

              submittedAt:
                row.submitted_at,

              publishedAt:
                row.published_at,

              feedback:
                row.feedback ??
                null,
            };

            const key =
              `${bundle.childId}:${row.homework_id}`;

            const current =
              submissionMap.get(
                key,
              );

            submissionMap.set(
              key,
              choosePreferredSubmission(
                current,
                candidate,
              ),
            );
          }
        }

        /*
         * 7. Une ligne est construite
         * pour chaque évaluation
         * accessible à chaque enfant.
         *
         * Cela permet également
         * d'afficher "Non soumis".
         */

        const finalRows:
          ResultRow[] = [];

        for (
          const childId of childIds
        ) {
          const childProfile =
            childProfileMap.get(
              childId,
            );

          if (!childProfile) {
            continue;
          }

          const enrolledCourses =
            courseIdsByChild.get(
              childId,
            );

          if (!enrolledCourses) {
            continue;
          }

          for (
            const assessment of
            assessments
          ) {
            if (
              !enrolledCourses.has(
                assessment.course_id,
              )
            ) {
              continue;
            }

            const submission =
              submissionMap.get(
                `${childId}:${assessment.id}`,
              );

            const resultStatus =
              getResultStatus(
                submission,
              );

            const isPublished =
              resultStatus ===
              "published";

            finalRows.push({
              assessmentId:
                assessment.id,

              childId,

              childLabel:
                childProfile.full_name?.trim() ||
                "Élève",

              classLabel:
                childProfile.class_name?.trim() ||
                "Classe non renseignée",

              title:
                assessment.title,

              type:
                assessment.type,

              courseTitle:
                courseMap.get(
                  assessment.course_id,
                ) ?? "Cours",

              assessmentStatus:
                assessment.status,

              resultStatus,

              /*
               * IMPORTANT :
               * la note n'est exposée
               * au Parent qu'après
               * publication.
               */
              score:
                isPublished
                  ? submission?.score ??
                    null
                  : null,

              maxScore:
                assessment.max_score,

              submittedAt:
                submission?.submittedAt ??
                null,

              publishedAt:
                submission?.publishedAt ??
                null,

              dueAt:
                assessment.due_at,

              /*
               * Même règle pour le
               * feedback enseignant.
               */
              feedback:
                isPublished
                  ? submission?.feedback ??
                    null
                  : null,
            });
          }
        }

        if (current()) setRows(finalRows);
      } catch (err) {
        if (!current()) return;
        console.error(
          "[ParentResults] loadResults error:",
          err,
        );

        setError(
          "Impossible de charger les résultats.",
        );

        setChildren([]);
        setRows([]);
      } finally {
        if (current()) setLoading(false);
      }
    }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadResults();
    return () => { generation.current += 1; };
  }, [
    authLoading,
    loadResults,
  ]);

  useEffect(() => {
    if (loading || authLoading) return;
    if (
      selectedChild === "all"
    ) {
      return;
    }

    const stillExists =
      children.some(
        (child) =>
          child.id ===
          selectedChild,
      );

    if (!stillExists) {
      setSelectedChild("all");
    }
  }, [
    children,
    selectedChild,
    loading,
    authLoading,
    setSelectedChild,
  ]);

  /*
   * KPI : ils suivent le choix
   * d'enfant, mais pas encore
   * le filtre type / recherche.
   */

  const rowsForStats =
    useMemo(() => {
      if (
        selectedChild === "all"
      ) {
        return rows;
      }

      return rows.filter(
        (row) =>
          row.childId ===
          selectedChild,
      );
    }, [
      rows,
      selectedChild,
    ]);

  const stats = useMemo(() => {
    return {
      published:
        rowsForStats.filter(
          (row) =>
            row.resultStatus ===
            "published",
        ).length,

      graded:
        rowsForStats.filter(
          (row) =>
            row.resultStatus ===
            "graded",
        ).length,

      submitted:
        rowsForStats.filter(
          (row) =>
            row.resultStatus ===
            "submitted",
        ).length,

      notSubmitted:
        rowsForStats.filter(
          (row) =>
            row.resultStatus ===
            "not_submitted",
        ).length,
    };
  }, [rowsForStats]);

  /*
   * Recherche + filtres.
   */

  const filtered =
    useMemo(() => {
      const normalizedQuery =
        query
          .trim()
          .toLowerCase();

      return rows
        .filter((row) =>
          selectedChild === "all"
            ? true
            : row.childId ===
              selectedChild,
        )
        .filter((row) =>
          filter === "all"
            ? true
            : row.type === filter,
        )
        .filter((row) => {
          if (
            !normalizedQuery
          ) {
            return true;
          }

          const haystack = [
            row.childLabel,
            row.title,
            row.courseTitle,
            row.classLabel,
            typeLabel(row.type),
            resultStatusLabel(
              row.resultStatus,
            ),
          ]
            .map(safeLower)
            .join(" ");

          return haystack.includes(
            normalizedQuery,
          );
        })
        .sort((a, b) => {
          /*
           * On privilégie la date
           * de remise, puis
           * l'échéance.
           */
          const aTimestamp =
            Math.max(
              dateTimestamp(
                a.submittedAt,
              ),
              dateTimestamp(
                a.dueAt,
              ),
            );

          const bTimestamp =
            Math.max(
              dateTimestamp(
                b.submittedAt,
              ),
              dateTimestamp(
                b.dueAt,
              ),
            );

          return (
            bTimestamp -
            aTimestamp
          );
        });
    }, [
      rows,
      selectedChild,
      filter,
      query,
    ]);

  /*
   * Pagination : 10 éléments.
   */

  const totalPages = Math.max(
    1,
    Math.ceil(
      filtered.length /
        ITEMS_PER_PAGE,
    ),
  );

  const paginatedRows =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        ITEMS_PER_PAGE;

      return filtered.slice(
        start,
        start +
          ITEMS_PER_PAGE,
      );
    }, [
      filtered,
      currentPage,
    ]);

  const firstDisplayedItem =
    filtered.length === 0
      ? 0
      : (currentPage - 1) *
          ITEMS_PER_PAGE +
        1;

  const lastDisplayedItem =
    Math.min(
      currentPage *
        ITEMS_PER_PAGE,
      filtered.length,
    );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedChild,
    filter,
    query,
  ]);

  useEffect(() => {
    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(
        totalPages,
      );
    }
  }, [
    currentPage,
    totalPages,
  ]);

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Résultats des cours libres
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Consultez les évaluations
            de vos enfants, leur état
            de correction et les
            résultats publiés.
          </div>
        </div>

        {!user?.isDemo && (
          <button
            type="button"
            className="sn-btn-ghost"
            disabled={isLoading}
            onClick={() =>
              void loadResults()
            }
          >
            Actualiser
          </button>
        )}
      </div>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : les
          résultats réels ne sont pas
          chargés.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="sn-card animate-pulse space-y-3 p-5"
            >
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-4 w-1/3 rounded bg-gray-100" />
              <div className="h-10 w-28 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card border border-red-200 bg-red-50 p-5">
          <div className="font-medium text-red-700">
            Chargement impossible
          </div>

          <div className="mt-1 text-sm text-red-600">
            {error}
          </div>

          <button
            type="button"
            className="sn-btn-ghost mt-4"
            onClick={() =>
              void loadResults()
            }
          >
            Réessayer
          </button>
        </div>
      )}

      {!isLoading &&
        !error &&
        children.length === 0 &&
        !user?.isDemo && (
          <div className="sn-card p-8 text-center">
            <div className="font-semibold">
              Aucun enfant lié
            </div>

            <div className="mt-2 text-sm text-gray-500">
              Aucun profil élève
              n&apos;est actuellement
              rattaché à ce compte
              parent.
            </div>
          </div>
        )}

      {!isLoading &&
        !error &&
        children.length > 0 && (
          <>
            <div className="sn-card p-4">
              <div className="mb-3 text-sm font-medium">
                Enfant
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={
                    selectedChild ===
                    "all"
                      ? "sn-btn-primary"
                      : "sn-btn-ghost"
                  }
                  onClick={() =>
                    setSelectedChild(
                      "all",
                    )
                  }
                >
                  Tous
                </button>

                {children.map(
                  (child) => {
                    const active =
                      child.id ===
                      selectedChild;

                    return (
                      <button
                        key={child.id}
                        type="button"
                        className={
                          active
                            ? "sn-btn-primary"
                            : "sn-btn-ghost"
                        }
                        onClick={() =>
                          setSelectedChild(
                            child.id,
                          )
                        }
                      >
                        {child.label} ·{" "}
                        {
                          child.classLabel
                        }
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                title="Publiés"
                value={String(
                  stats.published,
                )}
                icon="✅"
                tone="green"
              />

              <Kpi
                title="En attente"
                value={String(
                  stats.submitted,
                )}
                icon="📩"
                tone="blue"
              />

              <Kpi
                title="Corrigés non publiés"
                value={String(
                  stats.graded,
                )}
                icon="📝"
                tone="amber"
              />

              <Kpi
                title="Non soumis"
                value={String(
                  stats.notSubmitted,
                )}
                icon="⏳"
                tone="gray"
              />
            </div>

            <div className="sn-card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 sm:w-[420px]"
                  placeholder="Rechercher (cours, évaluation, enfant, statut)…"
                  value={query}
                  onChange={(event) =>
                    setQuery(
                      event.target.value,
                    )
                  }
                />

                <div className="text-sm text-gray-500">
                  {filtered.length}{" "}
                  résultat
                  {filtered.length > 1
                    ? "s"
                    : ""}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Pill
                  label="Tous"
                  active={
                    filter === "all"
                  }
                  onClick={() =>
                    setFilter("all")
                  }
                />

                <Pill
                  label="Quiz"
                  active={
                    filter === "quiz"
                  }
                  onClick={() =>
                    setFilter("quiz")
                  }
                />

                <Pill
                  label="Devoir"
                  active={
                    filter ===
                    "assignment"
                  }
                  onClick={() =>
                    setFilter(
                      "assignment",
                    )
                  }
                />

                <Pill
                  label="Examen"
                  active={
                    filter === "exam"
                  }
                  onClick={() =>
                    setFilter("exam")
                  }
                  tone="danger"
                />
              </div>
            </div>

            {filtered.length ===
              0 && (
              <div className="sn-card p-8 text-center">
                <div className="font-semibold">
                  Aucun résultat
                </div>

                <div className="mt-2 text-sm text-gray-500">
                  Aucun élément ne
                  correspond aux
                  filtres sélectionnés.
                </div>
              </div>
            )}

            {filtered.length >
              0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {paginatedRows.map(
                  (row) => {
                    const published =
                      row.resultStatus ===
                      "published";

                    let actionLabel =
                      "Voir l’évaluation";

                    if (published) {
                      actionLabel =
                        "Voir le résultat";
                    } else if (
                      row.resultStatus ===
                        "submitted" ||
                      row.resultStatus ===
                        "graded"
                    ) {
                      actionLabel =
                        "Voir le suivi";
                    }

                    return (
                      <div
                        key={`${row.childId}:${row.assessmentId}`}
                        className="sn-card sn-card-hover space-y-4 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold text-gray-900">
                                {
                                  row.title
                                }
                              </div>

                              <span
                                className={typeBadgeClass(
                                  row.type,
                                )}
                              >
                                {typeLabel(
                                  row.type,
                                )}
                              </span>

                              <span
                                className={resultStatusBadgeClass(
                                  row.resultStatus,
                                )}
                              >
                                {resultStatusLabel(
                                  row.resultStatus,
                                )}
                              </span>

                              {published &&
                                row.score !==
                                  null && (
                                  <span className="sn-badge sn-badge-green">
                                    {scoreLabel(
                                      row.score,
                                      row.maxScore,
                                    )}
                                  </span>
                                )}
                            </div>

                            <div className="mt-2 text-sm text-gray-500">
                              {
                                row.childLabel
                              }
                              {" • "}
                              {
                                row.courseTitle
                              }
                            </div>

                            <div className="mt-1 text-sm text-gray-500">
                              {
                                row.classLabel
                              }
                            </div>

                            {row.dueAt && (
                              <div className="mt-3 text-xs text-gray-500">
                                Échéance :{" "}
                                {formatDate(
                                  row.dueAt,
                                )}
                              </div>
                            )}

                            {row.submittedAt && (
                              <div className="mt-1 text-xs text-gray-500">
                                Remis :{" "}
                                {formatDate(
                                  row.submittedAt,
                                )}
                              </div>
                            )}

                            {published &&
                              row.publishedAt && (
                              <div className="mt-1 text-xs text-gray-500">
                                Résultat
                                publié :{" "}
                                {formatDate(
                                  row.publishedAt,
                                )}
                              </div>
                            )}
                          </div>

                          <Link
                            to={`/app/parent/results/${row.assessmentId}?source=legacy&childId=${encodeURIComponent(row.childId)}`}
                            className={
                              published
                                ? "sn-btn-primary"
                                : "sn-btn-ghost"
                            }
                          >
                            {
                              actionLabel
                            }
                          </Link>
                        </div>

                        {published &&
                          row.feedback && (
                          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
                            <div className="mb-1 text-xs font-semibold text-gray-600">
                              Commentaire
                              enseignant
                            </div>

                            {
                              row.feedback
                            }
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            )}

            {filtered.length >
              ITEMS_PER_PAGE && (
              <div className="sn-card flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="text-sm text-gray-500">
                  Affichage{" "}
                  {firstDisplayedItem}
                  {" à "}
                  {lastDisplayedItem}
                  {" sur "}
                  {filtered.length}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="sn-btn-ghost"
                    disabled={
                      currentPage === 1
                    }
                    onClick={() =>
                      setCurrentPage(
                        (page) =>
                          Math.max(
                            1,
                            page - 1,
                          ),
                      )
                    }
                  >
                    ← Précédent
                  </button>

                  <div className="rounded-xl bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">
                    Page{" "}
                    {currentPage} /{" "}
                    {totalPages}
                  </div>

                  <button
                    type="button"
                    className="sn-btn-ghost"
                    disabled={
                      currentPage ===
                      totalPages
                    }
                    onClick={() =>
                      setCurrentPage(
                        (page) =>
                          Math.min(
                            totalPages,
                            page + 1,
                          ),
                      )
                    }
                  >
                    Suivant →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base =
    "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";

  const activeClass =
    tone === "danger"
      ? "bg-red-600 text-white"
      : "bg-blue-600 text-white";

  const inactiveClass =
    tone === "danger"
      ? "bg-red-50 text-red-700 hover:bg-red-100"
      : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${
        active
          ? activeClass
          : inactiveClass
      }`}
    >
      {label}
    </button>
  );
}

function Kpi({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: string;
  tone:
    | "green"
    | "blue"
    | "amber"
    | "gray";
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-50"
      : tone === "blue"
        ? "bg-blue-50"
        : tone === "amber"
          ? "bg-amber-50"
          : "bg-gray-50";

  return (
    <div className="sn-card sn-card-hover flex items-center gap-3 p-4">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${toneClass}`}
      >
        {icon}
      </div>

      <div>
        <div className="text-sm text-gray-500">
          {title}
        </div>

        <div className="text-lg font-bold text-gray-900">
          {value}
        </div>
      </div>
    </div>
  );
}

export default function ParentResults() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const source = params.get("source") === "legacy" ? "legacy" : "official";
  const childId = params.get("childId");
  const ownerKey = `${user?.id ?? "anonymous"}:${user?.role ?? ""}:${Boolean(user?.isDemo)}`;

  return <div className="min-w-0 space-y-5">
    <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2" aria-label="Vues des résultats">
      <Link to={parentResultsUrl("official", childId)} aria-current={source === "official" ? "page" : undefined}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${source === "official" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Résultats officiels</Link>
      <Link to={parentResultsUrl("legacy", childId)} aria-current={source === "legacy" ? "page" : undefined}
        className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${source === "legacy" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Cours libres</Link>
    </nav>
    {authLoading ? <div className="sn-card p-6 text-sm text-slate-600" role="status">Chargement du compte…</div>
      : source === "official" ? <ParentOfficialResults key={ownerKey} />
      : <LegacyParentResults key={ownerKey} />}
  </div>;
}
