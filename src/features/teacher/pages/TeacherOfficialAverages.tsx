import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {
 getTeacherOfficialAverageOptions,
 isTeacherOfficialAverageActivationPending,
} from "@/features/teacher/lib/teacherOfficialAverageOptionsApi";
import {
 resolveTeacherOfficialAveragePicker,
 type TeacherOfficialAverageChoice,
 type TeacherOfficialAverageOptions,
} from "@/features/teacher/lib/teacherOfficialAverageOptionsModel";
import {
 getTeacherOfficialSubjectAverages,
} from "@/features/teacher/lib/teacherOfficialAveragesApi";
import type {
 TeacherOfficialSubjectAverages,TeacherOfficialSubjectRow,
} from "@/features/teacher/lib/teacherOfficialAveragesModel";

type RequestState="loading"|"ready"|"pending"|"error";
type StatusFilter="all"|TeacherOfficialSubjectRow["state"];
const PAGE_SIZE=20;
const label:Record<TeacherOfficialSubjectRow["state"],string>={
 ready:"Calculable",incomplete:"Notes manquantes",not_configured:"À paramétrer",
};
const badge:Record<TeacherOfficialSubjectRow["state"],string>={
 ready:"bg-emerald-50 text-emerald-800",
 incomplete:"bg-amber-50 text-amber-900",
 not_configured:"bg-slate-100 text-slate-700",
};
function average(value:number|null):string{
 return value===null?"—":value.toLocaleString("fr-FR",{
  minimumFractionDigits:2,maximumFractionDigits:2,
 })+" / 20";
}
function uniqueKey(choice:TeacherOfficialAverageChoice,userId:string,revision:number){
 return [userId,revision,choice.schoolId,choice.schoolYearId,
  choice.classId,choice.subjectId,choice.periodId].join("|");
}
function Stat({title,value,detail}:{
 title:string;value:number;detail:string;
}){
 return <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
  <p className="mt-2 text-2xl font-extrabold text-slate-950">{value}</p>
  <p className="mt-1 text-xs text-slate-500">{detail}</p>
 </article>;
}
function StateBadge({state}:{state:TeacherOfficialSubjectRow["state"]}){
 return <span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold "+badge[state]}>
  {label[state]}
 </span>;
}

/**
 * C.3-B.2-UI: never reads assessment_submissions or grading tables directly.
 * V1 averages remain on /app/teacher/averages.
 * Without BOTH SQL RPCs, no grades or fabricated preview are displayed.
 */
export default function TeacherOfficialAverages(){
 const {user,loading:authLoading}=useAuth();
 const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="teacher";
 const [context,setContext]=useState<TeacherOfficialAverageOptions|null>(null);
 const [contextFor,setContextFor]=useState("");
 const [contextState,setContextState]=useState<RequestState>("loading");
 const [selection,setSelection]=useState<Partial<TeacherOfficialAverageChoice>>({});
 const [revision,setRevision]=useState(0);
 const [preview,setPreview]=useState<TeacherOfficialSubjectAverages|null>(null);
 const [previewFor,setPreviewFor]=useState("");
 const [previewState,setPreviewState]=useState<RequestState>("loading");
 const [query,setQuery]=useState("");
 const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");
 const [page,setPage]=useState(1);
 const contextKey=allowed?user.id+"|"+revision:"";
 const activeContext=contextFor===contextKey?context:null;
 const picker=useMemo(
  ()=>activeContext?resolveTeacherOfficialAveragePicker(activeContext,selection):null,
  [activeContext,selection],
 );
 const choice=picker?.choice;
 const requestKey=allowed&&choice&&picker.assignment&&picker.period?
  uniqueKey(choice,user.id,revision):"";
 const activePreview=requestKey&&previewFor===requestKey&&previewState==="ready"?
  preview:null;

 useEffect(()=>{
  if(!allowed)return;
  let cancelled=false;
  void getTeacherOfficialAverageOptions().then(next=>{
   if(cancelled)return;
   setContext(next);setContextFor(contextKey);setContextState("ready");
  }).catch(cause=>{
   if(cancelled)return;
   setContext(null);setContextFor(contextKey);
   setContextState(isTeacherOfficialAverageActivationPending(cause)?"pending":"error");
  });
  return ()=>{cancelled=true;};
 },[allowed,contextKey]);

 useEffect(()=>{
  if(!allowed||!choice||!picker?.assignment||!picker.period||!requestKey)return;
  const input={schoolId:choice.schoolId,periodId:choice.periodId,
   classId:choice.classId,subjectId:choice.subjectId};
  const expectedYearId=choice.schoolYearId;
  let cancelled=false;
  void getTeacherOfficialSubjectAverages(input).then(next=>{
   if(cancelled)return;
   if(next.schoolYearId!==expectedYearId)
    throw new Error("Année scolaire non conforme.");
   setPreview(next);setPreviewFor(requestKey);setPreviewState("ready");
  }).catch(cause=>{
   if(cancelled)return;
   setPreview(null);setPreviewFor(requestKey);
   setPreviewState(isTeacherOfficialAverageActivationPending(cause)?"pending":"error");
  });
  return ()=>{cancelled=true;};
 },[allowed,choice?.schoolId,choice?.schoolYearId,choice?.periodId,
   choice?.classId,choice?.subjectId,picker?.assignment,picker?.period,requestKey]);

 const rows=useMemo(()=>{
  if(!activePreview)return [];
  const q=query.trim().toLocaleLowerCase("fr-FR");
  return activePreview.students.filter(row=>{
   if(statusFilter!=="all"&&row.state!==statusFilter)return false;
   return !q||row.studentName.toLocaleLowerCase("fr-FR").includes(q);
  });
 },[activePreview,query,statusFilter]);
 const ready=activePreview?.students.filter(row=>row.state==="ready").length??0;
 const incomplete=activePreview?.students.filter(row=>row.state==="incomplete").length??0;
 const notConfigured=activePreview?.students.filter(row=>row.state==="not_configured").length??0;
 const pageCount=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 const displayedPage=Math.min(page,pageCount);
 const visibleRows=rows.slice((displayedPage-1)*PAGE_SIZE,displayedPage*PAGE_SIZE);

 function resetFilter(){setPage(1);setQuery("");setStatusFilter("all");}
 function changeSchool(schoolId:string){
  setSelection({schoolId});resetFilter();
 }
 function changeYear(schoolYearId:string){
  setSelection({schoolId:choice?.schoolId??"",schoolYearId});resetFilter();
 }
 function changeClass(classId:string){
  setSelection({schoolId:choice?.schoolId??"",
   schoolYearId:choice?.schoolYearId??"",classId,periodId:choice?.periodId??""});
  resetFilter();
 }
 function changeSubject(subjectId:string){
  setSelection({...choice,subjectId});resetFilter();
 }
 function changePeriod(periodId:string){
  setSelection({...choice,periodId});resetFilter();
 }
 function refresh(){
  setRevision(n=>n+1);resetFilter();
 }

 return <main className="space-y-5 pb-10">
  <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
    SCHOOLNET V2 · S4-C.3-B.2 · ESPACE ENSEIGNANT
   </p>
   <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
    <div>
     <h1 className="text-2xl font-extrabold text-slate-950 md:text-3xl">
      Moyennes officielles
     </h1>
     <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
      Prévisualisez les moyennes de <strong>votre matière</strong> pour les élèves
      de vos classes officiellement affectées, à partir des notes publiées.
     </p>
    </div>
    <Link className="sn-btn-ghost" to="/app/teacher/averages">
     ← Moyennes des cours libres
    </Link>
   </div>
   <p className="mt-4 rounded-xl border border-blue-100 bg-white/75 px-4 py-3 text-sm text-blue-900">
    <strong>Prévisualisation seulement.</strong> Aucune moyenne n'est publiée,
    aucun classement n'est établi et aucun bulletin n'est modifié depuis cette page.
   </p>
  </header>

  {!authLoading&&!allowed&&(
   <p role="alert" className="sn-card p-5 text-sm text-slate-700">
    Cet espace est réservé aux enseignants disposant d'un compte réel et habilité.
   </p>
  )}
  {authLoading&&<p className="sn-card p-5 text-sm text-slate-600" role="status">
   Vérification de votre compte…
  </p>}
  {allowed&&(
   <section className="sn-card space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <div>
      <h2 className="text-lg font-bold text-slate-950">Mes affectations officielles</h2>
      <p className="mt-1 text-sm text-slate-600">Choisissez un établissement, une classe, une matière et une période.</p>
     </div>
     <button type="button" className="sn-btn-ghost" onClick={refresh}>↻ Actualiser</button>
    </div>
    {contextFor!==contextKey&&(
     <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
      Vérification des affectations en cours…
     </p>
    )}
    {contextFor===contextKey&&contextState==="pending"&&(
     <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-bold text-amber-900">Activation SQL en attente</h3>
      <p className="mt-2 text-sm text-amber-900">
       Les fonctions sécurisées de prévisualisation C.3-B.2 ne sont pas encore installées
       sur cette base. Les données officielles restent masquées.
       Les moyennes des cours libres restent accessibles.
      </p>
     </div>
    )}
    {contextFor===contextKey&&contextState==="error"&&(
     <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
      Impossible de vérifier vos affectations. Vérifiez votre connexion ou vos droits ;
      aucune note n'est affichée.
     </p>
    )}
    {activeContext&&activeContext.assignments.length===0&&(
     <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      Aucune affectation officielle active. Contactez l'administrateur de votre établissement.
     </p>
    )}
    {picker&&picker.assignment&&(
     <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <label className="block space-y-2 text-sm font-semibold text-slate-700">
       <span>Établissement</span>
       <select className="sn-input w-full" value={choice?.schoolId??""}
        onChange={e=>changeSchool(e.target.value)}>
        {picker.schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
       </select>
      </label>
      <label className="block space-y-2 text-sm font-semibold text-slate-700">
       <span>Année scolaire</span>
       <select className="sn-input w-full" value={choice?.schoolYearId??""}
        onChange={e=>changeYear(e.target.value)}>
        {picker.years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}
       </select>
      </label>
      <label className="block space-y-2 text-sm font-semibold text-slate-700">
       <span>Classe</span>
       <select className="sn-input w-full" value={choice?.classId??""}
        onChange={e=>changeClass(e.target.value)}>
        {picker.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
       </select>
      </label>
      <label className="block space-y-2 text-sm font-semibold text-slate-700">
       <span>Matière enseignée</span>
       <select className="sn-input w-full" value={choice?.subjectId??""}
        onChange={e=>changeSubject(e.target.value)}>
        {picker.subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
       </select>
      </label>
      <label className="block space-y-2 text-sm font-semibold text-slate-700 sm:col-span-2 xl:col-span-1">
       <span>Période de notation</span>
       <select className="sn-input w-full" value={choice?.periodId??""}
        disabled={!picker.periods.length}
        onChange={e=>changePeriod(e.target.value)}>
        {picker.periods.length===0&&<option value="">Aucune période configurée</option>}
        {picker.periods.map(p=><option key={p.id} value={p.id}>
         {p.name} ({p.code})
        </option>)}
       </select>
      </label>
     </div>
    )}
    {picker?.assignment&&!picker.period&&(
     <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
      Aucune période de notation n'a encore été configurée pour cette année scolaire.
     </p>
    )}
   </section>
  )}
  {allowed&&picker?.assignment&&picker.period&&(
   <>
    {previewFor!==requestKey&&(
     <p role="status" className="sn-card p-5 text-sm text-slate-700">
      Lecture sécurisée des moyennes de la matière…
     </p>
    )}
    {previewFor===requestKey&&previewState==="pending"&&(
     <div className="sn-card p-5" role="status">
      <h2 className="font-bold text-amber-900">Calcul en attente d'activation SQL</h2>
      <p className="mt-2 text-sm text-slate-700">
       Le service des moyennes officielles n'est pas encore installé.
       Aucune moyenne estimée localement n'est affichée.
      </p>
     </div>
    )}
    {previewFor===requestKey&&previewState==="error"&&(
     <div className="sn-card p-5" role="alert">
      <h2 className="font-bold text-red-800">Prévisualisation indisponible</h2>
      <p className="mt-2 text-sm text-red-800">
       Données inaccessibles, accès révoqué ou réponse non conforme.
       Aucun résultat n'est conservé à l'écran.
      </p>
     </div>
    )}
    {activePreview&&(
     <>
      <div className="flex flex-wrap items-center justify-between gap-3">
       <div>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Période : {picker.period.name}</p>
        <h2 className="mt-1 text-lg font-bold text-slate-950">
         {picker.assignment.className} · {picker.assignment.subjectName}
        </h2>
        <p className="mt-1 text-xs text-slate-600">
         Coefficient de la matière : {activePreview.subjectCoefficient===null?
          "non configuré":activePreview.subjectCoefficient.toLocaleString("fr-FR")}
         {" · "} Résultats en lecture seule
        </p>
       </div>
       <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-800">
        Non publié
       </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
       <Stat title="Élèves concernés" value={activePreview.students.length}
        detail="Élèves autorisés de la classe"/>
       <Stat title="Moyennes calculables" value={ready}
        detail="Toutes les évaluations incluses sont publiées"/>
       <Stat title="Notes manquantes" value={incomplete}
        detail="Résultats encore incomplets"/>
       <Stat title="À paramétrer" value={notConfigured}
        detail="Coefficient ou évaluations manquants"/>
      </div>
      <section className="sn-card overflow-hidden">
       <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-5">
        <div>
         <h2 className="text-lg font-bold text-slate-950">Moyennes prévisionnelles de la matière</h2>
         <p className="mt-1 text-sm text-slate-600">
          Une note absente ou non publiée ne vaut jamais zéro. Seul un 0/20 publié est pris en compte.
         </p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
         <label className="block space-y-1 text-xs font-semibold text-slate-600">
          <span>Rechercher un élève</span>
          <input className="sn-input w-full sm:w-64" value={query}
           onChange={e=>{setQuery(e.target.value);setPage(1);}}
           placeholder="Nom de l'élève…" autoComplete="off"/>
         </label>
         <label className="block space-y-1 text-xs font-semibold text-slate-600">
          <span>Situation</span>
          <select className="sn-input w-full" value={statusFilter}
           onChange={e=>{setStatusFilter(e.target.value as StatusFilter);setPage(1);}}>
           <option value="all">Toutes les situations</option>
           <option value="ready">Calculable</option>
           <option value="incomplete">Notes manquantes</option>
           <option value="not_configured">À paramétrer</option>
          </select>
         </label>
        </div>
       </div>
       {rows.length===0?(
        <p className="p-8 text-center text-sm text-slate-600" role="status">
         {activePreview.students.length===0?
          "Aucun élève actuellement affecté à cette classe.":
          "Aucun élève ne correspond aux filtres sélectionnés."}
        </p>
       ):(
        <>
         <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[650px] w-full text-left text-sm">
           <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
             <th scope="col" className="px-5 py-4">Élève</th>
             <th scope="col" className="px-5 py-4">Évaluations publiées</th>
             <th scope="col" className="px-5 py-4">Situation</th>
             <th scope="col" className="px-5 py-4 text-right">Moyenne / 20</th>
            </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
            {visibleRows.map(row=><tr key={row.studentId}>
             <td className="px-5 py-4 font-semibold text-slate-900">{row.studentName}</td>
             <td className="px-5 py-4 text-slate-700">
              {row.publishedAssessments} / {row.includedAssessments}
             </td>
             <td className="px-5 py-4"><StateBadge state={row.state}/></td>
             <td className="px-5 py-4 text-right font-extrabold text-indigo-700">
              {row.state==="ready"?average(row.averageOn20):"—"}
             </td>
            </tr>)}
           </tbody>
          </table>
         </div>
         <div className="space-y-3 p-4 md:hidden">
          {visibleRows.map(row=><article key={row.studentId}
           className="rounded-xl border border-slate-200 p-4">
           <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold text-slate-950">{row.studentName}</p>
            <StateBadge state={row.state}/>
           </div>
           <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-xs text-slate-600">
             {row.publishedAssessments} / {row.includedAssessments} évaluations publiées
            </p>
            <p className="text-lg font-extrabold text-indigo-700">
             {row.state==="ready"?average(row.averageOn20):"—"}
            </p>
           </div>
          </article>)}
         </div>
         <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
          <p className="text-xs text-slate-600">
           {rows.length} résultat{rows.length>1?"s":""} · Page {displayedPage} sur {pageCount}
          </p>
          <div className="flex items-center gap-2">
           <button type="button" className="sn-btn-ghost"
            onClick={()=>setPage(n=>Math.max(1,n-1))} disabled={displayedPage<=1}>
            ← Précédent
           </button>
           <button type="button" className="sn-btn-ghost"
            onClick={()=>setPage(n=>Math.min(pageCount,n+1))} disabled={displayedPage>=pageCount}>
            Suivant →
           </button>
          </div>
         </div>
        </>
       )}
      </section>
      <p className="text-xs leading-5 text-slate-500">
       Ce tableau concerne uniquement la matière enseignée. La moyenne générale,
       les classements et la publication des bulletins restent hors de cette étape.
      </p>
     </>
    )}
   </>
  )}
 </main>;
}
