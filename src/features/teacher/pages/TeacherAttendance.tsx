import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";

import {
    closeAttendanceSession,
    createAttendanceSession,
    getAttendanceErrorMessage,
    getAttendanceStudentsForClass,
    getTeacherAttendanceClasses,
    getTeacherAttendanceCourses,
    saveAttendanceRecords,
    getAttendanceRecords,
    getAttendanceRecordsForSessions,
    getClosedAttendanceSessionsForClass,
    getLatestOpenAttendanceSessionForClass,
    getTeacherAttendanceJustificationsForClass,
    reviewAttendanceJustification,
} from "@/features/attendance/lib/attendanceApi";

import type {
  AttendanceCourse,
  AttendanceJustificationDecision,
  AttendanceRecord,
  AttendanceRecordDraft,
  AttendanceSession,
  AttendanceStatus,
  AttendanceStudent,
  TeacherAttendanceClass,
  TeacherAttendanceJustificationItem,
} from "@/features/attendance/types/attendance.types";

type AttendanceDraftMap = Record<string, AttendanceRecordDraft>;
type AttendanceHistoryFilter = "all" | "today" | "week";

type AttendanceHistoryItem = {
  session: AttendanceSession;
  courseTitle: string;
  records: AttendanceRecord[];
  presentCount: number;
  absentCount: number;
  lateCount: number;
};

function toLocalDateInputValue(date: Date) {
  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  );

  return local.toISOString().slice(0, 10);
}

function getTodayInputValue() {
  return toLocalDateInputValue(new Date());
}

function getCurrentWeekRange() {
  const today = new Date();
  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const dayFromMonday = (current.getDay() + 6) % 7;
  const start = new Date(current);
  start.setDate(current.getDate() - dayFromMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: toLocalDateInputValue(start),
    end: toLocalDateInputValue(end),
  };
}

function formatAttendanceDate(value: string) {
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

function formatAttendanceDateTime(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildInitialDrafts(
  students: AttendanceStudent[]
): AttendanceDraftMap {
  return students.reduce<AttendanceDraftMap>(
    (acc, student) => {
      acc[student.id] = {
        studentId: student.id,
        status: "present",
        arrivalTime: null,
        minutesLate: 0,
        comment: null,
      };

      return acc;
    },
    {}
  );
}

function buildDraftsFromExistingRecords(
  students: AttendanceStudent[],
  records: Awaited<ReturnType<typeof getAttendanceRecords>>
): AttendanceDraftMap {
  const recordByStudent = new Map(
    records.map((record) => [
      record.studentId,
      record,
    ])
  );

  return students.reduce<AttendanceDraftMap>(
    (acc, student) => {
      const record =
        recordByStudent.get(student.id);

      acc[student.id] = record
        ? {
            studentId: student.id,
            status: record.status,
            arrivalTime:
              record.arrivalTime,
            minutesLate:
              record.minutesLate,
            comment:
              record.comment,
          }
        : {
            studentId: student.id,
            status: "present",
            arrivalTime: null,
            minutesLate: 0,
            comment: null,
          };

      return acc;
    },
    {}
  );
}

export default function TeacherAttendance() {
  const { user, loading: authLoading } = useAuth();

  const [classes, setClasses] = useState<
    TeacherAttendanceClass[]
  >([]);

  const [selectedClassId, setSelectedClassId] =
    useState("");

  const [students, setStudents] = useState<
    AttendanceStudent[]
  >([]);

  const [courses, setCourses] = useState<
    AttendanceCourse[]
  >([]);

  const [loadingClasses, setLoadingClasses] =
    useState(true);

  const [loadingDetails, setLoadingDetails] =
    useState(false);

  const [classesError, setClassesError] =
    useState<string | null>(null);

  const [detailsError, setDetailsError] =
    useState<string | null>(null);

  // ==========================================================
  // Nouvelle séance
  // ==========================================================

  const [showSessionForm, setShowSessionForm] =
    useState(false);

  const [sessionCourseId, setSessionCourseId] =
    useState("");

  const [sessionDate, setSessionDate] = useState(
    getTodayInputValue()
  );

  const [sessionStart, setSessionStart] =
    useState("");

  const [sessionEnd, setSessionEnd] =
    useState("");

  const [sessionNotes, setSessionNotes] =
    useState("");

  const [creatingSession, setCreatingSession] =
    useState(false);

  const [activeSession, setActiveSession] =
    useState<AttendanceSession | null>(null);

  // ==========================================================
  // Historique des séances
  // ==========================================================

  const [historySessions, setHistorySessions] =
    useState<AttendanceSession[]>([]);

  const [historyRecords, setHistoryRecords] =
    useState<AttendanceRecord[]>([]);

  const [historyFilter, setHistoryFilter] =
    useState<AttendanceHistoryFilter>("all");

  const [expandedHistorySessionId, setExpandedHistorySessionId] =
    useState<string | null>(null);

  const [loadingHistory, setLoadingHistory] =
    useState(false);

  const [historyError, setHistoryError] =
    useState<string | null>(null);

  // ==========================================================
  // Justificatifs
  // ==========================================================

  const [justifications, setJustifications] =
    useState<TeacherAttendanceJustificationItem[]>([]);

  const [loadingJustifications, setLoadingJustifications] =
    useState(false);

  const [justificationsError, setJustificationsError] =
    useState<string | null>(null);

  const [justificationMessage, setJustificationMessage] =
    useState<string | null>(null);

  const [reviewingJustificationId, setReviewingJustificationId] =
    useState<string | null>(null);

  const [reviewNotes, setReviewNotes] =
    useState<Record<string, string>>({});

  // ==========================================================
  // Appel
  // ==========================================================

  const [attendanceDrafts, setAttendanceDrafts] =
    useState<AttendanceDraftMap>({});

  const [savingAttendance, setSavingAttendance] =
    useState(false);

  const [closingSession, setClosingSession] =
    useState(false);

  const [attendanceMessage, setAttendanceMessage] =
    useState<string | null>(null);

  const [attendanceError, setAttendanceError] =
    useState<string | null>(null);

  const selectedClass = useMemo(
    () =>
      classes.find(
        (item) => item.id === selectedClassId
      ) ?? null,
    [classes, selectedClassId]
  );

  const activeCourses = useMemo(
    () =>
      courses.filter(
        (course) => course.status === "active"
      ),
    [courses]
  );

  const historyItems = useMemo<AttendanceHistoryItem[]>(() => {
    const recordsBySession = new Map<string, AttendanceRecord[]>();

    for (const record of historyRecords) {
      const current = recordsBySession.get(record.sessionId) ?? [];
      current.push(record);
      recordsBySession.set(record.sessionId, current);
    }

    const today = getTodayInputValue();
    const week = getCurrentWeekRange();

    return historySessions
      .filter((session) => {
        if (historyFilter === "all") return true;
        if (historyFilter === "today") {
          return session.sessionDate === today;
        }

        return (
          session.sessionDate >= week.start &&
          session.sessionDate <= week.end
        );
      })
      .map((session) => {
        const records = recordsBySession.get(session.id) ?? [];

        return {
          session,
          courseTitle:
            courses.find((course) => course.id === session.courseId)?.title ??
            "Appel général",
          records,
          presentCount: records.filter((record) => record.status === "present").length,
          absentCount: records.filter((record) => record.status === "absent").length,
          lateCount: records.filter((record) => record.status === "late").length,
        };
      });
  }, [courses, historyFilter, historyRecords, historySessions]);

  const studentById = useMemo(() => {
    return new Map(students.map((student) => [student.id, student]));
  }, [students]);

  const pendingJustificationCount = useMemo(
    () =>
      justifications.filter(
        (item) => item.justification.status === "pending"
      ).length,
    [justifications]
  );

  const attendanceStats = useMemo(() => {
    const values = Object.values(attendanceDrafts);

    return {
      present: values.filter(
        (record) => record.status === "present"
      ).length,

      absent: values.filter(
        (record) => record.status === "absent"
      ).length,

      late: values.filter(
        (record) => record.status === "late"
      ).length,
    };
  }, [attendanceDrafts]);

  // ==========================================================
  // Chargement des classes
  // ==========================================================

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

      const result =
        await getTeacherAttendanceClasses(user.id);

      setClasses(result);

      setSelectedClassId((current) => {
        if (
          current &&
          result.some(
            (item) => item.id === current
          )
        ) {
          return current;
        }

        return result[0]?.id ?? "";
      });
    } catch (error) {
      console.error(
        "[TeacherAttendance] loadClasses error:",
        error
      );

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

  // ==========================================================
  // Chargement élèves + cours
  // ==========================================================

  const loadClassDetails =
    useCallback(async () => {
      if (
        !user ||
        user.isDemo ||
        !selectedClassId
      ) {
        setStudents([]);
        setCourses([]);
        setDetailsError(null);
        return;
      }

      try {
        setLoadingDetails(true);
        setDetailsError(null);

        const [
          studentsResult,
          coursesResult,
          openSession,
        ] = await Promise.all([
          getAttendanceStudentsForClass(
            selectedClassId
          ),

          getTeacherAttendanceCourses(
            user.id,
            selectedClassId
          ),

          getLatestOpenAttendanceSessionForClass(
            user.id,
            selectedClassId
          ),
        ]);

        setStudents(studentsResult);
        setCourses(coursesResult);

        if (openSession) {
          const existingRecords =
            await getAttendanceRecords(
              openSession.id
            );

          setActiveSession(openSession);

          setAttendanceDrafts(
            buildDraftsFromExistingRecords(
              studentsResult,
              existingRecords
            )
          );

          setShowSessionForm(false);

          setAttendanceMessage(
            existingRecords.length > 0
              ? "Séance en cours restaurée avec l'appel déjà enregistré."
              : "Séance en cours restaurée. Vous pouvez reprendre l'appel."
          );
        } else {
          setActiveSession(null);
          setAttendanceDrafts({});
          setAttendanceMessage(null);
        }

        setSessionCourseId((current) => {
          const active = coursesResult.filter(
            (course) =>
              course.status === "active"
          );

          if (
            current &&
            active.some(
              (course) =>
                course.id === current
            )
          ) {
            return current;
          }

          return active[0]?.id ?? "";
        });
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

  // ==========================================================
  // Chargement de l'historique
  // ==========================================================

  const loadHistory = useCallback(async () => {
    if (
      !user ||
      user.isDemo ||
      !selectedClassId
    ) {
      setHistorySessions([]);
      setHistoryRecords([]);
      setHistoryError(null);
      setLoadingHistory(false);
      return;
    }

    try {
      setLoadingHistory(true);
      setHistoryError(null);

      const sessions =
        await getClosedAttendanceSessionsForClass(
          user.id,
          selectedClassId
        );

      const records =
        await getAttendanceRecordsForSessions(
          sessions.map((session) => session.id)
        );

      setHistorySessions(sessions);
      setHistoryRecords(records);

      setExpandedHistorySessionId((current) =>
        current && sessions.some((session) => session.id === current)
          ? current
          : null
      );
    } catch (error) {
      console.error(
        "[TeacherAttendance] loadHistory error:",
        error
      );

      setHistorySessions([]);
      setHistoryRecords([]);

      setHistoryError(
        getAttendanceErrorMessage(
          error,
          "Impossible de charger l'historique des séances."
        )
      );
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedClassId, user]);

  // ==========================================================
  // Chargement des justificatifs
  // ==========================================================

  const loadJustifications = useCallback(async () => {
    if (
      !user ||
      user.isDemo ||
      !selectedClassId
    ) {
      setJustifications([]);
      setJustificationsError(null);
      setLoadingJustifications(false);
      return;
    }

    try {
      setLoadingJustifications(true);
      setJustificationsError(null);

      const result =
        await getTeacherAttendanceJustificationsForClass(
          user.id,
          selectedClassId
        );

      setJustifications(result);
    } catch (error) {
      console.error(
        "[TeacherAttendance] loadJustifications error:",
        error
      );

      setJustifications([]);
      setJustificationsError(
        getAttendanceErrorMessage(
          error,
          "Impossible de charger les justificatifs."
        )
      );
    } finally {
      setLoadingJustifications(false);
    }
  }, [selectedClassId, user]);

  useEffect(() => {
    if (authLoading) return;

    void loadClasses();
  }, [authLoading, loadClasses]);

  useEffect(() => {
    if (
      authLoading ||
      loadingClasses
    ) {
      return;
    }

    void loadClassDetails();
    void loadHistory();
    void loadJustifications();
  }, [
    authLoading,
    loadingClasses,
    loadClassDetails,
    loadHistory,
    loadJustifications,
  ]);

  // Si on change de classe, on quitte toute séance locale
  // et on réinitialise l'affichage de l'historique.
  useEffect(() => {
    setActiveSession(null);
    setAttendanceDrafts({});
    setAttendanceMessage(null);
    setAttendanceError(null);
    setShowSessionForm(false);
    setHistorySessions([]);
    setHistoryRecords([]);
    setHistoryFilter("all");
    setExpandedHistorySessionId(null);
    setHistoryError(null);
    setJustifications([]);
    setJustificationsError(null);
    setJustificationMessage(null);
    setReviewingJustificationId(null);
    setReviewNotes({});
  }, [selectedClassId]);

  // ==========================================================
  // Création séance
  // ==========================================================

  async function handleCreateSession() {
    if (
      !user ||
      user.isDemo ||
      !selectedClass
    ) {
      return;
    }

    if (students.length === 0) {
      alert(
        "Cette classe ne contient aucun apprenant visible."
      );
      return;
    }

    try {
      setCreatingSession(true);
      setAttendanceError(null);
      setAttendanceMessage(null);

      const session =
        await createAttendanceSession({
          classId: selectedClass.id,
          courseId:
            sessionCourseId || null,
          teacherId: user.id,
          sessionDate,
          startsAt:
            sessionStart || null,
          endsAt:
            sessionEnd || null,
          notes:
            sessionNotes.trim() || null,
        });

      setActiveSession(session);

      setAttendanceDrafts(
        buildInitialDrafts(students)
      );

      setShowSessionForm(false);

      setAttendanceMessage(
        "Séance créée avec succès. Vous pouvez maintenant effectuer l'appel."
      );
    } catch (error) {
      console.error(
        "[TeacherAttendance] create session error:",
        error
      );

      setAttendanceError(
        getAttendanceErrorMessage(
          error,
          "Impossible de créer la séance."
        )
      );
    } finally {
      setCreatingSession(false);
    }
  }

  // ==========================================================
  // Modification locale d'un statut
  // ==========================================================

  function updateStudentStatus(
    studentId: string,
    status: AttendanceStatus
  ) {
    setAttendanceDrafts((current) => {
      const previous =
        current[studentId];

      if (!previous) {
        return current;
      }

      return {
        ...current,

        [studentId]: {
          ...previous,
          status,

          minutesLate:
            status === "late"
              ? previous.minutesLate ?? 0
              : 0,

          arrivalTime:
            status === "late"
              ? previous.arrivalTime ?? null
              : null,
        },
      };
    });

    setAttendanceMessage(null);
    setAttendanceError(null);
  }

  function updateMinutesLate(
    studentId: string,
    value: string
  ) {
    const parsed = Number(value);

    setAttendanceDrafts((current) => {
      const previous =
        current[studentId];

      if (!previous) {
        return current;
      }

      return {
        ...current,

        [studentId]: {
          ...previous,
          minutesLate:
            Number.isFinite(parsed) &&
            parsed >= 0
              ? Math.trunc(parsed)
              : 0,
        },
      };
    });
  }

  function updateArrivalTime(
    studentId: string,
    value: string
  ) {
    setAttendanceDrafts((current) => {
      const previous =
        current[studentId];

      if (!previous) {
        return current;
      }

      return {
        ...current,

        [studentId]: {
          ...previous,
          arrivalTime:
            value || null,
        },
      };
    });
  }

  function updateComment(
    studentId: string,
    value: string
  ) {
    setAttendanceDrafts((current) => {
      const previous =
        current[studentId];

      if (!previous) {
        return current;
      }

      return {
        ...current,

        [studentId]: {
          ...previous,
          comment:
            value || null,
        },
      };
    });
  }

  function markEveryonePresent() {
    setAttendanceDrafts(
      (current) => {
        const next: AttendanceDraftMap =
          {};

        for (const [
          studentId,
          record,
        ] of Object.entries(current)) {
          next[studentId] = {
            ...record,
            status: "present",
            minutesLate: 0,
            arrivalTime: null,
          };
        }

        return next;
      }
    );

    setAttendanceMessage(null);
    setAttendanceError(null);
  }

  // ==========================================================
  // Enregistrer l'appel
  // ==========================================================

  async function handleSaveAttendance() {
    if (
      !user ||
      !activeSession ||
      savingAttendance
    ) {
      return false;
    }

    try {
      setSavingAttendance(true);
      setAttendanceMessage(null);
      setAttendanceError(null);

      const records =
        students.map(
          (student) =>
            attendanceDrafts[
              student.id
            ]
        );

      const validRecords =
        records.filter(
          (
            record
          ): record is AttendanceRecordDraft =>
            Boolean(record)
        );

      if (
        validRecords.length !==
        students.length
      ) {
        throw new Error(
          "Certains apprenants n'ont pas encore de statut."
        );
      }

      await saveAttendanceRecords(
        activeSession.id,
        user.id,
        validRecords
      );

      setAttendanceMessage(
        "Appel enregistré avec succès."
      );

      return true;
    } catch (error) {
      console.error(
        "[TeacherAttendance] save attendance error:",
        error
      );

      setAttendanceError(
        getAttendanceErrorMessage(
          error,
          "Impossible d'enregistrer l'appel."
        )
      );

      return false;
    } finally {
      setSavingAttendance(false);
    }
  }

  // ==========================================================
  // Clôturer
  // ==========================================================

  async function handleCloseSession() {
    if (
      !user ||
      !activeSession ||
      closingSession
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Clôturer cette séance ? L'appel sera considéré comme terminé."
    );

    if (!confirmed) {
      return;
    }

    try {
      setClosingSession(true);
      setAttendanceMessage(null);
      setAttendanceError(null);

      // Toujours enregistrer le dernier état avant clôture.
      const saved =
        await handleSaveAttendance();

      if (!saved) {
        return;
      }

      const closed =
        await closeAttendanceSession(
          activeSession.id,
          user.id
        );

      const closedRecords =
        await getAttendanceRecords(closed.id);

      setHistorySessions((current) => [
        closed,
        ...current.filter(
          (session) => session.id !== closed.id
        ),
      ]);

      setHistoryRecords((current) => [
        ...closedRecords,
        ...current.filter(
          (record) => record.sessionId !== closed.id
        ),
      ]);

      setExpandedHistorySessionId(closed.id);
      setActiveSession(null);
      setAttendanceDrafts({});
      setShowSessionForm(false);

      setAttendanceMessage(
        "Séance clôturée avec succès et ajoutée à l'historique."
      );
    } catch (error) {
      console.error(
        "[TeacherAttendance] close session error:",
        error
      );

      setAttendanceError(
        getAttendanceErrorMessage(
          error,
          "Impossible de clôturer la séance."
        )
      );
    } finally {
      setClosingSession(false);
    }
  }

  // ==========================================================
  // Validation d'un justificatif
  // ==========================================================

  async function handleReviewJustification(
    justificationId: string,
    decision: AttendanceJustificationDecision
  ) {
    if (reviewingJustificationId) {
      return;
    }

    const actionLabel =
      decision === "approved" ? "accepter" : "rejeter";

    const confirmed = window.confirm(
      `Voulez-vous vraiment ${actionLabel} ce justificatif ?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setReviewingJustificationId(justificationId);
      setJustificationsError(null);
      setJustificationMessage(null);

      await reviewAttendanceJustification(
        justificationId,
        decision,
        reviewNotes[justificationId] ?? ""
      );

      await loadJustifications();

      setReviewNotes((current) => {
        const next = { ...current };
        delete next[justificationId];
        return next;
      });

      setJustificationMessage(
        decision === "approved"
          ? "Justificatif accepté avec succès."
          : "Justificatif rejeté avec succès."
      );
    } catch (error) {
      console.error(
        "[TeacherAttendance] reviewJustification error:",
        error
      );

      setJustificationsError(
        getAttendanceErrorMessage(
          error,
          "Impossible de traiter ce justificatif."
        )
      );
    } finally {
      setReviewingJustificationId(null);
    }
  }

  const isLoading =
    authLoading || loadingClasses;

  const sessionIsClosed =
    activeSession?.status === "closed";

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
                Créez une séance, effectuez l'appel
                et enregistrez les présences,
                absences et retards.
              </p>
            </div>

            <button
              type="button"
              className="sn-btn-ghost sn-press"
              onClick={() =>
                void loadClasses()
              }
              disabled={isLoading}
            >
              ↻ Rafraîchir
            </button>
          </div>
        </div>
      </section>

      {user?.isDemo && (
        <div
          className="
            sn-card border border-amber-200
            bg-amber-50 p-4
            text-sm text-amber-700
          "
        >
          Mode démo actif : aucune donnée
          réelle ne sera enregistrée.
        </div>
      )}

      {!isLoading &&
        classesError && (
          <ErrorBox
            title="Impossible de charger vos classes"
            message={classesError}
            onRetry={() =>
              void loadClasses()
            }
          />
        )}

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({
            length: 3,
          }).map((_, index) => (
            <LoadingCard
              key={index}
            />
          ))}
        </div>
      )}

      {!isLoading &&
        !classesError &&
        !user?.isDemo &&
        classes.length === 0 && (
          <div className="sn-card p-8 text-center">
            <div className="text-lg font-black text-slate-900">
              Aucune classe affectée
            </div>

            <p className="mt-2 text-sm text-slate-500">
              Votre compte enseignant
              n'est actuellement rattaché
              à aucune classe.
            </p>
          </div>
        )}

      {!isLoading &&
        !classesError &&
        classes.length > 0 && (
          <>
            {/* ===============================================
                CLASSES
            ================================================ */}

            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  Mes classes
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Choisissez la classe
                  pour laquelle vous souhaitez
                  effectuer l'appel.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {classes.map(
                  (classItem) => {
                    const selected =
                      classItem.id ===
                      selectedClassId;

                    return (
                      <button
                        key={
                          classItem.id
                        }
                        type="button"
                        disabled={
                          Boolean(
                            activeSession
                          )
                        }
                        onClick={() =>
                          setSelectedClassId(
                            classItem.id
                          )
                        }
                        className={`
                          rounded-2xl border p-5
                          text-left transition sn-press
                          ${
                            selected
                              ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100"
                              : "border-slate-200 bg-white text-slate-900 hover:border-blue-200 hover:shadow-sm"
                          }
                          ${
                            activeSession
                              ? "cursor-not-allowed opacity-70"
                              : ""
                          }
                        `}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-black">
                              {
                                classItem.name
                              }
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
                            {classItem.assignmentRole ===
                            "main"
                              ? "Principal"
                              : "Assistant"}
                          </span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </section>

            {selectedClass && (
              <section className="space-y-4">
                {/* ===========================================
                    CLASSE SELECTIONNEE
                ============================================ */}

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div
                      className="
                        text-xs font-black uppercase
                        tracking-[0.16em]
                        text-blue-600
                      "
                    >
                      Classe sélectionnée
                    </div>

                    <h2 className="mt-1 text-xl font-black text-slate-950">
                      {selectedClass.name}
                    </h2>
                  </div>

                  {!activeSession && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() => {
                          void loadClassDetails();
                          void loadHistory();
                          void loadJustifications();
                        }}
                        disabled={
                          loadingDetails || loadingHistory
                        }
                      >
                        ↻ Actualiser
                      </button>

                      <button
                        type="button"
                        className="sn-btn-primary sn-press"
                        onClick={() =>
                          setShowSessionForm(
                            (current) =>
                              !current
                          )
                        }
                        disabled={
                          loadingDetails ||
                          students.length ===
                            0
                        }
                      >
                        {showSessionForm
                          ? "Fermer"
                          : "+ Nouvelle séance"}
                      </button>
                    </div>
                  )}
                </div>

                {loadingDetails && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <LoadingCard />
                    <LoadingCard />
                  </div>
                )}

                {!loadingDetails &&
                  detailsError && (
                    <ErrorBox
                      title="Erreur de chargement"
                      message={
                        detailsError
                      }
                      onRetry={() =>
                        void loadClassDetails()
                      }
                    />
                  )}

                {!loadingDetails &&
                  !detailsError && (
                    <>
                      {/* =====================================
                          KPI CLASSE
                      ====================================== */}

                      <div className="grid gap-3 sm:grid-cols-3">
                        <StatCard
                          label="Apprenants"
                          value={
                            students.length
                          }
                          icon="🎓"
                        />

                        <StatCard
                          label="Cours actifs"
                          value={
                            activeCourses.length
                          }
                          icon="📚"
                        />

                        <StatCard
                          label="Cours total"
                          value={
                            courses.length
                          }
                          icon="📘"
                        />
                      </div>

                      {/* =====================================
                          FORMULAIRE NOUVELLE SEANCE
                      ====================================== */}

                      {showSessionForm &&
                        !activeSession && (
                          <div
                            className="
                              sn-card overflow-hidden
                              border border-blue-100
                            "
                          >
                            <div
                              className="
                                border-b border-blue-100
                                bg-blue-50/70 p-5
                              "
                            >
                              <div className="text-lg font-black text-slate-950">
                                Nouvelle séance
                              </div>

                              <div className="mt-1 text-sm text-slate-600">
                                Préparez l'appel
                                de{" "}
                                {
                                  selectedClass.name
                                }.
                              </div>
                            </div>

                            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
                              <Field
                                label="Cours"
                              >
                                <select
                                  className="sn-input w-full"
                                  value={
                                    sessionCourseId
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setSessionCourseId(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    creatingSession
                                  }
                                >
                                  <option value="">
                                    Appel général
                                  </option>

                                  {activeCourses.map(
                                    (
                                      course
                                    ) => (
                                      <option
                                        key={
                                          course.id
                                        }
                                        value={
                                          course.id
                                        }
                                      >
                                        {
                                          course.title
                                        }
                                      </option>
                                    )
                                  )}
                                </select>
                              </Field>

                              <Field label="Date">
                                <input
                                  className="sn-input w-full"
                                  type="date"
                                  value={
                                    sessionDate
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setSessionDate(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    creatingSession
                                  }
                                />
                              </Field>

                              <Field label="Début">
                                <input
                                  className="sn-input w-full"
                                  type="time"
                                  value={
                                    sessionStart
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setSessionStart(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    creatingSession
                                  }
                                />
                              </Field>

                              <Field label="Fin">
                                <input
                                  className="sn-input w-full"
                                  type="time"
                                  value={
                                    sessionEnd
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setSessionEnd(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    creatingSession
                                  }
                                />
                              </Field>

                              <div className="md:col-span-2 xl:col-span-4">
                                <Field label="Notes facultatives">
                                  <textarea
                                    className="sn-input min-h-[90px] w-full"
                                    placeholder="Exemple : appel du cours de mathématiques..."
                                    value={
                                      sessionNotes
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      setSessionNotes(
                                        event
                                          .target
                                          .value
                                      )
                                    }
                                    disabled={
                                      creatingSession
                                    }
                                  />
                                </Field>
                              </div>

                              <div className="md:col-span-2 xl:col-span-4 flex justify-end">
                                <button
                                  type="button"
                                  className="sn-btn-primary sn-press"
                                  onClick={() =>
                                    void handleCreateSession()
                                  }
                                  disabled={
                                    creatingSession ||
                                    !sessionDate
                                  }
                                >
                                  {creatingSession
                                    ? "Création..."
                                    : "Créer et commencer l'appel"}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* =====================================
                          MESSAGES
                      ====================================== */}

                      {attendanceError && (
                        <div
                          className="
                            rounded-2xl border
                            border-red-200
                            bg-red-50 p-4
                            text-sm text-red-700
                          "
                        >
                          ❌{" "}
                          {
                            attendanceError
                          }
                        </div>
                      )}

                      {attendanceMessage && (
                        <div
                          className="
                            rounded-2xl border
                            border-emerald-200
                            bg-emerald-50 p-4
                            text-sm text-emerald-700
                          "
                        >
                          ✅{" "}
                          {
                            attendanceMessage
                          }
                        </div>
                      )}

                      {/* =====================================
                          APPEL ACTIF
                      ====================================== */}

                      {activeSession ? (
                        <div className="space-y-4">
                          <div
                            className="
                              sn-card border
                              border-blue-100 p-5
                            "
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <div
                                  className="
                                    text-xs font-black
                                    uppercase
                                    tracking-[0.16em]
                                    text-blue-600
                                  "
                                >
                                  Séance en cours
                                </div>

                                <div className="mt-1 text-xl font-black text-slate-950">
                                  {
                                    selectedClass.name
                                  }
                                </div>

                                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                                  <span>
                                    📅{" "}
                                    {
                                      activeSession.sessionDate
                                    }
                                  </span>

                                  {activeSession.startsAt && (
                                    <span>
                                      🕐{" "}
                                      {
                                        activeSession.startsAt
                                      }
                                    </span>
                                  )}

                                  {activeSession.endsAt && (
                                    <span>
                                      →{" "}
                                      {
                                        activeSession.endsAt
                                      }
                                    </span>
                                  )}

                                  <span>
                                    📚{" "}
                                    {activeCourses.find(
                                      (
                                        course
                                      ) =>
                                        course.id ===
                                        activeSession.courseId
                                    )
                                      ?.title ??
                                      "Appel général"}
                                  </span>
                                </div>
                              </div>

                              <span
                                className={
                                  sessionIsClosed
                                    ? "sn-badge sn-badge-gray"
                                    : "sn-badge sn-badge-green"
                                }
                              >
                                {sessionIsClosed
                                  ? "Clôturée"
                                  : "Ouverte"}
                              </span>
                            </div>
                          </div>

                          {/* =================================
                              STATISTIQUES APPEL
                          ================================== */}

                          <div className="grid gap-3 sm:grid-cols-3">
                            <AttendanceStat
                              label="Présents"
                              value={
                                attendanceStats.present
                              }
                              icon="✅"
                            />

                            <AttendanceStat
                              label="Absents"
                              value={
                                attendanceStats.absent
                              }
                              icon="❌"
                            />

                            <AttendanceStat
                              label="Retards"
                              value={
                                attendanceStats.late
                              }
                              icon="⏰"
                            />
                          </div>

                          {/* =================================
                              BARRE ACTIONS
                          ================================== */}

                          {!sessionIsClosed && (
                            <div
                              className="
                                sn-card flex flex-wrap
                                items-center
                                justify-between gap-3
                                p-4
                              "
                            >
                              <div>
                                <div className="font-semibold text-slate-900">
                                  Faire
                                  l'appel
                                </div>

                                <div className="text-sm text-slate-500">
                                  {
                                    students.length
                                  }{" "}
                                  apprenant(s)
                                  dans cette
                                  classe.
                                </div>
                              </div>

                              <button
                                type="button"
                                className="sn-btn-ghost sn-press"
                                onClick={
                                  markEveryonePresent
                                }
                              >
                                ✅ Tous
                                présents
                              </button>
                            </div>
                          )}

                          {/* =================================
                              ELEVES
                          ================================== */}

                          <div className="space-y-3">
                            {students.map(
                              (
                                student,
                                index
                              ) => {
                                const draft =
                                  attendanceDrafts[
                                    student.id
                                  ];

                                if (
                                  !draft
                                ) {
                                  return null;
                                }

                                return (
                                  <AttendanceStudentCard
                                    key={
                                      student.id
                                    }
                                    index={
                                      index
                                    }
                                    student={
                                      student
                                    }
                                    draft={
                                      draft
                                    }
                                    disabled={
                                      sessionIsClosed ||
                                      savingAttendance ||
                                      closingSession
                                    }
                                    onStatusChange={(
                                      status
                                    ) =>
                                      updateStudentStatus(
                                        student.id,
                                        status
                                      )
                                    }
                                    onMinutesLateChange={(
                                      value
                                    ) =>
                                      updateMinutesLate(
                                        student.id,
                                        value
                                      )
                                    }
                                    onArrivalTimeChange={(
                                      value
                                    ) =>
                                      updateArrivalTime(
                                        student.id,
                                        value
                                      )
                                    }
                                    onCommentChange={(
                                      value
                                    ) =>
                                      updateComment(
                                        student.id,
                                        value
                                      )
                                    }
                                  />
                                );
                              }
                            )}
                          </div>

                          {/* =================================
                              ENREGISTRER / CLOTURER
                          ================================== */}

                          {!sessionIsClosed && (
                            <div
                              className="
                                sn-card flex flex-col
                                gap-3 p-5
                                sm:flex-row
                                sm:items-center
                                sm:justify-end
                              "
                            >
                              <button
                                type="button"
                                className="sn-btn-ghost sn-press"
                                onClick={() =>
                                  void handleSaveAttendance()
                                }
                                disabled={
                                  savingAttendance ||
                                  closingSession
                                }
                              >
                                {savingAttendance
                                  ? "Enregistrement..."
                                  : "💾 Enregistrer l'appel"}
                              </button>

                              <button
                                type="button"
                                className="sn-btn-primary sn-press"
                                onClick={() =>
                                  void handleCloseSession()
                                }
                                disabled={
                                  savingAttendance ||
                                  closingSession
                                }
                              >
                                {closingSession
                                  ? "Clôture..."
                                  : "✓ Clôturer la séance"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ===================================
                           APERCU CLASSE AVANT SEANCE
                        ==================================== */

                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="sn-card p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-black text-slate-900">
                                  Apprenants
                                  de la
                                  classe
                                </div>

                                <div className="mt-1 text-sm text-slate-500">
                                  Profils
                                  autorisés
                                  par RLS.
                                </div>
                              </div>

                              <span className="sn-badge sn-badge-blue">
                                {
                                  students.length
                                }
                              </span>
                            </div>

                            <div className="mt-4 space-y-2">
                              {students.map(
                                (
                                  student
                                ) => (
                                  <div
                                    key={
                                      student.id
                                    }
                                    className="
                                      flex items-center
                                      gap-3
                                      rounded-2xl
                                      border
                                      border-slate-100
                                      bg-slate-50 p-3
                                    "
                                  >
                                    <StudentAvatar
                                      student={
                                        student
                                      }
                                    />

                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-semibold text-slate-900">
                                        {
                                          student.fullName
                                        }
                                      </div>

                                      <div className="text-xs text-slate-500">
                                        Apprenant
                                      </div>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>

                          <div className="sn-card p-5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-black text-slate-900">
                                  Cours
                                  associés
                                </div>

                                <div className="mt-1 text-sm text-slate-500">
                                  Cours actifs
                                  utilisables
                                  pour l'appel.
                                </div>
                              </div>

                              <span className="sn-badge sn-badge-blue">
                                {
                                  activeCourses.length
                                }
                              </span>
                            </div>

                            <div className="mt-4 space-y-2">
                              {activeCourses.map(
                                (
                                  course
                                ) => (
                                  <div
                                    key={
                                      course.id
                                    }
                                    className="
                                      flex items-center
                                      justify-between
                                      gap-3
                                      rounded-2xl
                                      border
                                      border-slate-100
                                      bg-slate-50 p-4
                                    "
                                  >
                                    <div className="font-semibold text-slate-900">
                                      {
                                        course.title
                                      }
                                    </div>

                                    <span className="sn-badge sn-badge-green">
                                      Actif
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <TeacherJustificationsSection
                        items={justifications}
                        pendingCount={pendingJustificationCount}
                        loading={loadingJustifications}
                        error={justificationsError}
                        message={justificationMessage}
                        reviewingId={reviewingJustificationId}
                        reviewNotes={reviewNotes}
                        studentById={studentById}
                        courses={courses}
                        onReviewNoteChange={(justificationId, value) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [justificationId]: value,
                          }))
                        }
                        onApprove={(justificationId) =>
                          void handleReviewJustification(
                            justificationId,
                            "approved"
                          )
                        }
                        onReject={(justificationId) =>
                          void handleReviewJustification(
                            justificationId,
                            "rejected"
                          )
                        }
                        onRetry={() => void loadJustifications()}
                      />

                      <AttendanceHistorySection
                        items={historyItems}
                        totalCount={historySessions.length}
                        filter={historyFilter}
                        loading={loadingHistory}
                        error={historyError}
                        expandedSessionId={expandedHistorySessionId}
                        studentById={studentById}
                        onFilterChange={setHistoryFilter}
                        onToggle={(sessionId) =>
                          setExpandedHistorySessionId((current) =>
                            current === sessionId ? null : sessionId
                          )
                        }
                        onRetry={() => void loadHistory()}
                      />
                    </>
                  )}
              </section>
            )}
          </>
        )}
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================

function TeacherJustificationsSection({
  items,
  pendingCount,
  loading,
  error,
  message,
  reviewingId,
  reviewNotes,
  studentById,
  courses,
  onReviewNoteChange,
  onApprove,
  onReject,
  onRetry,
}: {
  items: TeacherAttendanceJustificationItem[];
  pendingCount: number;
  loading: boolean;
  error: string | null;
  message: string | null;
  reviewingId: string | null;
  reviewNotes: Record<string, string>;
  studentById: Map<string, AttendanceStudent>;
  courses: AttendanceCourse[];
  onReviewNoteChange: (justificationId: string, value: string) => void;
  onApprove: (justificationId: string) => void;
  onReject: (justificationId: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="sn-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-black text-slate-950">
            Justificatifs
          </div>

          <div className="mt-1 text-sm text-slate-500">
            Consultez et traitez les justificatifs envoyés par les parents
            pour vos appels clôturés.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              pendingCount > 0
                ? "sn-badge sn-badge-blue"
                : "sn-badge sn-badge-gray"
            }
          >
            {pendingCount} en attente
          </span>

          <button
            type="button"
            className="sn-btn-ghost sn-press"
            onClick={onRetry}
            disabled={loading}
          >
            ↻ Actualiser
          </button>
        </div>
      </div>

      <div className="p-5">
        {message && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            ✅ {message}
          </div>
        )}

        {loading && (
          <div className="grid gap-4 lg:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
          </div>
        )}

        {!loading && error && (
          <ErrorBox
            title="Justificatifs indisponibles"
            message={error}
            onRetry={onRetry}
          />
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div className="font-black text-slate-900">
              Aucun justificatif
            </div>

            <div className="mt-2 text-sm text-slate-500">
              Les justificatifs envoyés pour les absences ou retards de
              cette classe apparaîtront ici.
            </div>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map((item) => {
              const justification = item.justification;
              const record = item.record;
              const session = item.session;
              const student = studentById.get(record.studentId);
              const studentName =
                student?.fullName ??
                `Apprenant ${record.studentId.slice(0, 8)}`;
              const courseTitle =
                courses.find((course) => course.id === session.courseId)
                  ?.title ?? "Appel général";
              const isPending = justification.status === "pending";
              const isReviewing = reviewingId === justification.id;

              return (
                <div
                  key={justification.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-black text-slate-950">
                          {studentName}
                        </div>

                        <span
                          className={getJustificationStatusBadgeClass(
                            justification.status
                          )}
                        >
                          {getJustificationStatusLabel(
                            justification.status
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span>📚 {courseTitle}</span>
                        <span>📅 {formatAttendanceDate(session.sessionDate)}</span>
                        {session.startsAt && (
                          <span>🕐 {session.startsAt}</span>
                        )}
                        {session.endsAt && (
                          <span>→ {session.endsAt}</span>
                        )}
                      </div>

                      <div className="mt-2 text-xs text-slate-400">
                        Envoyé le {formatAttendanceDateTime(justification.createdAt)}
                      </div>
                    </div>

                    <span
                      className={getAttendanceStatusBadgeClass(record.status)}
                    >
                      {getAttendanceStatusLabel(record.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Situation
                      </div>

                      <div className="mt-2 text-sm text-slate-700">
                        {record.status === "late"
                          ? `${record.minutesLate} minute(s) de retard${
                              record.arrivalTime
                                ? ` • arrivée à ${record.arrivalTime}`
                                : ""
                            }`
                          : record.status === "absent"
                            ? "Absence enregistrée"
                            : "Présence enregistrée"}
                      </div>

                      {record.comment?.trim() && (
                        <div className="mt-2 text-sm text-slate-500">
                          Commentaire enseignant : {record.comment}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="text-xs font-black uppercase tracking-wide text-blue-600">
                        Motif transmis
                      </div>

                      <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                        {justification.reason}
                      </div>
                    </div>
                  </div>

                  {isPending ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                      <Field label="Note de décision (facultative)">
                        <textarea
                          className="sn-input min-h-[88px] w-full"
                          placeholder="Exemple : justificatif conforme, document à fournir, motif insuffisant..."
                          value={reviewNotes[justification.id] ?? ""}
                          onChange={(event) =>
                            onReviewNoteChange(
                              justification.id,
                              event.target.value
                            )
                          }
                          disabled={Boolean(reviewingId)}
                        />
                      </Field>

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="sn-btn-ghost sn-press"
                          onClick={() => onReject(justification.id)}
                          disabled={Boolean(reviewingId)}
                        >
                          {isReviewing ? "Traitement..." : "❌ Rejeter"}
                        </button>

                        <button
                          type="button"
                          className="sn-btn-primary sn-press"
                          onClick={() => onApprove(justification.id)}
                          disabled={Boolean(reviewingId)}
                        >
                          {isReviewing ? "Traitement..." : "✅ Accepter"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-700">
                        Décision enregistrée
                      </div>

                      <div className="mt-1 text-sm text-slate-500">
                        {justification.reviewedAt
                          ? `Traitée le ${formatAttendanceDateTime(
                              justification.reviewedAt
                            )}`
                          : "Date de traitement non renseignée"}
                      </div>

                      {justification.reviewNote?.trim() && (
                        <div className="mt-2 text-sm text-slate-600">
                          Note : {justification.reviewNote}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function AttendanceHistorySection({
  items,
  totalCount,
  filter,
  loading,
  error,
  expandedSessionId,
  studentById,
  onFilterChange,
  onToggle,
  onRetry,
}: {
  items: AttendanceHistoryItem[];
  totalCount: number;
  filter: AttendanceHistoryFilter;
  loading: boolean;
  error: string | null;
  expandedSessionId: string | null;
  studentById: Map<string, AttendanceStudent>;
  onFilterChange: (filter: AttendanceHistoryFilter) => void;
  onToggle: (sessionId: string) => void;
  onRetry: () => void;
}) {
  return (
    <section className="sn-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-black text-slate-950">
            Historique des séances
          </div>

          <div className="mt-1 text-sm text-slate-500">
            Retrouvez les appels clôturés pour cette classe.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <HistoryFilterButton
            active={filter === "all"}
            label={`Toutes (${totalCount})`}
            onClick={() => onFilterChange("all")}
          />

          <HistoryFilterButton
            active={filter === "today"}
            label="Aujourd'hui"
            onClick={() => onFilterChange("today")}
          />

          <HistoryFilterButton
            active={filter === "week"}
            label="Cette semaine"
            onClick={() => onFilterChange("week")}
          />
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="grid gap-4 lg:grid-cols-2">
            <LoadingCard />
            <LoadingCard />
          </div>
        )}

        {!loading && error && (
          <ErrorBox
            title="Historique indisponible"
            message={error}
            onRetry={onRetry}
          />
        )}

        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <div className="font-black text-slate-900">
              {totalCount === 0
                ? "Aucune séance clôturée"
                : "Aucune séance pour ce filtre"}
            </div>

            <div className="mt-2 text-sm text-slate-500">
              {totalCount === 0
                ? "Les séances terminées apparaîtront ici après leur clôture."
                : "Essayez un autre filtre pour afficher les séances disponibles."}
            </div>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-4">
            {items.map((item) => {
              const expanded =
                expandedSessionId === item.session.id;

              return (
                <div
                  key={item.session.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <div className="p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-black text-slate-950">
                            {item.courseTitle}
                          </div>

                          <span className="sn-badge sn-badge-gray">
                            Clôturée
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span>
                            📅 {formatAttendanceDate(item.session.sessionDate)}
                          </span>

                          {item.session.startsAt && (
                            <span>🕐 {item.session.startsAt}</span>
                          )}

                          {item.session.endsAt && (
                            <span>→ {item.session.endsAt}</span>
                          )}
                        </div>

                        {item.session.notes && (
                          <div className="mt-2 text-sm text-slate-500">
                            Note : {item.session.notes}
                          </div>
                        )}

                        {item.session.closedAt && (
                          <div className="mt-2 text-xs text-slate-400">
                            Clôturée le {formatAttendanceDateTime(item.session.closedAt)}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <HistoryStat
                          label="Présents"
                          value={item.presentCount}
                          icon="✅"
                        />

                        <HistoryStat
                          label="Absents"
                          value={item.absentCount}
                          icon="❌"
                        />

                        <HistoryStat
                          label="Retards"
                          value={item.lateCount}
                          icon="⏰"
                        />

                        <button
                          type="button"
                          className="sn-btn-primary sn-press"
                          onClick={() => onToggle(item.session.id)}
                        >
                          {expanded ? "Masquer l'appel" : "Voir l'appel"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-5">
                      {item.records.length === 0 ? (
                        <div className="text-sm text-slate-500">
                          Aucun enregistrement d'appel trouvé pour cette séance.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {item.records.map((record, index) => {
                            const student = studentById.get(record.studentId);
                            const studentName =
                              student?.fullName ??
                              `Apprenant ${record.studentId.slice(0, 8)}`;

                            return (
                              <div
                                key={record.id}
                                className="rounded-2xl border border-slate-200 bg-white p-4"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <div className="font-black text-slate-950">
                                      {index + 1}. {studentName}
                                    </div>

                                    <div className="mt-1 text-sm text-slate-500">
                                      {record.comment?.trim()
                                        ? `Commentaire : ${record.comment}`
                                        : "Aucun commentaire"}
                                    </div>

                                    {record.status === "late" && (
                                      <div className="mt-1 text-sm text-slate-500">
                                        {record.minutesLate} min de retard
                                        {record.arrivalTime
                                          ? ` • arrivée à ${record.arrivalTime}`
                                          : ""}
                                      </div>
                                    )}
                                  </div>

                                  <span
                                    className={getAttendanceStatusBadgeClass(
                                      record.status
                                    )}
                                  >
                                    {getAttendanceStatusLabel(record.status)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function HistoryFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`sn-btn-ghost sn-press ${
        active ? "ring-2 ring-blue-200" : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function HistoryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <span className="mr-1">{icon}</span>
      <span className="font-semibold text-slate-600">{label}</span>
      <span className="ml-2 font-black text-slate-950">{value}</span>
    </div>
  );
}

function getAttendanceStatusLabel(status: AttendanceStatus) {
  if (status === "present") return "Présent";
  if (status === "absent") return "Absent";
  return "Retard";
}

function getAttendanceStatusBadgeClass(status: AttendanceStatus) {
  if (status === "present") {
    return "sn-badge sn-badge-green";
  }

  if (status === "absent") {
    return "sn-badge sn-badge-gray";
  }

  return "sn-badge sn-badge-blue";
}

function getJustificationStatusLabel(
  status: TeacherAttendanceJustificationItem["justification"]["status"]
) {
  if (status === "pending") return "En attente";
  if (status === "approved") return "Accepté";
  return "Rejeté";
}

function getJustificationStatusBadgeClass(
  status: TeacherAttendanceJustificationItem["justification"]["status"]
) {
  if (status === "approved") {
    return "sn-badge sn-badge-green";
  }

  if (status === "rejected") {
    return "sn-badge sn-badge-gray";
  }

  return "sn-badge sn-badge-blue";
}

function AttendanceStudentCard({
  index,
  student,
  draft,
  disabled,
  onStatusChange,
  onMinutesLateChange,
  onArrivalTimeChange,
  onCommentChange,
}: {
  index: number;
  student: AttendanceStudent;
  draft: AttendanceRecordDraft;
  disabled: boolean;
  onStatusChange: (
    status: AttendanceStatus
  ) => void;
  onMinutesLateChange: (
    value: string
  ) => void;
  onArrivalTimeChange: (
    value: string
  ) => void;
  onCommentChange: (
    value: string
  ) => void;
}) {
  return (
    <div className="sn-card overflow-hidden">
      <div
        className="
          flex flex-col gap-4 p-5
          xl:flex-row
          xl:items-center
        "
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="
              flex h-8 w-8 shrink-0
              items-center justify-center
              rounded-full
              bg-slate-100
              text-xs font-black
              text-slate-500
            "
          >
            {index + 1}
          </div>

          <StudentAvatar
            student={student}
          />

          <div className="min-w-0">
            <div className="truncate font-black text-slate-950">
              {student.fullName}
            </div>

            <div className="text-xs text-slate-500">
              Apprenant
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusButton
            active={
              draft.status ===
              "present"
            }
            disabled={disabled}
            label="Présent"
            icon="✅"
            onClick={() =>
              onStatusChange(
                "present"
              )
            }
          />

          <StatusButton
            active={
              draft.status ===
              "absent"
            }
            disabled={disabled}
            label="Absent"
            icon="❌"
            onClick={() =>
              onStatusChange(
                "absent"
              )
            }
          />

          <StatusButton
            active={
              draft.status ===
              "late"
            }
            disabled={disabled}
            label="Retard"
            icon="⏰"
            onClick={() =>
              onStatusChange("late")
            }
          />
        </div>
      </div>

      <div
        className="
          grid gap-4
          border-t border-slate-100
          bg-slate-50/70 p-5
          md:grid-cols-3
        "
      >
        {draft.status === "late" ? (
          <>
            <Field label="Minutes de retard">
              <input
                className="sn-input w-full"
                type="number"
                min="0"
                step="1"
                value={
                  draft.minutesLate ?? 0
                }
                onChange={(event) =>
                  onMinutesLateChange(
                    event.target.value
                  )
                }
                disabled={disabled}
              />
            </Field>

            <Field label="Heure d'arrivée">
              <input
                className="sn-input w-full"
                type="time"
                value={
                  draft.arrivalTime ??
                  ""
                }
                onChange={(event) =>
                  onArrivalTimeChange(
                    event.target.value
                  )
                }
                disabled={disabled}
              />
            </Field>
          </>
        ) : (
          <div className="md:col-span-2">
            <div
              className="
                flex min-h-[70px]
                items-center
                rounded-2xl
                border border-slate-200
                bg-white px-4
                text-sm text-slate-500
              "
            >
              {draft.status ===
              "present"
                ? "L'apprenant est marqué présent."
                : "L'apprenant est marqué absent."}
            </div>
          </div>
        )}

        <Field label="Commentaire">
          <input
            className="sn-input w-full"
            type="text"
            placeholder="Facultatif"
            value={
              draft.comment ?? ""
            }
            onChange={(event) =>
              onCommentChange(
                event.target.value
              )
            }
            disabled={disabled}
          />
        </Field>
      </div>
    </div>
  );
}

function StatusButton({
  active,
  disabled,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`
        rounded-xl border
        px-4 py-2
        text-sm font-bold
        transition sn-press
        ${
          active
            ? "border-blue-600 bg-blue-600 text-white shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"
        }
        ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : ""
        }
      `}
    >
      {icon} {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="block text-xs font-bold text-slate-700">
        {label}
      </span>

      {children}
    </label>
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
            flex h-10 w-10
            items-center justify-center
            rounded-xl bg-blue-50
            text-lg
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

function AttendanceStat({
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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-600">
            {label}
          </div>

          <div className="mt-1 text-2xl font-black text-slate-950">
            {value}
          </div>
        </div>

        <div className="text-2xl">
          {icon}
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

function ErrorBox({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="
        sn-card space-y-3
        border border-red-200
        bg-red-50 p-5
        text-red-700
      "
    >
      <div className="font-semibold">
        {title}
      </div>

      <div className="text-sm">
        {message}
      </div>

      <button
        type="button"
        className="sn-btn-primary sn-press w-fit"
        onClick={onRetry}
      >
        Réessayer
      </button>
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
    student.fullName
      .trim()
      .charAt(0)
      .toUpperCase() || "?";

  return (
    <div
      className="
        flex h-10 w-10
        shrink-0 items-center
        justify-center
        rounded-full bg-blue-100
        text-sm font-black
        text-blue-700
      "
    >
      {initial}
    </div>
  );
}
