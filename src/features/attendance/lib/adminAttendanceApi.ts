import { supabase } from "@/lib/supabaseClient";

import type {
  AttendanceJustificationStatus,
  AttendanceSessionStatus,
} from "../types/attendance.types";

type DbRelation<T> = T | T[] | null;

type DbClass = {
  id: string;
  name: string;
  school_year: string | null;
};

type DbCourse = {
  id: string;
  title: string;
};

type DbProfile = {
  id: string;
  full_name: string | null;
};

type DbSession = {
  id: string;
  class_id: string;
  course_id: string | null;
  teacher_id: string;
  session_date: string;
  starts_at: string | null;
  ends_at: string | null;
  status: AttendanceSessionStatus;
  notes: string | null;
  closed_at: string | null;

  classes: DbRelation<DbClass>;
  courses: DbRelation<DbCourse>;
  teacher: DbRelation<DbProfile>;
};

type DbRecord = {
  id: string;
  session_id: string;
  student_id: string;
  status: "present" | "absent" | "late";

  student: DbRelation<DbProfile>;
};

type DbJustification = {
  id: string;
  attendance_record_id: string;
  submitted_by: string;
  reason: string;
  status: AttendanceJustificationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

export type AdminAttendanceSessionItem = {
  id: string;

  classId: string;
  className: string;
  schoolYear: string | null;

  courseId: string | null;
  courseTitle: string | null;

  teacherId: string;
  teacherName: string;

  sessionDate: string;
  startsAt: string | null;
  endsAt: string | null;

  status: AttendanceSessionStatus;
  notes: string | null;
  closedAt: string | null;

  presentCount: number;
  absentCount: number;
  lateCount: number;
  totalCount: number;
};

export type AdminAttendanceJustificationItem = {
  id: string;
  attendanceRecordId: string;

  sessionId: string;

  studentId: string;
  studentName: string;

  className: string;
  courseTitle: string | null;
  teacherName: string;

  reason: string;
  status: AttendanceJustificationStatus;

  reviewNote: string | null;
  reviewedAt: string | null;

  createdAt: string;
};

export type AdminAttendanceOverview = {
  sessions: AdminAttendanceSessionItem[];
  justifications: AdminAttendanceJustificationItem[];
};

function normalizeRelation<T>(
  relation: DbRelation<T> | undefined
): T | null {
  if (!relation) {
    return null;
  }

  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation;
}

export async function getAdminAttendanceOverview(): Promise<AdminAttendanceOverview> {
  const [
    sessionsResult,
    recordsResult,
    justificationsResult,
  ] = await Promise.all([
    supabase
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
        closed_at,

        classes!attendance_sessions_class_id_fkey (
          id,
          name,
          school_year
        ),

        courses!attendance_sessions_course_id_fkey (
          id,
          title
        ),

        teacher:profiles!attendance_sessions_teacher_id_fkey (
          id,
          full_name
        )
        `
      )
      .order("session_date", {
        ascending: false,
      })
      .order("starts_at", {
        ascending: false,
        nullsFirst: false,
      }),

    supabase
      .from("attendance_records")
      .select(
        `
        id,
        session_id,
        student_id,
        status,

        student:profiles!attendance_records_student_id_fkey (
          id,
          full_name
        )
        `
      ),

    supabase
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
      .order("created_at", {
        ascending: false,
      }),
  ]);

  if (sessionsResult.error) {
    throw sessionsResult.error;
  }

  if (recordsResult.error) {
    throw recordsResult.error;
  }

  if (justificationsResult.error) {
    throw justificationsResult.error;
  }

  const sessions = (sessionsResult.data ?? []) as unknown as DbSession[];
  const records = (recordsResult.data ?? []) as unknown as DbRecord[];
  const justifications = (justificationsResult.data ?? []) as DbJustification[];

  const recordsBySession = new Map<string, DbRecord[]>();

  for (const record of records) {
    const current = recordsBySession.get(record.session_id) ?? [];

    current.push(record);

    recordsBySession.set(record.session_id, current);
  }

  const sessionItems: AdminAttendanceSessionItem[] = sessions.map(
    (session) => {
      const classRow = normalizeRelation(session.classes);
      const course = normalizeRelation(session.courses);
      const teacher = normalizeRelation(session.teacher);

      const sessionRecords =
        recordsBySession.get(session.id) ?? [];

      const presentCount = sessionRecords.filter(
        (record) => record.status === "present"
      ).length;

      const absentCount = sessionRecords.filter(
        (record) => record.status === "absent"
      ).length;

      const lateCount = sessionRecords.filter(
        (record) => record.status === "late"
      ).length;

      return {
        id: session.id,

        classId: session.class_id,
        className:
          classRow?.name?.trim() ||
          "Classe non renseignée",

        schoolYear:
          classRow?.school_year ?? null,

        courseId: session.course_id,
        courseTitle:
          course?.title?.trim() || null,

        teacherId: session.teacher_id,
        teacherName:
          teacher?.full_name?.trim() ||
          "Enseignant non renseigné",

        sessionDate: session.session_date,
        startsAt: session.starts_at,
        endsAt: session.ends_at,

        status: session.status,
        notes: session.notes,
        closedAt: session.closed_at,

        presentCount,
        absentCount,
        lateCount,
        totalCount:
          presentCount +
          absentCount +
          lateCount,
      };
    }
  );

  const sessionById = new Map(
    sessionItems.map((session) => [
      session.id,
      session,
    ])
  );

  const recordById = new Map(
    records.map((record) => [
      record.id,
      record,
    ])
  );

  const justificationItems =
    justifications
      .map((justification) => {
        const record = recordById.get(
          justification.attendance_record_id
        );

        if (!record) {
          return null;
        }

        const session = sessionById.get(
          record.session_id
        );

        if (!session) {
          return null;
        }

        const student =
          normalizeRelation(record.student);

        return {
          id: justification.id,

          attendanceRecordId:
            justification.attendance_record_id,

          sessionId: record.session_id,

          studentId: record.student_id,
          studentName:
            student?.full_name?.trim() ||
            "Apprenant non renseigné",

          className: session.className,
          courseTitle: session.courseTitle,
          teacherName: session.teacherName,

          reason: justification.reason,
          status: justification.status,

          reviewNote:
            justification.review_note,

          reviewedAt:
            justification.reviewed_at,

          createdAt:
            justification.created_at,
        } satisfies AdminAttendanceJustificationItem;
      })
      .filter(
        (
          item
        ): item is AdminAttendanceJustificationItem =>
          item !== null
      );

  return {
    sessions: sessionItems,
    justifications: justificationItems,
  };
}