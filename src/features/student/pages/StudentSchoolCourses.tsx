import {useCallback,useEffect,useState} from "react";
import {Link} from "react-router-dom";
import {useAuth} from "@/lib/auth/AuthProvider";
import {
  getStudentSchoolCourses,isStudentSchoolCoursesPending,
} from "@/features/student/lib/studentSchoolCoursesApi";
import type {StudentSchoolCourseCatalog} from "@/features/student/lib/studentSchoolCoursesModel";

export default function StudentSchoolCourses(){
  const {user,loading:authLoading}=useAuth();
  const allowed=!authLoading&&!!user&&!user.isDemo&&user.role==="student";
  const [data,setData]=useState<StudentSchoolCourseCatalog|null>(null);
  const [owner,setOwner]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(n=>n+1),[]);
  useEffect(()=>{
    if(authLoading)return;
    if(!allowed||!user){
      setData(null);setOwner("");setError(null);setLoading(false);
      return;
    }
    let cancelled=false;
    setLoading(true);setError(null);
    void getStudentSchoolCourses()
      .then(result=>{
        if(cancelled)return;
        setData(result);setOwner(user.id);
      })
      .catch(cause=>{
        if(cancelled)return;
        setData(null);setOwner(user.id);
        setError(isStudentSchoolCoursesPending(cause)
          ?"Les cours officiels de votre établissement ne sont pas encore activés sur ce serveur."
          :"Impossible d'afficher les cours de votre classe. Vérifiez votre affectation auprès de l'établissement.");
      })
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[authLoading,allowed,user?.id,revision]);
  const catalog=allowed&&owner===user?.id?data:null;
  return (
    <main className="space-y-5 pb-10">
      <section className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
          SCHOOLNET V2 · Espace apprenant · S4-B.2
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950">
              Cours de mon établissement
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 max-w-3xl">
              Retrouvez les cours des classes auxquelles votre établissement vous a officiellement
              affecté. Vos cours libres SCHOOLNET restent disponibles séparément.
            </p>
          </div>
          <Link to="/app/student/courses" className="sn-btn-ghost">
            ← Mes cours libres
          </Link>
        </div>
      </section>
      <section className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Mes cours officiels {catalog?`(${catalog.courses.length})`:""}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Seuls les cours des affectations actives sont affichés.
            </p>
          </div>
          <button type="button" className="sn-btn-ghost"
            onClick={refresh} disabled={loading||!allowed}>↻ Actualiser</button>
        </div>
        {user?.isDemo&&(
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
            Connectez-vous avec un compte apprenant réel pour consulter les cours officiels.
          </p>
        )}
        {(authLoading||loading)&&(
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Chargement des cours autorisés…
          </p>
        )}
        {!loading&&!authLoading&&error&&(
          <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        )}
        {!loading&&!error&&catalog?.courses.length===0&&(
          <div className="rounded-xl bg-slate-50 p-5 space-y-2">
            <p className="font-semibold text-slate-900">Aucun cours officiel pour l'instant.</p>
            <p className="text-sm leading-6 text-slate-600">
              L'administration doit d'abord vous rattacher à une classe officielle.
              L'enseignant doit ensuite associer son cours à la matière de cette classe.
              Aucune inscription à un cours libre n'est requise.
            </p>
          </div>
        )}
        {!loading&&!error&&!!catalog&&catalog.courses.length>0&&(
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalog.courses.map(course=>(
              <article key={course.courseId}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{course.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {course.schoolName} · {course.className} · {course.schoolYear}
                  </p>
                  <p className="mt-1 text-sm font-medium text-indigo-700">{course.subjectName}</p>
                </div>
                {course.description&&(
                  <p className="text-sm text-slate-600 line-clamp-3">{course.description}</p>
                )}
                <Link className="sn-btn-primary block text-center"
                  to={`/app/student/school-courses/${course.courseId}`}>
                  Voir les chapitres et ressources
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="text-xs text-slate-500">
        Les inscriptions et la progression des cours libres V1 ne sont pas modifiées.
      </p>
    </main>
  );
}
