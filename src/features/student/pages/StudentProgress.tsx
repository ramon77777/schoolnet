import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseRow = {
  id: string;
  title: string;
};

type EnrollmentRow = {
  course_id: string;
};

type ProgressRow = {
  course_id: string;
  progress_percent: number;
  last_activity_at: string | null;
};

type AssessmentRow = {
  id: string;
  course_id: string;
};

type AssessmentSubmissionRow = {
  assessment_id: string;
  status: string;
};

type HomeworkSubmissionRow = {
  homework_id: string;
  status: string;
};

type CourseProgress = {
  courseId: string;
  title: string;
  progressPercent: number;
  completed: number;
  total: number;
  remaining: number;
  lastActivityAt: string | null;
};

const COMPLETED_STATUSES = new Set(["submitted", "graded", "published"]);

function safeErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null) {
    const maybe = err as {
      message?: string;
      error_description?: string;
      details?: string;
    };

    return maybe.message || maybe.error_description || maybe.details || fallback;
  }

  return fallback;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "Aucune activité";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date indisponible";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function progressLabel(value: number) {
  if (value >= 80) return "En bonne voie";
  if (value >= 50) return "À poursuivre";
  if (value > 0) return "À renforcer";
  return "À démarrer";
}

function progressBadgeClass(value: number) {
  if (value >= 80) {
    return "bg-green-50 text-green-700 border border-green-200";
  }

  if (value >= 50) {
    return "bg-amber-50 text-amber-700 border border-amber-200";
  }

  if (value > 0) {
    return "bg-orange-50 text-orange-700 border border-orange-200";
  }

  return "bg-gray-100 text-gray-600 border border-gray-200";
}

function progressBarClass(value: number) {
  if (value >= 80) return "bg-green-500";
  if (value >= 50) return "bg-amber-500";
  if (value > 0) return "bg-orange-500";
  return "bg-gray-300";
}

export default function StudentProgress() {
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const loadProgress = useCallback(
    async (manualRefresh = false) => {
      if (!user) {
        setCourses([]);
        setLoading(false);
        return;
      }

      if (user.isDemo) {
        setCourses([]);
        setLoading(false);
        setError(
          "La progression réelle n’est pas disponible avec le compte de démonstration."
        );
        return;
      }

      try {
        if (manualRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);

        // -----------------------------------------------------
        // 1. Cours auxquels l'élève est réellement inscrit
        // -----------------------------------------------------
        const { data: enrollmentData, error: enrollmentError } = await supabase
          .from("course_enrollments")
          .select("course_id")
          .eq("student_id", user.id);

        if (enrollmentError) throw enrollmentError;

        const enrollments = (enrollmentData ?? []) as EnrollmentRow[];
        const courseIds = [...new Set(enrollments.map((row) => row.course_id))];

        if (courseIds.length === 0) {
          setCourses([]);
          return;
        }

        // -----------------------------------------------------
        // 2. Informations des cours
        // -----------------------------------------------------
        const { data: courseData, error: courseError } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", courseIds);

        if (courseError) throw courseError;

        const courseRows = (courseData ?? []) as CourseRow[];

        // -----------------------------------------------------
        // 3. Progression calculée automatiquement par Supabase
        // -----------------------------------------------------
        const { data: progressData, error: progressError } = await supabase
          .from("student_progress")
          .select("course_id, progress_percent, last_activity_at")
          .eq("student_id", user.id)
          .in("course_id", courseIds);

        if (progressError) throw progressError;

        const progressRows = (progressData ?? []) as ProgressRow[];

        // -----------------------------------------------------
        // 4. Évaluations publiées de ces cours
        // -----------------------------------------------------
        const { data: assessmentData, error: assessmentError } = await supabase
          .from("assessments")
          .select("id, course_id")
          .in("course_id", courseIds)
          .eq("status", "published");

        if (assessmentError) throw assessmentError;

        const assessments = (assessmentData ?? []) as AssessmentRow[];
        const assessmentIds = assessments.map((assessment) => assessment.id);

        let assessmentSubmissions: AssessmentSubmissionRow[] = [];
        let homeworkSubmissions: HomeworkSubmissionRow[] = [];

        if (assessmentIds.length > 0) {
          // ---------------------------------------------------
          // 5. Soumissions Quiz / Examens / évaluations online
          // ---------------------------------------------------
          const {
            data: assessmentSubmissionData,
            error: assessmentSubmissionError,
          } = await supabase
            .from("assessment_submissions")
            .select("assessment_id, status")
            .eq("student_id", user.id)
            .in("assessment_id", assessmentIds);

          if (assessmentSubmissionError) throw assessmentSubmissionError;

          assessmentSubmissions =
            (assessmentSubmissionData ?? []) as AssessmentSubmissionRow[];

          // ---------------------------------------------------
          // 6. Soumissions des devoirs maison avec fichier
          // ---------------------------------------------------
          const {
            data: homeworkSubmissionData,
            error: homeworkSubmissionError,
          } = await supabase
            .from("homework_submissions")
            .select("homework_id, status")
            .eq("student_id", user.id)
            .in("homework_id", assessmentIds);

          if (homeworkSubmissionError) throw homeworkSubmissionError;

          homeworkSubmissions =
            (homeworkSubmissionData ?? []) as HomeworkSubmissionRow[];
        }

        // -----------------------------------------------------
        // 7. Liste unique des évaluations réellement terminées
        // -----------------------------------------------------
        const completedAssessmentIds = new Set<string>();

        for (const submission of assessmentSubmissions) {
          if (COMPLETED_STATUSES.has(submission.status)) {
            completedAssessmentIds.add(submission.assessment_id);
          }
        }

        for (const submission of homeworkSubmissions) {
          if (COMPLETED_STATUSES.has(submission.status)) {
            completedAssessmentIds.add(submission.homework_id);
          }
        }

        const progressByCourse = new Map(
          progressRows.map((row) => [row.course_id, row])
        );

        // -----------------------------------------------------
        // 8. Construction des statistiques par cours
        // -----------------------------------------------------
        const mappedCourses: CourseProgress[] = courseRows
          .map((course) => {
            const courseAssessments = assessments.filter(
              (assessment) => assessment.course_id === course.id
            );

            const total = courseAssessments.length;

            const completed = courseAssessments.reduce(
              (count, assessment) =>
                count + (completedAssessmentIds.has(assessment.id) ? 1 : 0),
              0
            );

            const storedProgress = progressByCourse.get(course.id);

            const fallbackProgress =
              total > 0 ? Math.round((completed / total) * 10000) / 100 : 0;

            return {
              courseId: course.id,
              title: course.title,
              progressPercent:
                storedProgress !== undefined
                  ? Number(storedProgress.progress_percent)
                  : fallbackProgress,
              completed,
              total,
              remaining: Math.max(0, total - completed),
              lastActivityAt: storedProgress?.last_activity_at ?? null,
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title, "fr"));

        setCourses(mappedCourses);
      } catch (err) {
        console.error("[StudentProgress] loadProgress error:", err);

        setCourses([]);
        setError(
          safeErrorMessage(
            err,
            "Impossible de charger la progression de l’apprenant."
          )
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (authLoading) return;
    void loadProgress();
  }, [authLoading, loadProgress]);

  const statistics = useMemo(() => {
    const totalActivities = courses.reduce(
      (sum, course) => sum + course.total,
      0
    );

    const completedActivities = courses.reduce(
      (sum, course) => sum + course.completed,
      0
    );

    const remainingActivities = Math.max(
      0,
      totalActivities - completedActivities
    );

    const globalProgress =
      totalActivities > 0
        ? Math.round((completedActivities / totalActivities) * 10000) / 100
        : 0;

    const dates = courses
      .map((course) => course.lastActivityAt)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));

    const lastActivity =
      dates.length > 0
        ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
        : null;

    return {
      globalProgress,
      totalActivities,
      completedActivities,
      remainingActivities,
      lastActivity,
    };
  }, [courses]);


  if (authLoading || loading) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-xl font-semibold">Progression</div>
          <div className="text-sm text-gray-500">
            Suivi de ton avancement dans tes cours.
          </div>
        </div>

        <div className="sn-card p-6 space-y-4 animate-pulse">
          <div className="h-5 w-44 rounded bg-gray-200" />
          <div className="h-10 w-28 rounded bg-gray-200" />
          <div className="h-3 rounded bg-gray-100" />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="h-20 rounded-2xl bg-gray-100" />
            <div className="h-20 rounded-2xl bg-gray-100" />
            <div className="h-20 rounded-2xl bg-gray-100" />
            <div className="h-20 rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Progression</div>
          <div className="text-sm text-gray-500">
            Suivi réel de ton avancement à partir des activités SchoolNet.
          </div>
        </div>

        {!user?.isDemo && (
          <button
            type="button"
            className="sn-btn-ghost sn-press"
            disabled={refreshing}
            onClick={() => void loadProgress(true)}
          >
            {refreshing ? "Actualisation..." : "Actualiser"}
          </button>
        )}
      </div>

      {error && (
        <div className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && courses.length === 0 && (
        <div className="sn-card p-6">
          <div className="font-semibold">Aucune progression disponible</div>
          <div className="mt-1 text-sm text-gray-500">
            Aucun cours actif n’est actuellement associé à ton compte.
          </div>
        </div>
      )}

      {!error && courses.length > 0 && (
        <>
          <div className="sn-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-500">
                  Progression globale
                </div>

                <div className="mt-1 text-4xl font-bold text-gray-900">
                  {formatPercent(statistics.globalProgress)}%
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${progressBadgeClass(
                  statistics.globalProgress
                )}`}
              >
                {progressLabel(statistics.globalProgress)}
              </span>
            </div>

            <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progressBarClass(
                  statistics.globalProgress
                )}`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, statistics.globalProgress)
                  )}%`,
                }}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs text-gray-500">Cours suivis</div>
                <div className="mt-1 text-2xl font-bold">{courses.length}</div>
              </div>

              <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                <div className="text-xs text-green-700">
                  Activités terminées
                </div>
                <div className="mt-1 text-2xl font-bold text-green-800">
                  {statistics.completedActivities}
                  <span className="ml-1 text-sm font-medium text-green-700">
                    / {statistics.totalActivities}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="text-xs text-amber-700">À réaliser</div>
                <div className="mt-1 text-2xl font-bold text-amber-800">
                  {statistics.remainingActivities}
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="text-xs text-blue-700">
                  Dernière activité
                </div>
                <div className="mt-1 text-sm font-semibold text-blue-900">
                  {formatDateTime(statistics.lastActivity)}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                className="sn-btn-primary sn-press"
                onClick={() => setShowDetails((current) => !current)}
              >
                {showDetails ? "Masquer les détails" : "Voir les détails"}
              </button>
            </div>
          </div>

          {showDetails && (
            <div
              id="student-progress-courses"
              className="sn-card p-6 space-y-4 scroll-mt-6"
            >
              <div>
                <div className="text-lg font-semibold">
                  Progression par cours
                </div>
                <div className="text-sm text-gray-500">
                  Le pourcentage correspond aux évaluations publiées réellement
                  terminées.
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {courses.map((course) => (
                  <div
                    key={course.courseId}
                    className="rounded-2xl border border-gray-100 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900">
                          {course.title}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          Dernière activité :{" "}
                          {formatDateTime(course.lastActivityAt)}
                        </div>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${progressBadgeClass(
                          course.progressPercent
                        )}`}
                      >
                        {progressLabel(course.progressPercent)}
                      </span>
                    </div>

                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-3xl font-bold text-gray-900">
                          {formatPercent(course.progressPercent)}%
                        </div>

                        <div className="mt-1 text-sm text-gray-500">
                          {course.completed}/{course.total} activité
                          {course.total > 1 ? "s" : ""} terminée
                          {course.completed > 1 ? "s" : ""}
                        </div>
                      </div>

                      <div className="text-right text-xs text-gray-500">
                        {course.remaining} restante
                        {course.remaining > 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressBarClass(
                          course.progressPercent
                        )}`}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, course.progressPercent)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-gray-500">
                La progression est recalculée automatiquement lorsqu’une
                évaluation est publiée, lorsqu’une remise est effectuée ou
                lorsqu’une inscription à un cours change.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
