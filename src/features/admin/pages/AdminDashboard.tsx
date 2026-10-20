import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "student" | "teacher" | "parent" | "admin";

type AssessmentStatus = "draft" | "published" | "closed";

type SubmissionStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "published";

type AssessmentRow = {
  id: string;
  course_id: string;
  title: string;
  type: string;
  status: AssessmentStatus;
  created_at: string;
  updated_at: string;
};

type SubmissionRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  status: SubmissionStatus;
  score: number | null;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type CourseRow = {
  id: string;
  title: string;
  class_id: string | null;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: UserRole;
};

type DashboardStats = {
  users: {
    total: number;
    students: number;
    teachers: number;
    parents: number;
    admins: number;
  };
  classes: number;
  assessments: {
    published: number;
    draft: number;
    closed: number;
  };
  submissions: {
    submitted: number;
    graded: number;
    published: number;
  };
};

type ActivityItem = {
  id: string;
  date: string;
  icon: string;
  title: string;
  description: string;
  badge: string;
  badgeClass: string;
};

const EMPTY_STATS: DashboardStats = {
  users: {
    total: 0,
    students: 0,
    teachers: 0,
    parents: 0,
    admins: 0,
  },
  classes: 0,
  assessments: {
    published: 0,
    draft: 0,
    closed: 0,
  },
  submissions: {
    submitted: 0,
    graded: 0,
    published: 0,
  },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function assessmentTypeLabel(type: string) {
  if (type === "quiz") return "Quiz";
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";

  return "Évaluation";
}

function submissionStatusLabel(status: SubmissionStatus) {
  if (status === "submitted") return "À corriger";
  if (status === "graded") return "Corrigée";
  if (status === "published") return "Publiée";

  return "En cours";
}

function submissionBadgeClass(status: SubmissionStatus) {
  if (status === "submitted") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  if (status === "graded") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (status === "published") {
    return "bg-green-50 text-green-700 border-green-200";
  }

  return "bg-gray-50 text-gray-600 border-gray-200";
}

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
}: {
  title: string;
  value: number | string;
  subtitle: string;
  icon: string;
  tone?: "neutral" | "blue" | "green" | "amber" | "purple";
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "green"
        ? "bg-green-50 text-green-700"
        : tone === "amber"
          ? "bg-amber-50 text-amber-700"
          : tone === "purple"
            ? "bg-purple-50 text-purple-700"
            : "bg-gray-50 text-gray-700";

  return (
    <div className="sn-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">{title}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
          <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
        </div>

        <div
          className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center text-xl ${toneClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const loadDashboard = useCallback(async (silent = false) => {
    try {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const [
        usersTotalResult,
        studentsResult,
        teachersResult,
        parentsResult,
        adminsResult,
        classesResult,
        assessmentsPublishedResult,
        assessmentsDraftResult,
        assessmentsClosedResult,
        submittedResult,
        gradedResult,
        publishedSubmissionsResult,
        recentAssessmentsResult,
        recentSubmissionsResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "student"),

        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "teacher"),

        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "parent"),

        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin"),

        supabase
          .from("classes")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("assessments")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),

        supabase
          .from("assessments")
          .select("id", { count: "exact", head: true })
          .eq("status", "draft"),

        supabase
          .from("assessments")
          .select("id", { count: "exact", head: true })
          .eq("status", "closed"),

        supabase
          .from("assessment_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),

        supabase
          .from("assessment_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "graded"),

        supabase
          .from("assessment_submissions")
          .select("id", { count: "exact", head: true })
          .eq("status", "published"),

        supabase
          .from("assessments")
          .select(
            "id, course_id, title, type, status, created_at, updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(8),

        supabase
          .from("assessment_submissions")
          .select(
            "id, assessment_id, student_id, status, score, submitted_at, published_at, created_at, updated_at"
          )
          .order("updated_at", { ascending: false })
          .limit(8),
      ]);

      const baseResults = [
        usersTotalResult,
        studentsResult,
        teachersResult,
        parentsResult,
        adminsResult,
        classesResult,
        assessmentsPublishedResult,
        assessmentsDraftResult,
        assessmentsClosedResult,
        submittedResult,
        gradedResult,
        publishedSubmissionsResult,
        recentAssessmentsResult,
        recentSubmissionsResult,
      ];

      const firstError = baseResults
        .map((result) => result.error)
        .find((item) => Boolean(item));

      if (firstError) {
        throw firstError;
      }

      const recentAssessments =
        (recentAssessmentsResult.data ?? []) as AssessmentRow[];

      const recentSubmissions =
        (recentSubmissionsResult.data ?? []) as SubmissionRow[];

      const submissionAssessmentIds = Array.from(
        new Set(
          recentSubmissions
            .map((submission) => submission.assessment_id)
            .filter(Boolean)
        )
      );

      const assessmentsById: Record<string, AssessmentRow> =
        recentAssessments.reduce<Record<string, AssessmentRow>>(
          (accumulator, assessment) => {
            accumulator[assessment.id] = assessment;
            return accumulator;
          },
          {}
        );

      const missingAssessmentIds = submissionAssessmentIds.filter(
        (assessmentId) => !assessmentsById[assessmentId]
      );

      if (missingAssessmentIds.length > 0) {
        const { data, error: missingAssessmentsError } = await supabase
          .from("assessments")
          .select(
            "id, course_id, title, type, status, created_at, updated_at"
          )
          .in("id", missingAssessmentIds);

        if (missingAssessmentsError) {
          throw missingAssessmentsError;
        }

        ((data ?? []) as AssessmentRow[]).forEach((assessment) => {
          assessmentsById[assessment.id] = assessment;
        });
      }

      const allActivityAssessments = Object.values(assessmentsById);

      const courseIds = Array.from(
        new Set(
          allActivityAssessments
            .map((assessment) => assessment.course_id)
            .filter(Boolean)
        )
      );

      const studentIds = Array.from(
        new Set(
          recentSubmissions
            .map((submission) => submission.student_id)
            .filter(Boolean)
        )
      );

      let courses: CourseRow[] = [];
      let students: ProfileRow[] = [];

      if (courseIds.length > 0) {
        const { data, error: coursesError } = await supabase
          .from("courses")
          .select("id, title, class_id")
          .in("id", courseIds);

        if (coursesError) {
          throw coursesError;
        }

        courses = (data ?? []) as CourseRow[];
      }

      if (studentIds.length > 0) {
        const { data, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", studentIds);

        if (profilesError) {
          throw profilesError;
        }

        students = (data ?? []) as ProfileRow[];
      }

      const classIds = Array.from(
        new Set(
          courses
            .map((course) => course.class_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      let classes: ClassRow[] = [];

      if (classIds.length > 0) {
        const { data, error: classesDetailError } = await supabase
          .from("classes")
          .select("id, name, school_year")
          .in("id", classIds);

        if (classesDetailError) {
          throw classesDetailError;
        }

        classes = (data ?? []) as ClassRow[];
      }

      const coursesById = courses.reduce<Record<string, CourseRow>>(
        (accumulator, course) => {
          accumulator[course.id] = course;
          return accumulator;
        },
        {}
      );

      const classesById = classes.reduce<Record<string, ClassRow>>(
        (accumulator, classRow) => {
          accumulator[classRow.id] = classRow;
          return accumulator;
        },
        {}
      );

      const studentsById = students.reduce<Record<string, ProfileRow>>(
        (accumulator, profile) => {
          accumulator[profile.id] = profile;
          return accumulator;
        },
        {}
      );

      const assessmentActivities: ActivityItem[] = recentAssessments.map(
        (assessment) => {
          const course = coursesById[assessment.course_id];

          const classRow = course?.class_id
            ? classesById[course.class_id]
            : undefined;

          const classText = classRow
            ? `${classRow.name} • ${classRow.school_year}`
            : "Classe non renseignée";

          let badge = "Publiée";
          let badgeClass =
            "bg-green-50 text-green-700 border-green-200";
          let icon = "📢";

          if (assessment.status === "draft") {
            badge = "Brouillon";
            badgeClass =
              "bg-gray-50 text-gray-600 border-gray-200";
            icon = "📝";
          }

          if (assessment.status === "closed") {
            badge = "Clôturée";
            badgeClass =
              "bg-purple-50 text-purple-700 border-purple-200";
            icon = "🔒";
          }

          return {
            id: `assessment-${assessment.id}`,
            date: assessment.updated_at,
            icon,
            title: assessment.title,
            description: `${assessmentTypeLabel(assessment.type)} • ${
              course?.title ?? "Cours non renseigné"
            } • ${classText}`,
            badge,
            badgeClass,
          };
        }
      );

      const submissionActivities: ActivityItem[] = recentSubmissions.map(
        (submission) => {
          const assessment = assessmentsById[submission.assessment_id];
          const student = studentsById[submission.student_id];
          const course = assessment
            ? coursesById[assessment.course_id]
            : undefined;

          const studentName =
            student?.full_name?.trim() || "Élève";

          let icon = "📄";

          if (submission.status === "submitted") icon = "📥";
          if (submission.status === "graded") icon = "✅";
          if (submission.status === "published") icon = "📊";

          return {
            id: `submission-${submission.id}`,
            date:
              submission.published_at ??
              submission.submitted_at ??
              submission.updated_at,
            icon,
            title:
              assessment?.title ??
              "Soumission d’évaluation",
            description: `${studentName} • ${
              course?.title ?? "Cours non renseigné"
            }`,
            badge: submissionStatusLabel(submission.status),
            badgeClass: submissionBadgeClass(submission.status),
          };
        }
      );

      const mergedActivities = [
        ...assessmentActivities,
        ...submissionActivities,
      ]
        .sort(
          (a, b) =>
            new Date(b.date).getTime() -
            new Date(a.date).getTime()
        )
        .slice(0, 8);

      setStats({
        users: {
          total: usersTotalResult.count ?? 0,
          students: studentsResult.count ?? 0,
          teachers: teachersResult.count ?? 0,
          parents: parentsResult.count ?? 0,
          admins: adminsResult.count ?? 0,
        },
        classes: classesResult.count ?? 0,
        assessments: {
          published: assessmentsPublishedResult.count ?? 0,
          draft: assessmentsDraftResult.count ?? 0,
          closed: assessmentsClosedResult.count ?? 0,
        },
        submissions: {
          submitted: submittedResult.count ?? 0,
          graded: gradedResult.count ?? 0,
          published: publishedSubmissionsResult.count ?? 0,
        },
      });

      setActivities(mergedActivities);
      setLastRefreshAt(new Date());
    } catch (err) {
      console.error("[AdminDashboard] load error:", err);

      setError(
        "Impossible de charger le tableau de bord. Vérifiez les droits Supabase puis réessayez."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totalSubmissions = useMemo(
    () =>
      stats.submissions.submitted +
      stats.submissions.graded +
      stats.submissions.published,
    [stats.submissions]
  );

  const publishedRate = useMemo(() => {
    if (totalSubmissions === 0) return 0;

    return Math.round(
      (stats.submissions.published / totalSubmissions) * 100
    );
  }, [stats.submissions.published, totalSubmissions]);

  const attentionItems = useMemo(() => {
    const items: {
      id: string;
      icon: string;
      title: string;
      description: string;
      tone: string;
    }[] = [];

    if (stats.submissions.submitted > 0) {
      items.push({
        id: "submitted",
        icon: "⏳",
        title: `${stats.submissions.submitted} correction${
          stats.submissions.submitted > 1 ? "s" : ""
        } en attente`,
        description:
          "Des copies ont été soumises et doivent encore être corrigées par les enseignants.",
        tone: "bg-amber-50 border-amber-200 text-amber-800",
      });
    }

    if (stats.submissions.graded > 0) {
      items.push({
        id: "graded",
        icon: "📝",
        title: `${stats.submissions.graded} correction${
          stats.submissions.graded > 1 ? "s" : ""
        } non publiée${
          stats.submissions.graded > 1 ? "s" : ""
        }`,
        description:
          "Ces résultats ont été corrigés mais ne sont pas encore visibles par les élèves et parents.",
        tone: "bg-blue-50 border-blue-200 text-blue-800",
      });
    }

    if (stats.assessments.draft > 0) {
      items.push({
        id: "draft",
        icon: "📄",
        title: `${stats.assessments.draft} évaluation${
          stats.assessments.draft > 1 ? "s" : ""
        } en brouillon`,
        description:
          "Des évaluations existent encore à l’état de brouillon.",
        tone: "bg-gray-50 border-gray-200 text-gray-700",
      });
    }

    return items;
  }, [
    stats.assessments.draft,
    stats.submissions.graded,
    stats.submissions.submitted,
  ]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xl font-semibold">
            Tableau de bord
          </div>
          <div className="text-sm text-gray-500">
            Chargement des données SchoolNet…
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="sn-card p-5 animate-pulse space-y-3"
            >
              <div className="h-4 w-1/2 rounded bg-gray-200" />
              <div className="h-8 w-1/3 rounded bg-gray-200" />
              <div className="h-3 w-2/3 rounded bg-gray-100" />
            </div>
          ))}
        </div>

        <div className="sn-card p-6 animate-pulse space-y-3">
          <div className="h-5 w-1/4 rounded bg-gray-200" />
          <div className="h-16 rounded bg-gray-100" />
          <div className="h-16 rounded bg-gray-100" />
          <div className="h-16 rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xl font-semibold">
            Tableau de bord
          </div>
          <div className="text-sm text-gray-500">
            Vue d’ensemble de l’activité réelle de SchoolNet.
          </div>

          {lastRefreshAt && (
            <div className="mt-1 text-xs text-gray-400">
              Dernière actualisation :{" "}
              {formatDateTime(lastRefreshAt.toISOString())}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/admin/users")}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            👥 Utilisateurs
          </button>

          <button
            type="button"
            onClick={() => navigate("/app/admin/classes")}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            🏫 Classes
          </button>

          <button
            type="button"
            onClick={() => void loadDashboard(true)}
            disabled={refreshing}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Actualisation…" : "↻ Actualiser"}
          </button>
        </div>
      </div>

      {error && (
        <div className="sn-card border border-red-200 bg-red-50 p-5">
          <div className="font-semibold text-red-700">
            Impossible de charger certaines données
          </div>

          <div className="mt-1 text-sm text-red-600">
            {error}
          </div>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      )}

      {!error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              title="Utilisateurs"
              value={stats.users.total}
              subtitle={`${stats.users.students} apprenant • ${stats.users.teachers} enseignant`}
              icon="👥"
              tone="blue"
            />

            <KpiCard
              title="Classes"
              value={stats.classes}
              subtitle="Classes enregistrées"
              icon="🏫"
              tone="purple"
            />

            <KpiCard
              title="Évaluations publiées"
              value={stats.assessments.published}
              subtitle="Disponibles dans SchoolNet"
              icon="🧪"
              tone="green"
            />

            <KpiCard
              title="Corrections en attente"
              value={stats.submissions.submitted}
              subtitle="Copies soumises à traiter"
              icon="⏳"
              tone="amber"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="sn-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    Utilisateurs
                  </div>
                  <div className="text-sm text-gray-500">
                    Répartition des comptes par rôle.
                  </div>
                </div>

                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {stats.users.total} comptes
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    🎓 Apprenants
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {stats.users.students}
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    👩‍🏫 Enseignants
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {stats.users.teachers}
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    👨‍👩‍👧 Parents / Tuteurs
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {stats.users.parents}
                  </div>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    🛠️ Administrateurs
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {stats.users.admins}
                  </div>
                </div>
              </div>
            </div>

            <div className="sn-card p-6">
              <div>
                <div className="text-lg font-semibold">
                  Suivi des corrections
                </div>
                <div className="text-sm text-gray-500">
                  État des soumissions d’évaluations.
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-amber-50 p-4">
                  <div className="text-xs text-amber-700">
                    À corriger
                  </div>
                  <div className="mt-2 text-2xl font-bold text-amber-800">
                    {stats.submissions.submitted}
                  </div>
                </div>

                <div className="rounded-2xl bg-blue-50 p-4">
                  <div className="text-xs text-blue-700">
                    Corrigées
                  </div>
                  <div className="mt-2 text-2xl font-bold text-blue-800">
                    {stats.submissions.graded}
                  </div>
                </div>

                <div className="rounded-2xl bg-green-50 p-4">
                  <div className="text-xs text-green-700">
                    Publiées
                  </div>
                  <div className="mt-2 text-2xl font-bold text-green-800">
                    {stats.submissions.published}
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                  <span>Résultats publiés</span>
                  <span>{publishedRate}%</span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, publishedRate)
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-2 text-xs text-gray-400">
                  {stats.submissions.published} résultat
                  {stats.submissions.published > 1 ? "s" : ""} publié
                  {stats.submissions.published > 1 ? "s" : ""} sur{" "}
                  {totalSubmissions} soumission
                  {totalSubmissions > 1 ? "s" : ""} suivie
                  {totalSubmissions > 1 ? "s" : ""}.
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
            <div className="sn-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    Activité récente
                  </div>
                  <div className="text-sm text-gray-500">
                    Derniers mouvements sur les évaluations et
                    corrections.
                  </div>
                </div>

                <div className="text-xs text-gray-400">
                  {activities.length} événement
                  {activities.length > 1 ? "s" : ""}
                </div>
              </div>

              {activities.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                  <div className="text-2xl">📭</div>
                  <div className="mt-2 font-semibold text-gray-700">
                    Aucune activité récente
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    Les nouvelles activités apparaîtront ici.
                  </div>
                </div>
              ) : (
                <div className="mt-5 divide-y divide-gray-100">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-lg">
                        {activity.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-gray-900">
                            {activity.title}
                          </div>

                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${activity.badgeClass}`}
                          >
                            {activity.badge}
                          </span>
                        </div>

                        <div className="mt-1 text-sm text-gray-500">
                          {activity.description}
                        </div>

                        <div className="mt-1 text-xs text-gray-400">
                          {formatDateTime(activity.date)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sn-card p-6">
              <div>
                <div className="text-lg font-semibold">
                  Points d’attention
                </div>
                <div className="text-sm text-gray-500">
                  Éléments nécessitant éventuellement un suivi.
                </div>
              </div>

              {attentionItems.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-800">
                  <div className="font-semibold">
                    ✅ Aucun point critique
                  </div>
                  <div className="mt-1 text-sm text-green-700">
                    Aucun élément ne nécessite d’action immédiate.
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {attentionItems.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 ${item.tone}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-lg">
                          {item.icon}
                        </div>

                        <div>
                          <div className="font-semibold">
                            {item.title}
                          </div>
                          <div className="mt-1 text-sm opacity-80">
                            {item.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                <div className="text-xs text-gray-500">
                  État des évaluations
                </div>

                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span>Publiées</span>
                    <span className="font-semibold">
                      {stats.assessments.published}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span>Brouillons</span>
                    <span className="font-semibold">
                      {stats.assessments.draft}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span>Clôturées</span>
                    <span className="font-semibold">
                      {stats.assessments.closed}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}