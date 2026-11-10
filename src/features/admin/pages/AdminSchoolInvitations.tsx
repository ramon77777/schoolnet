import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getAdminSchools,
  getSchoolAdminInvitations,
  isSchoolSetupPending,
  markSchoolAdminInvitationSent,
  prepareSchoolAdminInvitation,
  schoolManagementError,
  type PreparedSchoolAdminInvitation,
  type SchoolAdminInvitation,
  type SchoolRecord,
} from "@/features/schools/lib/schoolManagementApi";

const fmt = (value: string) => new Date(value).toLocaleString("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function invitationEmail(draft: PreparedSchoolAdminInvitation) {
  return [
    "Bonjour,",
    "",
    "Votre établissement « " + draft.school_name +
      " » vous invite à activer votre accès Administrateur d'établissement SCHOOLNET.",
    "",
    "Adresse de connexion : " + draft.email,
    "Lien personnel et temporaire d'activation :",
    draft.link,
    "",
    "Ouvrez ce lien pour choisir votre mot de passe personnel.",
    "Ne transmettez ce lien à personne. S'il a expiré, demandez une nouvelle invitation.",
    "",
    "Site SCHOOLNET : https://schoolnet-snowy.vercel.app/",
    "",
    "Cordialement,",
    "L'administration SCHOOLNET",
  ].join("\n");
}

export default function AdminSchoolInvitations() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [invitations, setInvitations] = useState<SchoolAdminInvitation[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [prepared, setPrepared] = useState<PreparedSchoolAdminInvitation | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedSchool = schools.find((s) => s.id === schoolId);
  const activeSchools = useMemo(
    () => schools.filter((s) => s.status === "active"), [schools],
  );
  const selectedInvites = invitations.filter((invite) => invite.school_id === schoolId);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || isDemo) {
      setLoading(false);
      setSchools([]);
      setInvitations([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [nextSchools, nextInvites] = await Promise.all([
          getAdminSchools(), getSchoolAdminInvitations(),
        ]);
        if (cancelled) return;
        setSchools(nextSchools);
        setInvitations(nextInvites);
        setMigrationPending(false);
        setSchoolId((previous) => {
          if (nextSchools.some((s) => s.id === previous && s.status === "active"))
            return previous;
          return nextSchools.find((s) => s.status === "active")?.id ?? "";
        });
      } catch (cause) {
        if (cancelled) return;
        if (isSchoolSetupPending(cause)) {
          setSchools([]);
          setInvitations([]);
          setMigrationPending(true);
        } else {
          setError(schoolManagementError(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, authLoading, isDemo, revision]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSchool || busy || loading || migrationPending || isDemo) return;
    if (fullName.trim().length < 3 || fullName.trim().length > 160 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        email.trim().length > 254) {
      setError("Saisissez un nom complet et une adresse e-mail valides.");
      return;
    }
    setPrepared(null);
    setNotice(null);
    setError(null);
    setBusy(true);
    try {
      const result = await prepareSchoolAdminInvitation({
        action: "create",
        schoolId,
        email,
        fullName,
      });
      setPrepared(result);
      setFullName("");
      setEmail("");
      setNotice("Invitation préparée. SCHOOLNET n'a envoyé aucun e-mail.");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(schoolManagementError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(invite: SchoolAdminInvitation) {
    if (busy || loading || migrationPending || isDemo ||
        !selectedSchool || invite.school_id !== selectedSchool.id) return;
    setError(null);
    setNotice(null);
    setPrepared(null);
    setBusy(true);
    try {
      const result = await prepareSchoolAdminInvitation({
        action: "renew", schoolId: invite.school_id, email: invite.email,
      });
      setPrepared(result);
      setNotice("Nouveau lien temporaire préparé : transmettez uniquement le dernier lien.");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(schoolManagementError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function markSent(invite: SchoolAdminInvitation) {
    if (busy || markingId || migrationPending || isDemo) return;
    if (!window.confirm(
      "Confirmer avoir réellement envoyé cette invitation à " + invite.email +
      " ? SCHOOLNET n'effectue pas lui-même l'envoi.",
    )) return;
    setMarkingId(invite.user_id);
    setError(null);
    try {
      await markSchoolAdminInvitationSent(invite.school_id, invite.user_id);
      setNotice("Envoi déclaré. Cela ne confirme pas la réception de l'e-mail.");
      setRevision((v) => v + 1);
    } catch (cause) {
      setError(schoolManagementError(cause));
    } finally {
      setMarkingId(null);
    }
  }

  async function copyInvitation() {
    if (!prepared) return;
    try {
      await navigator.clipboard.writeText(invitationEmail(prepared));
      setNotice("Modèle d'e-mail et lien temporaire copiés. Envoyez-les uniquement au destinataire prévu.");
    } catch {
      setError("Copie impossible. Utilisez « Ouvrir dans ma messagerie ».");
    }
  }

  function openEmail() {
    if (!prepared) return;
    const subject = "SCHOOLNET — Activation de votre espace " + prepared.school_name;
    const mailto = "mailto:" + encodeURIComponent(prepared.email) +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(invitationEmail(prepared));
    window.location.href = mailto;
    setNotice("Brouillon ouvert dans la messagerie. Vérifiez le destinataire et envoyez manuellement.");
  }

  return (
    <main className="space-y-6 pb-12">
      <header className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-white via-blue-50 to-indigo-50 p-6 md:p-8">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white" aria-hidden="true">✉</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">SCHOOLNET · Super Administration</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">Inviter un administrateur d'établissement</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Préparez le compte et un lien temporaire. Copiez le message ou ouvrez
                votre messagerie pour l'envoyer vous-même, sans mot de passe en clair.
              </p>
            </div>
          </div>
          <Link className="sn-btn-ghost" to="/app/admin/schools">← Établissements</Link>
        </div>
      </header>
      {migrationPending && (
        <p role="status" className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong>Activation Supabase en attente.</strong> La migration multi-établissements et
          la nouvelle Edge Function doivent être autorisées et déployées avant toute création réelle.
          Aucun compte ni invitation ne peut être créé depuis cet écran pour le moment.
        </p>
      )}
      {isDemo && (
        <p role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Les invitations réelles sont désactivées en mode démonstration.
        </p>
      )}
      {error && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <section className="grid gap-5 lg:grid-cols-2">
        <form className="sn-card space-y-4 p-5 md:p-6" onSubmit={(event) => void prepare(event)}>
          <div>
            <h2 className="text-lg font-bold text-slate-950">1. Préparer un nouveau compte local</h2>
            <p className="mt-1 text-sm text-slate-600">
              Réservé aux nouveaux responsables. Un compte existant ne sera jamais promu automatiquement.
            </p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Établissement *</span>
            <select className="sn-input w-full" value={schoolId}
              disabled={busy || loading || migrationPending || isDemo}
              onChange={(event) => {
                setSchoolId(event.target.value);
                setPrepared(null);
                setNotice(null);
              }}>
              <option value="">Sélectionner un établissement</option>
              {activeSchools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Nom du responsable *</span>
            <input className="sn-input w-full" type="text" autoComplete="name" required
              minLength={3} maxLength={160} value={fullName}
              disabled={busy || loading || migrationPending || isDemo}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Nom et prénom de l'administrateur" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Adresse e-mail personnelle *</span>
            <input className="sn-input w-full" type="email" required autoComplete="email"
              maxLength={254} value={email}
              disabled={busy || loading || migrationPending || isDemo}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="responsable@exemple.ci" />
          </label>
          <button className="sn-btn-primary w-full" type="submit"
            disabled={!selectedSchool || busy || loading || migrationPending || isDemo}>
            {busy ? "Préparation…" : "Préparer le compte et l'invitation"}
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            Aucun e-mail n'est envoyé automatiquement. Le Super Administrateur vérifie
            l'identité du responsable et son habilitation avant cette étape.
          </p>
        </form>

        <section className="sn-card space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">2. Invitation prête à transmettre</h2>
            <p className="mt-1 text-sm text-slate-600">
              Le lien n'est affiché qu'une fois. Il n'est ni sauvegardé dans SCHOOLNET
              ni récupérable depuis l'historique.
            </p>
          </div>
          {prepared ? (
            <div className="space-y-4">
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                ✓ Invitation préparée pour <strong>{prepared.email}</strong> — {prepared.school_name}.
              </p>
              <p className="text-xs leading-5 text-slate-600">
                Le lien peut expirer : transmettez-le sans délai. Ne l'envoyez pas
                à une adresse différente de celle vérifiée.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="sn-btn-primary" type="button" onClick={() => void copyInvitation()}>
                  Copier le message et le lien
                </button>
                <button className="sn-btn-ghost" type="button" onClick={openEmail}>
                  ✉ Ouvrir dans ma messagerie
                </button>
                <button className="sn-btn-ghost" type="button"
                  onClick={() => { setPrepared(null); setNotice("Invitation masquée ; vous pourrez générer un nouveau lien si nécessaire."); }}>
                  Masquer le lien
                </button>
              </div>
              <p className="text-xs text-slate-500">
                L'ouverture de la messagerie ne confirme pas l'envoi.
                Après l'avoir réellement envoyé, utilisez le bouton de suivi ci-dessous.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              Aucune invitation en mémoire. Préparez un compte avec le formulaire ou
              régénérez un lien pour un responsable déjà affecté.
            </div>
          )}
        </section>
      </section>

      <section className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">3. Suivi des invitations</h2>
            <p className="mt-1 text-sm text-slate-600">
              {selectedSchool?.name ?? "Choisissez un établissement"} · {selectedInvites.length} invitation(s).
            </p>
          </div>
          <button className="sn-btn-ghost" type="button"
            disabled={busy || loading || isDemo}
            onClick={() => { setPrepared(null); setRevision((v) => v + 1); }}>↻ Actualiser</button>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Chargement…</p>
        ) : selectedInvites.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Aucune invitation préparée pour cet établissement.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {selectedInvites.map((invite) => (
              <div className="flex flex-wrap items-center justify-between gap-4 p-5" key={invite.user_id}>
                <div className="min-w-0 space-y-1">
                  <p className="break-all text-sm font-bold text-slate-900">{invite.email}</p>
                  <p className="text-xs text-slate-500">
                    Dernière préparation : {fmt(invite.last_prepared_at)} · {invite.generation_count} génération(s)
                  </p>
                  <p className={invite.sent_declared_at
                    ? "text-xs font-semibold text-emerald-700"
                    : "text-xs font-semibold text-amber-700"}>
                    {invite.sent_declared_at
                      ? "Envoi déclaré le " + fmt(invite.sent_declared_at) + " (réception non confirmée)"
                      : "Envoi non déclaré"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="sn-btn-ghost" type="button"
                    disabled={busy || Boolean(markingId) || migrationPending || isDemo ||
                      Date.now() - new Date(invite.last_prepared_at).getTime() < 60000}
                    onClick={() => void regenerate(invite)}>
                    Régénérer un lien
                  </button>
                  <button className="sn-btn-primary" type="button"
                    disabled={Boolean(invite.sent_declared_at) || busy || Boolean(markingId) || isDemo}
                    onClick={() => void markSent(invite)}>
                    {markingId === invite.user_id ? "Enregistrement…" : "Déclarer l'envoi effectué"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
