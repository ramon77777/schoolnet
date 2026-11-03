import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  createAdminTimetableSlot,
  getAdminTimetableErrorMessage,
  updateAdminTimetableSlot,
  type AdminTimetableCatalog,
  type AdminTimetableSlotWriteInput,
} from "../lib/adminTimetableApi";

import type {
  TimetableDayOfWeek,
  TimetableSlot,
} from "../types/timetable.types";

type AdminTimetableSlotCreateFormProps = {
  catalog: AdminTimetableCatalog;

  slot?: TimetableSlot | null;

  onSaved: () => void | Promise<void>;

  onCancel: () => void;
};

const WEEK_DAYS: Array<{
  value: TimetableDayOfWeek;
  label: string;
}> = [
  {
    value: 1,
    label: "Lundi",
  },
  {
    value: 2,
    label: "Mardi",
  },
  {
    value: 3,
    label: "Mercredi",
  },
  {
    value: 4,
    label: "Jeudi",
  },
  {
    value: 5,
    label: "Vendredi",
  },
  {
    value: 6,
    label: "Samedi",
  },
  {
    value: 7,
    label: "Dimanche",
  },
];

export default function AdminTimetableSlotCreateForm({
  catalog,
  slot = null,
  onSaved,
  onCancel,
}: AdminTimetableSlotCreateFormProps) {
  /*
   * ========================================================
   * MODE CREATION / MODIFICATION
   * ========================================================
   */

  const editing =
    slot !== null;

  /*
   * ========================================================
   * ETAT DU FORMULAIRE
   * ========================================================
   */

  const defaultSchoolYearId =
    slot?.schoolYearId ??
    catalog.schoolYears.find(
      (item) =>
        item.isCurrent
    )?.id ??
    catalog.schoolYears[0]?.id ??
    "";

  const [
    schoolYearId,
    setSchoolYearId,
  ] = useState(
    defaultSchoolYearId
  );

  const [
    classId,
    setClassId,
  ] = useState(
    slot?.classId ?? ""
  );

  const [
    courseId,
    setCourseId,
  ] = useState(
    slot?.courseId ?? ""
  );

  const [
    teacherId,
    setTeacherId,
  ] = useState(
    slot?.teacherId ?? ""
  );

  const [
    roomId,
    setRoomId,
  ] = useState(
    slot?.roomId ?? ""
  );

  const [
    dayOfWeek,
    setDayOfWeek,
  ] = useState<TimetableDayOfWeek>(
    slot?.dayOfWeek ?? 1
  );

  const [
    startsAt,
    setStartsAt,
  ] = useState(
    slot?.startsAt
      ? slot.startsAt.slice(
          0,
          5
        )
      : "08:00"
  );

  const [
    endsAt,
    setEndsAt,
  ] = useState(
    slot?.endsAt
      ? slot.endsAt.slice(
          0,
          5
        )
      : "09:00"
  );

  const [
    notes,
    setNotes,
  ] = useState(
    slot?.notes ?? ""
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | null
  >(null);

  /*
   * ========================================================
   * ANNEE -> CLASSES
   * ========================================================
   */

  const classOptions =
    useMemo(
      () =>
        catalog.classes.filter(
          (item) =>
            item.schoolYearId ===
            schoolYearId
        ),
      [
        catalog.classes,
        schoolYearId,
      ]
    );

  /*
   * ========================================================
   * CLASSE -> COURS
   * ========================================================
   */

  const courseOptions =
    useMemo(
      () =>
        catalog.courses.filter(
          (item) =>
            item.classId ===
            classId
        ),
      [
        catalog.courses,
        classId,
      ]
    );

  /*
   * ========================================================
   * CLASSE + COURS -> ENSEIGNANTS AUTORISES
   * ========================================================
   */

  const teacherOptions =
    useMemo(
      () => {
        if (
          !classId ||
          !courseId
        ) {
          return [];
        }

        const classTeacherIds =
          new Set(
            catalog.classTeachers
              .filter(
                (link) =>
                  link.classId ===
                  classId
              )
              .map(
                (link) =>
                  link.teacherId
              )
          );

        const courseTeacherIds =
          new Set(
            catalog.courseTeachers
              .filter(
                (link) =>
                  link.courseId ===
                  courseId
              )
              .map(
                (link) =>
                  link.teacherId
              )
          );

        return catalog.teachers.filter(
          (teacher) =>
            classTeacherIds.has(
              teacher.id
            ) &&
            courseTeacherIds.has(
              teacher.id
            )
        );
      },
      [
        catalog.classTeachers,
        catalog.courseTeachers,
        catalog.teachers,
        classId,
        courseId,
      ]
    );

  /*
   * ========================================================
   * SALLES
   * ========================================================
   *
   * En création :
   * seules les salles actives sont proposées.
   *
   * En modification :
   * si le créneau utilise déjà une salle devenue inactive,
   * cette salle reste visible afin de ne pas perdre
   * l'information existante.
   * ========================================================
   */

  const roomOptions =
    useMemo(
      () =>
        catalog.rooms.filter(
          (room) =>
            room.isActive ||
            room.id ===
              slot?.roomId
        ),
      [
        catalog.rooms,
        slot?.roomId,
      ]
    );

  /*
   * ========================================================
   * VALIDATION
   * ========================================================
   */

  const hasValidTimes =
    Boolean(
      startsAt &&
      endsAt &&
      startsAt < endsAt
    );

  const formReady =
    Boolean(
      schoolYearId &&
      classId &&
      courseId &&
      teacherId &&
      hasValidTimes
    );

  /*
   * ========================================================
   * DEPENDANCES
   * ========================================================
   */

  function handleSchoolYearChange(
    value: string
  ) {
    setSchoolYearId(
      value
    );

    setClassId("");
    setCourseId("");
    setTeacherId("");

    setErrorMessage(
      null
    );
  }

  function handleClassChange(
    value: string
  ) {
    setClassId(
      value
    );

    setCourseId("");
    setTeacherId("");

    setErrorMessage(
      null
    );
  }

  function handleCourseChange(
    value: string
  ) {
    setCourseId(
      value
    );

    setTeacherId("");

    setErrorMessage(
      null
    );
  }

  /*
   * ========================================================
   * ENREGISTREMENT
   * ========================================================
   */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!schoolYearId) {
      setErrorMessage(
        "Sélectionnez une année scolaire."
      );

      return;
    }

    if (!classId) {
      setErrorMessage(
        "Sélectionnez une classe."
      );

      return;
    }

    if (!courseId) {
      setErrorMessage(
        "Sélectionnez un cours."
      );

      return;
    }

    if (!teacherId) {
      setErrorMessage(
        "Sélectionnez un enseignant."
      );

      return;
    }

    if (!hasValidTimes) {
      setErrorMessage(
        "L'heure de fin doit être postérieure à l'heure de début."
      );

      return;
    }

    try {
      setSaving(
        true
      );

      setErrorMessage(
        null
      );

      const input: AdminTimetableSlotWriteInput = {
        schoolYearId,
        classId,
        courseId,
        teacherId,

        roomId:
          roomId ||
          null,

        dayOfWeek,

        startsAt,
        endsAt,

        notes:
          notes.trim() ||
          null,

        /*
         * En modification, le statut actuel est conservé.
         * En création, le créneau est actif par défaut.
         */
        isActive:
          slot?.isActive ??
          true,
      };

      if (slot) {
        await updateAdminTimetableSlot(
          slot.id,
          input
        );
      } else {
        await createAdminTimetableSlot(
          input
        );
      }

      await onSaved();
    } catch (error) {
      console.error(
        "[AdminTimetableSlotCreateForm] save error:",
        error
      );

      setErrorMessage(
        getAdminTimetableErrorMessage(
          error,
          editing
            ? "Impossible de modifier ce créneau."
            : "Impossible de créer ce créneau."
        )
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  /*
   * ========================================================
   * RENDU
   * ========================================================
   */

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">

      <header className="border-b border-blue-100 bg-blue-50/60 px-5 py-4 sm:px-6">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
              Administration
            </p>

            <h2 className="mt-1 text-lg font-bold text-slate-950">
              {editing
                ? "Modifier le créneau"
                : "Nouveau créneau"}
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {editing
                ? "Modifiez la classe, le cours, l'enseignant, l'horaire, la salle ou la note de ce créneau."
                : "Affectez un cours à une classe, un enseignant, un horaire et éventuellement une salle."}
            </p>
          </div>

          <button
            type="button"
            onClick={
              onCancel
            }
            disabled={
              saving
            }
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ✕ Fermer
          </button>

        </div>

      </header>

      <form
        onSubmit={
          handleSubmit
        }
        className="p-5 sm:p-6"
      >

        {/* ===================================================
            ERREUR
           =================================================== */}

        {errorMessage ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">

            <div className="flex items-start gap-2">
              <span>
                ⚠️
              </span>

              <p>
                {
                  errorMessage
                }
              </p>
            </div>

          </div>
        ) : null}

        {/* ===================================================
            LIGNE 1
           =================================================== */}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          <FieldSelect
            label="Année scolaire"
            required
            value={
              schoolYearId
            }
            onChange={
              handleSchoolYearChange
            }
          >
            <option value="">
              Sélectionner une année
            </option>

            {catalog.schoolYears.map(
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
                  }
                  {item.isCurrent
                    ? " — actuelle"
                    : ""}
                </option>
              )
            )}
          </FieldSelect>

          <FieldSelect
            label="Classe"
            required
            value={
              classId
            }
            onChange={
              handleClassChange
            }
            disabled={
              !schoolYearId
            }
          >
            <option value="">
              {schoolYearId
                ? "Sélectionner une classe"
                : "Choisir d'abord l'année"}
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
                  }
                </option>
              )
            )}
          </FieldSelect>

          <FieldSelect
            label="Cours"
            required
            value={
              courseId
            }
            onChange={
              handleCourseChange
            }
            disabled={
              !classId
            }
          >
            <option value="">
              {classId
                ? "Sélectionner un cours"
                : "Choisir d'abord la classe"}
            </option>

            {courseOptions.map(
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
                    item.title
                  }
                </option>
              )
            )}
          </FieldSelect>

          <FieldSelect
            label="Enseignant"
            required
            value={
              teacherId
            }
            onChange={
              setTeacherId
            }
            disabled={
              !courseId
            }
          >
            <option value="">
              {!courseId
                ? "Choisir d'abord le cours"
                : teacherOptions.length > 0
                  ? "Sélectionner un enseignant"
                  : "Aucun enseignant compatible"}
            </option>

            {teacherOptions.map(
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
          </FieldSelect>

        </div>

        {/* ===================================================
            LIGNE 2
           =================================================== */}

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">

          <FieldSelect
            label="Salle"
            value={
              roomId
            }
            onChange={
              setRoomId
            }
          >
            <option value="">
              Aucune salle
            </option>

            {roomOptions.map(
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
          </FieldSelect>

          <FieldSelect
            label="Jour"
            required
            value={
              String(
                dayOfWeek
              )
            }
            onChange={(
              value
            ) =>
              setDayOfWeek(
                Number(
                  value
                ) as TimetableDayOfWeek
              )
            }
          >
            {WEEK_DAYS.map(
              (
                day
              ) => (
                <option
                  key={
                    day.value
                  }
                  value={
                    day.value
                  }
                >
                  {
                    day.label
                  }
                </option>
              )
            )}
          </FieldSelect>

          <FieldInput
            label="Heure de début"
            required
            type="time"
            value={
              startsAt
            }
            onChange={
              setStartsAt
            }
          />

          <FieldInput
            label="Heure de fin"
            required
            type="time"
            value={
              endsAt
            }
            onChange={
              setEndsAt
            }
          />

        </div>

        {/* ===================================================
            NOTE
           =================================================== */}

        <label className="mt-4 block">

          <span className="mb-1.5 block text-xs font-semibold text-slate-600">
            Note

            <span className="ml-1 font-normal text-slate-400">
              facultative
            </span>
          </span>

          <textarea
            rows={
              3
            }
            value={
              notes
            }
            onChange={(
              event
            ) =>
              setNotes(
                event.target.value
              )
            }
            placeholder="Ex. Cours hebdomadaire, salle temporaire, information interne..."
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          />

        </label>

        {/* ===================================================
            RESUME / ACTIONS
           =================================================== */}

        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="text-sm text-slate-500">

            <p className="font-semibold text-slate-700">
              Contrôles automatiques actifs
            </p>

            <p className="mt-1 leading-6">
              SchoolNet vérifiera l'affectation
              classe/cours/enseignant ainsi que
              les conflits de classe,
              d'enseignant et de salle.
            </p>

          </div>

          <div className="flex shrink-0 flex-wrap gap-2">

            <button
              type="button"
              onClick={
                onCancel
              }
              disabled={
                saving
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Annuler
            </button>

            <button
              type="submit"
              disabled={
                !formReady ||
                saving
              }
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Enregistrement..."
                : editing
                  ? "✓ Enregistrer les modifications"
                  : "✓ Créer le créneau"}
            </button>

          </div>

        </div>

      </form>

    </section>
  );
}

/* ============================================================
   CHAMP SELECT
   ============================================================ */

function FieldSelect({
  label,
  value,
  onChange,
  children,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;

  onChange: (
    value: string
  ) => void;

  children: ReactNode;

  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}

        {required ? (
          <span className="ml-1 text-red-500">
            *
          </span>
        ) : null}
      </span>

      <select
        required={
          required
        }
        value={
          value
        }
        disabled={
          disabled
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        {children}
      </select>

    </label>
  );
}

/* ============================================================
   CHAMP INPUT
   ============================================================ */

function FieldInput({
  label,
  type,
  value,
  onChange,
  required = false,
}: {
  label: string;
  type: "time";
  value: string;

  onChange: (
    value: string
  ) => void;

  required?: boolean;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}

        {required ? (
          <span className="ml-1 text-red-500">
            *
          </span>
        ) : null}
      </span>

      <input
        type={
          type
        }
        required={
          required
        }
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
      />

    </label>
  );
}