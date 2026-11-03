import { useCallback, useEffect, useMemo, useState } from "react";

import TimetableWeeklyView from "@/features/timetable/components/TimetableWeeklyView";
import {
  getTimetableErrorMessage,
  getVisibleTimetableSlots,
} from "@/features/timetable/lib/timetableApi";
import type { TimetableSlot } from "@/features/timetable/types/timetable.types";

export default function TeacherTimetable() {
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const loadInitialData = useCallback(async () => {
    try {
      const result = await getVisibleTimetableSlots();

      setSlots(result);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        getTimetableErrorMessage(
          error,
          "Impossible de charger votre emploi du temps."
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      const result = await getVisibleTimetableSlots();

      setSlots(result);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        getTimetableErrorMessage(
          error,
          "Impossible d'actualiser votre emploi du temps."
        )
      );
    } finally {
      setRefreshing(false);
    }
  };

  const classes = useMemo(
    () =>
      Array.from(
        new Set(
          slots
            .map((slot) => slot.className)
            .filter(Boolean)
        )
      ),
    [slots]
  );

  const courses = useMemo(
    () =>
      new Set(
        slots
          .map((slot) => slot.courseId)
          .filter(Boolean)
      ).size,
    [slots]
  );

  const activeDays = useMemo(
    () =>
      new Set(
        slots.map((slot) => slot.dayOfWeek)
      ).size,
    [slots]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <section className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-40 rounded bg-slate-200" />
          <div className="mt-3 h-8 w-72 rounded bg-slate-200" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-slate-100" />
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
            />
          ))}
        </div>

        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-blue-50/50 p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-sm">
              📅
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Emploi du temps
              </p>

              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Mon planning
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Consultez vos cours planifiés, vos classes,
                les horaires et les salles qui vous sont
                affectés.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing
              ? "Actualisation..."
              : "↻ Rafraîchir"}
          </button>
        </div>
      </section>

      {errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          <div className="flex items-start gap-3">
            <span>⚠️</span>

            <div>
              <p className="font-bold">
                Impossible de charger le planning
              </p>

              <p className="mt-1">
                {errorMessage}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-950">
            Mon activité planifiée
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Les indicateurs sont calculés à partir des
            créneaux visibles dans votre compte.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Créneaux
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {slots.length}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl">
                📚
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Cours
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {courses}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                📖
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Jours occupés
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {activeDays}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl">
                🗓️
              </div>
            </div>
          </article>
        </div>

        {classes.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Classes :
            </span>

            {classes.map((className) => (
              <span
                key={className}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
              >
                {className}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <TimetableWeeklyView
        slots={slots}
        emptyTitle="Aucun cours planifié"
        emptyDescription="Aucun créneau d'emploi du temps ne vous est actuellement affecté. Dès qu'un créneau sera ajouté par l'administration, il apparaîtra ici."
      />
    </div>
  );
}