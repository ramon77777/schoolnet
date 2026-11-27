import type { AuthorizedReportCardPreview } from "../lib/schoolAuthorizedReportCardModel";

type Props = {
  report: AuthorizedReportCardPreview;
  schoolName: string;
  schoolYearName: string;
  className: string;
  periodName: string;
  fictional: boolean;
};

const stateNames = {
  ready: "Calculable",
  incomplete: "À compléter",
  not_configured: "Non configurée",
} as const;

const grade = (value: number | null): string =>
  value === null ? "—" : value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }) + " / 20";

const label = (value: string): string =>
  value.trim().length ? value : "Non renseigné";

/**
 * S4-D.3c — Pure presentation of a previously VERIFIED school-admin projection.
 * No query, grade calculation, publication, PDF or print side effect.
 * The caller must validate the server result before mounting this component.
 */
export default function SchoolAuthorizedReportCardLayout({
  report, schoolName, schoolYearName, className, periodName, fictional,
}: Props) {
  return <article role="document"
    aria-label={"Aperçu privé non publié du bulletin de " + report.studentName}
    className="mx-auto w-full max-w-[880px] overflow-hidden rounded-2xl border-2 border-indigo-200 bg-white shadow-sm">
    <header className="bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-800 p-5 text-white md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-indigo-200">
            SCHOOLNET V2 · Aperçu interne
          </p>
          <h5 className="mt-2 text-2xl font-extrabold tracking-tight">
            Bulletin scolaire
          </h5>
          <p className="mt-1 text-sm text-indigo-100">
            {label(schoolName)} · {label(periodName)}
          </p>
        </div>
        <span className="rounded-lg border border-white/40 bg-white/10 px-3 py-2 text-xs font-extrabold uppercase tracking-wide">
          {fictional ? "Spécimen fictif" : "Provisoire · non publié"}
        </span>
      </div>
    </header>

    <div className="space-y-6 p-4 md:p-7">
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          ["Élève", report.studentName],
          ["Établissement", label(schoolName)],
          ["Classe", label(className)],
          ["Année scolaire", label(schoolYearName)],
          ["Période", label(periodName)],
          ["État du dossier", stateNames[report.state]],
        ].map(([title, value]) => <div key={title}
          className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">
            {title}
          </dt>
          <dd className="mt-1 text-sm font-extrabold text-slate-950">
            {value}
          </dd>
        </div>)}
      </dl>

      <section aria-label="Matières du bulletin provisoire">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h6 className="text-base font-extrabold text-slate-950">
            Résultats par matière
          </h6>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-900">
            {fictional ? "Données 100 % fictives" : "Projection scolaire autorisée"}
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[570px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Matière</th>
                <th scope="col" className="px-4 py-3 text-center">Coef.</th>
                <th scope="col" className="px-4 py-3 text-center">Évaluations</th>
                <th scope="col" className="px-4 py-3">État</th>
                <th scope="col" className="px-4 py-3 text-right">Moyenne / 20</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.subjects.map(subject => <tr key={subject.subjectId}>
                <th scope="row" className="px-4 py-3 font-semibold text-slate-950">
                  {subject.subjectName}
                </th>
                <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                  {subject.coefficient ?? "—"}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                  {subject.publishedAssessments} / {subject.includedAssessments}
                </td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                  {stateNames[subject.state]}
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">
                  {grade(subject.averageOn20)}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          aria-label="Complétude des matières">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Matières calculables
          </p>
          <p className="mt-2 text-xl font-extrabold tabular-nums text-slate-950">
            {report.readySubjects} / {report.expectedSubjects}
          </p>
        </section>
        <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"
          aria-label="Moyenne générale non publiée">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">
            Moyenne générale · non publiée
          </p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-indigo-950">
            {grade(report.averageOn20)}
          </p>
        </section>
      </div>

      {report.state !== "ready" && <p role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Dossier incomplet ou non configuré : aucune moyenne générale affichée.
        Une note absente n'est jamais remplacée par zéro.
      </p>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Rang", "Non disponible"],
          ["Absences", "Non disponibles"],
          ["Appréciation", "Non renseignée"],
        ].map(([title, value]) => <div key={title}
          className="rounded-lg border border-dashed border-slate-300 p-3">
          <p className="text-xs font-bold text-slate-600">{title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
        </div>)}
      </div>

      <footer className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-700">
        <p className="font-extrabold uppercase tracking-wide text-red-800">
          {fictional ? "Spécimen fictif · " : ""}
          Aperçu privé · Document non valable · Non publié
        </p>
        <p className="mt-1">
          {fictional
            ? "Toutes les valeurs de cette recette sont fictives, sans notes d'enseignants."
            : "Affichage de résultats agrégés issus d'une réponse serveur contrôlée ; aucune note brute."}
          {" "}Aucun rang, aucune absence et aucune appréciation n'ont été inventés.
        </p>
        <p className="mt-1">
          Ce document n'est ni généré, ni imprimé, ni exporté, ni communiqué
          aux élèves et familles. Aucune moyenne n'est recalculée dans le navigateur.
        </p>
      </footer>
    </div>
  </article>;
}
