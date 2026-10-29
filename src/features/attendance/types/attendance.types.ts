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