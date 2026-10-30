export type TimetableDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type TimetableUserRole =
  | "admin"
  | "teacher"
  | "student"
  | "parent";

export type TimetableRoom = {
  id: string;
  name: string;
  code: string | null;
  capacity: number | null;
  notes: string | null;
  isActive: boolean;
};

export type TimetableSlot = {
  id: string;

  schoolYearId: string;
  schoolYearName: string | null;

  classId: string;
  className: string;

  courseId: string;
  courseTitle: string;

  teacherId: string;
  teacherName: string;

  roomId: string | null;
  roomName: string | null;
  roomCode: string | null;

  dayOfWeek: TimetableDayOfWeek;
  startsAt: string;
  endsAt: string;

  notes: string | null;
  isActive: boolean;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type TimetableSlotFilters = {
  schoolYearId?: string | null;
  classId?: string | null;
  teacherId?: string | null;
  courseId?: string | null;
  roomId?: string | null;
  dayOfWeek?: TimetableDayOfWeek | null;

  /**
   * false par défaut :
   * les pages normales n'affichent que les créneaux actifs.
   *
   * true sera principalement utile à l'administration.
   */
  includeInactive?: boolean;
};

export type TimetableWeekDay = {
  value: TimetableDayOfWeek;
  label: string;
  shortLabel: string;
};

export const TIMETABLE_WEEK_DAYS: TimetableWeekDay[] = [
  {
    value: 1,
    label: "Lundi",
    shortLabel: "Lun.",
  },
  {
    value: 2,
    label: "Mardi",
    shortLabel: "Mar.",
  },
  {
    value: 3,
    label: "Mercredi",
    shortLabel: "Mer.",
  },
  {
    value: 4,
    label: "Jeudi",
    shortLabel: "Jeu.",
  },
  {
    value: 5,
    label: "Vendredi",
    shortLabel: "Ven.",
  },
  {
    value: 6,
    label: "Samedi",
    shortLabel: "Sam.",
  },
  {
    value: 7,
    label: "Dimanche",
    shortLabel: "Dim.",
  },
];

export function getTimetableDayLabel(
  dayOfWeek: TimetableDayOfWeek
): string {
  return (
    TIMETABLE_WEEK_DAYS.find(
      (day) => day.value === dayOfWeek
    )?.label ?? `Jour ${dayOfWeek}`
  );
}

export function getTimetableDayShortLabel(
  dayOfWeek: TimetableDayOfWeek
): string {
  return (
    TIMETABLE_WEEK_DAYS.find(
      (day) => day.value === dayOfWeek
    )?.shortLabel ?? `J${dayOfWeek}`
  );
}