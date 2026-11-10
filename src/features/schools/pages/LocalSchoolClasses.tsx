import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, type SchoolRecord } from "@/features/schools/lib/schoolManagementApi";
import {
  createLocalSchoolClass,
  getLocalSchoolClassCatalog,
  getLocalSchoolClasses,
  isSchoolClassesActivationPending,
  schoolClassErrorMessage,
  type LocalSchoolClass,
  type SchoolClassCatalog,
} from "@/features/schools/lib/schoolClassesApi";

export default function LocalSchoolClasses() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolError, setSchoolError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<SchoolClassCatalog | null>(null);
  const [classes, setClasses] = useState<LocalSchoolClass[]>([]);
  const [activation, setActivation] = useState<"checking" | "pending" | "ready" | "error">("checking");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [className, setClassName] = useState("");
  const [levelId, setLevelId] = useState("");
  const [schoolYearId, setSchoolYearId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || isDemo) {
      setSchools([]);
      setSelectedSchoolId("");
      setSchoolsLoading(false);
      return;
    }
    let cancelled = false;
    setSchoolsLoading(true);
    setSchoolError(null);
    void getAdminSchools()
      .then((rows) => {
        if (cancelled) return;
        const activeSchools = rows.filter((row) => row.status === "active");
        setSchools(activeSchools);
        setSelectedSchoolId((previous) =>
          activeSchools.some((row) => row.id === previous)
            ? previous : (activeSchools[0]?.id ?? "")
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setSelectedSchoolId("");
        setSchoolError("Impossible de charger vos établissements autorisés.");
      })
      .finally(() => { if (!cancelled) setSchoolsLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, isDemo, authLoading]);

  useEffect(() => {
    setCatalog(null);
    setClasses([]);
    setFormError(null);
    setLevelId("");
    setSchoolYearId("");
    if (authLoading || !user?.id || isDemo || !selectedSchoolId) {
      setActivation("checking");
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setActivation("checking");
    setLoadError(null);
    void (async () => {
      try {
        // Pas d'accès direct à school_years, protégé pour school_admin.
        const nextCatalog = await getLocalSchoolClassCatalog(selectedSchoolId);
        const nextClasses = await getLocalSchoolClasses(selectedSchoolId);
        if (cancelled) return;
        setCatalog(nextCatalog);
        setClasses(nextClasses);
        setActivation("ready");
      } catch (cause) {
        if (cancelled) return;
        setCatalog(null);
        setClasses([]);
        if (isSchoolClassesActivationPending(cause)) {
          setActivation("pending");
        } else {
          setActivation("error");
          setLoadError(schoolClassErrorMessage(cause));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isDemo, authLoading, selectedSchoolId, revision]);

  const school = schools.find((row) => row.id === selectedSchoolId);
  const ready = activation === "ready" && catalog?.school_id === selectedSchoolId;
  const safeCatalog = ready ? catalog : null;
  const visibleClasses = ready ? classes : [];
  const levelNames = useMemo(
    () => new Map(safeCatalog?.levels.map((row) => [row.id, row.name]) ?? []),
    [safeCatalog],
  );
  const name = className.trim().replace(/\s+/g, " ");
  const canSave = Boolean(
    ready && !saving && !schoolsLoading && user?.id && !isDemo &&
    name.length >= 2 && name.length <= 100 &&
    safeCatalog?.levels.some((row) => String(row.id) === levelId) &&
    safeCatalog?.school_years.some((row) => row.id === schoolYearId)
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !selectedSchoolId || !safeCatalog) return;
    try {
      setSaving(true);
      setFormError(null);
      setSuccess(null);
      await createLocalSchoolClass({
        schoolId: selectedSchoolId,
        levelId: Number(levelId),
        schoolYearId,
        name,
      });
      setClassName("");
      setLevelId("");
      setSchoolYearId("");
      setSuccess("Classe créée avec succès et rattachée uniquement à votre établissement.");
      setRevision((value) => value + 1);
    } catch (cause) {
      if (isSchoolClassesActivationPending(cause)) {
        setActivation("pending");
      } else {
        setFormError(schoolClassErrorMessage(cause));
      }
    } finally {
      setSaving(false);
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
              Gestion des classes
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Créez et organisez les classes officielles de votre établissement.
              Les groupes d'apprenants libres et les cours à domicile restent indépendants.
            </p>
          </div>
          <Link to="/app/school/dashboard" className="sn-btn-ghost">
            ← Mon établissement
          </Link>
        </div>
      </header>

      {schoolError && (
        <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {schoolError}
        </p>
      )}

      <section className="sn-card space-y-3 p-5">
        <label htmlFor="local-school-select" className="block text-sm font-semibold text-slate-800">
          Établissement autorisé
        </label>
        {schoolsLoading ? (
          <p className="text-sm text-slate-500">Vérification de vos établissements…</p>
        ) : (
          <select
            id="local-school-select"
            className="sn-input w-full md:max-w-lg"
            value={selectedSchoolId}
            disabled={saving || isDemo || schools.length === 0}
            onChange={(event) => {
              setSelectedSchoolId(event.target.value);
              setClassName("");
              setSuccess(null);
            }}
          >
            {schools.length === 0 && <option value="">Aucun établissement actif autorisé</option>}
            {schools.map((item) => (
              <option key={item.id} value={item.id}>{item.name} — {item.code}</option>
            ))}
          </select>
        )}
        {school && (
          <p className="text-xs text-slate-500">
            Code de l'établissement : <span className="font-mono font-semibold">{school.code}</span>
          </p>
        )}
      </section>

      {isDemo && (
        <p className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Mode démonstration : aucune création ou lecture de données privées n'est autorisée.
        </p>
      )}
      {selectedSchoolId && activation === "pending" && !isDemo && (
        <div role="status" className="sn-card space-y-2 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">🔒 Activation du module en attente</p>
          <p>
            Le formulaire est préparé sur notre Preview, mais les protections S2-A et les
            fonctions S2-B n'ont pas encore été activées dans Supabase.
            Aucune classe ne peut être créée avant validation.
          </p>
        </div>
      )}
      {selectedSchoolId && activation === "checking" && !isDemo && (
        <p role="status" className="sn-card p-4 text-sm text-slate-600">
          Vérification du catalogue et des autorisations de l'établissement…
        </p>
      )}
      {selectedSchoolId && loadError && !isDemo && (
        <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {loadError}
        </p>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="sn-card space-y-4 p-5 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">1. Ajouter une classe</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Le nom est unique pour un établissement et une année scolaire.
              Deux écoles différentes peuvent utiliser le même nom de classe.
            </p>
          </div>
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Nom de la classe *</span>
              <input
                className="sn-input w-full"
                value={className}
                placeholder="Ex. : 6e A"
                minLength={2}
                maxLength={100}
                required
                disabled={!ready || saving}
                onChange={(event) => setClassName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Niveau *</span>
              <select
                className="sn-input w-full"
                value={levelId}
                required
                disabled={!ready || saving}
                onChange={(event) => setLevelId(event.target.value)}
              >
                <option value="">Sélectionner un niveau</option>
                {(safeCatalog?.levels ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Année scolaire *</span>
              <select
                className="sn-input w-full"
                value={schoolYearId}
                required
                disabled={!ready || saving}
                onChange={(event) => setSchoolYearId(event.target.value)}
              >
                <option value="">Choisir explicitement une année scolaire</option>
                {(safeCatalog?.school_years ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{item.is_current ? " — année en cours" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Le calendrier actuel est commun à SCHOOLNET. Vérifiez l'année avant de créer.
              </span>
            </label>
            {formError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {formError}
              </p>
            )}
            {success && (
              <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {success}
              </p>
            )}
            <button type="submit" className="sn-btn-primary w-full" disabled={!canSave}>
              {saving ? "Création en cours…" : "Créer la classe"}
            </button>
            <p className="text-xs leading-5 text-slate-500">
              Les élèves, enseignants, notes et bulletins ne sont pas affectés automatiquement.
              Ces fonctions seront ouvertes après leur propre recette de sécurité.
            </p>
          </form>
        </div>

        <div className="sn-card space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">2. Classes de mon établissement</h2>
              <p className="mt-1 text-xs text-slate-500">
                {ready ? String(visibleClasses.length) + " classe(s) autorisée(s)" : "Catalogue non activé"}
              </p>
            </div>
            <button
              type="button"
              className="sn-btn-ghost"
              onClick={() => setRevision((value) => value + 1)}
              disabled={schoolsLoading || saving || isDemo || !selectedSchoolId}
            >
              ↻ Actualiser
            </button>
          </div>
          {ready && visibleClasses.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Aucune classe officielle enregistrée dans cet établissement.
            </p>
          )}
          {!ready && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Les classes scolaires apparaîtront ici après l'activation et la validation
              des règles d'isolation en base.
            </p>
          )}
          {visibleClasses.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-slate-900">{item.name}</h3>
                <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                  Classe officielle
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {levelNames.get(item.level_id) ?? "Niveau non renseigné"}
                {" · "}{item.school_year}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
