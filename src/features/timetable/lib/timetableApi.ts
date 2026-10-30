import { supabase } from "@/lib/supabaseClient";

import type {
  TimetableDayOfWeek,
  TimetableRoom,
  TimetableSlot,
  TimetableSlotFilters,
} from "../types/timetable.types";

type DbTimetableSlot = {
  id: string;

  school_year_id: string;
  class_id: string;
  course_id: string;
  teacher_id: string;
  room_id: string | null;

  day_of_week: number;

  starts_at: string;
  ends_at: string;

  notes: string | null;
  is_active: boolean;

  created_by: string;
  created_at: string;
  updated_at: string;
};

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

type DbRoom = {
  id: string;
  name: string;
  code: string | null;
  capacity: number | null;
  notes: string | null;
  is_active: boolean;
};

type DbSchoolYear = {
  id: string;
  name: string;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0
      )
    )
  );
}

export function getTimetableErrorMessage(
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

function isTimetableDayOfWeek(
  value: number
): value is TimetableDayOfWeek {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 7
  );
}

async function loadClasses(
  ids: string[]
): Promise<Map<string, DbClass>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("classes")
    .select("id, name, school_year")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbClass[];

  return new Map(
    rows.map((row) => [row.id, row])
  );
}

async function loadCourses(
  ids: string[]
): Promise<Map<string, DbCourse>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("courses")
    .select("id, title")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbCourse[];

  return new Map(
    rows.map((row) => [row.id, row])
  );
}

async function loadTeachers(
  ids: string[]
): Promise<Map<string, DbProfile>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbProfile[];

  return new Map(
    rows.map((row) => [row.id, row])
  );
}

async function loadRooms(
  ids: string[]
): Promise<Map<string, DbRoom>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("rooms")
    .select(
      `
      id,
      name,
      code,
      capacity,
      notes,
      is_active
      `
    )
    .in("id", ids);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbRoom[];

  return new Map(
    rows.map((row) => [row.id, row])
  );
}

async function loadSchoolYears(
  ids: string[]
): Promise<Map<string, DbSchoolYear>> {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("school_years")
    .select("id, name")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbSchoolYear[];

  return new Map(
    rows.map((row) => [row.id, row])
  );
}

/**
 * Retourne les créneaux visibles par l'utilisateur connecté.
 *
 * IMPORTANT :
 * cette fonction ne constitue pas le verrou de sécurité.
 * La visibilité réelle est contrôlée par les policies RLS
 * de public.timetable_slots.
 *
 * Cela permet d'utiliser la même API pour :
 * - admin ;
 * - enseignant ;
 * - apprenant ;
 * - parent.
 */
export async function getVisibleTimetableSlots(
  filters: TimetableSlotFilters = {}
): Promise<TimetableSlot[]> {
  let query = supabase
    .from("timetable_slots")
    .select(
      `
      id,
      school_year_id,
      class_id,
      course_id,
      teacher_id,
      room_id,
      day_of_week,
      starts_at,
      ends_at,
      notes,
      is_active,
      created_by,
      created_at,
      updated_at
      `
    );

  if (!filters.includeInactive) {
    query = query.eq("is_active", true);
  }

  if (filters.schoolYearId) {
    query = query.eq(
      "school_year_id",
      filters.schoolYearId
    );
  }

  if (filters.classId) {
    query = query.eq(
      "class_id",
      filters.classId
    );
  }

  if (filters.teacherId) {
    query = query.eq(
      "teacher_id",
      filters.teacherId
    );
  }

  if (filters.courseId) {
    query = query.eq(
      "course_id",
      filters.courseId
    );
  }

  if (filters.roomId) {
    query = query.eq(
      "room_id",
      filters.roomId
    );
  }

  if (filters.dayOfWeek) {
    query = query.eq(
      "day_of_week",
      filters.dayOfWeek
    );
  }

  const { data, error } = await query
    .order("day_of_week", {
      ascending: true,
    })
    .order("starts_at", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  const slots = (data ?? []) as DbTimetableSlot[];

  if (slots.length === 0) {
    return [];
  }

  const classIds = uniqueStrings(
    slots.map((slot) => slot.class_id)
  );

  const courseIds = uniqueStrings(
    slots.map((slot) => slot.course_id)
  );

  const teacherIds = uniqueStrings(
    slots.map((slot) => slot.teacher_id)
  );

  const roomIds = uniqueStrings(
    slots.map((slot) => slot.room_id)
  );

  const schoolYearIds = uniqueStrings(
    slots.map((slot) => slot.school_year_id)
  );

  const [
    classesById,
    coursesById,
    teachersById,
    roomsById,
    schoolYearsById,
  ] = await Promise.all([
    loadClasses(classIds),
    loadCourses(courseIds),
    loadTeachers(teacherIds),
    loadRooms(roomIds),
    loadSchoolYears(schoolYearIds),
  ]);

  return slots
    .map((slot): TimetableSlot | null => {
      if (!isTimetableDayOfWeek(slot.day_of_week)) {
        return null;
      }

      const classRow =
        classesById.get(slot.class_id) ?? null;

      const courseRow =
        coursesById.get(slot.course_id) ?? null;

      const teacherRow =
        teachersById.get(slot.teacher_id) ?? null;

      const roomRow = slot.room_id
        ? roomsById.get(slot.room_id) ?? null
        : null;

      const schoolYearRow =
        schoolYearsById.get(slot.school_year_id) ?? null;

      return {
        id: slot.id,

        schoolYearId: slot.school_year_id,
        schoolYearName:
          schoolYearRow?.name ??
          classRow?.school_year ??
          null,

        classId: slot.class_id,
        className:
          classRow?.name?.trim() ||
          "Classe",

        courseId: slot.course_id,
        courseTitle:
          courseRow?.title?.trim() ||
          "Cours",

        teacherId: slot.teacher_id,
        teacherName:
          teacherRow?.full_name?.trim() ||
          "Enseignant",

        roomId: slot.room_id,
        roomName:
          roomRow?.name?.trim() || null,
        roomCode:
          roomRow?.code?.trim() || null,

        dayOfWeek: slot.day_of_week,
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,

        notes: slot.notes,
        isActive: slot.is_active,

        createdBy: slot.created_by,
        createdAt: slot.created_at,
        updatedAt: slot.updated_at,
      };
    })
    .filter(
      (slot): slot is TimetableSlot =>
        slot !== null
    );
}

/**
 * Retourne les salles visibles par l'utilisateur connecté.
 *
 * Pour l'instant cette fonction est surtout préparée pour
 * l'administration. Les droits réels restent assurés par RLS.
 */
export async function getVisibleTimetableRooms(): Promise<
  TimetableRoom[]
> {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      `
      id,
      name,
      code,
      capacity,
      notes,
      is_active
      `
    )
    .order("name", {
      ascending: true,
    });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as DbRoom[];

  return rows.map(
    (room): TimetableRoom => ({
      id: room.id,
      name:
        room.name?.trim() ||
        "Salle sans nom",
      code:
        room.code?.trim() || null,
      capacity: room.capacity,
      notes: room.notes,
      isActive: room.is_active,
    })
  );
}