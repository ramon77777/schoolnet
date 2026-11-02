import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

import TimetableWeeklyView from "@/features/timetable/components/TimetableWeeklyView";

import {
  getTimetableErrorMessage,
  getVisibleTimetableSlots,
} from "@/features/timetable/lib/timetableApi";

import type {
  TimetableSlot,
} from "@/features/timetable/types/timetable.types";

type ParentProfileRow = {
  id: string;
  child_ids: string[] | null;
};

type ChildProfileRow = {
  id: string;
  full_name: string | null;
};

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string | null;
  school_year: string | null;
};

type ChildView = {
  id: string;
  name: string;
  classId: string | null;
  classLabel: string;
  schoolYear: string | null;
};

function uniqueStrings(
  values: Array<string | null | undefined>
) {
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" &&
          value.trim().length > 0
      )
    )
  );
}

export default function ParentTimetable() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [children, setChildren] =
    useState<ChildView[]>([]);

  const [
    selectedChildId,
    setSelectedChildId,
  ] = useState("");

  const [slots, setSlots] =
    useState<TimetableSlot[]>([]);

  const [
    loadingChildren,
    setLoadingChildren,
  ] = useState(true);

  const [
    loadingTimetable,
    setLoadingTimetable,
  ] = useState(false);

  const [refreshing, setRefreshing] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null);

  /*
   * ========================================================
   * CHARGEMENT DES ENFANTS
   * ========================================================
   */

  const loadChildren = useCallback(
    async () => {
      if (!user || user.isDemo) {
        setChildren([]);
        setSelectedChildId("");
        setSlots([]);
        setErrorMessage(null);
        setLoadingChildren(false);
        return;
      }

      try {
        setLoadingChildren(true);
        setErrorMessage(null);

        /*
         * 1. Profil du parent connecté.
         */

        const {
          data: parentData,
          error: parentError,
        } = await supabase
          .from("profiles")
          .select("id, child_ids")
          .eq("id", user.id)
          .eq("role", "parent")
          .maybeSingle();

        if (parentError) {
          throw parentError;
        }

        const parent =
          parentData as ParentProfileRow | null;

        if (!parent) {
          setChildren([]);
          setSelectedChildId("");
          setSlots([]);

          setErrorMessage(
            "Le profil Parent / Tuteur associé à ce compte est introuvable."
          );

          return;
        }

        const childIds = uniqueStrings(
          parent.child_ids ?? []
        );

        if (childIds.length === 0) {
          setChildren([]);
          setSelectedChildId("");
          setSlots([]);
          return;
        }

        /*
         * 2. Profils enfants.
         */

        const {
          data: childProfilesData,
          error: childProfilesError,
        } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", childIds)
          .eq("role", "student")
          .order("full_name");

        if (childProfilesError) {
          throw childProfilesError;
        }

        const childProfiles =
          (childProfilesData ??
            []) as ChildProfileRow[];

        /*
         * 3. Classes des enfants.
         */

        const {
          data: classStudentsData,
          error: classStudentsError,
        } = await supabase
          .from("class_students")
          .select("student_id, class_id")
          .in("student_id", childIds);

        if (classStudentsError) {
          throw classStudentsError;
        }

        const classStudents =
          (classStudentsData ??
            []) as ClassStudentRow[];

        const classIds = uniqueStrings(
          classStudents.map(
            (row) => row.class_id
          )
        );

        let classRows: ClassRow[] = [];

        if (classIds.length > 0) {
          const {
            data: classesData,
            error: classesError,
          } = await supabase
            .from("classes")
            .select(
              "id, name, school_year"
            )
            .in("id", classIds);

          if (classesError) {
            throw classesError;
          }

          classRows =
            (classesData ??
              []) as ClassRow[];
        }

        const classById = new Map(
          classRows.map((row) => [
            row.id,
            row,
          ])
        );

        const classIdByStudentId =
          new Map<string, string>();

        for (const row of classStudents) {
          if (
            !classIdByStudentId.has(
              row.student_id
            )
          ) {
            classIdByStudentId.set(
              row.student_id,
              row.class_id
            );
          }
        }

        const finalChildren: ChildView[] =
          childProfiles.map(
            (profile) => {
              const classId =
                classIdByStudentId.get(
                  profile.id
                ) ?? null;

              const classRow = classId
                ? classById.get(classId)
                : undefined;

              return {
                id: profile.id,

                name:
                  profile.full_name?.trim() ||
                  "Élève",

                classId,

                classLabel:
                  classRow?.name?.trim() ||
                  "Classe non renseignée",

                schoolYear:
                  classRow?.school_year ??
                  null,
              };
            }
          );

        setChildren(finalChildren);

        setSelectedChildId(
          (current) => {
            const stillExists =
              finalChildren.some(
                (child) =>
                  child.id === current
              );

            if (stillExists) {
              return current;
            }

            return (
              finalChildren[0]?.id ?? ""
            );
          }
        );
      } catch (error) {
        console.error(
          "[ParentTimetable] loadChildren error:",
          error
        );

        setChildren([]);
        setSelectedChildId("");
        setSlots([]);

        setErrorMessage(
          getTimetableErrorMessage(
            error,
            "Impossible de charger les enfants liés à ce compte."
          )
        );
      } finally {
        setLoadingChildren(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadChildren();
  }, [
    authLoading,
    loadChildren,
  ]);

  /*
   * ========================================================
   * ENFANT SÉLECTIONNÉ
   * ========================================================
   */

  const selectedChild = useMemo(
    () =>
      children.find(
        (child) =>
          child.id === selectedChildId
      ) ?? null,
    [
      children,
      selectedChildId,
    ]
  );

  /*
   * ========================================================
   * CHARGEMENT EMPLOI DU TEMPS
   * ========================================================
   */

  const loadTimetable = useCallback(
    async () => {
      if (
        !user ||
        user.isDemo ||
        !selectedChild
      ) {
        setSlots([]);
        setLoadingTimetable(false);
        return;
      }

      if (!selectedChild.classId) {
        setSlots([]);
        setLoadingTimetable(false);
        return;
      }

      try {
        setLoadingTimetable(true);
        setErrorMessage(null);

        /*
         * Le classId sert uniquement de filtre
         * d'affichage.
         *
         * La sécurité réelle reste assurée par
         * la policy RLS de timetable_slots.
         */
        const result =
          await getVisibleTimetableSlots({
            classId:
              selectedChild.classId,
          });

        setSlots(result);
      } catch (error) {
        console.error(
          "[ParentTimetable] loadTimetable error:",
          error
        );

        setSlots([]);

        setErrorMessage(
          getTimetableErrorMessage(
            error,
            "Impossible de charger l'emploi du temps de cet enfant."
          )
        );
      } finally {
        setLoadingTimetable(false);
      }
    },
    [
      selectedChild,
      user,
    ]
  );

  useEffect(() => {
    if (
      authLoading ||
      loadingChildren
    ) {
      return;
    }

    void loadTimetable();
  }, [
    authLoading,
    loadingChildren,
    loadTimetable,
  ]);

  /*
   * ========================================================
   * RAFRAÎCHISSEMENT
   * ========================================================
   */

  const handleRefresh = async () => {
    if (
      !user ||
      user.isDemo ||
      !selectedChild?.classId
    ) {
      return;
    }

    setRefreshing(true);

    try {
      const result =
        await getVisibleTimetableSlots({
          classId:
            selectedChild.classId,
        });

      setSlots(result);
      setErrorMessage(null);
    } catch (error) {
      console.error(
        "[ParentTimetable] refresh error:",
        error
      );

      setErrorMessage(
        getTimetableErrorMessage(
          error,
          "Impossible d'actualiser l'emploi du temps."
        )
      );
    } finally {
      setRefreshing(false);
    }
  };

  /*
   * ========================================================
   * INDICATEURS
   * ========================================================
   */

  const courseCount = useMemo(
    () =>
      new Set(
        slots
          .map(
            (slot) => slot.courseId
          )
          .filter(Boolean)
      ).size,
    [slots]
  );

  const activeDays = useMemo(
    () =>
      new Set(
        slots.map(
          (slot) =>
            slot.dayOfWeek
        )
      ).size,
    [slots]
  );

  const isInitialLoading =
    authLoading || loadingChildren;

  /*
   * ========================================================
   * CHARGEMENT INITIAL
   * ========================================================
   */

  if (isInitialLoading) {
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===================================================
          HERO
          =================================================== */}

      <section className="sn-card p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              👨‍👩‍👧
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Emploi du temps
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-950">
                Planning de mon enfant
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-gray-500">
                Consultez les cours,
                horaires, enseignants et
                salles prévus pour vos
                enfants.
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
              Boolean(user?.isDemo) ||
              !selectedChild?.classId
            }
          >
            {refreshing
              ? "Actualisation..."
              : "↻ Rafraîchir"}
          </button>
        </div>
      </section>

      {/* ===================================================
          MODE DÉMO
          =================================================== */}

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : l'emploi du
          temps Supabase n'est pas chargé.
        </div>
      )}

      {/* ===================================================
          ERREUR
          =================================================== */}

      {errorMessage && (
        <section className="sn-card space-y-3 border border-red-200 bg-red-50 p-5 text-red-700">
          <div className="font-semibold">
            Impossible de charger l'emploi
            du temps
          </div>

          <div className="text-sm">
            {errorMessage}
          </div>

          <button
            type="button"
            className="sn-btn-primary sn-press w-fit"
            onClick={() =>
              void loadChildren()
            }
          >
            Réessayer
          </button>
        </section>
      )}

      {/* ===================================================
          AUCUN ENFANT
          =================================================== */}

      {!errorMessage &&
        children.length === 0 && (
          <section className="sn-card p-8">
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <div className="text-3xl">
                👨‍👩‍👧
              </div>

              <h2 className="mt-4 text-lg font-bold text-gray-950">
                Aucun enfant lié
              </h2>

              <p className="mt-2 max-w-lg text-sm text-gray-500">
                Aucun enfant n'est
                actuellement associé à ce
                compte Parent / Tuteur.
              </p>
            </div>
          </section>
        )}

      {!errorMessage &&
        children.length > 0 && (
          <>
            {/* =============================================
                SÉLECTION ENFANT
                ============================================= */}

            <section>
              <div className="mb-3">
                <h2 className="font-bold text-gray-950">
                  Mes enfants
                </h2>

                <p className="text-sm text-gray-500">
                  Sélectionnez un enfant
                  pour consulter son emploi
                  du temps.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {children.map(
                  (child) => {
                    const selected =
                      child.id ===
                      selectedChildId;

                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() =>
                          setSelectedChildId(
                            child.id
                          )
                        }
                        className={[
                          "sn-card text-left transition",
                          "p-4",
                          selected
                            ? "border-blue-500 bg-blue-600 text-white shadow-md"
                            : "hover:border-blue-200 hover:bg-blue-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={[
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                              selected
                                ? "bg-white/20 text-white"
                                : "bg-blue-50 text-blue-700",
                            ].join(
                              " "
                            )}
                          >
                            {child.name
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-semibold">
                              {child.name}
                            </div>

                            <div
                              className={[
                                "mt-0.5 text-xs",
                                selected
                                  ? "text-blue-100"
                                  : "text-gray-500",
                              ].join(
                                " "
                              )}
                            >
                              {child.classLabel}
                              {child.schoolYear
                                ? ` · ${child.schoolYear}`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </section>

            {/* =============================================
                ENFANT SÉLECTIONNÉ
                ============================================= */}

            {selectedChild && (
              <section>
                <div className="mb-3">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                    Enfant sélectionné
                  </div>

                  <h2 className="mt-1 text-xl font-bold text-gray-950">
                    {selectedChild.name}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    {selectedChild.classLabel}
                    {selectedChild.schoolYear
                      ? ` · ${selectedChild.schoolYear}`
                      : ""}
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
              </section>
            )}

            {/* =============================================
                PLANNING
                ============================================= */}

            {loadingTimetable ? (
              <div className="sn-card h-72 animate-pulse" />
            ) : selectedChild?.classId ? (
              <TimetableWeeklyView
                slots={slots}
                emptyTitle="Aucun cours planifié"
                emptyDescription={`Aucun créneau d'emploi du temps n'est actuellement enregistré pour la classe de ${selectedChild.name}.`}
              />
            ) : (
              <section className="sn-card p-8 text-center">
                <div className="text-3xl">
                  🏫
                </div>

                <h3 className="mt-3 font-bold text-gray-950">
                  Classe non renseignée
                </h3>

                <p className="mt-2 text-sm text-gray-500">
                  Cet enfant n'est
                  actuellement rattaché à
                  aucune classe.
                </p>
              </section>
            )}
          </>
        )}
    </div>
  );
}