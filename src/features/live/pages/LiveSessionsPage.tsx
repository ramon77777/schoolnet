import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  cancelLiveSession,
  listLiveSessions,
  listTeacherLiveCourses,
  readableError,
  scheduleLiveSession,
  type LiveCourse,
  type LiveSession,
  type LiveStatus,
} from "../lib/liveApi";

function dateLocal(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function showDate(value: string): string {
  return new Intl.DateTimeFormat("fr-CI", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

function labelForStatus(status: LiveStatus): string {
  if (status === "scheduled") return "Programm\u00e9e";
  if (status === "live") return "En direct";
  if (status === "completed") return "Termin\u00e9e";
  return "Annul\u00e9e";
}

function statusClasses(status: LiveStatus): string {
  if (status === "live") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "scheduled") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "cancelled") return "bg-gray-100 text-gray-500 border-gray-200";
  return "bg-violet-50 text-violet-700 border-violet-200";
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

  const refresh = useCallback(async () => {
    if (
      !user ||
      user.isDemo ||
      !["teacher", "student", "admin"].includes(user.role)
    ) {
      setSessions([]);
      setCourses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [sessionRows, eligible] = await Promise.all([
        listLiveSessions(),
        user.role === "teacher" ? listTeacherLiveCourses(user.id) : Promise.resolve([]),
      ]);
      setSessions(sessionRows);
      setCourses(eligible);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) queueMicrotask(() => { void refresh(); });
  }, [authLoading, refresh]);

  const selectedCourse = useMemo(() => courses.find((x) => x.id === courseId), [courses, courseId]);

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !isTeacher || saving || !courseId) return;
    const begin = new Date(startsLocal);
    const end = new Date(endsLocal);
    if (!Number.isFinite(begin.getTime()) || !Number.isFinite(end.getTime()) || end <= begin) {
      setError("Veuillez saisir un horaire de debut et de fin valide.");
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
      setSuccess("Seance programmee. Les apprenants la retrouveront dans leur espace.");
      await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setSaving(false);
    }
  }

  async function cancelSession(session: LiveSession) {
    if (busyId || !window.confirm("Annuler cette seance ?")) return;
    setBusyId(session.id);
    setError(null);
    try {
      await cancelLiveSession(session.id);
      await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusyId(null);
    }
  }

  const now = Date.now();
  const liveCount = sessions.filter((x) => x.status === "live" && Date.parse(x.ends_at) > now).length;
  const scheduledCount = sessions.filter((x) => x.status === "scheduled" && Date.parse(x.ends_at) > now).length;

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
        <div className="sn-card min-w-36 flex-1 p-4"><div className="text-xs text-gray-500">Seances a venir</div><div className="mt-1 text-2xl font-extrabold">{scheduledCount}</div></div>
        <div className="sn-card min-w-36 flex-1 p-4"><div className="text-xs text-gray-500">En direct</div><div className="mt-1 text-2xl font-extrabold text-emerald-600">{liveCount}</div></div>
        <button className="sn-btn-ghost self-center" type="button" onClick={() => void refresh()} disabled={loading}>Actualiser</button>
      </div>

      {user?.isDemo && (
        <div className="sn-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Les cours video necessitent un compte reel. Le mode demonstration ne permet pas de rejoindre Daily.</div>
      )}

      {error && <div role="alert" className="sn-card border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {success && <div role="status" className="sn-card border-green-200 bg-green-50 p-4 text-sm text-green-800">{success}</div>}

      {isTeacher && !user?.isDemo && (
        <form className="sn-card space-y-4 p-5 sm:p-6" onSubmit={(e) => void createSession(e)}>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Programmer une seance</h2>
            <p className="mt-1 text-sm text-gray-500">Seuls les cours actifs dont vous etes enseignant et affecte a la classe sont disponibles.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Cours et classe *</span>
              <select required className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm" value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={saving}>
                <option value="">Selectionner un cours</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title} - {course.class_name}</option>)}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Debut *</span>
              <input required type="datetime-local" className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} disabled={saving}/>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">Fin *</span>
              <input required type="datetime-local" className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} disabled={saving}/>
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Titre de la seance (facultatif)</span>
              <input maxLength={160} className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder={selectedCourse?.title ?? "Ex. Revision des fractions"} value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving}/>
            </label>
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">Description (facultatif)</span>
              <textarea maxLength={2000} rows={2} className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Objectifs du cours, consignes..." value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving}/>
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="sn-btn-primary" disabled={saving || !courseId}>{saving ? "Enregistrement..." : "+ Programmer la seance"}</button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">
          {isAdmin
            ? "Supervision des séances vidéo"
            : isTeacher
              ? "Mes séances vidéo"
              : "Mes cours vidéo"}
        </h2>
        {loading ? (
          <div className="sn-card p-8 text-center text-sm text-gray-500">Chargement du calendrier...</div>
        ) : sessions.length === 0 ? (
          <div className="sn-card p-8 text-center">
            <div className="text-3xl">&#128249;</div>
            <p className="mt-2 font-semibold">Aucune seance disponible</p>
            <p className="mt-1 text-sm text-gray-500">
              {isAdmin
                ? "Aucune séance vidéo n'a encore été programmée sur SCHOOLNET."
                : isTeacher
                  ? "Programmez votre première séance ci-dessus."
                  : "Vos enseignants n'ont pas encore programmé de cours."}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {sessions.map((item) => {
              const openTime = Date.parse(item.starts_at) - 15 * 60000;
              const endTime = Date.parse(item.ends_at);
              const canJoin =
                !user?.isDemo &&
                now >= openTime &&
                now < endTime &&
                (
                  isTeacher
                    ? item.teacher_id === user?.id &&
                      (item.status === "scheduled" || item.status === "live")
                    : user?.role === "student" && item.status === "live"
                );
              const isPast = now >= endTime;
              const displayStatus: LiveStatus = isPast && item.status === "live" ? "completed" : item.status;
              return (
                <article key={item.id} className="sn-card space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900">{item.title}</h3>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(displayStatus)}`}>{labelForStatus(displayStatus)}</span>
                  </div>
                  {item.description && <p className="text-sm text-gray-600">{item.description}</p>}
                  <p className="text-sm text-gray-600">&#128197; {showDate(item.starts_at)} - {showDate(item.ends_at)}</p>
                  <div className="flex flex-wrap gap-2">
                    {!isAdmin && (
                      <button
                        type="button"
                        className="sn-btn-primary"
                        disabled={!canJoin}
                        onClick={() =>
                          navigate(
                            `/app/${isTeacher ? "teacher" : "student"}/live/${item.id}`
                          )
                        }
                      >
                        {isTeacher ? "Démarrer / rejoindre" : "Rejoindre le cours"}
                      </button>
                    )}

                    {(isAdmin ||
                      (isTeacher && item.teacher_id === user?.id)) &&
                      item.status === "scheduled" &&
                      !isPast && (
                        <button
                          type="button"
                          className="sn-btn-ghost"
                          disabled={busyId !== null}
                          onClick={() => void cancelSession(item)}
                        >
                          {busyId === item.id ? "Annulation..." : "Annuler la séance"}
                        </button>
                      )}
                  </div>
                  {!canJoin && !isPast && item.status === "scheduled" && (
                    <p className="text-xs text-gray-500">{isTeacher ? "Disponible 15 minutes avant le debut." : "En attente du demarrage par l'enseignant."}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
