import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";

import {
  getAttendanceErrorMessage,
  getAttendanceStudentsForClass,
  getTeacherAttendanceClasses,
  getTeacherAttendanceCourses,
} from "@/features/attendance/lib/attendanceApi";

import type {
  AttendanceCourse,
  AttendanceStudent,
  TeacherAttendanceClass,
} from "@/features/attendance/types/attendance.types";

export default function TeacherAttendance() {
  const { user, loading: authLoading } = useAuth();

  const [classes, setClasses] = useState<TeacherAttendanceClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");

  const [students, setStudents] = useState<AttendanceStudent[]>([]);
  const [courses, setCourses] = useState<AttendanceCourse[]>([]);

  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [classesError, setClassesError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const activeCourses = useMemo(
    () => courses.filter((course) => course.status === "active"),
    [courses]
  );

  const loadClasses = useCallback(async () => {
    if (!user || user.isDemo) {
      setClasses([]);
      setSelectedClassId("");
      setStudents([]);
      setCourses([]);
      setClassesError(null);
      setLoadingClasses(false);
      return;
    }

    try {
      setLoadingClasses(true);
      setClassesError(null);

      const result = await getTeacherAttendanceClasses(user.id);

      setClasses(result);

      setSelectedClassId((current) => {
        if (current && result.some((item) => item.id === current)) {
          return current;
        }

        return result[0]?.id ?? "";
      });
    } catch (error) {
      console.error("[TeacherAttendance] loadClasses error:", error);

      setClasses([]);
      setSelectedClassId("");

      setClassesError(
        getAttendanceErrorMessage(
          error,
          "Impossible de charger vos classes."
        )
      );
    } finally {
      setLoadingClasses(false);
    }
  }, [user]);

  const loadClassDetails = useCallback(async () => {
    if (!user || user.isDemo || !selectedClassId) {
      setStudents([]);
      setCourses([]);
      setDetailsError(null);
      return;
    }

    try {
      setLoadingDetails(true);
      setDetailsError(null);

      const [studentsResult, coursesResult] = await Promise.all([
        getAttendanceStudentsForClass(selectedClassId),
        getTeacherAttendanceCourses(user.id, selectedClassId),
      ]);

      setStudents(studentsResult);
      setCourses(coursesResult);
    } catch (error) {
      console.error(
        "[TeacherAttendance] loadClassDetails error:",
        error
      );

      setStudents([]);
      setCourses([]);

      setDetailsError(
        getAttendanceErrorMessage(
          error,
          "Impossible de charger les informations de cette classe."
        )
      );
    } finally {
      setLoadingDetails(false);
    }
  }, [selectedClassId, user]);

  useEffect(() => {
    if (authLoading) return;

    void loadClasses();
  }, [authLoading, loadClasses]);

  useEffect(() => {
    if (authLoading || loadingClasses) return;

    void loadClassDetails();
  }, [
    authLoading,
    loadingClasses,
    loadClassDetails,
  ]);

  const isLoading = authLoading || loadingClasses;

  return (
    <div className="space-y-6">
      {/* =====================================================
          EN-TÊTE
      ====================================================== */}
      <section
        className="
          overflow-hidden rounded-3xl
          border border-slate-200
          bg-gradient-to-br from-white via-white to-blue-50
          shadow-sm
        "
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              className="
                flex h-14 w-14 shrink-0
                items-center justify-center
                rounded-2xl bg-blue-600
                text-2xl shadow-lg shadow-blue-100
              "
            >
              ✅
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="
                  text-xs font-black uppercase
                  tracking-[0.18em] text-blue-600
                "
              >
                Présences & absences
              </div>

              <h1
                className="
                  mt-2 text-2xl font-black
                  tracking-tight text-slate-950
                  sm:text-3xl
                "
              >
                Gestion des présences
              </h1>

              <p
                className="
                  mt-3 max-w-3xl
                  text-sm leading-7 text-slate-600
                  sm:text-base
                "
              >
                Consultez vos classes et préparez vos appels
                à partir des données réelles de SchoolNet.
              </p>
            </div>

            <button
              type="button"
              className="sn-btn-ghost sn-press"
              onClick={() => void loadClasses()}
              disabled={isLoading}
            >
              ↻ Rafraîchir
            </button>
          </div>
        </div>
      </section>

      {/* =====================================================
          MODE DÉMO
      ====================================================== */}
      {user?.isDemo && (
        <div
          className="
            sn-card border border-amber-200
            bg-amber-50 p-4
            text-sm text-amber-700
          "
        >
          Mode démo actif : les données réelles Supabase
          ne sont pas chargées.
        </div>
      )}

      {/* =====================================================
          ERREUR CLASSES
      ====================================================== */}
      {!isLoading && classesError && (
        <div
          className="
            sn-card space-y-3
            border border-red-200
            bg-red-50 p-5
            text-red-700
          "
        >
          <div className="font-semibold">
            Impossible de charger vos classes
          </div>

          <div className="text-sm">
            {classesError}
          </div>

          <button
            type="button"
            className="sn-btn-primary sn-press w-fit"
            onClick={() => void loadClasses()}
          >
            Réessayer
          </button>
        </div>
      )}

      {/* =====================================================
          CHARGEMENT
      ====================================================== */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="sn-card animate-pulse p-5"
            >
              <div className="h-5 w-1/2 rounded bg-slate-200" />
              <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
              <div className="mt-6 h-10 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {/* =====================================================
          AUCUNE CLASSE
      ====================================================== */}
      {!isLoading &&
        !classesError &&
        !user?.isDemo &&
        classes.length === 0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-lg font-black text-slate-900">
              Aucune classe affectée
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Votre compte enseignant n'est actuellement
              rattaché à aucune classe.
            </p>
          </div>
        )}

      {/* =====================================================
          DONNÉES RÉELLES
      ====================================================== */}
      {!isLoading &&
        !classesError &&
        classes.length > 0 && (
          <>
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  Mes classes
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Seules les classes réellement affectées
                  à votre compte enseignant sont affichées.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {classes.map((classItem) => {
                  const selected =
                    classItem.id === selectedClassId;

                  return (
                    <button
                      key={classItem.id}
                      type="button"
                      onClick={() =>
                        setSelectedClassId(classItem.id)
                      }
                      className={`
                        rounded-2xl border p-5
                        text-left transition sn-press
                        ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100"
                            : "border-slate-200 bg-white text-slate-900 hover:border-blue-200 hover:shadow-sm"
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black">
                            {classItem.name}
                          </div>

                          <div
                            className={`mt-1 text-sm ${
                              selected
                                ? "text-blue-100"
                                : "text-slate-500"
                            }`}
                          >
                            {classItem.schoolYear ??
                              "Année scolaire non renseignée"}
                          </div>
                        </div>

                        <span
                          className={`
                            rounded-full px-3 py-1
                            text-xs font-bold
                            ${
                              selected
                                ? "bg-white/15 text-white"
                                : "bg-slate-100 text-slate-600"
                            }
                          `}
                        >
                          {classItem.assignmentRole === "main"
                            ? "Principal"
                            : "Assistant"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* =================================================
                CLASSE SÉLECTIONNÉE
            ================================================== */}
            {selectedClass && (
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div
                      className="
                        text-xs font-black uppercase
                        tracking-[0.16em] text-blue-600
                      "
                    >
                      Classe sélectionnée
                    </div>

                    <h2 className="mt-1 text-xl font-black text-slate-950">
                      {selectedClass.name}
                    </h2>
                  </div>

                  <button
                    type="button"
                    className="sn-btn-ghost sn-press"
                    onClick={() => void loadClassDetails()}
                    disabled={loadingDetails}
                  >
                    ↻ Actualiser la classe
                  </button>
                </div>

                {loadingDetails && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LoadingCard />
                    <LoadingCard />
                  </div>
                )}

                {!loadingDetails && detailsError && (
                  <div
                    className="
                      sn-card space-y-3
                      border border-red-200
                      bg-red-50 p-5
                      text-red-700
                    "
                  >
                    <div className="font-semibold">
                      Erreur de chargement
                    </div>

                    <div className="text-sm">
                      {detailsError}
                    </div>

                    <button
                      type="button"
                      className="sn-btn-primary sn-press w-fit"
                      onClick={() =>
                        void loadClassDetails()
                      }
                    >
                      Réessayer
                    </button>
                  </div>
                )}

                {!loadingDetails && !detailsError && (
                  <>
                    {/* KPI */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <StatCard
                        label="Apprenants visibles"
                        value={students.length}
                        icon="🎓"
                      />

                      <StatCard
                        label="Cours actifs"
                        value={activeCourses.length}
                        icon="📚"
                      />

                      <StatCard
                        label="Tous les cours"
                        value={courses.length}
                        icon="📘"
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      {/* ÉLÈVES */}
                      <div className="sn-card p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-black text-slate-900">
                              Apprenants de la classe
                            </div>

                            <div className="mt-1 text-sm text-slate-500">
                              Profils visibles grâce aux règles RLS.
                            </div>
                          </div>

                          <span className="sn-badge sn-badge-blue">
                            {students.length}
                          </span>
                        </div>

                        {students.length === 0 ? (
                          <div
                            className="
                              mt-5 rounded-2xl
                              border border-dashed border-slate-200
                              p-6 text-center
                              text-sm text-slate-500
                            "
                          >
                            Aucun apprenant visible dans cette classe.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-2">
                            {students.map((student) => (
                              <div
                                key={student.id}
                                className="
                                  flex items-center gap-3
                                  rounded-2xl
                                  border border-slate-100
                                  bg-slate-50 p-3
                                "
                              >
                                <StudentAvatar
                                  student={student}
                                />

                                <div className="min-w-0 flex-1">
                                  <div
                                    className="
                                      truncate font-semibold
                                      text-slate-900
                                    "
                                  >
                                    {student.fullName}
                                  </div>

                                  <div className="text-xs text-slate-500">
                                    Apprenant
                                  </div>
                                </div>

                                <span
                                  className="
                                    rounded-full
                                    bg-emerald-50
                                    px-2.5 py-1
                                    text-xs font-bold
                                    text-emerald-700
                                  "
                                >
                                  Autorisé
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* COURS */}
                      <div className="sn-card p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-black text-slate-900">
                              Cours associés
                            </div>

                            <div className="mt-1 text-sm text-slate-500">
                              Cours créés ou affectés à l'enseignant.
                            </div>
                          </div>

                          <span className="sn-badge sn-badge-blue">
                            {courses.length}
                          </span>
                        </div>

                        {courses.length === 0 ? (
                          <div
                            className="
                              mt-5 rounded-2xl
                              border border-dashed border-slate-200
                              p-6 text-center
                              text-sm text-slate-500
                            "
                          >
                            Aucun cours associé à cette classe.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-2">
                            {courses.map((course) => (
                              <div
                                key={course.id}
                                className="
                                  flex items-center justify-between
                                  gap-3 rounded-2xl
                                  border border-slate-100
                                  bg-slate-50 p-4
                                "
                              >
                                <div className="min-w-0">
                                  <div
                                    className="
                                      truncate font-semibold
                                      text-slate-900
                                    "
                                  >
                                    {course.title}
                                  </div>

                                  <div className="mt-1 text-xs text-slate-500">
                                    {course.status === "active"
                                      ? "Cours actif"
                                      : "Cours archivé"}
                                  </div>
                                </div>

                                <span
                                  className={
                                    course.status === "active"
                                      ? "sn-badge sn-badge-green"
                                      : "sn-badge sn-badge-gray"
                                  }
                                >
                                  {course.status === "active"
                                    ? "Actif"
                                    : "Archivé"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="sn-card p-4">
      <div className="flex items-center gap-3">
        <div
          className="
            flex h-10 w-10 items-center justify-center
            rounded-xl bg-blue-50 text-lg
          "
        >
          {icon}
        </div>

        <div>
          <div className="text-xs text-slate-500">
            {label}
          </div>

          <div className="text-xl font-black text-slate-950">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="sn-card animate-pulse p-5">
      <div className="h-5 w-1/3 rounded bg-slate-200" />
      <div className="mt-4 space-y-3">
        <div className="h-12 rounded-xl bg-slate-100" />
        <div className="h-12 rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

function StudentAvatar({
  student,
}: {
  student: AttendanceStudent;
}) {
  if (student.avatarUrl) {
    return (
      <img
        src={student.avatarUrl}
        alt=""
        className="
          h-10 w-10 shrink-0
          rounded-full object-cover
          border border-slate-200
        "
      />
    );
  }

  const initial =
    student.fullName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="
        flex h-10 w-10 shrink-0
        items-center justify-center
        rounded-full bg-blue-100
        text-sm font-black text-blue-700
      "
    >
      {initial}
    </div>
  );
}