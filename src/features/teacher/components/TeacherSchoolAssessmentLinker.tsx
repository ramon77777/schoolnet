import {useEffect,useState} from "react";
import {areSchoolAssignmentsReadOnly} from "@/features/schools/lib/schoolAssignmentWritePolicy";
import {
 getSchoolAssessmentTeacherContext,
 isSchoolAssessmentActivationPending,
 linkSchoolAssessment,
 unlinkSchoolAssessment,
} from "@/features/schools/lib/schoolAssessmentBridgeApi";
import type {SchoolAssessmentTeacherContext} from "@/features/schools/lib/schoolAssessmentBridgeModel";

/** L'opt-in d'une evaluation est volontaire ; aucun acces eleve V1 ne change. */
export default function TeacherSchoolAssessmentLinker({
 assessmentId,userId,
}:{assessmentId:string;userId:string;}){
 const [data,setData]=useState<SchoolAssessmentTeacherContext|null>(null);
 const [loadedKey,setLoadedKey]=useState("");
 const [revision,setRevision]=useState(0);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const key=`${userId}|${assessmentId}`;
 const readOnly=areSchoolAssignmentsReadOnly();
 const loading=Boolean(userId)&&loadedKey!==key;
 const context=loadedKey===key?data:null;

 useEffect(()=>{
  if(!userId||!assessmentId)return;
  let cancelled=false;
  void getSchoolAssessmentTeacherContext(assessmentId)
   .then(result=>{
    if(cancelled)return;
    setData(result);setLoadedKey(key);setError(null);
   }).catch(cause=>{
    if(cancelled)return;
    setData(null);setLoadedKey(key);
    setError(isSchoolAssessmentActivationPending(cause)
     ?"Le raccordement officiel S4-B.3-A n'est pas encore activé sur Supabase."
     :"Impossible de vérifier le rattachement officiel ou droits insuffisants.");
   });
  return ()=>{cancelled=true;};
 },[assessmentId,userId,key,revision]);

 const refresh=()=>{setLoadedKey("");setRevision(n=>n+1);};
 async function changeLink(){
  if(!context||!context.eligible||busy||readOnly)return;
  const remove=context.linked;
  if(remove&&!window.confirm("Retirer cette évaluation de la classe officielle ? L'évaluation et ses éventuelles données V1 restent conservées."))return;
  setBusy(true);setError(null);setNotice(null);
  try{
   if(remove)await unlinkSchoolAssessment(assessmentId);
   else await linkSchoolAssessment(assessmentId);
   setNotice(remove
    ?"Rattachement officiel retiré. L'évaluation V1 est conservée."
    :"Évaluation rattachée. Seul son résumé publié sera visible aux élèves en S4-B.3-A.");
   refresh();
  }catch{
   setError("Opération refusée. Vérifiez la propriété du cours, l'affectation officielle et l'absence d'inscriptions V1.");
  }finally{setBusy(false)}
 }

 return (
  <section className="sn-card p-5 space-y-3" aria-label="Rattachement de l'évaluation officielle">
   <div>
    <p className="text-xs uppercase font-bold tracking-widest text-indigo-700">
     SCHOOLNET V2 · S4-B.3-A
    </p>
    <h2 className="mt-1 text-lg font-bold text-gray-900">
     Évaluation de mon établissement
    </h2>
    <p className="mt-1 text-sm text-gray-600 leading-6">
     Rattachez volontairement cette évaluation existante à votre cours officiel.
     Aucun élève n'est inscrit automatiquement. Cette première étape affiche
     seulement son intitulé et son échéance aux élèves autorisés :
     les remises et les notes officielles ne sont pas encore activées.
    </p>
   </div>
   {readOnly&&(
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
     Aperçu en lecture seule : tout rattachement est réservé au site SCHOOLNET officiel,
     après activation SQL et vérification des permissions.
    </p>
   )}
   {loading&&<p className="text-sm text-slate-600" role="status">Vérification des affectations…</p>}
   {error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
   {notice&&<p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
   {!loading&&context&&(
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
     <div>
      <p className="font-semibold text-slate-900">
       {context.eligible
        ?`${context.schoolName} · ${context.className} · ${context.subjectName}`
        :"Aucune affectation officielle active pour ce cours"}
      </p>
      <p className="mt-1 text-sm text-slate-600">
       {context.linked
        ?"Cette évaluation a été rattachée explicitement à la classe."
        :"Cette évaluation n'est pas encore rattachée à un établissement."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
       Statut V1 de l'évaluation : {context.status==="published"?"Publiée":context.status==="draft"?"Brouillon":"Clôturée"}
      </p>
     </div>
     <button className={context.linked?"sn-btn-ghost":"sn-btn-primary"} type="button"
       disabled={readOnly||busy||!context.eligible||(!context.linked&&context.status==="closed")}
       onClick={()=>void changeLink()}>
       {busy?"Traitement…":context.linked?"Retirer le lien":"Rattacher à la classe"}
     </button>
    </div>
   )}
  </section>
 );
}
