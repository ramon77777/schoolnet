import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  createAdminSchool,
  getActiveSchoolAdmins,
  getAdminSchools,
  isSchoolSetupPending,
  schoolManagementError,
  type SchoolMembership,
  type SchoolRecord,
} from "@/features/schools/lib/schoolManagementApi";

type FormValues = { name: string; code: string; contactEmail: string };
const EMPTY_FORM: FormValues = { name: "", code: "", contactEmail: "" };

export default function AdminSchools() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [memberships, setMemberships] = useState<SchoolMembership[]>([]);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || isDemo) {
      setLoading(false);
      setSchools([]);
      setMemberships([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [nextSchools, nextMemberships] = await Promise.all([
          getAdminSchools(),
          getActiveSchoolAdmins(),
        ]);
        if (cancelled) return;
        setSchools(nextSchools);
        setMemberships(nextMemberships);
        setMigrationPending(false);
      } catch (cause) {
        if (cancelled) return;
        if (isSchoolSetupPending(cause)) {
          setSchools([]);
          setMemberships([]);
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

  const adminsBySchool = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of memberships) {
      counts.set(row.school_id, (counts.get(row.school_id) ?? 0) + 1);
    }
    return counts;
  }, [memberships]);
  const activeCount = schools.filter((row) => row.status === "active").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading || migrationPending || isDemo || !user?.id) return;
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    const contactEmail = form.contactEmail.trim();
    if (name.length < 3 || name.length > 160) {
      setError("Le nom de l'établissement doit contenir entre 3 et 160 caractères.");
      return;
    }
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
      setError("Le code doit contenir 3 à 24 lettres majuscules, chiffres ou tirets.");
      return;
    }
    if (contactEmail && (contactEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
      setError("L'adresse e-mail de l'établissement est invalide.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await createAdminSchool({ name, code, contactEmail });
      setForm(EMPTY_FORM);
      setSuccess("Établissement enregistré. Aucun apprenant ni compte n'a été créé automatiquement.");
      reload();
    } catch (cause) {
      setError(schoolManagementError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6 pb-12">
      <header className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-white via-blue-50/70 to-indigo-50 px-5 py-7 md:px-8">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-2xl text-white">🏫</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">Administration centrale</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">Établissements SCHOOLNET</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Créez les fiches des établissements. Chaque administrateur local sera ensuite limité
                aux données de son école, sans accès aux privilèges du Super Administrateur.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-2">
              <Link to="/app/admin/dashboard" className="sn-btn-ghost">← Tableau de bord</Link>
              <Link to="/app/admin/school-invitations" className="sn-btn-primary">✉ Inviter un responsable</Link>
            </div>
            <button type="button" className="sn-btn-ghost" disabled={loading || saving || isDemo}
              onClick={reload}>↻ Actualiser</button>
          </div>
        </div>
      </header>

      {migrationPending && !isDemo && (
        <section role="status" className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-bold">Mise en service en attente</h2>
          <p className="mt-2">La gestion des établissements est développée sur la branche GitHub,
            mais sa migration Supabase n'a pas encore été autorisée ni installée.
            Aucune création n'est possible avant sa validation.</p>
        </section>
      )}
      {isDemo && (
        <p role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Les opérations réelles sont désactivées en mode démonstration.
        </p>
      )}
      {error && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Indicateurs établissements">
        {[
          { label: "Établissements", number: schools.length },
          { label: "Établissements actifs", number: activeCount },
          { label: "Administrateurs locaux affectés", number: memberships.length },
        ].map((item) => (
          <div className="sn-card p-5" key={item.label}>
            <p className="text-2xl font-extrabold text-indigo-700">{item.number}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <form className="sn-card space-y-4 p-5 md:p-6" onSubmit={(event) => void submit(event)}>
          <div>
            <h2 className="text-lg font-bold text-slate-950">1. Ajouter un établissement</h2>
            <p className="mt-1 text-sm text-slate-600">Seul le Super Administrateur SCHOOLNET peut effectuer cette opération.</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Nom de l'établissement *</span>
            <input className="sn-input w-full" required minLength={3} maxLength={160}
              value={form.name} placeholder="Ex. : Collège Horizon"
              disabled={saving || loading || migrationPending || isDemo}
              onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Code unique *</span>
            <input className="sn-input w-full" required minLength={3} maxLength={24}
              value={form.code} placeholder="Ex. : COL-HORIZON"
              disabled={saving || loading || migrationPending || isDemo}
              onChange={(event) => setForm((old) => ({ ...old,
                code: event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") }))} />
            <span className="mt-1 block text-xs text-slate-500">Lettres, chiffres et tirets ; le code ne sert pas de mot de passe.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">E-mail de contact (facultatif)</span>
            <input className="sn-input w-full" type="email" maxLength={254}
              value={form.contactEmail} placeholder="contact@ecole.example"
              disabled={saving || loading || migrationPending || isDemo}
              onChange={(event) => setForm((old) => ({ ...old, contactEmail: event.target.value }))} />
          </label>
          <button className="sn-btn-primary w-full" type="submit"
            disabled={saving || loading || migrationPending || isDemo}>
            {saving ? "Enregistrement…" : "Créer l'établissement"}
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            La création de l'établissement ne donne accès à aucune donnée scolaire.
            Les comptes des responsables locaux et les invitations seront configurés séparément.
          </p>
        </form>

        <div className="sn-card overflow-hidden">
          <div className="border-b border-slate-100 p-5 md:p-6">
            <h2 className="text-lg font-bold text-slate-950">2. Répertoire des établissements</h2>
            <p className="mt-1 text-sm text-slate-600">
              {loading ? "Chargement…" : String(schools.length) + " établissement(s) enregistré(s)."}
            </p>
          </div>
          {loading ? <p className="p-6 text-sm text-slate-500">Chargement en cours…</p> :
            schools.length === 0 ? (
              <div className="space-y-2 p-6 text-sm text-slate-600">
                <p className="font-semibold">Aucun établissement affiché.</p>
                <p>{migrationPending
                  ? "L'activation SQL est en attente."
                  : "Créez le premier établissement avec le formulaire ci-contre."}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {schools.map((school) => (
                  <article key={school.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900">{school.name}</h3>
                      <p className="mt-1 font-mono text-xs text-slate-500">{school.code}</p>
                      {school.contact_email && <p className="mt-1 break-all text-xs text-slate-500">
                        {school.contact_email}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <span className={school.status === "active"
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"
                        : "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800"}>
                        {school.status === "active" ? "Actif" : "Suspendu"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {adminsBySchool.get(school.id) ?? 0} admin(s) local(aux)
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </div>
      </section>

      <section className="sn-card p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-950">3. Accès locaux et invitations</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          L'assistant d'invitation SCHOOLNET est accessible depuis le bouton « Inviter un responsable ».
          Après activation des protections SQL et de la fonction serveur, il préparera le compte,
          le rattachement à l'école et un lien temporaire à envoyer manuellement, sans mot de passe en clair.
        </p>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          Les nouveaux administrateurs d'établissement n'obtiendront jamais automatiquement
          les droits du compte « admin » central. L'ouverture de leur espace devra être
          précédée d'une recette complète d'isolation entre établissements.
        </div>
      </section>
    </main>
  );
}
