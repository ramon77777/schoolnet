import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, getActiveSchoolAdmins } from "@/features/schools/lib/schoolManagementApi";
import { filterSchoolsForLocalAdmin } from "@/features/schools/lib/schoolPedagogyOverview";
import { getSchoolGradeConfiguration } from "@/features/schools/lib/schoolGradeConfigurationApi";
import { type SchoolGradeConfig } from "@/features/schools/lib/schoolGradeConfigurationModel";
import {
  readOfficialCurriculum, readOfficialGeneralPreview,
  saveOfficialCurriculum, approveOfficialCurriculum, officialGeneralActivationPending,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesApi";
import {
  displayGeneralAverage, filterGeneralStudents, summarizeGeneralStudents,
  GENERAL_PAGE_SIZE, type GeneralFilter, type OfficialCurriculum,
  type OfficialGeneralPreview, type GeneralScope, type GeneralStudent,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesModel";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig, makeDemoCurriculum, makeDemoGeneralPreview,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesDemo";

type SchoolOption = { id: string; name: string; code: string };
type LoadState = "idle" | "loading" | "ready" | "pending" | "error";
const statusLabels: Record<GeneralStudent["state"], string> = {
  ready: "Calculable", incomplete: "À compléter", not_configured: "À configurer",
};
const statusClass: Record<GeneralStudent["state"], string> = {
  ready: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  incomplete: "bg-amber-50 text-amber-900 ring-amber-200",
  not_configured: "bg-slate-100 text-slate-700 ring-slate-200",
};
const formattedDate = (iso: string) => {
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "non disponible";
};

export default function LocalSchoolOfficialGeneralAverages() {
  const { user, loading: authLoading } = useAuth();
  const allowed = Boolean(!authLoading && user?.id && !user.isDemo &&
    user.role === "school_admin");
  // The fixture is unreachable in production builds and never calls hosted APIs.
  const localDemo = import.meta.env.DEV && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("schoolnet_c3c4_demo") === "1";
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [schoolsFor, setSchoolsFor] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [config, setConfig] = useState<SchoolGradeConfig | null>(null);
  const [configFor, setConfigFor] = useState("");
  const [configState, setConfigState] = useState<LoadState>("idle");
  const [revision, setRevision] = useState(0);
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [curriculum, setCurriculum] = useState<OfficialCurriculum | null>(null);
  const [preview, setPreview] = useState<OfficialGeneralPreview | null>(null);
  const [reviewFor, setReviewFor] = useState("");
  const [reviewState, setReviewState] = useState<LoadState>("idle");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftSubjectIds, setDraftSubjectIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<GeneralFilter>("all");
  const [page, setPage] = useState(1);

  const ownerKey = allowed ? user?.id ?? "" : "";
  const visibleSchools = allowed && schoolsFor === ownerKey ? schools : [];
  const selectedSchool = visibleSchools.find((school) => school.id === schoolId) ?? null;
  const selectedSchoolId = selectedSchool?.id ?? "";
  const configKey = selectedSchoolId && ownerKey
    ? [ownerKey, selectedSchoolId, revision, localDemo ? "demo" : "live"].join("|") : "";

  useEffect(() => {
    if (!allowed || !user?.id) return;
    const uid = user.id;
    let cancelled = false;
    if (localDemo) {
      setSchools(DEMO_SCHOOLS.map(({ id, name, code }) => ({ id, name, code })));
      setSchoolsFor(uid);
      setSchoolId((old) => DEMO_SCHOOLS.some((s) => s.id === old) ? old : DEMO_SCHOOLS[0].id);
      setSchoolsError(null);
      return;
    }
    void Promise.all([getAdminSchools(), getActiveSchoolAdmins()])
      .then(([all, members]) => {
        if (cancelled) return;
        const list = filterSchoolsForLocalAdmin(all, members, uid)
          .map(({ id, name, code }) => ({ id, name, code }));
        setSchools(list); setSchoolsFor(uid); setSchoolsError(null);
        setSchoolId((old) => list.some((s) => s.id === old) ? old : list[0]?.id ?? "");
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]); setSchoolsFor(uid); setSchoolId("");
        setSchoolsError("Impossible de vérifier les établissements autorisés.");
      });
    return () => { cancelled = true; };
  }, [allowed, user?.id, localDemo]);

  useEffect(() => {
    if (!allowed || !selectedSchoolId || !configKey) return;
    let cancelled = false;
    const schoolIdToLoad = selectedSchoolId;
    if (localDemo) {
      setConfig(makeDemoGradeConfig(schoolIdToLoad));
      setConfigFor(configKey); setConfigState("ready");
      return;
    }
    void getSchoolGradeConfiguration(schoolIdToLoad)
      .then((value) => {
        if (cancelled) return;
        setConfig(value); setConfigFor(configKey); setConfigState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setConfig(null); setConfigFor(configKey); setConfigState("error");
      });
    return () => { cancelled = true; };
  }, [allowed, selectedSchoolId, configKey, localDemo]);

  const currentConfig = allowed && configFor === configKey &&
    configState === "ready" && config?.schoolId === selectedSchool?.id ? config : null;
  const activeYearId = currentConfig?.years.some((year) => year.id === yearId)
    ? yearId : currentConfig?.years[0]?.id ?? "";
  const yearSubjects = useMemo(() => currentConfig?.subjects
    .filter((subject) => subject.schoolYearId === activeYearId) ?? [],
    [currentConfig, activeYearId]);
  const classes = useMemo(() => [...new Map(yearSubjects.map((subject) =>
    [subject.classId, { id: subject.classId, name: subject.className }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, "fr")), [yearSubjects]);
  const activeClassId = classes.some((item) => item.id === classId)
    ? classId : classes[0]?.id ?? "";
  const periods = useMemo(() => currentConfig?.periods
    .filter((period) => period.schoolYearId === activeYearId)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn)) ?? [],
    [currentConfig, activeYearId]);
  const activePeriodId = periods.some((item) => item.id === periodId)
    ? periodId : periods[0]?.id ?? "";
  const selectedPeriod = periods.find((p) => p.id === activePeriodId) ?? null;
  const availableSubjects = yearSubjects.filter((subject) => subject.classId === activeClassId);
  const reviewKey = selectedSchool && activeYearId && activeClassId && activePeriodId
    ? [ownerKey, selectedSchool.id, activeYearId, activeClassId, activePeriodId,
      revision, localDemo ? "demo" : "live"].join("|") : "";

  const scope = useMemo<GeneralScope | null>(() => selectedSchoolId &&
    activeYearId && activeClassId && activePeriodId ? {
      schoolId: selectedSchoolId, schoolYearId: activeYearId,
      classId: activeClassId, periodId: activePeriodId,
    } : null, [selectedSchoolId, activeYearId, activeClassId, activePeriodId]);

  useEffect(() => {
    if (!allowed || !scope || !reviewKey) return;
    let cancelled = false;
    const load = async () => {
      try {
        const catalog = localDemo ? makeDemoCurriculum(scope) : await readOfficialCurriculum(scope);
        if (cancelled) return;
        setCurriculum(catalog);
        setDraftSubjectIds(catalog.subjects.map((s) => s.subjectId));
        const result = catalog.status === "approved"
          ? localDemo ? makeDemoGeneralPreview(scope) : await readOfficialGeneralPreview(scope)
          : null;
        if (cancelled) return;
        setPreview(result); setReviewFor(reviewKey);
        setReviewState("ready"); setReviewError(null);
      } catch (cause) {
        if (cancelled) return;
        setCurriculum(null); setPreview(null); setReviewFor(reviewKey);
        setReviewState(officialGeneralActivationPending(cause) ? "pending" : "error");
        setReviewError("Lecture des moyennes indisponible ou accès scolaire refusé.");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [allowed, reviewKey, scope, localDemo]);

  const currentCurriculum = reviewFor === reviewKey && reviewState === "ready" &&
    curriculum && scope ? curriculum : null;
  const currentPreview = reviewFor === reviewKey && reviewState === "ready" &&
    currentCurriculum?.status === "approved" ? preview : null;
  const rows = useMemo(() => currentPreview?.state === "preview"
    ? currentPreview.students : [], [currentPreview]);
  const totals = useMemo(() => summarizeGeneralStudents(rows), [rows]);
  const filtered = useMemo(() => filterGeneralStudents(rows, search, filter),
    [rows, search, filter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / GENERAL_PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const visibleRows = filtered.slice((activePage - 1) * GENERAL_PAGE_SIZE,
    activePage * GENERAL_PAGE_SIZE);
  const missingAvailable = currentCurriculum?.subjects
    .some((subject) => !availableSubjects.some((s) => s.subjectId === subject.subjectId)) ?? false;

  function changeContext() {
    setEditing(false); setNotice(null); setActionError(null);
    setSearch(""); setFilter("all"); setPage(1);
  }

  async function mutate(action: () => Promise<OfficialCurriculum>, success: string) {
    if (!allowed || !scope || !currentCurriculum || localDemo || selectedPeriod?.isLocked || busy)
      return;
    setBusy(true); setNotice(null); setActionError(null);
    try {
      await action();
      setEditing(false); setNotice(success);
      setRevision((value) => value + 1);
    } catch {
      setActionError("Opération refusée. Vérifiez vos droits, vos matières et le verrouillage de la période.");
    } finally {
      setBusy(false);
    }
  }

  function saveCurriculum() {
    if (!scope || !currentCurriculum || localDemo || busy || missingAvailable ||
      draftSubjectIds.length === 0 ||
      draftSubjectIds.some((id) => !availableSubjects.some((s) => s.subjectId === id)))
      return;
    const ok = window.confirm("Enregistrer cette liste de matières officielles ? " +
      "Toute modification invalide son approbation jusqu'à une nouvelle validation.");
    if (!ok) return;
    void mutate(() => saveOfficialCurriculum(scope, draftSubjectIds),
      "Liste enregistrée en brouillon. Une approbation explicite est nécessaire.");
  }

  function approveCurriculum() {
    if (!scope || !currentCurriculum || currentCurriculum.status === "missing" ||
      localDemo || busy || selectedPeriod?.isLocked) return;
    const ok = window.confirm("Approuver les matières attendues pour cette classe et cette période ? " +
      "Les moyennes générales resteront des prévisualisations non publiées.");
    if (!ok) return;
    void mutate(() => approveOfficialCurriculum(scope),
      "Programme approuvé. La prévisualisation a été actualisée.");
  }

  const stateBadge = currentCurriculum?.status === "approved"
    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
    : "bg-amber-50 text-amber-900 ring-amber-200";

  return <main className="space-y-6 pb-12">
    <header className="sn-card overflow-hidden border border-indigo-100 bg-gradient-to-br from-white via-blue-50 to-indigo-100 p-5 shadow-sm md:p-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-700">
        SCHOOLNET V2 · S4-C.3-C.4 · Pilotage pédagogique
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
            Moyennes générales officielles
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Prévisualisez les moyennes par établissement, année, classe et période.
            Les notes restent calculées et contrôlées côté serveur. Aucun bulletin
            ni résultat n'est publié depuis cet écran.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/80 px-3 py-1.5 text-indigo-700 ring-1 ring-indigo-200">
              Administration d'établissement
            </span>
            <span className="rounded-full bg-white/80 px-3 py-1.5 text-slate-700 ring-1 ring-slate-200">
              Aperçu privé · Sur 20
            </span>
          </div>
        </div>
        <Link to="/app/school/grading-settings" className="sn-btn-ghost">
          Périodes et coefficients
        </Link>
      </div>
    </header>

    {localDemo && allowed && <aside role="status"
      className="rounded-2xl border-2 border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
      <strong>RECETTE VISUELLE LOCALE — DONNÉES 100 % FICTIVES.</strong>
      <p className="mt-1">Aucune RPC ni donnée Supabase réelle n'est consultée en mode démonstration.
        Les actions d'enregistrement et d'approbation sont désactivées.</p>
    </aside>}
    {!authLoading && !allowed && <p role="alert" className="sn-card p-5 text-red-800">
      Accès réservé aux administrateurs d'établissement connectés et habilités.
      Les comptes de démonstration ne peuvent pas consulter de moyennes réelles.
    </p>}

    {allowed && <section aria-labelledby="c4-filters-title" className="sn-card space-y-5 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="c4-filters-title" className="text-lg font-bold text-slate-950">Périmètre scolaire</h2>
          <p className="text-xs text-slate-600">Choisissez uniquement les éléments autorisés pour votre compte.</p>
        </div>
        <button type="button" className="sn-btn-ghost"
          disabled={busy || !selectedSchool} onClick={() => {
            changeContext(); setRevision((value) => value + 1);
          }}>↻ Actualiser</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5 text-sm font-semibold text-slate-800 xl:col-span-1">
          <span>Établissement</span>
          <select className="sn-input w-full" aria-label="Établissement" value={selectedSchool?.id ?? ""}
            disabled={busy || !visibleSchools.length}
            onChange={(event) => {
              setSchoolId(event.target.value); setYearId(""); setClassId(""); setPeriodId("");
              changeContext();
            }}>
            {!visibleSchools.length && <option value="">Aucun établissement</option>}
            {visibleSchools.map((school) => <option key={school.id} value={school.id}>
              {school.name} · {school.code}
            </option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Année scolaire</span>
          <select className="sn-input w-full" aria-label="Année scolaire" value={activeYearId}
            disabled={!currentConfig || busy}
            onChange={(event) => {
              setYearId(event.target.value); setClassId(""); setPeriodId(""); changeContext();
            }}>
            {!currentConfig?.years.length && <option value="">Aucune année</option>}
            {currentConfig?.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Classe</span>
          <select className="sn-input w-full" aria-label="Classe" value={activeClassId}
            disabled={!classes.length || busy}
            onChange={(event) => {
              setClassId(event.target.value); setPeriodId(""); changeContext();
            }}>
            {!classes.length && <option value="">Aucune classe avec matière active</option>}
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Période</span>
          <select className="sn-input w-full" aria-label="Période" value={activePeriodId}
            disabled={!periods.length || busy}
            onChange={(event) => {
              setPeriodId(event.target.value); changeContext();
            }}>
            {!periods.length && <option value="">Aucune période</option>}
            {periods.map((period) => <option key={period.id} value={period.id}>
              {period.name} ({period.code}) {period.isLocked ? "· verrouillée" : ""}
            </option>)}
          </select>
        </label>
      </div>
      {schoolsFor !== ownerKey && <p role="status" className="text-sm text-slate-600">
        Vérification des habilitations de l'établissement…
      </p>}
      {schoolsError && <p role="alert" className="text-sm text-red-800">{schoolsError}</p>}
      {schoolsFor === ownerKey && !selectedSchool && !schoolsError &&
        <p role="status" className="text-sm text-slate-600">Aucun établissement actif autorisé.</p>}
      {selectedSchool && configFor !== configKey &&
        <p role="status" className="text-sm text-slate-600">Chargement des périodes et classes…</p>}
      {selectedSchool && configFor === configKey && configState === "error" &&
        <p role="alert" className="text-sm text-red-800">
          Configuration scolaire indisponible. Vérifiez vos habilitations et les RPC existantes.
        </p>}
      {currentConfig && !classes.length && <p role="status" className="text-sm text-amber-800">
        Aucune classe avec matière affectée pour cette année. Vérifiez les affectations officielles.
      </p>}
      {currentConfig && !periods.length && <p role="status" className="text-sm text-amber-800">
        Aucune période configurée. Utilisez « Périodes et coefficients » pour créer une période.
      </p>}
    </section>}

    {allowed && scope && reviewFor !== reviewKey &&
      <section role="status" className="sn-card p-6 text-sm text-slate-600">
        Contrôle des droits, du programme approuvé et des moyennes officielles…
      </section>}

    {allowed && scope && reviewFor === reviewKey && reviewState === "pending" &&
      <section role="status" className="sn-card border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-bold text-amber-900">Activation SQL en attente</h2>
        <p className="mt-2 text-sm text-amber-900">
          Les RPC des moyennes générales C.3-C.3 sont préparées mais pas encore installées
          sur cette base. Aucune note fictive ne remplace les données réelles.
        </p>
      </section>}
    {allowed && scope && reviewFor === reviewKey && reviewState === "error" &&
      <p role="alert" className="sn-card border border-red-200 p-5 text-sm text-red-800">
        {reviewError}
      </p>}

    {allowed && currentCurriculum && <div className="space-y-6">
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{actionError}</p>}
      <section className="sn-card space-y-4 p-5 md:p-6" aria-labelledby="c4-curriculum-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="c4-curriculum-title" className="text-lg font-bold text-slate-950">
              Programme des matières attendues
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Le programme doit être explicitement approuvé avant tout calcul général.
              Les coefficients proviennent de la configuration officielle.
            </p>
          </div>
          <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 " + stateBadge}>
            {currentCurriculum.status === "approved" ? "Programme approuvé" :
              currentCurriculum.status === "draft" ? "Brouillon non approuvé" : "Non configuré"}
          </span>
        </div>
        {selectedPeriod?.isLocked && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Période verrouillée : programme consultable uniquement.
        </p>}
        {currentCurriculum.status === "approved" && currentCurriculum.approvedAt &&
          <p className="text-xs text-slate-500">
            Approbation enregistrée le {formattedDate(currentCurriculum.approvedAt)}.
          </p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {currentCurriculum.subjects.map((subject) =>
            <div key={subject.subjectId}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <strong className="min-w-0 text-sm text-slate-900">{subject.subjectName}</strong>
              <span className={"shrink-0 rounded-lg px-2 py-1 text-xs font-bold " +
                (subject.coefficient === null ? "bg-amber-100 text-amber-900" : "bg-white text-indigo-800")}>
                {subject.coefficient === null ? "Coef. manquant" : "Coef. " + subject.coefficient}
              </span>
            </div>)}
        </div>
        {currentCurriculum.subjects.length === 0 &&
          <p role="status" className="text-sm text-slate-600">
            Aucune matière officiellement enregistrée pour cette classe et cette période.
          </p>}
        {!localDemo && !selectedPeriod?.isLocked &&
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <button type="button" className="sn-btn-ghost" disabled={busy}
              onClick={() => {
                setEditing((old) => !old); setActionError(null);
                setDraftSubjectIds(currentCurriculum.subjects.map((s) => s.subjectId));
              }}>{editing ? "Annuler la sélection" : "Définir les matières"}</button>
            <button type="button" className="sn-btn-primary"
              disabled={busy || currentCurriculum.status !== "draft" ||
                currentCurriculum.subjects.length === 0 || editing}
              onClick={approveCurriculum}>
              {busy ? "Enregistrement…" : "Approuver le programme"}
            </button>
          </div>}
        {localDemo && <p className="text-xs text-violet-800">
          Recette fictive : l'enregistrement et l'approbation sont désactivés.
        </p>}
        {editing && !localDemo && <div
          className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <h3 className="font-bold text-slate-900">Matières proposées pour cette classe</h3>
          <p className="text-xs text-slate-600">
            Choisissez 1 à 60 matières. L'enregistrement remet toute approbation en brouillon.
          </p>
          {missingAvailable && <p role="alert" className="text-sm text-amber-900">
            Certaines matières déjà enregistrées ne figurent plus dans les affectations actives.
            Vérifiez-les avant de remplacer la liste afin d'éviter une suppression involontaire.
          </p>}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availableSubjects.map((subject) =>
              <label key={subject.subjectId}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600"
                  checked={draftSubjectIds.includes(subject.subjectId)}
                  disabled={busy || missingAvailable}
                  onChange={(event) => setDraftSubjectIds((old) =>
                    event.target.checked ? [...old, subject.subjectId] :
                      old.filter((value) => value !== subject.subjectId))}/>
                {subject.subjectName}
              </label>)}
          </div>
          <button type="button" className="sn-btn-primary" onClick={saveCurriculum}
            disabled={busy || missingAvailable || draftSubjectIds.length === 0 ||
              draftSubjectIds.length > 60}>
            {busy ? "Enregistrement…" : "Enregistrer la liste des matières"}
          </button>
        </div>}
        <p className="text-xs text-slate-500">
          L'enregistrement ne publie aucune moyenne. Les modifications de coefficient
          se font dans « Périodes et coefficients ».
        </p>
      </section>

      {currentCurriculum.status !== "approved" && <section role="status"
        className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <strong>Calcul non disponible.</strong> Validez d'abord le programme des matières attendues.
        Aucun résultat partiel ne sera affiché.
      </section>}

      {currentCurriculum.status === "approved" && currentPreview?.state === "not_configured" &&
        <section role="status" className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Programme détecté, mais la prévisualisation reste non paramétrée côté serveur.
          Vérifiez les matières et coefficients officiels.
        </section>}

      {currentCurriculum.status === "approved" && currentPreview?.state === "preview" && <>
        <section aria-label="Indicateurs de complétude de la classe"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Élèves de la classe", count: totals.total, color: "text-slate-950", surface: "bg-slate-50" },
            { title: "Moyennes calculables", count: totals.ready, color: "text-emerald-800", surface: "bg-emerald-50" },
            { title: "À compléter", count: totals.incomplete, color: "text-amber-800", surface: "bg-amber-50" },
            { title: "Non configurées", count: totals.notConfigured, color: "text-indigo-800", surface: "bg-indigo-50" },
          ].map((metric) =>
            <article key={metric.title} className="sn-card overflow-hidden p-5">
              <div className={"inline-flex rounded-lg px-2.5 py-1 text-xs font-bold " +
                metric.surface + " " + metric.color}>{metric.title}</div>
              <p className={"mt-3 text-3xl font-extrabold tabular-nums " + metric.color}>
                {metric.count}</p>
            </article>)}
        </section>

        <section className="sn-card space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Aperçu des élèves</h2>
              <p className="mt-1 text-xs text-slate-600">
                {filtered.length} élève(s) affichable(s) · {currentPreview.expectedSubjects} matière(s) attendue(s).
                Une moyenne n'est affichée que si toutes les conditions sont réunies.
              </p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
              Privé · Non publié
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <label className="space-y-1 text-xs font-bold text-slate-700">
              <span>Rechercher un élève</span>
              <input type="search" className="sn-input w-full" value={search}
                placeholder="Nom de l'élève…" autoComplete="off"
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}/>
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-700">
              <span>État de complétude</span>
              <select className="sn-input w-full" value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as GeneralFilter); setPage(1);
                }}>
                <option value="all">Tous les états</option>
                <option value="ready">Calculable</option>
                <option value="incomplete">À compléter</option>
                <option value="not_configured">À configurer</option>
              </select>
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[650px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Élève</th>
                  <th scope="col" className="px-4 py-3 font-bold">Complétude</th>
                  <th scope="col" className="px-4 py-3 font-bold">État</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Moyenne / 20</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((student) => <tr key={student.studentId} className="bg-white">
                  <td className="px-4 py-3 font-semibold text-slate-900">{student.studentName}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {student.readySubjects} / {student.expectedSubjects} matières
                  </td>
                  <td className="px-4 py-3">
                    <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 " +
                      statusClass[student.state]}>{statusLabels[student.state]}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">
                    {displayGeneralAverage(student)}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p role="status" className="text-sm text-slate-600">
            Aucun élève ne correspond aux critères sélectionnés.
          </p>}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>Page {activePage} sur {totalPages} · {filtered.length} élève(s)</p>
            <div className="flex gap-2">
              <button type="button" className="sn-btn-ghost"
                disabled={activePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </button>
              <button type="button" className="sn-btn-ghost"
                disabled={activePage >= totalPages} onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))}>
                Suivant
              </button>
            </div>
          </div>
        </section>
      </>}
    </div>}

    <p className="text-xs leading-5 text-slate-500">
      SCHOOLNET V2 · Prévisualisation réservée à l'établissement autorisé.
      Pas d'export, pas de publication, pas de modification de note ou de bulletin ;
      les moyennes libres V1 restent indépendantes.
    </p>
  </main>;
}
