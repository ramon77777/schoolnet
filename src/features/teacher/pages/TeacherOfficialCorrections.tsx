import {useEffect,useMemo,useState} from "react";
import {useNavigate,useParams} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import SafeRichText from "@/components/editor/SafeRichText";
import {
 getTeacherOfficialCopies,teacherOfficialGrade,officialGradingError,
} from "@/features/schools/lib/officialTeacherGradingApi";
import {
 formatOfficialPoints,type TeacherOfficialCopies,
 type TeacherOfficialCopy,type TeacherOfficialQuestion,
} from "@/features/schools/lib/officialTeacherGradingModel";

const STATUSES:Record<TeacherOfficialCopy["status"],string>={
 in_progress:"En cours",submitted:"Remise",graded:"Corrigée",published:"Résultat publié",
};
function when(value:string|null):string{
 return value?new Date(value).toLocaleString("fr-FR"):"—";
}
function points(value:number|null):string{
 return value===null?"—":formatOfficialPoints(value);
}
function AnswerDisplay({
 question,copy,
}:{question:TeacherOfficialQuestion;copy:TeacherOfficialCopy;}){
 const answer=copy.answers.find(a=>a.questionId===question.id);
 const selected=question.choices.find(c=>c.id===answer?.choiceId);
 const right=question.choices.filter(c=>c.isCorrect);
 return <article className="rounded-xl border border-slate-200 p-4 space-y-2">
  <SafeRichText value={question.prompt} className="font-semibold text-slate-900"/>
  <p className="text-xs font-semibold text-slate-500">
   {question.type==="short_text"?"Réponse libre":
     question.type==="true_false"?"Vrai / Faux":"QCM"}
  </p>
  {question.type==="short_text"?(
   <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-900">
    {answer?.answerText?.trim()||"Aucune réponse"}
   </p>
  ):(
   <div className="space-y-2">
    <div className="rounded-lg bg-slate-50 p-3">
     <span className="text-xs text-slate-500">Réponse sélectionnée</span>
     {selected?<SafeRichText value={selected.text}/>:
      <p className="text-sm">Aucune réponse</p>}
    </div>
    <div className="rounded-lg bg-emerald-50 p-3">
     <span className="text-xs font-semibold text-emerald-800">Choix attendu(s) — enseignant uniquement</span>
     {right.length>0?right.map(c=><SafeRichText key={c.id} value={c.text}/>)
      :<p className="text-sm text-emerald-900">Aucun choix correct défini.</p>}
    </div>
   </div>
  )}
 </article>;
}

/** La lecture des copies et l'ecriture des notes passent exclusivement par RPC. */
export default function TeacherOfficialCorrections(){
 const {id}=useParams<{id:string}>();
 const {user,loading:authLoading}=useAuth();
 const navigate=useNavigate();
 const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="teacher";
 const [data,setData]=useState<TeacherOfficialCopies|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [notice,setNotice]=useState<string|null>(null);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [draft,setDraft]=useState({id:"",score:"",feedback:""});
 const [busy,setBusy]=useState<"grade"|"publish"|null>(null);
 const [revision,setRevision]=useState(0);
 const selected=useMemo(
  ()=>data?.copies.find(c=>c.id===selectedId)??data?.copies[0]??null,
  [data,selectedId],
 );
 const scoreText=draft.id===selected?.id?draft.score:
  selected?.score===null?"":String(selected?.score??"");
 const feedbackText=draft.id===selected?.id?draft.feedback:selected?.feedback??"";

 useEffect(()=>{
  if(!allowed||!id){return;}
  let cancelled=false;
  getTeacherOfficialCopies(id).then(next=>{
   if(cancelled)return;
   setData(next);setError(null);setLoading(false);
  }).catch(cause=>{
   if(cancelled)return;
   setData(null);setError(officialGradingError(cause));setLoading(false);
  });
  return ()=>{cancelled=true;};
 },[id,allowed,revision]);

 function refresh(){
  setLoading(true);setNotice(null);setDraft({id:"",score:"",feedback:""});
  setRevision(n=>n+1);
 }
 async function run(action:"grade"|"publish"){
  if(!id||!selected||busy||!data||!allowed)return;
  const nextScore=Number(scoreText.replace(",","."));
  const isValidScore=/^\d+([.,]\d{1,2})?$/.test(scoreText.trim())&&
   Number.isFinite(nextScore)&&nextScore>=0&&
   data.maxScore!==null&&nextScore<=data.maxScore;
  if(action==="grade"){
   if(!["submitted","graded"].includes(selected.status))return;
   if(!isValidScore){setError("Saisissez une note valide, comprise entre 0 et le barème maximal (2 décimales).");return;}
   if(!feedbackText.trim()||feedbackText.trim().length>4000){
    setError("Une appréciation de 1 à 4 000 caractères est nécessaire.");return;
   }
  }else{
   if(selected.status!=="graded")return;
   if(!window.confirm("Publier définitivement la note et l'appréciation pour cet élève ? Le résultat deviendra visible dans son espace."))return;
  }
  setBusy(action);setError(null);setNotice(null);
  try{
   await teacherOfficialGrade(id,selected.id,action,
    action==="grade"?nextScore:null,
    action==="grade"?feedbackText.trim():null);
   setNotice(action==="grade"?
    "Correction enregistrée. Elle n'est pas encore visible par l'élève.":
    "Résultat publié : l'élève peut désormais consulter sa note et son appréciation.");
   setDraft({id:"",score:"",feedback:""});
   const newData=await getTeacherOfficialCopies(id);
   setData(newData);setSelectedId(selected.id);
  }catch(cause){setError(officialGradingError(cause));}
  finally{setBusy(null);}
 }

 const isLoading=authLoading||loading;
 return <main className="space-y-5 pb-10">
  <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">SCHOOLNET V2 · S4-B.3-B.3 · Correction officielle</p>
     <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
      {data?.title??"Copies officielles"}
     </h1>
     <p className="mt-1 text-sm text-slate-600">Suivi des copies remises, correction manuelle et publication des résultats.</p>
    </div>
    <button type="button" className="sn-btn-ghost"
     onClick={()=>navigate("/app/teacher/assessments/"+(id??""))}>← Retour à l'évaluation</button>
   </div>
  </header>
  {!authLoading&&!allowed&&<div className="sn-card p-5 text-red-700" role="alert">
   Connectez-vous avec votre compte enseignant réel.</div>}
  {isLoading&&allowed&&<div className="sn-card p-5" role="status">Vérification des droits et des copies de la classe…</div>}
  {!isLoading&&error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{error}</div>}
  {!isLoading&&notice&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{notice}</div>}
  {!isLoading&&data&&<>
   <section className="sn-card p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3 items-center">
     <div><h2 className="text-lg font-semibold">Suivi de ma classe</h2>
      <p className="text-xs text-slate-500">Seuls les élèves de votre établissement et de votre classe sont visibles.</p>
     </div>
     <button type="button" className="sn-btn-ghost" disabled={!!busy}
      onClick={refresh}>↻ Actualiser</button>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
     {([
      ["Effectif",data.classSize],["Non commencées",data.counts.notStarted],
      ["En cours",data.counts.inProgress],["Remises",data.counts.submitted],
      ["Corrigées",data.counts.graded],["Publiées",data.counts.published],
     ] as const).map(([label,value])=><div key={label}
      className="rounded-xl bg-slate-50 p-3 text-center">
      <div className="text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
     </div>)}
    </div>
    <p className="text-xs text-slate-500">Barème maximal : {data.maxScore===null?"non défini":points(data.maxScore)+" points"}.
     Les copies en cours n'exposent pas leurs réponses avant la remise.</p>
   </section>
   <div className="grid gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.6fr)]">
    <section className="sn-card p-4 space-y-3">
     <h2 className="text-lg font-bold">Copies de mes élèves ({data.copies.length})</h2>
     {data.copies.length===0&&<p className="text-sm text-slate-600">
      Aucune copie démarrée pour cette évaluation.</p>}
     <div className="space-y-2">
      {data.copies.map(copy=><button key={copy.id} type="button"
       aria-pressed={selected?.id===copy.id}
       className={"block w-full rounded-xl border p-3 text-left text-sm transition "+
        (selected?.id===copy.id?"border-indigo-500 bg-indigo-50":"border-slate-200 hover:bg-slate-50")}
       onClick={()=>{setSelectedId(copy.id);setDraft({id:"",score:"",feedback:""});setError(null);setNotice(null);}}>
       <div className="font-semibold text-slate-900">{copy.studentName}</div>
       <div className="mt-1 text-slate-600">{STATUSES[copy.status]}</div>
       <div className="mt-1 text-xs text-slate-500">
        Remise : {when(copy.submittedAt)}
       </div>
      </button>)}
     </div>
     {data.copies.length===250&&<p className="text-xs text-amber-700" role="status">
      Affichage limité aux 250 copies les plus récentes.</p>}
    </section>
    <section className="sn-card p-5 space-y-5">
     {!selected?<p className="text-sm text-slate-600">
      Sélectionnez une copie pour accéder à sa correction.</p>:<>
      <div className="flex flex-wrap items-start justify-between gap-2">
       <div>
        <h2 className="text-lg font-bold text-slate-900">{selected.studentName}</h2>
        <p className="mt-1 text-sm text-slate-600">Statut : {STATUSES[selected.status]}</p>
        <p className="text-xs text-slate-500">Début : {when(selected.startedAt)} · Remise : {when(selected.submittedAt)}</p>
       </div>
       {selected.status==="published"&&<span className="sn-badge sn-badge-green">Résultat publié</span>}
      </div>
      {selected.status==="in_progress"?<div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
       L'élève travaille encore. Ses réponses ne sont pas consultables avant la remise.</div>:<>
       {data.questions.length===0&&<p className="text-sm text-slate-500">Aucune question numérique enregistrée.</p>}
       <div className="space-y-3">
        {data.questions.map(q=><AnswerDisplay key={q.id} question={q} copy={selected}/>)}
       </div>
       {selected.freeformAnswer&&(
        <div className="rounded-xl border border-slate-200 p-4">
         <h3 className="font-bold">Réponse complémentaire</h3>
         <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{selected.freeformAnswer}</p>
        </div>
       )}
       <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
        <h3 className="font-bold text-slate-900">Note et appréciation manuelles</h3>
        <label className="block text-sm font-semibold text-slate-800" htmlFor="b3-score">Note obtenue</label>
        <div className="flex items-center gap-2">
         <input id="b3-score" type="text" inputMode="decimal"
          className="w-28 rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
          value={scoreText} disabled={busy!==null||selected.status==="published"}
          onChange={e=>setDraft({id:selected.id,score:e.target.value,feedback:feedbackText})}
          placeholder="0" aria-label="Note sur le barème"/>
         <span className="text-sm text-slate-600">/ {points(data.maxScore)} points</span>
        </div>
        <label className="block text-sm font-semibold text-slate-800" htmlFor="b3-feedback">Appréciation de l'enseignant</label>
        <textarea id="b3-feedback" rows={4} maxLength={4000}
         className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"
         value={feedbackText} disabled={busy!==null||selected.status==="published"}
         onChange={e=>setDraft({id:selected.id,score:scoreText,feedback:e.target.value})}
         placeholder="Expliquez à l'élève les points réussis et les améliorations attendues."/>
        {selected.status==="published"?<p className="text-sm font-semibold text-emerald-800">
         Résultat publié le {when(selected.publishedAt)}. La copie est verrouillée.</p>:
        <div className="flex flex-wrap gap-2">
         <button type="button" className="sn-btn-primary"
          disabled={busy!==null||!["submitted","graded"].includes(selected.status)||data.maxScore===null}
          onClick={()=>void run("grade")}>{busy==="grade"?"Enregistrement…":"Enregistrer la correction"}</button>
         <button type="button" className="sn-btn-ghost"
          disabled={busy!==null||selected.status!=="graded"}
          onClick={()=>void run("publish")}>{busy==="publish"?"Publication…":"Publier le résultat"}</button>
        </div>}
        {selected.status==="submitted"&&<p className="text-xs text-indigo-700">
         La note reste confidentielle tant que vous ne cliquez pas sur « Publier le résultat ».</p>}
       </div>
      </>}
     </>}
    </section>
   </div>
  </>}
 </main>;
}
