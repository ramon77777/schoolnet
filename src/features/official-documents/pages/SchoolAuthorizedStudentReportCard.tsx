import { useEffect, useState } from "react";
import type {
  GeneralScope, OfficialCurriculum, OfficialGeneralPreview,
} from "../../schools/lib/schoolOfficialGeneralAveragesModel";
import {
  isReportCardRpcPending, readAuthorizedStudentReportCard,
  type ReportCardViewer,
} from "../lib/schoolAuthorizedReportCardApi";
import type {
  AuthorizedReportCardPreview,
} from "../lib/schoolAuthorizedReportCardModel";
import SchoolAuthorizedReportCardLayout from "./SchoolAuthorizedReportCardLayout";

type Props = {
  scope: GeneralScope;
  studentId: string;
  curriculum: OfficialCurriculum;
  general: OfficialGeneralPreview;
  viewer: ReportCardViewer;
  localDemo: boolean;
  revisionKey: string;
  schoolName: string;
  schoolYearName: string;
  className: string;
  periodName: string;
};
type LoadState = "loading" | "ready" | "pending" | "error";
type Display = {
  key: string; state: LoadState; report: AuthorizedReportCardPreview | null;
};
const grade=(n: number | null): string =>
  n===null ? "—" : n.toLocaleString("fr-FR",{
    minimumFractionDigits:2,maximumFractionDigits:2,
  })+" / 20";
const states={
  ready:"Calculable", incomplete:"À compléter", not_configured:"Non configurée",
};

export default function SchoolAuthorizedStudentReportCard({
  scope,studentId,curriculum,general,viewer,localDemo,revisionKey,
  schoolName,schoolYearName,className,periodName,
}:Props) {
  const [result,setResult]=useState<Display|null>(null);
  const key=[
    viewer.id,revisionKey,scope.schoolId,scope.schoolYearId,
    scope.classId,scope.periodId,studentId,localDemo?"fake":"server",
  ].join("|");

  useEffect(()=>{
    let cancelled=false;
    setResult({key,state:"loading",report:null});
    async function load(){
      try {
        const report=localDemo ? await import(
          "../lib/schoolAuthorizedReportCardDevFixture"
        ).then(module=>module.makeDevAuthorizedReportCardPreview(
          scope,studentId,curriculum,general,
        )) : await readAuthorizedStudentReportCard(
          scope,studentId,curriculum,general,viewer,
        );
        if(!cancelled)setResult({key,state:"ready",report});
      } catch(error) {
        if(!cancelled)setResult({
          key,state: !localDemo && isReportCardRpcPending(error) ? "pending" : "error",
          report:null,
        });
      }
    }
    void load();
    return()=>{cancelled=true;};
  },[key,scope,curriculum,general,studentId,viewer,localDemo]);

  // Even during effect cleanup / context changes, never display a stale card.
  const state=result?.key===key ? result.state : "loading";
  const report=result?.key===key && state==="ready" ? result.report : null;
  return <section className="mt-5 space-y-3 border-t border-indigo-100 pt-5"
    aria-label="Bulletin V2, matières autorisées de l'élève">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">
          SCHOOLNET V2 · S4-D.3b
        </p>
        <h4 className="mt-1 text-base font-extrabold text-slate-950">
          Détail des matières pour le bulletin
        </h4>
      </div>
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-900">
        {localDemo ? "Données 100 % fictives" : "Lecture serveur · Non publié"}
      </span>
    </div>
    {state==="loading" && <p role="status"
      className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
      Chargement du détail des matières…
    </p>}
    {state==="pending" && <p role="status"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Activation SQL du bulletin V2 en attente. Aucune matière réelle ne peut
      être affichée avant validation et installation de la RPC sécurisée.
    </p>}
    {state==="error" && <p role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      Prévisualisation des matières indisponible ou accès scolaire refusé.
      Aucune donnée de secours n'est inventée.
    </p>}
    {report && <>
      <div className="overflow-x-auto rounded-xl border border-indigo-100">
        <table className="min-w-[590px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Matière</th>
              <th scope="col" className="px-4 py-3 text-center">Coefficient</th>
              <th scope="col" className="px-4 py-3 text-center">Évaluations</th>
              <th scope="col" className="px-4 py-3">État</th>
              <th scope="col" className="px-4 py-3 text-right">Moyenne / 20</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.subjects.map(subject=><tr key={subject.subjectId}>
              <th scope="row" className="px-4 py-3 font-semibold text-slate-900">
                {subject.subjectName}
              </th>
              <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                {subject.coefficient ?? "—"}
              </td>
              <td className="px-4 py-3 text-center tabular-nums text-slate-700">
                {subject.publishedAssessments} / {subject.includedAssessments}
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                {states[subject.state]}
              </td>
              <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">
                {grade(subject.averageOn20)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-indigo-50 p-4">
        <div>
          <p className="text-xs font-bold text-indigo-800">Matières calculables</p>
          <p className="mt-1 font-extrabold tabular-nums text-indigo-950">
            {report.readySubjects} / {report.expectedSubjects}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-indigo-800">
            Moyenne générale · Non publiée
          </p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-indigo-950">
            {grade(report.averageOn20)}
          </p>
        </div>
      </div>
      {report.state!=="ready" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Dossier incomplet ou non configuré : la moyenne générale reste absente.
        Les résultats par matière calculables peuvent être visibles, sans
        transformer les évaluations non publiées en zéros.
      </p>}
      <div className="border-t border-indigo-100 pt-5">
        <h5 className="mb-3 text-sm font-extrabold text-indigo-900">
          S4-D.3c · Prévisualisation complète du bulletin
        </h5>
        <SchoolAuthorizedReportCardLayout
          report={report}
          schoolName={schoolName}
          schoolYearName={schoolYearName}
          className={className}
          periodName={periodName}
          fictional={localDemo}
        />
      </div>
      <p className="text-xs leading-5 text-slate-600">
        {localDemo
          ? "SPECIMEN FICTIF : ces moyennes par matière sont purement illustratives, jamais issues d'enseignants ou de Supabase."
          : "Résultats agrégés par le serveur dans le périmètre scolaire autorisé. Aucune note brute affichée."}
        {" "}Aucun bulletin officiel créé, publié, imprimé ou exporté.
      </p>
    </>}
  </section>;
}
