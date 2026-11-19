import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getAdminSchools,getActiveSchoolAdmins,type SchoolRecord,
} from "@/features/schools/lib/schoolManagementApi";
import { filterSchoolsForLocalAdmin } from "@/features/schools/lib/schoolPedagogyOverview";
import {
  getSchoolCourseCatalog,isSchoolCourseBridgeActivationPending,
} from "@/features/schools/lib/schoolCourseBridgeApi";
import type { AdminSchoolCourseCatalog } from "@/features/schools/lib/schoolCourseBridgeModel";

export default function LocalSchoolCourses() {
  const {user,loading:authLoading}=useAuth();
  const canRead=Boolean(!authLoading&&user?.id&&!user.isDemo&&user.role==="school_admin");
  const [schools,setSchools]=useState<SchoolRecord[]>([]);
  const [schoolsFor,setSchoolsFor]=useState("");
  const [schoolId,setSchoolId]=useState("");
  const [schoolError,setSchoolError]=useState<string|null>(null);
  const [catalog,setCatalog]=useState<AdminSchoolCourseCatalog|null>(null);
  const [catalogFor,setCatalogFor]=useState("");
  const [catalogError,setCatalogError]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const visible=canRead&&schoolsFor===user?.id?schools:[];
  const selected=visible.find(s=>s.id===schoolId)??null;
  const requestKey=user?.id&&selected?user.id+"|"+schoolId+"|"+revision:"";

  useEffect(()=>{
    if(!canRead||!user?.id)return;
    let cancelled=false;
    void Promise.all([getAdminSchools(),getActiveSchoolAdmins()])
      .then(([list,members])=>{
        if(cancelled)return;
        const allowed=filterSchoolsForLocalAdmin(list,members,user.id);
        setSchools(allowed);setSchoolsFor(user.id);setSchoolError(null);
        setSchoolId(old=>allowed.some(s=>s.id===old)?old:(allowed[0]?.id??""));
      })
      .catch(()=>{
        if(cancelled)return;
        setSchools([]);setSchoolsFor(user.id);setSchoolId("");
        setSchoolError("Impossible de vérifier vos établissements autorisés.");
      });
    return ()=>{cancelled=true;};
  },[canRead,user?.id]);

  useEffect(()=>{
    if(!canRead||!selected||!requestKey)return;
    let cancelled=false;
    void getSchoolCourseCatalog(schoolId)
      .then(data=>{
        if(cancelled)return;
        if(data.schoolId!==schoolId)throw new Error("Catalogue hors établissement.");
        setCatalog(data);setCatalogFor(requestKey);setCatalogError(null);
      })
      .catch(cause=>{
        if(cancelled)return;
        setCatalog(null);setCatalogFor(requestKey);
        setCatalogError(isSchoolCourseBridgeActivationPending(cause)
          ?"La passerelle S4-B.1 n'est pas encore activée sur ce serveur. Les cours V1 restent indépendants."
          :"Catalogue inaccessible ou accès à cet établissement non autorisé.");
      });
    return ()=>{cancelled=true;};
  },[canRead,selected,schoolId,requestKey]);

  const current=catalogFor===requestKey&&catalog?.schoolId===schoolId?catalog:null;
  const loading=Boolean(canRead&&(!schoolsFor||schoolsFor!==user?.id||
    (selected&&catalogFor!==requestKey)));
  return (
    <main className="space-y-5 pb-10">
      <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
          SCHOOLNET · Gestion des établissements · S4-B.1
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
              Cours officiels
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 max-w-3xl">
              Répertoire des cours volontairement rattachés par les enseignants à
              leurs classes et matières officielles. Les cours libres SCHOOLNET
              et les inscriptions historiques ne sont pas importés.
            </p>
          </div>
          <Link to="/app/school/pedagogy" className="sn-btn-ghost">← Pilotage pédagogique</Link>
        </div>
      </header>
      {canRead&&(
        <section className="sn-card p-5 space-y-2">
          <label htmlFor="school-course-select" className="text-sm font-semibold text-slate-900">
            Établissement autorisé
          </label>
          <select id="school-course-select" value={schoolId}
            onChange={e=>setSchoolId(e.target.value)}
            disabled={!visible.length}
            className="block w-full max-w-lg rounded-xl border border-slate-200 bg-white p-3 text-sm">
            {visible.length===0&&<option value="">Aucun établissement autorisé</option>}
            {visible.map(s=><option key={s.id} value={s.id}>{s.name} — {s.code}</option>)}
          </select>
          {selected&&<p className="text-xs text-slate-500">Code : {selected.code}</p>}
          {schoolError&&<p role="alert" className="text-sm text-red-700">{schoolError}</p>}
        </section>
      )}
      {loading&&<p className="sn-card p-5 text-sm text-slate-600">Chargement des cours officiels autorisés…</p>}
      {!loading&&catalogError&&selected&&(
        <p role="alert" className="sn-card border border-amber-200 p-5 text-sm text-amber-900">
          {catalogError}
        </p>
      )}
      {!loading&&!schoolError&&canRead&&!selected&&(
        <p className="sn-card p-5 text-sm text-amber-800">Aucun établissement actif disponible.</p>
      )}
      {!loading&&current&&(
        <section className="sn-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Cours rattachés : {current.courses.length}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Lecture limitée à l'établissement sélectionné.
              </p>
            </div>
            <button type="button" className="sn-btn-ghost"
              onClick={()=>setRevision(n=>n+1)}>↻ Actualiser</button>
          </div>
          {current.courses.length===0?(
            <div className="rounded-xl bg-slate-50 p-5 space-y-2">
              <p className="font-semibold text-slate-900">Aucun cours officiel rattaché.</p>
              <p className="text-sm leading-6 text-slate-600">
                Affectez d'abord les enseignants à leurs classes et matières dans
                « Affectations ». Chaque enseignant pourra ensuite associer l'un de
                ses cours depuis « Mes cours » dans son propre espace SCHOOLNET.
                Aucune inscription élève ne sera créée automatiquement.
              </p>
              <Link to="/app/school/assignments" className="sn-btn-ghost inline-flex mt-2">
                Consulter les affectations
              </Link>
            </div>
          ):(
            <div className="grid gap-3 md:grid-cols-2">
              {current.courses.map(c=>(
                <article key={c.courseId} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-900">{c.courseTitle}</h3>
                  <p className="mt-2 text-sm text-slate-600">{c.className} · {c.schoolYear}</p>
                  <p className="mt-1 text-sm text-slate-600">Matière : {c.subjectName}</p>
                  <p className="mt-1 text-sm text-slate-600">Enseignant : {c.teacherName}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <p className="text-xs leading-5 text-slate-500">
        S4-B.1 lie uniquement des références de cours. L'accès des élèves,
        les ressources et les évaluations officielles seront sécurisés dans
        les étapes S4-B suivantes, sans modifier le parcours des cours libres.
      </p>
    </main>
  );
}
