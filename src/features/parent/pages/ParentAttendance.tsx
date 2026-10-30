import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

import { getAttendanceErrorMessage } from "@/features/attendance/lib/attendanceApi";

type AttendanceStatus =
  | "present"
  | "absent"
  | "late";

type JustificationStatus =
  | "pending"
  | "approved"
  | "rejected";

type ParentProfileRow = {
  id: string;
  child_ids: string[] | null;
};

type ChildProfileRow = {
  id: string;
  full_name: string | null;
};

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string | null;
};

type CourseRow = {
  id: string;
  title: string;
};

type AttendanceRecordRow = {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  arrival_time: string | null;
  minutes_late: number;
  comment: string | null;
  marked_at: string;
};

type AttendanceSessionRow = {
  id: string;
  class_id: string;
  course_id: string | null;
  teacher_id: string;
  session_date: string;
  starts_at: string | null;
  ends_at: string | null;
  status:
    | "draft"
    | "open"
    | "closed"
    | "cancelled";
  notes: string | null;
  closed_at: string | null;
};

type AttendanceJustificationRow = {
  id: string;
  attendance_record_id: string;
  submitted_by: string;
  reason: string;
  status: JustificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

type ChildView = {
  id: string;
  name: string;
  classLabel: string;
};

type HistoryItem = {
  recordId: string;

  studentId: string;

  status: AttendanceStatus;
  arrivalTime: string | null;
  minutesLate: number;
  comment: string | null;
  markedAt: string;

  sessionId: string;
  sessionDate: string;
  startsAt: string | null;
  endsAt: string | null;

  classId: string;
  className: string;

  courseId: string | null;
  courseTitle: string;

  justification:
    | AttendanceJustificationRow
    | null;
};

type HistoryFilter =
  | "all"
  | AttendanceStatus;

function uniqueStrings(
  values: Array<string | null | undefined>,
) {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" &&
          value.trim().length > 0,
      ),
    ),
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(
  value: string | null | undefined,
) {
  if (!value) {
    return "—";
  }

  return value.slice(0, 5);
}

function attendanceLabel(
  status: AttendanceStatus,
) {
  if (status === "present") {
    return "Présent";
  }

  if (status === "absent") {
    return "Absent";
  }

  return "Retard";
}

function justificationLabel(
  status: JustificationStatus,
) {
  if (status === "approved") {
    return "Accepté";
  }

  if (status === "rejected") {
    return "Rejeté";
  }

  return "En attente";
}

function attendanceBadgeClass(
  status: AttendanceStatus,
) {
  if (status === "present") {
    return "sn-badge sn-badge-green";
  }

  if (status === "absent") {
    return "sn-badge bg-red-50 text-red-700";
  }

  return "sn-badge bg-amber-50 text-amber-700";
}

function justificationBadgeClass(
  status: JustificationStatus,
) {
  if (status === "approved") {
    return "sn-badge sn-badge-green";
  }

  if (status === "rejected") {
    return "sn-badge bg-red-50 text-red-700";
  }

  return "sn-badge bg-amber-50 text-amber-700";
}

export default function ParentAttendance() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [children, setChildren] = useState<
    ChildView[]
  >([]);

  const [
    selectedChildId,
    setSelectedChildId,
  ] = useState("");

  const [history, setHistory] = useState<
    HistoryItem[]
  >([]);

  const [
    historyFilter,
    setHistoryFilter,
  ] = useState<HistoryFilter>("all");

  const [
    reasonByRecordId,
    setReasonByRecordId,
  ] = useState<Record<string, string>>({});

  const [
    submittingRecordId,
    setSubmittingRecordId,
  ] = useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const loadAttendance = useCallback(
    async () => {
      if (!user || user.isDemo) {
        setChildren([]);
        setHistory([]);
        setSelectedChildId("");
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        /*
         * ==================================================
         * 1. PROFIL DU PARENT
         * ==================================================
         */

        const {
          data: parentData,
          error: parentError,
        } = await supabase
          .from("profiles")
          .select("id, child_ids")
          .eq("id", user.id)
          .eq("role", "parent")
          .maybeSingle();

        if (parentError) {
          throw parentError;
        }

        const parent =
          parentData as ParentProfileRow | null;

        if (!parent) {
          setChildren([]);
          setHistory([]);
          setSelectedChildId("");

          setError(
            "Le profil Parent / Tuteur associé à ce compte est introuvable.",
          );

          return;
        }

        const childIds = uniqueStrings(
          parent.child_ids ?? [],
        );

        if (childIds.length === 0) {
          setChildren([]);
          setHistory([]);
          setSelectedChildId("");
          return;
        }

        /*
         * ==================================================
         * 2. PROFILS DES ENFANTS
         * ==================================================
         */

        const {
          data: childProfilesData,
          error: childProfilesError,
        } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", childIds)
          .eq("role", "student")
          .order("full_name");

        if (childProfilesError) {
          throw childProfilesError;
        }

        const childProfiles =
          (childProfilesData ??
            []) as ChildProfileRow[];

        /*
         * ==================================================
         * 3. CLASSES DES ENFANTS
         * ==================================================
         */

        const {
          data: classStudentsData,
          error: classStudentsError,
        } = await supabase
          .from("class_students")
          .select("student_id, class_id")
          .in("student_id", childIds);

        if (classStudentsError) {
          throw classStudentsError;
        }

        const classStudents =
          (classStudentsData ??
            []) as ClassStudentRow[];

        const childClassIds = uniqueStrings(
          classStudents.map(
            (row) => row.class_id,
          ),
        );

        let childClasses: ClassRow[] = [];

        if (childClassIds.length > 0) {
          const {
            data: classesData,
            error: classesError,
          } = await supabase
            .from("classes")
            .select("id, name")
            .in("id", childClassIds);

          if (classesError) {
            throw classesError;
          }

          childClasses =
            (classesData ?? []) as ClassRow[];
        }

        const classById = new Map(
          childClasses.map((row) => [
            row.id,
            row,
          ]),
        );

        const classIdByStudentId =
          new Map<string, string>();

        for (const row of classStudents) {
          if (
            !classIdByStudentId.has(
              row.student_id,
            )
          ) {
            classIdByStudentId.set(
              row.student_id,
              row.class_id,
            );
          }
        }

        const finalChildren: ChildView[] =
          childProfiles.map((profile) => {
            const classId =
              classIdByStudentId.get(
                profile.id,
              );

            const classRow = classId
              ? classById.get(classId)
              : undefined;

            return {
              id: profile.id,

              name:
                profile.full_name?.trim() ||
                "Élève",

              classLabel:
                classRow?.name?.trim() ||
                "Classe non renseignée",
            };
          });

        setChildren(finalChildren);

        setSelectedChildId((current) => {
          const currentStillExists =
            finalChildren.some(
              (child) =>
                child.id === current,
            );

          if (currentStillExists) {
            return current;
          }

          return finalChildren[0]?.id ?? "";
        });

        /*
         * ==================================================
         * 4. APPELS DES ENFANTS
         * ==================================================
         *
         * RLS garantit que le parent connecté ne peut
         * consulter que les lignes autorisées.
         */

        const {
          data: recordsData,
          error: recordsError,
        } = await supabase
          .from("attendance_records")
          .select(
            `
            id,
            session_id,
            student_id,
            status,
            arrival_time,
            minutes_late,
            comment,
            marked_at
            `,
          )
          .in("student_id", childIds)
          .order("marked_at", {
            ascending: false,
          });

        if (recordsError) {
          throw recordsError;
        }

        const records =
          (recordsData ??
            []) as AttendanceRecordRow[];

        if (records.length === 0) {
          setHistory([]);
          return;
        }

        /*
         * ==================================================
         * 5. SÉANCES
         * ==================================================
         *
         * Seules les séances clôturées apparaissent
         * dans le suivi Parent.
         */

        const sessionIds = uniqueStrings(
          records.map(
            (record) => record.session_id,
          ),
        );

        const {
          data: sessionsData,
          error: sessionsError,
        } = await supabase
          .from("attendance_sessions")
          .select(
            `
            id,
            class_id,
            course_id,
            teacher_id,
            session_date,
            starts_at,
            ends_at,
            status,
            notes,
            closed_at
            `,
          )
          .in("id", sessionIds)
          .eq("status", "closed");

        if (sessionsError) {
          throw sessionsError;
        }

        const sessions =
          (sessionsData ??
            []) as AttendanceSessionRow[];

        const sessionById = new Map(
          sessions.map((session) => [
            session.id,
            session,
          ]),
        );

        /*
         * On retire automatiquement les lignes dont
         * la séance n'est pas clôturée ou n'est pas
         * accessible via RLS.
         */

        const closedRecords = records.filter(
          (record) =>
            sessionById.has(
              record.session_id,
            ),
        );

        if (closedRecords.length === 0) {
          setHistory([]);
          return;
        }

        /*
         * ==================================================
         * 6. CLASSES ET COURS DES SÉANCES
         * ==================================================
         */

        const historyClassIds =
          uniqueStrings(
            sessions.map(
              (session) =>
                session.class_id,
            ),
          );

        const courseIds = uniqueStrings(
          sessions.map(
            (session) =>
              session.course_id,
          ),
        );

        let historyClasses: ClassRow[] = [];
        let courses: CourseRow[] = [];

        if (historyClassIds.length > 0) {
          const {
            data: classesData,
            error: classesError,
          } = await supabase
            .from("classes")
            .select("id, name")
            .in("id", historyClassIds);

          if (classesError) {
            throw classesError;
          }

          historyClasses =
            (classesData ??
              []) as ClassRow[];
        }

        if (courseIds.length > 0) {
          const {
            data: coursesData,
            error: coursesError,
          } = await supabase
            .from("courses")
            .select("id, title")
            .in("id", courseIds);

          if (coursesError) {
            throw coursesError;
          }

          courses =
            (coursesData ??
              []) as CourseRow[];
        }

        const historyClassById = new Map(
          historyClasses.map((row) => [
            row.id,
            row,
          ]),
        );

        const courseById = new Map(
          courses.map((row) => [
            row.id,
            row,
          ]),
        );

        /*
         * ==================================================
         * 7. JUSTIFICATIFS EXISTANTS
         * ==================================================
         */

        const recordIds = closedRecords.map(
          (record) => record.id,
        );

        let justifications:
          AttendanceJustificationRow[] = [];

        if (recordIds.length > 0) {
          const {
            data: justificationsData,
            error:
              justificationsError,
          } = await supabase
            .from(
              "attendance_justifications",
            )
            .select(
              `
              id,
              attendance_record_id,
              submitted_by,
              reason,
              status,
              reviewed_by,
              reviewed_at,
              review_note,
              created_at,
              updated_at
              `,
            )
            .in(
              "attendance_record_id",
              recordIds,
            )
            .order("created_at", {
              ascending: false,
            });

          if (justificationsError) {
            throw justificationsError;
          }

          justifications =
            (justificationsData ??
              []) as AttendanceJustificationRow[];
        }

        /*
         * Si plusieurs justificatifs existent un jour
         * pour une même ligne, on affiche le plus récent.
         */

        const justificationByRecordId =
          new Map<
            string,
            AttendanceJustificationRow
          >();

        for (const justification of justifications) {
          if (
            !justificationByRecordId.has(
              justification.attendance_record_id,
            )
          ) {
            justificationByRecordId.set(
              justification.attendance_record_id,
              justification,
            );
          }
        }

        /*
         * ==================================================
         * 8. CONSTRUCTION DE L'HISTORIQUE
         * ==================================================
         */

        const finalHistory: HistoryItem[] =
          closedRecords
            .map((record) => {
              const session =
                sessionById.get(
                  record.session_id,
                );

              if (!session) {
                return null;
              }

              const classRow =
                historyClassById.get(
                  session.class_id,
                );

              const courseRow =
                session.course_id
                  ? courseById.get(
                      session.course_id,
                    )
                  : undefined;

              return {
                recordId: record.id,

                studentId:
                  record.student_id,

                status: record.status,

                arrivalTime:
                  record.arrival_time,

                minutesLate:
                  record.minutes_late,

                comment:
                  record.comment,

                markedAt:
                  record.marked_at,

                sessionId:
                  session.id,

                sessionDate:
                  session.session_date,

                startsAt:
                  session.starts_at,

                endsAt:
                  session.ends_at,

                classId:
                  session.class_id,

                className:
                  classRow?.name?.trim() ||
                  "Classe",

                courseId:
                  session.course_id,

                courseTitle:
                  courseRow?.title?.trim() ||
                  "Cours",

                justification:
                  justificationByRecordId.get(
                    record.id,
                  ) ?? null,
              } satisfies HistoryItem;
            })
            .filter(
              (
                item,
              ): item is HistoryItem =>
                item !== null,
            )
            .sort((a, b) => {
              const aDate =
                `${a.sessionDate}T${
                  a.startsAt ??
                  "00:00:00"
                }`;

              const bDate =
                `${b.sessionDate}T${
                  b.startsAt ??
                  "00:00:00"
                }`;

              return bDate.localeCompare(
                aDate,
              );
            });

        setHistory(finalHistory);
      } catch (err) {
        console.error(
          "[ParentAttendance] loadAttendance error:",
          err,
        );

        setError(
          getAttendanceErrorMessage(
            err,
            "Impossible de charger les données d'assiduité.",
          ),
        );

        setHistory([]);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadAttendance();
  }, [
    authLoading,
    loadAttendance,
  ]);

  /*
   * ======================================================
   * DONNÉES DE L'ENFANT SÉLECTIONNÉ
   * ======================================================
   */

  const selectedChild = useMemo(
    () =>
      children.find(
        (child) =>
          child.id === selectedChildId,
      ) ?? null,
    [children, selectedChildId],
  );

  const selectedHistory = useMemo(
    () =>
      history.filter(
        (item) =>
          item.studentId ===
          selectedChildId,
      ),
    [history, selectedChildId],
  );

  const counts = useMemo(() => {
    const present =
      selectedHistory.filter(
        (item) =>
          item.status === "present",
      ).length;

    const absent =
      selectedHistory.filter(
        (item) =>
          item.status === "absent",
      ).length;

    const late =
      selectedHistory.filter(
        (item) =>
          item.status === "late",
      ).length;

    const total =
      selectedHistory.length;

    /*
     * Une présence avec retard compte comme
     * une présence pour le taux d'assiduité.
     */
    const attendanceRate =
      total > 0
        ? Math.round(
            ((present + late) / total) *
              100,
          )
        : 0;

    return {
      present,
      absent,
      late,
      total,
      attendanceRate,
    };
  }, [selectedHistory]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") {
      return selectedHistory;
    }

    return selectedHistory.filter(
      (item) =>
        item.status === historyFilter,
    );
  }, [
    historyFilter,
    selectedHistory,
  ]);

  /*
   * ======================================================
   * DÉPÔT D'UN JUSTIFICATIF
   * ======================================================
   */

  async function submitJustification(
    recordId: string,
  ) {
    if (!user || user.isDemo) {
      return;
    }

    if (submittingRecordId) {
      return;
    }

    const reason =
      reasonByRecordId[
        recordId
      ]?.trim() ?? "";

    if (reason.length < 3) {
      alert(
        "Veuillez renseigner un motif de justification.",
      );
      return;
    }

    try {
      setSubmittingRecordId(
        recordId,
      );

      setError(null);
      setSuccess(null);

      const {
        error: insertError,
      } = await supabase
        .from(
          "attendance_justifications",
        )
        .insert({
          attendance_record_id:
            recordId,

          reason,

          status:
            "pending" satisfies JustificationStatus,
        });

      if (insertError) {
        throw insertError;
      }

      setReasonByRecordId(
        (current) => ({
          ...current,
          [recordId]: "",
        }),
      );

      setSuccess(
        "Justificatif envoyé avec succès. Il est maintenant en attente de validation.",
      );

      await loadAttendance();
    } catch (err) {
      console.error(
        "[ParentAttendance] submitJustification error:",
        err,
      );

      const message =
        getAttendanceErrorMessage(
          err,
          "Impossible d'envoyer le justificatif.",
        );

      setError(message);

      alert(message);
    } finally {
      setSubmittingRecordId(
        null,
      );
    }
  }

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      {/* ================================================= */}
      {/* EN-TÊTE */}
      {/* ================================================= */}

      <div className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-br from-white via-white to-blue-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-xl shadow-sm">
              👨‍👩‍👧
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Présences & absences
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-950">
                Suivi de l&apos;assiduité
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-gray-500">
                Suivez les présences,
                absences et retards de vos
                enfants et déposez un
                justificatif lorsqu&apos;une
                situation le nécessite.
              </p>
            </div>
          </div>

          {!user?.isDemo && (
            <button
              type="button"
              className="sn-btn-ghost sn-press"
              onClick={() =>
                void loadAttendance()
              }
              disabled={isLoading}
            >
              ↻ Rafraîchir
            </button>
          )}
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : les données
          réelles d&apos;assiduité ne sont
          pas chargées.
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          ✅ {success}
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="sn-card animate-pulse p-5"
            >
              <div className="h-4 w-1/3 rounded bg-gray-100" />

              <div className="mt-3 h-7 w-1/4 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card border border-red-200 bg-red-50 p-5">
          <div className="font-semibold text-red-700">
            Chargement impossible
          </div>

          <div className="mt-1 text-sm text-red-600">
            {error}
          </div>

          <button
            type="button"
            className="sn-btn-ghost mt-4"
            onClick={() =>
              void loadAttendance()
            }
          >
            Réessayer
          </button>
        </div>
      )}

      {!isLoading &&
        !error &&
        !user?.isDemo &&
        children.length === 0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-lg font-semibold text-gray-900">
              Aucun enfant lié
            </div>

            <div className="mt-2 text-sm text-gray-500">
              Aucun profil apprenant
              n&apos;est actuellement associé
              à ce compte Parent / Tuteur.
            </div>
          </div>
        )}

      {!isLoading &&
        !error &&
        children.length > 0 && (
          <>
            {/* ============================================= */}
            {/* ENFANTS */}
            {/* ============================================= */}

            <section className="space-y-3">
              <div>
                <h2 className="font-semibold text-gray-950">
                  Mes enfants
                </h2>

                <p className="text-sm text-gray-500">
                  Sélectionnez un enfant pour
                  consulter son assiduité.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {children.map(
                  (child) => {
                    const selected =
                      child.id ===
                      selectedChildId;

                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => {
                          setSelectedChildId(
                            child.id,
                          );

                          setHistoryFilter(
                            "all",
                          );

                          setSuccess(null);
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                            : "border-gray-200 bg-white text-gray-900 hover:border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                              selected
                                ? "bg-white/15 text-white"
                                : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {child.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {child.name}
                            </div>

                            <div
                              className={`text-sm ${
                                selected
                                  ? "text-blue-100"
                                  : "text-gray-500"
                              }`}
                            >
                              {child.classLabel}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </section>

            {selectedChild && (
              <>
                {/* ========================================= */}
                {/* INDICATEURS */}
                {/* ========================================= */}

                <section className="space-y-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                      Enfant sélectionné
                    </div>

                    <h2 className="mt-1 text-xl font-bold">
                      {selectedChild.name}
                    </h2>

                    <div className="text-sm text-gray-500">
                      {
                        selectedChild.classLabel
                      }
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <StatCard
                      label="Présences"
                      value={
                        counts.present
                      }
                      icon="✅"
                    />

                    <StatCard
                      label="Absences"
                      value={
                        counts.absent
                      }
                      icon="❌"
                    />

                    <StatCard
                      label="Retards"
                      value={counts.late}
                      icon="⏰"
                    />

                    <StatCard
                      label="Séances"
                      value={counts.total}
                      icon="📚"
                    />

                    <StatCard
                      label="Taux d'assiduité"
                      value={`${counts.attendanceRate}%`}
                      icon="📈"
                    />
                  </div>
                </section>

                {/* ========================================= */}
                {/* HISTORIQUE */}
                {/* ========================================= */}

                <section className="sn-card overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-5">
                    <div>
                      <h2 className="font-semibold text-gray-950">
                        Historique
                        d&apos;assiduité
                      </h2>

                      <p className="mt-1 text-sm text-gray-500">
                        Seuls les appels
                        clôturés concernant cet
                        enfant sont affichés.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <FilterButton
                        active={
                          historyFilter ===
                          "all"
                        }
                        onClick={() =>
                          setHistoryFilter(
                            "all",
                          )
                        }
                      >
                        Tous (
                        {counts.total})
                      </FilterButton>

                      <FilterButton
                        active={
                          historyFilter ===
                          "present"
                        }
                        onClick={() =>
                          setHistoryFilter(
                            "present",
                          )
                        }
                      >
                        Présents (
                        {counts.present})
                      </FilterButton>

                      <FilterButton
                        active={
                          historyFilter ===
                          "absent"
                        }
                        onClick={() =>
                          setHistoryFilter(
                            "absent",
                          )
                        }
                      >
                        Absents (
                        {counts.absent})
                      </FilterButton>

                      <FilterButton
                        active={
                          historyFilter ===
                          "late"
                        }
                        onClick={() =>
                          setHistoryFilter(
                            "late",
                          )
                        }
                      >
                        Retards (
                        {counts.late})
                      </FilterButton>
                    </div>
                  </div>

                  {filteredHistory.length ===
                    0 && (
                    <div className="p-10 text-center">
                      <div className="text-3xl">
                        📭
                      </div>

                      <div className="mt-3 font-semibold text-gray-900">
                        Aucun appel trouvé
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        Aucun
                        enregistrement ne
                        correspond actuellement
                        à ce filtre.
                      </div>
                    </div>
                  )}

                  {filteredHistory.length >
                    0 && (
                    <div className="divide-y divide-gray-100">
                      {filteredHistory.map(
                        (item) => (
                          <AttendanceHistoryCard
                            key={
                              item.recordId
                            }
                            item={item}
                            reason={
                              reasonByRecordId[
                                item.recordId
                              ] ?? ""
                            }
                            onReasonChange={(
                              value,
                            ) =>
                              setReasonByRecordId(
                                (
                                  current,
                                ) => ({
                                  ...current,
                                  [item.recordId]:
                                    value,
                                }),
                              )
                            }
                            submitting={
                              submittingRecordId ===
                              item.recordId
                            }
                            onSubmit={() =>
                              void submitJustification(
                                item.recordId,
                              )
                            }
                          />
                        ),
                      )}
                    </div>
                  )}
                </section>
              </>
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
  value: number | string;
  icon: string;
}) {
  return (
    <div className="sn-card flex items-center justify-between p-4">
      <div>
        <div className="text-xs text-gray-500">
          {label}
        </div>

        <div className="mt-1 text-xl font-bold text-gray-950">
          {value}
        </div>
      </div>

      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-lg">
        {icon}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
        active
          ? "border border-blue-300 bg-blue-50 text-blue-700"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function AttendanceHistoryCard({
  item,
  reason,
  onReasonChange,
  submitting,
  onSubmit,
}: {
  item: HistoryItem;
  reason: string;
  onReasonChange: (
    value: string,
  ) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const canJustify =
    item.status === "absent" ||
    item.status === "late";

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-gray-950">
              {item.courseTitle}
            </div>

            <span
              className={attendanceBadgeClass(
                item.status,
              )}
            >
              {attendanceLabel(
                item.status,
              )}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              🏫 {item.className}
            </span>

            <span>
              📅{" "}
              {formatDate(
                item.sessionDate,
              )}
            </span>

            <span>
              🕒{" "}
              {formatTime(
                item.startsAt,
              )}{" "}
              →{" "}
              {formatTime(
                item.endsAt,
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Situation
          </div>

          {item.status ===
            "present" && (
            <div className="mt-2 text-sm text-gray-700">
              L&apos;apprenant a été
              marqué présent.
            </div>
          )}

          {item.status ===
            "absent" && (
            <div className="mt-2 text-sm text-red-700">
              L&apos;apprenant a été
              marqué absent.
            </div>
          )}

          {item.status ===
            "late" && (
            <div className="mt-2 text-sm text-amber-700">
              {item.minutesLate} minute
              {item.minutesLate > 1
                ? "s"
                : ""}{" "}
              de retard
              {item.arrivalTime
                ? ` • arrivée à ${formatTime(
                    item.arrivalTime,
                  )}`
                : ""}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Commentaire
          </div>

          <div className="mt-2 text-sm text-gray-700">
            {item.comment ||
              "Aucun commentaire."}
          </div>
        </div>
      </div>

      {canJustify && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">
                Justificatif
              </div>

              <div className="mt-1 text-sm text-gray-500">
                Motif transmis pour
                expliquer cette absence
                ou ce retard.
              </div>
            </div>

            {item.justification && (
              <span
                className={justificationBadgeClass(
                  item.justification
                    .status,
                )}
              >
                {justificationLabel(
                  item.justification
                    .status,
                )}
              </span>
            )}
          </div>

          {!item.justification && (
            <div className="mt-4 space-y-3">
              <textarea
                value={reason}
                onChange={(event) =>
                  onReasonChange(
                    event.target.value,
                  )
                }
                disabled={submitting}
                placeholder="Exemple : consultation médicale, maladie, urgence familiale..."
                className="min-h-[100px] w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  className="sn-btn-primary sn-press"
                  onClick={onSubmit}
                  disabled={
                    submitting ||
                    reason.trim().length <
                      3
                  }
                >
                  {submitting
                    ? "Envoi..."
                    : "Envoyer le justificatif"}
                </button>
              </div>
            </div>
          )}

          {item.justification && (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase text-gray-500">
                  Motif transmis
                </div>

                <div className="mt-2 text-sm text-gray-800">
                  {
                    item
                      .justification
                      .reason
                  }
                </div>
              </div>

              {item.justification
                .status !==
                "pending" && (
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase text-gray-500">
                    Décision
                  </div>

                  <div className="mt-2 text-sm font-medium text-gray-900">
                    {justificationLabel(
                      item
                        .justification
                        .status,
                    )}
                  </div>

                  {item.justification
                    .review_note && (
                    <div className="mt-2 text-sm text-gray-600">
                      {
                        item
                          .justification
                          .review_note
                      }
                    </div>
                  )}
                </div>
              )}

              {item.justification
                .status ===
                "pending" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  ⏳ Le justificatif est
                  en attente de validation.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}