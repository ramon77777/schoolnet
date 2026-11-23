import {useCallback,useEffect,useMemo,useState} from "react";
import {useNavigate,useParams} from "react-router-dom";
import SafeRichText from "@/components/editor/SafeRichText";
import {useAuth} from "@/lib/auth/AuthProvider";
import {getStudentOfficialAssessmentPreview} from "@/features/student/lib/studentSchoolAssessmentPreviewApi";
import type {StudentOfficialAssessmentPreview} from "@/features/student/lib/studentSchoolAssessmentPreviewModel";
import {
 requestOfficialAttempt,getOfficialAttemptError,
} from "@/features/student/lib/studentSchoolAssessmentAttemptApi";
import {
 buildOfficialAnswerPayload,isOfficialOnlineMode,remainingAttemptSeconds,
 restoreOfficialAnswers,
 type OfficialAttemptAction,type OfficialAttemptState,
} from "@/features/student/lib/studentSchoolAssessmentAttemptModel";

function dateLabel(value:string|null):string{
 return value?new Date(value).toLocaleString("fr-FR"):"Aucune échéance";
}
function durationLabel(seconds:number|null):string{
 if(seconds===null)return "Pas de limite de durée enregistrée";
 return Math.floor(seconds/60)+" min "+String(seconds%60).padStart(2,"0")+" s";
}
function statusLabel(status:OfficialAttemptState["status"]):string{
 if(status==="not_started")return "Non commencée";
 if(status==="in_progress")return "Brouillon en cours";
 if(status==="submitted")return "Copie remise";
 if(status==="graded")return "Copie corrigée";
 return "Copie publiée";
}

/** Aucune insertion directe dans les tables V1, aucune correction visible. */
export default function StudentSchoolAssessmentTake(){
 const {courseId,assessmentId}=useParams<{courseId:string;assessmentId:string}>();
 const {user,loading:authLoading}=useAuth();
 const navigate=useNavigate();
 const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="student";
 const key=[user?.id??"",courseId??"",assessmentId??""].join("|");
 const [loadedKey,setLoadedKey]=useState("");
 const [preview,setPreview]=useState<StudentOfficialAssessmentPreview|null>(null);
 const [attempt,setAttempt]=useState<OfficialAttemptState|null>(null);
 const [answers,setAnswers]=useState<Record<string,string>>({});
 const [freeform,setFreeform]=useState("");
 const [dirty,setDirty]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const [busy,setBusy]=useState<OfficialAttemptAction|null>(null);
 const [refreshNumber,setRefreshNumber]=useState(0);
 const [receivedAt,setReceivedAt]=useState(Date.now());
 const [tick,setTick]=useState(Date.now());
 const eligible=allowed&&!!courseId&&!!assessmentId;
 const loading=authLoading||(eligible&&loadedKey!==key);
 const current=eligible&&loadedKey===key?preview:null;
 const state=eligible&&loadedKey===key?attempt:null;
 const finished=state!==null&&["submitted","graded","published"].includes(state.status);
 const online=current?isOfficialOnlineMode(current.submissionMode,current.examContentMode):false;
 const seconds=state?remainingAttemptSeconds(state,receivedAt,tick):null;
 const expired=seconds!==null?seconds<=0:
   !!current?.dueAt&&Date.now()>=Date.parse(current.dueAt);
 const canEdit=!!current&&!!state&&online&&state.status==="in_progress"&&!expired&&!busy;
 const payload=useMemo(()=>buildOfficialAnswerPayload(current?.questions??[],answers),[current,answers]);
 const hasResponse=payload.length>0||freeform.trim().length>0;
 const backTo="/app/student/school-courses/"+(courseId??"");

 useEffect(()=>{
  if(!eligible||!courseId||!assessmentId)return;
  let cancelled=false;
  void Promise.all([
   getStudentOfficialAssessmentPreview(courseId,assessmentId),
   requestOfficialAttempt(courseId,assessmentId,"read"),
  ]).then(([v,s])=>{
   if(cancelled)return;
   setPreview(v);setAttempt(s);setAnswers(restoreOfficialAnswers(v.questions,s));
   setFreeform(s.freeformAnswer??"");setDirty(false);setReceivedAt(Date.now());
   setError(null);setNotice(null);setLoadedKey(key);
  }).catch(cause=>{
   if(cancelled)return;
   setError(getOfficialAttemptError(cause));setPreview(null);setAttempt(null);
   setDirty(false);setLoadedKey(key);
  });
  return ()=>{cancelled=true;};
 },[eligible,courseId,assessmentId,key,refreshNumber]);

 useEffect(()=>{
  const id=window.setInterval(()=>setTick(Date.now()),1000);
  return ()=>window.clearInterval(id);
 },[]);
 useEffect(()=>{
  if(!dirty||finished)return;
  const onLeave=(e:BeforeUnloadEvent)=>{
   e.preventDefault();e.returnValue="";
  };
  window.addEventListener("beforeunload",onLeave);
  return ()=>window.removeEventListener("beforeunload",onLeave);
 },[dirty,finished]);

 const goBack=useCallback(()=>{
  if(dirty&&!window.confirm("Des réponses n'ont pas été enregistrées. Quitter ?"))return;
  navigate(backTo);
 },[dirty,navigate,backTo]);

 async function act(action:OfficialAttemptAction){
  if(!courseId||!assessmentId||!allowed||busy||!state||!current)return;
  if((action==="save"||action==="submit")&&!canEdit)return;
  if(action==="start"&&(state.status!=="not_started"||expired||!online))return;
  if(action==="submit"){
   if(!hasResponse){setError("Répondez à au moins une question avant de remettre.");return;}
   if(!window.confirm("Remettre définitivement cette évaluation ? Après confirmation, les réponses ne seront plus modifiables."))return;
  }
  setBusy(action);setError(null);setNotice(null);
  try{
   const result=await requestOfficialAttempt(courseId,assessmentId,action,
    action==="save"||action==="submit"?payload:[],
    action==="save"||action==="submit"?(current.type==="quiz"?null:freeform):null);
   setAttempt(result);setReceivedAt(Date.now());setTick(Date.now());
   setAnswers(restoreOfficialAnswers(current.questions,result));
   setFreeform(result.freeformAnswer??"");setDirty(false);
   setNotice(action==="start"?"Évaluation commencée. Le temps est désormais compté par le serveur.":
    action==="save"?"Brouillon enregistré sur le serveur.":
    action==="submit"?"Copie remise. Vous ne pouvez plus modifier vos réponses.":null);
  }catch(cause){setError(getOfficialAttemptError(cause));}
  finally{setBusy(null);}
 }

 function refresh(){
  if(dirty&&!window.confirm("Annuler les modifications non enregistrées et recharger ?"))return;
  setLoadedKey("");setRefreshNumber(n=>n+1);
 }
 function setAnswer(id:string,value:string){
  if(!canEdit)return;
  setAnswers(prev=>({...prev,[id]:value}));setDirty(true);setNotice(null);
 }
 return <main className="space-y-5 pb-10">
  <section className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">SCHOOLNET V2 · S4-B.3-B.2 · Remise officielle</p>
     <h1 className="mt-2 text-2xl font-extrabold text-slate-900">{current?.title??"Mon évaluation"}</h1>
     <p className="mt-1 text-sm text-slate-600">Une seule copie par élève, dans sa classe officielle.</p>
    </div>
    <button type="button" className="sn-btn-ghost" onClick={goBack}>← Retour au cours</button>
   </div>
  </section>
  {!authLoading&&!allowed&&<div role="alert" className="sn-card p-5 text-red-700">
   Connectez-vous avec un compte apprenant réel pour participer.</div>}
  {loading&&<div role="status" className="sn-card p-5 text-slate-600">Contrôle de la classe et récupération de votre copie…</div>}
  {!loading&&allowed&&error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
  {!loading&&allowed&&notice&&<div role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">{notice}</div>}
  {!loading&&current&&state&&<>
   <section className="sn-card p-5 space-y-4">
    <div className="flex flex-wrap justify-between items-center gap-3">
     <div className="flex gap-2 flex-wrap items-center">
      <span className="sn-badge sn-badge-blue">{current.type==="quiz"?"Quiz":current.type==="assignment"?"Devoir":"Examen"}</span>
      <span className="sn-badge sn-badge-gray">{statusLabel(state.status)}</span>
      {dirty&&<span className="text-xs font-semibold text-amber-700">Modifications non enregistrées</span>}
     </div>
     <button type="button" className="sn-btn-ghost" disabled={!!busy} onClick={refresh}>↻ Actualiser</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
     <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Échéance</p><b>{dateLabel(current.dueAt)}</b></div>
     <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Temps restant</p><b>{state.status==="not_started"?"Débute après le lancement":durationLabel(seconds)}</b></div>
     <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Questions complétées</p><b>{payload.length} / {current.questions.length}</b></div>
    </div>
    <div className="rounded-xl bg-slate-50 p-4">
     <h2 className="text-base font-bold text-slate-900">Consignes de l'enseignant</h2>
     <SafeRichText value={current.description} fallback="Aucune consigne supplémentaire." className="mt-2 text-slate-700"/>
    </div>
    {!online&&<p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900" role="alert">
     Cette évaluation requiert un fichier. Sa remise sécurisée sera proposée dans un lot spécifique.</p>}
    {online&&state.status==="not_started"&&(
     <div className="space-y-3">
      {expired?<p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">L'échéance est dépassée. Demandez à votre enseignant de reprogrammer cette évaluation.</p>:
       <button type="button" onClick={()=>void act("start")} disabled={!!busy}
        className="sn-btn-primary">{busy==="start"?"Démarrage…":"Commencer l'évaluation"}</button>}
      <p className="text-xs text-slate-500">L'heure de début et les délais sont enregistrés par le serveur, et non par votre navigateur.</p>
     </div>
    )}
    {finished&&<div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
     Votre copie est remise et verrouillée{state.submittedAt?" depuis le "+dateLabel(state.submittedAt):""}.
     Les corrections et les notes seront disponibles à l'étape prévue pour l'enseignant.</div>}
    {state.status==="in_progress"&&expired&&<div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
     Délai dépassé : le serveur refuse désormais les nouvelles sauvegardes et remises. Vos brouillons précédemment enregistrés restent conservés.</div>}
   </section>
   {online&&state.status!=="not_started"&&(
    <section className="sn-card p-5 md:p-6 space-y-4" aria-label="Réponses de l'évaluation">
     <h2 className="text-lg font-bold text-slate-900">Mes réponses</h2>
     {current.questions.map((question,index)=>(
      <article key={question.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Question {index+1}</h3>
        <span className="sn-badge sn-badge-blue">{question.type==="short_text"?"Réponse libre":question.type==="mcq"?"QCM":"Vrai / Faux"}</span>
       </div>
       <SafeRichText value={question.prompt} className="text-slate-800"/>
       {question.type==="short_text"?(
        <textarea aria-label={"Réponse à la question "+(index+1)} rows={4} maxLength={10000}
         className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
         value={answers[question.id]??""} disabled={!canEdit}
         onChange={e=>setAnswer(question.id,e.target.value)}
         placeholder="Écrivez votre réponse ici…"/>
       ):(
        question.choices.length===0?(
         <p className="text-sm text-amber-800" role="alert">Choix indisponibles. Informez votre enseignant.</p>
        ):<fieldset className="space-y-2" disabled={!canEdit}>
         <legend className="sr-only">Choix de la question {index+1}</legend>
         {question.choices.map(choice=><label key={choice.id}
          className="flex cursor-pointer gap-2 items-start rounded-xl border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="radio" name={"official-b2-"+question.id} value={choice.id}
           checked={answers[question.id]===choice.id}
           onChange={()=>setAnswer(question.id,choice.id)}/>
          <SafeRichText value={choice.text} className="text-slate-800"/>
         </label>)}
        </fieldset>
       )}
      </article>
     ))}
     {current.type!=="quiz"&&(
      <div className="rounded-xl border border-slate-200 p-4 space-y-2">
       <label htmlFor="official-b2-freeform" className="font-semibold text-sm">Réponse complémentaire écrite</label>
       <textarea id="official-b2-freeform" rows={5} maxLength={10000}
        className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
        value={freeform} disabled={!canEdit}
        onChange={e=>{setFreeform(e.target.value);setDirty(true);}}
        placeholder="Rédigez votre travail ici si une réponse générale est demandée."/>
      </div>
     )}
     {state.status==="in_progress"&&!expired&&(
      <div className="flex flex-wrap gap-3 items-center">
       <button type="button" className="sn-btn-ghost" disabled={!!busy}
        onClick={()=>void act("save")}>{busy==="save"?"Enregistrement…":"Enregistrer mon brouillon"}</button>
       <button type="button" className="sn-btn-primary" disabled={!!busy||!hasResponse}
        onClick={()=>void act("submit")}>{busy==="submit"?"Remise…":"Remettre définitivement"}</button>
       <p className="text-xs text-slate-600">Aucune correction ni note n'est calculée automatiquement.</p>
      </div>
     )}
    </section>
   )}
  </>}
 </main>;
}
