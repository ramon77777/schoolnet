
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
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

// Doit être identique à la clé utilisée par LiveRoomPage.tsx.
// Aucun identifiant Daily secret n'est conservé ici.
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
    // Le navigateur peut désactiver le stockage privé.
  }
}

function dateLocal(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const local = new Date(
    d.getTime() - d.getTimezoneOffset() * 60000
  );

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
  if (status === "live") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "scheduled") {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }

  if (status === "cancelled") {
    return "bg-gray-100 text-gray-500 border-gray-200";
  }

  return "bg-violet-50 text-violet-700 border-violet-200";
}

// Contrôle local de l'accès à la salle.
// Le serveur effectue toujours les vérifications définitives.
function isSessionJoinable(
  session: LiveSession,
  role: "teacher" | "student",
  userId: string,
  now: number
): boolean {
  const starts = Date.parse(session.starts_at);
  const ends = Date.parse(session.ends_at);

  if (
    !Number.isFinite(starts) ||
    !Number.isFinite(ends)
  ) {
    return false;
  }

  if (now < starts - 15 * 60000 || now >= ends) {
    return false;
  }

  if (role === "teacher") {
    return (
      session.teacher_id === userId &&
      (session.status === "scheduled" ||
        session.status === "live")
    );
  }

  return session.status === "live";
}

// Nouveau : libellé adapté à l'état réel de la séance.
function getJoinButtonLabel(
  session: LiveSession,
  isPast: boolean,
  canJoin: boolean,
  isTeacher: boolean
): string {
  if (session.status === "cancelled") {
    return "Séance annulée";
  }

  if (
    session.status === "completed" ||
    (session.status === "live" && isPast)
  ) {
    return "Séance terminée";
  }

  if (isPast) {
    return "Créneau expiré";
  }

  if (canJoin) {
    return isTeacher
      ? "Démarrer / rejoindre"
      : "Rejoindre le cours";
  }

  if (session.status === "scheduled") {
    return isTeacher
      ? "Disponible prochainement"
      : "En attente du démarrage";
  }

  return "Accès indisponible";
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

  const [startsLocal, setStartsLocal] = useState(
    () => dateLocal(60)
  );

  const [endsLocal, setEndsLocal] = useState(
    () => dateLocal(120)
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const autoResumeStarted = useRef(false);

  // Nouveau : horloge réactive.
  // Les boutons et statuts sont réévalués toutes les 15 secondes.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const updateNow = () => {
      setNow(Date.now());
    };

    const timer = window.setInterval(updateNow, 15000);

    // Actualisation immédiate lorsque l'utilisateur revient
    // sur l'onglet après une période d'inactivité.
    document.addEventListener("visibilitychange", updateNow);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener(
        "visibilitychange",
        updateNow
      );
    };
  }, []);

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
        user.role === "teacher"
          ? listTeacherLiveCourses(user.id)
          : Promise.resolve([] as LiveCourse[]),
      ]);

      setSessions(sessionRows);
      setCourses(eligible);
      setNow(Date.now());
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      queueMicrotask(() => void refresh());
    }
  }, [authLoading, refresh]);

  // Reprise automatique après navigation.
  // Les droits et les horaires sont vérifiés avant la reprise.
  // Le serveur contrôle à nouveau l'accès à la salle.
  useEffect(() => {
    if (
      authLoading ||
      loading ||
      autoResumeStarted.current ||
      !user
    ) {
      return;
    }

    if (
      user.isDemo ||
      (user.role !== "teacher" &&
        user.role !== "student")
    ) {
      return;
    }

    const pending = getSavedSession();

    if (!pending) return;

    if (
      pending.userId !== user.id ||
      pending.role !== user.role
    ) {
      clearSavedSession();
      return;
    }

    const match = sessions.find(
      (item) => item.id === pending.sessionId
    );

    if (
      !match ||
      !isSessionJoinable(
        match,
        user.role,
        user.id,
        Date.now()
      )
    ) {
      clearSavedSession();
      return;
    }

    autoResumeStarted.current = true;

    // Évite une boucle de navigation.
    // La salle redémarrera avec les médias désactivés.
    clearSavedSession();

    navigate(`/app/${user.role}/live/${match.id}`, {
      replace: true,
      state: {
        schoolnetLiveResume: true,
      },
    });
  }, [
    authLoading,
    loading,
    navigate,
    sessions,
    user,
  ]);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === courseId),
    [courses, courseId]
  );

  async function createSession(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !user ||
      !isTeacher ||
      saving ||
      !courseId
    ) {
      return;
    }

    const begin = new Date(startsLocal);
    const end = new Date(endsLocal);

    if (
      !Number.isFinite(begin.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= begin
    ) {
      setError(
        "Veuillez saisir un horaire de début et de fin valide."
      );
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
        title:
          title.trim() ||
          selectedCourse?.title ||
          "Cours en direct",
        description: description.trim(),
      });

      setTitle("");
      setDescription("");

      setSuccess(
        "Séance programmée. Les apprenants la retrouveront dans leur espace."
      );

      await refresh();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function cancelSession(session: LiveSession) {
    if (
      busyId ||
      !window.confirm("Annuler cette séance ?")
    ) {
      return;
    }

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
    if (
      !user ||
      (user.role !== "teacher" &&
        user.role !== "student")
    ) {
      return;
    }

    // Une demande manuelle remplace une ancienne reprise.
    clearSavedSession();

    navigate(`/app/${user.role}/live/${id}`);
  }

  const liveCount = sessions.filter(
    (item) =>
      item.status === "live" &&
      Date.parse(item.ends_at) > now
  ).length;

  const scheduledCount = sessions.filter(
    (item) =>
      item.status === "scheduled" &&
      Date.parse(item.ends_at) > now
  ).length;

  return (
    <div className="space-y-5 pb-8">
      {/* En-tête */}
      <section className="rounded-3xl bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 p-6 text-white shadow-sm sm:p-8">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">
          SCHOOLNET LIVE
        </div>

        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          Cours en direct
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-blue-50">
          {isAdmin
            ? "Supervisez les cours vidéo, consultez les séances programmées et suivez leur déroulement."
            : isTeacher
              ? "Programmez vos cours vidéo et accueillez vos apprenants dans une salle sécurisée."
              : "Consultez votre programme et rejoignez les cours ouverts par vos enseignants."}
        </p>
      </section>

      {/* Statistiques */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="sn-card min-w-36 flex-1 p-4">
          <div className="text-xs text-gray-500">
            Séances à venir
          </div>

          <div className="mt-1 text-2xl font-extrabold">
            {scheduledCount}
          </div>
        </div>

        <div className="sn-card min-w-36 flex-1 p-4">
          <div className="text-xs text-gray-500">
            En direct
          </div>

          <div className="mt-1 text-2xl font-extrabold text-emerald-600">
            {liveCount}
          </div>
        </div>

        <button
          className="sn-btn-ghost self-center"
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
        >
          Actualiser
        </button>
      </div>

      {/* Mode démonstration */}
      {user?.isDemo && (
        <div className="sn-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Les cours vidéo nécessitent un compte réel.
          Le mode démonstration ne permet pas de rejoindre Daily.
        </div>
      )}

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="sn-card border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="sn-card border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {success}
        </div>
      )}

      {/* Programmation : enseignants uniquement */}
      {isTeacher && !user?.isDemo && (
        <form
          className="sn-card space-y-4 p-5 sm:p-6"
          onSubmit={(event) => void createSession(event)}
        >
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Programmer une séance
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Seuls les cours actifs dont vous êtes enseignant
              et affecté à la classe sont disponibles.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                Cours et classe *
              </span>

              <select
                required
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm"
                value={courseId}
                onChange={(event) =>
                  setCourseId(event.target.value)
                }
                disabled={saving}
              >
                <option value="">
                  Sélectionner un cours
                </option>

                {courses.map((course) => (
                  <option
                    key={course.id}
                    value={course.id}
                  >
                    {course.title} - {course.class_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">
                Début *
              </span>

              <input
                required
                type="datetime-local"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm"
                value={startsLocal}
                onChange={(event) =>
                  setStartsLocal(event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-gray-700">
                Fin *
              </span>

              <input
                required
                type="datetime-local"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm"
                value={endsLocal}
                onChange={(event) =>
                  setEndsLocal(event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                Titre de la séance (facultatif)
              </span>

              <input
                maxLength={160}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm"
                placeholder={
                  selectedCourse?.title ??
                  "Ex. Révision des fractions"
                }
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                disabled={saving}
              />
            </label>

            <label className="block space-y-2 sm:col-span-2">
              <span className="text-sm font-semibold text-gray-700">
                Description (facultatif)
              </span>

              <textarea
                maxLength={2000}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm"
                placeholder="Objectifs du cours, consignes..."
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                disabled={saving}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="sn-btn-primary"
              disabled={saving || !courseId}
            >
              {saving
                ? "Enregistrement..."
                : "+ Programmer la séance"}
            </button>
          </div>
        </form>
      )}

      {/* Liste des séances */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-gray-900">
          {isAdmin
            ? "Supervision des séances vidéo"
            : isTeacher
              ? "Mes séances vidéo"
              : "Mes cours vidéo"}
        </h2>

        {loading ? (
          <div className="sn-card p-8 text-center text-sm text-gray-500">
            Chargement du calendrier...
          </div>
        ) : sessions.length === 0 ? (
          <div className="sn-card p-8 text-center">
            <div className="text-3xl">
              &#128249;
            </div>

            <p className="mt-2 font-semibold">
              Aucune séance disponible
            </p>

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
              const endTime = Date.parse(item.ends_at);

              const isPast =
                Number.isFinite(endTime) &&
                now >= endTime;

              // Une séance programmée dont l'heure de fin
              // est passée est affichée comme expirée.
              const isExpiredScheduled =
                isPast &&
                item.status === "scheduled";

              // Une séance "live" dépassant son horaire
              // est présentée comme terminée.
              // Cela ne modifie pas le statut en base.
              const displayStatus: LiveStatus =
                isPast && item.status === "live"
                  ? "completed"
                  : item.status;

              const canJoin =
                !user?.isDemo &&
                (
                  user?.role === "teacher" ||
                  user?.role === "student"
                ) &&
                isSessionJoinable(
                  item,
                  user.role,
                  user.id,
                  now
                );

              const joinLabel = getJoinButtonLabel(
                item,
                isPast,
                canJoin,
                isTeacher
              );

              // Bouton actif : bleu.
              // Bouton inaccessible : gris et désactivé.
              const joinButtonClasses = canJoin
                ? "sn-btn-primary"
                : "inline-flex cursor-not-allowed items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-500";

              return (
                <article
                  key={item.id}
                  className="sn-card space-y-3 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900">
                      {item.title}
                    </h3>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        isExpiredScheduled
                          ? "border-gray-200 bg-gray-100 text-gray-600"
                          : statusClasses(displayStatus)
                      }`}
                    >
                      {isExpiredScheduled
                        ? "Créneau expiré"
                        : labelForStatus(displayStatus)}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-sm text-gray-600">
                      {item.description}
                    </p>
                  )}

                  <p className="text-sm text-gray-600">
                    &#128197; {showDate(item.starts_at)}
                    {" - "}
                    {showDate(item.ends_at)}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {/* Enseignant et apprenant */}
                    {!isAdmin && (
                      <button
                        type="button"
                        className={joinButtonClasses}
                        disabled={!canJoin}
                        onClick={() =>
                          openSession(item.id)
                        }
                        title={
                          canJoin
                            ? "Accéder à la salle vidéo"
                            : joinLabel
                        }
                      >
                        {joinLabel}
                      </button>
                    )}

                    {/* Annulation autorisée */}
                    {(
                      isAdmin ||
                      (
                        isTeacher &&
                        item.teacher_id === user?.id
                      )
                    ) &&
                      item.status === "scheduled" &&
                      !isPast && (
                        <button
                          type="button"
                          className="sn-btn-ghost"
                          disabled={busyId !== null}
                          onClick={() =>
                            void cancelSession(item)
                          }
                        >
                          {busyId === item.id
                            ? "Annulation..."
                            : "Annuler la séance"}
                        </button>
                      )}
                  </div>

                  {/* Indication pour les séances à venir */}
                  {!canJoin &&
                    !isPast &&
                    item.status === "scheduled" &&
                    !isAdmin && (
                      <p className="text-xs text-gray-500">
                        {isTeacher
                          ? "Disponible 15 minutes avant le début."
                          : "En attente du démarrage par l'enseignant."}
                      </p>
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
