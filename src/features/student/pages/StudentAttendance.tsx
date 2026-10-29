import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getAttendanceErrorMessage,
  getStudentAttendanceHistory,
} from "@/features/attendance/lib/attendanceApi";

import type {
  AttendanceStatus,
  StudentAttendanceHistoryItem,
} from "@/features/attendance/types/attendance.types";

import { useAuth } from "@/lib/auth/AuthProvider";

type AttendanceFilter =
  | "all"
  | AttendanceStatus;

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return value.slice(0, 5);
}

function statusLabel(
  status: AttendanceStatus
) {
  switch (status) {
    case "present":
      return "Présent";

    case "absent":
      return "Absent";

    case "late":
      return "Retard";
  }
}

function statusBadgeClass(
  status: AttendanceStatus
) {
  switch (status) {
    case "present":
      return "sn-badge sn-badge-green";

    case "absent":
      return "sn-badge bg-red-50 text-red-700";

    case "late":
      return "sn-badge bg-amber-50 text-amber-700";
  }
}

function justificationLabel(
  status: "pending" | "approved" | "rejected"
) {
  switch (status) {
    case "pending":
      return "En attente";

    case "approved":
      return "Accepté";

    case "rejected":
      return "Rejeté";
  }
}

function justificationBadgeClass(
  status: "pending" | "approved" | "rejected"
) {
  switch (status) {
    case "pending":
      return "sn-badge bg-amber-50 text-amber-700";

    case "approved":
      return "sn-badge sn-badge-green";

    case "rejected":
      return "sn-badge bg-red-50 text-red-700";
  }
}

export default function StudentAttendance() {
  const {
    user,
    loading: authLoading,
  } = useAuth();

  const [history, setHistory] = useState<
    StudentAttendanceHistoryItem[]
  >([]);

  const [filter, setFilter] =
    useState<AttendanceFilter>("all");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState<
    string | null
  >(null);

  const loadHistory =
    useCallback(async () => {
      if (!user || user.isDemo) {
        setHistory([]);
        setLoading(false);
        setError(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const data =
          await getStudentAttendanceHistory(
            user.id
          );

        setHistory(data);
      } catch (err) {
        console.error(
          "[StudentAttendance] loadHistory error:",
          err
        );

        setError(
          getAttendanceErrorMessage(
            err,
            "Impossible de charger votre historique d'assiduité."
          )
        );

        setHistory([]);
      } finally {
        setLoading(false);
      }
    }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadHistory();
  }, [authLoading, loadHistory]);

  const statistics = useMemo(() => {
    const present = history.filter(
      (item) => item.status === "present"
    ).length;

    const absent = history.filter(
      (item) => item.status === "absent"
    ).length;

    const late = history.filter(
      (item) => item.status === "late"
    ).length;

    const total = history.length;

    /**
     * Une présence en retard reste une présence
     * dans le calcul global d'assiduité.
     */
    const attendanceRate =
      total > 0
        ? Math.round(
            ((present + late) / total) * 100
          )
        : 0;

    return {
      present,
      absent,
      late,
      total,
      attendanceRate,
    };
  }, [history]);

  const filteredHistory =
    useMemo(() => {
      if (filter === "all") {
        return history;
      }

      return history.filter(
        (item) => item.status === filter
      );
    }, [filter, history]);

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      {/* =====================================================
          HERO
          ===================================================== */}

      <section className="sn-card p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              🕒
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                Présences & absences
              </div>

              <h1 className="mt-1 text-2xl font-bold text-gray-950">
                Mon assiduité
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-gray-500">
                Consulte tes présences, absences et
                retards ainsi que le suivi de tes
                justificatifs.
              </p>
            </div>
          </div>

          <button
            className="sn-btn-ghost sn-press"
            onClick={() =>
              void loadHistory()
            }
            disabled={isLoading}
          >
            ↻ Rafraîchir
          </button>
        </div>
      </section>

      {user?.isDemo && (
        <div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Mode démo actif : les données
          d'assiduité Supabase ne sont pas
          chargées.
        </div>
      )}

      {/* =====================================================
          CHARGEMENT
          ===================================================== */}

      {isLoading && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({
              length: 5,
            }).map((_, index) => (
              <div
                key={index}
                className="sn-card animate-pulse p-5"
              >
                <div className="h-3 w-24 rounded bg-gray-100" />
                <div className="mt-3 h-8 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>

          <div className="sn-card animate-pulse p-6">
            <div className="h-5 w-48 rounded bg-gray-200" />
            <div className="mt-5 h-24 rounded-2xl bg-gray-100" />
          </div>
        </div>
      )}

      {/* =====================================================
          ERREUR
          ===================================================== */}

      {!isLoading && error && (
        <div className="sn-card space-y-3 border border-red-200 bg-red-50 p-5 text-red-700">
          <div className="font-semibold">
            Impossible de charger ton assiduité
          </div>

          <div className="text-sm">
            {error}
          </div>

          <button
            className="sn-btn-primary sn-press w-fit"
            onClick={() =>
              void loadHistory()
            }
          >
            Réessayer
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* =================================================
              INDICATEURS
              ================================================= */}

          <section>
            <div className="mb-3">
              <h2 className="font-bold text-gray-950">
                Mes indicateurs
              </h2>

              <p className="text-sm text-gray-500">
                Calculés à partir des appels
                clôturés enregistrés dans SchoolNet.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                icon="✅"
                label="Présences"
                value={statistics.present}
              />

              <StatCard
                icon="❌"
                label="Absences"
                value={statistics.absent}
              />

              <StatCard
                icon="⏰"
                label="Retards"
                value={statistics.late}
              />

              <StatCard
                icon="📚"
                label="Séances"
                value={statistics.total}
              />

              <StatCard
                icon="📈"
                label="Taux d'assiduité"
                value={`${statistics.attendanceRate}%`}
              />
            </div>
          </section>

          {/* =================================================
              HISTORIQUE
              ================================================= */}

          <section className="sn-card overflow-hidden">
            <div className="border-b border-gray-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-bold text-gray-950">
                    Historique personnel
                  </h2>

                  <p className="text-sm text-gray-500">
                    Seuls les appels clôturés qui
                    te concernent sont affichés.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterButton
                    active={filter === "all"}
                    onClick={() =>
                      setFilter("all")
                    }
                  >
                    Tous ({statistics.total})
                  </FilterButton>

                  <FilterButton
                    active={
                      filter === "present"
                    }
                    onClick={() =>
                      setFilter("present")
                    }
                  >
                    Présents (
                    {statistics.present})
                  </FilterButton>

                  <FilterButton
                    active={
                      filter === "absent"
                    }
                    onClick={() =>
                      setFilter("absent")
                    }
                  >
                    Absents (
                    {statistics.absent})
                  </FilterButton>

                  <FilterButton
                    active={filter === "late"}
                    onClick={() =>
                      setFilter("late")
                    }
                  >
                    Retards (
                    {statistics.late})
                  </FilterButton>
                </div>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl">
                  📭
                </div>

                <div className="mt-3 font-semibold text-gray-900">
                  Aucun appel trouvé
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Aucun enregistrement ne
                  correspond actuellement à ce
                  filtre.
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredHistory.map(
                  (item) => (
                    <AttendanceHistoryCard
                      key={item.recordId}
                      item={item}
                    />
                  )
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="sn-card p-5">
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

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`sn-btn-ghost sn-press ${
        active
          ? "ring-2 ring-blue-200"
          : ""
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AttendanceHistoryCard({
  item,
}: {
  item: StudentAttendanceHistoryItem;
}) {
  const justification =
    item.justification;

  return (
    <article className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-950">
              {item.courseTitle ??
                "Appel général"}
            </h3>

            <span
              className={statusBadgeClass(
                item.status
              )}
            >
              {statusLabel(item.status)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              🏫 {item.className}
            </span>

            <span>
              📅{" "}
              {formatDate(
                item.sessionDate
              )}
            </span>

            <span>
              🕒{" "}
              {formatTime(
                item.startsAt
              )}{" "}
              →{" "}
              {formatTime(
                item.endsAt
              )}
            </span>
          </div>
        </div>
      </div>

      {(item.status === "late" ||
        item.comment) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {item.status === "late" && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Retard
              </div>

              <div className="mt-2 text-sm text-gray-700">
                {item.minutesLate} minute
                {item.minutesLate > 1
                  ? "s"
                  : ""}{" "}
                de retard
                {item.arrivalTime
                  ? ` • arrivée à ${formatTime(
                      item.arrivalTime
                    )}`
                  : ""}
              </div>
            </div>
          )}

          {item.comment && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Commentaire
              </div>

              <div className="mt-2 text-sm text-gray-700">
                {item.comment}
              </div>
            </div>
          )}
        </div>
      )}

      {(item.status === "absent" ||
        item.status === "late") && (
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-semibold text-gray-900">
              Justificatif
            </div>

            {justification ? (
              <span
                className={justificationBadgeClass(
                  justification.status
                )}
              >
                {justificationLabel(
                  justification.status
                )}
              </span>
            ) : (
              <span className="sn-badge sn-badge-gray">
                Aucun justificatif
              </span>
            )}
          </div>

          {justification && (
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <span className="text-gray-500">
                  Motif :
                </span>{" "}
                <span className="text-gray-800">
                  {justification.reason}
                </span>
              </div>

              {justification.reviewNote && (
                <div>
                  <span className="text-gray-500">
                    Décision :
                  </span>{" "}
                  <span className="text-gray-800">
                    {
                      justification.reviewNote
                    }
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}