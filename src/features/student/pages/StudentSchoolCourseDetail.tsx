import {useCallback,useEffect,useMemo,useState} from "react";
import {Link,useParams} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {
  getStudentSchoolCourseDetail,isStudentSchoolCoursesPending,
} from "@/features/student/lib/studentSchoolCoursesApi";
import {safeSchoolResourceUrl,type StudentSchoolResource,
  type StudentSchoolCourseDetail as CourseDetail,
} from "@/features/student/lib/studentSchoolCoursesModel";

function resourceType(type:string):string {
  const types:Record<string,string>={pdf:"PDF",video:"Vidéo",link:"Lien",
    file:"Fichier",word:"Word",powerpoint:"PowerPoint"};
  return types[type]??"Ressource";
}
function SchoolResourceCard({resource}:{resource:StudentSchoolResource}){
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 break-words">{resource.title}</p>
        <p className="mt-1 text-xs text-slate-500">{resourceType(resource.type)}</p>
      </div>
      <button type="button" className="sn-btn-primary"
        onClick={()=>{
          if(safeSchoolResourceUrl(resource.url))
            window.open(resource.url,"_blank","noopener,noreferrer");
        }}>
        Ouvrir
      </button>
    </div>
  );
}
export default function StudentSchoolCourseDetail(){
  const {courseId}=useParams<{courseId:string}>();
  const {user,loading:authLoading}=useAuth();
  const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="student";
  const [detail,setDetail]=useState<CourseDetail|null>(null);
  const [loadedKey,setLoadedKey]=useState("");
  const userId=user?.id??"";
  const canRequest=allowed&&Boolean(courseId);
  const [error,setError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const key=`${userId}|${courseId??""}`;
  const loading=authLoading||(canRequest&&loadedKey!==key);
  const refresh=useCallback(()=>{setLoadedKey("");setRevision(n=>n+1);},[]);
  useEffect(()=>{
    if(authLoading||!canRequest||!courseId)return;
    let cancelled=false;
    void getStudentSchoolCourseDetail(courseId)
      .then(result=>{if(cancelled)return;setDetail(result);setLoadedKey(key);setError(null);})
      .catch(cause=>{
        if(cancelled)return;
        setDetail(null);setLoadedKey(key);
        setError(isStudentSchoolCoursesPending(cause)
          ?"Le détail des cours officiels n'est pas encore activé sur ce serveur."
          :"Ce cours n'est plus disponible pour votre classe ou votre accès a été révoqué.");
      })
      ;
    return ()=>{cancelled=true;};
  },[authLoading,canRequest,courseId,key,revision]);
  const current=canRequest&&loadedKey===key?detail:null;
  const general=useMemo(()=>current?.resources.filter(r=>r.sectionId===null)??[],[current]);
  return (
    <main className="space-y-5 pb-10">
      <section className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
              SCHOOLNET V2 · Cours officiel
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-slate-950">
              {current?.title??"Cours de mon établissement"}
            </h1>
            {current&&(
              <p className="mt-2 text-sm text-slate-600">
                {current.schoolName} · {current.className} · {current.schoolYear} · {current.subjectName}
              </p>
            )}
            {current?.description&&(
              <p className="mt-2 text-sm text-slate-600 max-w-3xl">{current.description}</p>
            )}
          </div>
          <Link to="/app/student/school-courses" className="sn-btn-ghost">
            ← Mes cours officiels
          </Link>
        </div>
      </section>
      {(!authLoading&&allowed)&&(
        <div className="flex justify-end">
          <button type="button" className="sn-btn-ghost" disabled={loading}
            onClick={refresh}>↻ Actualiser</button>
        </div>
      )}
      {(loading||authLoading)&&(
        <p className="sn-card p-5 text-sm text-slate-600">Vérification des droits et du contenu…</p>
      )}
      {!loading&&!authLoading&&error&&(
        <p className="sn-card border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {!loading&&!error&&current&&(
        <section className="space-y-4">
          {current.sections.length===0&&current.resources.length===0&&(
            <p className="sn-card p-5 text-sm text-slate-600">
              L'enseignant n'a pas encore publié de chapitre ni de ressource visible pour ce cours.
            </p>
          )}
          {current.sections.map(section=>{
            const resources=current.resources.filter(x=>x.sectionId===section.id);
            return (
              <div key={section.id} className="sn-card p-5 space-y-3">
                <div>
                  <h2 className="font-bold text-lg text-slate-900">{section.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">{resources.length} ressource(s)</p>
                </div>
                {resources.length===0?(
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                    Aucune ressource publiée dans ce chapitre.
                  </p>
                ):(
                  <div className="grid gap-3 md:grid-cols-2">
                    {resources.map(r=><SchoolResourceCard key={r.id} resource={r}/>)}
                  </div>
                )}
              </div>
            );
          })}
          {general.length>0&&(
            <div className="sn-card p-5 space-y-3">
              <h2 className="text-lg font-bold text-slate-900">Ressources générales</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {general.map(r=><SchoolResourceCard key={r.id} resource={r}/>)}
              </div>
            </div>
          )}
        </section>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Les ressources existantes peuvent pointer vers des liens publics ou externes.
        Ne partagez pas de données scolaires sensibles dans ces fichiers.
      </p>
    </main>
  );
}
