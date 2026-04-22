import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

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
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Mes cours</div>
        <div className="text-sm text-gray-500">
          Retrouvez ici les cours auxquels vous êtes inscrit et votre progression.
        </div>
      </div>

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
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: StudentCourseCardView }) {
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

      <button className="sn-btn-primary w-full sn-press">Continuer</button>
    </div>
  );
}