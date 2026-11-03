import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import TimetableWeeklyView from "@/features/timetable/components/TimetableWeeklyView";

import {
  getTimetableErrorMessage,
  getVisibleTimetableSlots,
} from "@/features/timetable/lib/timetableApi";

import type {
  TimetableSlot,
} from "@/features/timetable/types/timetable.types";

import { useAuth } from "@/lib/auth/AuthProvider";

export default function StudentTimetable() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [slots, setSlots] = useState<
    TimetableSlot[]
  >([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const loadTimetable =
    useCallback(async () => {
      if (!user || user.isDemo) {
        setSlots([]);
        setLoading(false);
        setErrorMessage(null);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage(null);

        /*
         * Aucun classId n'est envoyé ici.
         *
         * La policy RLS de timetable_slots
         * détermine automatiquement les créneaux
         * que l'apprenant connecté peut consulter.
         */
        const result =
          await getVisibleTimetableSlots();

        setSlots(result);
      } catch (error) {
        console.error(
          "[StudentTimetable] loadTimetable error:",
          error
        );

        setSlots([]);

        setErrorMessage(
          getTimetableErrorMessage(
            error,
            "Impossible de charger ton emploi du temps."
          )
        );
      } finally {
        setLoading(false);
      }
    }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadTimetable();
  }, [
    authLoading,
    loadTimetable,
  ]);

  const handleRefresh = async () => {
    if (!user || user.isDemo) {
      return;
    }

    setRefreshing(true);

    try {
      const result =
        await getVisibleTimetableSlots();

      setSlots(result);
      setErrorMessage(null);
    } catch (error) {
      console.error(
        "[StudentTimetable] refresh error:",
        error
      );

      setErrorMessage(
        getTimetableErrorMessage(
          error,
          "Impossible d'actualiser ton emploi du temps."
        )
      );
    } finally {
      setRefreshing(false);
    }
  };

  const courseCount = useMemo(
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
        slots.map(
          (slot) => slot.dayOfWeek
        )
      ).size,
    [slots]
  );

  const classes = useMemo(
    () =>
      Array.from(
        new Set(
          slots
            .map(
              (slot) =>
                slot.className
            )
            .filter(Boolean)
        )
      ),
    [slots]
  );

  const isLoading =
    authLoading || loading;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <section className="sn-card animate-pulse p-6 lg:p-7">
          <div className="h-4 w-40 rounded bg-gray-200" />

          <div className="mt-3 h-8 w-72 rounded bg-gray-200" />

          <div className="mt-3 h-4 w-96 max-w-full rounded bg-gray-100" />
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(
            (item) => (
              <div
                key={item}
                className="sn-card h-24 animate-pulse"
              />
            )
          )}
        </div>

        <div className="sn-card h-80 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* =====================================================
          HERO
          ===================================================== */}

      <section className="sn-card p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              📅
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Emploi du temps
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-950">
                Mon emploi du temps
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-gray-500">
                Consulte tes cours,
                horaires, enseignants et
                salles prévus pour ta classe.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="sn-btn-ghost sn-press"
            onClick={() =>
              void handleRefresh()
            }
            disabled={
              refreshing ||
              Boolean(user?.isDemo)
            }
          >
            {refreshing
              ? "Actualisation..."
              : "↻ Rafraîchir"}
          </button>
        </div>
      </section>

      {/* =====================================================
          MODE DEMO
          ===================================================== */}

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : l'emploi du
          temps Supabase n'est pas chargé.
        </div>
      )}

      {/* =====================================================
          ERREUR
          ===================================================== */}

      {errorMessage && (
        <section className="sn-card space-y-3 border border-red-200 bg-red-50 p-5 text-red-700">
          <div className="font-semibold">
            Impossible de charger ton
            emploi du temps
          </div>

          <div className="text-sm">
            {errorMessage}
          </div>

          <button
            type="button"
            className="sn-btn-primary sn-press w-fit"
            onClick={() =>
              void loadTimetable()
            }
          >
            Réessayer
          </button>
        </section>
      )}

      {!errorMessage && (
        <>
          {/* =================================================
              INDICATEURS
              ================================================= */}

          <section>
            <div className="mb-3">
              <h2 className="font-bold text-gray-950">
                Ma semaine
              </h2>

              <p className="text-sm text-gray-500">
                Les indicateurs sont
                calculés à partir des
                créneaux de ta classe.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <article className="sn-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">
                      Créneaux
                    </div>

                    <div className="mt-1 text-2xl font-bold text-gray-950">
                      {slots.length}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-xl">
                    🗂️
                  </div>
                </div>
              </article>

              <article className="sn-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">
                      Cours
                    </div>

                    <div className="mt-1 text-2xl font-bold text-gray-950">
                      {courseCount}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                    📖
                  </div>
                </div>
              </article>

              <article className="sn-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">
                      Jours de cours
                    </div>

                    <div className="mt-1 text-2xl font-bold text-gray-950">
                      {activeDays}
                    </div>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-xl">
                    📅
                  </div>
                </div>
              </article>
            </div>

            {classes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Ma classe :
                </span>

                {classes.map(
                  (className) => (
                    <span
                      key={className}
                      className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                    >
                      {className}
                    </span>
                  )
                )}
              </div>
            )}
          </section>

          {/* =================================================
              PLANNING
              ================================================= */}

          <TimetableWeeklyView
            slots={slots}
            emptyTitle="Aucun cours planifié"
            emptyDescription="Aucun créneau d'emploi du temps n'est actuellement enregistré pour ta classe. Dès que l'administration publiera des créneaux, ils apparaîtront ici."
          />
        </>
      )}
    </div>
  );
}