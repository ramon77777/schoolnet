import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseStatus = "active" | "archived";

type DbCourse = {
  id: string;
  title: string;
  description: string | null;
  status: CourseStatus;
  created_by: string;
  class_id: string | null;
  level_id: number | null;
  join_code: string | null;
  created_at: string;
  updated_at: string;
};

type CourseTeacherRow = {
  course_id: string;
  courses: DbCourse | DbCourse[] | null;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string | null;
};

type LevelRow = {
  id: number;
  name: string;
};

type CourseCardView = {
  id: string;
  title: string;
  description: string;
  classLabel: string;
  levelLabel: string;
  badge?: "Nouveau";
  status: CourseStatus;
  joinCode: string | null;
};

type StatusFilter = "all" | CourseStatus;

function normalizeCourseTeacherRows(rows: CourseTeacherRow[] | null | undefined): DbCourse[] {
  if (!rows) return [];

  return rows
    .map((row) => {
      if (!row.courses) return null;
      return Array.isArray(row.courses) ? row.courses[0] ?? null : row.courses;
    })
    .filter((course): course is DbCourse => Boolean(course));
}

function formatRelativeNewBadge(createdAt: string): "Nouveau" | undefined {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return undefined;

  const diffDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return diffDays <= 7 ? "Nouveau" : undefined;
}

function dedupeCourses(courses: DbCourse[]): DbCourse[] {
  const map = new Map<string, DbCourse>();

  for (const course of courses) {
    map.set(course.id, course);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at).getTime();
    return bTime - aTime;
  });
}

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

function makeJoinCode() {
  return `SN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export default function TeacherCourses() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<DbCourse[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [levelId, setLevelId] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    if (!user || user.isDemo) {
      setCourses([]);
      setClasses([]);
      setLevels([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [createdResult, assignedResult, classesResult, levelsResult] = await Promise.all([
        supabase
          .from("courses")
          .select(
            "id, title, description, status, created_by, class_id, level_id, join_code, created_at, updated_at"
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
              join_code,
              created_at,
              updated_at
            )
          `
          )
          .eq("teacher_id", user.id),

        supabase.from("classes").select("id, name, school_year").order("name", { ascending: true }),

        supabase.from("levels").select("id, name").order("id", { ascending: true }),
      ]);

      if (createdResult.error) throw createdResult.error;
      if (assignedResult.error) throw assignedResult.error;
      if (classesResult.error) throw classesResult.error;
      if (levelsResult.error) throw levelsResult.error;

      const createdCourses = (createdResult.data ?? []) as DbCourse[];
      const assignedCourses = normalizeCourseTeacherRows(
        (assignedResult.data ?? []) as CourseTeacherRow[]
      );

      setCourses(dedupeCourses([...createdCourses, ...assignedCourses]));
      setClasses((classesResult.data ?? []) as ClassRow[]);
      setLevels((levelsResult.data ?? []) as LevelRow[]);
    } catch (err) {
      console.error("[TeacherCourses] loadCourses error:", err);
      setError(safeErrorMessage(err, "Impossible de charger les cours pour le moment."));
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadCourses();
  }, [authLoading, loadCourses]);

  const classById = useMemo(() => {
    return classes.reduce<Record<string, ClassRow>>((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});
  }, [classes]);

  const levelById = useMemo(() => {
    return levels.reduce<Record<number, LevelRow>>((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {});
  }, [levels]);

  const courseCards = useMemo<CourseCardView[]>(() => {
    const q = query.trim().toLowerCase();

    return courses
      .filter((course) => {
        if (statusFilter !== "all" && course.status !== statusFilter) return false;

        if (!q) return true;

        const classLabel = course.class_id ? classById[course.class_id]?.name ?? "" : "";
        const levelLabel = course.level_id ? levelById[course.level_id]?.name ?? "" : "";

        return `${course.title} ${course.description ?? ""} ${classLabel} ${levelLabel}`
          .toLowerCase()
          .includes(q);
      })
      .map((course) => {
        const classRow = course.class_id ? classById[course.class_id] : null;
        const levelRow = course.level_id ? levelById[course.level_id] : null;

        return {
          id: course.id,
          title: course.title,
          description: course.description?.trim() || "Aucune description.",
          classLabel: classRow
            ? `${classRow.name}${classRow.school_year ? ` (${classRow.school_year})` : ""}`
            : "Aucune classe",
          levelLabel: levelRow?.name ?? "Aucun niveau",
          badge: formatRelativeNewBadge(course.created_at),
          status: course.status,
          joinCode: course.join_code,
        };
      });
  }, [courses, query, statusFilter, classById, levelById]);

  const counts = useMemo(() => {
    return {
      active: courses.filter((course) => course.status === "active").length,
      archived: courses.filter((course) => course.status === "archived").length,
      total: courses.length,
    };
  }, [courses]);

  const isInitialLoading = authLoading || loading;

  async function createCourse() {
    if (!user || creating) return;

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();

    if (cleanTitle.length < 2) {
      alert("Le titre du cours doit contenir au moins 2 caractères.");
      return;
    }

    try {
      setCreating(true);

      const { error: insertError } = await supabase.from("courses").insert({
        title: cleanTitle,
        description: cleanDescription || null,
        class_id: classId || null,
        level_id: levelId ? Number(levelId) : null,
        status: "active" satisfies CourseStatus,
        join_code: makeJoinCode(),
        created_by: user.id,
      });

      if (insertError) throw insertError;

      setTitle("");
      setDescription("");
      setClassId("");
      setLevelId("");

      await loadCourses();
      alert("✅ Cours créé avec succès.");
    } catch (err) {
      console.error("[TeacherCourses] createCourse error:", err);
      alert(safeErrorMessage(err, "Impossible de créer le cours."));
    } finally {
      setCreating(false);
    }
  }

  async function updateCourseStatus(courseId: string, nextStatus: CourseStatus) {
    if (updatingId) return;

    try {
      setUpdatingId(courseId);

      const { error: updateError } = await supabase
        .from("courses")
        .update({ status: nextStatus })
        .eq("id", courseId);

      if (updateError) throw updateError;

      await loadCourses();
    } catch (err) {
      console.error("[TeacherCourses] updateCourseStatus error:", err);
      alert(safeErrorMessage(err, "Impossible de modifier le statut du cours."));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Mes cours</div>
          <div className="text-sm text-gray-500">
            Créez, publiez et organisez vos cours par classe et niveau.
          </div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => void loadCourses()}>
          ↻ Rafraîchir
        </button>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les cours réels Supabase ne sont pas chargés.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="sn-card p-5 space-y-4">
          <div>
            <div className="font-semibold text-gray-900">Nouveau cours</div>
            <div className="text-sm text-gray-500">
              Le cours sera créé en statut actif et rattaché à votre compte enseignant.
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700">Titre</label>
            <input
              className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Exemple : Mathématiques 6e A"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={creating}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-700">Description</label>
            <textarea
              className="w-full min-h-[100px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="Objectifs, programme, consignes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={creating}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700">Classe</label>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                disabled={creating}
              >
                <option value="">Aucune classe</option>
                {classes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.school_year ? ` (${row.school_year})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700">Niveau</label>
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                disabled={creating}
              >
                <option value="">Aucun niveau</option>
                {levels.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="sn-btn-primary sn-press w-full"
            onClick={() => void createCourse()}
            disabled={creating || !title.trim()}
          >
            {creating ? "Création..." : "Créer le cours"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="sn-card p-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="Actifs" value={counts.active} />
              <Stat label="Archivés" value={counts.archived} />
              <Stat label="Total" value={counts.total} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-full sm:w-80 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Rechercher un cours..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <button
                className={`sn-btn-ghost sn-press ${
                  statusFilter === "all" ? "ring-2 ring-blue-200" : ""
                }`}
                onClick={() => setStatusFilter("all")}
              >
                Tous
              </button>

              <button
                className={`sn-btn-ghost sn-press ${
                  statusFilter === "active" ? "ring-2 ring-blue-200" : ""
                }`}
                onClick={() => setStatusFilter("active")}
              >
                Actifs
              </button>

              <button
                className={`sn-btn-ghost sn-press ${
                  statusFilter === "archived" ? "ring-2 ring-blue-200" : ""
                }`}
                onClick={() => setStatusFilter("archived")}
              >
                Archivés
              </button>
            </div>
          </div>

          {isInitialLoading && (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="sn-card p-5 space-y-3 animate-pulse">
                  <div className="h-5 w-2/3 rounded bg-gray-200" />
                  <div className="h-4 w-1/2 rounded bg-gray-100" />
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
              <div className="text-lg font-semibold text-gray-900">Aucun cours trouvé</div>
              <div className="text-sm text-gray-500">
                Créez votre premier cours ou changez le filtre.
              </div>
            </div>
          )}

          {!isInitialLoading && !error && courseCards.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {courseCards.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  updating={updatingId === course.id}
                  onOpen={() => navigate(`/app/teacher/courses/${course.id}`)}
                  onArchive={() => void updateCourseStatus(course.id, "archived")}
                  onActivate={() => void updateCourseStatus(course.id, "active")}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}

function CourseCard({
  course,
  updating,
  onOpen,
  onArchive,
  onActivate,
}: {
  course: CourseCardView;
  updating: boolean;
  onOpen: () => void;
  onArchive: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="sn-card sn-card-hover p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate">{course.title}</div>
          <div className="text-sm text-gray-500 line-clamp-2">{course.description}</div>
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

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
        <div>Classe : {course.classLabel}</div>
        <div>Niveau : {course.levelLabel}</div>
        <div>Code : {course.joinCode ?? "Non défini"}</div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button className="sn-btn-primary flex-1 sn-press" onClick={onOpen}>
          Ouvrir
        </button>

        {course.status === "active" ? (
          <button className="sn-btn-ghost sn-press" onClick={onArchive} disabled={updating}>
            {updating ? "..." : "Archiver"}
          </button>
        ) : (
          <button className="sn-btn-ghost sn-press" onClick={onActivate} disabled={updating}>
            {updating ? "..." : "Réactiver"}
          </button>
        )}
      </div>
    </div>
  );
}