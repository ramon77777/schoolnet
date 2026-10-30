import { useMemo, useState } from "react";

import {
  TIMETABLE_WEEK_DAYS,
  type TimetableDayOfWeek,
  type TimetableSlot,
} from "../types/timetable.types";

type TimetableWeeklyViewProps = {
  slots: TimetableSlot[];
  emptyTitle?: string;
  emptyDescription?: string;
};

function formatTime(value: string) {
  if (!value) return "—";

  const [hours = "", minutes = ""] = value.split(":");

  if (!hours || !minutes) {
    return value;
  }

  return `${hours}:${minutes}`;
}

function roomLabel(slot: TimetableSlot) {
  if (slot.roomName && slot.roomCode) {
    return `${slot.roomName} (${slot.roomCode})`;
  }

  if (slot.roomName) {
    return slot.roomName;
  }

  if (slot.roomCode) {
    return slot.roomCode;
  }

  return "Salle non précisée";
}

export default function TimetableWeeklyView({
  slots,
  emptyTitle = "Aucun créneau pour l'instant",
  emptyDescription = "Aucun cours n'est planifié dans votre emploi du temps.",
}: TimetableWeeklyViewProps) {
  const [selectedDay, setSelectedDay] =
    useState<TimetableDayOfWeek | "all">("all");

  const countsByDay = useMemo(() => {
    const counts = new Map<TimetableDayOfWeek, number>();

    for (const day of TIMETABLE_WEEK_DAYS) {
      counts.set(day.value, 0);
    }

    for (const slot of slots) {
      counts.set(
        slot.dayOfWeek,
        (counts.get(slot.dayOfWeek) ?? 0) + 1
      );
    }

    return counts;
  }, [slots]);

  const visibleDays = useMemo(() => {
    if (selectedDay === "all") {
      return TIMETABLE_WEEK_DAYS;
    }

    return TIMETABLE_WEEK_DAYS.filter(
      (day) => day.value === selectedDay
    );
  }, [selectedDay]);

  const totalActiveDays = useMemo(
    () =>
      TIMETABLE_WEEK_DAYS.filter(
        (day) => (countsByDay.get(day.value) ?? 0) > 0
      ).length,
    [countsByDay]
  );

  if (slots.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex min-h-56 flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl">
            📅
          </div>

          <h3 className="text-lg font-bold text-slate-950">
            {emptyTitle}
          </h3>

          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
            {emptyDescription}
          </p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Vue de la semaine
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {slots.length} créneau
              {slots.length > 1 ? "x" : ""} sur{" "}
              {totalActiveDays} jour
              {totalActiveDays > 1 ? "s" : ""}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedDay("all")}
              className={[
                "rounded-full border px-3 py-2 text-xs font-semibold transition",
                selectedDay === "all"
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
              ].join(" ")}
            >
              Toute la semaine ({slots.length})
            </button>

            {TIMETABLE_WEEK_DAYS.map((day) => {
              const count =
                countsByDay.get(day.value) ?? 0;

              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() =>
                    setSelectedDay(day.value)
                  }
                  className={[
                    "rounded-full border px-3 py-2 text-xs font-semibold transition",
                    selectedDay === day.value
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50",
                  ].join(" ")}
                >
                  {day.shortLabel} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {visibleDays.map((day) => {
          const daySlots = slots.filter(
            (slot) => slot.dayOfWeek === day.value
          );

          return (
            <section
              key={day.value}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                    Jour {day.value}
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-slate-950">
                    {day.label}
                  </h3>
                </div>

                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {daySlots.length} cours
                  {daySlots.length > 1 ? "" : ""}
                </span>
              </header>

              {daySlots.length === 0 ? (
                <div className="flex min-h-36 items-center justify-center px-5 py-8 text-center">
                  <div>
                    <div className="text-2xl">☕</div>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      Aucun cours
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Aucun créneau n'est prévu ce jour.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {daySlots.map((slot) => (
                    <article
                      key={slot.id}
                      className="p-5 transition hover:bg-slate-50/80"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                              🕒 {formatTime(slot.startsAt)} —{" "}
                              {formatTime(slot.endsAt)}
                            </span>

                            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              🏫 {slot.className}
                            </span>
                          </div>

                          <h4 className="mt-3 text-base font-bold text-slate-950">
                            {slot.courseTitle}
                          </h4>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
                            <span>
                              👨‍🏫 {slot.teacherName}
                            </span>

                            <span>
                              🚪 {roomLabel(slot)}
                            </span>
                          </div>

                          {slot.notes ? (
                            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                              <span className="font-semibold text-slate-700">
                                Note :
                              </span>{" "}
                              {slot.notes}
                            </div>
                          ) : null}
                        </div>

                        {slot.schoolYearName ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {slot.schoolYearName}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}