import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {getAdminSchools,getActiveSchoolAdmins,type SchoolRecord}
 from "@/features/schools/lib/schoolManagementApi";
import {filterSchoolsForLocalAdmin} from "@/features/schools/lib/schoolPedagogyOverview";
import {getSchoolAssessmentSupervision} from "@/features/schools/lib/schoolAssessmentSupervisionApi";
import {
 filterSupervision,supervisionTotals,type SchoolAssessmentSupervision,
 type SupervisionFilters,type SchoolAssessmentSupervisionRow,
} from "@/features/schools/lib/schoolAssessmentSupervisionModel";

const initialFilters:SupervisionFilters={
 schoolYearId:"",classId:"",subjectId:"",teacherId:"",type:"",status:"",search:"",
};
type LoadState="idle"|"loading"|"ready"|"error";
function SelectFilter({label,value,options,onChange}:{
 label:string;value:string;options:Array<{value:string;label:string}>;
 onChange:(v:string)=>void;
}){
 return <label className="space-y-1 text-xs font-semibold text-slate-600">
  <span>{label}</span>
  <select className="sn-input w-full" value={value} onChange={e=>onChange(e.target.value)}>
   <option value="">Tous</option>
   {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
 </label>;
}
function options(rows:SchoolAssessmentSupervisionRow[],key:keyof SchoolAssessmentSupervisionRow,label:keyof SchoolAssessmentSupervisionRow){
 return [...new Map(rows.map(r=>[String(r[key]),String(r[label])])).entries()]
  .sort((a,b)=>a[1].localeCompare(b[1],"fr"))
  .map(([value,text])=>({value,label:text}));
}
const category=(v:string)=>v==="quiz"?"Quiz":v==="assignment"?"Devoir":v==="exam"?"Examen":v;
export default function LocalSchoolAssessmentSupervision(){
 const {user,loading:authLoading}=useAuth();
 const canRead=Boolean(!authLoading&&user?.id&&!user.isDemo&&user.role==="school_admin");
 const [schools,setSchools]=useState<SchoolRecord[]>([]);
 const [schoolsFor,setSchoolsFor]=useState("");
 const [schoolId,setSchoolId]=useState("");
 const [schoolsError,setSchoolsError]=useState<string|null>(null);
 const [payload,setPayload]=useState<SchoolAssessmentSupervision|null>(null);
 const [payloadFor,setPayloadFor]=useState("");
 const [state,setState]=useState<LoadState>("idle");
 const [error,setError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const [filters,setFilters]=useState<SupervisionFilters>(initialFilters);
 const visibleSchools=canRead&&schoolsFor===user?.id?schools:[];
 const selected=visibleSchools.find(s=>s.id===schoolId)??null;
 const key=selected&&user?.id?user.id+"|"+schoolId+"|"+revision:"";

 useEffect(()=>{
  if(!canRead||!user?.id)return;
  let cancelled=false;
  void Promise.all([getAdminSchools(),getActiveSchoolAdmins()])
   .then(([all,members])=>{
    if(cancelled)return;
    const allowed=filterSchoolsForLocalAdmin(all,members,user.id);
    setSchools(allowed);setSchoolsFor(user.id);setSchoolsError(null);
    setSchoolId(old=>allowed.some(s=>s.id===old)?old:(allowed[0]?.id??""));
   }).catch(()=>{
    if(cancelled)return;
    setSchools([]);setSchoolId("");setSchoolsFor(user.id);
    setSchoolsError("Impossible de vérifier les établissements autorisés.");
   });
  return ()=>{cancelled=true;};
 },[canRead,user?.id]);

 useEffect(()=>{
  if(!canRead||!selected||!key)return;
  let cancelled=false;
  void getSchoolAssessmentSupervision(selected.id)
   .then(result=>{
    if(cancelled)return;
    setPayload(result);setPayloadFor(key);setState("ready");setError(null);
   }).catch(cause=>{
    if(cancelled)return;
    console.error("[S4-B.3-C.2] assessment supervision failed:",cause);
    setPayload(null);setPayloadFor(key);setState("error");
    setError("Suivi indisponible, accès révoqué ou fonction C.2 non encore activée. Aucun total ne peut être affiché.");
   });
  return ()=>{cancelled=true;};
 },[canRead,selected,key]);

 const current=canRead&&payloadFor===key&&state==="ready"&&payload?.schoolId===selected?.id
  ?payload:null;
 const pending=Boolean(selected&&payloadFor!==key);
 const filtered=useMemo(()=>current?filterSupervision(current.assessments,filters):[],
  [current,filters]);
 const totals=useMemo(()=>supervisionTotals(filtered),[filtered]);
 const update=(part:Partial<SupervisionFilters>)=>setFilters(old=>({...old,...part}));
 const allowed=canRead&&!user?.isDemo;
 return <main className="space-y-5 pb-10">
  <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
   <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
    SCHOOLNET V2 · S4-B.3-C.2 · Établissement
   </p>
   <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
    <div>
     <h1 className="text-2xl font-extrabold text-slate-950 md:text-3xl">Suivi des évaluations officielles</h1>
     <p className="mt-2 max-w-3xl text-sm text-slate-600">
      Consultez les évaluations et le volume de copies dans votre établissement, sans accéder aux notes individuelles.
     </p>
    </div>
    <Link className="sn-btn-ghost" to="/app/school/pedagogy">← Pilotage pédagogique</Link>
   </div>
  </header>
  {user?.isDemo&&<p role="status" className="sn-card p-5 text-amber-800">La démonstration ne donne pas accès aux données réelles.</p>}
  {allowed&&<section className="sn-card p-5 space-y-3">
   <label htmlFor="c2-school" className="text-sm font-semibold text-slate-800">Établissement autorisé</label>
   <select id="c2-school" className="sn-input block w-full md:max-w-xl" value={selected?.id??""}
    disabled={!visibleSchools.length} onChange={e=>{setSchoolId(e.target.value);setFilters(initialFilters);}}>
    {!visibleSchools.length&&<option value="">Aucun établissement autorisé</option>}
    {visibleSchools.map(s=><option value={s.id} key={s.id}>{s.name} — {s.code}</option>)}
   </select>
   {!schoolsFor||schoolsFor!==user?.id?<p role="status">Vérification des droits de votre compte…</p>:null}
   {schoolsError&&<p role="alert" className="text-sm text-red-700">{schoolsError}</p>}
   {schoolsFor===user?.id&&!selected&&!schoolsError&&<p>Aucun établissement actif autorisé.</p>}
  </section>}
  {allowed&&pending&&<p role="status" className="sn-card p-5 text-slate-600">Chargement du suivi officiel sécurisé…</p>}
  {allowed&&selected&&payloadFor===key&&state==="error"&&
   <p role="alert" className="sn-card border border-amber-200 bg-amber-50 p-5 text-amber-900">{error}</p>}
  {current&&<section className="space-y-5">
   <div className="sn-card p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <div>
      <h2 className="text-lg font-bold">Évaluations : {filtered.length}</h2>
      <p className="text-xs text-slate-500">Les filtres s'appliquent aux indicateurs et à la liste.</p>
     </div>
     <button className="sn-btn-ghost" type="button" onClick={()=>setRevision(n=>n+1)}>↻ Actualiser</button>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
     <SelectFilter label="Année scolaire" value={filters.schoolYearId}
      options={options(current.assessments,"schoolYearId","schoolYear")}
      onChange={v=>update({schoolYearId:v})}/>
     <SelectFilter label="Classe" value={filters.classId}
      options={options(current.assessments,"classId","className")}
      onChange={v=>update({classId:v})}/>
     <SelectFilter label="Matière" value={filters.subjectId}
      options={options(current.assessments,"subjectId","subjectName")}
      onChange={v=>update({subjectId:v})}/>
     <SelectFilter label="Enseignant" value={filters.teacherId}
      options={options(current.assessments,"teacherId","teacherName")}
      onChange={v=>update({teacherId:v})}/>
     <SelectFilter label="Type" value={filters.type}
      options={[{value:"quiz",label:"Quiz"},{value:"assignment",label:"Devoir"},{value:"exam",label:"Examen"}]}
      onChange={v=>update({type:v})}/>
     <SelectFilter label="État de l'évaluation" value={filters.status}
      options={[...new Set(current.assessments.map(a=>a.status))].map(v=>({value:v,label:v}))}
      onChange={v=>update({status:v})}/>
    </div>
    <label className="block space-y-1 text-xs font-semibold text-slate-600">
     <span>Rechercher une évaluation</span>
     <input className="sn-input w-full" type="search" value={filters.search}
      onChange={e=>update({search:e.target.value})}
      placeholder="Titre, matière, cours, enseignant…" />
    </label>
    <button type="button" className="sn-btn-ghost"
     onClick={()=>setFilters(initialFilters)}>Effacer les filtres</button>
   </div>
   <section aria-label="Compteurs des copies" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {[
     {label:"En cours",value:totals.inProgress},
     {label:"À corriger",value:totals.submitted},
     {label:"Corrigées non publiées",value:totals.graded},
     {label:"Publiées",value:totals.published},
    ].map(x=><article key={x.label} className="sn-card p-5">
      <p className="text-xs font-semibold uppercase text-slate-500">{x.label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums">{x.value}</p>
    </article>)}
   </section>
   <section className="sn-card p-5 space-y-3">
    <h2 className="text-lg font-bold text-slate-900">Évaluations officielles</h2>
    {!current.assessments.length&&<p role="status" className="text-sm text-slate-600">
      Aucune évaluation officiellement rattachée dans cet établissement.
    </p>}
    {current.assessments.length>0&&!filtered.length&&<p role="status" className="text-sm text-slate-600">
      Aucun résultat pour les filtres sélectionnés.
    </p>}
    <div className="grid gap-3 lg:grid-cols-2">
     {filtered.map(a=><article className="rounded-xl border border-slate-200 p-4" key={a.assessmentId}>
      <div className="flex justify-between gap-3">
       <h3 className="font-bold text-slate-900">{a.title}</h3>
       <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700">{category(a.type)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">{a.status} · {a.schoolYear}</p>
      <p className="mt-2 text-sm text-slate-700">{a.className} · {a.subjectName}</p>
      <p className="text-sm text-slate-600">{a.courseTitle} · {a.teacherName}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
       {[["En cours",a.inProgress],["À corriger",a.submitted],["Corrigées",a.graded],["Publiées",a.published]]
        .map(([label,value])=><div className="rounded-lg bg-slate-50 p-2" key={label}>
         <p className="font-bold text-slate-900">{value}</p><p className="text-slate-600">{label}</p>
        </div>)}
      </div>
     </article>)}
    </div>
   </section>
  </section>}
  <p className="text-xs text-slate-500">Lecture seule · Aucun accès aux réponses, aux appréciations ni aux notes personnelles.</p>
 </main>;
}
