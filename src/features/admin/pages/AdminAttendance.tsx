import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/lib/auth/AuthProvider";

import {
  getAdminAttendanceOverview,
  type AdminAttendanceJustificationItem,
  type AdminAttendanceOverview,
  type AdminAttendanceSessionItem,
} from "@/features/attendance/lib/adminAttendanceApi";

import { getAttendanceErrorMessage } from "@/features/attendance/lib/attendanceApi";

import type {
  AttendanceJustificationStatus,
  AttendanceSessionStatus,
} from "@/features/attendance/types/attendance.types";

type PeriodFilter =
  | "all"
  | "today"
  | "week";

type StatusFilter =
  | "all"
  | AttendanceSessionStatus;

const EMPTY_OVERVIEW: AdminAttendanceOverview = {
  sessions: [],
  justifications: [],
};

const SESSION_PAGE_SIZE = 8;
const JUSTIFICATION_PAGE_SIZE = 6;

function formatDate(date: string) {
  if (!date) {
    return "Date non renseignée";
  }

  const parsed = new Date(
    `${date}T00:00:00`
  );

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return value.slice(0, 5);
}

function normalizeSearchText(
  value: string | null | undefined
) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function getSessionStatusLabel(
  status: AttendanceSessionStatus
) {
  switch (status) {
    case "draft":
      return "Brouillon";

    case "open":
      return "Ouverte";

    case "closed":
      return "Clôturée";

    case "cancelled":
      return "Annulée";

    default:
      return status;
  }
}

function getSessionStatusClass(
  status: AttendanceSessionStatus
) {
  switch (status) {
    case "closed":
      return "sn-badge sn-badge-green";

    case "open":
      return "sn-badge sn-badge-blue";

    case "cancelled":
      return "sn-badge sn-badge-gray";

    case "draft":
    default:
      return "sn-badge sn-badge-gray";
  }
}

function getJustificationStatusLabel(
  status: AttendanceJustificationStatus
) {
  switch (status) {
    case "pending":
      return "En attente";

    case "approved":
      return "Accepté";

    case "rejected":
      return "Rejeté";

    default:
      return status;
  }
}

function getJustificationStatusClass(
  status: AttendanceJustificationStatus
) {
  switch (status) {
    case "approved":
      return "sn-badge sn-badge-green";

    case "pending":
      return "sn-badge sn-badge-blue";

    case "rejected":
    default:
      return "sn-badge sn-badge-gray";
  }
}

function isToday(date: string) {
  const today = new Date();

  const yyyy =
    today.getFullYear();

  const mm = String(
    today.getMonth() + 1
  ).padStart(2, "0");

  const dd = String(
    today.getDate()
  ).padStart(2, "0");

  return date === `${yyyy}-${mm}-${dd}`;
}

function isCurrentWeek(date: string) {
  const target = new Date(
    `${date}T00:00:00`
  );

  if (Number.isNaN(target.getTime())) {
    return false;
  }

  const now = new Date();

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const day =
    start.getDay() || 7;

  start.setDate(
    start.getDate() - day + 1
  );

  const end = new Date(start);

  end.setDate(
    start.getDate() + 6
  );

  end.setHours(
    23,
    59,
    59,
    999
  );

  return (
    target >= start &&
    target <= end
  );
}

export default function AdminAttendance() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [
    overview,
    setOverview,
  ] = useState<AdminAttendanceOverview>(
    EMPTY_OVERVIEW
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

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
    statusFilter,
    setStatusFilter,
  ] = useState<StatusFilter>("all");

  const [
    periodFilter,
    setPeriodFilter,
  ] = useState<PeriodFilter>("all");

  const loadOverview =
    useCallback(async () => {
      if (
        authLoading ||
        !user ||
        user.isDemo
      ) {
        if (!authLoading) {
          setOverview(
            EMPTY_OVERVIEW
          );

          setLoading(false);
        }

        return;
      }

      try {
        setLoading(true);
        setError(null);

        const result =
          await getAdminAttendanceOverview();

        setOverview(result);
      } catch (err) {
        console.error(
          "[AdminAttendance] loadOverview error:",
          err
        );

        setError(
          getAttendanceErrorMessage(
            err,
            "Impossible de charger les données d'assiduité."
          )
        );
      } finally {
        setLoading(false);
      }
    }, [
      authLoading,
      user,
    ]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const schoolYears =
    useMemo(() => {
      return Array.from(
        new Set(
          overview.sessions
            .map(
              (session) =>
                session.schoolYear
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        )
      ).sort((a, b) =>
        b.localeCompare(a, "fr", {
          numeric: true,
        })
      );
    }, [overview.sessions]);

  const classes =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      for (
        const session of
        overview.sessions
      ) {
        map.set(
          session.classId,
          session.className
        );
      }

      return Array.from(
        map.entries()
      ).sort((a, b) =>
        a[1].localeCompare(
          b[1],
          "fr",
          {
            numeric: true,
          }
        )
      );
    }, [overview.sessions]);

  const teachers =
    useMemo(() => {
      const map =
        new Map<
          string,
          string
        >();

      for (
        const session of
        overview.sessions
      ) {
        map.set(
          session.teacherId,
          session.teacherName
        );
      }

      return Array.from(
        map.entries()
      ).sort((a, b) =>
        a[1].localeCompare(
          b[1],
          "fr"
        )
      );
    }, [overview.sessions]);

  const filteredSessions =
    useMemo(() => {
      return overview.sessions.filter(
        (session) => {
          if (
            schoolYearFilter !==
              "all" &&
            session.schoolYear !==
              schoolYearFilter
          ) {
            return false;
          }

          if (
            classFilter !== "all" &&
            session.classId !==
              classFilter
          ) {
            return false;
          }

          if (
            teacherFilter !==
              "all" &&
            session.teacherId !==
              teacherFilter
          ) {
            return false;
          }

          if (
            statusFilter !== "all" &&
            session.status !==
              statusFilter
          ) {
            return false;
          }

          if (
            periodFilter ===
              "today" &&
            !isToday(
              session.sessionDate
            )
          ) {
            return false;
          }

          if (
            periodFilter ===
              "week" &&
            !isCurrentWeek(
              session.sessionDate
            )
          ) {
            return false;
          }

          return true;
        }
      );
    }, [
      overview.sessions,
      schoolYearFilter,
      classFilter,
      teacherFilter,
      statusFilter,
      periodFilter,
    ]);

  const filteredSessionIds =
    useMemo(
      () =>
        new Set(
          filteredSessions.map(
            (session) =>
              session.id
          )
        ),
      [filteredSessions]
    );

  const filteredJustifications =
    useMemo(() => {
      return overview.justifications.filter(
        (justification) =>
          filteredSessionIds.has(
            justification.sessionId
          )
      );
    }, [
      overview.justifications,
      filteredSessionIds,
    ]);

  const stats =
    useMemo(() => {
      let present = 0;
      let absent = 0;
      let late = 0;

      for (
        const session of
        filteredSessions
      ) {
        present +=
          session.presentCount;

        absent +=
          session.absentCount;

        late +=
          session.lateCount;
      }

      const total =
        present +
        absent +
        late;

      const attendanceRate =
        total > 0
          ? Math.round(
              ((present + late) /
                total) *
                100
            )
          : 0;

      return {
        sessions:
          filteredSessions.length,

        present,
        absent,
        late,
        total,

        attendanceRate,
      };
    }, [filteredSessions]);

  const justificationStats =
    useMemo(() => {
      return {
        pending:
          filteredJustifications.filter(
            (item) =>
              item.status ===
              "pending"
          ).length,

        approved:
          filteredJustifications.filter(
            (item) =>
              item.status ===
              "approved"
          ).length,

        rejected:
          filteredJustifications.filter(
            (item) =>
              item.status ===
              "rejected"
          ).length,
      };
    }, [filteredJustifications]);

  const resetFilters = () => {
    setSchoolYearFilter("all");
    setClassFilter("all");
    setTeacherFilter("all");
    setStatusFilter("all");
    setPeriodFilter("all");
  };

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-white to-blue-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl shadow-sm">
              📋
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                Présences & absences
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-950">
                Pilotage de
                l&apos;assiduité
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                Supervisez les séances,
                présences, absences,
                retards et justificatifs
                à l&apos;échelle de
                l&apos;établissement.
              </p>
            </div>
          </div>

          <button
            className="sn-btn-ghost sn-press"
            onClick={() =>
              void loadOverview()
            }
            disabled={isLoading}
          >
            ↻ Rafraîchir
          </button>
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mode démo actif :
          les données réelles
          d&apos;assiduité ne sont
          pas chargées.
        </div>
      )}

      {!user?.isDemo && (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-gray-950">
                Vue établissement
              </h2>

              <p className="text-sm text-gray-500">
                Les indicateurs
                s&apos;adaptent
                automatiquement aux
                filtres sélectionnés.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                icon="📚"
                label="Séances"
                value={stats.sessions}
              />

              <KpiCard
                icon="✅"
                label="Présences"
                value={stats.present}
              />

              <KpiCard
                icon="❌"
                label="Absences"
                value={stats.absent}
              />

              <KpiCard
                icon="⏰"
                label="Retards"
                value={stats.late}
              />

              <KpiCard
                icon="📈"
                label="Taux d'assiduité"
                value={`${stats.attendanceRate}%`}
              />
            </div>
          </section>

          <section className="sn-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-bold text-gray-950">
                  Filtres
                </div>

                <div className="text-sm text-gray-500">
                  Analysez
                  l&apos;assiduité
                  par année scolaire,
                  classe, enseignant,
                  statut ou période.
                </div>
              </div>

              <button
                className="sn-btn-ghost sn-press"
                onClick={resetFilters}
              >
                Réinitialiser
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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

                {schoolYears.map(
                  (year) => (
                    <option
                      key={year}
                      value={year}
                    >
                      {year}
                    </option>
                  )
                )}
              </FilterSelect>

              <FilterSelect
                label="Classe"
                value={classFilter}
                onChange={
                  setClassFilter
                }
              >
                <option value="all">
                  Toutes les classes
                </option>

                {classes.map(
                  ([id, name]) => (
                    <option
                      key={id}
                      value={id}
                    >
                      {name}
                    </option>
                  )
                )}
              </FilterSelect>

              <FilterSelect
                label="Enseignant"
                value={teacherFilter}
                onChange={
                  setTeacherFilter
                }
              >
                <option value="all">
                  Tous les enseignants
                </option>

                {teachers.map(
                  ([id, name]) => (
                    <option
                      key={id}
                      value={id}
                    >
                      {name}
                    </option>
                  )
                )}
              </FilterSelect>

              <FilterSelect
                label="Statut"
                value={statusFilter}
                onChange={(value) =>
                  setStatusFilter(
                    value as StatusFilter
                  )
                }
              >
                <option value="all">
                  Tous les statuts
                </option>

                <option value="open">
                  Ouvertes
                </option>

                <option value="closed">
                  Clôturées
                </option>

                <option value="draft">
                  Brouillons
                </option>

                <option value="cancelled">
                  Annulées
                </option>
              </FilterSelect>

              <FilterSelect
                label="Période"
                value={periodFilter}
                onChange={(value) =>
                  setPeriodFilter(
                    value as PeriodFilter
                  )
                }
              >
                <option value="all">
                  Toutes les périodes
                </option>

                <option value="today">
                  Aujourd&apos;hui
                </option>

                <option value="week">
                  Cette semaine
                </option>
              </FilterSelect>
            </div>
          </section>

          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({
                length: 4,
              }).map((_, index) => (
                <div
                  key={index}
                  className="sn-card animate-pulse space-y-3 p-5"
                >
                  <div className="h-5 w-1/3 rounded bg-gray-200" />
                  <div className="h-4 w-2/3 rounded bg-gray-100" />
                  <div className="h-16 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="sn-card space-y-3 border border-red-200 bg-red-50 p-5 text-red-700">
              <div className="font-semibold">
                Erreur de chargement
              </div>

              <div className="text-sm">
                {error}
              </div>

              <button
                className="sn-btn-primary sn-press w-fit"
                onClick={() =>
                  void loadOverview()
                }
              >
                Réessayer
              </button>
            </div>
          )}

          {!isLoading &&
            !error && (
              <>
                <SessionSection
                  sessions={
                    filteredSessions
                  }
                />

                <JustificationSection
                  justifications={
                    filteredJustifications
                  }
                  pending={
                    justificationStats.pending
                  }
                  approved={
                    justificationStats.approved
                  }
                  rejected={
                    justificationStats.rejected
                  }
                />
              </>
            )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="sn-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-gray-500">
            {label}
          </div>

          <div className="mt-1 text-2xl font-bold text-gray-950">
            {value}
          </div>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-50 text-xl">
          {icon}
        </div>
      </div>
    </div>
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
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold text-gray-700">
        {label}
      </span>

      <select
        className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
      >
        {children}
      </select>
    </label>
  );
}

function SessionSection({
  sessions,
}: {
  sessions: AdminAttendanceSessionItem[];
}) {
  const [
    query,
    setQuery,
  ] = useState("");

  const [
    page,
    setPage,
  ] = useState(1);

  const searchedSessions =
    useMemo(() => {
      const normalizedQuery =
        normalizeSearchText(query);

      if (!normalizedQuery) {
        return sessions;
      }

      return sessions.filter(
        (session) => {
          const searchableText =
            normalizeSearchText(
              [
                session.courseTitle ?? "",
                session.className,
                session.schoolYear ?? "",
                session.teacherName,
                session.notes ?? "",
                session.sessionDate,
                session.status,
                getSessionStatusLabel(
                  session.status
                ),
              ].join(" ")
            );

          return searchableText.includes(
            normalizedQuery
          );
        }
      );
    }, [
      sessions,
      query,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        searchedSessions.length /
          SESSION_PAGE_SIZE
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  const paginatedSessions =
    useMemo(() => {
      const start =
        (safePage - 1) *
        SESSION_PAGE_SIZE;

      return searchedSessions.slice(
        start,
        start + SESSION_PAGE_SIZE
      );
    }, [
      searchedSessions,
      safePage,
    ]);

  return (
    <section className="sn-card overflow-hidden">
      <div className="border-b border-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-bold text-gray-950">
              Suivi des séances
            </div>

            <div className="text-sm text-gray-500">
              Consultez les appels
              enregistrés dans
              l&apos;établissement.
            </div>
          </div>

          <span className="sn-badge sn-badge-blue">
            {searchedSessions.length} séance
            {searchedSessions.length > 1
              ? "s"
              : ""}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              🔎
            </span>

            <input
              type="search"
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="Rechercher par classe, cours, enseignant, note..."
              value={query}
              onChange={(event) => {
                setQuery(
                  event.target.value
                );

                setPage(1);
              }}
              aria-label="Rechercher une séance"
            />
          </div>

          {query.trim() && (
            <button
              className="sn-btn-ghost sn-press"
              onClick={() => {
                setQuery("");
                setPage(1);
              }}
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {searchedSessions.length === 0 ? (
        <div className="p-10 text-center">
          <div className="text-3xl">
            📭
          </div>

          <div className="mt-3 font-semibold text-gray-900">
            Aucune séance trouvée
          </div>

          <div className="mt-1 text-sm text-gray-500">
            {query.trim()
              ? "Aucune séance ne correspond à votre recherche."
              : "Aucune séance ne correspond actuellement aux filtres sélectionnés."}
          </div>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {paginatedSessions.map(
              (session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                />
              )
            )}
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalItems={
              searchedSessions.length
            }
            pageSize={
              SESSION_PAGE_SIZE
            }
            label="séances"
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

function SessionRow({
  session,
}: {
  session: AdminAttendanceSessionItem;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-bold text-gray-950">
              {session.courseTitle ??
                "Séance sans cours"}
            </div>

            <span
              className={getSessionStatusClass(
                session.status
              )}
            >
              {getSessionStatusLabel(
                session.status
              )}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            <span>
              🏫{" "}
              {session.className}
            </span>

            {session.schoolYear && (
              <span>
                📘{" "}
                {session.schoolYear}
              </span>
            )}

            <span>
              👨‍🏫{" "}
              {session.teacherName}
            </span>

            <span>
              📅{" "}
              {formatDate(
                session.sessionDate
              )}
            </span>

            <span>
              🕒{" "}
              {formatTime(
                session.startsAt
              )}{" "}
              →{" "}
              {formatTime(
                session.endsAt
              )}
            </span>
          </div>

          {session.notes && (
            <div className="mt-2 text-sm text-gray-500">
              Note :{" "}
              {session.notes}
            </div>
          )}

          {session.closedAt && (
            <div className="mt-1 text-xs text-gray-400">
              Clôturée le{" "}
              {formatDateTime(
                session.closedAt
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <CountBadge
            label="Présents"
            icon="✅"
            value={
              session.presentCount
            }
          />

          <CountBadge
            label="Absents"
            icon="❌"
            value={
              session.absentCount
            }
          />

          <CountBadge
            label="Retards"
            icon="⏰"
            value={
              session.lateCount
            }
          />
        </div>
      </div>
    </div>
  );
}

function CountBadge({
  label,
  icon,
  value,
}: {
  label: string;
  icon: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
      <span className="mr-1">
        {icon}
      </span>

      <span className="text-gray-600">
        {label}
      </span>

      <span className="ml-2 font-bold text-gray-950">
        {value}
      </span>
    </div>
  );
}

function JustificationSection({
  justifications,
  pending,
  approved,
  rejected,
}: {
  justifications: AdminAttendanceJustificationItem[];
  pending: number;
  approved: number;
  rejected: number;
}) {
  const [
    query,
    setQuery,
  ] = useState("");

  const [
    page,
    setPage,
  ] = useState(1);

  const searchedJustifications =
    useMemo(() => {
      const normalizedQuery =
        normalizeSearchText(query);

      if (!normalizedQuery) {
        return justifications;
      }

      return justifications.filter(
        (item) => {
          const searchableText =
            normalizeSearchText(
              [
                item.studentName,
                item.className,
                item.courseTitle ?? "",
                item.teacherName,
                item.reason,
                item.reviewNote ?? "",
                item.status,
                getJustificationStatusLabel(
                  item.status
                ),
              ].join(" ")
            );

          return searchableText.includes(
            normalizedQuery
          );
        }
      );
    }, [
      justifications,
      query,
    ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        searchedJustifications.length /
          JUSTIFICATION_PAGE_SIZE
      )
    );

  const safePage =
    Math.min(
      page,
      totalPages
    );

  const paginatedJustifications =
    useMemo(() => {
      const start =
        (safePage - 1) *
        JUSTIFICATION_PAGE_SIZE;

      return searchedJustifications.slice(
        start,
        start +
          JUSTIFICATION_PAGE_SIZE
      );
    }, [
      searchedJustifications,
      safePage,
    ]);

  return (
    <section className="sn-card overflow-hidden">
      <div className="border-b border-gray-100 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-bold text-gray-950">
              Justificatifs
            </div>

            <div className="text-sm text-gray-500">
              Vue de supervision des
              justificatifs transmis
              pour les absences et
              retards.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="sn-badge sn-badge-blue">
              En attente {pending}
            </span>

            <span className="sn-badge sn-badge-green">
              Acceptés {approved}
            </span>

            <span className="sn-badge sn-badge-gray">
              Rejetés {rejected}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              🔎
            </span>

            <input
              type="search"
              className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              placeholder="Rechercher par apprenant, classe, cours, enseignant, motif..."
              value={query}
              onChange={(event) => {
                setQuery(
                  event.target.value
                );

                setPage(1);
              }}
              aria-label="Rechercher un justificatif"
            />
          </div>

          {query.trim() && (
            <button
              className="sn-btn-ghost sn-press"
              onClick={() => {
                setQuery("");
                setPage(1);
              }}
            >
              Effacer
            </button>
          )}

          <span className="sn-badge sn-badge-gray">
            {searchedJustifications.length} résultat
            {searchedJustifications.length > 1
              ? "s"
              : ""}
          </span>
        </div>
      </div>

      {searchedJustifications.length === 0 ? (
        <div className="p-10 text-center">
          <div className="text-3xl">
            📝
          </div>

          <div className="mt-3 font-semibold text-gray-900">
            Aucun justificatif
          </div>

          <div className="mt-1 text-sm text-gray-500">
            {query.trim()
              ? "Aucun justificatif ne correspond à votre recherche."
              : "Aucun justificatif ne correspond actuellement aux filtres sélectionnés."}
          </div>
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {paginatedJustifications.map(
              (item) => (
                <JustificationRow
                  key={item.id}
                  item={item}
                />
              )
            )}
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            totalItems={
              searchedJustifications.length
            }
            pageSize={
              JUSTIFICATION_PAGE_SIZE
            }
            label="justificatifs"
            onPageChange={setPage}
          />
        </>
      )}
    </section>
  );
}

function JustificationRow({
  item,
}: {
  item: AdminAttendanceJustificationItem;
}) {
  return (
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-bold text-gray-950">
              {item.studentName}
            </div>

            <span
              className={getJustificationStatusClass(
                item.status
              )}
            >
              {getJustificationStatusLabel(
                item.status
              )}
            </span>
          </div>

          <div className="mt-1 text-sm text-gray-500">
            {item.className}
            {" • "}
            {item.courseTitle ??
              "Cours non renseigné"}
            {" • "}
            {item.teacherName}
          </div>
        </div>

        <div className="text-xs text-gray-400">
          Envoyé le{" "}
          {formatDateTime(
            item.createdAt
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
            Motif transmis
          </div>

          <div className="mt-2 text-sm text-gray-800">
            {item.reason}
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Décision
          </div>

          <div className="mt-2 text-sm text-gray-800">
            {item.status ===
            "pending"
              ? "En attente de traitement."
              : item.reviewNote ||
                getJustificationStatusLabel(
                  item.status
                )}
          </div>

          {item.reviewedAt && (
            <div className="mt-2 text-xs text-gray-400">
              Traitée le{" "}
              {formatDateTime(
                item.reviewedAt
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  label,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) {
    return null;
  }

  const start =
    (page - 1) * pageSize + 1;

  const end =
    Math.min(
      page * pageSize,
      totalItems
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
      <div className="text-sm text-gray-500">
        Affichage de{" "}
        <span className="font-semibold text-gray-700">
          {start}
        </span>{" "}
        à{" "}
        <span className="font-semibold text-gray-700">
          {end}
        </span>{" "}
        sur{" "}
        <span className="font-semibold text-gray-700">
          {totalItems}
        </span>{" "}
        {label}
      </div>

      <div className="flex items-center gap-2">
        <button
          className="sn-btn-ghost sn-press"
          onClick={() =>
            onPageChange(
              Math.max(
                1,
                page - 1
              )
            )
          }
          disabled={page <= 1}
        >
          ← Précédent
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
          Page {page} / {totalPages}
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() =>
            onPageChange(
              Math.min(
                totalPages,
                page + 1
              )
            )
          }
          disabled={
            page >= totalPages
          }
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}