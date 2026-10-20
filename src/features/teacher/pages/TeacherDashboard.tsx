import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

type CourseStatus = "active" | "archived";
type AssessmentType = "quiz" | "assignment" | "exam";
type AssessmentStatus = "draft" | "published" | "closed";

type SubmissionStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "published";

type CourseRow = {
  id: string;
  title: string;
  status: CourseStatus;
  class_id: string | null;
  created_by: string;
};

type CourseTeacherRow = {
  course_id: string;
  courses: CourseRow | CourseRow[] | null;
};

type EnrollmentRow = {
  course_id: string;
  student_id: string;
};

type ProgressRow = {
  course_id: string;
  student_id: string;
  progress_percent: number | string | null;
};

type AssessmentRow = {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  due_at: string | null;
  max_score: number | string | null;
  course_id: string;
  submission_mode: string | null;
  created_at: string;
};

type AssessmentSubmissionRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | string | null;
};

type HomeworkSubmissionRow = {
  id: string;
  homework_id: string;
  student_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | string | null;
};

type UnifiedSubmission = {
  id: string;
  assessmentId: string;
  studentId: string;
  submittedAt: string | null;
  status: SubmissionStatus;
  score: number | string | null;
};

const PIE_COLORS = ["#2563eb", "#8b5cf6", "#ef4444"];

function normalizeAssignedCourses(
  rows: CourseTeacherRow[] | null | undefined
): CourseRow[] {
  if (!rows) return [];

  return rows
    .map((row) => {
      if (!row.courses) return null;

      return Array.isArray(row.courses)
        ? row.courses[0] ?? null
        : row.courses;
    })
    .filter((course): course is CourseRow => Boolean(course));
}

function dedupeCourses(rows: CourseRow[]) {
  const map = new Map<string, CourseRow>();

  rows.forEach((course) => {
    map.set(course.id, course);
  });

  return Array.from(map.values());
}

function numeric(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function shortLabel(value: string, max = 20) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [submissions, setSubmissions] = useState<UnifiedSubmission[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!user || user.isDemo) {
      setCourses([]);
      setEnrollments([]);
      setProgressRows([]);
      setAssessments([]);
      setSubmissions([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      /*
       * 1. Récupérer les cours créés par l'enseignant
       *    ainsi que les cours auxquels il est affecté.
       */
      const [createdCoursesResult, assignedCoursesResult] =
        await Promise.all([
          supabase
            .from("courses")
            .select(
              "id, title, status, class_id, created_by"
            )
            .eq("created_by", user.id),

          supabase
            .from("course_teachers")
            .select(`
              course_id,
              courses (
                id,
                title,
                status,
                class_id,
                created_by
              )
            `)
            .eq("teacher_id", user.id),
        ]);

      if (createdCoursesResult.error) {
        throw createdCoursesResult.error;
      }

      if (assignedCoursesResult.error) {
        throw assignedCoursesResult.error;
      }

      const createdCourses =
        (createdCoursesResult.data ?? []) as CourseRow[];

      const assignedCourses = normalizeAssignedCourses(
        (assignedCoursesResult.data ?? []) as unknown as CourseTeacherRow[]
      );

      const teacherCourses = dedupeCourses([
        ...createdCourses,
        ...assignedCourses,
      ]);

      setCourses(teacherCourses);

      const courseIds = teacherCourses.map((course) => course.id);

      if (courseIds.length === 0) {
        setEnrollments([]);
        setProgressRows([]);
        setAssessments([]);
        setSubmissions([]);
        setLastUpdated(new Date());
        return;
      }

      /*
       * 2. Apprenants, progression et évaluations
       *    des cours suivis par cet enseignant.
       */
      const [
        enrollmentsResult,
        progressResult,
        assessmentsResult,
      ] = await Promise.all([
        supabase
          .from("course_enrollments")
          .select("course_id, student_id")
          .in("course_id", courseIds),

        supabase
          .from("student_progress")
          .select(
            "course_id, student_id, progress_percent"
          )
          .in("course_id", courseIds),

        supabase
          .from("assessments")
          .select(`
            id,
            title,
            type,
            status,
            due_at,
            max_score,
            course_id,
            submission_mode,
            created_at
          `)
          .in("course_id", courseIds)
          .order("created_at", {
            ascending: false,
          }),
      ]);

      if (enrollmentsResult.error) {
        throw enrollmentsResult.error;
      }

      if (progressResult.error) {
        throw progressResult.error;
      }

      if (assessmentsResult.error) {
        throw assessmentsResult.error;
      }

      const enrollmentRows =
        (enrollmentsResult.data ?? []) as EnrollmentRow[];

      const loadedProgressRows =
        (progressResult.data ?? []) as ProgressRow[];

      const assessmentRows =
        (assessmentsResult.data ?? []) as AssessmentRow[];

      setEnrollments(enrollmentRows);
      setProgressRows(loadedProgressRows);
      setAssessments(assessmentRows);

      const assessmentIds = assessmentRows.map(
        (assessment) => assessment.id
      );

      if (assessmentIds.length === 0) {
        setSubmissions([]);
        setLastUpdated(new Date());
        return;
      }

      /*
       * 3. Récupérer les deux systèmes de soumission déjà
       *    utilisés dans SchoolNet.
       */
      const [
        assessmentSubmissionsResult,
        homeworkSubmissionsResult,
      ] = await Promise.all([
        supabase
          .from("assessment_submissions")
          .select(`
            id,
            assessment_id,
            student_id,
            submitted_at,
            status,
            score
          `)
          .in("assessment_id", assessmentIds),

        supabase
          .from("homework_submissions")
          .select(`
            id,
            homework_id,
            student_id,
            submitted_at,
            status,
            score
          `)
          .in("homework_id", assessmentIds),
      ]);

      if (assessmentSubmissionsResult.error) {
        throw assessmentSubmissionsResult.error;
      }

      if (homeworkSubmissionsResult.error) {
        throw homeworkSubmissionsResult.error;
      }

      const onlineRows =
        (assessmentSubmissionsResult.data ??
          []) as AssessmentSubmissionRow[];

      const homeworkRows =
        (homeworkSubmissionsResult.data ??
          []) as HomeworkSubmissionRow[];

      const assessmentById =
        assessmentRows.reduce<Record<string, AssessmentRow>>(
          (acc, assessment) => {
            acc[assessment.id] = assessment;
            return acc;
          },
          {}
        );

      /*
       * Même règle que le module Corrections :
       * - assessment_submissions pour les évaluations en ligne ;
       * - homework_submissions pour les devoirs déposés par fichier.
       */
      const normalizedOnline: UnifiedSubmission[] =
        onlineRows
          .filter((submission) => {
            const assessment =
              assessmentById[submission.assessment_id];

            return (
              assessment &&
              assessment.submission_mode !== "file_upload"
            );
          })
          .map((submission) => ({
            id: submission.id,
            assessmentId: submission.assessment_id,
            studentId: submission.student_id,
            submittedAt: submission.submitted_at,
            status: submission.status,
            score: submission.score,
          }));

      const normalizedHomework: UnifiedSubmission[] =
        homeworkRows
          .filter((submission) => {
            const assessment =
              assessmentById[submission.homework_id];

            return (
              assessment?.type === "assignment" &&
              assessment.submission_mode === "file_upload"
            );
          })
          .map((submission) => ({
            id: submission.id,
            assessmentId: submission.homework_id,
            studentId: submission.student_id,
            submittedAt: submission.submitted_at,
            status: submission.status,
            score: submission.score,
          }));

      setSubmissions([
        ...normalizedOnline,
        ...normalizedHomework,
      ]);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(
        "[TeacherDashboard] loadDashboard error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger le tableau de bord."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      void loadDashboard();
    }
  }, [authLoading, loadDashboard]);

  const assessmentById = useMemo(() => {
    return assessments.reduce<Record<string, AssessmentRow>>(
      (acc, assessment) => {
        acc[assessment.id] = assessment;
        return acc;
      },
      {}
    );
  }, [assessments]);

  const courseById = useMemo(() => {
    return courses.reduce<Record<string, CourseRow>>(
      (acc, course) => {
        acc[course.id] = course;
        return acc;
      },
      {}
    );
  }, [courses]);

  const uniqueStudentCount = useMemo(() => {
    return new Set(
      enrollments.map((row) => row.student_id)
    ).size;
  }, [enrollments]);

  const activeCourseCount = useMemo(() => {
    return courses.filter(
      (course) => course.status === "active"
    ).length;
  }, [courses]);

  const publishedAssessmentCount = useMemo(() => {
    return assessments.filter(
      (assessment) => assessment.status === "published"
    ).length;
  }, [assessments]);

  const submittedCount = useMemo(() => {
    return submissions.filter(
      (submission) => submission.status === "submitted"
    ).length;
  }, [submissions]);

  const gradedCount = useMemo(() => {
    return submissions.filter(
      (submission) =>
        submission.status === "graded" ||
        submission.status === "published"
    ).length;
  }, [submissions]);

  const correctionRate = useMemo(() => {
    const concerned = submissions.filter((submission) =>
      ["submitted", "graded", "published"].includes(
        submission.status
      )
    );

    if (concerned.length === 0) {
      return 0;
    }

    const corrected = concerned.filter((submission) =>
      ["graded", "published"].includes(submission.status)
    ).length;

    return clampPercent(
      (corrected / concerned.length) * 100
    );
  }, [submissions]);

  const averageProgress = useMemo(() => {
    if (progressRows.length === 0) {
      return 0;
    }

    const total = progressRows.reduce(
      (sum, row) =>
        sum + numeric(row.progress_percent),
      0
    );

    return clampPercent(total / progressRows.length);
  }, [progressRows]);

  const averageScore = useMemo(() => {
    const normalizedScores = submissions
      .filter((submission) =>
        ["graded", "published"].includes(
          submission.status
        )
      )
      .map((submission) => {
        const assessment =
          assessmentById[submission.assessmentId];

        const score = numeric(submission.score);
        const maxScore = numeric(assessment?.max_score);

        if (maxScore <= 0) {
          return null;
        }

        return (score / maxScore) * 100;
      })
      .filter(
        (value): value is number =>
          value !== null && Number.isFinite(value)
      );

    if (normalizedScores.length === 0) {
      return 0;
    }

    return clampPercent(
      normalizedScores.reduce(
        (sum, value) => sum + value,
        0
      ) / normalizedScores.length
    );
  }, [submissions, assessmentById]);

  const assessmentTypeData = useMemo(() => {
    const values = {
      quiz: 0,
      assignment: 0,
      exam: 0,
    };

    assessments.forEach((assessment) => {
      values[assessment.type] += 1;
    });

    return [
      {
        name: "Quiz",
        value: values.quiz,
      },
      {
        name: "Devoirs",
        value: values.assignment,
      },
      {
        name: "Examens",
        value: values.exam,
      },
    ];
  }, [assessments]);

  const workloadByCourse = useMemo(() => {
    return courses
      .map((course) => {
        const relatedAssessmentIds = new Set(
          assessments
            .filter(
              (assessment) =>
                assessment.course_id === course.id
            )
            .map((assessment) => assessment.id)
        );

        const relatedSubmissions = submissions.filter(
          (submission) =>
            relatedAssessmentIds.has(
              submission.assessmentId
            )
        );

        const toGrade = relatedSubmissions.filter(
          (submission) =>
            submission.status === "submitted"
        ).length;

        const corrected = relatedSubmissions.filter(
          (submission) =>
            submission.status === "graded" ||
            submission.status === "published"
        ).length;

        return {
          name: shortLabel(course.title),
          "À corriger": toGrade,
          Corrigées: corrected,
        };
      })
      .filter(
        (item) =>
          item["À corriger"] > 0 ||
          item.Corrigées > 0
      )
      .slice(0, 7);
  }, [courses, assessments, submissions]);

  const scoreTrend = useMemo(() => {
    return [...assessments]
      .sort((a, b) => {
        const dateA = new Date(
          a.due_at ?? a.created_at
        ).getTime();

        const dateB = new Date(
          b.due_at ?? b.created_at
        ).getTime();

        return dateA - dateB;
      })
      .map((assessment) => {
        const relatedScores = submissions
          .filter(
            (submission) =>
              submission.assessmentId === assessment.id &&
              ["graded", "published"].includes(
                submission.status
              )
          )
          .map((submission) => {
            const score = numeric(submission.score);
            const max = numeric(assessment.max_score);

            if (max <= 0) {
              return null;
            }

            return (score / max) * 100;
          })
          .filter(
            (value): value is number =>
              value !== null &&
              Number.isFinite(value)
          );

        if (relatedScores.length === 0) {
          return null;
        }

        return {
          name: shortLabel(assessment.title, 18),
          moyenne: clampPercent(
            relatedScores.reduce(
              (sum, value) => sum + value,
              0
            ) / relatedScores.length
          ),
        };
      })
      .filter(
        (
          value
        ): value is {
          name: string;
          moyenne: number;
        } => value !== null
      )
      .slice(-8);
  }, [assessments, submissions]);

  const upcomingAssessments = useMemo(() => {
    const now = Date.now();

    return assessments
      .filter((assessment) => {
        if (
          assessment.status !== "published" ||
          !assessment.due_at
        ) {
          return false;
        }

        const timestamp =
          new Date(assessment.due_at).getTime();

        return (
          Number.isFinite(timestamp) &&
          timestamp >= now
        );
      })
      .sort(
        (a, b) =>
          new Date(a.due_at ?? 0).getTime() -
          new Date(b.due_at ?? 0).getTime()
      )
      .slice(0, 5);
  }, [assessments]);

  const loadingScreen =
    authLoading || loading;

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-gray-900">
            Tableau de bord
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Pilotez vos cours, vos évaluations et vos corrections en un coup d’œil.
          </div>

          {lastUpdated && (
            <div className="mt-1 text-xs text-gray-400">
              Dernière actualisation :{" "}
              {lastUpdated.toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="sn-btn-ghost sn-press"
          onClick={() => void loadDashboard()}
          disabled={loadingScreen}
        >
          ↻ Actualiser
        </button>
      </div>

      {error && (
        <div className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">
            Impossible de charger certaines statistiques
          </div>

          <div className="mt-1">{error}</div>
        </div>
      )}

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-6 text-white shadow-lg">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-28 right-16 h-64 w-64 rounded-full bg-white/5" />

        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              👨‍🏫 Mon espace enseignant
            </div>

            <div className="mt-4 text-2xl font-bold sm:text-3xl">
              Toute votre activité pédagogique, au même endroit.
            </div>

            <div className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
              Suivez vos cours, les progrès de vos apprenants,
              les évaluations publiées et les copies qui attendent
              votre correction.
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                onClick={() =>
                  navigate("/app/teacher/courses")
                }
              >
                📚 Mes cours
              </button>

              <button
                type="button"
                className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                onClick={() =>
                  navigate("/app/teacher/grading")
                }
              >
                ✅ Voir les corrections
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[340px]">
            <HeroStat
              label="Cours actifs"
              value={String(activeCourseCount)}
            />

            <HeroStat
              label="Apprenants"
              value={String(uniqueStudentCount)}
            />

            <HeroStat
              label="À corriger"
              value={String(submittedCount)}
            />

            <HeroStat
              label="Taux de correction"
              value={`${correctionRate}%`}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          icon="📚"
          label="Cours actifs"
          value={String(activeCourseCount)}
          meta={`${courses.length} cours au total`}
        />

        <KpiCard
          icon="👥"
          label="Apprenants suivis"
          value={String(uniqueStudentCount)}
          meta={`${enrollments.length} inscription(s)`}
        />

        <KpiCard
          icon="🧪"
          label="Évaluations publiées"
          value={String(publishedAssessmentCount)}
          meta={`${assessments.length} créées au total`}
        />

        <KpiCard
          icon="📝"
          label="À corriger"
          value={String(submittedCount)}
          meta={`${gradedCount} copie(s) corrigée(s)`}
        />

        <KpiCard
          icon="🏅"
          label="Moyenne des copies"
          value={`${averageScore}%`}
          meta="Copies notées disponibles"
        />

        <KpiCard
          icon="📈"
          label="Progression moyenne"
          value={`${averageProgress}%`}
          meta="Progression des apprenants"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <div className="sn-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">
                Charge de correction par cours
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Copies en attente et copies déjà corrigées.
              </div>
            </div>

            <span className="sn-badge sn-badge-blue">
              Temps réel
            </span>
          </div>

          <div className="mt-5 h-80">
            {workloadByCourse.length === 0 ? (
              <EmptyChart
                icon="✅"
                title="Aucune correction en attente"
                text="Les statistiques apparaîtront dès que des copies seront soumises."
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart data={workloadByCourse}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                  />

                  <Tooltip />

                  <Bar
                    dataKey="À corriger"
                    fill="#f59e0b"
                    radius={[8, 8, 0, 0]}
                  />

                  <Bar
                    dataKey="Corrigées"
                    fill="#10b981"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="sn-card p-5">
          <div>
            <div className="font-semibold text-gray-900">
              Répartition des évaluations
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Quiz, devoirs et examens créés.
            </div>
          </div>

          <div className="mt-4 h-60">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <PieChart>
                <Pie
                  data={assessmentTypeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={82}
                  paddingAngle={4}
                >
                  {assessmentTypeData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={
                        PIE_COLORS[
                          index % PIE_COLORS.length
                        ]
                      }
                    />
                  ))}
                </Pie>

                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {assessmentTypeData.map((item, index) => (
              <div
                key={item.name}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-center"
              >
                <div
                  className="mx-auto h-2 w-8 rounded-full"
                  style={{
                    backgroundColor:
                      PIE_COLORS[
                        index % PIE_COLORS.length
                      ],
                  }}
                />

                <div className="mt-2 text-lg font-bold text-gray-900">
                  {item.value}
                </div>

                <div className="text-xs text-gray-500">
                  {item.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="sn-card p-5">
          <div>
            <div className="font-semibold text-gray-900">
              Évolution des résultats
            </div>

            <div className="mt-1 text-sm text-gray-500">
              Moyenne obtenue par évaluation, normalisée sur 100.
            </div>
          </div>

          <div className="mt-5 h-72">
            {scoreTrend.length === 0 ? (
              <EmptyChart
                icon="📈"
                title="Pas encore assez de résultats"
                text="La courbe se remplira lorsque des copies auront été notées."
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <LineChart data={scoreTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                  />

                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />

                  <Tooltip />

                  <Line
                    type="monotone"
                    dataKey="moyenne"
                    stroke="#4f46e5"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "#4f46e5",
                    }}
                    activeDot={{
                      r: 6,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="sn-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">
                Prochaines échéances
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Les évaluations publiées à surveiller.
              </div>
            </div>

            <span className="sn-badge sn-badge-gray">
              {upcomingAssessments.length}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {upcomingAssessments.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
                <div className="text-2xl">🎉</div>

                <div className="mt-2 font-semibold text-gray-900">
                  Rien d’urgent
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Aucune échéance à venir pour le moment.
                </div>
              </div>
            ) : (
              upcomingAssessments.map((assessment) => (
                <button
                  type="button"
                  key={assessment.id}
                  onClick={() =>
                    navigate(
                      `/app/teacher/assessments/${assessment.id}`
                    )
                  }
                  className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">
                        {assessment.title}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {courseById[
                          assessment.course_id
                        ]?.title ?? "Cours"}
                      </div>
                    </div>

                    <span className="sn-badge sn-badge-blue">
                      {assessment.type === "assignment"
                        ? "Devoir"
                        : assessment.type === "exam"
                        ? "Examen"
                        : "Quiz"}
                    </span>
                  </div>

                  {assessment.due_at && (
                    <div className="mt-3 text-sm font-medium text-indigo-600">
                      📅 {formatDate(assessment.due_at)}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="sn-card p-5">
        <div>
          <div className="font-semibold text-gray-900">
            Accès rapides
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Retrouvez rapidement vos principales actions pédagogiques.
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction
            icon="📚"
            title="Mes cours"
            description="Créer, organiser et consulter mes cours."
            onClick={() =>
              navigate("/app/teacher/courses")
            }
          />

          <QuickAction
            icon="🏫"
            title="Mes classes"
            description="Consulter mes classes et mes apprenants."
            onClick={() =>
              navigate("/app/teacher/classes")
            }
          />

          <QuickAction
            icon="🧪"
            title="Nouvelle évaluation"
            description="Créer un quiz, un devoir ou un examen."
            onClick={() =>
              navigate("/app/teacher/assessments/new")
            }
          />

          <QuickAction
            icon="✅"
            title="Corrections"
            description="Corriger et publier les résultats."
            onClick={() =>
              navigate("/app/teacher/grading")
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
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
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
  label,
  value,
  meta,
}: {
  icon: string;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className="sn-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-50 text-lg">
          {icon}
        </div>

        <span className="sn-badge sn-badge-gray">
          Temps réel
        </span>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        {label}
      </div>

      <div className="mt-1 text-2xl font-bold text-gray-900">
        {value}
      </div>

      <div className="mt-1 text-xs text-gray-400">
        {meta}
      </div>
    </div>
  );
}

function EmptyChart({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-8 text-center">
      <div>
        <div className="text-3xl">{icon}</div>

        <div className="mt-3 font-semibold text-gray-900">
          {title}
        </div>

        <div className="mt-1 max-w-sm text-sm text-gray-500">
          {text}
        </div>
      </div>
    </div>
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
      className="rounded-2xl border border-gray-100 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-lg">
        {icon}
      </div>

      <div className="mt-3 font-semibold text-gray-900">
        {title}
      </div>

      <div className="mt-1 text-sm leading-5 text-gray-500">
        {description}
      </div>
    </button>
  );
}