import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type ParentProfileRow = {
  child_ids: string[] | null;
};

type ChildProfileRow = {
  id: string;
  full_name: string | null;
  class_name: string | null;
};

type EnrollmentRow = {
  course_id: string;
};

type CourseRow = {
  id: string;
  title: string;
};

type AssessmentRow = {
  id: string;
  course_id: string;
  title: string;
  type: string;
  status: string;
  due_at: string | null;
  time_limit_minutes: number | null;
  exam_window_minutes: number | null;
  max_score: number | null;
};

type AssessmentSubmissionRow = {
  assessment_id: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
  published_at: string | null;
};

type HomeworkSubmissionRow = {
  homework_id: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
  published_at: string | null;
};

type ChildView = {
  id: string;
  name: string;
  classLabel: string;
};

type DeadlineState =
  | "upcoming"
  | "overdue"
  | "completed";

type DeadlineView = {
  id: string;
  courseTitle: string;
  title: string;
  type: string;
  dueAt: string;
  dueTimestamp: number;
  timeLimitMinutes: number | null;
  examWindowMinutes: number | null;
  maxScore: number | null;
  state: DeadlineState;
  submissionStatus: string | null;
  score: number | null;
  submittedAt: string | null;
  publishedAt: string | null;
};

type FilterValue =
  | "all"
  | "upcoming"
  | "overdue"
  | "completed";

const ITEMS_PER_PAGE = 10;

function getAssessmentTypeLabel(type: string) {
  switch (type) {
    case "quiz":
      return "Quiz";

    case "assignment":
      return "Devoir";

    case "exam":
      return "Examen";

    default:
      return "Évaluation";
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date non disponible";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatScore(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value
    .toFixed(2)
    .replace(".", ",")
    .replace(/,00$/, "");
}

function isCompletedStatus(status: string | null) {
  return (
    status === "submitted" ||
    status === "graded" ||
    status === "published"
  );
}

export default function ParentDeadlines() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [children, setChildren] =
    useState<ChildView[]>([]);

  const [
    selectedChildId,
    setSelectedChildId,
  ] = useState<string | null>(null);

  const [deadlines, setDeadlines] =
    useState<DeadlineView[]>([]);

  const [childrenLoading, setChildrenLoading] =
    useState(true);

  const [
    deadlinesLoading,
    setDeadlinesLoading,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [filter, setFilter] =
    useState<FilterValue>("all");

  const [currentPage, setCurrentPage] =
    useState(1);

  /*
   * 1. Enfants liés au parent
   */

  const loadChildren =
    useCallback(async () => {
      if (!user || user.isDemo) {
        setChildren([]);
        setSelectedChildId(null);
        setChildrenLoading(false);
        setError(null);
        return;
      }

      try {
        setChildrenLoading(true);
        setError(null);

        const {
          data: parentProfileData,
          error: parentProfileError,
        } = await supabase
          .from("profiles")
          .select("child_ids")
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

        const childIds = Array.from(
          new Set(
            (
              parentProfile?.child_ids ?? []
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

        if (childIds.length === 0) {
          setChildren([]);
          setSelectedChildId(null);
          return;
        }

        const {
          data: profilesData,
          error: profilesError,
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

        if (profilesError) {
          throw profilesError;
        }

        const profiles =
          (profilesData ??
            []) as ChildProfileRow[];

        const profileMap = new Map(
          profiles.map((profile) => [
            profile.id,
            profile,
          ]),
        );

        const finalChildren =
          childIds
            .map((childId) => {
              const profile =
                profileMap.get(childId);

              if (!profile) {
                return null;
              }

              return {
                id: profile.id,
                name:
                  profile.full_name?.trim() ||
                  "Élève",
                classLabel:
                  profile.class_name?.trim() ||
                  "Classe non renseignée",
              };
            })
            .filter(
              (
                child,
              ): child is ChildView =>
                child !== null,
            );

        setChildren(finalChildren);

        setSelectedChildId(
          (currentChildId) => {
            if (
              currentChildId &&
              finalChildren.some(
                (child) =>
                  child.id ===
                  currentChildId,
              )
            ) {
              return currentChildId;
            }

            return (
              finalChildren[0]?.id ??
              null
            );
          },
        );
      } catch (err) {
        console.error(
          "[ParentDeadlines] loadChildren error:",
          err,
        );

        setChildren([]);
        setSelectedChildId(null);

        setError(
          "Impossible de charger les enfants liés à ce compte.",
        );
      } finally {
        setChildrenLoading(false);
      }
    }, [user]);

  /*
   * 2. Échéances réelles de l'enfant
   */

  const loadDeadlines =
    useCallback(async () => {
      if (
        !user ||
        user.isDemo ||
        !selectedChildId
      ) {
        setDeadlines([]);
        return;
      }

      try {
        setDeadlinesLoading(true);
        setError(null);

        /*
         * Cours suivis par l'enfant.
         */

        const {
          data: enrollmentData,
          error: enrollmentError,
        } = await supabase
          .from("course_enrollments")
          .select("course_id")
          .eq(
            "student_id",
            selectedChildId,
          );

        if (enrollmentError) {
          throw enrollmentError;
        }

        const courseIds =
          Array.from(
            new Set(
              (
                (enrollmentData ??
                  []) as EnrollmentRow[]
              )
                .map(
                  (row) =>
                    row.course_id,
                )
                .filter(Boolean),
            ),
          );

        if (courseIds.length === 0) {
          setDeadlines([]);
          return;
        }

        /*
         * Cours + évaluations + soumissions.
         *
         * Les notes passent uniquement par
         * les RPC sécurisées du portail Parent.
         */

        const [
          coursesResult,
          assessmentsResult,
          assessmentSubmissionsResult,
          homeworkSubmissionsResult,
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
              due_at,
              time_limit_minutes,
              exam_window_minutes,
              max_score
              `,
            )
            .in(
              "course_id",
              courseIds,
            )
            .eq(
              "status",
              "published",
            )
            .not(
              "due_at",
              "is",
              null,
            ),

          supabase.rpc(
            "get_parent_child_assessment_submissions",
            {
              p_child_id:
                selectedChildId,
            },
          ),

          supabase.rpc(
            "get_parent_child_homework_submissions",
            {
              p_child_id:
                selectedChildId,
            },
          ),
        ]);

        if (coursesResult.error) {
          throw coursesResult.error;
        }

        if (assessmentsResult.error) {
          throw assessmentsResult.error;
        }

        if (
          assessmentSubmissionsResult.error
        ) {
          throw assessmentSubmissionsResult.error;
        }

        if (
          homeworkSubmissionsResult.error
        ) {
          throw homeworkSubmissionsResult.error;
        }

        const courses =
          (coursesResult.data ??
            []) as CourseRow[];

        const assessments =
          (assessmentsResult.data ??
            []) as AssessmentRow[];

        const assessmentSubmissions =
          (assessmentSubmissionsResult.data ??
            []) as AssessmentSubmissionRow[];

        const homeworkSubmissions =
          (homeworkSubmissionsResult.data ??
            []) as HomeworkSubmissionRow[];

        const courseMap = new Map(
          courses.map((course) => [
            course.id,
            course.title,
          ]),
        );

        const assessmentSubmissionMap =
          new Map(
            assessmentSubmissions.map(
              (submission) => [
                submission.assessment_id,
                submission,
              ],
            ),
          );

        const homeworkSubmissionMap =
          new Map(
            homeworkSubmissions.map(
              (submission) => [
                submission.homework_id,
                submission,
              ],
            ),
          );

        const now = Date.now();

        const finalDeadlines =
          assessments
            .map(
              (
                assessment,
              ): DeadlineView | null => {
                if (
                  !assessment.due_at
                ) {
                  return null;
                }

                const dueTimestamp =
                  new Date(
                    assessment.due_at,
                  ).getTime();

                if (
                  Number.isNaN(
                    dueTimestamp,
                  )
                ) {
                  return null;
                }

                const submission =
                  assessmentSubmissionMap.get(
                    assessment.id,
                  ) ??
                  homeworkSubmissionMap.get(
                    assessment.id,
                  );

                const submissionStatus =
                  submission?.status ??
                  null;

                let state: DeadlineState;

                if (
                  isCompletedStatus(
                    submissionStatus,
                  )
                ) {
                  state = "completed";
                } else if (
                  dueTimestamp < now
                ) {
                  state = "overdue";
                } else {
                  state = "upcoming";
                }

                return {
                  id: assessment.id,
                  courseTitle:
                    courseMap.get(
                      assessment.course_id,
                    ) ??
                    "Cours",
                  title:
                    assessment.title,
                  type:
                    assessment.type,
                  dueAt:
                    assessment.due_at,
                  dueTimestamp,
                  timeLimitMinutes:
                    assessment.time_limit_minutes,
                  examWindowMinutes:
                    assessment.exam_window_minutes,
                  maxScore:
                    assessment.max_score,
                  state,
                  submissionStatus,
                  score:
                    submission?.score ??
                    null,
                  submittedAt:
                    submission?.submitted_at ??
                    null,
                  publishedAt:
                    submission?.published_at ??
                    null,
                };
              },
            )
            .filter(
              (
                deadline,
              ): deadline is DeadlineView =>
                deadline !== null,
            );

        /*
         * À faire / en retard en premier.
         * Les éléments terminés suivent,
         * du plus récent au plus ancien.
         */

        finalDeadlines.sort(
          (a, b) => {
            if (
              a.state ===
                "completed" &&
              b.state !==
                "completed"
            ) {
              return 1;
            }

            if (
              a.state !==
                "completed" &&
              b.state ===
                "completed"
            ) {
              return -1;
            }

            if (
              a.state ===
                "completed" &&
              b.state ===
                "completed"
            ) {
              return (
                b.dueTimestamp -
                a.dueTimestamp
              );
            }

            return (
              a.dueTimestamp -
              b.dueTimestamp
            );
          },
        );

        setDeadlines(finalDeadlines);
      } catch (err) {
        console.error(
          "[ParentDeadlines] loadDeadlines error:",
          err,
        );

        setDeadlines([]);

        setError(
          "Impossible de charger les échéances.",
        );
      } finally {
        setDeadlinesLoading(false);
      }
    }, [
      selectedChildId,
      user,
    ]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadChildren();
  }, [
    authLoading,
    loadChildren,
  ]);

  useEffect(() => {
    if (
      authLoading ||
      childrenLoading
    ) {
      return;
    }

    void loadDeadlines();
  }, [
    authLoading,
    childrenLoading,
    loadDeadlines,
  ]);

  const selectedChild =
    children.find(
      (child) =>
        child.id ===
        selectedChildId,
    ) ?? null;

  const counts = useMemo(() => {
    return {
      upcoming: deadlines.filter(
        (deadline) =>
          deadline.state ===
          "upcoming",
      ).length,

      overdue: deadlines.filter(
        (deadline) =>
          deadline.state ===
          "overdue",
      ).length,

      completed: deadlines.filter(
        (deadline) =>
          deadline.state ===
          "completed",
      ).length,
    };
  }, [deadlines]);

  const filteredDeadlines =
    useMemo(() => {
      if (filter === "all") {
        return deadlines;
      }

      return deadlines.filter(
        (deadline) =>
          deadline.state === filter,
      );
    }, [deadlines, filter]);

  /*
   * 3. Pagination locale
   */

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredDeadlines.length /
        ITEMS_PER_PAGE,
    ),
  );

  const paginatedDeadlines =
    useMemo(() => {
      const startIndex =
        (currentPage - 1) *
        ITEMS_PER_PAGE;

      return filteredDeadlines.slice(
        startIndex,
        startIndex +
          ITEMS_PER_PAGE,
      );
    }, [
      filteredDeadlines,
      currentPage,
    ]);

  const firstDisplayedItem =
    filteredDeadlines.length === 0
      ? 0
      : (currentPage - 1) *
          ITEMS_PER_PAGE +
        1;

  const lastDisplayedItem = Math.min(
    currentPage * ITEMS_PER_PAGE,
    filteredDeadlines.length,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    filter,
    selectedChildId,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [
    currentPage,
    totalPages,
  ]);

  const isLoading =
    authLoading ||
    childrenLoading ||
    deadlinesLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Échéances
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Suivez les travaux à rendre,
            les retards et les activités
            déjà remises.
          </div>
        </div>

        {!user?.isDemo && (
          <button
            type="button"
            className="sn-btn-ghost"
            disabled={isLoading}
            onClick={() =>
              void loadDeadlines()
            }
          >
            Actualiser
          </button>
        )}
      </div>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : les données
          réelles ne sont pas chargées.
        </div>
      )}

      {!isLoading &&
        !error &&
        children.length > 1 && (
          <div className="sn-card p-4">
            <div className="mb-3 text-sm font-medium">
              Enfant
            </div>

            <div className="flex flex-wrap gap-2">
              {children.map(
                (child) => {
                  const active =
                    child.id ===
                    selectedChildId;

                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() =>
                        setSelectedChildId(
                          child.id,
                        )
                      }
                      className={
                        active
                          ? "sn-btn-primary"
                          : "sn-btn-ghost"
                      }
                    >
                      {child.name} ·{" "}
                      {child.classLabel}
                    </button>
                  );
                },
              )}
            </div>
          </div>
        )}

      {!isLoading &&
        !error &&
        selectedChild && (
          <div className="sn-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {selectedChild.name}
                </div>

                <div className="text-sm text-gray-500">
                  {
                    selectedChild.classLabel
                  }
                </div>
              </div>

              <span className="sn-badge sn-badge-green">
                Élève
              </span>
            </div>
          </div>
        )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({
            length: 3,
          }).map((_, index) => (
            <div
              key={index}
              className="sn-card animate-pulse space-y-3 p-5"
            >
              <div className="h-4 w-1/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
              <div className="h-3 w-1/4 rounded bg-gray-100" />
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
              void loadChildren()
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
              rattaché à ce compte parent.
            </div>
          </div>
        )}

      {!isLoading &&
        !error &&
        selectedChild && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="sn-card bg-blue-50 p-5">
                <div className="text-sm text-blue-700">
                  À faire
                </div>

                <div className="mt-2 text-3xl font-bold text-blue-900">
                  {counts.upcoming}
                </div>
              </div>

              <div className="sn-card bg-red-50 p-5">
                <div className="text-sm text-red-700">
                  En retard
                </div>

                <div className="mt-2 text-3xl font-bold text-red-900">
                  {counts.overdue}
                </div>
              </div>

              <div className="sn-card bg-green-50 p-5">
                <div className="text-sm text-green-700">
                  Terminées
                </div>

                <div className="mt-2 text-3xl font-bold text-green-900">
                  {counts.completed}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    value: "all",
                    label: "Toutes",
                  },
                  {
                    value:
                      "upcoming",
                    label: "À faire",
                  },
                  {
                    value:
                      "overdue",
                    label: "En retard",
                  },
                  {
                    value:
                      "completed",
                    label: "Terminées",
                  },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() =>
                      setFilter(
                        item.value as FilterValue,
                      )
                    }
                    className={
                      filter ===
                      item.value
                        ? "sn-btn-primary"
                        : "sn-btn-ghost"
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {filteredDeadlines.length >
                0 && (
                <div className="text-sm text-gray-500">
                  {
                    filteredDeadlines.length
                  }{" "}
                  élément
                  {filteredDeadlines.length >
                  1
                    ? "s"
                    : ""}
                </div>
              )}
            </div>

            {filteredDeadlines.length ===
              0 && (
              <div className="sn-card p-8 text-center">
                <div className="font-semibold">
                  Aucune échéance
                </div>

                <div className="mt-2 text-sm text-gray-500">
                  Aucun élément ne
                  correspond au filtre
                  sélectionné.
                </div>
              </div>
            )}

            {filteredDeadlines.length >
              0 && (
              <div className="space-y-3">
                {paginatedDeadlines.map(
                  (deadline) => {
                    const typeLabel =
                      getAssessmentTypeLabel(
                        deadline.type,
                      );

                    const isPublished =
                      deadline.submissionStatus ===
                      "published";

                    return (
                      <div
                        key={deadline.id}
                        className="sn-card p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold">
                                {
                                  deadline.title
                                }
                              </div>

                              <span className="sn-badge">
                                {
                                  typeLabel
                                }
                              </span>

                              {deadline.state ===
                                "upcoming" && (
                                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                                  À faire
                                </span>
                              )}

                              {deadline.state ===
                                "overdue" && (
                                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                                  En retard
                                </span>
                              )}

                              {deadline.state ===
                                "completed" && (
                                <span className="sn-badge sn-badge-green">
                                  Terminé
                                </span>
                              )}
                            </div>

                            <div className="mt-1 text-sm text-gray-500">
                              {
                                deadline.courseTitle
                              }
                            </div>

                            <div className="mt-3 text-sm">
                              <span className="text-gray-500">
                                Échéance :{" "}
                              </span>

                              <span className="font-medium">
                                {formatDateTime(
                                  deadline.dueAt,
                                )}
                              </span>
                            </div>

                            {deadline.timeLimitMinutes !==
                              null && (
                              <div className="mt-1 text-sm text-gray-500">
                                Durée :{" "}
                                {
                                  deadline.timeLimitMinutes
                                }{" "}
                                min
                              </div>
                            )}

                            {deadline.submittedAt && (
                              <div className="mt-1 text-sm text-gray-500">
                                Remis le :{" "}
                                {formatDateTime(
                                  deadline.submittedAt,
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            {isPublished &&
                              deadline.score !==
                                null && (
                                <div className="text-right">
                                  <div className="text-xs text-gray-500">
                                    Note publiée
                                  </div>

                                  <div className="text-lg font-bold">
                                    {formatScore(
                                      deadline.score,
                                    )}
                                    {deadline.maxScore !==
                                      null
                                      ? ` / ${formatScore(
                                          deadline.maxScore,
                                        )}`
                                      : ""}
                                  </div>
                                </div>
                              )}

                            {isPublished && (
                              <Link
                                to={`/app/parent/results/${deadline.id}?childId=${selectedChildId}`}
                                className="sn-btn-primary"
                              >
                                Voir le résultat
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}

            {filteredDeadlines.length >
              ITEMS_PER_PAGE && (
              <div className="sn-card flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="text-sm text-gray-500">
                  Affichage{" "}
                  {firstDisplayedItem}
                  {" à "}
                  {lastDisplayedItem}
                  {" sur "}
                  {
                    filteredDeadlines.length
                  }
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
                    Page {currentPage} /{" "}
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