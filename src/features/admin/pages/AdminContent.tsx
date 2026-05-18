import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseStatus = "draft" | "active" | "archived";

type SubjectRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string;
};

type TeacherRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type SchoolYearRow = {
  id: string;
  name: string;
  is_current: boolean;
};

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  status: CourseStatus;
  subject_id: string | null;
  class_id: string | null;
  teacher_id: string | null;
  school_year_id: string | null;
  subjects: SubjectRow | SubjectRow[] | null;
  classes: ClassRow | ClassRow[] | null;
  profiles: TeacherRow | TeacherRow[] | null;
  school_years: SchoolYearRow | SchoolYearRow[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function safeErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null) {
    const maybe = err as { message?: string; details?: string; error_description?: string };
    return maybe.message || maybe.details || maybe.error_description || fallback;
  }
  return fallback;
}

export default function AdminContent() {
  const { user, loading: authLoading } = useAuth();

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [schoolYears, setSchoolYears] = useState<SchoolYearRow[]>([]);

  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectDescription, setSubjectDescription] = useState("");

  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courseSubjectId, setCourseSubjectId] = useState("");
  const [courseClassId, setCourseClassId] = useState("");
  const [courseTeacherId, setCourseTeacherId] = useState("");
  const [courseSchoolYearId, setCourseSchoolYearId] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingSubject, setSavingSubject] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSchoolYear = useMemo(
    () => schoolYears.find((year) => year.is_current) ?? schoolYears[0] ?? null,
    [schoolYears]
  );

  const loadData = useCallback(async () => {
    if (!user || user.isDemo) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [subjectsResult, coursesResult, classesResult, teachersResult, yearsResult] =
        await Promise.all([
          supabase.from("subjects").select("id, name, code, description").order("name"),

          supabase
            .from("courses")
            .select(
              `
              id,
              title,
              description,
              status,
              subject_id,
              class_id,
              teacher_id,
              school_year_id,
              subjects (
                id,
                name,
                code,
                description
              ),
              classes (
                id,
                name,
                school_year
              ),
              profiles (
                id,
                full_name,
                email
              ),
              school_years (
                id,
                name,
                is_current
              )
            `
            )
            .order("created_at", { ascending: false }),

          supabase.from("classes").select("id, name, school_year").order("name"),

          supabase
            .from("profiles")
            .select("id, full_name, email")
            .eq("role", "teacher")
            .order("full_name"),

          supabase.from("school_years").select("id, name, is_current").order("name"),
        ]);

      if (subjectsResult.error) throw subjectsResult.error;
      if (coursesResult.error) throw coursesResult.error;
      if (classesResult.error) throw classesResult.error;
      if (teachersResult.error) throw teachersResult.error;
      if (yearsResult.error) throw yearsResult.error;

      setSubjects((subjectsResult.data ?? []) as SubjectRow[]);
      setCourses((coursesResult.data ?? []) as CourseRow[]);
      setClasses((classesResult.data ?? []) as ClassRow[]);
      setTeachers((teachersResult.data ?? []) as TeacherRow[]);
      setSchoolYears((yearsResult.data ?? []) as SchoolYearRow[]);

      const firstCurrentYear = ((yearsResult.data ?? []) as SchoolYearRow[]).find((y) => y.is_current);
      if (firstCurrentYear) setCourseSchoolYearId(firstCurrentYear.id);
    } catch (err) {
      console.error("[AdminContent] loadData error:", err);
      setError(safeErrorMessage(err, "Impossible de charger le contenu."));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading, loadData]);

  async function createSubject() {
    if (!subjectName.trim()) {
      alert("Le nom de la matière est obligatoire.");
      return;
    }

    try {
      setSavingSubject(true);

      const { error: insertError } = await supabase.from("subjects").insert({
        name: subjectName.trim(),
        code: subjectCode.trim() || null,
        description: subjectDescription.trim() || null,
      });

      if (insertError) throw insertError;

      setSubjectName("");
      setSubjectCode("");
      setSubjectDescription("");

      await loadData();
    } catch (err) {
      console.error("[AdminContent] createSubject error:", err);
      alert(safeErrorMessage(err, "Impossible de créer la matière."));
    } finally {
      setSavingSubject(false);
    }
  }

  async function createCourse() {
    if (!courseTitle.trim()) {
      alert("Le titre du cours est obligatoire.");
      return;
    }

    if (!courseSubjectId || !courseClassId || !courseTeacherId) {
      alert("Sélectionne une matière, une classe et un enseignant.");
      return;
    }

    try {
      setSavingCourse(true);

      const { error: insertError } = await supabase.from("courses").insert({
        title: courseTitle.trim(),
        description: courseDescription.trim() || null,
        status: "active" satisfies CourseStatus,
        subject_id: courseSubjectId,
        class_id: courseClassId,
        teacher_id: courseTeacherId,
        school_year_id: courseSchoolYearId || currentSchoolYear?.id || null,
      });

      if (insertError) throw insertError;

      setCourseTitle("");
      setCourseDescription("");
      setCourseSubjectId("");
      setCourseClassId("");
      setCourseTeacherId("");
      setCourseSchoolYearId(currentSchoolYear?.id ?? "");

      await loadData();
    } catch (err) {
      console.error("[AdminContent] createCourse error:", err);
      alert(safeErrorMessage(err, "Impossible de créer le cours."));
    } finally {
      setSavingCourse(false);
    }
  }

  async function archiveCourse(course: CourseRow) {
    const ok = window.confirm(`Archiver le cours "${course.title}" ?`);
    if (!ok) return;

    try {
      const { error: updateError } = await supabase
        .from("courses")
        .update({ status: "archived" satisfies CourseStatus })
        .eq("id", course.id);

      if (updateError) throw updateError;

      await loadData();
    } catch (err) {
      console.error("[AdminContent] archiveCourse error:", err);
      alert(safeErrorMessage(err, "Impossible d’archiver le cours."));
    }
  }

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Contenu</div>
        <div className="text-sm text-gray-500">
          Gérez les matières, les cours, les classes et les affectations enseignants.
        </div>
      </div>

      {isLoading && (
        <div className="sn-card p-5 text-sm text-gray-500">Chargement du contenu…</div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <div className="sn-card p-5 space-y-4">
              <div>
                <div className="font-semibold">Nouvelle matière</div>
                <div className="text-xs text-gray-500">Exemple : Mathématiques, Français…</div>
              </div>

              <input
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Nom"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />

              <input
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Code, ex : MATH"
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
              />

              <textarea
                className="w-full min-h-[90px] rounded-2xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Description"
                value={subjectDescription}
                onChange={(e) => setSubjectDescription(e.target.value)}
              />

              <button
                className="sn-btn-primary sn-press w-full"
                onClick={() => void createSubject()}
                disabled={savingSubject}
              >
                {savingSubject ? "Création..." : "Créer la matière"}
              </button>
            </div>

            <div className="sn-card p-5 space-y-3">
              <div className="font-semibold">Matières</div>

              {subjects.length === 0 ? (
                <div className="text-sm text-gray-500">Aucune matière.</div>
              ) : (
                <div className="space-y-2">
                  {subjects.map((subject) => (
                    <div key={subject.id} className="rounded-2xl border border-gray-100 p-3">
                      <div className="font-medium text-gray-900">{subject.name}</div>
                      <div className="text-xs text-gray-500">{subject.code || "Sans code"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="sn-card p-5 space-y-4">
              <div>
                <div className="font-semibold">Nouveau cours</div>
                <div className="text-xs text-gray-500">
                  Affectez un cours à une matière, une classe et un enseignant.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Titre du cours"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                />

                <select
                  className="rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  value={courseSubjectId}
                  onChange={(e) => setCourseSubjectId(e.target.value)}
                >
                  <option value="">Matière</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>

                <select
                  className="rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  value={courseClassId}
                  onChange={(e) => setCourseClassId(e.target.value)}
                >
                  <option value="">Classe</option>
                  {classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.name} ({klass.school_year})
                    </option>
                  ))}
                </select>

                <select
                  className="rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  value={courseTeacherId}
                  onChange={(e) => setCourseTeacherId(e.target.value)}
                >
                  <option value="">Enseignant</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name || teacher.email || "Enseignant"}
                    </option>
                  ))}
                </select>

                <select
                  className="rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 sm:col-span-2"
                  value={courseSchoolYearId}
                  onChange={(e) => setCourseSchoolYearId(e.target.value)}
                >
                  <option value="">Année scolaire</option>
                  {schoolYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                      {year.is_current ? " — active" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                className="w-full min-h-[90px] rounded-2xl border border-gray-200 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Description du cours"
                value={courseDescription}
                onChange={(e) => setCourseDescription(e.target.value)}
              />

              <button
                className="sn-btn-primary sn-press w-full"
                onClick={() => void createCourse()}
                disabled={savingCourse}
              >
                {savingCourse ? "Création..." : "Créer le cours"}
              </button>
            </div>

            <div className="sn-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Cours</div>
                <span className="sn-badge sn-badge-gray">{courses.length}</span>
              </div>

              {courses.length === 0 ? (
                <div className="text-sm text-gray-500">Aucun cours enregistré.</div>
              ) : (
                <div className="space-y-3">
                  {courses.map((course) => {
                    const subject = one(course.subjects);
                    const klass = one(course.classes);
                    const teacher = one(course.profiles);
                    const year = one(course.school_years);

                    return (
                      <div
                        key={course.id}
                        className="rounded-2xl border border-gray-100 bg-white p-4 flex flex-wrap items-start justify-between gap-3"
                      >
                        <div>
                          <div className="font-semibold text-gray-900">{course.title}</div>
                          <div className="mt-1 text-sm text-gray-500">
                            {subject?.name ?? "Matière"} • {klass?.name ?? "Classe"} •{" "}
                            {teacher?.full_name || teacher?.email || "Enseignant"}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {year?.name ?? "Année scolaire non définie"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={
                              course.status === "active"
                                ? "sn-badge sn-badge-green"
                                : course.status === "archived"
                                ? "sn-badge sn-badge-red"
                                : "sn-badge sn-badge-gray"
                            }
                          >
                            {course.status === "active"
                              ? "Actif"
                              : course.status === "archived"
                              ? "Archivé"
                              : "Brouillon"}
                          </span>

                          {course.status !== "archived" && (
                            <button
                              className="sn-btn-ghost sn-press"
                              onClick={() => void archiveCourse(course)}
                            >
                              Archiver
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}