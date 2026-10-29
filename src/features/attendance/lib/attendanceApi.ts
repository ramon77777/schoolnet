import { supabase } from "@/lib/supabaseClient";

import type {
  AttendanceCourse,
  AttendanceJustificationDecision,
  AttendanceRecord,
  AttendanceRecordDraft,
  AttendanceSession,
  AttendanceStudent,
  CreateAttendanceSessionInput,
  StudentAttendanceHistoryItem,
  StudentAttendanceJustification,
  TeacherAssignmentRole,
  TeacherAttendanceClass,
  TeacherAttendanceJustificationItem,
} from "../types/attendance.types";

type DbClass = {
  id: string;
  name: string;
  school_year: string | null;
  level_id: number;
};

type TeacherClassRow = {
  class_id: string;
  assignment_role: TeacherAssignmentRole;
  classes: DbClass | DbClass[] | null;
};

type DbProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "admin" | "teacher" | "student" | "parent";
};

type ClassStudentRow = {
  student_id: string;
  profiles: DbProfile | DbProfile[] | null;
};

type DbCourse = {
  id: string;
  title: string;
  class_id: string | null;
  status: "active" | "archived";
  created_by: string;
};

type CourseTeacherRow = {
  course_id: string;
  courses: DbCourse | DbCourse[] | null;
};

function normalizeRelation<T>(
  relation: T | T[] | null | undefined
): T | null {
  if (!relation) return null;

  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

export function getAttendanceErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      message?: string;
      details?: string;
      hint?: string;
      error_description?: string;
    };

    return (
      candidate.message ||
      candidate.error_description ||
      candidate.details ||
      candidate.hint ||
      fallback
    );
  }

  return fallback;
}

/**
 * Retourne uniquement les classes réellement affectées
 * à l'enseignant connecté.
 *
 * La sécurité reste également contrôlée par RLS.
 */
export async function getTeacherAttendanceClasses(
  teacherId: string
): Promise<TeacherAttendanceClass[]> {
  const { data, error } = await supabase
    .from("class_teachers")
    .select(
      `
      class_id,
      assignment_role,
      classes!class_teachers_class_id_fkey (
        id,
        name,
        school_year,
        level_id
      )
      `
    )
    .eq("teacher_id", teacherId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as TeacherClassRow[];

  return rows
    .map((row) => {
      const classRow = normalizeRelation(row.classes);

      if (!classRow) {
        return null;
      }

      return {
        id: classRow.id,
        name: classRow.name,
        schoolYear: classRow.school_year,
        levelId: classRow.level_id,
        assignmentRole: row.assignment_role,
      } satisfies TeacherAttendanceClass;
    })
    .filter(
      (row): row is TeacherAttendanceClass =>
        row !== null
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, "fr", {
        numeric: true,
      })
    );
}

/**
 * Retourne les apprenants appartenant à une classe.
 *
 * La lecture de profiles est autorisée uniquement si
 * l'enseignant connecté est réellement affecté à la classe.
 */
export async function getAttendanceStudentsForClass(
  classId: string
): Promise<AttendanceStudent[]> {
  const { data, error } = await supabase
    .from("class_students")
    .select(
      `
      student_id,
      profiles!class_students_student_id_fkey (
        id,
        full_name,
        avatar_url,
        role
      )
      `
    )
    .eq("class_id", classId);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as ClassStudentRow[];

  return rows
    .map((row) => {
      const profile = normalizeRelation(row.profiles);

      if (!profile || profile.role !== "student") {
        return null;
      }

      return {
        id: profile.id,
        fullName:
          profile.full_name?.trim() ||
          "Apprenant sans nom",
        avatarUrl: profile.avatar_url,
      } satisfies AttendanceStudent;
    })
    .filter(
      (student): student is AttendanceStudent =>
        student !== null
    )
    .sort((a, b) =>
      a.fullName.localeCompare(b.fullName, "fr")
    );
}

/**
 * Retourne les cours de l'enseignant pour une classe donnée.
 *
 * On couvre :
 * - les cours créés directement par l'enseignant ;
 * - les cours auxquels il est affecté via course_teachers.
 */
export async function getTeacherAttendanceCourses(
  teacherId: string,
  classId: string
): Promise<AttendanceCourse[]> {
  const [createdResult, assignedResult] =
    await Promise.all([
      supabase
        .from("courses")
        .select(
          `
          id,
          title,
          class_id,
          status,
          created_by
          `
        )
        .eq("created_by", teacherId)
        .eq("class_id", classId),

      supabase
        .from("course_teachers")
        .select(
          `
          course_id,
          courses!course_teachers_course_id_fkey (
            id,
            title,
            class_id,
            status,
            created_by
          )
          `
        )
        .eq("teacher_id", teacherId),
    ]);

  if (createdResult.error) {
    throw createdResult.error;
  }

  if (assignedResult.error) {
    throw assignedResult.error;
  }

  const createdCourses =
    (createdResult.data ?? []) as DbCourse[];

  const assignedRows =
    (assignedResult.data ?? []) as CourseTeacherRow[];

  const assignedCourses = assignedRows
    .map((row) => normalizeRelation(row.courses))
    .filter(
      (course): course is DbCourse =>
        Boolean(course) &&
        course?.class_id === classId
    );

  const uniqueCourses = new Map<
    string,
    AttendanceCourse
  >();

  for (const course of [
    ...createdCourses,
    ...assignedCourses,
  ]) {
    uniqueCourses.set(course.id, {
      id: course.id,
      title: course.title,
      classId: course.class_id,
      status: course.status,
    });
  }

  return Array.from(uniqueCourses.values()).sort(
    (a, b) =>
      a.title.localeCompare(b.title, "fr")
  );
}

type DbAttendanceSession = {
  id: string;
  class_id: string;
  course_id: string | null;
  teacher_id: string;
  session_date: string;
  starts_at: string | null;
  ends_at: string | null;
  status: "draft" | "open" | "closed" | "cancelled";
  notes: string | null;
  created_by: string;
  closed_by: string | null;
  closed_at: string | null;
};

type DbAttendanceRecord = {
  id: string;
  session_id: string;
  student_id: string;
  status: "present" | "absent" | "late";
  arrival_time: string | null;
  minutes_late: number;
  comment: string | null;
  marked_by: string;
  marked_at: string;
};

function cleanNullableText(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function mapAttendanceSession(
  row: DbAttendanceSession
): AttendanceSession {
  return {
    id: row.id,
    classId: row.class_id,
    courseId: row.course_id,
    teacherId: row.teacher_id,
    sessionDate: row.session_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by,
    closedBy: row.closed_by,
    closedAt: row.closed_at,
  };
}

function mapAttendanceRecord(
  row: DbAttendanceRecord
): AttendanceRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    status: row.status,
    arrivalTime: row.arrival_time,
    minutesLate: row.minutes_late,
    comment: row.comment,
    markedBy: row.marked_by,
    markedAt: row.marked_at,
  };
}

/**
 * Crée une nouvelle séance d'appel.
 *
 * La séance est directement ouverte afin que l'enseignant
 * puisse commencer l'appel immédiatement.
 *
 * created_by est rempli automatiquement par auth.uid().
 */
export async function createAttendanceSession(
  input: CreateAttendanceSessionInput
): Promise<AttendanceSession> {
  const startsAt = cleanNullableText(input.startsAt);
  const endsAt = cleanNullableText(input.endsAt);

  if (!input.classId) {
    throw new Error("La classe est obligatoire.");
  }

  if (!input.teacherId) {
    throw new Error("L'enseignant est obligatoire.");
  }

  if (!input.sessionDate) {
    throw new Error("La date de la séance est obligatoire.");
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new Error(
      "L'heure de fin doit être postérieure à l'heure de début."
    );
  }

  const { data, error } = await supabase
    .from("attendance_sessions")
    .insert({
      class_id: input.classId,
      course_id: input.courseId || null,
      teacher_id: input.teacherId,
      session_date: input.sessionDate,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "open",
      notes: cleanNullableText(input.notes),
    })
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
      created_by,
      closed_by,
      closed_at
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return mapAttendanceSession(
    data as DbAttendanceSession
  );
}

/**
 * Charge une séance accessible à l'utilisateur connecté.
 */
export async function getAttendanceSession(
  sessionId: string
): Promise<AttendanceSession> {
  const { data, error } = await supabase
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
      created_by,
      closed_by,
      closed_at
      `
    )
    .eq("id", sessionId)
    .single();

  if (error) {
    throw error;
  }

  return mapAttendanceSession(
    data as DbAttendanceSession
  );
}

/**
 * Charge les présences déjà enregistrées pour une séance.
 */
export async function getAttendanceRecords(
  sessionId: string
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
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
      marked_by,
      marked_at
      `
    )
    .eq("session_id", sessionId);

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbAttendanceRecord[]).map(
    mapAttendanceRecord
  );
}

/**
 * Enregistre ou met à jour l'appel.
 *
 * La contrainte UNIQUE(session_id, student_id)
 * permet d'utiliser upsert sans créer de doublons.
 */
export async function saveAttendanceRecords(
  sessionId: string,
  teacherId: string,
  records: AttendanceRecordDraft[]
): Promise<void> {
  if (!sessionId) {
    throw new Error("La séance est obligatoire.");
  }

  if (!teacherId) {
    throw new Error("L'enseignant est obligatoire.");
  }

  if (records.length === 0) {
    throw new Error(
      "Aucun apprenant n'a été fourni pour l'appel."
    );
  }

  const now = new Date().toISOString();

  const rows = records.map((record) => {
    const minutesLate =
      record.status === "late"
        ? Math.max(
            0,
            Math.trunc(record.minutesLate ?? 0)
          )
        : 0;

    return {
      session_id: sessionId,
      student_id: record.studentId,
      status: record.status,

      arrival_time:
        record.status === "late"
          ? cleanNullableText(record.arrivalTime)
          : null,

      minutes_late: minutesLate,

      comment: cleanNullableText(record.comment),

      marked_by: teacherId,
      marked_at: now,
    };
  });

  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, {
      onConflict: "session_id,student_id",
    });

  if (error) {
    throw error;
  }
}

/**
 * Vérifie que chaque apprenant actuellement rattaché
 * à la classe possède une ligne de présence.
 *
 * Puis clôture définitivement la séance.
 */
export async function closeAttendanceSession(
  sessionId: string,
  teacherId: string
): Promise<AttendanceSession> {
  const session = await getAttendanceSession(sessionId);

  if (session.teacherId !== teacherId) {
    throw new Error(
      "Vous n'êtes pas responsable de cette séance."
    );
  }

  if (session.status === "closed") {
    return session;
  }

  if (session.status === "cancelled") {
    throw new Error(
      "Une séance annulée ne peut pas être clôturée."
    );
  }

  const [studentsResult, recordsResult] =
    await Promise.all([
      supabase
        .from("class_students")
        .select("student_id")
        .eq("class_id", session.classId),

      supabase
        .from("attendance_records")
        .select("student_id")
        .eq("session_id", sessionId),
    ]);

  if (studentsResult.error) {
    throw studentsResult.error;
  }

  if (recordsResult.error) {
    throw recordsResult.error;
  }

  const expectedStudentIds = new Set(
    (studentsResult.data ?? []).map(
      (row) => row.student_id as string
    )
  );

  const markedStudentIds = new Set(
    (recordsResult.data ?? []).map(
      (row) => row.student_id as string
    )
  );

  const missingStudentIds = Array.from(
    expectedStudentIds
  ).filter(
    (studentId) => !markedStudentIds.has(studentId)
  );

  if (missingStudentIds.length > 0) {
    throw new Error(
      `Appel incomplet : ${missingStudentIds.length} apprenant(s) n'ont pas encore de statut.`
    );
  }

  const { data, error } = await supabase
    .from("attendance_sessions")
    .update({
      status: "closed",
      closed_by: teacherId,
      closed_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
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
      created_by,
      closed_by,
      closed_at
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return mapAttendanceSession(
    data as DbAttendanceSession
  );
}

export async function getLatestOpenAttendanceSessionForClass(
  teacherId: string,
  classId: string
): Promise<AttendanceSession | null> {
  const { data, error } = await supabase
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
      created_by,
      closed_by,
      closed_at
      `
    )
    .eq("teacher_id", teacherId)
    .eq("class_id", classId)
    .in("status", ["draft", "open"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapAttendanceSession(
    data as DbAttendanceSession
  );
}

/**
 * Retourne les séances clôturées de l'enseignant pour une classe.
 *
 * Elles sont triées de la plus récente à la plus ancienne.
 */
export async function getClosedAttendanceSessionsForClass(
  teacherId: string,
  classId: string
): Promise<AttendanceSession[]> {
  const { data, error } = await supabase
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
      created_by,
      closed_by,
      closed_at
      `
    )
    .eq("teacher_id", teacherId)
    .eq("class_id", classId)
    .eq("status", "closed")
    .order("session_date", { ascending: false })
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("closed_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbAttendanceSession[]).map(
    mapAttendanceSession
  );
}

/**
 * Charge les lignes d'appel de plusieurs séances en une seule requête.
 */
export async function getAttendanceRecordsForSessions(
  sessionIds: string[]
): Promise<AttendanceRecord[]> {
  if (sessionIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
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
      marked_by,
      marked_at
      `
    )
    .in("session_id", sessionIds)
    .order("marked_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbAttendanceRecord[]).map(
    mapAttendanceRecord
  );
}

type DbStudentAttendanceClass = {
  id: string;
  name: string;
};

type DbStudentAttendanceCourse = {
  id: string;
  title: string;
};

type DbAttendanceJustification = {
  id: string;
  attendance_record_id: string;
  submitted_by: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

function mapAttendanceJustification(
  row: DbAttendanceJustification
): StudentAttendanceJustification {
  return {
    id: row.id,
    attendanceRecordId: row.attendance_record_id,
    submittedBy: row.submitted_by,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

/**
 * Retourne les justificatifs liés aux séances clôturées
 * créées par l'enseignant pour une classe donnée.
 *
 * La lecture finale de attendance_justifications reste protégée
 * par RLS.
 */
export async function getTeacherAttendanceJustificationsForClass(
  teacherId: string,
  classId: string
): Promise<TeacherAttendanceJustificationItem[]> {
  if (!teacherId || !classId) {
    return [];
  }

  const sessions = await getClosedAttendanceSessionsForClass(
    teacherId,
    classId
  );

  if (sessions.length === 0) {
    return [];
  }

  const sessionById = new Map(
    sessions.map((session) => [session.id, session])
  );

  const records = await getAttendanceRecordsForSessions(
    sessions.map((session) => session.id)
  );

  if (records.length === 0) {
    return [];
  }

  const recordById = new Map(
    records.map((record) => [record.id, record])
  );

  const { data, error } = await supabase
    .from("attendance_justifications")
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
      created_at
      `
    )
    .in(
      "attendance_record_id",
      records.map((record) => record.id)
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as DbAttendanceJustification[])
    .map((row) => {
      const record = recordById.get(row.attendance_record_id);

      if (!record) {
        return null;
      }

      const session = sessionById.get(record.sessionId);

      if (!session) {
        return null;
      }

      return {
        justification: mapAttendanceJustification(row),
        session,
        record,
      } satisfies TeacherAttendanceJustificationItem;
    })
    .filter(
      (item): item is TeacherAttendanceJustificationItem =>
        item !== null
    )
    .sort((a, b) => {
      if (
        a.justification.status === "pending" &&
        b.justification.status !== "pending"
      ) {
        return -1;
      }

      if (
        a.justification.status !== "pending" &&
        b.justification.status === "pending"
      ) {
        return 1;
      }

      return b.justification.createdAt.localeCompare(
        a.justification.createdAt
      );
    });
}

/**
 * Accepte ou rejette un justificatif via une fonction SQL sécurisée.
 * La base vérifie que l'utilisateur connecté est bien l'enseignant
 * responsable de la séance et que le justificatif est encore en attente.
 */
export async function reviewAttendanceJustification(
  justificationId: string,
  decision: AttendanceJustificationDecision,
  reviewNote?: string | null
): Promise<StudentAttendanceJustification> {
  if (!justificationId) {
    throw new Error("Le justificatif est obligatoire.");
  }

  const { data, error } = await supabase.rpc(
    "review_attendance_justification",
    {
      p_justification_id: justificationId,
      p_status: decision,
      p_review_note: cleanNullableText(reviewNote),
    }
  );

  if (error) {
    throw error;
  }

  const rawRow = Array.isArray(data) ? data[0] : data;

  if (!rawRow) {
    throw new Error(
      "La base n'a retourné aucun justificatif après la décision."
    );
  }

  return mapAttendanceJustification(
    rawRow as DbAttendanceJustification
  );
}

/**
 * Retourne l'historique d'assiduité de l'apprenant connecté.
 *
 * Sécurité :
 * - filtrage explicite par student_id ;
 * - seules les séances clôturées sont retenues ;
 * - les politiques RLS Supabase restent la protection principale.
 */
export async function getStudentAttendanceHistory(
  studentId: string
): Promise<StudentAttendanceHistoryItem[]> {
  if (!studentId) {
    throw new Error("L'apprenant est obligatoire.");
  }

  // ----------------------------------------------------------
  // 1. Lignes d'appel appartenant à l'apprenant
  // ----------------------------------------------------------

  const { data: recordsData, error: recordsError } =
    await supabase
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
        marked_by,
        marked_at
        `
      )
      .eq("student_id", studentId)
      .order("marked_at", {
        ascending: false,
      });

  if (recordsError) {
    throw recordsError;
  }

  const records =
    (recordsData ?? []) as DbAttendanceRecord[];

  if (records.length === 0) {
    return [];
  }

  // ----------------------------------------------------------
  // 2. Séances correspondantes
  //    On ne montre à l'apprenant que les séances clôturées.
  // ----------------------------------------------------------

  const sessionIds = Array.from(
    new Set(records.map((record) => record.session_id))
  );

  const { data: sessionsData, error: sessionsError } =
    await supabase
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
        created_by,
        closed_by,
        closed_at
        `
      )
      .in("id", sessionIds)
      .eq("status", "closed");

  if (sessionsError) {
    throw sessionsError;
  }

  const sessions =
    (sessionsData ?? []) as DbAttendanceSession[];

  if (sessions.length === 0) {
    return [];
  }

  const sessionById = new Map(
    sessions.map((session) => [
      session.id,
      session,
    ])
  );

  // ----------------------------------------------------------
  // 3. Classes concernées
  // ----------------------------------------------------------

  const classIds = Array.from(
    new Set(
      sessions
        .map((session) => session.class_id)
        .filter(Boolean)
    )
  );

  let classes: DbStudentAttendanceClass[] = [];

  if (classIds.length > 0) {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", classIds);

    if (error) {
      throw error;
    }

    classes =
      (data ?? []) as DbStudentAttendanceClass[];
  }

  const classById = new Map(
    classes.map((classRow) => [
      classRow.id,
      classRow,
    ])
  );

  // ----------------------------------------------------------
  // 4. Cours concernés
  // ----------------------------------------------------------

  const courseIds = Array.from(
    new Set(
      sessions
        .map((session) => session.course_id)
        .filter(
          (courseId): courseId is string =>
            Boolean(courseId)
        )
    )
  );

  let courses: DbStudentAttendanceCourse[] = [];

  if (courseIds.length > 0) {
    const { data, error } = await supabase
      .from("courses")
      .select("id, title")
      .in("id", courseIds);

    if (error) {
      throw error;
    }

    courses =
      (data ?? []) as DbStudentAttendanceCourse[];
  }

  const courseById = new Map(
    courses.map((course) => [
      course.id,
      course,
    ])
  );

  // ----------------------------------------------------------
  // 5. Justificatifs associés aux lignes d'appel
  // ----------------------------------------------------------

  const recordIds = records.map(
    (record) => record.id
  );

  let justifications: DbAttendanceJustification[] =
    [];

  if (recordIds.length > 0) {
    const { data, error } = await supabase
      .from("attendance_justifications")
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
        created_at
        `
      )
      .in("attendance_record_id", recordIds)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    justifications =
      (data ?? []) as DbAttendanceJustification[];
  }

  /**
   * Si plusieurs justificatifs existent exceptionnellement
   * pour la même ligne d'appel, on conserve le plus récent.
   *
   * La requête précédente étant triée DESC, le premier gagne.
   */
  const justificationByRecordId = new Map<
    string,
    StudentAttendanceJustification
  >();

  for (const justification of justifications) {
    if (
      justificationByRecordId.has(
        justification.attendance_record_id
      )
    ) {
      continue;
    }

    justificationByRecordId.set(
      justification.attendance_record_id,
      mapAttendanceJustification(justification)
    );
  }

  // ----------------------------------------------------------
  // 6. Construction de l'historique final
  // ----------------------------------------------------------

  return records
    .map((record) => {
      const session =
        sessionById.get(record.session_id);

      if (!session) {
        return null;
      }

      const classRow =
        classById.get(session.class_id);

      const courseRow = session.course_id
        ? courseById.get(session.course_id)
        : null;

      return {
        recordId: record.id,
        sessionId: session.id,

        classId: session.class_id,
        className:
          classRow?.name ?? "Classe",

        courseId: session.course_id,
        courseTitle:
          courseRow?.title ?? null,

        sessionDate: session.session_date,
        startsAt: session.starts_at,
        endsAt: session.ends_at,

        status: record.status,
        arrivalTime: record.arrival_time,
        minutesLate: record.minutes_late,
        comment: record.comment,
        markedAt: record.marked_at,

        justification:
          justificationByRecordId.get(record.id) ??
          null,
      } satisfies StudentAttendanceHistoryItem;
    })
    .filter(
      (
        item
      ): item is StudentAttendanceHistoryItem =>
        item !== null
    )
    .sort((a, b) => {
      const dateComparison =
        b.sessionDate.localeCompare(
          a.sessionDate
        );

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return (b.startsAt ?? "").localeCompare(
        a.startsAt ?? ""
      );
    });
}
