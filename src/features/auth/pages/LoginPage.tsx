// src/features/auth/pages/LoginPage.tsx
import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getDefaultPathByRole,
  signInWithMagicLink,
  signInWithPassword,
  type UserRole,
} from "@/lib/auth";
import { AuthContext } from "@/lib/auth/AuthProvider";

const ROLE_LABEL: Record<UserRole, string> = {
  student: "Apprenant",
  parent: "Parent/Tuteur",
  teacher: "Enseignant",
  admin: "Admin",
};

function isRole(x: string | null): x is UserRole {
  return x === "student" || x === "parent" || x === "teacher" || x === "admin";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useContext(AuthContext)!;

  const [sp] = useSearchParams();
  const presetRole = useMemo<UserRole>(() => {
    const r = sp.get("role");
    return isRole(r) ? r : "student";
  }, [sp]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ si déjà connecté -> redirect
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    navigate(getDefaultPathByRole(user.role), { replace: true });
  }, [loading, user, navigate]);

  async function onPasswordLogin() {
    setMsg(null);
    setBusy(true);
    setMsg("Connexion en cours...");

    try {
      const authUser = await signInWithPassword(email.trim(), password);

      // ✅ REDIRECT IMMÉDIAT (plus de ctrl+f5)
      navigate(getDefaultPathByRole(authUser.role), { replace: true });

      // Optionnel : on peut nettoyer le message
      setMsg(null);
    } catch (e: any) {
      setMsg(e?.message ?? "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function onMagicLink() {
    setMsg(null);
    setBusy(true);

    try {
      await signInWithMagicLink(email.trim());
      setMsg("✅ Lien envoyé. Vérifie ta boîte mail.");
    } catch (e: any) {
      setMsg(e?.message ?? "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-5">
      <div className="text-sm text-gray-500">
        Rôle sélectionné :{" "}
        <b className="text-gray-900">{ROLE_LABEL[presetRole]}</b>
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
          className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          disabled={busy}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-2">
          <label className="text-sm text-gray-600">Mot de passe</label>
          <input
            className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            disabled={busy}
          />
        </div>
      )}

      {msg && (
        <div className="rounded-2xl bg-gray-50 p-3 text-sm text-gray-700">
          {msg}
        </div>
      )}

      <button
        type="button"
        className="sn-btn-primary sn-press w-full"
        onClick={mode === "password" ? onPasswordLogin : onMagicLink}
        disabled={busy || !email.trim() || (mode === "password" && !password)}
      >
        {busy ? "Connexion..." : "Se connecter"}
      </button>
    </div>
  );
}
