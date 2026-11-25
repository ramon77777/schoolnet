import {useEffect,useState} from "react";
import {useSearchParams} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {supabase} from "@/lib/supabaseClient";
import {getTeacherOfficialAveragesCatalog}
 from "@/features/teacher/lib/teacherOfficialAveragesCatalogApi";
import {countTeacherLegacyAverageClasses,selectTeacherAverageSpace,type TeacherAverageTab}
 from "@/features/teacher/lib/teacherAveragesHubModel";
import TeacherAverages from "./TeacherAverages";
import TeacherOfficialAverages from "./TeacherOfficialAverages";

type Snapshot={
 ownerId:string;revision:number;status:"ready"|"error";
 officialCount:number;legacyCount:number;
};
const empty:Snapshot={ownerId:"",revision:-1,status:"ready",officialCount:0,legacyCount:0};
const optionButton=(active:boolean)=>
 "rounded-xl px-4 py-3 text-sm font-semibold transition-colors "+
 (active?"bg-blue-600 text-white shadow-sm":
 "bg-slate-50 text-slate-700 hover:bg-slate-100");

/** One menu entry with two independent teacher-scoped data sources.
 * No permission decisions depend on client filtering: backend RPCs stay authoritative.
 */
export default function TeacherAveragesHub(){
 const {user,loading:authLoading}=useAuth();
 const ownerId=!authLoading&&user?.role==="teacher"&&!user.isDemo?user.id:"";
 const [searchParams,setSearchParams]=useSearchParams();
 const [revision,setRevision]=useState(0);
 const [snapshot,setSnapshot]=useState<Snapshot>(empty);

 useEffect(()=>{
  if(!ownerId)return;
  let cancelled=false;
  void Promise.all([
   getTeacherOfficialAveragesCatalog(),
   supabase.rpc("teacher_average_classes"),
  ]).then(([official,legacy])=>{
   if(legacy.error)throw legacy.error;
   const legacyCount=countTeacherLegacyAverageClasses(legacy.data);
   if(cancelled)return;
   setSnapshot({ownerId,revision,status:"ready",
    officialCount:official.assignments.length,legacyCount});
  }).catch(()=>{
   if(cancelled)return;
   setSnapshot({ownerId,revision,status:"error",officialCount:0,legacyCount:0});
  });
  return()=>{cancelled=true;};
 },[ownerId,revision]);

 const current=ownerId&&snapshot.ownerId===ownerId&&snapshot.revision===revision?snapshot:null;
 const selection=current?.status==="ready"?
  selectTeacherAverageSpace(
   current.officialCount,current.legacyCount,searchParams.get("tab")):null;
 const isDual=selection?.layout==="dual";
 const activeTab=selection?.tab;
 const switchTab=(tab:TeacherAverageTab)=>{
  const params=new URLSearchParams(searchParams);
  params.set("tab",tab);
  setSearchParams(params,{replace:true});
 };
 if(authLoading||(Boolean(ownerId)&&!current)){
  return <section role="status" aria-busy="true" className="sn-card p-6 text-sm text-slate-600">
   Vérification de vos classes et affectations autorisées…
  </section>;
 }
 if(!ownerId){
  return <section role="alert" className="sn-card p-6 text-sm text-slate-700">
   Connectez-vous avec un compte enseignant réel pour accéder aux moyennes.
  </section>;
 }
 if(current?.status==="error"){
  return <section role="alert" className="sn-card space-y-3 p-6">
   <h1 className="text-xl font-bold text-slate-900">Moyennes indisponibles</h1>
   <p className="text-sm text-slate-700">
    Impossible de vérifier les cours libres et les affectations officielles.
    Aucun accès n'est supposé sans confirmation du serveur.
   </p>
   <button type="button" className="sn-btn-ghost" onClick={()=>setRevision(n=>n+1)}>
    ↻ Réessayer
   </button>
  </section>;
 }
 if(!selection||selection.layout==="empty"){
  return <section className="sn-card space-y-3 p-6" role="status">
   <h1 className="text-xl font-bold text-slate-900">Mes moyennes</h1>
   <p className="text-sm text-slate-600">
    Aucune classe V1 ni affectation officielle active pour ce compte.
    Vérifiez vos cours libres ou contactez votre établissement.
   </p>
   <button type="button" className="sn-btn-ghost" onClick={()=>setRevision(n=>n+1)}>
    ↻ Actualiser les affectations
   </button>
  </section>;
 }
 return <div className="space-y-5 pb-8">
  {isDual&&<>
   <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
     <div>
      <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">
       SCHOOLNET · ESPACE ENSEIGNANT
      </p>
      <h1 className="mt-2 text-2xl font-extrabold text-slate-950">Mes moyennes</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">
       Les moyennes officielles et celles des cours libres sont indépendantes.
       Sélectionnez le contexte à consulter.
      </p>
     </div>
     <button type="button" className="sn-btn-ghost"
      onClick={()=>setRevision(n=>n+1)}>↻ Actualiser</button>
    </div>
   </header>
   <div role="tablist" aria-label="Types de moyennes" className="sn-card flex flex-wrap gap-2 p-2">
    <button type="button" role="tab" id="teacher-official-averages-tab"
     aria-selected={activeTab==="official"}
     aria-controls="teacher-averages-panel"
     onClick={()=>switchTab("official")} className={optionButton(activeTab==="official")}>
     🏫 Établissements ({current?.officialCount??0})
    </button>
    <button type="button" role="tab" id="teacher-free-averages-tab"
     aria-selected={activeTab==="free"}
     aria-controls="teacher-averages-panel"
     onClick={()=>switchTab("free")} className={optionButton(activeTab==="free")}>
     📘 Cours libres / historiques ({current?.legacyCount??0})
    </button>
   </div>
  </>}
  <div id={isDual?"teacher-averages-panel":undefined}
   role={isDual?"tabpanel":undefined}
   aria-labelledby={isDual?(activeTab==="official"?
    "teacher-official-averages-tab":"teacher-free-averages-tab"):undefined}>
   {activeTab==="official"?
    <TeacherOfficialAverages embedded/>:
    <TeacherAverages/>}
  </div>
 </div>;
}
