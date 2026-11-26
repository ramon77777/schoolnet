import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  OFFICIAL_EXPORT_CATALOG, OFFICIAL_EXPORT_CADENCE_CATALOG,
  planSchoolOfficialExport, type ExportActorRole, type ExportKind,
  type ExportCadence, type ExportFormat, type ExportState,
  type ExportPlanningContext, type ExportRequest,
} from "../lib/schoolOfficialExportPlanning";

type HubProps = { actor: ExportActorRole };

const ids = {
  schoolA: "00000000-0000-4000-8000-000000000100",
  schoolB: "00000000-0000-4000-8000-000000000101",
  year: "00000000-0000-4000-8000-000000000110",
  classA: "00000000-0000-4000-8000-000000000120",
  periodT1: "00000000-0000-4000-8000-000000000130",
  periodS1: "00000000-0000-4000-8000-000000000131",
  subjectMath: "00000000-0000-4000-8000-000000000150",
  subjectFr: "00000000-0000-4000-8000-000000000151",
} as const;

const reasonLabels: Record<string, string> = {
  INVALID_SCOPE: "Périmètre scolaire invalide ou incohérent.",
  INACTIVE_MEMBER: "Affiliation active non démontrée.",
  OTHER_SCHOOL: "Établissement hors de vos habilitations.",
  MISSING_PERIOD: "Période scolaire réelle non configurée.",
  ANNUAL_POLICY_PENDING: "Pondération annuelle non approuvée.",
  ANNUAL_PERIODS_INCOMPLETE: "Toutes les périodes annuelles ne sont pas complètes.",
  SUBJECT_REQUIRED: "Une matière précise doit être sélectionnée.",
  SUBJECT_NOT_APPLICABLE: "Le tableau général n'utilise pas de filtre matière.",
  SUBJECT_NOT_ASSIGNED: "Enseignant non affecté à cette matière et classe.",
  SPECIFIC_EXPORT_DELEGATION_REQUIRED:
    "Autorisation pédagogique spécifique requise pour accéder aux résultats des collègues.",
  V2_PROJECTION_PENDING: "Projection V2 sécurisée absente.",
  PUBLICATION_SNAPSHOT_REQUIRED: "Aucun résultat officiellement publié et figé.",
  MISMATCHED_USER_OR_ROLE: "Compte ou rôle différent de l'habilitation attendue.",
};

function makeFakeReview(
  actor: ExportActorRole,
  request: ExportRequest,
): ExportPlanningContext {
  return {
    viewerId: request.viewerId,
    role: actor,
    membershipActive: true,
    allowedSchoolIds: [ids.schoolA],
    teacherSubjectAssignments: [{
      schoolId: ids.schoolA,
      schoolYearId: ids.year,
      classId: ids.classA,
      subjectId: ids.subjectMath,
    }],
    summaryExportDelegations: [],
    periodConfigured: true,
    annualPolicyApproved: false,
    annualPeriodsComplete: false,
    v2ProjectionAvailable: true,
    publishedSnapshotId: null,
  };
}

const matrix = [
  { title: "Moyennes par matière", teacher: "Ses matières et classes affectées",
    school: "Toutes les matières de son établissement" },
  { title: "Tableau de classe — toutes matières",
    teacher: "Délégation pédagogique spécifique", school: "Autorisé dans son établissement" },
  { title: "Moyenne générale par classe",
    teacher: "Délégation pédagogique spécifique", school: "Autorisé dans son établissement" },
  { title: "Trimestre / semestre", teacher: "Périodes réellement configurées",
    school: "Périodes réellement configurées" },
  { title: "Année scolaire", teacher: "Poids annuels à approuver",
    school: "Poids annuels à approuver" },
  { title: "PDF / Excel (.xlsx)", teacher: "Relevés autorisés uniquement",
    school: "Relevés autorisés uniquement" },
];

export default function SchoolOfficialDocumentsHub({ actor }: HubProps) {
  const { user, loading } = useAuth();
  const allowed = Boolean(!loading && user?.id && !user.isDemo && user.role === actor);
  const demo = import.meta.env.DEV && typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("schoolnet_s4d_demo") === "1";

  const [kind, setKind] = useState<ExportKind>("subject_period");
  const [cadence, setCadence] = useState<ExportCadence>("trimester");
  const [state, setState] = useState<ExportState>("provisional");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [selectedSchool, setSelectedSchool] = useState<string>(ids.schoolA);
  const [selectedSubject, setSelectedSubject] = useState<string>(ids.subjectMath);

  const request = useMemo<ExportRequest>(() => ({
    viewerId: "LOCAL-FICTIONAL-REVIEWER",
    role: actor,
    scope: {
      schoolId: selectedSchool,
      schoolYearId: ids.year,
      classId: ids.classA,
      periodId: cadence === "annual" ? null :
        cadence === "semester" ? ids.periodS1 : ids.periodT1,
    },
    kind, cadence, state, format,
    subjectId: kind === "subject_period" ? selectedSubject : null,
  }), [actor, selectedSchool, cadence, kind, state, format, selectedSubject]);

  const preview = useMemo(() => demo && allowed
    ? planSchoolOfficialExport(request, makeFakeReview(actor, request))
    : null, [demo, allowed, request, actor]);

  return <main className="space-y-6 pb-12">
    <header className="sn-card overflow-hidden border border-indigo-100 bg-gradient-to-br from-white via-blue-50 to-indigo-100 p-5 md:p-8">
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-indigo-700">
        SCHOOLNET V2 · S4-D.1 · Documents scolaires sécurisés
      </p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
            Bulletins et exports des moyennes
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Préparons les bulletins officiels et les relevés PDF / Excel (.xlsx)
            sans mélanger les données historiques V1 et les résultats scolaires V2.
            Les consultations et exports réels nécessiteront une autorisation serveur.
          </p>
        </div>
        {actor === "school_admin" &&
          <Link className="sn-btn-ghost" to="/app/school/official-general-averages">
            Consulter les moyennes
          </Link>}
        {actor === "teacher" &&
          <Link className="sn-btn-ghost" to="/app/teacher/official-averages">
            Mes moyennes officielles
          </Link>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
          {actor === "teacher" ? "Enseignant" : "Administrateur d'établissement"}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
          Préparation isolée · Pas de publication
        </span>
      </div>
    </header>

    {!loading && !allowed && <p role="alert" className="sn-card p-5 text-red-800">
      Accès réservé au rôle scolaire autorisé, avec session réelle.
      Aucun document n'est accessible aux comptes de démonstration.
    </p>}

    {allowed && <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3" aria-label="Avancement de S4-D">
        {[
          { label: "Bulletins V2", text: "Nouveau flux isolé des bulletins historiques ; publication non active.", color: "bg-indigo-50" },
          { label: "Présences V2", text: "Données existantes à rattacher à l'école et à l'année avant synthèse.", color: "bg-sky-50" },
          { label: "Exports PDF et Excel", text: "Matrice des droits préparée ; téléchargement serveur à venir.", color: "bg-emerald-50" },
        ].map((item) => <article className="sn-card space-y-2 p-5" key={item.label}>
          <span className={"inline-block rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-800 " + item.color}>
            {item.label}
          </span>
          <p className="text-sm leading-6 text-slate-600">{item.text}</p>
        </article>)}
      </section>

      <section className="sn-card space-y-4 p-5 md:p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Règles d'accès aux exports</h2>
          <p className="mt-1 text-sm text-slate-600">
            Un droit de modification d'un coefficient ne donne pas le droit de consulter
            les notes ni les moyennes des collègues.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Relevé</th>
                <th className="px-4 py-3">Enseignant</th>
                <th className="px-4 py-3">Administrateur d'établissement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrix.map((line) => <tr key={line.title}>
                <th scope="row" className="px-4 py-3 font-semibold text-slate-800">{line.title}</th>
                <td className="px-4 py-3 text-slate-600">{line.teacher}</td>
                <td className="px-4 py-3 text-slate-600">{line.school}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Tous les relevés seront limités par établissement, année, classe et période ;
          les fichiers réels devront être produits depuis une projection autorisée et
          journalisés sans divulguer d'informations scolaires dans les logs.
        </p>
      </section>

      <section className="sn-card space-y-5 p-5 md:p-6" aria-labelledby="s4d-planning-title">
        <div>
          <h2 id="s4d-planning-title" className="text-lg font-bold text-slate-950">
            Préparer un relevé de moyennes
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Les formats PDF et Excel sont prévus. La génération réelle n'est pas
            encore activée ; nous vérifions d'abord la sécurité des droits.
          </p>
        </div>
        {demo && <div role="status"
          className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
          <strong>RECETTE LOCALE — CONFIGURATION 100 % FICTIVE.</strong>
          <p className="mt-1">Aucune information d'élève ni donnée Supabase réelle n'est téléchargée,
            consultée ou modifiée par cette page.</p>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Établissement</span>
            <select className="sn-input w-full" value={selectedSchool}
              disabled={!demo}
              onChange={(event) => setSelectedSchool(event.target.value)}>
              <option value={ids.schoolA}>Établissement fictif A</option>
              <option value={ids.schoolB}>Établissement fictif B (non habilité)</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Type de relevé</span>
            <select className="sn-input w-full" value={kind}
              disabled={!demo} onChange={(event) => setKind(event.target.value as ExportKind)}>
              {OFFICIAL_EXPORT_CATALOG.map((item) =>
                <option key={item.kind} value={item.kind}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Période</span>
            <select className="sn-input w-full" value={cadence}
              disabled={!demo} onChange={(event) => setCadence(event.target.value as ExportCadence)}>
              {OFFICIAL_EXPORT_CADENCE_CATALOG.map((item) =>
                <option key={item.cadence} value={item.cadence}>{item.label}</option>)}
            </select>
          </label>
          {kind === "subject_period" && <label className="space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Matière</span>
            <select className="sn-input w-full" value={selectedSubject}
              disabled={!demo} onChange={(event) => setSelectedSubject(event.target.value)}>
              <option value={ids.subjectMath}>Mathématiques (fictive)</option>
              <option value={ids.subjectFr}>Français (fictive)</option>
            </select>
          </label>}
          <label className="space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Statut du relevé</span>
            <select className="sn-input w-full" value={state}
              disabled={!demo} onChange={(event) => setState(event.target.value as ExportState)}>
              <option value="provisional">Provisoire — non publié</option>
              <option value="published">Officiel — publié</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-semibold text-slate-800">
            <span>Format</span>
            <select className="sn-input w-full" value={format}
              disabled={!demo} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              <option value="pdf">PDF imprimable</option>
              <option value="xlsx">Excel (.xlsx)</option>
            </select>
          </label>
        </div>
        {preview && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Diagnostic fictif des règles de préparation
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={"inline-flex rounded-full px-3 py-1 text-xs font-bold " +
              (preview.eligibleForServerReview ? "bg-emerald-100 text-emerald-900" :
                "bg-amber-100 text-amber-900")}>
              {preview.eligibleForServerReview
                ? "Critères de préparation satisfaits — contrôle serveur requis"
                : "Conditions non réunies"}
            </span>
            <span className="text-xs font-extrabold text-indigo-800">{preview.statusLabel}</span>
          </div>
          {preview.blockers.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {preview.blockers.map((reason) => <li key={reason}>
              {reasonLabels[reason] ?? "Contrôle d'accès non satisfait."}
            </li>)}
          </ul>}
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Même si les critères de simulation sont satisfaits, ce résultat n'est
            pas une autorisation d'export. Une RPC dédiée devra vérifier les droits
            et générer les données sans passage par les tables V1.
          </p>
        </div>}
        {!demo && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Exports scolaires V2 en préparation. Aucun relevé réel n'est accessible depuis
          cet espace tant que la projection sécurisée et les règles de publication ne
          sont pas installées et testées.
        </p>}
        <div className="flex flex-wrap gap-3">
          <button disabled type="button" className="sn-btn-primary cursor-not-allowed opacity-50"
            title="Export serveur sécurisé en cours de développement">
            Exporter PDF — bientôt
          </button>
          <button disabled type="button" className="sn-btn-ghost cursor-not-allowed opacity-50"
            title="Export serveur sécurisé en cours de développement">
            Exporter Excel (.xlsx) — bientôt
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Aucun fichier exporté à cette étape. Les relevés « provisoires »
          resteront distincts des documents scolaires « officiellement publiés ».
        </p>
      </section>

      <section className="sn-card space-y-3 p-5 md:p-6" aria-labelledby="s4d-workflow-title">
        <h2 id="s4d-workflow-title" className="text-lg font-bold text-slate-950">
          Parcours des bulletins et présences V2
        </h2>
        <ol className="grid gap-3 md:grid-cols-4">
          {[
            ["1", "Données pédagogiques", "Moyennes officielles et présences de la classe, sans réutiliser V1."],
            ["2", "Contrôle administratif", "Complétude, coefficients, appréciations et anomalies vérifiés."],
            ["3", "Publication contrôlée", "Document figé, horodaté, rattaché à son établissement."],
            ["4", "Consultation restreinte", "Accès Élève/Parent uniquement au document réellement publié."],
          ].map(([num, title, detail]) => <li key={num}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-extrabold text-indigo-800">
              {num}
            </span>
            <p className="text-sm font-bold text-slate-900">{title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
          </li>)}
        </ol>
        <p className="text-xs text-slate-500">
          Ces étapes décrivent le flux cible, elles ne signifient pas que les bulletins V2
          sont actuellement créés ou publiés. Les bulletins historiques restent inchangés.
        </p>
      </section>
    </div>}
  </main>;
}
