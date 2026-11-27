import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, getActiveSchoolAdmins } from "@/features/schools/lib/schoolManagementApi";
import { filterSchoolsForLocalAdmin } from "@/features/schools/lib/schoolPedagogyOverview";
import { getSchoolGradeConfiguration } from "@/features/schools/lib/schoolGradeConfigurationApi";
import type { SchoolGradeConfig } from "@/features/schools/lib/schoolGradeConfigurationModel";
import {
  readOfficialCurriculum, readOfficialGeneralPreview, officialGeneralActivationPending,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesApi";
import {
  isOfficialCurriculum, isOfficialGeneralPreview, summarizeGeneralStudents,
  type GeneralScope, type OfficialCurriculum, type OfficialGeneralPreview,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesModel";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig, makeDemoCurriculum, makeDemoGeneralPreview,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesDemo";
import SchoolAuthorizedStudentReportCard from "./SchoolAuthorizedStudentReportCard";

type SchoolChoice = { id: string; code: string; name: string };
type GradeLoad = {
  key: string;
  state: "ready" | "error";
  config: SchoolGradeConfig | null;
};
type RosterLoad = {
  key: string;
  state: "ready" | "pending" | "error";
  curriculum: OfficialCurriculum | null;
  preview: OfficialGeneralPreview | null;
};
const statusNames = {
  ready: "Calculable",
  incomplete: "À compléter",
  not_configured: "À configurer",
} as const;

/**
 * S4-D.3d — School-admin-only bulletin selection inside the documents hub.
 * Reuses the exact official C3-C3 read RPCs + S4-D.3b student projection.
 * No client-side grade calculation, new SQL, write, PDF or publication.
 */
export default function SchoolOfficialBulletinWorkspace() {
  const { user, loading } = useAuth();
  const allowed = Boolean(!loading && user?.id && !user.isDemo &&
    user.role === "school_admin");
  const localDemo = import.meta.env.DEV && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("schoolnet_c3c4_demo") === "1";

  const ownerKey = allowed ? user?.id ?? "" : "";
  const viewer = useMemo(() => allowed && user?.id ? ({
    id: user.id, role: "school_admin", isDemo: Boolean(user.isDemo),
  }) : null, [allowed, user?.id, user?.isDemo]);

  const [schools, setSchools] = useState<SchoolChoice[]>([]);
  const [schoolsFor, setSchoolsFor] = useState("");
  const [schoolsError, setSchoolsError] = useState(false);
  const [schoolId, setSchoolId] = useState("");
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [revision, setRevision] = useState(0);
  const [gradeLoad, setGradeLoad] = useState<GradeLoad | null>(null);
  const [rosterLoad, setRosterLoad] = useState<RosterLoad | null>(null);

  // Only a local test fixture is allowed to bypass hosted school reads.
  // The school list is for UX; access control remains the server RPC's duty.
  useEffect(() => {
    if (!allowed || !ownerKey) return;
    let cancelled = false;
    if (localDemo) {
      setSchools(DEMO_SCHOOLS.map(school => ({ ...school })));
      setSchoolsFor(ownerKey);
      setSchoolsError(false);
      return;
    }
    void Promise.all([getAdminSchools(), getActiveSchoolAdmins()])
      .then(([all, members]) => {
        if (cancelled) return;
        setSchools(filterSchoolsForLocalAdmin(all, members, ownerKey)
          .map(({ id, code, name }) => ({ id, code, name })));
        setSchoolsFor(ownerKey);
        setSchoolsError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setSchoolsFor(ownerKey);
        setSchoolsError(true);
      });
    return () => { cancelled = true; };
  }, [allowed, ownerKey, localDemo]);

  const visibleSchools = allowed && schoolsFor === ownerKey ? schools : [];
  const selectedSchool = visibleSchools.find(school => school.id === schoolId) ??
    visibleSchools[0] ?? null;
  const activeSchoolId = selectedSchool?.id ?? "";
  const configKey = ownerKey && activeSchoolId ? [
    ownerKey, activeSchoolId, revision, localDemo ? "fixture" : "server",
  ].join("|") : "";

  useEffect(() => {
    if (!allowed || !configKey || !activeSchoolId) return;
    let cancelled = false;
    async function load() {
      try {
        const config = localDemo
          ? makeDemoGradeConfig(activeSchoolId)
          : await getSchoolGradeConfiguration(activeSchoolId);
        if (!cancelled) setGradeLoad({ key: configKey, state: "ready", config });
      } catch {
        if (!cancelled) setGradeLoad({ key: configKey, state: "error", config: null });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [allowed, configKey, activeSchoolId, localDemo]);

  const currentConfig = gradeLoad?.key === configKey &&
    gradeLoad.state === "ready" &&
    gradeLoad.config?.schoolId === activeSchoolId ? gradeLoad.config : null;
  const years = currentConfig?.years ?? [];
  const activeYearId = years.some(year => year.id === yearId)
    ? yearId : years[0]?.id ?? "";
  const classes = useMemo(() => {
    const matches = currentConfig?.subjects.filter(subject =>
      subject.schoolYearId === activeYearId) ?? [];
    return [...new Map(matches.map(subject => [subject.classId, {
      id: subject.classId, name: subject.className,
    }])).values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [currentConfig, activeYearId]);
  const activeClassId = classes.some(item => item.id === classId)
    ? classId : classes[0]?.id ?? "";
  const periods = useMemo(() =>
    currentConfig?.periods.filter(period => period.schoolYearId === activeYearId)
      .sort((a, b) => a.startsOn.localeCompare(b.startsOn)) ?? [],
    [currentConfig, activeYearId]);
  const activePeriodId = periods.some(item => item.id === periodId)
    ? periodId : periods[0]?.id ?? "";

  const scope = useMemo<GeneralScope | null>(() =>
    activeSchoolId && activeYearId && activeClassId && activePeriodId ? {
      schoolId: activeSchoolId, schoolYearId: activeYearId,
      classId: activeClassId, periodId: activePeriodId,
    } : null, [activeSchoolId, activeYearId, activeClassId, activePeriodId]);
  const scopeKey = ownerKey && scope ? [
    ownerKey, scope.schoolId, scope.schoolYearId, scope.classId,
    scope.periodId, revision, localDemo ? "fixture" : "server",
  ].join("|") : "";

  useEffect(() => {
    if (!allowed || !scope || !scopeKey) return;
    // Preserve TypeScript's non-null narrowing across the async callback.
    const targetScope: GeneralScope = scope;
    let cancelled = false;
    async function load() {
      try {
        const curriculum = localDemo
          ? makeDemoCurriculum(targetScope)
          : await readOfficialCurriculum(targetScope);
        if (!isOfficialCurriculum(curriculum, targetScope))
          throw new Error("Programme hors périmètre.");
        const preview = curriculum.status === "approved"
          ? localDemo ? makeDemoGeneralPreview(targetScope)
            : await readOfficialGeneralPreview(targetScope)
          : null;
        if (preview && !isOfficialGeneralPreview(preview, targetScope))
          throw new Error("Aperçu hors périmètre.");
        if (!cancelled) setRosterLoad({
          key: scopeKey, state: "ready", curriculum, preview,
        });
      } catch (error) {
        if (!cancelled) setRosterLoad({
          key: scopeKey,
          state: !localDemo && officialGeneralActivationPending(error)
            ? "pending" : "error",
          curriculum: null, preview: null,
        });
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [allowed, scope, scopeKey, localDemo]);

  // A response from a previous school, year, class, period, actor or revision
  // is hidden immediately, even before useEffect cleanup completes.
  const currentRoster = rosterLoad?.key === scopeKey ? rosterLoad : null;
  const curriculum = currentRoster?.state === "ready"
    ? currentRoster.curriculum : null;
  const preview = curriculum?.status === "approved" &&
    currentRoster?.state === "ready" && currentRoster.preview?.state === "preview"
    ? currentRoster.preview : null;
  const cohortTotals = preview ? summarizeGeneralStudents(preview.students) : null;
  const selectedStudent = preview?.students.find(student =>
    student.studentId === studentId) ?? null;
  const activeYear = years.find(year => year.id === activeYearId) ?? null;
  const activeClass = classes.find(item => item.id === activeClassId) ?? null;
  const activePeriod = periods.find(item => item.id === activePeriodId) ?? null;

  function resetStudent() {
    setStudentId("");
  }

  return <section id="schoolnet-v2-bulletins" className="sn-card space-y-5 p-5 md:p-7"
    aria-labelledby="schoolnet-v2-bulletins-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-indigo-700">
          SCHOOLNET V2 · S4-D.3d
        </p>
        <h2 id="schoolnet-v2-bulletins-title"
          className="mt-2 text-xl font-extrabold text-slate-950">
          Bulletins individuels V2
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          Consultez un aperçu privé pour un élève de votre établissement, à partir
          des matières et des résultats scolaires autorisés. Aucune création,
          émission, publication ou export réel de bulletin.
        </p>
      </div>
      <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900">
        Aperçu privé · Non publié
      </span>
    </div>

    {localDemo && allowed && <p role="status"
      className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
      <strong>RECETTE LOCALE — DONNÉES 100 % FICTIVES.</strong>{" "}
      Aucun élève réel ni aucune note réelle ne sont consultés depuis ce mode.
    </p>}
    {!allowed && !loading && <p role="alert" className="text-sm text-red-800">
      Accès réservé à l'administration scolaire habilitée.
    </p>}

    {allowed && <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Établissement</span>
          <select className="sn-input w-full" aria-label="Établissement du bulletin"
            value={activeSchoolId} disabled={!visibleSchools.length}
            onChange={event => {
              setSchoolId(event.target.value);
              setYearId(""); setClassId(""); setPeriodId(""); resetStudent();
            }}>
            {!visibleSchools.length && <option value="">Aucun établissement</option>}
            {visibleSchools.map(school => <option key={school.id} value={school.id}>
              {school.name} · {school.code}
            </option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Année scolaire</span>
          <select className="sn-input w-full" aria-label="Année scolaire du bulletin"
            value={activeYearId} disabled={!currentConfig}
            onChange={event => {
              setYearId(event.target.value);
              setClassId(""); setPeriodId(""); resetStudent();
            }}>
            {!years.length && <option value="">Aucune année</option>}
            {years.map(year => <option key={year.id} value={year.id}>
              {year.name}
            </option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Classe</span>
          <select className="sn-input w-full" aria-label="Classe du bulletin"
            value={activeClassId} disabled={!classes.length}
            onChange={event => {
              setClassId(event.target.value); setPeriodId(""); resetStudent();
            }}>
            {!classes.length && <option value="">Aucune classe</option>}
            {classes.map(item => <option key={item.id} value={item.id}>
              {item.name}
            </option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Période</span>
          <select className="sn-input w-full" aria-label="Période du bulletin"
            value={activePeriodId} disabled={!periods.length}
            onChange={event => { setPeriodId(event.target.value); resetStudent(); }}>
            {!periods.length && <option value="">Aucune période</option>}
            {periods.map(period => <option key={period.id} value={period.id}>
              {period.name} {period.isLocked ? "· verrouillée" : ""}
            </option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="min-w-[230px] flex-1 space-y-1.5 text-sm font-semibold text-slate-800">
          <span>Élève</span>
          <select className="sn-input w-full" aria-label="Élève du bulletin"
            value={selectedStudent?.studentId ?? ""}
            disabled={!preview || preview.students.length === 0}
            onChange={event => setStudentId(event.target.value)}>
            <option value="">Choisir un élève…</option>
            {preview?.students.map(student => <option key={student.studentId}
              value={student.studentId}>
              {student.studentName} — {statusNames[student.state]}
            </option>)}
          </select>
        </label>
        <button type="button" className="sn-btn-ghost" disabled={!activeSchoolId}
          onClick={() => { resetStudent(); setRevision(value => value + 1); }}>
          ↻ Actualiser
        </button>
        <Link className="sn-btn-ghost"
          to={localDemo
            ? "/app/school/official-general-averages?schoolnet_c3c4_demo=1"
            : "/app/school/official-general-averages"}>
          Consulter les moyennes
        </Link>
      </div>

      {schoolsFor !== ownerKey && <p role="status" className="text-sm text-slate-600">
        Vérification des établissements autorisés…
      </p>}
      {schoolsError && <p role="alert" className="text-sm text-red-800">
        Impossible de vérifier vos établissements autorisés.
      </p>}
      {schoolsFor === ownerKey && !selectedSchool && !schoolsError &&
        <p role="status" className="text-sm text-slate-600">
          Aucun établissement autorisé.
        </p>}
      {configKey && gradeLoad?.key !== configKey &&
        <p role="status" className="text-sm text-slate-600">
          Chargement des années, classes et périodes…
        </p>}
      {gradeLoad?.key === configKey && gradeLoad.state === "error" &&
        <p role="alert" className="text-sm text-red-800">
          Configuration scolaire indisponible ou accès refusé.
        </p>}
      {currentConfig && (!activeClassId || !activePeriodId) &&
        <p role="status" className="text-sm text-amber-900">
          Configurez une classe et une période avant de consulter un bulletin.
        </p>}
      {scope && !currentRoster && <p role="status" className="text-sm text-slate-600">
        Vérification du programme et des élèves autorisés…
      </p>}
      {currentRoster?.state === "pending" && <p role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Activation des moyennes scolaires V2 en attente. Aucun bulletin réel
        n'est accessible pour l'instant.
      </p>}
      {currentRoster?.state === "error" && <p role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        Lecture du programme ou des résultats indisponible, ou accès refusé.
        Aucune donnée fictive de secours n'est utilisée.
      </p>}
      {curriculum && curriculum.status !== "approved" && <p role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Le programme des matières de cette classe et de cette période
        doit être approuvé avant toute prévisualisation.
      </p>}
      {currentRoster?.state === "ready" && curriculum?.status === "approved" &&
        currentRoster.preview?.state === "not_configured" &&
        <p role="status" className="text-sm text-amber-900">
          Aucune moyenne scolaire configurée pour ce contexte.
        </p>}
      {preview && cohortTotals && <section
        aria-label="Contrôle administratif des dossiers de la classe"
        className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-950">
            S4-D.3e · Suivi des bulletins de la classe
          </h3>
          <span className="text-xs font-bold text-indigo-800">
            Synthèse pédagogique · Non publié
          </span>
        </div>
        <div className="mt-3 grid gap-3 grid-cols-2 xl:grid-cols-4">
          {[
            ["Dossiers", cohortTotals.total, "text-slate-950"],
            ["Calculables", cohortTotals.ready, "text-emerald-800"],
            ["À compléter", cohortTotals.incomplete, "text-amber-900"],
            ["Non configurés", cohortTotals.notConfigured, "text-indigo-900"],
          ].map(([label, count, color]) => <div key={label}
            className="rounded-lg border border-white bg-white p-3">
            <p className="text-xs font-semibold text-slate-600">{label}</p>
            <p className={"mt-1 text-xl font-extrabold tabular-nums " + color}>
              {count}
            </p>
          </div>)}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Indicateurs issus de la projection générale autorisée. Une moyenne
          calculable ne vaut pas contrôle administratif définitif :
          aucune validation ni publication n'est activée.
        </p>
      </section>}

      {preview && preview.students.length === 0 &&
        <p role="status" className="text-sm text-slate-600">
          Aucun élève présent dans cette classe.
        </p>}
      {preview && preview.students.length > 0 && !selectedStudent &&
        <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          {preview.studentCount} élève(s) dans ce périmètre. Sélectionnez
          un élève pour consulter son bulletin privé.
        </p>}

      {selectedStudent && viewer && scope && curriculum &&
        preview && <SchoolAuthorizedStudentReportCard
          scope={scope}
          studentId={selectedStudent.studentId}
          curriculum={curriculum}
          general={preview}
          viewer={viewer}
          localDemo={localDemo}
          revisionKey={scopeKey}
          schoolName={selectedSchool?.name ?? ""}
          schoolYearName={activeYear?.name ?? ""}
          className={activeClass?.name ?? ""}
          periodName={activePeriod?.name ?? ""}
        />}
    </>}
  </section>;
}
