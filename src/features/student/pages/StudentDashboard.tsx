import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseRow = {
  id: string;
  title: string;
  status: string | null;
};

type ProgressRow = {
  course_id: string;
  progress_percent: number | null;
};

type AssessmentRow = {
  id: string;
  course_id: string;
  type: string;
  title: string;
  due_at: string | null;
  max_score: number | null;
  status: string;
  created_at: string;
};

type AssessmentSubmissionRow = {
  assessment_id: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
};

type HomeworkSubmissionRow = {
  homework_id: string;
  status: string;
  score: number | null;
  submitted_at: string | null;
};

type DashboardData = {
  courses: CourseRow[];
  progress: ProgressRow[];
  assessments: AssessmentRow[];
  assessmentSubmissions: AssessmentSubmissionRow[];
  homeworkSubmissions: HomeworkSubmissionRow[];
};

type AssessmentType = "Quiz" | "Devoir" | "Examen";

const EMPTY_DATA: DashboardData = {
  courses: [],
  progress: [],
  assessments: [],
  assessmentSubmissions: [],
  homeworkSubmissions: [],
};

const PIE_COLORS: Record<AssessmentType, string> = {
  Quiz: "#2563eb",
  Devoir: "#8b5cf6",
  Examen: "#ef4444",
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function assessmentType(value: string): AssessmentType {
  const normalized = value.toLowerCase();

  if (normalized === "quiz") {
    return "Quiz";
  }

  if (
    normalized === "exam" ||
    normalized === "examen"
  ) {
    return "Examen";
  }

  return "Devoir";
}

function isCompletedStatus(
  status: string | null | undefined,
): boolean {
  return (
    status === "submitted" ||
    status === "graded" ||
    status === "published"
  );
}

function shortLabel(
  value: string,
  maxLength = 22,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Sans échéance";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date indisponible";
  }

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeDueDate(
  value: string | null,
): string {
  if (!value) {
    return "Sans date limite";
  }

  const due = new Date(value);
  const now = new Date();

  if (Number.isNaN(due.getTime())) {
    return formatDate(value);
  }

  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(
    diffMs / (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) {
    return "Aujourd’hui";
  }

  if (diffDays === 1) {
    return "Demain";
  }

  if (diffDays > 1 && diffDays <= 7) {
    return `Dans ${diffDays} jours`;
  }

  return formatDate(value);
}

export default function StudentDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [data, setData] =
    useState<DashboardData>(EMPTY_DATA);

  const [loading, setLoading] = useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const [reloadToken, setReloadToken] =
    useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (authLoading) {
        return;
      }

      if (!user || user.isDemo) {
        if (!cancelled) {
          setData(EMPTY_DATA);
          setLoading(false);
          setError(null);
        }

        return;
      }

      try {
        setLoading(true);
        setError(null);

        /*
         * 1. Cours de l'apprenant
         *    + progression réelle.
         */
        const [
          enrollmentsResult,
          progressResult,
        ] = await Promise.all([
          supabase
            .from("course_enrollments")
            .select("course_id")
            .eq("student_id", user.id),

          supabase
            .from("student_progress")
            .select(
              "course_id, progress_percent",
            )
            .eq("student_id", user.id),
        ]);

        if (enrollmentsResult.error) {
          throw enrollmentsResult.error;
        }

        if (progressResult.error) {
          throw progressResult.error;
        }

        const courseIds = Array.from(
          new Set(
            (enrollmentsResult.data ?? [])
              .map((row) => row.course_id)
              .filter(Boolean),
          ),
        );

        if (courseIds.length === 0) {
          if (!cancelled) {
            setData({
              ...EMPTY_DATA,
              progress:
                (progressResult.data ??
                  []) as ProgressRow[],
            });
          }

          return;
        }

        /*
         * 2. Informations des cours
         *    + évaluations publiées.
         */
        const [
          coursesResult,
          assessmentsResult,
        ] = await Promise.all([
          supabase
            .from("courses")
            .select("id, title, status")
            .in("id", courseIds),

          supabase
            .from("assessments")
            .select(
              `
              id,
              course_id,
              type,
              title,
              due_at,
              max_score,
              status,
              created_at
              `,
            )
            .in("course_id", courseIds)
            .eq("status", "published"),
        ]);

        if (coursesResult.error) {
          throw coursesResult.error;
        }

        if (assessmentsResult.error) {
          throw assessmentsResult.error;
        }

        const assessments =
          (assessmentsResult.data ??
            []) as AssessmentRow[];

        const assessmentIds =
          assessments.map(
            (assessment) => assessment.id,
          );

        let assessmentSubmissions:
          AssessmentSubmissionRow[] = [];

        let homeworkSubmissions:
          HomeworkSubmissionRow[] = [];

        /*
         * 3. Résultats/remises de l'apprenant.
         */
        if (assessmentIds.length > 0) {
          const [
            assessmentSubmissionsResult,
            homeworkSubmissionsResult,
          ] = await Promise.all([
            supabase
              .from("submissions")
              .select(
                `
                assessment_id,
                status,
                score,
                submitted_at
                `,
              )
              .eq("student_id", user.id)
              .in(
                "assessment_id",
                assessmentIds,
              ),

            supabase
              .from("homework_submissions")
              .select(
                `
                homework_id,
                status,
                score,
                submitted_at
                `,
              )
              .eq("student_id", user.id)
              .in(
                "homework_id",
                assessmentIds,
              ),
          ]);

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

          assessmentSubmissions =
            (assessmentSubmissionsResult.data ??
              []) as AssessmentSubmissionRow[];

          homeworkSubmissions =
            (homeworkSubmissionsResult.data ??
              []) as HomeworkSubmissionRow[];
        }

        if (!cancelled) {
          setData({
            courses:
              (coursesResult.data ??
                []) as CourseRow[],

            progress:
              (progressResult.data ??
                []) as ProgressRow[],

            assessments,

            assessmentSubmissions,

            homeworkSubmissions,
          });
        }
      } catch (err) {
        console.error(
          "[StudentDashboard] loadDashboard error:",
          err,
        );

        if (!cancelled) {
          setData(EMPTY_DATA);
          setError(
            "Impossible de charger votre tableau de bord pour le moment.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    user,
    reloadToken,
  ]);

  const dashboard = useMemo(() => {
    const progressMap = new Map<
      string,
      number
    >();

    for (const row of data.progress) {
      const value =
        safeNumber(row.progress_percent) ?? 0;

      progressMap.set(
        row.course_id,
        clampPercent(value),
      );
    }

    const courseMap = new Map<
      string,
      CourseRow
    >();

    for (const course of data.courses) {
      courseMap.set(course.id, course);
    }

    const assessmentSubmissionMap =
      new Map<
        string,
        AssessmentSubmissionRow
      >();

    for (
      const submission of
      data.assessmentSubmissions
    ) {
      assessmentSubmissionMap.set(
        submission.assessment_id,
        submission,
      );
    }

    const homeworkSubmissionMap =
      new Map<
        string,
        HomeworkSubmissionRow
      >();

    for (
      const submission of
      data.homeworkSubmissions
    ) {
      homeworkSubmissionMap.set(
        submission.homework_id,
        submission,
      );
    }

    const assessmentViews =
      data.assessments.map(
        (assessment) => {
          const type = assessmentType(
            String(assessment.type),
          );

          const assessmentSubmission =
            assessmentSubmissionMap.get(
              assessment.id,
            );

          const homeworkSubmission =
            homeworkSubmissionMap.get(
              assessment.id,
            );

          /*
           * Les devoirs utilisent prioritairement
           * homework_submissions.
           *
           * Les quiz et examens utilisent
           * prioritairement submissions.
           */
          const submission =
            type === "Devoir"
              ? homeworkSubmission ??
                assessmentSubmission
              : assessmentSubmission ??
                homeworkSubmission;

          const completed =
            isCompletedStatus(
              submission?.status,
            );

          const score =
            safeNumber(submission?.score);

          const maxScore =
            safeNumber(
              assessment.max_score,
            );

          let scorePercent:
            | number
            | null = null;

          /*
           * Une note est comptabilisée dans la
           * moyenne uniquement lorsqu'elle est
           * publiée.
           */
          if (
            submission?.status ===
              "published" &&
            score !== null &&
            maxScore !== null &&
            maxScore > 0
          ) {
            scorePercent =
              clampPercent(
                (score / maxScore) * 100,
              );
          }

          return {
            ...assessment,
            type,
            completed,
            submissionStatus:
              submission?.status ?? null,
            submittedAt:
              submission?.submitted_at ??
              null,
            scorePercent,
            courseTitle:
              courseMap.get(
                assessment.course_id,
              )?.title ?? "Cours",
          };
        },
      );

    const courseProgressData =
      data.courses.map((course) => ({
        name: shortLabel(
          course.title,
          18,
        ),
        progression:
          progressMap.get(course.id) ??
          0,
      }));

    const overallProgress =
      courseProgressData.length > 0
        ? Math.round(
            courseProgressData.reduce(
              (sum, course) =>
                sum +
                course.progression,
              0,
            ) /
              courseProgressData.length,
          )
        : 0;

    const scoredAssessments =
      assessmentViews.filter(
        (
          assessment,
        ): assessment is typeof assessment & {
          scorePercent: number;
        } =>
          assessment.scorePercent !==
          null,
      );

    const averageScore =
      scoredAssessments.length > 0
        ? Math.round(
            scoredAssessments.reduce(
              (sum, assessment) =>
                sum +
                assessment.scorePercent,
              0,
            ) /
              scoredAssessments.length,
          )
        : null;

    const completedCount =
      assessmentViews.filter(
        (assessment) =>
          assessment.completed,
      ).length;

    const pendingCount =
      assessmentViews.length -
      completedCount;

    const quizCount =
      assessmentViews.filter(
        (assessment) =>
          assessment.type === "Quiz",
      ).length;

    const homeworkCount =
      assessmentViews.filter(
        (assessment) =>
          assessment.type ===
          "Devoir",
      ).length;

    const examCount =
      assessmentViews.filter(
        (assessment) =>
          assessment.type ===
          "Examen",
      ).length;

    const assessmentMixData = [
      {
        name: "Quiz",
        value: quizCount,
        color: PIE_COLORS.Quiz,
      },
      {
        name: "Devoirs",
        value: homeworkCount,
        color: PIE_COLORS.Devoir,
      },
      {
        name: "Examens",
        value: examCount,
        color: PIE_COLORS.Examen,
      },
    ].filter(
      (item) => item.value > 0,
    );

    const scoreTrendData =
      scoredAssessments
        .slice()
        .sort((a, b) => {
          const aDate =
            new Date(
              a.submittedAt ??
                a.created_at,
            ).getTime();

          const bDate =
            new Date(
              b.submittedAt ??
                b.created_at,
            ).getTime();

          return aDate - bDate;
        })
        .slice(-8)
        .map((assessment) => ({
          name: shortLabel(
            assessment.title,
            14,
          ),
          score:
            assessment.scorePercent,
        }));

    const now = Date.now();

    const upcomingAssessments =
      assessmentViews
        .filter((assessment) => {
          if (
            assessment.completed ||
            !assessment.due_at
          ) {
            return false;
          }

          const dueTime =
            new Date(
              assessment.due_at,
            ).getTime();

          return (
            !Number.isNaN(dueTime) &&
            dueTime >= now
          );
        })
        .sort((a, b) => {
          return (
            new Date(
              a.due_at!,
            ).getTime() -
            new Date(
              b.due_at!,
            ).getTime()
          );
        })
        .slice(0, 5);

    const completionRate =
      assessmentViews.length > 0
        ? Math.round(
            (completedCount /
              assessmentViews.length) *
              100,
          )
        : 0;

    return {
      overallProgress,
      averageScore,
      completedCount,
      pendingCount,
      quizCount,
      homeworkCount,
      examCount,
      courseProgressData,
      assessmentMixData,
      scoreTrendData,
      upcomingAssessments,
      completionRate,
      assessmentCount:
        assessmentViews.length,
    };
  }, [data]);

  const isLoading =
    authLoading || loading;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-4 w-72 animate-pulse rounded bg-gray-100" />
        </div>

        <div className="h-44 animate-pulse rounded-3xl bg-gray-100" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="sn-card h-32 animate-pulse bg-gray-50"
            />
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="sn-card h-80 animate-pulse bg-gray-50" />
          <div className="sn-card h-80 animate-pulse bg-gray-50" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xl font-semibold text-gray-900">
            Tableau de bord
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Une vue complète de votre
            progression, de vos résultats
            et de vos prochaines activités.
          </div>
        </div>

        <button
          type="button"
          className="sn-btn-secondary"
          onClick={() =>
            setReloadToken(
              (current) =>
                current + 1,
            )
          }
        >
          ↻ Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {user?.isDemo && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          Le tableau de bord réel sera
          disponible avec un compte
          apprenant connecté aux données
          Supabase.
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 text-white shadow-lg sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />

        <div className="absolute -bottom-24 right-24 h-64 w-64 rounded-full bg-cyan-300/10" />

        <div className="relative z-10 flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
              🎓 Mon espace scolaire
            </div>

            <h1 className="text-2xl font-bold sm:text-3xl">
              Continuez sur cette belle
              lancée !
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">
              Retrouvez en un coup d’œil
              votre progression, vos
              évaluations et les activités
              qui demandent votre
              attention.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/app/student/courses",
                  )
                }
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
              >
                📘 Mes cours
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/app/student/progress",
                  )
                }
                className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                📈 Voir ma progression
              </button>
            </div>
          </div>

          <div className="grid min-w-[260px] grid-cols-2 gap-3">
            <HeroStat
              label="Progression"
              value={`${dashboard.overallProgress}%`}
            />

            <HeroStat
              label="Moyenne"
              value={
                dashboard.averageScore !==
                null
                  ? `${dashboard.averageScore}%`
                  : "—"
              }
            />

            <HeroStat
              label="Cours"
              value={String(
                data.courses.length,
              )}
            />

            <HeroStat
              label="À faire"
              value={String(
                dashboard.pendingCount,
              )}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon="📈"
          title="Progression générale"
          value={`${dashboard.overallProgress}%`}
          helper={`${data.courses.length} cours suivi${
            data.courses.length > 1
              ? "s"
              : ""
          }`}
          tone="blue"
        />

        <KpiCard
          icon="🏅"
          title="Moyenne publiée"
          value={
            dashboard.averageScore !==
            null
              ? `${dashboard.averageScore}%`
              : "—"
          }
          helper="Calculée sur les notes publiées"
          tone="violet"
        />

        <KpiCard
          icon="✅"
          title="Évaluations terminées"
          value={String(
            dashboard.completedCount,
          )}
          helper={`${dashboard.completionRate}% des évaluations`}
          tone="green"
        />

        <KpiCard
          icon="⏳"
          title="À faire"
          value={String(
            dashboard.pendingCount,
          )}
          helper={`${dashboard.assessmentCount} évaluation${
            dashboard.assessmentCount >
            1
              ? "s"
              : ""
          } au total`}
          tone="amber"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="sn-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-gray-900">
                Progression par cours
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Votre avancement actuel
                dans les différents cours.
              </div>
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {
                data.courses.length
              }{" "}
              cours
            </span>
          </div>

          <div className="mt-6 h-72">
            {dashboard
              .courseProgressData
              .length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    dashboard.courseProgressData
                  }
                  margin={{
                    top: 10,
                    right: 10,
                    left: -20,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="name"
                    tick={{
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    domain={[0, 100]}
                    tick={{
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="progression"
                    fill="#2563eb"
                    radius={[
                      8, 8, 0, 0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                message="Aucune progression de cours disponible."
              />
            )}
          </div>
        </div>

        <div className="sn-card p-5 sm:p-6">
          <div>
            <div className="font-semibold text-gray-900">
              Répartition des
              évaluations
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Quiz, devoirs et examens
              publiés.
            </div>
          </div>

          <div className="mt-5 h-60">
            {dashboard
              .assessmentMixData
              .length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={
                      dashboard.assessmentMixData
                    }
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={4}
                  >
                    {dashboard.assessmentMixData.map(
                      (entry) => (
                        <Cell
                          key={
                            entry.name
                          }
                          fill={
                            entry.color
                          }
                        />
                      ),
                    )}
                  </Pie>

                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                message="Aucune évaluation publiée."
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <MiniType
              label="Quiz"
              value={
                dashboard.quizCount
              }
              className="bg-blue-50 text-blue-700"
            />

            <MiniType
              label="Devoirs"
              value={
                dashboard.homeworkCount
              }
              className="bg-violet-50 text-violet-700"
            />

            <MiniType
              label="Examens"
              value={
                dashboard.examCount
              }
              className="bg-red-50 text-red-700"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="sn-card p-5 sm:p-6">
          <div>
            <div className="font-semibold text-gray-900">
              Évolution des résultats
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Dernières notes publiées,
              normalisées sur 100.
            </div>
          </div>

          <div className="mt-6 h-72">
            {dashboard
              .scoreTrendData.length >
            0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <LineChart
                  data={
                    dashboard.scoreTrendData
                  }
                  margin={{
                    top: 10,
                    right: 15,
                    left: -20,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="name"
                    tick={{
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    domain={[0, 100]}
                    tick={{
                      fontSize: 11,
                    }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <Tooltip />

                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#7c3aed"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "#7c3aed",
                    }}
                    activeDot={{
                      r: 6,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart
                message="Les résultats apparaîtront ici lorsque des notes seront publiées."
              />
            )}
          </div>
        </div>

        <div className="sn-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">
                Prochaines échéances
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Les activités à ne pas
                oublier.
              </div>
            </div>

            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {
                dashboard
                  .upcomingAssessments
                  .length
              }{" "}
              prochaine(s)
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {dashboard
              .upcomingAssessments
              .length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                <div className="text-2xl">
                  🎉
                </div>

                <div className="mt-2 font-medium text-gray-800">
                  Rien d’urgent
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Aucune échéance à venir
                  pour le moment.
                </div>
              </div>
            ) : (
              dashboard.upcomingAssessments.map(
                (assessment) => (
                  <button
                    key={
                      assessment.id
                    }
                    type="button"
                    onClick={() =>
                      navigate(
                        assessment.type ===
                          "Devoir"
                          ? "/app/student/homework"
                          : "/app/student/assessments",
                      )
                    }
                    className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <TypeBadge
                            type={
                              assessment.type
                            }
                          />

                          <span className="truncate font-semibold text-gray-900">
                            {
                              assessment.title
                            }
                          </span>
                        </div>

                        <div className="mt-2 text-sm text-gray-500">
                          {
                            assessment.courseTitle
                          }
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-xs font-semibold text-amber-700">
                          {formatRelativeDueDate(
                            assessment.due_at,
                          )}
                        </div>

                        <div className="mt-1 text-xs text-gray-400">
                          {formatDate(
                            assessment.due_at,
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ),
              )
            )}
          </div>
        </div>
      </section>

      <section className="sn-card p-5 sm:p-6">
        <div>
          <div className="font-semibold text-gray-900">
            Accès rapides
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Retrouvez rapidement les
            principales fonctionnalités de
            votre espace apprenant.
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            icon="📘"
            title="Mes cours"
            description="Consulter mes matières"
            onClick={() =>
              navigate(
                "/app/student/courses",
              )
            }
          />

          <QuickAction
            icon="🧩"
            title="Quiz & examens"
            description="Voir mes évaluations"
            onClick={() =>
              navigate(
                "/app/student/assessments",
              )
            }
          />

          <QuickAction
            icon="📚"
            title="Devoirs"
            description="Consulter ou déposer"
            onClick={() =>
              navigate(
                "/app/student/homework",
              )
            }
          />

          <QuickAction
            icon="📊"
            title="Progression"
            description="Suivre mon évolution"
            onClick={() =>
              navigate(
                "/app/student/progress",
              )
            }
          />
        </div>
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
      <div className="text-xs text-blue-100">
        {label}
      </div>

      <div className="mt-1 text-2xl font-bold">
        {value}
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  title,
  value,
  helper,
  tone,
}: {
  icon: string;
  title: string;
  value: string;
  helper: string;
  tone:
    | "blue"
    | "violet"
    | "green"
    | "amber";
}) {
  const toneClasses = {
    blue: "bg-blue-50 text-blue-700",
    violet:
      "bg-violet-50 text-violet-700",
    green:
      "bg-emerald-50 text-emerald-700",
    amber:
      "bg-amber-50 text-amber-700",
  };

  return (
    <div className="sn-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg ${toneClasses[tone]}`}
        >
          {icon}
        </div>

        <div className="rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-500">
          Temps réel
        </div>
      </div>

      <div className="mt-4 text-sm font-medium text-gray-500">
        {title}
      </div>

      <div className="mt-1 text-3xl font-bold text-gray-900">
        {value}
      </div>

      <div className="mt-2 text-xs text-gray-400">
        {helper}
      </div>
    </div>
  );
}

function MiniType({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div
      className={`rounded-2xl px-3 py-3 text-center ${className}`}
    >
      <div className="text-xl font-bold">
        {value}
      </div>

      <div className="mt-1 text-xs font-medium">
        {label}
      </div>
    </div>
  );
}

function TypeBadge({
  type,
}: {
  type: AssessmentType;
}) {
  const classes =
    type === "Quiz"
      ? "bg-blue-50 text-blue-700"
      : type === "Examen"
        ? "bg-red-50 text-red-700"
        : "bg-violet-50 text-violet-700";

  const icon =
    type === "Quiz"
      ? "🧩"
      : type === "Examen"
        ? "🧪"
        : "📚";

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}
    >
      {icon} {type}
    </span>
  );
}

function QuickAction({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-sm"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl shadow-sm transition group-hover:scale-105">
        {icon}
      </div>

      <div className="min-w-0">
        <div className="font-semibold text-gray-900">
          {title}
        </div>

        <div className="mt-0.5 text-xs text-gray-500">
          {description}
        </div>
      </div>
    </button>
  );
}

function EmptyChart({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xs text-center">
        <div className="text-3xl">
          📊
        </div>

        <div className="mt-2 text-sm text-gray-500">
          {message}
        </div>
      </div>
    </div>
  );
}