import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getLiveSessionSummary,
  listLiveSessionsPage,
  readableError,
  LIVE_SESSIONS_PAGE_SIZE,
  type LiveSession,
  type LiveSessionSummary,
  type LiveStatus,
} from "../lib/liveApi";
import {
  listParentLiveChildren,
  type ParentLiveChild,
} from "../lib/parentLiveApi";

function formatLiveDate(value: string): string {
  return new Intl.DateTimeFormat("fr-CI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function visibleStatus(session: LiveSession, now: number): LiveStatus {
  if (
    (session.status === "scheduled" || session.status === "live") &&
    Date.parse(session.ends_at) <= now
  ) {
    return "completed";
  }
  return session.status;
}

function statusLabel(status: LiveStatus): string {
  switch (status) {
    case "scheduled": return "Programmée";
    case "live": return "En direct";
    case "completed": return "Terminée";
    default: return "Annulée";
  }
}

function statusClass(status: LiveStatus): string {
  switch (status) {
    case "live": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "scheduled": return "border-blue-200 bg-blue-50 text-blue-700";
    case "cancelled": return "border-gray-200 bg-gray-100 text-gray-600";
    default: return "border-violet-200 bg-violet-50 text-violet-700";
  }
}

/** Consultation des cours des enfants : aucun appel à Daily, aucune action d'écriture. */
export default function ParentLiveSessionsPage() {
  const { user, loading: authLoading } = useAuth();
  const parentId = user?.role === "parent" && !user.isDemo ? user.id : null;
  const isDemo = Boolean(user?.isDemo);

  const [children, setChildren] = useState<ParentLiveChild[]>([]);
  const [childId, setChildId] = useState("");
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [summary, setSummary] = useState<LiveSessionSummary>({ scheduled: 0, live: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LiveStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [childrenError, setChildrenError] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const childrenRequestId = useRef(0);
  const sessionsRequestId = useRef(0);
  const selectedChild = useMemo(
    () => children.find((item) => item.id === childId) ?? null,
    [children, childId]
  );
  const selectedClassId = selectedChild?.classId ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadChildren = useCallback(async () => {
    const requestId = ++childrenRequestId.current;
    if (!parentId) {
      setChildren([]);
      setChildId("");
      setLoadingChildren(false);
      return;
    }
    setLoadingChildren(true);
    setChildrenError(null);
    try {
      const result = await listParentLiveChildren(parentId);
      if (requestId !== childrenRequestId.current) return;
      setChildren(result);
      setChildId((current) =>
        result.some((child) => child.id === current)
          ? current
          : result[0]?.id ?? ""
      );
    } catch (cause) {
      if (requestId !== childrenRequestId.current) return;
      setChildren([]);
      setChildId("");
      setChildrenError(readableError(cause));
    } finally {
      if (requestId === childrenRequestId.current) setLoadingChildren(false);
    }
  }, [parentId]);

  useEffect(() => {
    if (!authLoading) queueMicrotask(() => void loadChildren());
  }, [authLoading, loadChildren]);

  const refreshSessions = useCallback(async () => {
    const requestId = ++sessionsRequestId.current;
    if (!parentId || !selectedClassId) {
      setSessions([]);
      setTotal(0);
      setSummary({ scheduled: 0, live: 0 });
      setSessionsError(null);
      setLoadingSessions(false);
      return;
    }

    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const [result, counts] = await Promise.all([
        listLiveSessionsPage({
          page,
          classId: selectedClassId,
          search,
          status,
          fromDate,
          toDate,
        }),
        getLiveSessionSummary(selectedClassId),
      ]);
      if (requestId !== sessionsRequestId.current) return;

      if (page > result.pages) {
        setPage(result.pages);
        return;
      }

      setSessions(result.items);
      setTotal(result.count);
      setSummary(counts);
    } catch (cause) {
      if (requestId === sessionsRequestId.current) {
        setSessionsError(readableError(cause));
        setSessions([]);
        setTotal(0);
      }
    } finally {
      if (requestId === sessionsRequestId.current) setLoadingSessions(false);
    }
  }, [parentId, selectedClassId, page, search, status, fromDate, toDate]);

  useEffect(() => {
    if (!authLoading && !loadingChildren) {
      queueMicrotask(() => void refreshSessions());
    }
  }, [authLoading, loadingChildren, refreshSessions]);

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  function selectChild(value: string) {
    setChildId(value);
    setPage(1);
  }

  const hasFilters = Boolean(searchInput || status !== "all" || fromDate || toDate);
  const pages = Math.max(1, Math.ceil(total / LIVE_SESSIONS_PAGE_SIZE));
  const now = Date.now();

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 p-6 text-white shadow-sm sm:p-8">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
          SCHOOLNET LIVE • ESPACE PARENT
        </div>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          Cours en direct de mes enfants
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-blue-50">
          Consultez les cours vidéo programmés, en cours ou passés de vos enfants.
          Cet espace est réservé au suivi : les salles vidéo sont accessibles aux apprenants et aux enseignants.
        </p>
      </section>

      {isDemo && (
        <div className="sn-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          La consultation des séances nécessite un compte Parent / Tuteur réel.
        </div>
      )}

      {childrenError && (
        <div className="sn-card border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p className="font-semibold">Impossible de charger les enfants liés.</p>
          <p className="mt-1">{childrenError}</p>
          <button type="button" onClick={() => void loadChildren()} className="sn-btn-ghost mt-3">
            Réessayer
          </button>
        </div>
      )}

      {loadingChildren || authLoading ? (
        <div className="sn-card p-8 text-center text-sm text-gray-500" role="status">
          Recherche des enfants et de leurs inscriptions...
        </div>
      ) : !childrenError && !isDemo && children.length === 0 ? (
        <div className="sn-card space-y-3 p-8 text-center">
          <div className="text-3xl">👨‍👩‍👧</div>
          <h2 className="font-semibold text-gray-900">Aucun enfant associé à votre compte</h2>
          <p className="text-sm text-gray-500">
            L'administration doit d'abord vérifier et enregistrer le lien avec votre enfant.
          </p>
          <Link className="font-semibold text-blue-700 hover:underline" to="/app/parent/children">
            Consulter mes enfants
          </Link>
        </div>
      ) : children.length > 0 && (
        <>
          <section className="sn-card flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
            <label className="block w-full max-w-xl space-y-2">
              <span className="text-sm font-semibold text-gray-800">
                Enfant concerné
              </span>
              <select
                value={childId}
                onChange={(event) => selectChild(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm"
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.name} — {child.className}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/app/parent/children" className="text-sm font-semibold text-blue-700 hover:underline">
              Voir les dossiers de mes enfants
            </Link>
          </section>

          {selectedChild && !selectedClassId ? (
            <div className="sn-card border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              Aucun dossier scolaire actif et aucune affectation de classe correspondante
              pour {selectedChild.name}. L'administration doit vérifier son inscription.
            </div>
          ) : selectedChild && (
            <>
              <div className="flex flex-wrap items-stretch gap-3">
                <div className="sn-card min-w-40 flex-1 p-4">
                  <div className="text-xs text-gray-500">Séances à venir</div>
                  <div className="mt-1 text-2xl font-extrabold text-gray-900">{summary.scheduled}</div>
                </div>
                <div className="sn-card min-w-40 flex-1 p-4">
                  <div className="text-xs text-gray-500">En direct</div>
                  <div className="mt-1 text-2xl font-extrabold text-emerald-600">{summary.live}</div>
                </div>
                <button
                  type="button"
                  className="sn-btn-ghost self-center"
                  onClick={() => void refreshSessions()}
                  disabled={loadingSessions}
                >
                  Actualiser
                </button>
              </div>

              <section className="space-y-3">
                <h2 className="text-lg font-bold text-gray-900">
                  Séances de {selectedChild.name} — {selectedChild.className}
                </h2>

                <div className="sn-card space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-gray-900">Rechercher et filtrer les séances</h3>
                    <button
                      type="button"
                      className="text-xs font-semibold text-blue-700 disabled:text-gray-400"
                      disabled={!hasFilters}
                      onClick={resetFilters}
                    >
                      Effacer les filtres
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-medium text-gray-600">Recherche par titre</span>
                      <input
                        type="search"
                        value={searchInput}
                        placeholder="Ex. Nombres décimaux"
                        onChange={(event) => { setSearchInput(event.target.value); setPage(1); }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600">Statut</span>
                      <select
                        value={status}
                        onChange={(event) => { setStatus(event.target.value as LiveStatus | "all"); setPage(1); }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      >
                        <option value="all">Tous les statuts</option>
                        <option value="scheduled">Programmées</option>
                        <option value="live">En direct</option>
                        <option value="completed">Terminées</option>
                        <option value="cancelled">Annulées</option>
                      </select>
                    </label>
                    <div className="flex items-center rounded-xl bg-blue-50 px-3 text-xs text-blue-800">
                      Classe déterminée automatiquement par le dossier de l'enfant.
                    </div>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600">Du</span>
                      <input
                        type="date"
                        value={fromDate}
                        max={toDate || undefined}
                        onChange={(event) => { setFromDate(event.target.value); setPage(1); }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-gray-600">Au</span>
                      <input
                        type="date"
                        value={toDate}
                        min={fromDate || undefined}
                        onChange={(event) => { setToDate(event.target.value); setPage(1); }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      />
                    </label>
                  </div>
                </div>

                {sessionsError && (
                  <div className="sn-card border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                    <p>Impossible de charger les séances : {sessionsError}</p>
                    <p className="mt-2 text-xs">
                      Vérifiez que l'inscription est active et que le lien parent-enfant
                      est autorisé dans SCHOOLNET.
                    </p>
                  </div>
                )}

                {loadingSessions ? (
                  <div className="sn-card p-8 text-center text-sm text-gray-500" role="status">
                    Chargement des séances...
                  </div>
                ) : !sessionsError && sessions.length === 0 ? (
                  <div className="sn-card space-y-2 p-8 text-center">
                    <div className="text-3xl">🎥</div>
                    <p className="font-semibold text-gray-900">
                      {hasFilters ? "Aucun résultat pour ces filtres" : "Aucune séance visible"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {hasFilters
                        ? "Modifiez vos critères pour consulter d'autres séances."
                        : "Aucun cours vidéo n'est actuellement accessible pour cette inscription."}
                    </p>
                  </div>
                ) : !sessionsError && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {sessions.map((session) => {
                      const viewStatus = visibleStatus(session, now);
                      return (
                        <article className="sn-card space-y-3 p-5" key={session.id}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h3 className="font-bold text-gray-900">{session.title}</h3>
                            <span className={
                              "rounded-full border px-2.5 py-1 text-xs font-semibold " +
                              statusClass(viewStatus)
                            }>
                              {statusLabel(viewStatus)}
                            </span>
                          </div>
                          {session.description && (
                            <p className="text-sm text-gray-600">{session.description}</p>
                          )}
                          <p className="text-sm text-gray-600">
                            📅 {formatLiveDate(session.starts_at)} – {formatLiveDate(session.ends_at)}
                          </p>
                          <p className="text-xs font-medium text-gray-500">
                            {viewStatus === "live"
                              ? "La salle est ouverte pour les apprenants inscrits."
                              : viewStatus === "scheduled"
                                ? "Séance à venir"
                                : viewStatus === "cancelled"
                                  ? "Séance annulée"
                                  : "Séance terminée"}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}

                {!loadingSessions && !sessionsError && total > 0 && (
                  <div className="sn-card flex flex-wrap items-center justify-between gap-3 p-4">
                    <p className="text-xs text-gray-600">
                      {(page - 1) * LIVE_SESSIONS_PAGE_SIZE + 1}
                      {" à "}
                      {Math.min(page * LIVE_SESSIONS_PAGE_SIZE, total)}
                      {" sur "}
                      {total} séance{total > 1 ? "s" : ""}
                    </p>
                    <nav className="flex items-center gap-2" aria-label="Pagination des séances">
                      <button
                        type="button"
                        className="sn-btn-ghost"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
                      >
                        Précédent
                      </button>
                      <span className="whitespace-nowrap text-sm text-gray-700">
                        Page {page} / {pages}
                      </span>
                      <button
                        type="button"
                        className="sn-btn-ghost"
                        disabled={page >= pages}
                        onClick={() => setPage((value) => Math.min(pages, value + 1))}
                      >
                        Suivant
                      </button>
                    </nav>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
