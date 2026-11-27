import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { signOut } from "@/lib/auth";
import {
  readOfficialGeneralPreview,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesApi";
import type {
  GeneralScope, OfficialGeneralPreview,
} from "@/features/schools/lib/schoolOfficialGeneralAveragesModel";
import {
  S4D3L_SCHOOLS, isLabSchoolAdmin, isS4D3LLocalLab,
} from "../lib/schoolBulletinLocalLabGuard";
import {
  readLabCase, openLabCase, transitionLabCase, safeLabRpcError,
  type LabAction, type LabCaseRead, type LabViewer,
} from "../lib/schoolBulletinLocalLabApi";

type GeneralResult={key:string;data:OfficialGeneralPreview|null;error:string|null};
type CaseResult={key:string;data:LabCaseRead|null;error:string|null};

const stateLabel:Record<string,string>={
  draft:"Brouillon",submitted:"Soumis à décision",
  approved:"Approuvé",refused:"Refusé",correction_requested:"Corrections demandées",
  authorized_for_publication:"Publication autorisée — pas encore publiée",
  published:"Publié",withdrawn:"Retiré",
};
const eventLabel:Record<string,string>={
  case_opened:"Dossier ouvert",
  review_submitted:"Demande transmise",
  approval_granted:"Approbation accordée",
  approval_refused:"Approbation refusée",
  correction_requested:"Correction demandée",
  publication_authorized:"Diffusion autorisée",
};
const grade=(v:number|null)=>v===null?"—":v.toFixed(2).replace(".",",")+" / 20";

export default function SchoolBulletinLocalLab(){
 const navigate=useNavigate();
 const {user,loading}=useAuth();
 const localOK=typeof window!=="undefined"&&isS4D3LLocalLab({
   dev:import.meta.env.DEV,
   explicitLabOptIn:import.meta.env.VITE_SCHOOLNET_S4D3L_LAB,
   locationHostname:window.location.hostname,
   supabaseUrl:String(import.meta.env.VITE_SUPABASE_URL??""),
 });
 const viewer:LabViewer|null=isLabSchoolAdmin(user)?{
   id:user!.id,role:user!.role,isDemo:Boolean(user!.isDemo),
 }:null;
 const ready=localOK&&!loading&&Boolean(viewer);
 const [schoolId,setSchoolId]=useState<string>(S4D3L_SCHOOLS[0].id);
 const school=S4D3L_SCHOOLS.find(s=>s.id===schoolId)??S4D3L_SCHOOLS[0];
 const scope=useMemo<GeneralScope>(()=>({
   schoolId:school.id,schoolYearId:school.schoolYearId,
   classId:school.classId,periodId:school.periodId,
 }),[school]);
 const [studentId,setStudentId]=useState("");
 const [revision,setRevision]=useState(0);
 const [generalResult,setGeneralResult]=useState<GeneralResult|null>(null);
 const [caseResult,setCaseResult]=useState<CaseResult|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [feedback,setFeedback]=useState<string|null>(null);
 const [reason,setReason]=useState("");
 const ownerKey=ready&&viewer?viewer.id:"";
 const generalKey=[ownerKey,scope.schoolId,scope.classId,scope.periodId,revision].join("|");

 useEffect(()=>{
   if(!ready||!viewer)return;
   let cancelled=false;
   void readOfficialGeneralPreview(scope).then(data=>{
     if(!cancelled)setGeneralResult({key:generalKey,data,error:null});
   }).catch(()=>{
     if(!cancelled)setGeneralResult({
       key:generalKey,data:null,
       error:"Programme et élèves indisponibles ou école non autorisée dans Supabase local.",
     });
   });
   return()=>{cancelled=true;};
 },[ready,ownerKey,scope,generalKey,viewer?.id]);

 const general=generalResult?.key===generalKey?generalResult.data:null;
 const selected=general?.students.find(s=>s.studentId===studentId)??null;
 const caseKey=ready&&selected?
   [ownerKey,scope.schoolId,scope.classId,scope.periodId,selected.studentId,revision].join("|"):"";
 useEffect(()=>{
   if(!caseKey||!selected||!viewer)return;
   let cancelled=false;
   void readLabCase(scope,selected.studentId,viewer).then(data=>{
     if(!cancelled)setCaseResult({key:caseKey,data,error:null});
   }).catch(error=>{
     if(!cancelled)setCaseResult({key:caseKey,data:null,error:safeLabRpcError(error)});
   });
   return()=>{cancelled=true;};
 },[caseKey,scope,selected?.studentId,viewer?.id,ready]);

 const caseLoad=caseResult?.key===caseKey?caseResult:null;
 const caseRead=caseLoad?.data??null;
 const row=caseRead?.case??null;
 const caps=caseRead?.capabilities??[];
 const canOpen=Boolean(ready&&selected?.state==="ready"&&!row&&caps.includes("submit"));
 const canSubmit=Boolean(ready&&row?.state==="draft"&&caps.includes("submit"));
 const canDecide=Boolean(ready&&row?.state==="submitted"&&
   row.requesterId!==viewer?.id&&caps.includes("decide"));
 const canAuthorize=Boolean(ready&&row?.state==="approved"&&
   caps.includes("authorize_publication"));

 async function execute(action:"open"|LabAction){
   if(!viewer||!selected||!caseLoad||busy)return;
   if(action==="open"&&!canOpen||
      action==="review_submitted"&&!canSubmit||
      ["approval_granted","approval_refused","correction_requested"].includes(action)&&!canDecide||
      action==="publication_authorized"&&!canAuthorize)return;
   if(["approval_refused","correction_requested"].includes(action)&&
     (reason.trim().length<5||reason.trim().length>2000)){
      setFeedback("Indiquez un motif de 5 à 2000 caractères avant la décision.");
      return;
   }
   setBusy(action);setFeedback(null);
   const beforeKey=caseKey;
   try{
     if(action==="open"){
       await openLabCase(scope,selected.studentId,viewer);
     }else if(row){
       await transitionLabCase(scope,selected.studentId,viewer,row,action,
         ["approval_refused","correction_requested"].includes(action)?reason:null);
     }
     // A mutation is not displayed as "successful" until the server is re-read.
     const refreshed=await readLabCase(scope,selected.studentId,viewer);
     if(refreshed.case===null)throw new Error("Dossier absent après transaction.");
     setCaseResult({key:beforeKey,data:refreshed,error:null});
     setReason("");
     setFeedback("Action enregistrée sur PostgreSQL local et historique actualisé.");
   }catch(error){
     // Never retain an optimistic state when a transaction's outcome is unclear.
     setCaseResult(null);
     setFeedback(safeLabRpcError(error));
     setRevision(value=>value+1);
   }finally{setBusy(null);}
 }

 async function changeAccount(){
   if(busy)return;
   setBusy("logout");
   try{
     await signOut();
     navigate("/auth/login",{replace:true});
   }catch{
     setFeedback("Impossible de fermer la session. Réessayez avant de changer de compte.");
   }finally{setBusy(null);}
 }

 return <main className="space-y-5 pb-12" aria-label="Laboratoire local de validation des bulletins V2">
  <header className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-950 to-indigo-700 p-5 text-white md:p-8">
   <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-200">
    SCHOOLNET V2 · S4-D.3l · Laboratoire local
   </p>
   <h1 className="mt-2 text-2xl font-extrabold md:text-3xl">
    Validation des bulletins — actions réelles
   </h1>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-100">
    Ouverture, soumission, décision et autorisation de publication enregistrées
    sur Supabase local, avec historique PostgreSQL. Élèves et comptes fictifs exclusivement.
   </p>
   <p className="mt-4 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold">
    Aucune publication PDF · Aucune connexion à Supabase principal
   </p>
  </header>

  {!localOK&&<section role="alert"
    className="rounded-xl border-2 border-red-300 bg-red-50 p-5 text-sm text-red-950">
    <h2 className="font-extrabold">Laboratoire verrouillé</h2>
    <p className="mt-2">Cette page exige Vite en développement, l'option locale S4-D.3l,
    une origine navigateur localhost et le Supabase de test
    <code className="ml-1">http://127.0.0.1:55421</code>.
    Aucun appel serveur n'est émis depuis cette page tant que ces conditions ne sont pas réunies.</p>
  </section>}
  {localOK&&!loading&&!viewer&&<div role="alert"
    className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
    Connectez-vous avec un compte fictif <strong>administrateur d'établissement</strong>
    créé dans le laboratoire. Les comptes de démonstration ne sont pas acceptés.
    <Link to="/auth/login" className="ml-2 font-bold underline">Se connecter</Link>
  </div>}
  {localOK&&loading&&<p role="status" className="text-sm text-slate-600">
    Vérification de la session réelle du laboratoire…
  </p>}

  {ready&&viewer&&<>
   <section className="sn-card flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
    <div>
     <p className="text-xs font-bold uppercase text-indigo-700">Compte actif de test</p>
     <p className="mt-1 font-bold text-slate-900">
      {user?.fullName||user?.email||"Administrateur local"}
     </p>
     <p className="text-xs text-slate-600">Identité et délégations vérifiées côté PostgreSQL à chaque action</p>
    </div>
    <button type="button" onClick={()=>void changeAccount()} disabled={Boolean(busy)}
      className="sn-btn-ghost disabled:cursor-not-allowed disabled:opacity-50">
      Changer de compte
    </button>
   </section>

   <section className="sn-card space-y-5 p-4 md:p-6">
    <div>
     <h2 className="text-lg font-extrabold text-slate-950">1. Choisir un dossier d'élève</h2>
     <p className="mt-1 text-sm text-slate-600">
      Les élèves et les moyennes proviennent de la véritable projection scolaire V2 locale.
     </p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
     <label className="space-y-2 text-sm font-semibold text-slate-900">
      <span>Établissement fictif</span>
      <select aria-label="Établissement du laboratoire" className="sn-input w-full"
        value={schoolId} disabled={Boolean(busy)}
        onChange={e=>{
         setSchoolId(e.target.value);
         setStudentId("");setGeneralResult(null);setCaseResult(null);
         setFeedback(null);setReason("");
        }}>
        {S4D3L_SCHOOLS.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
      </select>
     </label>
     <label className="space-y-2 text-sm font-semibold text-slate-900">
      <span>Élève</span>
      <select aria-label="Élève à valider" className="sn-input w-full"
        value={selected?.studentId??""}
        disabled={!general||Boolean(busy)}
        onChange={e=>{
          setStudentId(e.target.value);setCaseResult(null);
          setFeedback(null);setReason("");
        }}>
        <option value="">Choisir un élève…</option>
        {general?.students.map(s=><option key={s.studentId} value={s.studentId}>
          {s.studentName} — {s.state==="ready"?"Calculable":"À compléter"}
        </option>)}
      </select>
     </label>
    </div>
    {!general&&generalResult?.key!==generalKey&&
      <p role="status" className="text-sm text-slate-600">Chargement des élèves autorisés…</p>}
    {generalResult?.key===generalKey&&generalResult.error&&
      <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        {generalResult.error}
      </p>}
    {selected&&<div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-indigo-50 p-4">
      <div>
        <p className="font-bold text-indigo-950">{selected.studentName}</p>
        <p className="text-xs text-indigo-900">
          {selected.readySubjects}/{selected.expectedSubjects} matières calculables
          {selected.state!=="ready"?" · dossier incomplet":""}
        </p>
      </div>
      <strong className="tabular-nums text-indigo-950">
        {grade(selected.averageOn20)}
      </strong>
    </div>}
   </section>

   {selected&&<section className="sn-card space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <h2 className="text-lg font-extrabold text-slate-950">2. Décider et suivre le dossier</h2>
       <p className="mt-1 text-sm text-slate-600">
         Les boutons actifs dépendent des habilitations réellement retournées par le serveur.
       </p>
      </div>
      <button type="button" className="sn-btn-ghost"
       onClick={()=>{setRevision(n=>n+1);setCaseResult(null);setFeedback(null);}}
       disabled={Boolean(busy)}>Actualiser depuis PostgreSQL</button>
    </div>
    {!caseLoad&&!busy&&<p role="status" className="text-sm text-slate-600">
      Lecture sécurisée du dossier et des droits…
    </p>}
    {caseLoad?.error&&<p role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      {caseLoad.error}
    </p>}
    {caseRead&&<>
      <div className="grid gap-3 sm:grid-cols-3">
       <article className="rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-bold text-slate-600">Statut réel</p>
        <p className="mt-1 text-sm font-extrabold text-slate-950">
         {row?stateLabel[row.state]??row.state:"Aucun dossier"}
        </p>
       </article>
       <article className="rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-bold text-slate-600">Version du dossier</p>
        <p className="mt-1 font-extrabold text-slate-950">{row?.version??"—"}</p>
       </article>
       <article className="rounded-xl bg-slate-50 p-4">
        <p className="text-xs font-bold text-slate-600">Habilitations effectives</p>
        <p className="mt-1 text-xs font-semibold text-slate-900">
          {caps.length?caps.join(" · "):"Aucune"}
        </p>
       </article>
      </div>
      {selected.state!=="ready"&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Dossier non calculable : les résultats manquants ne sont jamais remplacés par zéro.
      </p>}
      {!row&&caps.includes("decide")&&!caps.includes("submit")&&<p
        className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
        Aucun dossier soumis pour cet élève. Connectez-vous d'abord avec le compte demandeur.
      </p>}
      {(canDecide)&&<label className="block space-y-2 text-sm font-semibold text-slate-900">
        <span>Motif (obligatoire pour refus ou demande de correction)</span>
        <textarea value={reason} onChange={e=>setReason(e.target.value)}
         disabled={Boolean(busy)} rows={2} maxLength={2000}
         placeholder="Précisez la décision…"
         className="sn-input w-full resize-y" />
      </label>}
      <div className="flex flex-wrap gap-3">
        {canOpen&&<button type="button" className="sn-btn-primary"
          disabled={Boolean(busy)} onClick={()=>void execute("open")}>
          Ouvrir le dossier
        </button>}
        {canSubmit&&<button type="button" className="sn-btn-primary"
          disabled={Boolean(busy)} onClick={()=>void execute("review_submitted")}>
          Soumettre le bulletin
        </button>}
        {canDecide&&<>
         <button type="button" className="sn-btn-primary"
          disabled={Boolean(busy)} onClick={()=>void execute("approval_granted")}>
          Approuver
         </button>
         <button type="button" className="sn-btn-ghost"
          disabled={Boolean(busy)||reason.trim().length<5}
          onClick={()=>void execute("correction_requested")}>
          Demander une correction
         </button>
         <button type="button" className="sn-btn-ghost"
          disabled={Boolean(busy)||reason.trim().length<5}
          onClick={()=>void execute("approval_refused")}>
          Refuser avec motif
         </button>
        </>}
        {canAuthorize&&<button type="button" className="sn-btn-primary"
          disabled={Boolean(busy)} onClick={()=>void execute("publication_authorized")}>
          Autoriser la publication
        </button>}
        {busy&&<span role="status" className="self-center text-sm font-semibold text-indigo-900">
          Vérification et écriture sur PostgreSQL local…
        </span>}
      </div>
      {feedback&&<p role="status"
        className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">
        {feedback}
      </p>}
      {row?.state==="authorized_for_publication"&&
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
          Autorisation enregistrée. Aucun bulletin n'est publié :
          le PDF, le stockage privé et l'accès des familles restent désactivés.
        </p>}
      {row&&<section aria-label="Historique réel des décisions"
        className="space-y-3 border-t border-slate-200 pt-5">
        <h3 className="text-base font-extrabold text-slate-950">
          3. Historique PostgreSQL ({row.audit.length} événements)
        </h3>
        <ol className="space-y-2">
          {row.audit.map((event,index)=><li
           key={event.version+"-"+index}
           className="rounded-xl border border-slate-200 bg-slate-50 p-3">
           <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-slate-950">
              {eventLabel[event.action]??event.action}
            </strong>
            <time className="text-xs text-slate-700" dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleString("fr-FR")}
            </time>
           </div>
           <p className="mt-1 text-xs text-slate-600">
             Version {event.version} · {stateLabel[event.toState]??event.toState}
           </p>
           {event.reason&&<p className="mt-2 text-xs text-slate-900">
             Motif : {event.reason}
           </p>}
          </li>)}
        </ol>
        <p className="text-xs text-slate-600">
          Événements relus depuis le serveur. Les identifiants de compte ne sont pas modifiables dans l'interface.
        </p>
      </section>}
    </>}
   </section>}
  </>}
 </main>;
}
