import {useEffect,useMemo,useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {getStudentOfficialDashboard} from "@/features/student/lib/studentOfficialDashboardApi";
import {EMPTY_OFFICIAL_DASHBOARD,type StudentOfficialDashboard} from "@/features/student/lib/studentOfficialDashboardModel";

/** Le parcours officiel reste distinct des cours libres V1. */
export default function StudentOfficialDashboardSummary(){
 const {user,loading:authLoading}=useAuth();
 const navigate=useNavigate();
 const [data,setData]=useState<StudentOfficialDashboard>(EMPTY_OFFICIAL_DASHBOARD);
 const [loadedFor,setLoadedFor]=useState("");
 const [error,setError]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="student";
 const userId=user?.id??"";
 useEffect(()=>{
  if(authLoading)return;
  if(!allowed)return;
  let cancelled=false;
  void getStudentOfficialDashboard().then(result=>{
   if(cancelled)return;
   setData(result);setError(null);setLoadedFor(userId);
  }).catch(cause=>{
   if(cancelled)return;
   console.error("[StudentOfficialDashboardSummary] read error:",cause);
   setData(EMPTY_OFFICIAL_DASHBOARD);
   setError("Le suivi des cours officiels est temporairement indisponible.");
   setLoadedFor(userId);
  });
  return ()=>{cancelled=true;};
 },[authLoading,allowed,userId,revision]);
 const stats=useMemo(()=>{
  const completed=data.assessments.filter(a=>["submitted","graded","published"].includes(a.status)).length;
  const published=data.assessments.filter(a=>a.status==="published"&&a.score!==null&&a.maxScore!==null&&a.maxScore>0);
  return {
   completed,pending:data.assessments.length-completed,published:published.length,
   quiz:data.assessments.filter(a=>a.type==="quiz").length,
   homework:data.assessments.filter(a=>a.type==="assignment").length,
   exam:data.assessments.filter(a=>a.type==="exam").length,
   successMean:published.length?Math.round(published.reduce((sum,a)=>sum+(a.score!/a.maxScore!)*100,0)/published.length):null,
  };
 },[data]);
 if(!allowed)return null;
 const loading=loadedFor!==userId;
 return <section className="sn-card p-5 sm:p-6 space-y-5" aria-label="Suivi scolaire officiel">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">SCHOOLNET V2 · S4-B.3-B.4</p>
    <h2 className="text-xl font-bold text-slate-900 mt-1">Mes cours et résultats officiels</h2>
    <p className="text-sm text-gray-500 mt-1">Suivi de ma classe, distinct des cours libres historiques.</p>
   </div>
   <button className="sn-btn-ghost" type="button" onClick={()=>{setLoadedFor("");setRevision(n=>n+1);}}>↻ Actualiser</button>
  </div>
  {loading&&<p role="status" className="text-sm text-gray-600">Chargement des données officielles…</p>}
  {!loading&&error&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
  {!loading&&!error&&<>
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {[
     {label:"Cours officiels",value:data.courses.length},
     {label:"Évaluations terminées",value:stats.completed},
     {label:"À faire",value:stats.pending},
     {label:"Résultats publiés",value:stats.published},
    ].map(x=><div className="rounded-xl bg-indigo-50/60 p-3" key={x.label}>
      <p className="text-2xl font-bold text-indigo-900">{x.value}</p>
      <p className="text-xs text-gray-600">{x.label}</p>
    </div>)}
   </div>
   <p className="text-sm text-gray-600">Répartition : {stats.quiz} quiz · {stats.homework} devoir(s) · {stats.exam} examen(s).
    {stats.successMean===null?" Aucun résultat chiffré publié.":
     " Moyenne des résultats publiés : "+stats.successMean+" % (indicateur non trimestriel)."}
   </p>
   {data.courses.length===0&&<p className="text-sm text-gray-500">Aucun cours officiel accessible pour le moment.</p>}
   <div className="grid gap-3 md:grid-cols-2">
    {data.courses.map(course=>{
     const items=data.assessments.filter(a=>a.courseId===course.courseId);
     const completed=items.filter(a=>["submitted","graded","published"].includes(a.status)).length;
     return <div key={course.courseId} className="rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="font-semibold text-slate-900">{course.title}</p>
      <p className="text-xs text-gray-600">{course.schoolName} · {course.className} · {course.subjectName}</p>
      <p className="text-sm">{completed} / {items.length} évaluation(s) terminée(s)</p>
      <button className="sn-btn-primary" type="button"
       onClick={()=>navigate("/app/student/school-courses/"+course.courseId)}>Ouvrir le cours officiel</button>
     </div>;
    })}
   </div>
   {data.assessments.length>0&&<div className="space-y-2">
    <h3 className="font-semibold text-slate-900">Évaluations officielles</h3>
    {data.assessments.map(a=><button key={a.assessmentId} type="button"
      className="w-full flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-left hover:bg-blue-50/50"
      onClick={()=>navigate("/app/student/school-courses/"+a.courseId+"/assessments/"+a.assessmentId+"/take")}>
      <span className="text-sm font-medium">{a.title}</span>
      <span className="text-xs text-gray-600">{a.status==="published"
       ?"Résultat publié : "+a.score+" / "+a.maxScore
       :a.status==="graded"?"Copie corrigée, résultat non publié"
       :a.status==="submitted"?"Copie remise"
       :a.status==="in_progress"?"En cours":"À faire"}</span>
     </button>)}
   </div>}
   <p className="text-xs text-gray-500">Le taux de réussite aux évaluations ne remplace pas une moyenne scolaire officielle.</p>
  </>}
 </section>;
}
