import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, type SchoolRecord } from "@/features/schools/lib/schoolManagementApi";
import { areSchoolTeachersReadOnly } from "@/features/schools/lib/schoolTeacherWritePolicy";
import {
  attachLocalSchoolTeacher,
  getLocalSchoolTeacherRoster,
  isSchoolTeachersActivationPending,
  schoolTeacherErrorMessage,
  setLocalSchoolTeacherActive,
  type LocalSchoolTeacher,
} from "@/features/schools/lib/schoolTeachersApi";

type Activation = "checking" | "pending" | "ready" | "error";

export default function LocalSchoolTeachers() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const readOnlyPreview = areSchoolTeachersReadOnly();

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);

  const [activation, setActivation] = useState<Activation>("checking");
  const [teachers, setTeachers] = useState<LocalSchoolTeacher[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
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
    setTeachers([]);
    setLoadError(null);
    setFormError(null);
    if (authLoading || !user?.id || isDemo || !schoolId) {
      setActivation("checking");
      return;
    }

    let cancelled = false;
    setActivation("checking");
    void getLocalSchoolTeacherRoster(schoolId)
      .then((roster) => {
        if (cancelled) return;
        setTeachers(roster.teachers);
        setActivation("ready");
      })
      .catch((cause) => {
        if (cancelled) return;
        setTeachers([]);
        if (isSchoolTeachersActivationPending(cause)) {
          setActivation("pending");
        } else {
          setActivation("error");
          setLoadError(schoolTeacherErrorMessage(cause));
        }
      });
    return () => { cancelled = true; };
  }, [schoolId, user?.id, isDemo, authLoading, revision]);

  const ready = activation === "ready";
  const selectedSchool = schools.find((item) => item.id === schoolId);
  const activeCount = teachers.filter((teacher) => teacher.status === "active").length;
  const revokedCount = teachers.length - activeCount;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return teachers;
    return teachers.filter((teacher) =>
      teacher.full_name.toLocaleLowerCase().includes(query) ||
      teacher.email.toLocaleLowerCase().includes(query),
    );
  }, [teachers, search]);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const busy = saving || changingId !== null;
  const canAttach = ready && !readOnlyPreview && !isDemo &&
    Boolean(user?.id && schoolId) && !busy && emailValid;

  function refresh() {
    setSuccess(null);
    setRevision((current) => current + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAttach) return;
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      await attachLocalSchoolTeacher(schoolId, normalizedEmail);
      setEmail("");
      setSuccess("L'enseignant a été rattaché à cet établissement.");
      setRevision((current) => current + 1);
    } catch (cause) {
      setFormError(schoolTeacherErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(teacher: LocalSchoolTeacher) {
    if (readOnlyPreview || !ready || !schoolId || busy || isDemo) return;
    const enable = teacher.status === "revoked";
    const label = teacher.full_name || teacher.email;
    if (!window.confirm(
      enable
        ? `Réactiver l'enseignant « ${label} » dans cet établissement ?`
        : `Révoquer l'accès de « ${label} » à cet établissement ?`,
    )) return;

    setChangingId(teacher.membership_id);
    setFormError(null);
    setSuccess(null);
    try {
      await setLocalSchoolTeacherActive(schoolId, teacher.membership_id, enable);
      setSuccess(enable
        ? "Affiliation de l'enseignant réactivée."
        : "Affiliation de l'enseignant révoquée pour cet établissement.");
      setRevision((current) => current + 1);
    } catch (cause) {
      setFormError(schoolTeacherErrorMessage(cause));
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
              Gestion des enseignants
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Retrouvez les enseignants de votre établissement et gérez leurs
              rattachements. Les classes, les matières et les cours ne sont
              pas affectés automatiquement.
            </p>
          </div>
          <Link to="/app/school/dashboard" className="sn-btn-ghost">
            ← Mon établissement
          </Link>
        </div>
      </header>

      <section className="sn-card space-y-2 p-5">
        <label htmlFor="teacher-school-select" className="block text-sm font-semibold text-slate-800">
          Établissement autorisé
        </label>
        {schoolsLoading ? (
          <p className="text-sm text-slate-500">Vérification de vos établissements…</p>
        ) : (
          <select
            id="teacher-school-select"
            className="sn-input w-full md:max-w-xl"
            value={schoolId}
            disabled={busy || isDemo || schools.length === 0}
            onChange={(event) => {
              setSchoolId(event.target.value);
              setEmail("");
              setSuccess(null);
              setSearch("");
            }}
          >
            {schools.length === 0 &&
              <option value="">Aucun établissement actif autorisé</option>}
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name} — {school.code}
              </option>
            ))}
          </select>
        )}
        {selectedSchool && (
          <p className="text-xs text-slate-500">
            Code : <span className="font-mono font-semibold">{selectedSchool.code}</span>
          </p>
        )}
        {schoolsError && <p role="alert" className="text-sm text-red-700">{schoolsError}</p>}
      </section>

      {isDemo && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Mode démonstration : aucun compte privé n'est chargé et aucune action n'est possible.
        </div>
      )}

      {!isDemo && readOnlyPreview && (
        <div role="status" className="sn-card border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-bold">Prévisualisation SCHOOLNET — lecture seule</p>
          <p className="mt-1">
            Depuis localhost et les Previews Vercel, la consultation autorisée reste possible,
            mais aucun rattachement, aucune révocation et aucune réactivation ne peuvent être effectués.
          </p>
        </div>
      )}

      {!isDemo && schoolId && activation === "pending" && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">⚠️ S3-A — Répertoire momentanément indisponible</p>
          <p className="mt-1">
            S3-A est installé sur Supabase principal, mais les fonctions du
            répertoire ne sont pas visibles par cette session. Actualisez la
            page ou contactez l'administration SCHOOLNET si cela persiste.
          </p>
        </div>
      )}

      {!isDemo && schoolId && activation === "checking" && (
        <p role="status" className="sn-card p-4 text-sm text-slate-600">
          Chargement du répertoire des enseignants autorisés…
        </p>
      )}

      {loadError && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</p>}
      {formError && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{formError}</p>}
      {success && <p role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="sn-card space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">1. Rattacher un enseignant</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Saisissez l'adresse e-mail exacte d'un compte <strong>Enseignant</strong>
              déjà créé et vérifié dans SCHOOLNET. Cette action ne crée pas de compte.
            </p>
          </div>
          <form className="space-y-3" onSubmit={(event) => void submit(event)}>
            <label htmlFor="teacher-attach-email" className="block text-sm font-semibold text-slate-800">
              Adresse e-mail de l'enseignant *
            </label>
            <input
              id="teacher-attach-email"
              className="sn-input w-full"
              type="email"
              placeholder="enseignant@exemple.ci"
              value={email}
              maxLength={254}
              required
              autoComplete="off"
              disabled={!ready || busy || isDemo}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="sn-btn-primary w-full" disabled={!canAttach}>
              {saving ? "Rattachement en cours…" :
                readOnlyPreview ? "Aperçu en lecture seule" : "Rattacher l'enseignant"}
            </button>
          </form>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-900">
            Un enseignant peut être affilié à plusieurs établissements.
            La révocation ne supprime ni son compte, ni ses cours historiques.
            Les affectations pédagogiques seront traitées dans S3-C.
          </div>
        </div>

        <div className="sn-card space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">2. Enseignants de mon établissement</h2>
              <p className="mt-1 text-xs text-slate-500">
                {ready ? `${activeCount} actif(s) · ${revokedCount} révoqué(s)` : "Répertoire non activé"}
              </p>
            </div>
            <button type="button" className="sn-btn-ghost"
              disabled={!schoolId || schoolsLoading || busy || isDemo}
              onClick={refresh}>
              ↻ Actualiser
            </button>
          </div>

          <label htmlFor="teacher-roster-search" className="sr-only">Rechercher un enseignant</label>
          <input id="teacher-roster-search" type="search" className="sn-input w-full"
            placeholder="Rechercher par nom ou e-mail"
            value={search} disabled={!ready}
            onChange={(event) => setSearch(event.target.value)} />

          {!ready && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Le répertoire apparaît après son chargement et la vérification
              des droits sur votre établissement.
            </p>
          )}
          {ready && teachers.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Aucun enseignant rattaché à cet établissement pour le moment.
            </p>
          )}
          {ready && teachers.length > 0 && filtered.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Aucun enseignant ne correspond à cette recherche.
            </p>
          )}

          {ready && filtered.map((teacher) => (
            <article key={teacher.membership_id}
              className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">
                    {teacher.full_name || "Enseignant"}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-600">{teacher.email}</p>
                  <span className={teacher.status === "active"
                    ? "mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                    : "mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"}>
                    {teacher.status === "active" ? "Actif" : "Révoqué"}
                  </span>
                </div>
                <button type="button"
                  className="sn-btn-ghost"
                  disabled={readOnlyPreview || busy || isDemo}
                  onClick={() => void changeStatus(teacher)}>
                  {changingId === teacher.membership_id ? "Traitement…" :
                    teacher.status === "active" ? "Révoquer" : "Réactiver"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
