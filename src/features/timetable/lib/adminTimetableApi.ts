import { supabase } from "@/lib/supabaseClient";

import {
  getVisibleTimetableRooms,
  getVisibleTimetableSlots,
} from "./timetableApi";

import type {
  TimetableDayOfWeek,
  TimetableRoom,
  TimetableSlot,
} from "../types/timetable.types";

/* ============================================================
   TYPES CATALOGUE
   ============================================================ */

export type AdminTimetableSchoolYearOption = {
  id: string;
  name: string;
  startsOn: string;
  isCurrent: boolean;
};

export type AdminTimetableClassOption = {
  id: string;
  name: string;
  schoolYearId: string | null;
  schoolYearName: string;
};

export type AdminTimetableCourseOption = {
  id: string;
  title: string;
  classId: string | null;
};

export type AdminTimetableTeacherOption = {
  id: string;
  name: string;
};

export type AdminTimetableClassTeacherLink = {
  classId: string;
  teacherId: string;
};

export type AdminTimetableCourseTeacherLink = {
  courseId: string;
  teacherId: string;
};

export type AdminTimetableCatalog = {
  schoolYears: AdminTimetableSchoolYearOption[];
  classes: AdminTimetableClassOption[];
  courses: AdminTimetableCourseOption[];
  teachers: AdminTimetableTeacherOption[];

  classTeachers: AdminTimetableClassTeacherLink[];
  courseTeachers: AdminTimetableCourseTeacherLink[];

  rooms: TimetableRoom[];
};

/* ============================================================
   TYPES ECRITURE CRENEAUX
   ============================================================ */

export type AdminTimetableSlotWriteInput = {
  schoolYearId: string;
  classId: string;
  courseId: string;
  teacherId: string;

  roomId?: string | null;

  dayOfWeek: TimetableDayOfWeek;

  startsAt: string;
  endsAt: string;

  notes?: string | null;
  isActive?: boolean;
};

/* ============================================================
   TYPES ECRITURE SALLES
   ============================================================ */

export type AdminTimetableRoomWriteInput = {
  name: string;

  code?: string | null;
  capacity?: number | null;
  notes?: string | null;

  isActive?: boolean;
};

/* ============================================================
   TYPES DB INTERNES
   ============================================================ */

type DbSchoolYear = {
  id: string;
  name: string;
  starts_on: string;
  is_current: boolean;
};

type DbClass = {
  id: string;
  name: string;
  school_year: string;
  school_year_id: string | null;
};

type DbCourse = {
  id: string;
  title: string;
  class_id: string | null;
};

type DbProfile = {
  id: string;
  full_name: string | null;
};

type DbClassTeacher = {
  class_id: string;
  teacher_id: string;
};

type DbCourseTeacher = {
  course_id: string;
  teacher_id: string;
};

type DbInsertedId = {
  id: string;
};

/* ============================================================
   HELPERS
   ============================================================ */

function nullableText(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const clean = value.trim();

  return clean.length > 0
    ? clean
    : null;
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    return String(
      (error as { code?: unknown }).code ?? ""
    );
  }

  return "";
}

function errorText(error: unknown): string {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return "";
  }

  const candidate = error as {
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };

  return [
    candidate.message,
    candidate.details,
    candidate.hint,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string"
    )
    .join(" ")
    .toLocaleLowerCase("fr");
}

/* ============================================================
   MESSAGE D'ERREUR METIER ADMIN
   ============================================================ */

export function getAdminTimetableErrorMessage(
  error: unknown,
  fallback = "Une erreur est survenue."
): string {
  const code = errorCode(error);
  const text = errorText(error);

  /* ----------------------------------------------------------
     CHEVAUCHEMENTS GiST
     ---------------------------------------------------------- */

  if (
    code === "23P01" &&
    text.includes(
      "timetable_slots_no_class_overlap"
    )
  ) {
    return (
      "Cette classe possède déjà un cours " +
      "sur tout ou partie de cette plage horaire."
    );
  }

  if (
    code === "23P01" &&
    text.includes(
      "timetable_slots_no_teacher_overlap"
    )
  ) {
    return (
      "Cet enseignant possède déjà un cours " +
      "sur tout ou partie de cette plage horaire."
    );
  }

  if (
    code === "23P01" &&
    text.includes(
      "timetable_slots_no_room_overlap"
    )
  ) {
    return (
      "Cette salle est déjà occupée sur tout " +
      "ou partie de cette plage horaire."
    );
  }

  if (code === "23P01") {
    return (
      "Ce créneau entre en conflit avec un autre " +
      "créneau déjà enregistré."
    );
  }

  /* ----------------------------------------------------------
     VALIDATION METIER DU TRIGGER
     ---------------------------------------------------------- */

  if (
    text.includes(
      "timetable_school_year_mismatch"
    )
  ) {
    return (
      "L'année scolaire sélectionnée ne correspond " +
      "pas à celle de la classe."
    );
  }

  if (
    text.includes(
      "timetable_class_without_school_year"
    )
  ) {
    return (
      "Cette classe n'est associée à aucune année scolaire."
    );
  }

  if (
    text.includes(
      "timetable_course_class_mismatch"
    )
  ) {
    return (
      "Le cours sélectionné n'appartient pas à cette classe."
    );
  }

  if (
    text.includes(
      "timetable_inactive_course"
    )
  ) {
    return "Le cours sélectionné est inactif.";
  }

  if (
    text.includes(
      "timetable_invalid_teacher"
    )
  ) {
    return (
      "Le profil sélectionné n'est pas un enseignant valide."
    );
  }

  if (
    text.includes(
      "timetable_teacher_not_assigned_to_course"
    )
  ) {
    return (
      "Cet enseignant n'est pas affecté au cours sélectionné."
    );
  }

  if (
    text.includes(
      "timetable_teacher_not_assigned_to_class"
    )
  ) {
    return (
      "Cet enseignant n'est pas affecté à cette classe."
    );
  }

  if (
    text.includes(
      "timetable_invalid_room"
    )
  ) {
    return "La salle sélectionnée est introuvable.";
  }

  if (
    text.includes(
      "timetable_inactive_room"
    )
  ) {
    return (
      "La salle sélectionnée est actuellement inactive."
    );
  }

  /* ----------------------------------------------------------
     CONTRAINTES SQL
     ---------------------------------------------------------- */

  if (
    code === "23514" &&
    text.includes(
      "timetable_slots_time_valid"
    )
  ) {
    return (
      "L'heure de fin doit être postérieure à l'heure de début."
    );
  }

  if (
    code === "23514" &&
    text.includes(
      "timetable_slots_day_of_week_valid"
    )
  ) {
    return "Le jour sélectionné est invalide.";
  }

  if (
    code === "23505" &&
    (
      text.includes(
        "rooms_name_unique_ci"
      ) ||
      text.includes(
        "rooms_code_unique_ci"
      )
    )
  ) {
    return (
      "Une salle portant ce nom ou ce code existe déjà."
    );
  }

  if (code === "23503") {
    return (
      "Une donnée associée à cette opération " +
      "n'existe plus ou n'est plus valide."
    );
  }

  if (
    code === "42501" ||
    text.includes(
      "row-level security"
    )
  ) {
    return (
      "Cette opération n'est pas autorisée pour ce compte."
    );
  }

  /* ----------------------------------------------------------
     MESSAGE ORIGINAL SI DISPONIBLE
     ---------------------------------------------------------- */

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    const message = (
      error as { message?: unknown }
    ).message;

    if (
      typeof message === "string" &&
      message.trim()
    ) {
      return message;
    }
  }

  return fallback;
}

/* ============================================================
   LECTURE ADMIN DES CRENEAUX
   ============================================================ */

export async function getAdminTimetableSlots():
Promise<TimetableSlot[]> {
  return getVisibleTimetableSlots({
    includeInactive: true,
  });
}

/* ============================================================
   CATALOGUE NECESSAIRE AUX FORMULAIRES
   ============================================================ */

export async function getAdminTimetableCatalog():
Promise<AdminTimetableCatalog> {
  const [
    schoolYearsResult,
    classesResult,
    coursesResult,
    teachersResult,
    classTeachersResult,
    courseTeachersResult,
    rooms,
  ] = await Promise.all([
    supabase
      .from("school_years")
      .select(
        `
        id,
        name,
        starts_on,
        is_current
        `
      )
      .order(
        "starts_on",
        {
          ascending: false,
        }
      ),

    supabase
      .from("classes")
      .select(
        `
        id,
        name,
        school_year,
        school_year_id
        `
      )
      .order(
        "school_year",
        {
          ascending: false,
        }
      )
      .order(
        "name",
        {
          ascending: true,
        }
      ),

    supabase
      .from("courses")
      .select(
        `
        id,
        title,
        class_id
        `
      )
      .eq(
        "status",
        "active"
      )
      .order(
        "title",
        {
          ascending: true,
        }
      ),

    supabase
      .from("profiles")
      .select(
        `
        id,
        full_name
        `
      )
      .eq(
        "role",
        "teacher"
      )
      .order(
        "full_name",
        {
          ascending: true,
        }
      ),

    supabase
      .from("class_teachers")
      .select(
        `
        class_id,
        teacher_id
        `
      ),

    supabase
      .from("course_teachers")
      .select(
        `
        course_id,
        teacher_id
        `
      ),

    getVisibleTimetableRooms(),
  ]);

  if (schoolYearsResult.error) {
    throw schoolYearsResult.error;
  }

  if (classesResult.error) {
    throw classesResult.error;
  }

  if (coursesResult.error) {
    throw coursesResult.error;
  }

  if (teachersResult.error) {
    throw teachersResult.error;
  }

  if (classTeachersResult.error) {
    throw classTeachersResult.error;
  }

  if (courseTeachersResult.error) {
    throw courseTeachersResult.error;
  }

  const schoolYears =
    (schoolYearsResult.data ??
      []) as DbSchoolYear[];

  const classes =
    (classesResult.data ??
      []) as DbClass[];

  const courses =
    (coursesResult.data ??
      []) as DbCourse[];

  const teachers =
    (teachersResult.data ??
      []) as DbProfile[];

  const classTeachers =
    (classTeachersResult.data ??
      []) as DbClassTeacher[];

  const courseTeachers =
    (courseTeachersResult.data ??
      []) as DbCourseTeacher[];

  return {
    schoolYears:
      schoolYears.map(
        (
          item
        ): AdminTimetableSchoolYearOption => ({
          id: item.id,
          name: item.name,
          startsOn: item.starts_on,
          isCurrent: item.is_current,
        })
      ),

    classes:
      classes.map(
        (
          item
        ): AdminTimetableClassOption => ({
          id: item.id,
          name: item.name,
          schoolYearId:
            item.school_year_id,
          schoolYearName:
            item.school_year,
        })
      ),

    courses:
      courses.map(
        (
          item
        ): AdminTimetableCourseOption => ({
          id: item.id,
          title:
            item.title?.trim() ||
            "Cours sans titre",
          classId:
            item.class_id,
        })
      ),

    teachers:
      teachers.map(
        (
          item
        ): AdminTimetableTeacherOption => ({
          id: item.id,
          name:
            item.full_name?.trim() ||
            "Enseignant sans nom",
        })
      ),

    classTeachers:
      classTeachers.map(
        (
          item
        ): AdminTimetableClassTeacherLink => ({
          classId:
            item.class_id,
          teacherId:
            item.teacher_id,
        })
      ),

    courseTeachers:
      courseTeachers.map(
        (
          item
        ): AdminTimetableCourseTeacherLink => ({
          courseId:
            item.course_id,
          teacherId:
            item.teacher_id,
        })
      ),

    rooms,
  };
}

/* ============================================================
   CREATION D'UN CRENEAU
   ============================================================ */

export async function createAdminTimetableSlot(
  input: AdminTimetableSlotWriteInput
): Promise<string> {
  const {
    data,
    error,
  } = await supabase
    .from("timetable_slots")
    .insert({
      school_year_id:
        input.schoolYearId,

      class_id:
        input.classId,

      course_id:
        input.courseId,

      teacher_id:
        input.teacherId,

      room_id:
        input.roomId || null,

      day_of_week:
        input.dayOfWeek,

      starts_at:
        input.startsAt,

      ends_at:
        input.endsAt,

      notes:
        nullableText(input.notes),

      is_active:
        input.isActive ?? true,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const inserted =
    data as DbInsertedId | null;

  if (!inserted?.id) {
    throw new Error(
      "Le créneau a été créé mais son identifiant n'a pas été retourné."
    );
  }

  return inserted.id;
}

/* ============================================================
   MODIFICATION D'UN CRENEAU
   ============================================================ */

export async function updateAdminTimetableSlot(
  slotId: string,
  input: AdminTimetableSlotWriteInput
): Promise<void> {
  const {
    data,
    error,
  } = await supabase
    .from("timetable_slots")
    .update({
      school_year_id:
        input.schoolYearId,

      class_id:
        input.classId,

      course_id:
        input.courseId,

      teacher_id:
        input.teacherId,

      room_id:
        input.roomId || null,

      day_of_week:
        input.dayOfWeek,

      starts_at:
        input.startsAt,

      ends_at:
        input.endsAt,

      notes:
        nullableText(input.notes),

      is_active:
        input.isActive ?? true,
    })
    .eq(
      "id",
      slotId
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const updated =
    data as DbInsertedId | null;

  if (!updated?.id) {
    throw new Error(
      "Le créneau est introuvable ou n'a pas pu être modifié."
    );
  }
}

/* ============================================================
   ACTIVATION / DESACTIVATION D'UN CRENEAU
   ============================================================ */

export async function setAdminTimetableSlotActive(
  slotId: string,
  isActive: boolean
): Promise<void> {
  const {
    data,
    error,
  } = await supabase
    .from("timetable_slots")
    .update({
      is_active: isActive,
    })
    .eq(
      "id",
      slotId
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const updated =
    data as DbInsertedId | null;

  if (!updated?.id) {
    throw new Error(
      "Le créneau est introuvable ou n'a pas pu être modifié."
    );
  }
}

/* ============================================================
   SUPPRESSION D'UN CRENEAU
   ============================================================ */

export async function deleteAdminTimetableSlot(
  slotId: string
): Promise<void> {
  const {
    data,
    error,
  } = await supabase
    .from("timetable_slots")
    .delete()
    .eq(
      "id",
      slotId
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const deleted =
    data as DbInsertedId | null;

  if (!deleted?.id) {
    throw new Error(
      "Le créneau est introuvable ou n'a pas pu être supprimé."
    );
  }
}

/* ============================================================
   CREATION D'UNE SALLE
   ============================================================ */

export async function createAdminTimetableRoom(
  input: AdminTimetableRoomWriteInput
): Promise<string> {
  const cleanName =
    input.name.trim();

  if (!cleanName) {
    throw new Error(
      "Le nom de la salle est obligatoire."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("rooms")
    .insert({
      name:
        cleanName,

      code:
        nullableText(input.code),

      capacity:
        input.capacity ?? null,

      notes:
        nullableText(input.notes),

      is_active:
        input.isActive ?? true,
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  const inserted =
    data as DbInsertedId | null;

  if (!inserted?.id) {
    throw new Error(
      "La salle a été créée mais son identifiant n'a pas été retourné."
    );
  }

  return inserted.id;
}

/* ============================================================
   MODIFICATION D'UNE SALLE
   ============================================================ */

export async function updateAdminTimetableRoom(
  roomId: string,
  input: AdminTimetableRoomWriteInput
): Promise<void> {
  const cleanName =
    input.name.trim();

  if (!cleanName) {
    throw new Error(
      "Le nom de la salle est obligatoire."
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("rooms")
    .update({
      name:
        cleanName,

      code:
        nullableText(input.code),

      capacity:
        input.capacity ?? null,

      notes:
        nullableText(input.notes),

      is_active:
        input.isActive ?? true,
    })
    .eq(
      "id",
      roomId
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const updated =
    data as DbInsertedId | null;

  if (!updated?.id) {
    throw new Error(
      "La salle est introuvable ou n'a pas pu être modifiée."
    );
  }
}

/* ============================================================
   ACTIVATION / DESACTIVATION D'UNE SALLE
   ============================================================ */

export async function setAdminTimetableRoomActive(
  roomId: string,
  isActive: boolean
): Promise<void> {
  const {
    data,
    error,
  } = await supabase
    .from("rooms")
    .update({
      is_active: isActive,
    })
    .eq(
      "id",
      roomId
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const updated =
    data as DbInsertedId | null;

  if (!updated?.id) {
    throw new Error(
      "La salle est introuvable ou n'a pas pu être modifiée."
    );
  }
}

/* ============================================================
   SUPPRESSION D'UNE SALLE
   ============================================================ */

export async function deleteAdminTimetableRoom(
  roomId: string
): Promise<void> {
  const {
    data,
    error,
  } = await supabase
    .from("rooms")
    .delete()
    .eq(
      "id",
      roomId
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  const deleted =
    data as DbInsertedId | null;

  if (!deleted?.id) {
    throw new Error(
      "La salle est introuvable ou n'a pas pu être supprimée."
    );
  }
}