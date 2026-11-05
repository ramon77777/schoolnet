// src/features/auth/pages/LoginPage.tsx
// SCHOOLNET - Authentification par e-mail et mot de passe.
// Une inscription publique est une demande, pas une creation automatique de compte.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDefaultPathByRole, signInWithPassword } from "@/lib/auth";
import { useAuth } from "@/lib/auth/AuthProvider";

function loginErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message).toLowerCase()
        : "";

  if (raw.includes("banned") || raw.includes("disabled")) {
    return "Ce compte est désactivé. Contactez l'administration SCHOOLNET.";
  }

  if (raw.includes("email not confirmed")) {
    return "Votre adresse e-mail doit encore etre confirmee. Consultez votre messagerie.";
  }

  if (raw.includes("timeout") || raw.includes("network") || raw.includes("failed to fetch")) {
    return "La connexion au serveur a échoué. Vérifiez votre connexion Internet et réessayez.";
  }

  // Ne pas reveler si l'adresse e-mail existe ou non.
  return "Connexion impossible. Vérifiez vos identifiants et réessayez.";
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    navigate(getDefaultPathByRole(user.role), { replace: true });
  }, [loading, user, navigate]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !email.trim() || !password) return;

    setError(null);
    setBusy(true);
    try {
      const authUser = await signInWithPassword(
        email.trim().toLowerCase(),
        password,
      );
      navigate(getDefaultPathByRole(authUser.role), { replace: true });
    } catch (caught: unknown) {
      console.error("[LoginPage] Erreur de connexion :", caught);
      setError(loginErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="w-full max-w-md space-y-5" onSubmit={(event) => void handleLogin(event)}>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
        <div className="font-bold text-blue-700">Bienvenue dans votre espace SCHOOLNET</div>
        <p className="mt-1">
          Connectez-vous avec l'adresse e-mail de votre compte et votre mot de passe.
          Les accès sont créés après vérification par l'administration.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Adresse e-mail</span>
        <input
          type="email"
          autoComplete="username"
          required
          disabled={busy}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nom@exemple.com"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Mot de passe</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={busy}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Votre mot de passe"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-24 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {showPassword ? "Masquer" : "Afficher"}
          </button>
        </div>
      </label>

      <div className="text-right">
        <Link
          to="/auth/forgot-password"
          className="text-sm font-semibold text-blue-700 transition hover:text-blue-900 hover:underline"
        >
          Premi&egrave;re connexion ou mot de passe oubli&eacute; ?
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Connexion en cours..." : "Se connecter"}
      </button>

      <div className="border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
        Pas encore de compte ?{" "}
        <Link to="/inscription" className="font-bold text-blue-700 hover:underline">
          S'inscrire
        </Link>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Le formulaire public permet de demander une inscription. Le compte est ouvert
          après validation par l'administration.
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Enseignant ou membre du personnel ? Votre compte est créé par l'administration.
        </p>
      </div>
    </form>
  );
}
