// src/features/auth/pages/ResetPasswordPage.tsx
// Le lien recu par e-mail doit ouvrir une session de recuperation Supabase.
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const [familyInviteMode] = useState(() =>
    new URLSearchParams(window.location.search).get("mode") === "family-invite",
  );
  const [studentInviteMode] = useState(() =>
    new URLSearchParams(window.location.search).get("mode") === "student-invite",
  );
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Le mode invitation familiale ne doit JAMAIS afficher le formulaire pour
    // un utilisateur ordinaire déjà connecté sur le même navigateur.
    const eligibleSession = (session: Session | null): boolean =>
      Boolean(session?.user) &&
      (!familyInviteMode ||
        session?.user.app_metadata?.schoolnet_family_invitation === true) &&
      (!studentInviteMode ||
        session?.user.app_metadata?.schoolnet_no_email_student === true);

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" ||
          event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setHasSession(eligibleSession(session));
        setChecking(false);
      }
    });

    void supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) throw sessionError;
        setHasSession(eligibleSession(data.session));
      })
      .catch((caught: unknown) => {
        console.error("[ResetPasswordPage] Impossible de lire la session :", caught);
        if (mounted) setHasSession(false);
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [familyInviteMode, studentInviteMode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (password.length < 12) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (familyInviteMode || studentInviteMode) {
        // Only app_metadata, never user_metadata, may certify an invitation.
        const { data: verified, error: verifyError } = await supabase.auth.getUser();
        if (verifyError || !verified.user ||
          (familyInviteMode && verified.user.app_metadata?.schoolnet_family_invitation !== true) ||
          (studentInviteMode && verified.user.app_metadata?.schoolnet_no_email_student !== true)) {
          throw new Error("INVITATION_ACCOUNT_NOT_VERIFIED");
        }
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Termine la session de recuperation. L'utilisateur se reconnecte lui-meme.
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("[ResetPasswordPage] Session non fermee :", signOutError);
      }
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (caught: unknown) {
      console.error("[ResetPasswordPage] Echec du changement de mot de passe :", caught);
      setError("Impossible d'enregistrer ce mot de passe. Le lien a peut-etre expiré ; demandez un nouveau lien.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <strong className="block text-lg">Mot de passe enregistr&eacute;</strong>
          <p className="mt-2 leading-6">{studentInviteMode
            ? "Vous pouvez maintenant vous connecter avec votre téléphone familial, votre code SCHOOLNET et votre mot de passe personnel."
            : "Vous pouvez maintenant vous connecter avec votre adresse e-mail et ce nouveau mot de passe."}</p>
          {(familyInviteMode || studentInviteMode) && (
            <p className="mt-2 leading-6">Votre première connexion permettra à SCHOOLNET de contrôler l'activation de votre accès.</p>
          )}
        </div>
        <Link to="/auth/login" className="inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Se connecter</Link>
      </div>
    );
  }

  if (checking) {
    return <p className="text-sm text-slate-600">V&eacute;rification du lien de s&eacute;curit&eacute;...</p>;
  }

  if (!hasSession) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          {familyInviteMode || studentInviteMode
            ? "Aucune session d'invitation valide pour ce compte. Demandez à l'administration un nouveau lien personnel."
            : "Ce lien n'est pas valide ou a expiré. Demandez un nouveau lien pour choisir votre mot de passe."}
        </p>
        {familyInviteMode || studentInviteMode ? (
          <Link to="/auth/login" className="inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Retour à la connexion</Link>
        ) : (
          <Link to="/auth/forgot-password" className="inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Demander un nouveau lien</Link>
        )}
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <p className="text-sm leading-6 text-slate-600">
        Choisissez un mot de passe personnel de 12 caract&egrave;res minimum.
        Ne le communiquez jamais &agrave; un tiers.
      </p>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Nouveau mot de passe</span>
        <input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-700">Confirmer le mot de passe</span>
        <input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      </label>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || !password || !confirm}
        className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? "Enregistrement..." : "Définir mon mot de passe"}
      </button>
    </form>
  );
}
