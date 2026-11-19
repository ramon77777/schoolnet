import { useEffect, useMemo, useState } from "react";
import {
  getTeacherSchoolCourseContext,
  linkTeacherSchoolCourse,
  unlinkTeacherSchoolCourse,
  isSchoolCourseBridgeActivationPending,
  SCHOOL_COURSE_PREVIEW_READ_ONLY,
} from "@/features/schools/lib/schoolCourseBridgeApi";
import { areSchoolAssignmentsReadOnly } from "@/features/schools/lib/schoolAssignmentWritePolicy";
import type { TeacherSchoolCourseContext } from "@/features/schools/lib/schoolCourseBridgeModel";

type OwnedCourse = {
  id:string;
  title:string;
  created_by:string;
  class_id:string|null;
  level_id:number|null;
  status:"active"|"archived";
};

export default function TeacherSchoolCourseLinker({
  userId,courses,
}:{
  userId:string;
  courses:OwnedCourse[];
}) {
  const [context,setContext]=useState<TeacherSchoolCourseContext|null>(null);
  const [loadedFor,setLoadedFor]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [assignmentId,setAssignmentId]=useState("");
  const [courseId,setCourseId]=useState("");
  const [busy,setBusy]=useState("");
  const [revision,setRevision]=useState(0);
  const readOnly=areSchoolAssignmentsReadOnly();
  const activeContext=loadedFor===userId?context:null;
  const selected=activeContext?.assignments.find(x=>x.assignmentId===assignmentId)??null;
  const assignedIds=new Set(activeContext?.links.map(x=>x.courseId)??[]);

  useEffect(()=>{
    if(!userId) return;
    let cancelled=false;
    void getTeacherSchoolCourseContext()
      .then(data=>{
        if(cancelled) return;
        setContext(data);setLoadedFor(userId);setError(null);
        setAssignmentId(previous=>data.assignments.some(a=>a.assignmentId===previous)
          ?previous:(data.assignments[0]?.assignmentId??""));
      })
      .catch(cause=>{
        if(cancelled) return;
        setContext(null);setLoadedFor(userId);
        setError(isSchoolCourseBridgeActivationPending(cause)
          ?"Le raccordement scolaire S4-B.1 est en préparation côté serveur. Les cours libres continuent de fonctionner."
          :"Vos affectations scolaires sont indisponibles ou votre accès n'est pas autorisé.");
      })
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[userId,revision]);

  const eligibleCourses=useMemo(()=>{
    if(!selected)return [];
    return courses.filter(c=>c.created_by===userId && c.status==="active"
      && (c.class_id===null || c.class_id===selected.classId)
      && !assignedIds.has(c.id));
  },[selected,courses,userId,activeContext]);

  async function handleLink(){
    if(!selected || !courseId || busy)return;
    setBusy("link");setError(null);setNotice("");
    try{
      await linkTeacherSchoolCourse(courseId,selected.assignmentId);
      setCourseId("");setNotice("Cours rattaché à votre affectation officielle. Les élèves n'y ont pas encore accès automatiquement.");
      setLoading(true);setRevision(n=>n+1);
    }catch{
      setError("Rattachement refusé. Vérifiez que ce cours vous appartient, n'a pas d'anciens apprenants inscrits et correspond à la classe/matière.");
    }finally{setBusy("");}
  }

  async function handleUnlink(id:string,title:string){
    if(busy || !window.confirm(`Retirer « ${title} » de l'affectation scolaire ? Le cours libre ne sera pas supprimé.`)) return;
    setBusy(id);setError(null);setNotice("");
    try{
      const done=await unlinkTeacherSchoolCourse(id);
      if(!done)throw new Error("Cours deja detache.");
      setNotice("Rattachement retiré. Le cours et ses ressources V1 sont conservés.");
      setLoading(true);setRevision(n=>n+1);
    }catch{
      setError("Impossible de retirer le rattachement. Vérifiez vos droits.");
    }finally{setBusy("");}
  }

  return (
    <section className="sn-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">
            SCHOOLNET V2 · S4-B.1
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Cours d'établissement</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Associez volontairement un cours existant à une classe et une matière
            qui vous sont officiellement affectées. Vos cours libres restent indépendants.
            Ce premier raccordement ne crée aucune inscription automatique d'élèves.
          </p>
        </div>
        <button type="button" className="sn-btn-ghost" onClick={()=>{
          setLoading(true);setRevision(n=>n+1);
        }} disabled={loading||Boolean(busy)}>↻ Actualiser</button>
      </div>
      {readOnly&&(
        <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          {SCHOOL_COURSE_PREVIEW_READ_ONLY}
        </p>
      )}
      {loading&&<p className="text-sm text-slate-600">Vérification des affectations officielles…</p>}
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {!loading&&activeContext&&(
        <>
          {activeContext.assignments.length===0?(
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              Aucune affectation officielle active pour votre compte. L'établissement
              doit d'abord vous rattacher à une classe et une matière.
            </div>
          ):(
            <div className="grid gap-3 lg:grid-cols-[1.4fr_1.4fr_auto] lg:items-end">
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Affectation officielle
                <select className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
                  value={assignmentId} onChange={e=>{setAssignmentId(e.target.value);setCourseId("");}}
                  disabled={Boolean(busy)}>
                  {activeContext.assignments.map(a=>(
                    <option key={a.assignmentId} value={a.assignmentId}>
                      {a.schoolName} · {a.className} · {a.subjectName} ({a.schoolYear})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-semibold text-slate-800">
                Mon cours existant
                <select className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
                  value={courseId} onChange={e=>setCourseId(e.target.value)}
                  disabled={Boolean(busy)}>
                  <option value="">Sélectionner un cours non rattaché</option>
                  {eligibleCourses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <button type="button" className="sn-btn-primary" disabled={readOnly||!selected||!courseId||Boolean(busy)}
                onClick={()=>void handleLink()}>
                {busy==="link"?"Rattachement…":"Rattacher"}
              </button>
            </div>
          )}
          <p className="text-xs leading-5 text-slate-500">
            Sécurité : le serveur refuse les cours d'un autre enseignant, d'un autre
            établissement, archivés, déjà inscrits dans l'ancien parcours ou incompatibles
            avec votre classe et matière.
          </p>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              Mes cours rattachés ({activeContext.links.length})
            </h3>
            {activeContext.links.length===0?(
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Aucun cours officiel rattaché pour l'instant.
              </p>
            ):activeContext.links.map(link=>(
              <article key={link.courseId} className="rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{link.courseTitle}</p>
                  <p className="text-xs text-slate-600">
                    {link.schoolName} · {link.className} · {link.subjectName} ({link.schoolYear})
                  </p>
                </div>
                <button type="button" className="sn-btn-ghost"
                  disabled={readOnly||Boolean(busy)}
                  onClick={()=>void handleUnlink(link.courseId,link.courseTitle)}>
                  {busy===link.courseId?"Retrait…":"Retirer le lien"}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
