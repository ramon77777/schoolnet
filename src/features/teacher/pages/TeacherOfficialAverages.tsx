import {useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {getTeacherOfficialAveragesCatalog} from "@/features/teacher/lib/teacherOfficialAveragesCatalogApi";
import {
 isTeacherOfficialAveragesActivationPending,
 type TeacherOfficialAveragesAssignment,
 type TeacherOfficialAveragesCatalog,
} from "@/features/teacher/lib/teacherOfficialAveragesCatalogModel";
import {getTeacherOfficialSubjectAverages} from "@/features/teacher/lib/teacherOfficialAveragesApi";
import type {
 TeacherOfficialSubjectAverages,TeacherOfficialSubjectRow,
} from "@/features/teacher/lib/teacherOfficialAveragesModel";

type LoadingState="idle"|"loading"|"ready"|"pending"|"error";
type Option={id:string;label:string};
type IdField="schoolId"|"schoolYearId"|"classId"|"subjectId";
type LabelField="schoolName"|"schoolYearName"|"className"|"subjectName";
const selectClass="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100";
function options(
 rows:TeacherOfficialAveragesAssignment[],idField:IdField,labelField:LabelField,
):Option[]{
 const unique=new Map<string,string>();
 rows.forEach(row=>unique.set(row[idField],row[labelField]));
 return Array.from(unique,([id,label])=>({id,label}))
  .sort((a,b)=>a.label.localeCompare(b.label,"fr",{numeric:true}));
}
function choose(value:string,opts:Option[]):string{
 return opts.some(o=>o.id===value)?value:opts[0]?.id??"";
}
function displayScore(value:number|null):string{
 return value===null?"—":value.toLocaleString("fr-FR",{
  minimumFractionDigits:2,maximumFractionDigits:2,
 })+" / 20";
}
const statusMeta:Record<TeacherOfficialSubjectRow["state"],{label:string;className:string}>={
 ready:{label:"Calculable",className:"bg-emerald-50 text-emerald-800"},
 incomplete:{label:"Notes à compléter",className:"bg-amber-50 text-amber-800"},
 not_configured:{label:"Non paramétrée",className:"bg-slate-100 text-slate-700"},
};

/** C3-B.2 — No student records are fetched by the browser except via the guarded RPC.
 * This page is a teacher-only preview; it never creates or publishes a grade.
 */
export default function TeacherOfficialAverages(){
 const {user,loading:authLoading}=useAuth();
 const allowed=!authLoading&&!!user?.id&&!user.isDemo&&user.role==="teacher";
 const userId=allowed?(user?.id??""):"";
 const [catalog,setCatalog]=useState<TeacherOfficialAveragesCatalog|null>(null);
 const [catalogFor,setCatalogFor]=useState("");
 const [catalogState,setCatalogState]=useState<LoadingState>("idle");
 const [catalogRevision,setCatalogRevision]=useState(0);
 const [schoolId,setSchoolId]=useState("");
 const [yearId,setYearId]=useState("");
 const [classId,setClassId]=useState("");
 const [subjectId,setSubjectId]=useState("");
 const [periodId,setPeriodId]=useState("");
 const [search,setSearch]=useState("");
 const [previewRevision,setPreviewRevision]=useState(0);
 const [preview,setPreview]=useState<TeacherOfficialSubjectAverages|null>(null);
 const [previewFor,setPreviewFor]=useState("");
 const [previewState,setPreviewState]=useState<LoadingState>("idle");

 useEffect(()=>{
  if(!allowed||!userId)return;
  let cancelled=false;
  getTeacherOfficialAveragesCatalog().then(data=>{
   if(cancelled)return;
   setCatalog(data);setCatalogFor(userId);setCatalogState("ready");
  }).catch(cause=>{
   if(cancelled)return;
   setCatalog(null);setCatalogFor(userId);
   setCatalogState(isTeacherOfficialAveragesActivationPending(cause)?"pending":"error");
  });
  return()=>{cancelled=true;};
 },[allowed,userId,catalogRevision]);

 const currentCatalog=allowed&&catalogFor===userId&&catalogState==="ready"?catalog:null;
 const assignments=currentCatalog?.assignments??[];
 const schools=options(assignments,"schoolId","schoolName");
 const activeSchoolId=choose(schoolId,schools);
 const schoolAssignments=assignments.filter(a=>a.schoolId===activeSchoolId);
 const years=options(schoolAssignments,"schoolYearId","schoolYearName");
 const activeYearId=choose(yearId,years);
 const yearAssignments=schoolAssignments.filter(a=>a.schoolYearId===activeYearId);
 const classes=options(yearAssignments,"classId","className");
 const activeClassId=choose(classId,classes);
 const classAssignments=yearAssignments.filter(a=>a.classId===activeClassId);
 const subjects=options(classAssignments,"subjectId","subjectName");
 const activeSubjectId=choose(subjectId,subjects);
 const selectedAssignment=classAssignments.find(a=>a.subjectId===activeSubjectId)??null;
 const periods=[...(selectedAssignment?.periods??[])]
  .sort((a,b)=>a.startsOn.localeCompare(b.startsOn));
 const activePeriodId=choose(periodId,periods.map(p=>({id:p.id,label:p.name})));
 const period=periods.find(p=>p.id===activePeriodId)??null;
 const key=allowed&&selectedAssignment&&period&&currentCatalog?
  [userId,selectedAssignment.assignmentId,period.id,previewRevision].join("|"):"";

 useEffect(()=>{
  if(!allowed||!selectedAssignment||!period||!key)return;
  let cancelled=false;
  getTeacherOfficialSubjectAverages({
   schoolId:selectedAssignment.schoolId,
   classId:selectedAssignment.classId,
   subjectId:selectedAssignment.subjectId,
   periodId:period.id,
  }).then(result=>{
   if(cancelled)return;
   setPreview(result);setPreviewFor(key);setPreviewState("ready");
  }).catch(cause=>{
   if(cancelled)return;
   setPreview(null);setPreviewFor(key);
   setPreviewState(isTeacherOfficialAveragesActivationPending(cause)?"pending":"error");
  });
  return()=>{cancelled=true;};
 },[allowed,selectedAssignment,period,key]);

 const currentPreview=allowed&&previewState==="ready"&&previewFor===key?preview:null;
 const normalized=search.trim().toLocaleLowerCase("fr");
 const filteredRows=(currentPreview?.students??[]).filter(row=>
  !normalized||row.studentName.toLocaleLowerCase("fr").includes(normalized))
  .sort((a,b)=>a.studentName.localeCompare(b.studentName,"fr",{numeric:true}));
 const ready=currentPreview?.students.filter(row=>row.state==="ready").length??0;
 const incomplete=currentPreview?.students.filter(row=>row.state==="incomplete").length??0;
 const unconfigured=currentPreview?.students.filter(row=>row.state==="not_configured").length??0;

 function refresh(){
  setCatalogRevision(n=>n+1);
  setPreviewRevision(n=>n+1);
 }
 const locked=!allowed||catalogState!=="ready"||!selectedAssignment;
 const pendingCatalog=allowed&&catalogState==="pending";
 const pendingPreview=allowed&&previewState==="pending"&&!!key&&previewFor===key;
 const errorCatalog=allowed&&catalogState==="error";
 const errorPreview=allowed&&previewState==="error"&&!!key&&previewFor===key;

 return <main className="space-y-5 pb-10">
  <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div>
     <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">
      SCHOOLNET V2 · S4-C.3-B.2 · ENSEIGNANT
     </p>
     <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
      Moyennes officielles — prévisualisation
     </h1>
     <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
      Préparez la moyenne de votre matière pour les élèves des classes qui vous sont
      officiellement affectées. Seules les notes publiées et les évaluations
      incluses par votre établissement entrent dans le calcul.
     </p>
    </div>
    <Link className="sn-btn-ghost" to="/app/teacher/averages">
     ← Moyennes des cours libres
    </Link>
   </div>
  </header>

  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900" role="note">
   <strong>Prévisualisation uniquement.</strong> Ce calcul n'est ni une moyenne
   générale ni un bulletin publié. Il ne modifie aucune note. Les résultats
   restent confidentiels pour les élèves et parents tant qu'une étape distincte
   de publication n'a pas été validée.
  </div>

  {!authLoading&&!allowed&&
   <div role="alert" className="sn-card p-5 text-sm text-red-700">
    Connectez-vous avec un compte enseignant réel pour consulter ce module.
   </div>}
  {allowed&&<section className="sn-card p-5 space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <h2 className="font-semibold text-slate-900">Choisir ma classe et ma période</h2>
     <p className="mt-1 text-xs text-slate-500">
      Les listes présentent uniquement vos affectations scolaires actives.
     </p>
    </div>
    <button type="button" className="sn-btn-ghost" onClick={refresh}
     disabled={catalogState==="loading"}>↻ Actualiser</button>
   </div>
   {catalogState==="loading"||catalogState==="idle"?
    <div role="status" className="text-sm text-slate-600">
     Vérification de vos affectations et des périodes officielles…
    </div>:null}
   {pendingCatalog&&<div role="status"
    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
    <strong>Activation SQL en attente.</strong> Le catalogue officiel des enseignants
    n'est pas encore installé sur cette base. La page est prête, mais les données
    resteront indisponibles jusqu'à une autorisation distincte de déploiement SQL.
   </div>}
   {errorCatalog&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
    Impossible de vérifier vos affectations officielles. Réessayez après avoir
    contrôlé votre accès auprès de votre établissement.
   </div>}
   {currentCatalog&&assignments.length===0&&
    <div role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
     Aucune classe et matière ne vous sont actuellement affectées officiellement.
     Contactez votre établissement pour vérifier votre affectation.
    </div>}
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <label className="space-y-1 text-sm font-semibold text-slate-800">
     Établissement
     <select className={selectClass} value={activeSchoolId} disabled={locked}
      onChange={e=>{setSchoolId(e.target.value);setYearId("");setClassId("");setSubjectId("");setPeriodId("");setSearch("");}}>
      {schools.length===0?<option value="">Aucun établissement</option>:
       schools.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm font-semibold text-slate-800">
     Année scolaire
     <select className={selectClass} value={activeYearId} disabled={locked}
      onChange={e=>{setYearId(e.target.value);setClassId("");setSubjectId("");setPeriodId("");setSearch("");}}>
      {years.length===0?<option value="">Aucune année</option>:
       years.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm font-semibold text-slate-800">
     Classe
     <select className={selectClass} value={activeClassId} disabled={locked}
      onChange={e=>{setClassId(e.target.value);setSubjectId("");setPeriodId("");setSearch("");}}>
      {classes.length===0?<option value="">Aucune classe</option>:
       classes.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm font-semibold text-slate-800">
     Matière
     <select className={selectClass} value={activeSubjectId} disabled={locked}
      onChange={e=>{setSubjectId(e.target.value);setPeriodId("");setSearch("");}}>
      {subjects.length===0?<option value="">Aucune matière</option>:
       subjects.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm font-semibold text-slate-800">
     Période de notation
     <select className={selectClass} value={activePeriodId}
      disabled={locked||periods.length===0}
      onChange={e=>{setPeriodId(e.target.value);setSearch("");}}>
      {periods.length===0?<option value="">Aucune période</option>:
       periods.map(p=><option key={p.id} value={p.id}>
        {p.name} ({p.code})
       </option>)}
     </select>
    </label>
   </div>
   {currentCatalog&&selectedAssignment&&periods.length===0&&
    <div role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
     Aucune période de notation n'a encore été configurée pour cette année scolaire.
     L'administrateur de l'établissement doit la créer.
    </div>}
  </section>}

  {allowed&&selectedAssignment&&period&&<section className="space-y-4">
   {previewState==="loading"||previewState==="idle"||previewFor!==key?
    <div role="status" className="sn-card p-5 text-sm text-slate-600">
     Calcul sécurisé des moyennes de votre matière en cours…
    </div>:null}
   {pendingPreview&&<div role="status"
    className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
    <strong>Activation du calcul en attente.</strong> La RPC de prévisualisation
    n'est pas encore installée sur cette base. Aucun résultat n'est calculé
    dans le navigateur et aucune donnée fictive ne remplace les vraies notes.
   </div>}
   {errorPreview&&<div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
    Le calcul n'a pas pu être chargé. Votre affectation a peut-être changé
    ou l'accès a été refusé. Actualisez pour recontrôler vos droits.
   </div>}
   {currentPreview&&<>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
     {([
      ["Élèves de la classe",currentPreview.students.length,"text-slate-900"],
      ["Moyennes calculables",ready,"text-emerald-700"],
      ["Notes à compléter",incomplete,"text-amber-700"],
      ["Non paramétrées",unconfigured,"text-slate-700"],
     ] as const).map(([label,value,color])=>
      <div key={label} className="sn-card p-4 md:p-5">
       <p className="text-xs font-semibold text-slate-500">{label}</p>
       <p className={"mt-2 text-2xl font-extrabold "+color}>{value}</p>
      </div>)}
    </div>
    <section className="sn-card overflow-hidden">
     <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
      <div>
       <h2 className="font-bold text-slate-900">
        {selectedAssignment.className} · {selectedAssignment.subjectName}
       </h2>
       <p className="mt-1 text-sm text-slate-600">
        {period.name} · {selectedAssignment.schoolYearName} · Coefficient matière :
        {" "}{currentPreview.subjectCoefficient??"non défini"}
       </p>
      </div>
      <label className="block text-sm font-medium text-slate-700">
       Rechercher un élève
       <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="Nom de l'élève…"
        className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"/>
      </label>
     </div>
     <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
       <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <tr>
         <th scope="col" className="px-5 py-3">Élève</th>
         <th scope="col" className="px-5 py-3">Évaluations publiées</th>
         <th scope="col" className="px-5 py-3">Moyenne de matière</th>
         <th scope="col" className="px-5 py-3">État</th>
        </tr>
       </thead>
       <tbody className="divide-y divide-slate-100">
        {filteredRows.map(row=><tr key={row.studentId} className="hover:bg-slate-50">
         <td className="px-5 py-4 font-semibold text-slate-900">{row.studentName}</td>
         <td className="px-5 py-4 text-slate-700">
          {row.publishedAssessments} / {row.includedAssessments}
         </td>
         <td className="px-5 py-4 font-bold text-blue-700">
          {row.state==="ready"?displayScore(row.averageOn20):"—"}
         </td>
         <td className="px-5 py-4">
          <span className={"inline-flex rounded-full px-3 py-1 text-xs font-semibold "+
           statusMeta[row.state].className}>{statusMeta[row.state].label}</span>
         </td>
        </tr>)}
       </tbody>
      </table>
     </div>
     {filteredRows.length===0&&<p className="px-5 py-10 text-center text-sm text-slate-500">
      {currentPreview.students.length===0?
       "Aucun élève actuellement inscrit dans cette classe.":
       "Aucun élève ne correspond à cette recherche."}
     </p>}
     <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500">
      {filteredRows.length} élève(s) affiché(s). Une moyenne « calculable » reste
      une prévisualisation : aucune moyenne générale, aucun rang et aucune
      publication ne sont produits dans ce module.
     </div>
    </section>
   </>}
  </section>}
 </main>;
}
