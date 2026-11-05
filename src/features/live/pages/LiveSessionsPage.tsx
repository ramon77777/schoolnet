import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  cancelLiveSession,
  listLiveSessionsPage,
  getLiveSessionById,
  getLiveSessionSummary,
  listLiveClassOptions,
  LIVE_SESSIONS_PAGE_SIZE,
  listTeacherLiveCourses,
  readableError,
  scheduleLiveSession,
  type LiveCourse,
  type LiveSession,
  type LiveStatus,
  type LiveClassOption,
  type LiveSessionSummary,
} from "../lib/liveApi";

// Doit etre identique a la cle utilisee par LiveRoomPage.tsx.
// Aucun identifiant Daily secret n'est conserve ici.
const RESUME_KEY = "schoolnet:live:resume:v1";
const RESUME_MAX_AGE_MS = 4 * 60 * 60 * 1000;

type SavedSession = {
  sessionId: string;
  userId: string;
  role: "teacher" | "student";
  savedAt: number;
};

function getSavedSession(): SavedSession | null {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const entry = value as Partial<SavedSession>;
    if (
      typeof entry.sessionId !== "string" ||
      typeof entry.userId !== "string" ||
      (entry.role !== "teacher" && entry.role !== "student") ||
      typeof entry.savedAt !== "number" ||
      !Number.isFinite(entry.savedAt) ||
      Date.now() < entry.savedAt ||
      Date.now() - entry.savedAt > RESUME_MAX_AGE_MS
    ) {
      clearSavedSession();
      return null;
    }
    return entry as SavedSession;
  } catch {
    return null;
  }
}

function clearSavedSession() {
  try {
    window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // Le navigateur peut desactiver le stockage prive.
  }
}

function dateLocal(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function showDate(value: string): string {
  return new Intl.DateTimeFormat("fr-CI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function labelForStatus(status: LiveStatus): string {
  if (status === "scheduled") return "Programmée";
  if (status === "live") return "En direct";
  if (status === "completed") return "Terminée";
  return "Annulée";
}

function statusClasses(status: LiveStatus): string {
  if (status === "live") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "scheduled") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "cancelled") return "bg-gray-100 text-gray-500 border-gray-200";
  return "bg-violet-50 text-violet-700 border-violet-200";
}

function isSessionJoinable(
  session: LiveSession,
  role: "teacher" | "student",
  userId: string,
  now: number
): boolean {
  const starts = Date.parse(session.starts_at);
  const ends = Date.parse(session.ends_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends)) return false;
  if (now < starts - 15 * 60000 || now >= ends) return false;
  if (role === "teacher") {
    return (
      session.teacher_id === userId &&
      (session.status === "scheduled" || session.status === "live")
    );
  }
  return session.status === "live";
}

export default function LiveSessionsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isTeacher = user?.role === "teacher";
  const isAdmin = user?.role === "admin";
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [courses, setCourses] = useState<LiveCourse[]>([]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsLocal, setStartsLocal] = useState(() => dateLocal(60));
  const [endsLocal, setEndsLocal] = useState(() => dateLocal(120));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const autoResumeStarted = useRef(false);
  const requestCounter = useRef(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LiveStatus | "all">("all");
  const [classFilter, setClassFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [classOptions, setClassOptions] = useState<LiveClassOption[]>([]);
  const [summary, setSummary] = useState<LiveSessionSummary>({ scheduled: 0, live: 0 });

  const userId = user?.id;
  const userRole = user?.role;
  const isDemo = Boolean(user?.isDemo);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const refresh = useCallback(async () => {
    if (!userId || isDemo || !userRole ||
        !["teacher", "student", "admin"].includes(userRole)) {
      setSessions([]);
      setCourses([]);
      setTotal(0);
      setSummary({ scheduled: 0, live: 0 });
      setLoading(false);
      return;
    }
    const requestId = ++requestCounter.current;
    setLoading(true);
    setError(null);
    try {
      const [result, totals, eligible, availableClasses] = await Promise.all([
        listLiveSessionsPage({
          page,
          search: debouncedSearch,
          status: statusFilter,
          classId: classFilter,
          fromDate,
          toDate,
        }),
        getLiveSessionSummary(),
        userRole === "teacher"
          ? listTeacherLiveCourses(userId)
          : Promise.resolve([] as LiveCourse[]),
        // Failure to load class labels must not block the calendar.
        listLiveClassOptions().catch(() => [] as LiveClassOption[]),
      ]);
      if (requestId !== requestCounter.current) return;
      if (page > result.pages) {
        setPage(result.pages);
        return;
      }
      setSessions(result.items);
      setTotal(result.count);
      setSummary(totals);
      setCourses(eligible);
      setClassOptions(availableClasses);
    } catch (cause) {
      if (requestId === requestCounter.current) setError(readableError(cause));
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [
    userId, userRole, isDemo, page, debouncedSearch,
    statusFilter, classFilter, fromDate, toDate,
  ]);

  useEffect(() => {
    if (!authLoading) queueMicrotask(() => void refresh());
  }, [authLoading, refresh]);

  // A resumed call can be absent from the current paginated/filtered page.
  // Fetch its metadata by ID under RLS and let the Edge Function verify access.
  useEffect(() => {
    if (authLoading || autoResumeStarted.current || !userId ||
        isDemo || (userRole !== "teacher" && userRole !== "student")) return;
    const pending = getSavedSession();
    if (!pending) return;
    if (pending.userId !== userId || pending.role !== userRole) {
      clearSavedSession();
      return;
    }
    let cancelled = false;
    async function resumeIfAllowed() {
      try {
        const session = await getLiveSessionById(pending!.sessionId);
        if (cancelled) return;
        if (!session || !isSessionJoinable(session, userRole as "teacher" | "student", userId as string, Date.now())) {
          clearSavedSession();
          return;
        }
        autoResumeStarted.current = true;
        clearSavedSession();
        navigate(`/app/${userRole}/live/${session.id}`, {
          replace: true,
          state: { schoolnetLiveResume: true },
        });
      } catch {
        // No unauthorized or stale session is automatically rejoined.
        if (!cancelled) clearSavedSession();
      }
    }
    void resumeIfAllowed();
    return () => { cancelled = true; };
  }, [authLoading, isDemo, navigate, userId, userRole]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId),
    [courses, courseId]
  );

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !isTeacher || saving || !courseId) return;
    const begin = new Date(startsLocal);
    const end = new Date(endsLocal);
    if (!Number.isFinite(begin.getTime()) || !Number.isFinite(end.getTime()) || end <= begin) {
      setError("Veuillez saisir un horaire de début et de fin valide.");
      return;
    }
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await scheduleLiveSession({
        courseId,
        teacherId: user.id,
        startsAtIso: begin.toISOString(),
        endsAtIso: end.toISOString(),
        title: title.trim() || selectedCourse?.title || "Cours en direct",
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
      setSuccess("Séance programmée. Les apprenants la retrouveront dans leur espace.");
      await refresh();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function cancelSession(session: LiveSession) {
    if (busyId || !window.confirm("Annuler cette séance ?")) return;
    setBusyId(session.id);
    setError(null);
    try {
      await cancelLiveSession(session.id);
      await refresh();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusyId(null);
    }
  }

  function openSession(id: string) {
    if (!user || (user.role !== "teacher" && user.role !== "student")) return;
    // Une demande manuelle remplace une ancienne reprise eventuelle.
    clearSavedSession();
    navigate(`/app/${user.role}/live/${id}`);
  }

  const now = Date.now();
  const liveCount = summary.live;
  const scheduledCount = summary.scheduled;
  const pages = Math.max(1, Math.ceil(total / LIVE_SESSIONS_PAGE_SIZE));
  const filtered = Boolean(search || classFilter || fromDate || toDate || statusFilter !== "all");

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setClassFilter("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 p-6 text-white shadow-sm sm:p-8">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">SCHOOLNET LIVE</div>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Cours en direct</h1>
        <p className="mt-2 max-w-2xl text-sm text-blue-50">
          {isAdmin
            ? "Supervisez les cours vidéo, consultez les séances programmées et suivez leur déroulement."
            : isTeacher
              ? "Programmez vos cours vidéo et accueillez vos apprenants dans une salle sécurisée."
              : "Consultez votre programme et rejoignez les cours ouverts par vos enseignants."}
        </p>
      </section>

      <div className="flex flex-wrap items-stretch gap-3">
        <div className="sn-card min-w-36 flex-1 p-4">
          <div className="text-xs text-gray-500">Séances à venir</div>
          <div className="mt-1 text-2xl font-extrabold">{scheduledCount}</div>
        </div>
        <div className="sn-card min-w-36 flex-1 p-4">
          <div className="text-xs text-gray-500">En direct</div>
          <div className="mt-1 text-2xl font-extrabold text-emerald-600">{liveCount}</div>
        </div>
        <button className="sn-btn-ghost self-center" type="button" onClick={() => void refresh()} disabled={loading}>
          Actualiser
        </button>
      </div>

      {user?.isDemo && (
        <div className="sn-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Les cours vidéo nécessitent un compte réel. Le mode démonstration ne permet pas de rejoindre Daily.
        </div>
      )}
      {error && (
        <div role="alert" className="sn-card border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div role="status" className="sn-card border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</div>
      )}

      {isTeacher && !user?.isDemo && (
        <form className="sn-card space-y-4 p-5 sm:p-6" onSubmit={(event) => void createSession(event)}>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Programmer une séance</h2>
            <p className="mt-1 text-sm text-gray-500">
              Seuls les cours actifs dont vous êtes enseignant et affecté à la classe sont disponibles.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Cours et classe *</span>
              <select required className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm" value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={saving}>
                <option value="">Sélectionner un cours</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>{course.title} - {course.class_name}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Début *</span>
              <input required type="datetime-local" className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" value={startsLocal} onChange={(event) => setStartsLocal(event.target.value)} disabled={saving} />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Fin *</span>
              <input required type="datetime-local" className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" value={endsLocal} onChange={(event) => setEndsLocal(event.target.value)} disabled={saving} />
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Titre de la séance (facultatif)</span>
              <input maxLength={160} className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder={selectedCourse?.title ?? "Ex. Révision des fractions"} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving} />
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Description (facultatif)</span>
              <textarea maxLength={2000} rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Objectifs du cours, consignes..." value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving} />
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="sn-btn-primary" disabled={saving || !courseId}>
              {saving ? "Enregistrement..." : "+ Programmer la séance"}
            </button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">
          {isAdmin ? "Supervision des séances vidéo" : isTeacher ? "Mes séances vidéo" : "Mes cours vidéo"}
        </h2>
        <div className="sn-card space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900">Rechercher et filtrer les séances</h3>
            <button type="button" onClick={clearFilters} disabled={!filtered}
              className="text-xs font-semibold text-blue-700 disabled:text-gray-400">
              Effacer les filtres
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-gray-600">Recherche par titre</span>
              <input type="search" placeholder="Ex. Nombres décimaux"
                value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Statut</span>
              <select value={statusFilter}
                onChange={(event) => { setStatusFilter(event.target.value as LiveStatus | "all"); setPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
                <option value="all">Tous les statuts</option>
                <option value="scheduled">Programmées</option>
                <option value="live">En direct</option>
                <option value="completed">Terminées</option>
                <option value="cancelled">Annulées</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Classe</span>
              <select value={classFilter}
                onChange={(event) => { setClassFilter(event.target.value); setPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
                <option value="">Toutes les classes</option>
                {classOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Du</span>
              <input type="date" value={fromDate} max={toDate || undefined}
                onChange={(event) => { setFromDate(event.target.value); setPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-600">Au</span>
              <input type="date" value={toDate} min={fromDate || undefined}
                onChange={(event) => { setToDate(event.target.value); setPage(1); }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm" />
            </label>
          </div>
          <p className="text-xs text-gray-500">
            La recherche et la pagination sont effectuées sur Supabase, selon vos droits d'accès.
          </p>
        </div>
        {loading ? (
          <div className="sn-card p-8 text-center text-sm text-gray-500">Chargement du calendrier...</div>
        ) : sessions.length === 0 ? (
          <div className="sn-card p-8 text-center">
            <div className="text-3xl">&#128249;</div>
            <p className="mt-2 font-semibold">{filtered ? "Aucun résultat pour ces filtres" : "Aucune séance disponible"}</p>
            <p className="mt-1 text-sm text-gray-500">
              {filtered
                ? "Modifiez vos critères de recherche ou effacez les filtres."
                : isAdmin
                  ? "Aucune séance vidéo n'a encore été programmée sur SCHOOLNET."
                  : isTeacher
                    ? "Programmez votre première séance ci-dessus."
                    : "Vos enseignants n'ont pas encore programmé de cours."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sessions.map((item) => {
              const endTime = Date.parse(item.ends_at);
              const isPast = now >= endTime;
              const displayStatus: LiveStatus =
                isPast && item.status === "live" ? "completed" : item.status;
              const canJoin =
                !user?.isDemo &&
                (user?.role === "teacher" || user?.role === "student") &&
                isSessionJoinable(item, user.role, user.id, now);

              return (
                <article key={item.id} className="sn-card space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900">{item.title}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(displayStatus)}`}>
                      {labelForStatus(displayStatus)}
                    </span>
                  </div>
                  {item.description && <p className="text-sm text-gray-600">{item.description}</p>}
                  <p className="text-sm text-gray-600">&#128197; {showDate(item.starts_at)} - {showDate(item.ends_at)}</p>
                  <div className="flex flex-wrap gap-2">
                    {!isAdmin && (
                      canJoin ? (
                        <button type="button" className="sn-btn-primary"
                          onClick={() => openSession(item.id)}>
                          {isTeacher ? "Démarrer / rejoindre" : "Rejoindre le cours"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                          {displayStatus === "cancelled"
                            ? "Séance annulée"
                            : displayStatus === "completed" || isPast
                              ? "Séance terminée"
                              : "Pas encore accessible"}
                        </span>
                      )
                    )}
                    {(isAdmin || (isTeacher && item.teacher_id === user?.id)) &&
                      item.status === "scheduled" &&
                      !isPast && (
                        <button type="button" className="sn-btn-ghost" disabled={busyId !== null} onClick={() => void cancelSession(item)}>
                          {busyId === item.id ? "Annulation..." : "Annuler la séance"}
                        </button>
                      )}
                  </div>
                  {!canJoin && !isPast && item.status === "scheduled" && !isAdmin && (
                    <p className="text-xs text-gray-500">
                      {isTeacher ? "Disponible 15 minutes avant le début." : "En attente du démarrage par l'enseignant."}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {!loading && total > 0 && (
          <div className="sn-card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-xs text-gray-600">
              {((page - 1) * LIVE_SESSIONS_PAGE_SIZE) + 1}
              {" à "}
              {Math.min(page * LIVE_SESSIONS_PAGE_SIZE, total)}
              {" sur "}
              {total} séance{total > 1 ? "s" : ""}
            </p>
            <nav className="flex items-center gap-2" aria-label="Pagination des séances">
              <button type="button" className="sn-btn-ghost"
                disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Précédent
              </button>
              <span className="whitespace-nowrap text-sm font-medium text-gray-700">
                Page {page} / {pages}
              </span>
              <button type="button" className="sn-btn-ghost"
                disabled={page >= pages} onClick={() => setPage((current) => Math.min(pages, current + 1))}>
                Suivant
              </button>
            </nav>
          </div>
        )}
      </section>
    </div>
  );
}
