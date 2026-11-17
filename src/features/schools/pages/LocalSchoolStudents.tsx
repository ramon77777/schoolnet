import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, type SchoolRecord } from "@/features/schools/lib/schoolManagementApi";
import { areSchoolStudentsReadOnly } from "@/features/schools/lib/schoolStudentWritePolicy";
import {
  attachLocalSchoolStudent,
  getLocalSchoolStudentRoster,
  isSchoolStudentsActivationPending,
  schoolStudentErrorMessage,
  setLocalSchoolStudentActive,
  type LocalSchoolStudent,
} from "@/features/schools/lib/schoolStudentsApi";

type Activation = "checking" | "pending" | "ready" | "error";
type StatusFilter = "all" | "active" | "revoked";

export default function LocalSchoolStudents() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const readOnlyPreview = areSchoolStudentsReadOnly();

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);

  const [activation, setActivation] = useState<Activation>("checking");
  const [students, setStudents] = useState<LocalSchoolStudent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || isDemo) {
      setSchools([]);
      setSchoolId("");
      setSchoolsLoading(false);
      return;
    }
    let cancelled = false;
    setSchoolsLoading(true);
    setSchoolsError(null);
    void getAdminSchools()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((item) => item.status === "active");
        setSchools(active);
        setSchoolId((previous) =>
          active.some((item) => item.id === previous) ? previous : (active[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setSchoolId("");
        setSchoolsError("Impossible de charger vos établissements autorisés.");
      })
      .finally(() => {
        if (!cancelled) setSchoolsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, isDemo, authLoading]);

  useEffect(() => {
    setStudents([]);
    setLoadError(null);
    setFormError(null);
    if (authLoading || !user?.id || isDemo || !schoolId) {
      setActivation("checking");
      return;
    }
    let cancelled = false;
    setActivation("checking");
    void getLocalSchoolStudentRoster(schoolId)
      .then((roster) => {
        if (cancelled) return;
        setStudents(roster.students);
        setActivation("ready");
      })
      .catch((cause) => {
        if (cancelled) return;
        setStudents([]);
        if (isSchoolStudentsActivationPending(cause)) {
          setActivation("pending");
        } else {
          setActivation("error");
          setLoadError(schoolStudentErrorMessage(cause));
        }
      });
    return () => { cancelled = true; };
  }, [schoolId, user?.id, authLoading, isDemo, revision]);

  const ready = activation === "ready";
  const selectedSchool = schools.find((school) => school.id === schoolId);
  const activeCount = students.filter((row) => row.status === "active").length;
  const revokedCount = students.length - activeCount;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return students.filter((row) =>
      (statusFilter === "all" || row.status === statusFilter) &&
      (!normalized ||
        row.full_name.toLocaleLowerCase().includes(normalized) ||
        (row.email ?? "").toLocaleLowerCase().includes(normalized)),
    );
  }, [students, query, statusFilter]);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const busy = saving || changingId !== null;
  const canAttach = ready && !readOnlyPreview && !isDemo &&
    Boolean(user?.id && schoolId) && emailValid && !busy;

  function refresh() {
    setSuccess(null);
    setRevision((value) => value + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAttach) return;
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      await attachLocalSchoolStudent(schoolId, normalizedEmail);
      setEmail("");
      setSuccess("L'élève a été rattaché à cet établissement, sans affectation à une classe.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setFormError(schoolStudentErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(student: LocalSchoolStudent) {
    if (readOnlyPreview || !ready || !schoolId || isDemo || busy) return;
    const enable = student.status === "revoked";
    const label = student.full_name || "cet élève";
    if (!window.confirm(enable
      ? `Réactiver le rattachement de « ${label} » à cet établissement ?`
      : `Révoquer le rattachement de « ${label} » à cet établissement ?`
    )) return;

    setChangingId(student.membership_id);
    setFormError(null);
    setSuccess(null);
    try {
      await setLocalSchoolStudentActive(schoolId, student.membership_id, enable);
      setSuccess(enable
        ? "Le rattachement de l'élève a été réactivé."
        : "Le rattachement local a été révoqué. Le compte et ses données scolaires sont conservés.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setFormError(schoolStudentErrorMessage(cause));
    } finally {
      setChangingId(null);
    }
  }

  return (
    <main className="space-y-5 pb-10">
      <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
              SCHOOLNET · Espace établissement
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
              Gestion des élèves
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Consultez les élèves rattachés à votre établissement et gérez
              leurs affiliations. Les inscriptions en classe, les résultats et
              les liens familiaux restent indépendants.
            </p>
          </div>
          <Link to="/app/school/dashboard" className="sn-btn-ghost">
            ← Mon établissement
          </Link>
        </div>
      </header>

      <section className="sn-card space-y-2 p-5">
        <label htmlFor="student-school-select" className="block text-sm font-semibold text-slate-800">
          Établissement autorisé
        </label>
        {schoolsLoading ? (
          <p className="text-sm text-slate-500">Vérification des établissements autorisés…</p>
        ) : (
          <select id="student-school-select"
            className="sn-input w-full md:max-w-xl"
            value={schoolId}
            disabled={schools.length === 0 || busy || isDemo}
            onChange={(event) => {
              setSchoolId(event.target.value);
              setEmail("");
              setSuccess(null);
              setQuery("");
              setStatusFilter("all");
            }}
          >
            {schools.length === 0 && <option value="">Aucun établissement actif autorisé</option>}
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name} — {school.code}
              </option>
            ))}
          </select>
        )}
        {selectedSchool && (
          <p className="text-xs text-slate-500">
            Code de l'établissement : <span className="font-mono font-semibold">{selectedSchool.code}</span>
          </p>
        )}
        {schoolsError && <p role="alert" className="text-sm text-red-700">{schoolsError}</p>}
      </section>

      {isDemo && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Mode démonstration : aucun dossier d'élève réel n'est chargé.
        </div>
      )}

      {!isDemo && readOnlyPreview && (
        <div role="status" className="sn-card border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-bold">Prévisualisation SCHOOLNET — lecture seule</p>
          <p className="mt-1">
            Sur localhost et les Previews Vercel, la consultation autorisée reste possible.
            Aucun rattachement, aucune révocation et aucune réactivation ne sont permis.
          </p>
        </div>
      )}

      {!isDemo && schoolId && activation === "pending" && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">🔒 S3-B — Activation du module en attente</p>
          <p className="mt-1">
            L'interface S3-B est prête. Les fonctions SQL de rattachement
            des élèves ne sont pas encore installées sur Supabase.
          </p>
        </div>
      )}
      {!isDemo && schoolId && activation === "checking" && (
        <div role="status" className="sn-card p-4 text-sm text-slate-600">
          Chargement des élèves autorisés…
        </div>
      )}
      {loadError && (
        <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}
        </p>
      )}
      {formError && (
        <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {formError}
        </p>
      )}
      {success && (
        <p role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="sn-card space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">1. Rattacher un élève</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Saisissez l'adresse e-mail personnelle exacte d'un compte
              <strong> Élève</strong> déjà créé et confirmé dans SCHOOLNET.
              Aucun compte n'est créé par cette action.
            </p>
          </div>
          <form className="space-y-3" onSubmit={(event) => void submit(event)}>
            <label htmlFor="student-attach-email" className="block text-sm font-semibold text-slate-800">
              Adresse e-mail de l'élève *
            </label>
            <input id="student-attach-email"
              type="email"
              className="sn-input w-full"
              placeholder="eleve@exemple.ci"
              required
              autoComplete="off"
              maxLength={254}
              value={email}
              disabled={!ready || busy || isDemo}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="sn-btn-primary w-full" disabled={!canAttach}>
              {saving ? "Rattachement en cours…" :
                readOnlyPreview ? "Aperçu en lecture seule" : "Rattacher l'élève"}
            </button>
          </form>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-900">
            Un élève peut être rattaché à plusieurs établissements : chacun
            possède un statut indépendant. L'inscription dans une classe sera
            gérée séparément en S3-C.
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            <strong>Élèves sans e-mail personnel :</strong> le parcours SCHOOLNET
            existant reste conservé. N'utilisez jamais l'adresse technique
            de connexion pour effectuer un rattachement ici.
          </div>
        </div>

        <div className="sn-card space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">2. Élèves de mon établissement</h2>
              <p className="mt-1 text-xs text-slate-500">
                {ready ? `${activeCount} actif(s) · ${revokedCount} révoqué(s)` :
                  "Répertoire non activé"}
              </p>
            </div>
            <button type="button" className="sn-btn-ghost"
              disabled={!schoolId || schoolsLoading || busy || isDemo}
              onClick={refresh}>
              ↻ Actualiser
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div>
              <label htmlFor="student-search" className="sr-only">Rechercher un élève</label>
              <input id="student-search" type="search" className="sn-input w-full"
                placeholder="Nom ou e-mail de l'élève"
                value={query}
                disabled={!ready}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="student-status-filter" className="sr-only">Filtrer par statut</label>
              <select id="student-status-filter" className="sn-input w-full"
                value={statusFilter} disabled={!ready}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">Tous les statuts</option>
                <option value="active">Actifs</option>
                <option value="revoked">Révoqués</option>
              </select>
            </div>
          </div>

          {!ready && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Le répertoire sera consultable après activation de S3-B et
              vérification de vos droits sur cet établissement.
            </p>
          )}
          {ready && students.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Aucun élève rattaché à cet établissement pour le moment.
            </p>
          )}
          {ready && students.length > 0 && filtered.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Aucun élève ne correspond aux filtres sélectionnés.
            </p>
          )}

          {ready && filtered.map((student) => (
            <article key={student.membership_id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{student.full_name || "Élève"}</p>
                  <p className="mt-1 break-all text-xs text-slate-600">
                    {student.email ?? "Compte sans e-mail personnel"}
                  </p>
                  <span className={student.status === "active"
                    ? "mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                    : "mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"}>
                    {student.status === "active" ? "Actif" : "Révoqué"}
                  </span>
                </div>
                <button type="button" className="sn-btn-ghost"
                  disabled={readOnlyPreview || !ready || busy || isDemo ||
                    (student.email === null && student.status === "revoked")}
                  onClick={() => void changeStatus(student)}>
                  {changingId === student.membership_id ? "Traitement…" :
                    student.status === "active" ? "Révoquer" : "Réactiver"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
