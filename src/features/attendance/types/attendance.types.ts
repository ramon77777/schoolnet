export type TeacherAssignmentRole = "main" | "assistant";

export type AttendanceSessionStatus =
    | "draft"
    | "open"
    | "closed"
    | "cancelled";

export type AttendanceStatus =
    | "present"
    | "absent"
    | "late";

export type AttendanceJustificationStatus =
    | "pending"
    | "approved"
    | "rejected";

export type AttendanceJustificationDecision =
    Exclude<AttendanceJustificationStatus, "pending">;

export type TeacherAttendanceClass = {
    id: string;
    name: string;
    schoolYear: string | null;
    levelId: number;
    assignmentRole: TeacherAssignmentRole;
};

export type AttendanceStudent = {
    id: string;
    fullName: string;
    avatarUrl: string | null;
};

export type AttendanceCourse = {
    id: string;
    title: string;
    classId: string | null;
    status: "active" | "archived";
};

export type AttendanceSession = {
    id: string;
    classId: string;
    courseId: string | null;
    teacherId: string;
    sessionDate: string;
    startsAt: string | null;
    endsAt: string | null;
    status: AttendanceSessionStatus;
    notes: string | null;
    createdBy: string;
    closedBy?: string | null;
    closedAt?: string | null;
};

export type AttendanceRecord = {
    id: string;
    sessionId: string;
    studentId: string;
    status: AttendanceStatus;
    arrivalTime: string | null;
    minutesLate: number;
    comment: string | null;
    markedBy: string;
    markedAt: string;
};

export type CreateAttendanceSessionInput = {
    classId: string;
    courseId?: string | null;
    teacherId: string;
    sessionDate: string;
    startsAt?: string | null;
    endsAt?: string | null;
    notes?: string | null;
};

export type AttendanceRecordDraft = {
    studentId: string;
    status: AttendanceStatus;
    arrivalTime?: string | null;
    minutesLate?: number;
    comment?: string | null;
};

export type StudentAttendanceJustification = {
  id: string;
  attendanceRecordId: string;
  submittedBy: string;
  reason: string;
  status: AttendanceJustificationStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type StudentAttendanceHistoryItem = {
  recordId: string;
  sessionId: string;

  classId: string;
  className: string;

  courseId: string | null;
  courseTitle: string | null;

  sessionDate: string;
  startsAt: string | null;
  endsAt: string | null;

  status: AttendanceStatus;
  arrivalTime: string | null;
  minutesLate: number;
  comment: string | null;
  markedAt: string;

  justification: StudentAttendanceJustification | null;
};

export type TeacherAttendanceJustificationItem = {
  justification: StudentAttendanceJustification;
  session: AttendanceSession;
  record: AttendanceRecord;
};
