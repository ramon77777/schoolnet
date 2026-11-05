
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getLiveAccess, readableError } from "../lib/liveApi";

// Les identifiants Daily restent uniquement en mémoire.
// Ne jamais enregistrer ni afficher les meeting tokens.
type CallFrame = {
  join: (options: { url: string; token: string }) => Promise<unknown>;
  leave: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
  on: (
    event: string,
    listener: (details?: unknown) => void
  ) => unknown;
};

function dailyErrorMessage(details: unknown): string {
  if (typeof details === "string" && details.trim()) {
    return details;
  }

  if (details && typeof details === "object") {
    const event = details as {
      errorMsg?: unknown;
      error?: {
        localizedMsg?: unknown;
        message?: unknown;
        type?: unknown;
      };
    };

    if (
      typeof event.errorMsg === "string" &&
      event.errorMsg.trim()
    ) {
      return event.errorMsg;
    }

    if (
      typeof event.error?.localizedMsg === "string" &&
      event.error.localizedMsg.trim()
    ) {
      return event.error.localizedMsg;
    }

    if (
      typeof event.error?.message === "string" &&
      event.error.message.trim()
    ) {
      return event.error.message;
    }

    if (
      typeof event.error?.type === "string" &&
      event.error.type.trim()
    ) {
      return event.error.type;
    }
  }

  return "Erreur de connexion à la visioconférence.";
}

export default function LiveRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { user, loading: authLoading } = useAuth();

  const navigate = useNavigate();

  const container = useRef<HTMLDivElement | null>(null);

  const frameRef = useRef<CallFrame | null>(null);

  const leavingRef = useRef(false);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const listPath =
    user?.role === "teacher"
      ? "/app/teacher/live"
      : "/app/student/live";

  const userId = user?.id;

  const canAccessLive = Boolean(
    userId &&
      !user?.isDemo &&
      (user?.role === "student" || user?.role === "teacher")
  );

  useEffect(() => {
    if (authLoading) return;

    if (!sessionId || !canAccessLive) return;

    let cancelled = false;

    let currentFrame: CallFrame | null = null;

    leavingRef.current = false;

    async function openRoom() {
      try {
        console.info(
          "[SCHOOLNET LIVE] Vérification des autorisations..."
        );

        // Le serveur contrôle :
        // - l'utilisateur connecté ;
        // - son rôle ;
        // - les affectations et inscriptions ;
        // - la période autorisée pour rejoindre la séance.
        const access = await getLiveAccess(sessionId as string);

        if (cancelled) return;

        console.info(
          "[SCHOOLNET LIVE] Autorisation obtenue."
        );

        if (!container.current) {
          throw new Error("Zone vidéo indisponible.");
        }

        const daily = (
          await import("@daily-co/daily-js")
        ).default;

        if (cancelled) return;

        console.info(
          "[SCHOOLNET LIVE] Initialisation du lecteur Daily..."
        );

        const frame = daily.createFrame(container.current, {
          showLeaveButton: true,

          // Bouton plein écran Daily
          showFullscreenButton: true,

          // Mise en avant automatique de l'orateur
          activeSpeakerMode: true,

          // Affichage des autres participants
          showParticipantsBar: true,

          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "16px",
          },
        }) as unknown as CallFrame;

        currentFrame = frame;
        frameRef.current = frame;

        // Événement : tentative de connexion.
        frame.on("joining-meeting", () => {
          if (cancelled || leavingRef.current) return;

          console.info(
            "[SCHOOLNET LIVE] Connexion Daily en cours..."
          );
        });

        // Événement : connexion réussie.
        frame.on("joined-meeting", () => {
          if (cancelled || leavingRef.current) return;

          console.info(
            "[SCHOOLNET LIVE] Connexion Daily réussie."
          );

          setLoading(false);
          setError(null);
        });

        // Événement : sortie ou interruption de réunion.
        frame.on("left-meeting", () => {
          if (cancelled || leavingRef.current) return;

          console.warn(
            "[SCHOOLNET LIVE] Daily signale une sortie de réunion."
          );

          setLoading(false);

          // Une erreur détaillée déjà enregistrée
          // ne doit pas être remplacée.
          setError((previous) =>
            previous ??
            (
              "Daily a signalé une sortie de réunion. " +
              "La cause exacte reste à déterminer. " +
              "Consultez la console du navigateur."
            )
          );
        });

        // Événement : erreur de connexion Daily.
        frame.on("error", (details) => {
          if (cancelled || leavingRef.current) return;

          const message = dailyErrorMessage(details);

          console.error(
            "[SCHOOLNET LIVE] Erreur Daily :",
            message
          );

          setLoading(false);

          setError(`Erreur Daily : ${message}`);
        });

        // Événement : échec de chargement Daily.
        frame.on("load-attempt-failed", (details) => {
          if (cancelled || leavingRef.current) return;

          const message = dailyErrorMessage(details);

          console.error(
            "[SCHOOLNET LIVE] Échec du chargement Daily :",
            message
          );

          setLoading(false);

          setError(`Chargement Daily : ${message}`);
        });

        console.info(
          "[SCHOOLNET LIVE] Ouverture de la salle Daily..."
        );

        // Afficher le lecteur Daily pendant la connexion.
        if (!cancelled) {
          setLoading(false);
        }

        await frame.join({
          url: access.room_url,
          token: access.meeting_token,
        });

        if (cancelled || leavingRef.current) return;

        console.info(
          "[SCHOOLNET LIVE] Appel Daily join() terminé."
        );

        setLoading(false);
      } catch (err) {
        if (cancelled || leavingRef.current) return;

        const message = readableError(err);

        console.error(
          "[SCHOOLNET LIVE] Impossible d'ouvrir la salle :",
          message
        );

        setLoading(false);
        setError(message);
      }
    }

    void openRoom();

    // Libération du lecteur Daily au démontage.
    return () => {
      cancelled = true;

      if (frameRef.current === currentFrame) {
        frameRef.current = null;
      }

      if (currentFrame) {
        void currentFrame
          .destroy()
          .catch(() => undefined);
      }
    };
  }, [
    sessionId,
    authLoading,
    userId,
    canAccessLive,
  ]);

  async function exitRoom() {
    leavingRef.current = true;

    const frame = frameRef.current;

    frameRef.current = null;

    if (frame) {
      try {
        await frame.leave();
      } catch {
        // Quitter SCHOOLNET même si Daily ne répond plus.
      }
    }

    navigate(listPath, { replace: true });
  }

  const invalidUser =
    !authLoading && (!sessionId || !canAccessLive);

  const shownError =
    error ??
    (invalidUser
      ? "Vous devez être connecté avec un compte enseignant ou apprenant."
      : null);

  return (
    <div className="space-y-4 pb-6">
      {/* En-tête de la salle */}
      <div className="sn-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-700">
            SCHOOLNET LIVE
          </div>

          <h1 className="mt-1 text-xl font-bold text-gray-900">
            Salle de cours en direct
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Caméra, micro, partage d'écran et participants
            dans SCHOOLNET.
          </p>
        </div>

        <button
          type="button"
          className="sn-btn-ghost"
          onClick={() => void exitRoom()}
        >
          Quitter le cours
        </button>
      </div>

      {/* Message d'erreur détaillé */}
      {shownError && (
        <div
          className="sn-card border-red-200 bg-red-50 p-5"
          role="alert"
        >
          <p className="font-semibold text-red-800">
            Impossible de rejoindre la salle
          </p>

          <p className="mt-1 text-sm text-red-700">
            {shownError}
          </p>

          <p className="mt-3 text-xs text-red-600">
            Si le problème persiste, consultez la console
            du navigateur pour identifier l'étape qui échoue.
          </p>

          <button
            type="button"
            className="sn-btn-primary mt-4"
            onClick={() => navigate(listPath)}
          >
            Retour au calendrier
          </button>
        </div>
      )}

      {/* Lecteur vidéo Daily */}
      <div
        className={`relative overflow-hidden rounded-2xl bg-slate-950 shadow-xl ${
          shownError ? "hidden" : "block"
        }`}
        style={{
          minHeight: "min(70vh, 720px)",
        }}
      >
        {loading && (
          <div
            className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white"
            role="status"
          >
            Connexion sécurisée à votre cours vidéo...
          </div>
        )}

        <div
          ref={container}
          className="relative h-[78dvh] min-h-[420px] w-full lg:h-[84dvh]"
        />
      </div>

      {/* Informations utilisateur */}
      <p className="text-xs text-gray-500">
        Autorisez l'accès au micro et à la caméra si votre
        navigateur le demande. Aucun compte Daily n'est
        nécessaire.
      </p>
    </div>
  );
}
