// src/features/auth/pages/LoginPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDefaultPathByRole, signInWithMagicLink, signInWithPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth/AuthProvider";

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybe = error as {
      message?: string;
      error_description?: string;
    };

    return maybe.message || maybe.error_description || fallback;
  }

  return fallback;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    navigate(getDefaultPathByRole(user.role), { replace: true });
  }, [loading, user, navigate]);

  async function onPasswordLogin() {
    const cleanEmail = email.trim();

    if (!cleanEmail || !password || busy) return;

    setBusy(true);
    setIsError(false);
    setMsg("Connexion en cours...");

    try {
      const authUser = await signInWithPassword(cleanEmail, password);

      setIsError(false);
      setMsg(null);

      navigate(getDefaultPathByRole(authUser.role), { replace: true });
    } catch (e: unknown) {
      console.error("[LoginPage] password login error:", e);
      setIsError(true);
      setMsg(getErrorMessage(e, "Connexion impossible. Vérifie l’email et le mot de passe."));
    } finally {
      setBusy(false);
    }
  }

  async function onMagicLink() {
    const cleanEmail = email.trim();

    if (!cleanEmail || busy) return;

    setBusy(true);
    setIsError(false);
    setMsg("Envoi du lien en cours...");

    try {
      await signInWithMagicLink(cleanEmail);
      setIsError(false);
      setMsg("✅ Lien envoyé. Vérifie ta boîte mail.");
    } catch (e: unknown) {
      console.error("[LoginPage] magic link error:", e);
      setIsError(true);
      setMsg(getErrorMessage(e, "Envoi impossible."));
    } finally {
      setBusy(false);
    }
  }

  return (
      <form
        className="w-full max-w-md mx-auto space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "password") {
            void onPasswordLogin();
          } else {
            void onMagicLink();
          }
        }}
      >
      <div className="text-sm text-gray-500">
        Connexion réelle : le rôle est récupéré automatiquement depuis votre profil.
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={`sn-btn-ghost sn-press ${mode === "password" ? "ring-2 ring-blue-200" : ""}`}
          onClick={() => setMode("password")}
          disabled={busy}
        >
          Email + mot de passe
        </button>

        <button
          type="button"
          className={`sn-btn-ghost sn-press ${mode === "magic" ? "ring-2 ring-blue-200" : ""}`}
          onClick={() => setMode("magic")}
          disabled={busy}
        >
          Magic link
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-gray-600">Email</label>
        <input
          className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          disabled={busy}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Mot de passe</label>
          <input
            className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            disabled={busy}
          />
        </div>
      )}

      {msg && (
        <div
          className={`rounded-2xl p-3 text-sm ${
            isError
              ? "bg-red-50 border border-red-200 text-red-700"
              : "bg-gray-50 border border-gray-100 text-gray-700"
          }`}
        >
          {msg}
        </div>
      )}

      <button
        type="submit"
        className="sn-btn-primary sn-press w-full"
        onClick={mode === "password" ? onPasswordLogin : onMagicLink}
        disabled={busy || !email.trim() || (mode === "password" && !password)}
      >
        {busy ? "Connexion..." : "Se connecter"}
      </button>
    </form>
  );
}