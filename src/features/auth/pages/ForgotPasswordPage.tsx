// src/features/auth/pages/ForgotPasswordPage.tsx
// Premier accès et mot de passe oublié : envoi d'un lien sécurisé.
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/auth/reset-password` },
      );
      if (sendError) throw sendError;
      setSent(true);
    } catch (caught: unknown) {
      console.error("[ForgotPasswordPage] Echec de la demande :", caught);
      setError("Le message n'a pas pu être envoyé. Réessayez plus tard ou contactez l'administration.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5 text-sm">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <div className="text-lg font-bold">Demande envoy&eacute;e</div>
          <p className="mt-2 leading-6">
            Si un compte est associ&eacute; &agrave; cette adresse, un message vous indiquera
            comment choisir votre mot de passe. V&eacute;rifiez aussi les courriers ind&eacute;sirables.
          </p>
        </div>
        <Link to="/auth/login" className="inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700">
          Retour &agrave; la connexion
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <p className="text-sm leading-7 text-slate-600">
        Votre compte a d&eacute;j&agrave; &eacute;t&eacute; cr&eacute;&eacute; par SCHOOLNET, mais vous n'avez pas
        encore choisi de mot de passe ? Ou vous l'avez oubli&eacute; ? Renseignez
        l'adresse e-mail associ&eacute;e au compte pour recevoir un lien s&eacute;curis&eacute;.
      </p>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Adresse e-mail de votre compte</span>
        <input
          type="email"
          autoComplete="email"
          required
          disabled={busy}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nom@exemple.com"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Envoi en cours..." : "Recevoir mon lien d'acces"}
      </button>

      <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
        <Link to="/auth/login" className="font-semibold text-slate-600 hover:underline">Retour &agrave; la connexion</Link>
        <Link to="/inscription" className="font-semibold text-blue-700 hover:underline">Pas encore inscrit ?</Link>
      </div>
    </form>
  );
}
