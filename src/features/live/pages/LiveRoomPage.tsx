import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getLiveAccess, readableError } from "../lib/liveApi";

// Ne stocker JAMAIS l'URL Daily ni un meeting token dans le navigateur.
// Cette cle ne contient que l'identite et l'identifiant de la seance.
const RESUME_KEY = "schoolnet:live:resume:v1";
const RESUME_MAX_AGE_MS = 4 * 60 * 60 * 1000;

type SavedSession = {
  sessionId: string;
  userId: string;
  role: "teacher" | "student";
  savedAt: number;
};

type CallFrame = {
  join: (options: {
    url: string;
    token: string;
    startAudioOff?: boolean;
    startVideoOff?: boolean;
  }) => Promise<unknown>;
  leave: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
  setLocalAudio: (enabled: boolean) => unknown;
  setLocalVideo: (enabled: boolean) => unknown;
  on: (event: string, listener: (details?: unknown) => void) => unknown;
};

type RoomPhase = "initializing" | "joining" | "connected" | "paused" | "error";

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
      window.sessionStorage.removeItem(RESUME_KEY);
      return null;
    }
    return entry as SavedSession;
  } catch {
    return null;
  }
}

function saveSession(sessionId: string, userId: string, role: "teacher" | "student") {
  try {
    window.sessionStorage.setItem(
      RESUME_KEY,
      JSON.stringify({ sessionId, userId, role, savedAt: Date.now() } satisfies SavedSession)
    );
  } catch {
    // Le cours fonctionne aussi lorsque le stockage prive est indisponible.
  }
}

function clearSession() {
  try {
    window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // Aucun stockage a vider.
  }
}

function dailyErrorMessage(details: unknown): string {
  if (typeof details === "string" && details.trim()) return details;
  if (details && typeof details === "object") {
    const value = details as {
      errorMsg?: unknown;
      error?: { localizedMsg?: unknown; message?: unknown; type?: unknown };
    };
    const candidates = [
      value.errorMsg,
      value.error?.localizedMsg,
      value.error?.message,
      value.error?.type,
    ];
    for (const message of candidates) {
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return "La connexion a la visioconference a ete interrompue.";
}

export default function LiveRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { state: navigationState } = useLocation();
  const navigate = useNavigate();

  const videoShellRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<CallFrame | null>(null);
  const connectRef = useRef<((muted: boolean) => Promise<void>) | null>(null);
  const leavingRef = useRef(false);
  const pausingRef = useRef(false);
  const nativeFullscreenRef = useRef(false);

  const [phase, setPhase] = useState<RoomPhase>("initializing");
  const [error, setError] = useState<string | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);

  const resumeFromCalendar = Boolean(
    navigationState &&
    typeof navigationState === "object" &&
    "schoolnetLiveResume" in navigationState &&
    (navigationState as { schoolnetLiveResume?: unknown }).schoolnetLiveResume === true
  );

  const role = user?.role;
  const userId = user?.id;
  const listPath = role === "teacher" ? "/app/teacher/live" : "/app/student/live";
  const canAccessLive = Boolean(
    userId && !user?.isDemo && (role === "teacher" || role === "student")
  );

  // Le mode immersif conserve le meme iframe Daily (aucune reconnexion).
  // iPhone : affichage immersif CSS. Android/ordinateur : plein ecran natif si possible.
  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [immersive]);

  useEffect(() => {
    function onFullscreenChange() {
      const nativeActive = document.fullscreenElement === videoShellRef.current;
      if (nativeFullscreenRef.current && !nativeActive) setImmersive(false);
      nativeFullscreenRef.current = nativeActive;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setImmersive(false);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (authLoading || !sessionId || !canAccessLive || !userId) return;
    if (role !== "student" && role !== "teacher") return;

    let cancelled = false;
    let currentFrame: CallFrame | null = null;
    let connecting = false;
    let muteThisJoin = false;

    leavingRef.current = false;
    pausingRef.current = false;

    const saved = getSavedSession();
    const shouldStartMuted =
      resumeFromCalendar ||
      (saved?.userId === userId &&
        saved?.sessionId === sessionId &&
        saved?.role === role);

    async function connect(frame: CallFrame, muted: boolean) {
      if (cancelled || connecting || leavingRef.current) return;
      connecting = true;
      muteThisJoin = muted;
      pausingRef.current = false;
      setPhase("joining");
      setError(null);
      try {
        // Un nouveau jeton est toujours demande au serveur avant une reprise.
        // Les controles de droits, de classe et d'horaire restent actifs.
        const access = await getLiveAccess(sessionId as string);
        if (cancelled || leavingRef.current) return;

        await frame.join({
          url: access.room_url,
          token: access.meeting_token,
          ...(muted ? { startAudioOff: true, startVideoOff: true } : {}),
        });
        if (cancelled || leavingRef.current) return;

        // Confidentialite : une reprise ne reactive jamais les medias.
        if (muted) {
          frame.setLocalAudio(false);
          frame.setLocalVideo(false);
        }
        // "joined-meeting" est le signal principal de connexion reussie.
        setPhase((current) => (current === "joining" ? "connected" : current));
        saveSession(sessionId as string, userId as string, role as "teacher" | "student");
      } catch (cause) {
        if (cancelled || leavingRef.current) return;
        setError(readableError(cause));
        setPhase("error");
      } finally {
        connecting = false;
      }
    }

    async function initialize() {
      try {
        const daily = (await import("@daily-co/daily-js")).default;
        if (cancelled) return;
        if (!containerRef.current) throw new Error("Zone video indisponible.");

        const frame = daily.createFrame(containerRef.current, {
          showLeaveButton: true,
          showFullscreenButton: true,
          activeSpeakerMode: true,
          showParticipantsBar: true,
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "0",
          },
        }) as unknown as CallFrame;

        currentFrame = frame;
        frameRef.current = frame;
        connectRef.current = (muted: boolean) => connect(frame, muted);

        frame.on("joined-meeting", () => {
          if (cancelled || leavingRef.current || pausingRef.current) return;
          if (muteThisJoin) {
            frame.setLocalAudio(false);
            frame.setLocalVideo(false);
          }
          setPhase("connected");
          setError(null);
          saveSession(sessionId as string, userId as string, role as "teacher" | "student");
        });

        frame.on("left-meeting", () => {
          if (cancelled || leavingRef.current) return;
          setPhase("paused");
          if (!pausingRef.current) {
            setError("Connexion interrompue. Vous pouvez reprendre le cours.");
          }
        });

        frame.on("error", (details) => {
          if (cancelled || leavingRef.current || pausingRef.current) return;
          setError(`Erreur Daily : ${dailyErrorMessage(details)}`);
          setPhase("error");
        });

        frame.on("load-attempt-failed", (details) => {
          if (cancelled || leavingRef.current || pausingRef.current) return;
          setError(`Chargement Daily : ${dailyErrorMessage(details)}`);
          setPhase("error");
        });

        await connect(frame, shouldStartMuted);
      } catch (cause) {
        if (cancelled || leavingRef.current) return;
        setError(readableError(cause));
        setPhase("error");
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      connectRef.current = null;
      if (frameRef.current === currentFrame) frameRef.current = null;
      if (currentFrame) void currentFrame.destroy().catch(() => undefined);
    };
  }, [authLoading, sessionId, canAccessLive, userId, role, resumeFromCalendar]);

  async function pauseRoom() {
    const frame = frameRef.current;
    if (!frame || phase !== "connected" || pauseBusy) return;
    setPauseBusy(true);
    pausingRef.current = true;
    setError(null);
    try {
      frame.setLocalAudio(false);
      frame.setLocalVideo(false);
      // Quitter Daily suspend aussi le compteur de participant-minutes.
      // Le frame reste monte pour permettre la reprise dans la meme page.
      await frame.leave();
      setPhase("paused");
    } catch (cause) {
      pausingRef.current = false;
      setError(`Impossible de mettre en pause : ${readableError(cause)}`);
    } finally {
      setPauseBusy(false);
    }
  }

  function resumeRoom() {
    void connectRef.current?.(true);
  }

  function toggleImmersive() {
    if (immersive) {
      setImmersive(false);
      if (document.fullscreenElement === videoShellRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    setImmersive(true);
    const shell = videoShellRef.current;
    // Demande lancee directement dans le clic (exigence des navigateurs).
    // En cas d'echec, le mode immersif CSS reste actif.
    if (shell && document.fullscreenEnabled && shell.requestFullscreen) {
      void shell.requestFullscreen().catch(() => undefined);
    }
  }

  async function exitRoom() {
    leavingRef.current = true;
    clearSession();
    setImmersive(false);
    if (document.fullscreenElement === videoShellRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        // Poursuivre la sortie meme si le navigateur refuse.
      }
    }
    try {
      await frameRef.current?.leave();
    } catch {
      // La navigation doit rester possible si Daily est deja ferme.
    }
    navigate(listPath, { replace: true });
  }

  function returnToCalendar() {
    clearSession();
    navigate(listPath, { replace: true });
  }

  const invalidUser = !authLoading && (!sessionId || !canAccessLive);
  const shownError =
    error ??
    (invalidUser
      ? "Vous devez etre connecte avec un compte enseignant ou apprenant."
      : null);
  const videoHidden = invalidUser || (phase === "error" && !frameRef.current);

  return (
    <div className="space-y-4 pb-6">
      <div className="sn-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            SCHOOLNET LIVE
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900">Salle de cours en direct</h1>
          <p className="mt-1 text-sm text-gray-500">
            Camera, micro, partage d'ecran et participants dans SCHOOLNET.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === "connected" && (
            <button type="button" className="sn-btn-ghost" onClick={() => void pauseRoom()} disabled={pauseBusy}>
              {pauseBusy ? "Mise en pause..." : "Mettre en pause"}
            </button>
          )}
          <button type="button" className="sn-btn-ghost" onClick={() => void exitRoom()}>
            Quitter le cours
          </button>
        </div>
      </div>

      {shownError && (
        <div role="alert" className="sn-card border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">Connexion a la salle</p>
          <p className="mt-1 text-sm text-red-700">{shownError}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {!invalidUser && (phase === "error" || phase === "paused") && (
              <button type="button" className="sn-btn-primary" onClick={resumeRoom}>
                Reessayer en securite
              </button>
            )}
            <button type="button" className="sn-btn-ghost" onClick={returnToCalendar}>
              Retour au calendrier
            </button>
          </div>
        </div>
      )}

      {!videoHidden && (
        <div className="flex justify-end">
          <button type="button" className="sn-btn-ghost" onClick={toggleImmersive}>
            {immersive ? "Reduire la video" : "Agrandir la video"}
          </button>
        </div>
      )}

      {/* Garder le lecteur monte, y compris en pause et en mode immersif. */}
      <div
        ref={videoShellRef}
        className={
          `relative overflow-hidden bg-slate-950 shadow-xl ${
            immersive
              ? "fixed inset-0 z-[10000] h-[100dvh] w-screen rounded-none"
              : "rounded-2xl"
          } ${videoHidden ? "hidden" : "block"}`
        }
        style={immersive ? { height: "100dvh" } : undefined}
      >
        {immersive && (
          <button
            type="button"
            className="absolute right-3 top-3 z-50 rounded-full bg-slate-950/85 px-4 py-2 text-sm font-semibold text-white shadow-lg"
            style={{ top: "max(12px, env(safe-area-inset-top))" }}
            onClick={toggleImmersive}
            aria-label="Quitter le mode plein ecran"
          >
            Reduire
          </button>
        )}

        {phase === "initializing" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center text-sm text-white" role="status">
            Preparation de votre cours video...
          </div>
        )}

        {(phase === "paused" || phase === "error") && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-slate-950/95 p-6 text-center text-white">
            <p className="text-lg font-bold">{phase === "paused" ? "Votre participation est en pause" : "Connexion interrompue"}</p>
            <p className="max-w-md text-sm text-slate-300">
              La reprise verifie vos droits et redemarre avec le micro et la camera coupes.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" className="sn-btn-primary" onClick={resumeRoom}>
                Reprendre le cours
              </button>
              <button type="button" className="rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold text-white" onClick={() => void exitRoom()}>
                Quitter le cours
              </button>
            </div>
          </div>
        )}

        <div
          ref={containerRef}
          className={immersive ? "h-[100dvh] min-h-0 w-full" : "h-[78dvh] min-h-[420px] w-full lg:h-[84dvh]"}
        />
      </div>

      {!immersive && (
        <p className="text-xs text-gray-500">
          Autorisez l'acces au micro et a la camera si votre navigateur le demande.
          En cas d'interruption, SCHOOLNET memorise uniquement la seance, jamais le jeton Daily.
        </p>
      )}
    </div>
  );
}
