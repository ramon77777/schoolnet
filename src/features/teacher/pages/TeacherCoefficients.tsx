import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {getTeacherOfficialAveragesCatalog}
 from "@/features/teacher/lib/teacherOfficialAveragesCatalogApi";
import type {TeacherOfficialAveragesCatalog}
 from "@/features/teacher/lib/teacherOfficialAveragesCatalogModel";
import {validCoefficient} from "@/features/schools/lib/schoolGradeConfigurationModel";
import {coefficientActivationPending,type TeacherCoefficientSettings}
 from "@/features/teacher/lib/teacherCoefficientModel";
import {getTeacherCoefficientSettings,saveTeacherAssessmentCoefficient,
 saveTeacherSubjectCoefficient} from "@/features/teacher/lib/teacherCoefficientApi";

type Status="idle"|"ready"|"pending"|"error";
type AssessmentDraft={coefficient:string;include:boolean};
const inputClass="sn-input w-full min-w-0";
function pick(value:string,ids:string[]):string{
 return ids.includes(value)?value:ids[0]??"";
}
export default function TeacherCoefficients(){
 const {user,loading:authLoading}=useAuth();
 const allowed=!authLoading&&!!user?.id&&user.role==="teacher"&&!user.isDemo;
 const uid=allowed?user?.id??"":"";
 const [catalog,setCatalog]=useState<TeacherOfficialAveragesCatalog|null>(null);
 const [catalogFor,setCatalogFor]=useState("");
 const [catalogStatus,setCatalogStatus]=useState<Status>("idle");
 const [settings,setSettings]=useState<TeacherCoefficientSettings|null>(null);
 const [settingsFor,setSettingsFor]=useState("");
 const [settingsStatus,setSettingsStatus]=useState<Status>("idle");
 const [revision,setRevision]=useState(0);
 const [schoolId,setSchoolId]=useState("");
 const [yearId,setYearId]=useState("");
 const [assignmentId,setAssignmentId]=useState("");
 const [periodId,setPeriodId]=useState("");
 const [subjects,setSubjects]=useState<Record<string,string>>({});
 const [assessments,setAssessments]=useState<Record<string,AssessmentDraft>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [failure,setFailure]=useState("");
 useEffect(()=>{
  if(!allowed||!uid)return;
  let cancelled=false;
  void getTeacherOfficialAveragesCatalog().then(result=>{
   if(cancelled)return;
   setCatalog(result);setCatalogFor(uid);setCatalogStatus("ready");
  }).catch(err=>{
   if(cancelled)return;
   setCatalog(null);setCatalogFor(uid);
   setCatalogStatus(coefficientActivationPending(err)?"pending":"error");
  });
  return()=>{cancelled=true;};
 },[allowed,uid]);
 const currentCatalog=allowed&&catalogFor===uid&&catalogStatus==="ready"?catalog:null;
 const schools=Array.from(new Map((currentCatalog?.assignments??[])
  .map(a=>[a.schoolId,{id:a.schoolId,name:a.schoolName}])).values())
  .sort((a,b)=>a.name.localeCompare(b.name,"fr"));
 const selectedSchoolId=pick(schoolId,schools.map(s=>s.id));
 const key=uid&&selectedSchoolId?uid+"|"+selectedSchoolId+"|"+revision:"";
 useEffect(()=>{
  if(!allowed||!selectedSchoolId||!key)return;
  let cancelled=false;
  void getTeacherCoefficientSettings(selectedSchoolId).then(result=>{
   if(cancelled)return;
   setSettings(result);setSettingsFor(key);setSettingsStatus("ready");
  }).catch(err=>{
   if(cancelled)return;
   setSettings(null);setSettingsFor(key);
   setSettingsStatus(coefficientActivationPending(err)?"pending":"error");
  });
  return()=>{cancelled=true;};
 },[allowed,selectedSchoolId,key]);
 const current=allowed&&settingsFor===key&&settingsStatus==="ready"&&
  settings?.schoolId===selectedSchoolId?settings:null;
 const years=Array.from(new Map((current?.assignments??[]).map(a=>
  [a.schoolYearId,{id:a.schoolYearId,name:a.schoolYearName}])).values())
  .sort((a,b)=>b.name.localeCompare(a.name,"fr"));
 const selectedYearId=pick(yearId,years.map(y=>y.id));
 const assignments=(current?.assignments??[]).filter(a=>a.schoolYearId===selectedYearId);
 const selectedAssignmentId=pick(assignmentId,assignments.map(a=>a.assignmentId));
 const assigned=assignments.find(a=>a.assignmentId===selectedAssignmentId)??null;
 const periods=(current?.periods??[]).filter(p=>p.schoolYearId===selectedYearId)
  .sort((a,b)=>a.startsOn.localeCompare(b.startsOn));
 const selectedPeriodId=pick(periodId,periods.map(p=>p.id));
 const period=periods.find(p=>p.id===selectedPeriodId)??null;
 const locked=busy||!period||period.isLocked;
 const subjectKey=selectedPeriodId+"|"+selectedAssignmentId;
 const setting=current?.subjectSettings.find(s=>s.periodId===selectedPeriodId&&
  s.classId===assigned?.classId&&s.subjectId===assigned?.subjectId);
 const evals=(current?.assessments??[]).filter(a=>a.classId===assigned?.classId&&
  a.subjectId===assigned?.subjectId&&a.schoolYearId===selectedYearId);
 async function run(action:()=>Promise<void>,success:string){
  if(!current||!period||busy||period.isLocked)return;
  setBusy(true);setMessage("");setFailure("");
  try{
   await action();
   setSubjects({});setAssessments({});
   setMessage(success);
   setRevision(v=>v+1);
  }catch(err){
   console.error("[B6.2] coefficient update refused",err);
   setFailure("Enregistrement refusé. Vérifiez votre affectation, la délégation et la période.");
  }finally{setBusy(false);}
 }
 function saveSubject(){
  if(!assigned||!period||locked||!assigned.canEditSubjectCoefficient)return;
  const coefficient=Number(subjects[subjectKey]??setting?.coefficient??1);
  if(!validCoefficient(coefficient)){setFailure("Coefficient invalide : de 0,25 à 20 avec deux décimales au plus.");return;}
  void run(()=>saveTeacherSubjectCoefficient({schoolId:selectedSchoolId,
   periodId:period.id,classId:assigned.classId,subjectId:assigned.subjectId,
   coefficient}),"Coefficient de matière enregistré.");
 }
 function saveAssessment(id:string){
  if(!period||locked)return;
  const row=evals.find(a=>a.assessmentId===id);
  if(!row)return;
  const draft=assessments[period.id+"|"+id];
  const coefficient=Number(draft?.coefficient??row.coefficient??1);
  const include=draft?.include??(row.periodId===period.id?row.includeInAverage:false);
  if(!validCoefficient(coefficient)){setFailure("Coefficient invalide : de 0,25 à 20 avec deux décimales au plus.");return;}
  void run(()=>saveTeacherAssessmentCoefficient({schoolId:selectedSchoolId,
   periodId:period.id,assessmentId:id,coefficient,includeInAverage:include}),
   "Paramètres de l'évaluation enregistrés.");
 }
 return <main className="space-y-5 pb-10">
  <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">SCHOOLNET V2 · B.6.2 · ENSEIGNANT</p>
     <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Mes coefficients</h1>
     <p className="mt-2 max-w-3xl text-sm text-slate-600">
      Paramétrez vos évaluations officielles. Pour modifier le coefficient d'une matière,
      vous devez recevoir l'autorisation de votre établissement.
     </p>
    </div>
    <Link to="/app/teacher/averages" className="sn-btn-ghost">← Mes moyennes</Link>
   </div>
  </header>
  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
   Les coefficients influencent les prévisualisations futures. Aucune note n'est modifiée ou publiée ici.
   Chaque modification est conservée dans un historique.
  </div>
  {!authLoading&&!allowed&&<p role="alert" className="sn-card p-5 text-red-700">
   Réservé aux enseignants réels habilités.
  </p>}
  {allowed&&catalogFor!==uid&&<p role="status" className="sn-card p-5">Vérification de vos affectations…</p>}
  {allowed&&catalogFor===uid&&catalogStatus==="error"&&<p role="alert" className="sn-card p-5 text-red-700">
   Affectations indisponibles ou droits révoqués.
  </p>}
  {allowed&&currentCatalog&&schools.length===0&&<p role="status" className="sn-card p-5">
   Aucune affectation scolaire officielle active. Contactez votre établissement.
  </p>}
  {allowed&&currentCatalog&&schools.length>0&&<section className="sn-card p-5 space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <h2 className="font-bold text-slate-900">Configuration autorisée</h2>
    <button type="button" className="sn-btn-ghost" disabled={busy} onClick={()=>setRevision(n=>n+1)}>
     ↻ Actualiser
    </button>
   </div>
   <label className="block max-w-xl space-y-1 text-sm font-semibold">Établissement
    <select className={inputClass} value={selectedSchoolId} disabled={busy}
     onChange={e=>{setSchoolId(e.target.value);setYearId("");setAssignmentId("");setPeriodId("");}}>
     {schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>
   {settingsFor!==key&&<p role="status">Vérification des droits et coefficients…</p>}
   {settingsFor===key&&settingsStatus==="pending"&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-amber-900">
    Activation SQL B.6.2 en attente. Les paramètres sont indisponibles jusqu'à une installation autorisée.
   </p>}
   {settingsFor===key&&settingsStatus==="error"&&<p role="alert" className="text-red-700">
    Configuration indisponible ou accès refusé. Aucune modification n'a été effectuée.
   </p>}
   {current&&<>
    <div className="grid gap-3 md:grid-cols-3">
     <label className="space-y-1 text-sm font-semibold">Année scolaire
      <select className={inputClass} value={selectedYearId} disabled={busy}
       onChange={e=>{setYearId(e.target.value);setAssignmentId("");setPeriodId("");}}>
       {years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}
      </select>
     </label>
     <label className="space-y-1 text-sm font-semibold">Classe · matière
      <select className={inputClass} value={selectedAssignmentId} disabled={busy}
       onChange={e=>{setAssignmentId(e.target.value);setPeriodId("");}}>
       {assignments.map(a=><option key={a.assignmentId} value={a.assignmentId}>
        {a.className} · {a.subjectName}
       </option>)}
      </select>
     </label>
     <label className="space-y-1 text-sm font-semibold">Période
      <select className={inputClass} value={selectedPeriodId} disabled={busy}
       onChange={e=>setPeriodId(e.target.value)}>
       {!periods.length&&<option value="">Aucune période</option>}
       {periods.map(p=><option key={p.id} value={p.id}>
        {p.name}{p.isLocked?" (verrouillée)":""}
       </option>)}
      </select>
     </label>
    </div>
    {period?.isLocked&&<p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
     Période verrouillée : aucune modification n'est autorisée.
    </p>}
    {message&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {failure&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{failure}</p>}
    {assigned&&<section className="rounded-xl border border-slate-200 p-4 space-y-3">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold">Coefficient de la matière</h3>
      <span className={"text-xs font-semibold "+(assigned.canEditSubjectCoefficient?
       "text-emerald-800":"text-slate-500")}>
       {assigned.canEditSubjectCoefficient?"Délégation accordée":"Lecture seule — délégation requise"}
      </span>
     </div>
     <p className="text-sm text-slate-600">{assigned.className} · {assigned.subjectName}</p>
     <div className="flex max-w-lg flex-wrap items-end gap-2">
      <label className="min-w-32 flex-1 space-y-1 text-sm">Coefficient
       <input type="number" min="0.25" max="20" step="0.01" className={inputClass}
        value={subjects[subjectKey]??String(setting?.coefficient??1)}
        disabled={locked||!assigned.canEditSubjectCoefficient}
        onChange={e=>setSubjects(v=>({...v,[subjectKey]:e.target.value}))}/>
      </label>
      <button type="button" className="sn-btn-primary"
       disabled={locked||!assigned.canEditSubjectCoefficient} onClick={saveSubject}>
       Enregistrer
      </button>
     </div>
    </section>}
    {assigned&&<section className="space-y-3">
     <h3 className="font-bold">Mes évaluations officielles</h3>
     <p className="text-sm text-slate-600">
      Vous pouvez régler vos propres évaluations. Les modifications de pondération
      d'évaluations déjà publiées sont journalisées, sans changer leurs notes.
     </p>
     {!evals.length&&<p className="text-sm text-slate-600">Aucune évaluation officielle pour cette matière.</p>}
     <div className="grid gap-3 lg:grid-cols-2">
      {evals.map(a=>{
       const k=selectedPeriodId+"|"+a.assessmentId;
       const draft=assessments[k];
       const coefficient=draft?.coefficient??String(a.coefficient??1);
       const include=draft?.include??(a.periodId===selectedPeriodId?a.includeInAverage:false);
       return <div key={a.assessmentId} className="rounded-xl border border-slate-200 p-4 space-y-3">
        <strong>{a.title}</strong>
        {a.periodId&&a.periodId!==selectedPeriodId&&<p className="text-xs text-amber-700">
         Évaluation déjà associée à une autre période : déplacement soumis au contrôle du serveur.
        </p>}
        <div className="flex flex-wrap items-end gap-3">
         <label className="min-w-32 flex-1 space-y-1 text-sm">Coefficient
          <input type="number" min="0.25" max="20" step="0.01" className={inputClass}
           value={coefficient} disabled={locked}
           onChange={e=>setAssessments(v=>({...v,[k]:{coefficient:e.target.value,include}}))}/>
         </label>
         <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={include} disabled={locked}
           onChange={e=>setAssessments(v=>({...v,[k]:{coefficient,include:e.target.checked}}))}/>
          Inclure dans la moyenne
         </label>
        </div>
        <button type="button" className="sn-btn-primary" disabled={locked}
         onClick={()=>saveAssessment(a.assessmentId)}>Enregistrer l'évaluation</button>
       </div>;
      })}
     </div>
    </section>}
    <section className="space-y-3">
     <h3 className="font-bold">Historique de mes modifications</h3>
     <p className="text-xs text-slate-600">Les 30 dernières opérations effectuées par votre compte.</p>
     {!current.history.length&&<p className="text-sm text-slate-600">Aucune modification enregistrée.</p>}
     <div className="space-y-2">
      {current.history.map((h,i)=><div key={h.at+"|"+i}
       className="rounded-xl bg-slate-50 p-3 text-sm">
       <strong>{h.action==="teacher_subject_coefficient"?"Matière":
         h.action==="teacher_assessment_coefficient"?"Évaluation":"Délégation"}</strong>
       <span className="ml-2 text-xs text-slate-500">{new Date(h.at).toLocaleString("fr-FR")}</span>
       <p className="mt-1 break-words text-xs text-slate-600">
        Avant : {h.previousValue===null?"Non défini":JSON.stringify(h.previousValue)}
        {" · "}Après : {JSON.stringify(h.currentValue)}
       </p>
      </div>)}
     </div>
    </section>
   </>}
  </section>}
 </main>;
}
