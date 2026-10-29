import { supabase } from "@/lib/supabaseClient";

import type {
  AttendanceCourse,
  AttendanceStudent,
  TeacherAssignmentRole,
  TeacherAttendanceClass,
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