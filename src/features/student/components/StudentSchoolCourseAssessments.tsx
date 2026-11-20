import {useCallback,useEffect,useState} from "react";
import {getStudentSchoolCourseAssessments,isSchoolAssessmentActivationPending}
 from "@/features/schools/lib/schoolAssessmentBridgeApi";
import type {StudentOfficialAssessmentCatalog}
 from "@/features/schools/lib/schoolAssessmentBridgeModel";

/** Métadonnées uniquement ; jamais de lien de remise V1 sans garde SQL dédiée. */
export default function StudentSchoolCourseAssessments({
 courseId,userId,
}:{courseId:string;userId:string;}){
 const [data,setData]=useState<StudentOfficialAssessmentCatalog|null>(null);
 const [loadedFor,setLoadedFor]=useState("");
 const [error,setError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const key=`${userId}|${courseId}`;
 const loading=!!courseId&&loadedFor!==key;
 const active=loadedFor===key?data:null;
 const refresh=useCallback(()=>{setLoadedFor("");setRevision(n=>n+1);},[]);
 useEffect(()=>{
  if(!courseId||!userId)return;
  let cancelled=false;
  void getStudentSchoolCourseAssessments(courseId)
   .then(result=>{
    if(cancelled)return;setData(result);setLoadedFor(key);setError(null);
   }).catch(cause=>{
    if(cancelled)return;setData(null);setLoadedFor(key);
    setError(isSchoolAssessmentActivationPending(cause)
     ?"Le catalogue des évaluations officielles sera disponible après activation S4-B.3-A."
     :"Les évaluations officielles sont indisponibles ou vos droits ont changé.");
   });
  return ()=>{cancelled=true;};
 },[courseId,userId,key,revision]);

 const kind=(type:string)=>type==="quiz"?"Quiz":type==="assignment"?"Devoir":"Examen";
 return (
  <section className="sn-card p-5 space-y-4" aria-label="Évaluations officielles du cours">
   <div className="flex flex-wrap justify-between items-start gap-3">
    <div>
     <p className="text-xs uppercase font-bold tracking-widest text-indigo-700">
      SCHOOLNET V2 · S4-B.3-A
     </p>
     <h2 className="mt-1 text-lg font-bold text-gray-900">
      Évaluations de ma classe {active?`(${active.assessments.length})`:""}
     </h2>
     <p className="mt-1 text-sm text-slate-600">
      Seules les évaluations publiées et explicitement rattachées
      à ce cours officiel sont présentées.
     </p>
    </div>
    <button className="sn-btn-ghost" type="button" onClick={refresh} disabled={loading}>
     ↻ Actualiser
    </button>
   </div>
   {loading&&<p className="text-sm text-slate-600" role="status">Recherche des évaluations autorisées…</p>}
   {!loading&&error&&<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">{error}</p>}
   {!loading&&!error&&active?.assessments.length===0&&(
    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
     Aucune évaluation officielle publiée pour ce cours.
    </p>
   )}
   {!loading&&!error&&active&&active.assessments.length>0&&(
    <div className="grid gap-3 md:grid-cols-2">
     {active.assessments.map(a=>(
      <article key={a.assessmentId} className="rounded-xl border border-slate-200 p-4 space-y-2">
       <div className="flex justify-between items-start gap-3">
        <h3 className="font-semibold text-slate-900">{a.title}</h3>
        <span className="sn-badge sn-badge-blue">{kind(a.type)}</span>
       </div>
       <p className="text-xs text-slate-500">
        Échéance : {a.dueAt?new Date(a.dueAt).toLocaleString("fr-FR"):"Non fixée"}
       </p>
       <p className="text-xs text-amber-800">
        Consultation du calendrier seulement : remise, correction et résultats
        officiels seront activés dans la prochaine étape de S4-B.3.
       </p>
      </article>
     ))}
    </div>
   )}
  </section>
 );
}
