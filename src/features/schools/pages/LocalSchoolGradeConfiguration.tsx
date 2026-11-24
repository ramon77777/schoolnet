import {useEffect,useMemo,useState,type FormEvent} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {getAdminSchools,getActiveSchoolAdmins,type SchoolRecord}
 from "@/features/schools/lib/schoolManagementApi";
import {filterSchoolsForLocalAdmin}
 from "@/features/schools/lib/schoolPedagogyOverview";
import {
 getSchoolGradeConfiguration,saveSchoolGradePeriod,lockSchoolGradePeriod,
 saveSchoolSubjectCoefficient,saveSchoolAssessmentCoefficient,
} from "@/features/schools/lib/schoolGradeConfigurationApi";
import {availablePeriods,validCoefficient,type SchoolGradeConfig,type SchoolGradePeriod}
 from "@/features/schools/lib/schoolGradeConfigurationModel";
import {periodKindFromCode,previewNextPeriodCode,suggestedPeriodName,
 type SchoolPeriodKind} from "@/features/schools/lib/schoolGradePeriodCodes";

type LoadState="idle"|"loading"|"ready"|"pending"|"error";
type PeriodDraft={kind:SchoolPeriodKind;name:string;startsOn:string;endsOn:string};
type AssessmentDraft={coefficient:string;include:boolean};
const empty:PeriodDraft={kind:"trimester",name:"",startsOn:"",endsOn:""};
function activationPending(cause:unknown):boolean{
 if(!cause||typeof cause!=="object")return false;
 const e=cause as {code?:unknown;message?:unknown;details?:unknown};
 const m=[e.message,e.details].filter((v):v is string=>typeof v==="string").join(" ").toLowerCase();
 return e.code==="PGRST202"||(
  m.includes("schoolnet_school_grading_configuration") &&
  (m.includes("schema cache")||m.includes("not find"))
 );
}
export default function LocalSchoolGradeConfiguration(){
 const {user,loading:authLoading}=useAuth();
 const allowed=Boolean(!authLoading&&user?.id&&!user.isDemo&&user.role==="school_admin");
 const [schools,setSchools]=useState<SchoolRecord[]>([]);
 const [schoolsFor,setSchoolsFor]=useState("");
 const [schoolId,setSchoolId]=useState("");
 const [schoolsError,setSchoolsError]=useState<string|null>(null);
 const [config,setConfig]=useState<SchoolGradeConfig|null>(null);
 const [configFor,setConfigFor]=useState("");
 const [state,setState]=useState<LoadState>("idle");
 const [revision,setRevision]=useState(0);
 const [yearId,setYearId]=useState("");
 const [periodId,setPeriodId]=useState("");
 const [editingPeriodId,setEditingPeriodId]=useState<string|null>(null);
 const [periodDraft,setPeriodDraft]=useState<PeriodDraft>(empty);
 const [subjectValues,setSubjectValues]=useState<Record<string,string>>({});
 const [assessmentValues,setAssessmentValues]=useState<Record<string,AssessmentDraft>>({});
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState<string|null>(null);
 const [actionError,setActionError]=useState<string|null>(null);
 const visibleSchools=allowed&&schoolsFor===user?.id?schools:[];
 const selectedSchool=visibleSchools.find(s=>s.id===schoolId)??null;
 const key=selectedSchool&&user?.id?user.id+"|"+schoolId+"|"+revision:"";
 const current=allowed&&state==="ready"&&configFor===key&&config?.schoolId===schoolId?config:null;
 const selectedYearId=current?.years.some(y=>y.id===yearId)?yearId:current?.years[0]?.id??"";
 const periods=useMemo(()=>current?availablePeriods(current,selectedYearId):[],[current,selectedYearId]);
 const selectedPeriod=periods.find(p=>p.id===periodId)??periods[0]??null;
 const subjects=current?.subjects.filter(s=>s.schoolYearId===selectedYearId)??[];
 const assessments=current?.assessments.filter(a=>a.schoolYearId===selectedYearId)??[];
 const year=current?.years.find(y=>y.id===selectedYearId)??null;
 const editingPeriod=periods.find(p=>p.id===editingPeriodId)??null;
 const previewCode=editingPeriod?.code??previewNextPeriodCode(periods,periodDraft.kind);
 const defaultName=suggestedPeriodName(periodDraft.kind,previewCode);

 useEffect(()=>{
  if(!allowed||!user?.id)return;
  let cancelled=false;
  void Promise.all([getAdminSchools(),getActiveSchoolAdmins()])
   .then(([all,members])=>{
    if(cancelled)return;
    const list=filterSchoolsForLocalAdmin(all,members,user.id);
    setSchools(list);setSchoolsFor(user.id);setSchoolsError(null);
    setSchoolId(old=>list.some(s=>s.id===old)?old:list[0]?.id??"");
   }).catch(()=>{
    if(cancelled)return;
    setSchools([]);setSchoolId("");setSchoolsFor(user.id);
    setSchoolsError("Impossible de vérifier les établissements autorisés.");
   });
  return()=>{cancelled=true;};
 },[allowed,user?.id]);
 useEffect(()=>{
  if(!allowed||!selectedSchool||!key)return;
  let cancelled=false;
  void getSchoolGradeConfiguration(selectedSchool.id).then(result=>{
   if(cancelled)return;
   setConfig(result);setConfigFor(key);setState("ready");
  }).catch(err=>{
   if(cancelled)return;
   setConfig(null);setConfigFor(key);
   setState(activationPending(err)?"pending":"error");
   console.error("[S4-C.3-A] school grading configuration unavailable",err);
  });
  return()=>{cancelled=true;};
 },[allowed,selectedSchool,key]);

 async function run(action:()=>Promise<unknown>,success:string){
  if(!current||!selectedSchool||busy)return;
  setBusy(true);setNotice(null);setActionError(null);
  try{
   await action();
   setNotice(success);
   setRevision(r=>r+1);
  }catch(err){
   console.error("[S4-C.3-A] configuration write refused",err);
   setActionError("Opération non enregistrée. Vérifiez les droits, les dates et le verrouillage de la période.");
  }finally{setBusy(false);}
 }
 function newPeriod(){
  setEditingPeriodId(null);
  setPeriodDraft(empty);
 }
 function editPeriod(p:SchoolGradePeriod){
  setEditingPeriodId(p.id);
  setPeriodDraft({kind:periodKindFromCode(p.code),name:p.name.trim(),startsOn:p.startsOn,endsOn:p.endsOn});
 }
 function submitPeriod(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!current||!selectedSchool||!year||busy)return;
  const name=(periodDraft.name||defaultName).trim();
  if(!previewCode||name.length<2){
   setActionError("Code automatique indisponible ou nom de période invalide.");return;
  }
  if(periodDraft.startsOn<year.startsOn||periodDraft.endsOn>year.endsOn||
    periodDraft.startsOn>periodDraft.endsOn){
   setActionError("Les dates doivent être comprises dans l'année scolaire.");return;
  }
  const input={schoolId:selectedSchool.id,periodId:editingPeriodId,schoolYearId:year.id,
   periodKind:periodDraft.kind,name,startsOn:periodDraft.startsOn,endsOn:periodDraft.endsOn};
  void run(async()=>{await saveSchoolGradePeriod(input);newPeriod();},"Période enregistrée.");
 }
 function confirmLock(p:SchoolGradePeriod){
  if(busy||p.isLocked||!selectedSchool)return;
  const ok=window.confirm("Verrouiller définitivement la période "+p.name+
   " ? Les coefficients et périodes associés ne pourront plus être modifiés dans C.3-A.");
  if(ok)void run(()=>lockSchoolGradePeriod(selectedSchool.id,p.id),"Période verrouillée.");
 }
 function saveSubject(classId:string,subjectId:string,fieldKey:string){
  if(!selectedSchool||!selectedPeriod)return;
  const existing=current?.subjectSettings.find(s=>s.periodId===selectedPeriod.id&&
   s.classId===classId&&s.subjectId===subjectId);
  const coefficient=Number(subjectValues[fieldKey]??existing?.coefficient??1);
  if(!validCoefficient(coefficient)){setActionError("Coefficient : valeur comprise entre 0,25 et 20, à deux décimales maximum.");return;}
  void run(()=>saveSchoolSubjectCoefficient({
   schoolId:selectedSchool.id,periodId:selectedPeriod.id,classId,subjectId,coefficient
  }),"Coefficient de matière enregistré.");
 }
 function saveAssessment(assessmentId:string,fieldKey:string){
  if(!selectedSchool||!selectedPeriod||!current)return;
  const row=current.assessments.find(a=>a.assessmentId===assessmentId);
  if(!row)return;
  const draft=assessmentValues[fieldKey];
  const coefficient=Number(draft?.coefficient??row.coefficient??1);
  const include=draft?.include??(row.periodId===selectedPeriod.id?row.includeInAverage:false);
  if(!validCoefficient(coefficient)){setActionError("Coefficient : valeur comprise entre 0,25 et 20, à deux décimales maximum.");return;}
  void run(()=>saveSchoolAssessmentCoefficient({
   schoolId:selectedSchool.id,periodId:selectedPeriod.id,assessmentId,coefficient,includeInAverage:include
  }),"Paramètres de l'évaluation enregistrés.");
 }
 return <main className="space-y-5 pb-10">
  <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
    SCHOOLNET V2 · S4-C.3-A · CONFIGURATION OFFICIELLE
   </p>
   <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
    <div>
     <h1 className="text-2xl font-extrabold text-slate-950 md:text-3xl">Périodes et coefficients</h1>
     <p className="mt-2 max-w-3xl text-sm text-slate-600">
      Préparez les périodes scolaires et les coefficients de votre établissement.
      Ce module ne calcule et ne publie aucune note.
     </p>
    </div>
    <Link to="/app/school/assessments" className="sn-btn-ghost">← Évaluations officielles</Link>
   </div>
  </header>
  {!authLoading&&!allowed&&<p role="alert" className="sn-card p-5">
   Espace réservé aux administrateurs d'établissement habilités.
  </p>}
  {allowed&&<section className="sn-card space-y-3 p-5">
   <label className="block max-w-xl space-y-2 text-sm font-semibold text-slate-700">
    <span>Établissement autorisé</span>
    <select className="sn-input w-full" value={selectedSchool?.id??""}
     disabled={!visibleSchools.length||busy}
     onChange={e=>{
      setSchoolId(e.target.value);setYearId("");setPeriodId("");
      newPeriod();setNotice(null);setActionError(null);
     }}>
     {!visibleSchools.length&&<option value="">Aucun établissement autorisé</option>}
     {visibleSchools.map(s=><option key={s.id} value={s.id}>{s.name} — {s.code}</option>)}
    </select>
   </label>
   {schoolsFor!==user?.id&&<p role="status">Vérification des habilitations…</p>}
   {schoolsError&&<p role="alert" className="text-red-700">{schoolsError}</p>}
   {schoolsFor===user?.id&&!selectedSchool&&!schoolsError&&
    <p role="status">Aucun établissement actif autorisé.</p>}
  </section>}
  {allowed&&selectedSchool&&configFor!==key&&
   <p role="status" className="sn-card p-5">Chargement des configurations scolaires…</p>}
  {allowed&&selectedSchool&&configFor===key&&state==="pending"&&
   <section role="status" className="sn-card p-5 text-amber-900">
    <h2 className="font-bold">Activation SQL en attente</h2>
    <p className="mt-2 text-sm">La proposition C.3-A n'est pas encore installée sur cette base.
     Aucune configuration ne peut être lue ou modifiée. Les modules V1 restent disponibles.</p>
   </section>}
  {allowed&&selectedSchool&&configFor===key&&state==="error"&&
   <p role="alert" className="sn-card p-5 text-red-700">
    Configuration indisponible ou droits révoqués. Aucun résultat ni coefficient estimé ne sera affiché.
   </p>}
  {current&&<div className="space-y-5">
   {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
   {actionError&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{actionError}</p>}
   <section className="sn-card space-y-3 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <h2 className="text-lg font-bold">Année scolaire</h2>
     <button type="button" disabled={busy} className="sn-btn-ghost"
      onClick={()=>setRevision(n=>n+1)}>↻ Actualiser</button>
    </div>
    {!current.years.length&&<p role="status" className="text-sm text-slate-600">
     Aucune classe officielle liée à cet établissement. Créez d'abord une classe scolaire autorisée.
    </p>}
    {!!current.years.length&&<select className="sn-input max-w-xl" value={selectedYearId}
     disabled={busy} aria-label="Année scolaire"
     onChange={e=>{setYearId(e.target.value);setPeriodId("");newPeriod();setActionError(null);}}>
     {current.years.map(y=><option key={y.id} value={y.id}>{y.name}</option>)}
    </select>}
    {year&&<p className="text-xs text-slate-500">Du {year.startsOn} au {year.endsOn} — barème cible : 20 points.</p>}
   </section>
   {year&&<section className="sn-card space-y-4 p-5">
    <div className="flex items-center justify-between gap-3">
     <h2 className="text-lg font-bold">Périodes de notation</h2>
     <span className="text-xs text-slate-500">{periods.length} période(s)</span>
    </div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
     {periods.map(p=><div key={p.id} className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap justify-between gap-2">
       <strong>{p.name.trim()} ({p.code})</strong>
       <span className={"text-xs font-semibold "+(p.isLocked?"text-amber-700":"text-slate-600")}>
        {p.isLocked?"Verrouillée":"Modifiable"}
       </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{p.startsOn} — {p.endsOn}</p>
      <div className="mt-3 flex flex-wrap gap-2">
       <button type="button" className="sn-btn-ghost" disabled={busy||p.isLocked}
        onClick={()=>editPeriod(p)}>Modifier</button>
       <button type="button" className="sn-btn-ghost" disabled={busy||p.isLocked}
        onClick={()=>confirmLock(p)}>Verrouiller</button>
      </div>
     </div>)}
    </div>
    {!periods.length&&<p role="status" className="text-sm text-slate-600">
     Aucune période : ajoutez un trimestre, un semestre ou une période adaptée à l'établissement.
    </p>}
    <form onSubmit={submitPeriod} className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
     <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-bold">{editingPeriodId?"Modifier la période":"Créer une période"}</h3>
      {editingPeriodId&&<button type="button" className="sn-btn-ghost" onClick={newPeriod}>Annuler</button>}
     </div>
     <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm"><span className="font-semibold">Type de période</span>
       <select className="sn-input w-full" value={periodDraft.kind}
        disabled={busy||Boolean(editingPeriodId)}
        onChange={e=>setPeriodDraft(d=>({...d,kind:e.target.value as SchoolPeriodKind,name:""}))}>
        <option value="trimester">Trimestre</option>
        <option value="semester">Semestre</option>
        <option value="custom">Personnalisée</option>
       </select>
      </label>
      <label className="space-y-1 text-sm"><span className="font-semibold">Code automatique</span>
       <input className="sn-input w-full bg-slate-100" readOnly aria-label="Code automatique"
        value={previewCode??"Numérotation épuisée"}/>
      </label>
      <label className="space-y-1 text-sm md:col-span-2"><span className="font-semibold">Nom de la période</span>
       <input required maxLength={90} className="sn-input w-full"
        value={periodDraft.name||defaultName}
        onChange={e=>setPeriodDraft(d=>({...d,name:e.target.value}))} disabled={busy}/>
      </label>
      <label className="space-y-1 text-sm"><span className="font-semibold">Date de début</span>
       <input required type="date" min={year.startsOn} max={year.endsOn} className="sn-input w-full"
        value={periodDraft.startsOn} onChange={e=>setPeriodDraft(d=>({...d,startsOn:e.target.value}))}
        disabled={busy}/>
      </label>
      <label className="space-y-1 text-sm"><span className="font-semibold">Date de fin</span>
       <input required type="date" min={year.startsOn} max={year.endsOn} className="sn-input w-full"
        value={periodDraft.endsOn} onChange={e=>setPeriodDraft(d=>({...d,endsOn:e.target.value}))}
        disabled={busy}/>
      </label>
     </div>
     <p className="text-xs text-slate-600">Le code affiché est une estimation : PostgreSQL attribue le code définitif
      pour cet établissement et cette année, sans permettre sa modification. Les périodes ne peuvent se chevaucher.
      Après verrouillage, aucune réouverture n'est disponible dans cette étape.</p>
     {!previewCode&&<p role="alert" className="text-xs text-amber-700">
      Tous les codes disponibles pour ce type sont utilisés. Choisissez une autre catégorie.
     </p>}
     <button type="submit" className="sn-btn-primary" disabled={busy||!previewCode}>
      {busy?"Enregistrement…":"Enregistrer la période"}
     </button>
    </form>
   </section>}
   {year&&periods.length>0&&<section className="sn-card space-y-4 p-5">
    <h2 className="text-lg font-bold">Configurer les coefficients</h2>
    <label className="block max-w-xl space-y-1 text-sm font-semibold">
     <span>Période à configurer</span>
     <select className="sn-input w-full" value={selectedPeriod?.id??""} disabled={busy}
      onChange={e=>{setPeriodId(e.target.value);setActionError(null);}}>
      {periods.map(p=><option key={p.id} value={p.id}>{p.name}{p.isLocked?" (verrouillée)":""}</option>)}
     </select>
    </label>
    {selectedPeriod?.isLocked&&<p role="status" className="text-sm text-amber-700">
     Période verrouillée : les configurations ci-dessous sont en lecture seule.
    </p>}
    <h3 className="font-bold">Coefficients des matières</h3>
    {!subjects.length&&<p role="status" className="text-sm text-slate-600">
     Aucune matière avec enseignant actuellement affecté dans cette année scolaire.
    </p>}
    <div className="grid gap-3 md:grid-cols-2">
     {subjects.map(s=>{
      const k=(selectedPeriod?.id??"")+"|"+s.classId+"|"+s.subjectId;
      const saved=current.subjectSettings.find(x=>x.periodId===selectedPeriod?.id&&
       x.classId===s.classId&&x.subjectId===s.subjectId);
      return <div key={k} className="rounded-xl border border-slate-200 p-4">
       <strong>{s.className} · {s.subjectName}</strong>
       <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 space-y-1 text-xs"><span>Coefficient</span>
         <input type="number" min="0.25" max="20" step="0.01" className="sn-input w-full"
          value={subjectValues[k]??String(saved?.coefficient??1)}
          onChange={e=>setSubjectValues(v=>({...v,[k]:e.target.value}))}
          disabled={busy||selectedPeriod?.isLocked}/>
        </label>
        <button type="button" className="sn-btn-primary"
         disabled={busy||!selectedPeriod||selectedPeriod.isLocked}
         onClick={()=>saveSubject(s.classId,s.subjectId,k)}>Enregistrer</button>
       </div>
      </div>;
     })}
    </div>
    <h3 className="font-bold">Coefficients des évaluations officielles</h3>
    <p className="text-xs text-slate-600">L'intégration à la moyenne est un choix explicite.
     Elle ne calcule ni ne publie une note à cette étape.</p>
    {!assessments.length&&<p role="status" className="text-sm text-slate-600">
     Aucune évaluation officielle active pour cette année scolaire.
    </p>}
    <div className="grid gap-3 md:grid-cols-2">
     {assessments.map(a=>{
      const k=(selectedPeriod?.id??"")+"|"+a.assessmentId;
      const existingHere=a.periodId===selectedPeriod?.id;
      const draft=assessmentValues[k];
      const input=draft?.coefficient??String(a.coefficient??1);
      const include=draft?.include??(existingHere?a.includeInAverage:false);
      return <div key={k} className="rounded-xl border border-slate-200 p-4">
       <h4 className="font-bold">{a.title}</h4>
       <p className="mt-1 text-xs text-slate-500">{subjects.find(s=>s.classId===a.classId&&
        s.subjectId===a.subjectId)?.className??"Classe"} · {subjects.find(s=>
        s.classId===a.classId&&s.subjectId===a.subjectId)?.subjectName??"Matière"}</p>
       {a.periodId&&!existingHere&&<p className="mt-2 text-xs text-amber-700">
        Cette évaluation est déjà rattachée à une autre période. Un déplacement sera contrôlé par le serveur.
       </p>}
       <div className="mt-3 flex flex-wrap gap-3">
        <label className="flex-1 space-y-1 text-xs"><span>Coefficient</span>
         <input type="number" min="0.25" max="20" step="0.01" className="sn-input w-full"
          value={input} disabled={busy||selectedPeriod?.isLocked}
          onChange={e=>setAssessmentValues(v=>({...v,[k]:{
           coefficient:e.target.value,include
          }}))}/>
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
         <input type="checkbox" checked={include} disabled={busy||selectedPeriod?.isLocked}
          onChange={e=>setAssessmentValues(v=>({...v,[k]:{
           coefficient:input,include:e.target.checked
          }}))}/>
         <span>Inclure dans la future moyenne</span>
        </label>
       </div>
       <button type="button" className="sn-btn-primary mt-3"
        disabled={busy||!selectedPeriod||selectedPeriod.isLocked}
        onClick={()=>saveAssessment(a.assessmentId,k)}>Enregistrer l'évaluation</button>
      </div>;
     })}
    </div>
   </section>}
  </div>}
 </main>;
}
