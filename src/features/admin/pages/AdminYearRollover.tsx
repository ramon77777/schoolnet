// SCHOOLNET - Lot 5.D : preparation, decisions et cloture annuelle.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  enrollmentErrorMessage,
  getAdminEnrollmentCatalog,
  getAdminEnrollments,
  type AdminEnrollment,
  type EnrollmentCatalog,
} from "@/features/enrollments/lib/adminEnrollmentsApi";
import {
  finalizeSchoolYearRollover,
  getRolloverRecords,
  rolloverErrorMessage,
  saveRolloverDecision,
  type RolloverDecision,
  type RolloverDecisionType,
  type RolloverRun,
} from "@/features/enrollments/lib/schoolYearRolloverApi";
import { areSchoolYearRolloverWritesBlocked } from "@/features/enrollments/lib/schoolYearRolloverWritePolicy";
import { inspectSchoolYearRolloverSnapshot } from "@/features/enrollments/lib/schoolYearRolloverPreflight";

const INITIAL_CATALOG: EnrollmentCatalog = { years: [], classes: [], students: [] };

const DECISIONS: Record<RolloverDecisionType, string> = {
  pending: "En attente",
  re_enroll: "Réinscription",
  repeat: "Redoublement",
  leave: "Départ / non-réinscription",
};

type DecisionDraft = {
  decision: RolloverDecisionType;
  targetClassId: string;
  note: string;
};

function rowDraft(saved?: RolloverDecision): DecisionDraft {
  return {
    decision: saved?.decision ?? "pending",
    targetClassId: saved?.target_class_id ?? "",
    note: saved?.note ?? "",
  };
}

function resolveTargetClass(
  yearId: string,
  yearName: string,
  schoolYearId: string | null,
  schoolYearName: string,
): boolean {
  return schoolYearId === yearId || (schoolYearId === null && schoolYearName === yearName);
}

function getDecisionClassLabel(
  id: string | null,
  classes: EnrollmentCatalog["classes"],
): string {
  return classes.find((item) => item.id === id)?.name ?? "Aucune";
}

export default function AdminYearRollover() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const readOnlyRuntime = areSchoolYearRolloverWritesBlocked();
  const [catalog, setCatalog] = useState<EnrollmentCatalog>(INITIAL_CATALOG);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [targetYearId, setTargetYearId] = useState("");
  const [decisions, setDecisions] = useState<RolloverDecision[]>([]);
  const [run, setRun] = useState<RolloverRun | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({});
  const [migrationPending, setMigrationPending] = useState(false);
  const [loadingBase, setLoadingBase] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [revision, setRevision] = useState(0);
  const [planRevision, setPlanRevision] = useState(0);

  const currentYear = useMemo(
    () => catalog.years.find((year) => year.is_current) ?? null,
    [catalog.years],
  );
  const futureYears = useMemo(
    () => catalog.years
      .filter((year) => currentYear && !year.is_current &&
        year.starts_on > currentYear.starts_on)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
    [catalog.years, currentYear],
  );
  const targetYear = futureYears.find((year) => year.id === targetYearId) ?? null;
  const targetClasses = useMemo(
    () => catalog.classes.filter((item) => targetYear &&
      item.school_id === null && item.learning_context !== "school" &&
      resolveTargetClass(targetYear.id, targetYear.name,
        item.school_year_id, item.school_year)),
    [catalog.classes, targetYear],
  );
  const activeSource = useMemo(
    () => enrollments.filter((row) =>
      row.school_year_id === currentYear?.id && row.status === "active"),
    [enrollments, currentYear?.id],
  );
  const existingTarget = useMemo(
    () => enrollments.filter((row) => row.school_year_id === targetYearId),
    [enrollments, targetYearId],
  );
  const decisionsByStudent = useMemo(
    () => new Map(decisions.map((row) => [row.student_id, row])),
    [decisions],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || isDemo) {
      setLoadingBase(false);
      setCatalog(INITIAL_CATALOG);
      setEnrollments([]);
      return;
    }
    let cancelled = false;
    setLoadingBase(true);
    setError(null);
    void (async () => {
      try {
        const [nextCatalog, nextRows] = await Promise.all([
          getAdminEnrollmentCatalog(),
          getAdminEnrollments(),
        ]);
        if (cancelled) return;
        setCatalog(nextCatalog);
        setEnrollments(nextRows);
        const source = nextCatalog.years.find((item) => item.is_current);
        const possible = nextCatalog.years
          .filter((item) => source && !item.is_current &&
            item.starts_on > source.starts_on)
          .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
        setTargetYearId((previous) =>
          possible.some((item) => item.id === previous) ? previous : possible[0]?.id ?? "");
      } catch (cause) {
        if (!cancelled) setError(enrollmentErrorMessage(cause));
      } finally {
        if (!cancelled) setLoadingBase(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, authLoading, isDemo, revision]);

  useEffect(() => {
    setConfirmName("");
    setSuccess(null);
  }, [targetYearId]);

  useEffect(() => {
    if (!currentYear?.id || !targetYearId || isDemo || loadingBase) {
      setDecisions([]);
      setDrafts({});
      setRun(null);
      setMigrationPending(false);
      return;
    }
    let cancelled = false;
    setLoadingPlan(true);
    setError(null);
    void (async () => {
      try {
        const result = await getRolloverRecords(currentYear.id, targetYearId);
        if (cancelled) return;
        setDecisions(result.decisions);
        setRun(result.run);
        setMigrationPending(result.migrationPending);
        const nextDrafts: Record<string, DecisionDraft> = {};
        for (const row of activeSource) {
          nextDrafts[row.student_id] = rowDraft(
            result.decisions.find((item) => item.student_id === row.student_id),
          );
        }
        setDrafts(nextDrafts);
      } catch (cause) {
        if (!cancelled) setError(rolloverErrorMessage(cause));
      } finally {
        if (!cancelled) setLoadingPlan(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentYear?.id, targetYearId, activeSource, isDemo, loadingBase, planRevision]);

  const planned = activeSource.filter((row) => {
    const decision = decisionsByStudent.get(row.student_id);
    return decision && decision.decision !== "pending";
  }).length;
  const targetAnomalies = existingTarget.filter((row) =>
    row.status === "active" || row.status === "completed");
  const hasPending = planned !== activeSource.length;
  // S2-A/S3-C affectations par etablissement : jamais reutiliser la RPC
  // historique de passage d'annee pour ces classes ou leurs inscriptions.
  const officialClasses = catalog.classes.filter((item) =>
    item.school_id !== null || item.learning_context === "school");
  const nonLegacySource = activeSource.filter((row) => {
    const sourceClass = catalog.classes.find((item) => item.id === row.class_id);
    return !sourceClass || sourceClass.school_id !== null ||
      sourceClass.learning_context === "school";
  });
  // B : diagnostic visible uniquement. L'autorisation finale restera exclusivement SQL.
  const preflight = inspectSchoolYearRolloverSnapshot({
    years: catalog.years,
    classes: catalog.classes,
    enrollments,
    sourceYearId: currentYear?.id ?? null,
    targetYearId: targetYear?.id ?? null,
  });
  const additionalPreflightIssues = preflight.issues.filter((issue) =>
    ["CURRENT_YEAR_NOT_UNIQUE", "SOURCE_DUPLICATE_STUDENT",
     "SOURCE_CLASS_WRONG_YEAR"].includes(issue.code),
  );
  const warnings = [
    ...additionalPreflightIssues.map((issue) => issue.message),
    ...(activeSource.length === 0 ? ["Aucune inscription active pour l'année courante."] : []),
    ...(targetClasses.length === 0 ? ["L'année cible ne possède pas de classe."] : []),
    ...(targetAnomalies.length > 0
      ? [String(targetAnomalies.length) +
         " dossier(s) déjà actifs ou terminés dans l'année cible : régularisation obligatoire avant la bascule."]
      : []),
    ...(nonLegacySource.length > 0
      ? [String(nonLegacySource.length) +
         " dossier(s) d'origine non legacy : ne pas traiter avec la RPC globale 5.D."] : []),
    ...(officialClasses.length > 0
      ? ["Des classes officielles d'etablissement existent : la bascule globale attend " +
         "un workflow compatible S3-C, sans toucher aux affectations locales."] : []),
    ...(hasPending ? ["Toutes les décisions doivent être enregistrées avant la clôture."] : []),
    ...(!targetYear ? ["Sélectionnez une année cible valide."] : []),
  ];
  const busy = loadingBase || loadingPlan || Boolean(savingStudentId) || finalizing;
  const canFinalize = !busy && !isDemo && !readOnlyRuntime && !migrationPending && !run &&
    Boolean(currentYear && targetYear) && preflight.issues.length === 0 && warnings.length === 0 &&
    confirmName.trim() === targetYear?.name;

  function editDraft(studentId: string, change: Partial<DecisionDraft>) {
    setDrafts((previous) => {
      const old = previous[studentId] ?? rowDraft();
      const decision = change.decision ?? old.decision;
      const next = { ...old, ...change, decision };
      if (decision === "leave" || decision === "pending") next.targetClassId = "";
      return { ...previous, [studentId]: next };
    });
    setError(null);
  }

  async function submitDecision(studentId: string) {
    if (!currentYear || !targetYear || isDemo || readOnlyRuntime || migrationPending || busy || run) return;
    const draft = drafts[studentId] ?? rowDraft();
    if ((draft.decision === "re_enroll" || draft.decision === "repeat") &&
        !targetClasses.some((item) => item.id === draft.targetClassId)) {
      setError("Choisissez une classe appartenant à l'année scolaire cible.");
      return;
    }
    try {
      setSavingStudentId(studentId);
      setSuccess(null);
      setError(null);
      await saveRolloverDecision({
        sourceYearId: currentYear.id,
        targetYearId: targetYear.id,
        studentId,
        decision: draft.decision,
        targetClassId: draft.targetClassId || null,
        note: draft.note,
      });
      setSuccess("Décision enregistrée. Aucun dossier ni année scolaire n'a été modifié.");
      setPlanRevision((value) => value + 1);
    } catch (cause) {
      setError(rolloverErrorMessage(cause));
    } finally {
      setSavingStudentId(null);
    }
  }

  async function submitRollover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentYear || !targetYear || !canFinalize) return;
    const message = "Confirmer la clôture de " + currentYear.name + " et l'activation de " +
      targetYear.name + " ?\nCette opération crée ou active les dossiers annuels retenus " +
      "et conserve les archives. Elle doit être validée par l'administration.";
    if (!window.confirm(message)) return;
    try {
      setFinalizing(true);
      setError(null);
      setSuccess(null);
      const result = await finalizeSchoolYearRollover(
        currentYear.id, targetYear.id, confirmName.trim(),
      );
      setSuccess(result.already_finalized
        ? "Ce passage d'année avait déjà été finalisé, sans aucune nouvelle écriture."
        : "Passage d'année confirmé : " + String(result.re_enrolled + result.repeated) +
          " réinscription(s), " + String(result.departed) + " départ(s).");
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(rolloverErrorMessage(cause));
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <main className="space-y-6 pb-10">
      <header className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-white via-blue-50/70 to-indigo-50 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white">
              📆
            </span>
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                Vie administrative · Lot 5.D
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
                Réinscriptions et passage d'année
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Préparez les décisions élève par élève, vérifiez les dossiers et
                confirmez le changement d'année uniquement lorsque tout est prêt.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/admin/enrollments" className="sn-btn-ghost">← Inscriptions</Link>
            <Link to="/app/admin/school-years" className="sn-btn-ghost">Années scolaires</Link>
            <button type="button" className="sn-btn-ghost" disabled={busy || isDemo}
              onClick={() => setRevision((value) => value + 1)}>↻ Actualiser</button>
          </div>
        </div>
      </header>

      {isDemo && <p role="alert" className="sn-card border border-amber-200 bg-amber-50 p-4 text-amber-800">
        Le mode démonstration ne permet pas de préparer les réinscriptions réelles.
      </p>}
      {readOnlyRuntime && !isDemo && (
        <section role="status" className="sn-card border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
          <h2 className="font-bold">Lot 5D-A — preparation en lecture seule</h2>
          <p className="mt-1">Aucune decision ni bascule annuelle n'est autorisee
            depuis localhost ou une Preview. Le domaine officiel est egalement bloque
            tant que l'activation explicite et les controles serveur ne sont pas valides.</p>
          <p className="mt-2">Les classes et affectations propres aux etablissements
            (S2-A a S3-C) ne doivent pas etre traitees par le passage d'annee legacy.</p>
        </section>
      )}
      {migrationPending && !isDemo && (
        <section role="status" className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-bold">Activation Supabase en attente</h2>
          <p className="mt-1">L'interface est disponible en lecture seule. La migration du Lot 5.D
            doit être autorisée et appliquée individuellement avant de pouvoir enregistrer
            les décisions ou changer l'année scolaire.</p>
        </section>
      )}
      {error && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{success}</p>}

      <section className="sn-card p-5 md:p-6" aria-label="Choix des années">
        <h2 className="text-lg font-bold text-slate-950">1. Choisir l'année de destination</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Année courante</p>
            <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 font-semibold text-slate-800">
              {currentYear?.name ?? (loadingBase ? "Chargement…" : "Aucune année courante")}
            </p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Année suivante</span>
            <select aria-label="Année scolaire cible" className="sn-input mt-2 w-full"
              value={targetYearId} disabled={busy || futureYears.length === 0}
              onChange={(event) => setTargetYearId(event.target.value)}>
              <option value="">Choisir une année</option>
              {futureYears.map((year) => (
                <option key={year.id} value={year.id}>{year.name}</option>
              ))}
            </select>
          </label>
        </div>
        {!loadingBase && futureYears.length === 0 && !isDemo && (
          <p className="mt-3 text-sm text-amber-800">
            Créez d'abord une année postérieure dans « Années scolaires ».
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicateurs du passage d'année">
        {[
          ["Apprenants actifs", activeSource.length],
          ["Décisions enregistrées", planned],
          ["Classes disponibles", targetClasses.length],
          ["Dossiers cibles existants", existingTarget.length],
        ].map(([label, value]) => (
          <div key={label} className="sn-card p-4">
            <div className="text-2xl font-extrabold text-blue-700">{value}</div>
            <div className="mt-1 text-xs font-semibold text-slate-600">{label}</div>
          </div>
        ))}
      </section>

      {targetYear && <section className="sn-card p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-950">2. Contrôles préalables</h2>
        <div role="status" className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Lot 5D-B — diagnostic préparatoire local, sans écriture</p>
          <p className="mt-1">
            Dossiers actifs source : {preflight.sourceActive} · Dossiers cible existants :
            {" "}{preflight.targetExisting} · Dossiers actifs/terminés dans la cible :
            {" "}{preflight.targetActiveOrCompleted}.
          </p>
          <p className="mt-1">
            Les contrôles complets des droits, des affectations d'établissement S3-C,
            des conflits et de la transaction restent à réaliser côté serveur.
            Ces indicateurs n'autorisent aucune bascule.
          </p>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Les dossiers historiques restent inchangés pendant la préparation.
          La validation finale refait ces contrôles côté Supabase.
        </p>
        {warnings.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                ⚠ {warning}
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            ✓ Les contrôles de prévisualisation sont conformes. Vérification finale requise.
          </p>
        )}
      </section>}

      <section className="sn-card overflow-hidden">
        <div className="border-b border-slate-100 p-5 md:p-6">
          <h2 className="text-lg font-bold text-slate-950">3. Décider pour chaque apprenant</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choisissez une classe cible pour une réinscription ou un redoublement.
            Un départ ne crée pas de dossier dans l'année suivante.
          </p>
        </div>
        {loadingBase || loadingPlan ? (
          <p className="p-6 text-sm text-slate-500">Chargement des dossiers et décisions…</p>
        ) : activeSource.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Aucun apprenant actif dans l'année source.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeSource.map((row) => {
              const draft = drafts[row.student_id] ?? rowDraft();
              const saved = decisionsByStudent.get(row.student_id);
              const plannedClass = targetClasses.find((item) => item.id === draft.targetClassId);
              const targetRecord = existingTarget.find((item) => item.student_id === row.student_id);
              const studentBusy = busy || isDemo || readOnlyRuntime || migrationPending || Boolean(run);
              return (
                <article key={row.enrollment_id} className="space-y-4 p-5 md:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900">{row.student_name || "Apprenant"}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.class_name} · {row.enrollment_number || "Sans numéro"}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {saved ? DECISIONS[saved.decision] : "Décision non enregistrée"}
                    </span>
                  </div>
                  {targetRecord && (
                    <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
                      Dossier cible existant : {targetRecord.enrollment_number || "Sans numéro"} ·
                      {targetRecord.status} · {targetRecord.class_name}.
                      La bascule vérifiera sa cohérence avant toute réactivation.
                    </p>
                  )}
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-700">Décision *</span>
                      <select className="sn-input w-full" value={draft.decision}
                        disabled={studentBusy}
                        onChange={(event) => editDraft(row.student_id, {
                          decision: event.target.value as RolloverDecisionType,
                        })}>
                        {Object.entries(DECISIONS).map(([value, label]) => (
                          <option value={value} key={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-700">Classe cible</span>
                      <select className="sn-input w-full" value={draft.targetClassId}
                        disabled={studentBusy ||
                          (draft.decision !== "re_enroll" && draft.decision !== "repeat")}
                        onChange={(event) => editDraft(row.student_id, { targetClassId: event.target.value })}>
                        <option value="">Sélectionner la classe</option>
                        {targetClasses.map((item) => (
                          <option value={item.id} key={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-slate-700">Observation (facultatif)</span>
                      <input className="sn-input w-full" maxLength={1000}
                        value={draft.note} disabled={studentBusy}
                        placeholder="Décision, motif, vérification…"
                        onChange={(event) => editDraft(row.student_id, { note: event.target.value })} />
                    </label>
                  </div>
                  {saved && (
                    <p className="text-xs text-slate-500">
                      Enregistré : {DECISIONS[saved.decision]} · classe :
                      {" "}{getDecisionClassLabel(saved.target_class_id, targetClasses)}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">
                      {draft.decision === "repeat" && "Le niveau de la classe sera contrôlé par Supabase."}
                      {draft.decision === "leave" && "Aucun nouveau dossier ne sera créé."}
                      {plannedClass && draft.decision === "re_enroll" && "Classe choisie : " + plannedClass.name}
                    </span>
                    <button type="button" className="sn-btn-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0" disabled={studentBusy}
                      onClick={() => void submitDecision(row.student_id)}>
                      {savingStudentId === row.student_id ? "Enregistrement…" : "Enregistrer la décision"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <form className="sn-card space-y-4 p-5 md:p-6" onSubmit={(event) => void submitRollover(event)}>
        <div>
          <h2 className="text-lg font-bold text-slate-950">4. Confirmer le passage d'année</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Après confirmation, l'année source est clôturée et les dossiers des élèves
            réinscrits sont activés dans l'année cible. Les bulletins, notes et anciens dossiers
            sont conservés. Cette opération doit être effectuée une seule fois.
          </p>
        </div>
        {run && (
          <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            Ce passage d'année est déjà finalisé : {run.re_enrolled} réinscriptions,
            {run.repeated} redoublements et {run.departed} départs.
          </p>
        )}
        <label className="block max-w-xl">
          <span className="mb-1 block text-sm font-semibold text-slate-700">
            Saisissez exactement « {targetYear?.name || "année cible"} » pour confirmer
          </span>
          <input className="sn-input w-full" value={confirmName} autoComplete="off"
            disabled={busy || isDemo || readOnlyRuntime || migrationPending || Boolean(run) || !targetYear}
            onChange={(event) => setConfirmName(event.target.value)}
            placeholder={targetYear?.name || "Nom de l'année scolaire"} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="sn-btn-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0" disabled={!canFinalize}>
            {finalizing ? "Clôture en cours…" : "Valider et activer l'année suivante"}
          </button>
          <p className="text-xs text-slate-500">
            {readOnlyRuntime
              ? "Lot 5D-A : ecritures desactivees, aucune migration n'est autorisee."
              : migrationPending
                ? "Activation SQL 5.D nécessaire avant cette opération."
                : "Contrôles serveur et historique obligatoires."}
          </p>
        </div>
      </form>
    </main>
  );
}
