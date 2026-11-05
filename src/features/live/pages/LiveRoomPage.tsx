import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getLiveAccess, readableError } from "../lib/liveApi";

// Only in-memory credentials. Never store or log the Daily meeting token.
type CallFrame = {
  join: (options: { url: string; token: string }) => Promise<unknown>;
  leave: () => Promise<unknown>;
  destroy: () => Promise<unknown>;
  on: (event: string, listener: () => void) => unknown;
};

export default function LiveRoomPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<CallFrame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listPath = user?.role === "teacher" ? "/app/teacher/live" : "/app/student/live";
  const userId = user?.id;
  const canAccessLive = Boolean(
    userId && !user?.isDemo &&
    (user?.role === "student" || user?.role === "teacher")
  );

  useEffect(() => {
    if (authLoading) return;
    if (!sessionId || !canAccessLive) return;
    let cancelled = false;
    let currentFrame: CallFrame | null = null;

    async function openRoom() {
      try {
        // The server checks the current user, role, class membership, and time window.
        const access = await getLiveAccess(sessionId as string);
        if (cancelled) return;
        if (!container.current) throw new Error("Zone video indisponible.");
        const daily = (await import("@daily-co/daily-js")).default;
        if (cancelled) return;
        const frame = daily.createFrame(container.current, {
          showLeaveButton: true,
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "0",
            borderRadius: "16px",
          },
        }) as unknown as CallFrame;
        currentFrame = frame;
        frameRef.current = frame;
        frame.on("left-meeting", () => {
          if (!cancelled) navigate(listPath, { replace: true });
        });
        await frame.join({ url: access.room_url, token: access.meeting_token });
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setError(readableError(err));
        }
      }
    }
    void openRoom();
    return () => {
      cancelled = true;
      if (frameRef.current === currentFrame) frameRef.current = null;
      if (currentFrame) void currentFrame.destroy().catch(() => undefined);
    };
  }, [sessionId, authLoading, userId, canAccessLive, navigate, listPath]);

  async function exitRoom() {
    const frame = frameRef.current;
    frameRef.current = null;
    if (frame) {
      try { await frame.leave(); } catch { /* Still return to the course list. */ }
    }
    navigate(listPath, { replace: true });
  }

  const invalidUser = !authLoading && (!sessionId || !canAccessLive);
  const shownError = error ?? (invalidUser ? "Vous devez etre connecte avec un compte enseignant ou apprenant." : null);

  return (
    <div className="space-y-4 pb-6">
      <div className="sn-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-indigo-700">SCHOOLNET LIVE</div>
          <h1 className="mt-1 text-xl font-bold text-gray-900">Salle de cours en direct</h1>
          <p className="mt-1 text-sm text-gray-500">Camera, micro, partage d'ecran et participants dans SCHOOLNET.</p>
        </div>
        <button type="button" className="sn-btn-ghost" onClick={() => void exitRoom()}>Quitter le cours</button>
      </div>
      {shownError && (
        <div className="sn-card border-red-200 bg-red-50 p-5" role="alert">
          <p className="font-semibold text-red-800">Impossible de rejoindre la salle</p>
          <p className="mt-1 text-sm text-red-700">{shownError}</p>
          <button type="button" className="sn-btn-primary mt-4" onClick={() => navigate(listPath)}>Retour au calendrier</button>
        </div>
      )}
      <div className={`relative overflow-hidden rounded-2xl bg-slate-950 shadow-xl ${shownError ? "hidden" : "block"}`} style={{ minHeight: "min(70vh, 720px)" }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white" role="status">
            Connexion securisee a votre cours video...
          </div>
        )}
        <div ref={container} className="relative h-[70vh] min-h-[420px] w-full" />
      </div>
      <p className="text-xs text-gray-500">Autorisez l'acces au micro et a la camera si votre navigateur le demande. Aucun compte Daily n'est necessaire.</p>
    </div>
  );
}
