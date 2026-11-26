import { useMemo, useState } from "react";
import {
  listFictionalReportCardStudents,
  makeFictionalReportCard,
} from "../lib/schoolFictionalReportCardPreview";

const roster=listFictionalReportCardStudents();
const nf=new Intl.NumberFormat("fr-FR",{
  minimumFractionDigits:2,maximumFractionDigits:2,
});
const formatGrade=(value:number|null):string=>
  value===null ? "—" : nf.format(value)+" / 20";
const statusLabels={
  ready:"Calculable",
  incomplete:"À compléter",
  not_configured:"À configurer",
} as const;

/** Mounted ONLY behind DEV + real school_admin role + fake URL flag in Hub. */
export default function SchoolFictionalReportCardDemo() {
  const [studentId,setStudentId]=useState(roster[0]?.studentId??"");
  const report=useMemo(()=>makeFictionalReportCard(studentId),[studentId]);

  return <section className="sn-card space-y-5 p-5 md:p-7"
    aria-labelledby="school-report-preview-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-indigo-700">
          SCHOOLNET V2 · S4-D.3a · Maquette fonctionnelle
        </p>
        <h2 id="school-report-preview-title"
          className="mt-2 text-xl font-extrabold text-slate-950">
          Prévisualisation d'un bulletin scolaire
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Choisissez un élève fictif pour consulter la présentation du bulletin V2.
          Les notes de matières sont simulées pour valider la mise en page,
          jamais lues depuis Supabase.
        </p>
      </div>
      <span className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-extrabold text-violet-900">
        DONNÉES FICTIVES · NON PUBLIÉ
      </span>
    </div>

    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label htmlFor="s4d3a-student"
        className="block text-sm font-bold text-slate-800">
        Élève à prévisualiser
      </label>
      <select id="s4d3a-student" className="sn-input mt-2 w-full md:max-w-md"
        value={studentId} onChange={event=>setStudentId(event.target.value)}>
        {roster.map(student=><option key={student.studentId}
          value={student.studentId}>
          {student.studentName} — {statusLabels[student.state]}
        </option>)}
      </select>
      <p className="mt-2 text-xs text-slate-600">
        Établissement fictif A · 6e B · 1er trimestre · 2026–2027.
        Aucun élève d'un établissement réel n'est consulté.
      </p>
    </div>

    {!report && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      Bulletin fictif indisponible pour cette sélection.
    </p>}

    {report && <article role="document"
      aria-label={"Maquette de bulletin non publié — "+report.student.studentName}
      className="mx-auto w-full max-w-[850px] overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-800 p-5 text-white md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-indigo-200">
              SCHOOLNET · V2
            </p>
            <h3 className="mt-2 text-2xl font-extrabold tracking-tight">
              Bulletin scolaire
            </h3>
            <p className="mt-1 text-sm text-indigo-100">
              {report.schoolName} · {report.periodName}
            </p>
          </div>
          <span className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-extrabold tracking-wide">
            SPÉCIMEN FICTIF
          </span>
        </div>
      </div>

      <div className="space-y-6 p-5 md:p-7">
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ["Élève",report.student.studentName],
            ["Classe",report.className],
            ["Année scolaire",report.yearName],
            ["Période",report.periodName],
          ].map(([key,value])=><div key={key}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{key}</dt>
            <dd className="mt-1 text-sm font-extrabold text-slate-950">{value}</dd>
          </div>)}
        </dl>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-base font-extrabold text-slate-950">Résultats par matière</h4>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-900">
              Valeurs fictives illustratives
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[520px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Matière</th>
                  <th scope="col" className="px-4 py-3 text-center">Coef.</th>
                  <th scope="col" className="px-4 py-3 text-right">Moyenne fictive / 20</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.subjects.map(subject=><tr key={subject.subjectId}>
                  <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                    {subject.subjectName}
                  </th>
                  <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                    {subject.coefficient}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                    {formatGrade(subject.simulatedAverageOn20)}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              État du dossier
            </p>
            <p className="mt-2 font-extrabold text-slate-900">
              {statusLabels[report.student.state]}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {report.student.readySubjects} / {report.student.expectedSubjects} matières calculables
            </p>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">
              Moyenne générale · non publiée
            </p>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-indigo-950">
              {formatGrade(report.generalAverageOn20)}
            </p>
          </div>
        </div>

        {report.generalAverageOn20===null && <p role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Résultats incomplets ou matières non configurées : aucune moyenne générale
          n'est calculée et aucune note manquante n'est remplacée par zéro.
        </p>}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Rang","Non disponible"],
            ["Absences","Non disponible"],
            ["Appréciation","Non renseignée"],
          ].map(([key,value])=><div key={key}
            className="rounded-lg border border-dashed border-slate-300 p-3">
            <p className="text-xs font-bold text-slate-600">{key}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
          </div>)}
        </div>

        <div className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-600">
          <p className="font-extrabold text-violet-900">
            SPÉCIMEN — DONNÉES 100 % FICTIVES — DOCUMENT NON VALABLE
          </p>
          <p className="mt-1">
            Les moyennes par matière sont fabriquées uniquement pour illustrer
            cette maquette. Elles ne représentent pas des évaluations ni des notes
            d'enseignants. Seule la moyenne générale fictive provient de la
            prévisualisation pédagogique fictive existante.
          </p>
          <p className="mt-1">
            Aucun bulletin réel créé, publié, imprimé ou exporté depuis cet écran.
          </p>
        </div>
      </div>
    </article>}
  </section>;
}
