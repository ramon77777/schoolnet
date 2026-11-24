import {useMemo} from "react";
import {useNavigate} from "react-router-dom";
import type {StudentOfficialDashboard} from "@/features/student/lib/studentOfficialDashboardModel";

type Props={
 data:StudentOfficialDashboard;
 loading:boolean;
 error:string|null;
 onRefresh:()=>void;
};
/** Vue scolaire V2 : une seule lecture partagee avec le tableau de bord global. */
export default function StudentOfficialDashboardSummary({data,loading,error,onRefresh}:Props){
 const navigate=useNavigate();
 const published=useMemo(()=>data.assessments.filter(a=>a.status==="published").length,[data]);
 return <section className="sn-card p-5 sm:p-6 space-y-5" aria-label="Suivi scolaire officiel">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">SCHOOLNET V2 · Cours officiels</p>
    <h2 className="text-xl font-bold text-slate-900 mt-1">Mes cours et résultats officiels</h2>
    <p className="text-sm text-gray-500 mt-1">
     Cours de votre classe et copies publiées, distincts des cours libres.
    </p>
   </div>
   <button className="sn-btn-ghost" type="button" onClick={onRefresh}>↻ Actualiser</button>
  </div>
  {loading&&<p role="status" className="text-sm text-gray-600">Chargement des cours officiels…</p>}
  {!loading&&error&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
  {!loading&&!error&&<>
   <div className="flex flex-wrap gap-2 text-xs font-medium">
    <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-700">
     {data.courses.length} cours officiel(s)
    </span>
    <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
     {published} résultat(s) publié(s)
    </span>
   </div>
   {data.courses.length===0&&<p className="text-sm text-gray-500">Aucun cours officiel accessible pour le moment.</p>}
   <div className="grid gap-3 md:grid-cols-2">
    {data.courses.map(course=>{
     const items=data.assessments.filter(a=>a.courseId===course.courseId);
     const completed=items.filter(a=>["submitted","graded","published"].includes(a.status)).length;
     return <div key={course.courseId} className="rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="font-semibold text-slate-900">{course.title}</p>
      <p className="text-xs text-gray-600">{course.schoolName} · {course.className} · {course.subjectName}</p>
      <p className="text-sm">{completed} / {items.length} évaluation(s) terminée(s)</p>
      <button className="sn-btn-primary" type="button"
       onClick={()=>navigate("/app/student/school-courses/"+course.courseId)}>Ouvrir le cours officiel</button>
     </div>;
    })}
   </div>
   {data.assessments.length>0&&<div className="space-y-2">
    <h3 className="font-semibold text-slate-900">Évaluations officielles</h3>
    {data.assessments.map(a=><button key={a.assessmentId} type="button"
      className="w-full flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left hover:bg-blue-50/50"
      onClick={()=>navigate("/app/student/school-courses/"+a.courseId+"/assessments/"+a.assessmentId+"/take")}>
      <span className="text-sm font-medium">{a.title}</span>
      <span className="text-xs text-gray-600">{a.status==="published"
       ?"Résultat publié : "+a.score+" / "+a.maxScore
       :a.status==="graded"?"Copie corrigée, résultat non publié"
       :a.status==="submitted"?"Copie remise"
       :a.status==="in_progress"?"En cours":"À faire"}</span>
     </button>)}
   </div>}
   <p className="text-xs text-gray-500">Les notes non publiées restent masquées. Les résultats ne constituent pas une moyenne trimestrielle.</p>
  </>}
 </section>;
}
