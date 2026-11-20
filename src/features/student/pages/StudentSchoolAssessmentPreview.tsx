import {useCallback,useEffect,useState} from "react";
import {Link,useParams} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {
 getStudentOfficialAssessmentPreview,
 isStudentOfficialAssessmentPreviewPending,
} from "@/features/student/lib/studentSchoolAssessmentPreviewApi";
import type {
 StudentOfficialAssessmentPreview,OfficialPreviewQuestion,
} from "@/features/student/lib/studentSchoolAssessmentPreviewModel";

function kind(type:string):string{
 return type==="quiz"?"Quiz":type==="assignment"?"Devoir":"Examen";
}
function questionKind(type:string):string{
 return type==="mcq"?"QCM":type==="true_false"?"Vrai / Faux":"Réponse libre";
}
function formatDate(value:string|null):string{
 return value?new Date(value).toLocaleString("fr-FR"):"Non fixée";
}
function OfficialQuestion({question,index}:{
 question:OfficialPreviewQuestion;index:number;
}){
 return (
  <article className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h3 className="text-base font-bold text-slate-900">Question {index+1}</h3>
    <span className="sn-badge sn-badge-blue">{questionKind(question.type)}</span>
   </div>
   <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
    {question.prompt}
   </p>
   {question.choices.length>0&&(
    <ol className="list-decimal pl-6 space-y-2" aria-label="Choix proposés en lecture seule">
     {question.choices.map(choice=>(
      <li key={choice.id} className="text-sm text-slate-700 whitespace-pre-wrap break-words">
       {choice.text}
      </li>
     ))}
    </ol>
   )}
   {question.type==="short_text"&&(
    <p className="text-xs text-slate-500">
     Question à réponse libre. La saisie sera disponible à l'étape de remise.
    </p>
   )}
   <p className="text-xs text-slate-500">
    Consultation uniquement : aucune réponse n'est sélectionnable ou enregistrée.
   </p>
  </article>
 );
}

/** Route eleve V2 : jamais de lien vers /student/assessments/:id (moteur V1). */
export default function StudentSchoolAssessmentPreview(){
 const {courseId,assessmentId}=useParams<{courseId:string;assessmentId:string}>();
 const {user,loading:authLoading}=useAuth();
 const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="student";
 const [data,setData]=useState<StudentOfficialAssessmentPreview|null>(null);
 const [loadedFor,setLoadedFor]=useState("");
 const [error,setError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const key=[user?.id??"",courseId??"",assessmentId??""].join("|");
 const canLoad=allowed&&!!courseId&&!!assessmentId;
 const loading=authLoading||(canLoad&&loadedFor!==key);
 const refresh=useCallback(()=>{setLoadedFor("");setRevision(n=>n+1);},[]);
 useEffect(()=>{
  if(!canLoad||!courseId||!assessmentId)return;
  let cancelled=false;
  void getStudentOfficialAssessmentPreview(courseId,assessmentId)
   .then(result=>{
    if(cancelled)return;
    setData(result);setError(null);setLoadedFor(key);
   })
   .catch(cause=>{
    if(cancelled)return;
    setData(null);setLoadedFor(key);
    setError(isStudentOfficialAssessmentPreviewPending(cause)
     ?"La consultation des évaluations officielles n'est pas encore activée sur ce serveur."
     :"Évaluation inaccessible : elle a peut-être été retirée, non publiée ou vos droits ont changé.");
   });
  return ()=>{cancelled=true;};
 },[courseId,assessmentId,canLoad,key,revision]);
 const current=canLoad&&loadedFor===key?data:null;
 const returnPath=courseId
  ?"/app/student/school-courses/"+courseId
  :"/app/student/courses?tab=official";
 return (
  <main className="space-y-5 pb-10">
   <section className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="min-w-0">
      <p className="text-xs font-extrabold tracking-widest uppercase text-indigo-700">
       SCHOOLNET V2 · S4-B.3-B.1 · Évaluation officielle
      </p>
      <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-950 break-words">
       {current?.title??"Consulter mon évaluation"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
       Consultation sécurisée des consignes et des questions de ma classe.
      </p>
     </div>
     <Link className="sn-btn-ghost" to={returnPath}>← Retour au cours</Link>
    </div>
   </section>
   {allowed&&(
    <div className="flex justify-end">
     <button type="button" className="sn-btn-ghost" onClick={refresh} disabled={loading}>
      ↻ Actualiser
     </button>
    </div>
   )}
   {loading&&<p className="sn-card p-5 text-sm text-slate-600" role="status">
    Vérification de votre affectation scolaire et des questions autorisées…
   </p>}
   {!authLoading&&!allowed&&(
    <p className="sn-card p-5 text-sm text-red-800" role="alert">
     Cette consultation est réservée aux apprenants connectés.
    </p>
   )}
   {!loading&&allowed&&error&&(
    <p className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="alert">
     {error}
    </p>
   )}
   {!loading&&!error&&current&&(
    <>
     <section className="sn-card p-5 md:p-6 space-y-4" aria-label="Consignes de l'évaluation">
      <div className="flex flex-wrap items-center gap-2">
       <span className="sn-badge sn-badge-blue">{kind(current.type)}</span>
       <span className="sn-badge sn-badge-gray">Lecture seule</span>
       <span className="text-xs text-slate-500">Évaluation publiée pour ma classe</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
       <div className="rounded-xl bg-slate-50 p-3">
        <dt className="text-xs text-slate-500">Échéance</dt>
        <dd className="mt-1 text-sm font-semibold text-slate-900">{formatDate(current.dueAt)}</dd>
       </div>
       <div className="rounded-xl bg-slate-50 p-3">
        <dt className="text-xs text-slate-500">Durée indicative</dt>
        <dd className="mt-1 text-sm font-semibold text-slate-900">
         {current.timeLimitMinutes!==null?current.timeLimitMinutes+" min":"Non fixée"}
        </dd>
       </div>
       <div className="rounded-xl bg-slate-50 p-3">
        <dt className="text-xs text-slate-500">Barème maximal</dt>
        <dd className="mt-1 text-sm font-semibold text-slate-900">
         {current.maxScore!==null?current.maxScore+" pts":"Non renseigné"}
        </dd>
       </div>
       <div className="rounded-xl bg-slate-50 p-3">
        <dt className="text-xs text-slate-500">Chapitre</dt>
        <dd className="mt-1 text-sm font-semibold text-slate-900">
         {current.sectionTitle??"Évaluation générale"}
        </dd>
       </div>
      </dl>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
       <h2 className="font-bold text-slate-900">Consignes de l'enseignant</h2>
       <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">
        {current.description?.trim()||"Aucune consigne particulière n'a été ajoutée."}
       </p>
      </div>
      {current.instructionFileName&&(
       <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        Un sujet fichier est associé à cette évaluation ({current.instructionFileName}).
        Son ouverture sécurisée sera traitée dans une étape ultérieure.
       </p>
      )}
     </section>
     <section className="sn-card p-5 md:p-6 space-y-4" aria-label="Questions officielles en lecture seule">
      <div>
       <h2 className="text-lg font-bold text-slate-900">
        Questions de l'évaluation ({current.questions.length})
       </h2>
       <p className="mt-1 text-sm text-slate-600">
        Les réponses correctes, les notes et les corrections ne sont pas affichées.
       </p>
      </div>
      {current.questions.length===0?(
       <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
        Aucune question en ligne n'est disponible pour cette évaluation.
        {current.instructionFileName?" Le sujet fichier sera accessible lors d'une étape ultérieure.":""}
       </p>
      ):(
       <div className="grid gap-4 lg:grid-cols-2">
        {current.questions.map((question,index)=>(
         <OfficialQuestion key={question.id} question={question} index={index}/>
        ))}
       </div>
      )}
     </section>
     <p className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900" role="status">
      Consultation uniquement : il n'est pas encore possible de commencer,
      enregistrer ou remettre cette évaluation. Ces actions seront activées
      après les contrôles de sécurité de S4-B.3-B.2.
     </p>
    </>
   )}
  </main>
 );
}
