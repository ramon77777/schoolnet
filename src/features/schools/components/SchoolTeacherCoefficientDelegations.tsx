import {useEffect,useState} from "react";
import {useAuth} from "@/lib/auth/AuthProvider";
import {coefficientActivationPending,type SchoolTeacherCoefficientDelegations}
 from "@/features/teacher/lib/teacherCoefficientModel";
import {getSchoolTeacherCoefficientDelegations,saveSchoolTeacherCoefficientDelegation}
 from "@/features/teacher/lib/teacherCoefficientApi";
export default function SchoolTeacherCoefficientDelegations({schoolId}:{schoolId:string}){
 const {user,loading:authLoading}=useAuth();
 const allowed=!authLoading&&!!user?.id&&!user.isDemo&&user.role==="school_admin";
 const [revision,setRevision]=useState(0);
 const [data,setData]=useState<SchoolTeacherCoefficientDelegations|null>(null);
 const [forKey,setForKey]=useState("");
 const [error,setError]=useState<"pending"|"error"|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState<string|null>(null);
 const key=allowed?user.id+"|"+schoolId+"|"+revision:"";
 useEffect(()=>{
  if(!allowed||!schoolId||!key)return;
  let cancelled=false;
  void getSchoolTeacherCoefficientDelegations(schoolId).then(result=>{
   if(cancelled)return;
   setData(result);setForKey(key);setError(null);
  }).catch(err=>{
   if(cancelled)return;
   setData(null);setForKey(key);
   setError(coefficientActivationPending(err)?"pending":"error");
  });
  return()=>{cancelled=true;};
 },[allowed,schoolId,key]);
 const current=allowed&&forKey===key&&data?.schoolId===schoolId?data:null;
 async function change(assignmentId:string,enabled:boolean){
  if(busy||!current)return;
  const confirmed=window.confirm((enabled?"Accorder":"Retirer")+
   " la délégation du coefficient de matière pour cette affectation ?");
  if(!confirmed)return;
  setBusy(true);setNotice(null);
  try{
   await saveSchoolTeacherCoefficientDelegation({schoolId,assignmentId,enabled});
   setNotice(enabled?"Délégation accordée.":"Délégation retirée.");
   setRevision(n=>n+1);
  }catch(err){
   console.error("[B6.2] school delegation refused",err);
   setNotice("Opération refusée : vérifiez les habilitations de cet établissement.");
  }finally{setBusy(false);}
 }
 if(!allowed)return null;
 return <section className="sn-card space-y-4 p-5" aria-label="Délégations enseignants">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <h2 className="text-lg font-bold">Délégations des coefficients de matières</h2>
    <p className="mt-1 text-sm text-slate-600">
     Les enseignants gèrent leurs propres évaluations officielles.
     La modification d'un coefficient de matière requiert votre délégation explicite.
    </p>
   </div>
   <button type="button" className="sn-btn-ghost" disabled={busy}
    onClick={()=>setRevision(n=>n+1)}>↻ Actualiser</button>
  </div>
  {forKey!==key&&<p role="status" className="text-sm text-slate-600">
   Vérification des enseignants et de leurs autorisations…
  </p>}
  {forKey===key&&error==="pending"&&<p role="status"
   className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
   Activation SQL B.6.2 en attente. Aucune délégation ne peut être enregistrée.
  </p>}
  {forKey===key&&error==="error"&&<p role="alert" className="text-sm text-red-700">
   Impossible de vérifier les délégations. Opérations désactivées.
  </p>}
  {notice&&<p role="status" className="rounded-xl bg-slate-50 p-3 text-sm">{notice}</p>}
  {current&&!current.assignments.length&&<p className="text-sm text-slate-600">
   Aucune affectation scolaire active dans cet établissement.
  </p>}
  {current&&<div className="grid gap-3 md:grid-cols-2">
   {current.assignments.map(a=><div key={a.assignmentId}
    className="rounded-xl border border-slate-200 p-4 space-y-3">
    <strong className="text-sm text-slate-900">{a.teacherName}</strong>
    <p className="text-xs text-slate-600">
     {a.className} · {a.subjectName} · {a.schoolYearName}
    </p>
    <div className="flex flex-wrap items-center justify-between gap-2">
     <span className={"text-xs font-semibold "+(a.canEditSubjectCoefficient?
      "text-emerald-700":"text-slate-500")}>
      {a.canEditSubjectCoefficient?"Délégation active":"Aucune délégation"}
     </span>
     <button type="button"
      className={a.canEditSubjectCoefficient?"sn-btn-ghost":"sn-btn-primary"} disabled={busy}
      onClick={()=>void change(a.assignmentId,!a.canEditSubjectCoefficient)}>
      {a.canEditSubjectCoefficient?"Retirer l'autorisation":"Autoriser"}
     </button>
    </div>
   </div>)}
  </div>}
  <p className="text-xs text-slate-500">
   Les droits sont contrôlés sur le serveur. Leur retrait est immédiat,
   et chaque changement est journalisé.
  </p>
 </section>;
}
