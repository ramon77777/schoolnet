import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useNavigate, useSearchParams } from "react-router-dom";
import StudentSchoolCourses from "./StudentSchoolCourses";
import {
  selectStudentCourseTab,
  type StudentCourseTab,
} from "@/features/student/lib/studentCourseTabs";

type DbCourse = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

type EnrollmentRow = {
  course_id: string;
  courses: DbCourse | DbCourse[] | null;
};

type ProgressRow = {
  course_id: string;
  progress_percent: number;
};

type StudentCourseCardView = {
  id: string;
  title: string;
  progress: number;
  tag?: "Nouveau";
  meta: string;
  status: "active" | "archived";
};

function formatRelativeNewBadge(createdAt: string): "Nouveau" | undefined {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return undefined;

  const now = Date.now();
  const diffDays = (now - created) / (1000 * 60 * 60 * 24);

  return diffDays <= 7 ? "Nouveau" : undefined;
}

function normalizeEnrollmentRows(rows: EnrollmentRow[] | null | undefined): DbCourse[] {
  if (!rows) return [];

  return rows
    .map((row) => {
      if (!row.courses) return null;
      return Array.isArray(row.courses) ? row.courses[0] ?? null : row.courses;
    })
    .filter((course): course is DbCourse => Boolean(course));
}

function buildMeta(course: DbCourse): string {
  const parts: string[] = [];

  parts.push(course.status === "active" ? "Actif" : "Archivé");

  if (course.description?.trim()) {
    parts.push(course.description.trim());
  }

  return parts.join(" • ");
}

function clampProgress(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function StudentCourses() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = user?.id ?? "";
  const [officialSummary, setOfficialSummary] = useState<{
    userId: string;
    count: number;
  } | null>(null);
  const onOfficialLoaded = useCallback((ownerId: string, count: number) => {
    setOfficialSummary({ userId: ownerId, count });
  }, []);
  const officialCount = user?.isDemo
    ? 0
    : officialSummary?.userId === userId
      ? officialSummary.count
      : null;
  const activeTab = selectStudentCourseTab(searchParams.get("tab"), officialCount);
  const chooseTab = (tab: StudentCourseTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const [courses, setCourses] = useState<DbCourse[]>([]);
  const [progressByCourse, setProgressByCourse] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    if (!user || user.isDemo) {
      setCourses([]);
      setProgressByCourse({});
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [enrollmentsResult, progressResult] = await Promise.all([
        supabase
          .from("course_enrollments")
          .select(
            `
            course_id,
            courses (
              id,
              title,
              description,
              status,
              created_at,
              updated_at
            )
          `
          )
          .eq("student_id", user.id),

        supabase
          .from("student_progress")
          .select("course_id, progress_percent")
          .eq("student_id", user.id),
      ]);

      if (enrollmentsResult.error) {
        throw enrollmentsResult.error;
      }

      if (progressResult.error) {
        throw progressResult.error;
      }

      const enrolledCourses = normalizeEnrollmentRows(
        (enrollmentsResult.data ?? []) as EnrollmentRow[]
      ).sort((a, b) => {
        const aTime = new Date(a.updated_at ?? a.created_at).getTime();
        const bTime = new Date(b.updated_at ?? b.created_at).getTime();
        return bTime - aTime;
      });

      const progressMap = ((progressResult.data ?? []) as ProgressRow[]).reduce<
        Record<string, number>
      >((acc, row) => {
        acc[row.course_id] = clampProgress(row.progress_percent);
        return acc;
      }, {});

      setCourses(enrolledCourses);
      setProgressByCourse(progressMap);
    } catch (err) {
      console.error("[StudentCourses] loadCourses error:", err);
      setError("Impossible de charger vos cours pour le moment.");
      setCourses([]);
      setProgressByCourse({});
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadCourses();
  }, [authLoading, loadCourses]);

  const courseCards = useMemo<StudentCourseCardView[]>(
    () =>
      courses.map((course) => ({
        id: course.id,
        title: course.title,
        progress: clampProgress(progressByCourse[course.id]),
        tag: formatRelativeNewBadge(course.created_at),
        meta: buildMeta(course),
        status: course.status,
      })),
    [courses, progressByCourse]
  );

  const isInitialLoading = authLoading || loading;

  return (
    <div className="space-y-5 pb-8">
      <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
          SCHOOLNET · Espace apprenant
        </p>
        <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-950">
          Mes cours
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 max-w-3xl">
          Tous vos apprentissages au même endroit : cours de votre établissement
          et cours complémentaires SCHOOLNET, sans mélanger les inscriptions.
        </p>
      </header>

      <div role="tablist" aria-label="Catégories de cours" className="sn-card flex flex-wrap gap-2 p-2">
        <button
          type="button"
          id="student-official-tab"
          role="tab"
          aria-selected={activeTab === "official"}
          aria-controls="student-official-panel"
          onClick={() => chooseTab("official")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === "official" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
        >
          🏫 Cours de mon établissement
          {officialCount !== null && <span className="ml-2 opacity-80">({officialCount})</span>}
        </button>
        <button
          type="button"
          id="student-complementary-tab"
          role="tab"
          aria-selected={activeTab === "complementary"}
          aria-controls="student-complementary-panel"
          onClick={() => chooseTab("complementary")}
          className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${activeTab === "complementary" ? "bg-blue-600 text-white shadow-sm" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
        >
          📘 Cours complémentaires
        </button>
      </div>

      <div
        role="tabpanel"
        id="student-official-panel"
        aria-labelledby="student-official-tab"
        hidden={activeTab !== "official"}
      >
        <StudentSchoolCourses onCatalogLoaded={onOfficialLoaded} />
      </div>

      <div
        role="tabpanel"
        id="student-complementary-panel"
        aria-labelledby="student-complementary-tab"
        hidden={activeTab !== "complementary"}
        className="space-y-4"
      >
        <p className="text-sm text-slate-600">
          Cours libres auxquels vous êtes inscrit, avec leur progression personnelle.
        </p>
      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les cours réels Supabase ne sont pas chargés.
        </div>
      )}

      {isInitialLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="sn-card p-5 space-y-3 animate-pulse">
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-3 w-full rounded bg-gray-100" />
              <div className="h-10 w-full rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!isInitialLoading && error && (
        <div className="sn-card p-5 border border-red-200 bg-red-50 text-red-700 space-y-3">
          <div className="font-medium">Erreur de chargement</div>
          <div className="text-sm">{error}</div>
          <button className="sn-btn-primary sn-press w-fit" onClick={() => void loadCourses()}>
            Réessayer
          </button>
        </div>
      )}

      {!isInitialLoading && !error && courseCards.length === 0 && (
        <div className="sn-card p-8 text-center space-y-3">
          <div className="text-lg font-semibold text-gray-900">Aucun cours pour l’instant</div>
          <div className="text-sm text-gray-500 max-w-md mx-auto">
            Vous n’êtes inscrit à aucun cours pour le moment.
          </div>
        </div>
      )}

      {!isInitialLoading && !error && courseCards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courseCards.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onOpen={() => navigate(`/app/student/courses/${course.id}`)}
            />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

function CourseCard({
  course,
  onOpen,
}: {
  course: StudentCourseCardView;
  onOpen: () => void;
}) {
  return (
    <div className="sn-card sn-card-hover sn-pop p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{course.title}</div>
          <div className="text-sm text-gray-500 line-clamp-2">{course.meta}</div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {course.tag && <span className="sn-badge sn-badge-blue">{course.tag}</span>}
          <span
            className={
              course.status === "active"
                ? "sn-badge sn-badge-green"
                : "sn-badge sn-badge-gray"
            }
          >
            {course.status === "active" ? "Actif" : "Archivé"}
          </span>
        </div>
      </div>

      <div className="text-sm text-gray-500">Progression : {course.progress}%</div>

      <div className="sn-progress">
        <div className="h-full bg-blue-600" style={{ width: `${course.progress}%` }} />
      </div>

      <button
        className="sn-btn-primary w-full sn-press"
        onClick={onOpen}
      >
        Continuer
      </button>
    </div>
  );
}