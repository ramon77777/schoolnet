import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import AdminTimetableSlotCreateForm from "@/features/timetable/components/AdminTimetableSlotCreateForm";
import TimetableWeeklyView from "@/features/timetable/components/TimetableWeeklyView";

import {
  deleteAdminTimetableSlot,
  getAdminTimetableCatalog,
  getAdminTimetableErrorMessage,
  getAdminTimetableSlots,
  setAdminTimetableSlotActive,
  type AdminTimetableCatalog,
} from "@/features/timetable/lib/adminTimetableApi";

import type {
  TimetableSlot,
} from "@/features/timetable/types/timetable.types";

type StatusFilter =
  | "active"
  | "inactive";

const EMPTY_CATALOG: AdminTimetableCatalog = {
  schoolYears: [],
  classes: [],
  courses: [],
  teachers: [],
  classTeachers: [],
  courseTeachers: [],
  rooms: [],
};

export default function AdminTimetable() {
  /*
   * ========================================================
   * DONNEES
   * ========================================================
   */

  const [
    slots,
    setSlots,
  ] = useState<
    TimetableSlot[]
  >([]);

  const [
    catalog,
    setCatalog,
  ] = useState<AdminTimetableCatalog>(
    EMPTY_CATALOG
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(null);

  /*
   * ========================================================
   * CREATION / MODIFICATION
   * ========================================================
   */

  const [
    createOpen,
    setCreateOpen,
  ] = useState(false);

  const [
    editingSlot,
    setEditingSlot,
  ] = useState<
    TimetableSlot | null
  >(null);

  const [
    successMessage,
    setSuccessMessage,
  ] = useState<
    string | null
  >(null);

  /*
   * ========================================================
   * ACTIONS ADMIN
   * ========================================================
   */

  const [
    actionSlotId,
    setActionSlotId,
  ] = useState<
    string | null
  >(null);

  /*
   * ========================================================
   * FILTRES
   * ========================================================
   */

  const [
    schoolYearFilter,
    setSchoolYearFilter,
  ] = useState("all");

  const [
    classFilter,
    setClassFilter,
  ] = useState("all");

  const [
    teacherFilter,
    setTeacherFilter,
  ] = useState("all");

  const [
    roomFilter,
    setRoomFilter,
  ] = useState("all");

  const [
    dayFilter,
    setDayFilter,
  ] = useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<StatusFilter>(
    "active"
  );

  /*
   * ========================================================
   * CHARGEMENT
   * ========================================================
   */

  const loadData =
    useCallback(
      async (
        silent = false
      ) => {
        try {
          if (silent) {
            setRefreshing(
              true
            );
          } else {
            setLoading(
              true
            );
          }

          setErrorMessage(
            null
          );

          const [
            slotResult,
            catalogResult,
          ] = await Promise.all([
            getAdminTimetableSlots(),
            getAdminTimetableCatalog(),
          ]);

          setSlots(
            slotResult
          );

          setCatalog(
            catalogResult
          );
        } catch (error) {
          console.error(
            "[AdminTimetable] loadData error:",
            error
          );

          setErrorMessage(
            getAdminTimetableErrorMessage(
              error,
              "Impossible de charger l'emploi du temps de l'établissement."
            )
          );

          setSlots([]);

          setCatalog(
            EMPTY_CATALOG
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      []
    );

  useEffect(() => {
    void loadData();
  }, [
    loadData,
  ]);

  /*
   * ========================================================
   * CREATION / MODIFICATION REUSSIE
   * ========================================================
   */

  async function handleSlotSaved() {
    const wasEditing =
      editingSlot !== null;

    setCreateOpen(
      false
    );

    setEditingSlot(
      null
    );

    setSuccessMessage(
      wasEditing
        ? "Le créneau a été modifié avec succès."
        : "Le créneau a été créé avec succès."
    );

    await loadData(
      true
    );
  }

  /*
   * ========================================================
   * OUVERTURE CREATION
   * ========================================================
   */

  function handleCreateOpen() {
    setSuccessMessage(
      null
    );

    setErrorMessage(
      null
    );

    setEditingSlot(
      null
    );

    setCreateOpen(
      true
    );
  }

  /*
   * ========================================================
   * OUVERTURE MODIFICATION
   * ========================================================
   */

  function handleEditSlot(
    slot: TimetableSlot
  ) {
    setSuccessMessage(
      null
    );

    setErrorMessage(
      null
    );

    setCreateOpen(
      false
    );

    setEditingSlot(
      slot
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  /*
   * ========================================================
   * FERMETURE FORMULAIRE
   * ========================================================
   */

  function handleFormCancel() {
    setCreateOpen(
      false
    );

    setEditingSlot(
      null
    );
  }

  /*
   * ========================================================
   * ACTIVATION / DESACTIVATION
   * ========================================================
   */

  async function handleToggleSlotActive(
    slot: TimetableSlot
  ) {
    const nextActive =
      !slot.isActive;

    const confirmed =
      window.confirm(
        nextActive
          ? `Réactiver le créneau « ${slot.courseTitle} » pour la classe ${slot.className} ?`
          : `Désactiver le créneau « ${slot.courseTitle} » pour la classe ${slot.className} ?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setActionSlotId(
        slot.id
      );

      setErrorMessage(
        null
      );

      setSuccessMessage(
        null
      );

      await setAdminTimetableSlotActive(
        slot.id,
        nextActive
      );

      setSuccessMessage(
        nextActive
          ? "Le créneau a été réactivé avec succès."
          : "Le créneau a été désactivé avec succès."
      );

      await loadData(
        true
      );
    } catch (error) {
      console.error(
        "[AdminTimetable] toggle slot error:",
        error
      );

      setErrorMessage(
        getAdminTimetableErrorMessage(
          error,
          nextActive
            ? "Impossible de réactiver ce créneau."
            : "Impossible de désactiver ce créneau."
        )
      );
    } finally {
      setActionSlotId(
        null
      );
    }
  }

  /*
   * ========================================================
   * SUPPRESSION
   * ========================================================
   */

  async function handleDeleteSlot(
    slot: TimetableSlot
  ) {
    const confirmed =
      window.confirm(
        `Supprimer définitivement le créneau « ${slot.courseTitle} » de la classe ${slot.className} ?\n\nCette action est irréversible.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setActionSlotId(
        slot.id
      );

      setErrorMessage(
        null
      );

      setSuccessMessage(
        null
      );

      await deleteAdminTimetableSlot(
        slot.id
      );

      /*
       * Si jamais le créneau supprimé était en cours
       * de modification, on ferme le formulaire.
       */
      if (
        editingSlot?.id ===
        slot.id
      ) {
        setEditingSlot(
          null
        );
      }

      setSuccessMessage(
        "Le créneau a été supprimé avec succès."
      );

      await loadData(
        true
      );
    } catch (error) {
      console.error(
        "[AdminTimetable] delete slot error:",
        error
      );

      setErrorMessage(
        getAdminTimetableErrorMessage(
          error,
          "Impossible de supprimer ce créneau."
        )
      );
    } finally {
      setActionSlotId(
        null
      );
    }
  }

  /*
   * ========================================================
   * OPTIONS DE FILTRES
   * ========================================================
   */

  const classOptions =
    useMemo(
      () => {
        if (
          schoolYearFilter ===
          "all"
        ) {
          return catalog.classes;
        }

        return catalog.classes.filter(
          (item) =>
            item.schoolYearId ===
            schoolYearFilter
        );
      },
      [
        catalog.classes,
        schoolYearFilter,
      ]
    );

  /*
   * Si on change d'année scolaire et que
   * la classe sélectionnée ne lui appartient plus,
   * on réinitialise la classe.
   */

  useEffect(() => {
    if (
      classFilter ===
      "all"
    ) {
      return;
    }

    const stillAvailable =
      classOptions.some(
        (item) =>
          item.id ===
          classFilter
      );

    if (!stillAvailable) {
      setClassFilter(
        "all"
      );
    }
  }, [
    classFilter,
    classOptions,
  ]);

  /*
   * ========================================================
   * CRENEAUX FILTRES
   * ========================================================
   */

  const filteredSlots =
    useMemo(
      () => {
        return slots.filter(
          (slot) => {
            const matchesSchoolYear =
              schoolYearFilter ===
                "all" ||
              slot.schoolYearId ===
                schoolYearFilter;

            const matchesClass =
              classFilter ===
                "all" ||
              slot.classId ===
                classFilter;

            const matchesTeacher =
              teacherFilter ===
                "all" ||
              slot.teacherId ===
                teacherFilter;

            const matchesRoom =
              roomFilter ===
                "all" ||
              slot.roomId ===
                roomFilter;

            const matchesDay =
              dayFilter ===
                "all" ||
              String(
                slot.dayOfWeek
              ) ===
                dayFilter;

            const matchesStatus =
              statusFilter ===
              "active"
                ? slot.isActive
                : !slot.isActive;

            return (
              matchesSchoolYear &&
              matchesClass &&
              matchesTeacher &&
              matchesRoom &&
              matchesDay &&
              matchesStatus
            );
          }
        );
      },
      [
        slots,
        schoolYearFilter,
        classFilter,
        teacherFilter,
        roomFilter,
        dayFilter,
        statusFilter,
      ]
    );

  /*
   * ========================================================
   * INDICATEURS
   * ========================================================
   */

  const classCount =
    useMemo(
      () =>
        new Set(
          filteredSlots.map(
            (slot) =>
              slot.classId
          )
        ).size,
      [
        filteredSlots,
      ]
    );

  const teacherCount =
    useMemo(
      () =>
        new Set(
          filteredSlots.map(
            (slot) =>
              slot.teacherId
          )
        ).size,
      [
        filteredSlots,
      ]
    );

  const activeDayCount =
    useMemo(
      () =>
        new Set(
          filteredSlots.map(
            (slot) =>
              slot.dayOfWeek
          )
        ).size,
      [
        filteredSlots,
      ]
    );

  const activeRoomCount =
    useMemo(
      () =>
        catalog.rooms.filter(
          (room) =>
            room.isActive
        ).length,
      [
        catalog.rooms,
      ]
    );

  /*
   * ========================================================
   * RESET FILTRES
   * ========================================================
   */

  function resetFilters() {
    setSchoolYearFilter(
      "all"
    );

    setClassFilter(
      "all"
    );

    setTeacherFilter(
      "all"
    );

    setRoomFilter(
      "all"
    );

    setDayFilter(
      "all"
    );

    setStatusFilter(
      "active"
    );
  }

  /*
   * ========================================================
   * LOADING
   * ========================================================
   */

  if (loading) {
    return (
      <div className="space-y-5">

        <section className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="h-4 w-44 rounded bg-slate-200" />

          <div className="mt-3 h-8 w-80 rounded bg-slate-200" />

          <div className="mt-3 h-4 w-96 max-w-full rounded bg-slate-100" />

        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

          {Array.from({
            length: 5,
          }).map(
            (
              _,
              index
            ) => (
              <div
                key={
                  index
                }
                className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm"
              />
            )
          )}

        </div>

        <div className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />

        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />

      </div>
    );
  }

  /*
   * ========================================================
   * RENDU
   * ========================================================
   */

  return (
    <div className="space-y-5">

      {/* =====================================================
          HEADER
         ===================================================== */}

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
                Pilotage du planning
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Supervisez les créneaux,
                les classes, les enseignants
                et les salles à l'échelle
                de l'établissement.
              </p>

            </div>

          </div>

          <div className="flex flex-wrap gap-2">

            <button
              type="button"
              onClick={
                handleCreateOpen
              }
              disabled={
                createOpen ||
                editingSlot !==
                  null
              }
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Nouveau créneau
            </button>

            <button
              type="button"
              onClick={() =>
                void loadData(
                  true
                )
              }
              disabled={
                refreshing
              }
              className="inline-flex items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing
                ? "Actualisation..."
                : "↻ Rafraîchir"}
            </button>

          </div>

        </div>

      </section>

      {/* =====================================================
          FORMULAIRE CREATION / MODIFICATION
         ===================================================== */}

      {createOpen ||
      editingSlot !== null ? (
        <AdminTimetableSlotCreateForm
          key={
            editingSlot?.id ??
            "create"
          }
          catalog={
            catalog
          }
          slot={
            editingSlot
          }
          onSaved={
            handleSlotSaved
          }
          onCancel={
            handleFormCancel
          }
        />
      ) : null}

      {/* =====================================================
          SUCCES
         ===================================================== */}

      {successMessage ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">

          <div className="flex items-center gap-3">

            <span>
              ✅
            </span>

            <p className="font-semibold">
              {
                successMessage
              }
            </p>

          </div>

        </section>
      ) : null}

      {/* =====================================================
          ERREUR
         ===================================================== */}

      {errorMessage ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">

          <div className="flex items-start gap-3">

            <span>
              ⚠️
            </span>

            <div>

              <p className="font-bold">
                Une erreur est survenue
              </p>

              <p className="mt-1">
                {
                  errorMessage
                }
              </p>

            </div>

          </div>

        </section>
      ) : null}

      {/* =====================================================
          INDICATEURS
         ===================================================== */}

      <section>

        <div className="mb-3">

          <h2 className="text-base font-bold text-slate-950">
            Vue établissement
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Les indicateurs s'adaptent
            automatiquement aux filtres
            sélectionnés.
          </p>

        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

          <MetricCard
            label="Créneaux"
            value={
              filteredSlots.length
            }
            icon="📚"
            iconClass="bg-blue-50"
          />

          <MetricCard
            label="Classes"
            value={
              classCount
            }
            icon="🏫"
            iconClass="bg-violet-50"
          />

          <MetricCard
            label="Enseignants"
            value={
              teacherCount
            }
            icon="👨‍🏫"
            iconClass="bg-emerald-50"
          />

          <MetricCard
            label="Jours occupés"
            value={
              activeDayCount
            }
            icon="🗓️"
            iconClass="bg-amber-50"
          />

          <MetricCard
            label="Salles actives"
            value={
              activeRoomCount
            }
            icon="🚪"
            iconClass="bg-cyan-50"
          />

        </div>

      </section>

      {/* =====================================================
          FILTRES
         ===================================================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

          <div>

            <h2 className="text-base font-bold text-slate-950">
              Filtres
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Analysez le planning par
              année scolaire, classe,
              enseignant, salle, statut
              ou jour.
            </p>

          </div>

          <button
            type="button"
            onClick={
              resetFilters
            }
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            Réinitialiser
          </button>

        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">

          <FilterSelect
            label="Année scolaire"
            value={
              schoolYearFilter
            }
            onChange={
              setSchoolYearFilter
            }
          >
            <option value="all">
              Toutes les années
            </option>

            {catalog.schoolYears.map(
              (
                schoolYear
              ) => (
                <option
                  key={
                    schoolYear.id
                  }
                  value={
                    schoolYear.id
                  }
                >
                  {
                    schoolYear.name
                  }
                  {schoolYear.isCurrent
                    ? " — actuelle"
                    : ""}
                </option>
              )
            )}
          </FilterSelect>

          <FilterSelect
            label="Classe"
            value={
              classFilter
            }
            onChange={
              setClassFilter
            }
          >
            <option value="all">
              Toutes les classes
            </option>

            {classOptions.map(
              (
                item
              ) => (
                <option
                  key={
                    item.id
                  }
                  value={
                    item.id
                  }
                >
                  {
                    item.name
                  }{" "}
                  —{" "}
                  {
                    item.schoolYearName
                  }
                </option>
              )
            )}
          </FilterSelect>

          <FilterSelect
            label="Enseignant"
            value={
              teacherFilter
            }
            onChange={
              setTeacherFilter
            }
          >
            <option value="all">
              Tous les enseignants
            </option>

            {catalog.teachers.map(
              (
                teacher
              ) => (
                <option
                  key={
                    teacher.id
                  }
                  value={
                    teacher.id
                  }
                >
                  {
                    teacher.name
                  }
                </option>
              )
            )}
          </FilterSelect>

          <FilterSelect
            label="Salle"
            value={
              roomFilter
            }
            onChange={
              setRoomFilter
            }
          >
            <option value="all">
              Toutes les salles
            </option>

            {catalog.rooms.map(
              (
                room
              ) => (
                <option
                  key={
                    room.id
                  }
                  value={
                    room.id
                  }
                >
                  {
                    room.name
                  }
                  {room.code
                    ? ` (${room.code})`
                    : ""}
                  {!room.isActive
                    ? " — inactive"
                    : ""}
                </option>
              )
            )}
          </FilterSelect>

          <FilterSelect
            label="Jour"
            value={
              dayFilter
            }
            onChange={
              setDayFilter
            }
          >
            <option value="all">
              Tous les jours
            </option>

            <option value="1">
              Lundi
            </option>

            <option value="2">
              Mardi
            </option>

            <option value="3">
              Mercredi
            </option>

            <option value="4">
              Jeudi
            </option>

            <option value="5">
              Vendredi
            </option>

            <option value="6">
              Samedi
            </option>

            <option value="7">
              Dimanche
            </option>
          </FilterSelect>

          <FilterSelect
            label="Statut"
            value={
              statusFilter
            }
            onChange={(
              value
            ) =>
              setStatusFilter(
                value as StatusFilter
              )
            }
          >
            <option value="active">
              Créneaux actifs
            </option>

            <option value="inactive">
              Créneaux inactifs
            </option>
          </FilterSelect>

        </div>

      </section>

      {/* =====================================================
          VUE HEBDOMADAIRE
         ===================================================== */}

      <section>

        <div className="mb-3">

          <h2 className="text-base font-bold text-slate-950">
            Planning hebdomadaire
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Consultez les créneaux
            correspondant aux filtres
            sélectionnés.
          </p>

        </div>

        <TimetableWeeklyView
          slots={
            filteredSlots
          }
          emptyTitle="Aucun créneau correspondant"
          emptyDescription="Aucun créneau d'emploi du temps ne correspond actuellement aux filtres sélectionnés."
          renderSlotActions={(
            slot
          ) => {
            const busy =
              actionSlotId !==
              null;

            const currentBusy =
              actionSlotId ===
              slot.id;

            return (
              <>

                {/* MODIFIER */}

                <button
                  type="button"
                  onClick={() =>
                    handleEditSlot(
                      slot
                    )
                  }
                  disabled={
                    busy
                  }
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ✏️ Modifier
                </button>

                {/* ACTIVER / DESACTIVER */}

                <button
                  type="button"
                  onClick={() =>
                    void handleToggleSlotActive(
                      slot
                    )
                  }
                  disabled={
                    busy
                  }
                  className={[
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",

                    slot.isActive
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  ].join(
                    " "
                  )}
                >
                  {currentBusy
                    ? "Traitement..."
                    : slot.isActive
                      ? "⏸ Désactiver"
                      : "▶ Réactiver"}
                </button>

                {/* SUPPRIMER */}

                <button
                  type="button"
                  onClick={() =>
                    void handleDeleteSlot(
                      slot
                    )
                  }
                  disabled={
                    busy
                  }
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {currentBusy
                    ? "Traitement..."
                    : "🗑 Supprimer"}
                </button>

              </>
            );
          }}
        />

      </section>

    </div>
  );
}

/* ============================================================
   COMPOSANTS LOCAUX
   ============================================================ */

function MetricCard({
  label,
  value,
  icon,
  iconClass,
}: {
  label: string;
  value: number;
  icon: string;
  iconClass: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex items-center justify-between gap-3">

        <div>

          <p className="text-xs font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-1 text-2xl font-bold text-slate-950">
            {value}
          </p>

        </div>

        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl",
            iconClass,
          ].join(
            " "
          )}
        >
          {icon}
        </div>

      </div>

    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;

  onChange: (
    value: string
  ) => void;

  children: ReactNode;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      <select
        value={
          value
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
      >
        {children}
      </select>

    </label>
  );
}