import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type DbCourse = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  created_by: string;
  class_id: string | null;
  level_id: number | null;
  created_at: string;
  updated_at: string;
};

type CourseCardView = {
  id: string;
  title: string;
  meta: string;
  badge?: "Nouveau";
  status: "active" | "archived";
};

type CourseTeacherRow = {
  course_id: string;
  courses: DbCourse | DbCourse[] | null;
};

function formatRelativeNewBadge(createdAt: string): "Nouveau" | undefined {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return undefined;

  const now = Date.now();
  const diffDays = (now - created) / (1000 * 60 * 60 * 24);

  return diffDays <= 7 ? "Nouveau" : undefined;
}

function normalizeCourseTeacherRows(rows: CourseTeacherRow[] | null | undefined): DbCourse[] {
  if (!rows) return [];

  return rows
    .map((row) => {
      if (!row.courses) return null;
      return Array.isArray(row.courses) ? row.courses[0] ?? null : row.courses;
    })
    .filter((course): course is DbCourse => Boolean(course));
}

function dedupeCourses(courses: DbCourse[]): DbCourse[] {
  const map = new Map<string, DbCourse>();

  for (const course of courses) {
    if (!map.has(course.id)) {
      map.set(course.id, course);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

function buildMeta(course: DbCourse): string {
  const parts: string[] = [];

  parts.push(course.status === "active" ? "Actif" : "Archivé");

  if (course.description?.trim()) {
    parts.push(course.description.trim());
  }

  return parts.join(" • ");
}

export default function TeacherCourses() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<DbCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    if (!user || user.isDemo) {
      setCourses([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [createdResult, assignedResult] = await Promise.all([
        supabase
          .from("courses")
          .select(
            "id, title, description, status, created_by, class_id, level_id, created_at, updated_at"
          )
          .eq("created_by", user.id)
          .order("updated_at", { ascending: false }),

        supabase
          .from("course_teachers")
          .select(
            `
            course_id,
            courses (
              id,
              title,
              description,
              status,
              created_by,
              class_id,
              level_id,
              created_at,
              updated_at
            )
          `
          )
          .eq("teacher_id", user.id),
      ]);

      if (createdResult.error) {
        throw createdResult.error;
      }

      if (assignedResult.error) {
        throw assignedResult.error;
      }

      const createdCourses = (createdResult.data ?? []) as DbCourse[];
      const assignedCourses = normalizeCourseTeacherRows(
        (assignedResult.data ?? []) as CourseTeacherRow[]
      );

      const merged = dedupeCourses([...createdCourses, ...assignedCourses]);

      setCourses(merged);
    } catch (err) {
      console.error("[TeacherCourses] loadCourses error:", err);
      setError("Impossible de charger les cours pour le moment.");
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadCourses();
  }, [authLoading, loadCourses]);

  const courseCards = useMemo<CourseCardView[]>(
    () =>
      courses.map((course) => ({
        id: course.id,
        title: course.title,
        meta: buildMeta(course),
        badge: formatRelativeNewBadge(course.created_at),
        status: course.status,
      })),
    [courses]
  );

  const isInitialLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Mes cours</div>
          <div className="text-sm text-gray-500">
            Retrouvez ici les cours que vous avez créés ou auxquels vous êtes affecté.
          </div>
        </div>

        <button
          className="sn-btn-primary sn-press"
          onClick={() => alert("Création de cours (à venir)")}
        >
          + Nouveau cours
        </button>
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
              <div className="pt-2 flex gap-2">
                <div className="h-10 flex-1 rounded bg-gray-200" />
                <div className="h-10 w-12 rounded bg-gray-100" />
              </div>
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
            Vous n’avez pas encore de cours créés ou assignés. Créez votre premier cours pour
            commencer.
          </div>
          <div>
            <button
              className="sn-btn-primary sn-press"
              onClick={() => alert("Création de cours (à venir)")}
            >
              + Nouveau cours
            </button>
          </div>
        </div>
      )}

      {!isInitialLoading && !error && courseCards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courseCards.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onOpen={() => navigate(`/app/teacher/courses/${course.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({
  course,
  onOpen,
}: {
  course: CourseCardView;
  onOpen: () => void;
}) {
  return (
    <div className="sn-card sn-card-hover p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate">{course.title}</div>
          <div className="text-sm text-gray-500 line-clamp-2">{course.meta}</div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {course.badge && <span className="sn-badge sn-badge-blue">{course.badge}</span>}
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

      <div className="flex gap-2 pt-2">
        <button className="sn-btn-primary flex-1 sn-press" onClick={onOpen}>
          Ouvrir
        </button>
        <button
          className="sn-btn-ghost sn-press"
          onClick={() => alert("Actions du cours (à venir)")}
        >
          …
        </button>
      </div>
    </div>
  );
}