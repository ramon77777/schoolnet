import type { OfficialCurriculum } from "../../schools/lib/schoolOfficialGeneralAveragesModel";
import type { AuthorizedReportCardPreview } from "../lib/schoolAuthorizedReportCardModel";
import SchoolReportCardApprovalPreparationPanel from "./SchoolReportCardApprovalPreparationPanel";
import {
  makeReportCardAdministrativeReview,
  type ReportCardAcademicLabels,
} from "../lib/schoolReportCardAdministrativeReview";

type Props = {
  report: AuthorizedReportCardPreview;
  curriculum: OfficialCurriculum;
  labels: ReportCardAcademicLabels;
  fictional: boolean;
};
const stateNames = {
  pedagogically_complete: "Résultats pédagogiques complets",
  to_complete: "Vérifications nécessaires",
  not_configured: "Configuration à compléter",
} as const;
const checkNames = {
  verified: "Contrôlé",
  attention: "À vérifier",
  not_integrated: "Non intégré",
} as const;
const checkColors = {
  verified: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  attention: "bg-amber-50 text-amber-900 ring-amber-200",
  not_integrated: "bg-slate-100 text-slate-700 ring-slate-200",
} as const;
const findingNames = {
  incomplete: "À compléter",
  not_configured: "À configurer",
  unavailable: "Résultat indisponible",
} as const;

/** S4-D.3e: read-only controls. No validation/approval action is provided. */
export default function SchoolReportCardAdministrativePanel({
  report, curriculum, labels, fictional,
}: Props) {
  const review = makeReportCardAdministrativeReview(report, curriculum, labels);
  const complete = review.academicStatus === "pedagogically_complete";

  return <section className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-4 md:p-6"
    aria-labelledby="schoolnet-s4d3e-control-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-indigo-700">
          SCHOOLNET V2 · S4-D.3e
        </p>
        <h5 id="schoolnet-s4d3e-control-title"
          className="mt-1 text-lg font-extrabold text-slate-950">
          Contrôle administratif du bulletin
        </h5>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          Vérifications préalables en lecture seule, à partir du bulletin
          individuel déjà contrôlé. Aucun accord de publication n'est donné.
        </p>
      </div>
      <span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-extrabold ring-1 " +
        (complete ? checkColors.verified : checkColors.attention)}>
        {stateNames[review.academicStatus]}
      </span>
    </div>

    {fictional && <p role="status"
      className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-900">
      RECETTE LOCALE — DONNÉES 100 % FICTIVES, aucune validation réelle.
    </p>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Points du contrôle administratif">
      {review.checks.map(check => <article key={check.id}
        className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h6 className="text-sm font-bold text-slate-950">{check.label}</h6>
          <span className={"rounded-full px-2 py-1 text-xs font-bold ring-1 " +
            checkColors[check.status]}>
            {checkNames[check.status]}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-700">
          {check.explanation}
        </p>
      </article>)}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-50 p-4">
      <div>
        <p className="text-xs font-semibold text-indigo-800">Matières avec résultat disponible</p>
        <p className="mt-1 text-xl font-extrabold tabular-nums text-indigo-950">
          {review.completeSubjects} / {review.expectedSubjects}
        </p>
      </div>
      <p className="text-xs font-bold text-indigo-900">
        Contrôle pédagogique uniquement · Document non publié
      </p>
    </div>

    {review.findings.length > 0 && <div
      className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h6 className="text-sm font-extrabold text-amber-950">
        Points à traiter par matière ({review.findings.length})
      </h6>
      <ul className="mt-2 space-y-2 text-sm text-amber-950">
        {review.findings.map(finding => <li key={finding.subjectId}
          className="rounded-lg bg-white/80 p-3">
          <p className="font-bold">
            {finding.subjectName} · {findingNames[finding.status]}
          </p>
          <p className="mt-1 text-xs leading-5">{finding.explanation}</p>
        </li>)}
      </ul>
    </div>}

    {review.findings.length === 0 && complete &&
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        Les matières et les résultats disponibles sont complets dans ce périmètre.
        Ce constat ne vaut ni validation administrative ni autorisation de publication.
      </p>}

    {review.findings.length === 0 && !complete &&
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Un contrôle du contexte scolaire ou de la moyenne générale reste nécessaire.
        Aucun résultat manquant n'est transformé en zéro.
      </p>}

    <p role="status"
      className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-xs leading-5 text-slate-800">
      <strong>Publication désactivée.</strong>{" "}
      Rang, absences et appréciation ne sont pas encore alimentés par un flux autorisé.
      Les exigences officielles de publication et la validation par un responsable
      seront définies séparément. Aucun statut publié, aucune approbation, aucun
      export PDF et aucune écriture en base ne sont effectués.
    </p>

    <SchoolReportCardApprovalPreparationPanel
      review={review}
      fictional={fictional}
    />
  </section>;
}
