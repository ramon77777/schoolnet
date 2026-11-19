import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabaseClient';
import {useAuth} from '@/lib/auth/AuthProvider';
import {
 buildParentChildCards,linkedStudentIds,
 type ParentChildCard,type ParentClass,type ParentClassStudent,
 type ParentChildProfile,type ParentLinkRow,
} from '@/features/parent/lib/parentChildViews';

type ParentProfileRow={id:string;child_ids:string[]|null};

export default function ParentChildren(){
 const {user,loading:authLoading}=useAuth();
 const [children,setChildren]=useState<ParentChildCard[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [classLookupUnavailable,setClassLookupUnavailable]=useState(false);
 const [familyNeedsReview,setFamilyNeedsReview]=useState(false);
 // A late network response must not show another Parent's children after logout
 // or overwrite a more recent manual refresh.
 const generation=useRef(0);

 const loadChildren=useCallback(async()=>{
  const run=++generation.current;
  const current=()=>generation.current===run;
  if(!user||user.isDemo){
   if(current()){
    setChildren([]);setError(null);setClassLookupUnavailable(false);
    setFamilyNeedsReview(false);setLoading(false);
   }
   return;
  }
  setLoading(true);setError(null);
  setClassLookupUnavailable(false);setFamilyNeedsReview(false);
  try{
   // Read only the authenticated Parent's own profile.
   const {data:parentData,error:parentError}=await supabase.from('profiles')
    .select('id,child_ids').eq('id',user.id).eq('role','parent').maybeSingle();
   if(parentError)throw parentError;
   if(!parentData)throw Error('PROFIL_PARENT_ABSENT');
   const parent=parentData as ParentProfileRow;

   // Canonical membership: existing parent_links records, filtered by JWT/RLS.
   // Never fetch student profiles based on child_ids alone.
   const {data:linkData,error:linkError}=await supabase.from('parent_links')
    .select('student_id').eq('parent_id',user.id);
   if(linkError)throw linkError;
   const links=(linkData??[]) as ParentLinkRow[];
   const studentIds=linkedStudentIds(links);
   if(studentIds.length===0){
    if(current()){
     setChildren([]);setFamilyNeedsReview((parent.child_ids??[]).length>0);
    }
    return;
   }

   const {data:profileData,error:profileError}=await supabase.from('profiles')
    .select('id,full_name,role').in('id',studentIds).eq('role','student');
   if(profileError)throw profileError;
   const studentProfiles=(profileData??[]) as ParentChildProfile[];

   // A family relationship is valid even before class assignment.
   // An unavailable class query must not hide the child's verified profile.
   let classStudents:ParentClassStudent[]=[];
   let classes:ParentClass[]=[];
   let unavailable=false;
   const studentsResponse=await supabase.from('class_students')
    .select('student_id,class_id,created_at').in('student_id',studentIds)
    .order('created_at',{ascending:false});
   if(studentsResponse.error){
    unavailable=true;
   }else{
    classStudents=(studentsResponse.data??[]) as ParentClassStudent[];
    const classIds=[...new Set(classStudents.map(row=>row.class_id))];
    if(classIds.length>0){
     const classResponse=await supabase.from('classes')
      .select('id,name').in('id',classIds);
     if(classResponse.error)unavailable=true;
     else classes=(classResponse.data??[]) as ParentClass[];
    }
   }
   const result=buildParentChildCards({
    links,parentChildIds:parent.child_ids,profiles:studentProfiles,
    classStudents,classes,classLookupUnavailable:unavailable,
   });
   if(current()){
    setChildren(result.children);
    setClassLookupUnavailable(unavailable);
    setFamilyNeedsReview(
     result.linksMissingFromParentProfile>0||result.linkedProfilesNotVisible>0,
    );
   }
  }catch(err){
   if(current()){
    setError(err instanceof Error&&err.message==='PROFIL_PARENT_ABSENT'
     ? 'Le profil Parent associé à votre compte est introuvable.'
     : 'Impossible de charger les enfants liés à ce compte.');
    setChildren([]);
   }
  }finally{
   if(current())setLoading(false);
  }
 },[user]);

 useEffect(()=>{
  if(authLoading)return;
  void loadChildren();
  return ()=>{generation.current+=1;};
 },[authLoading,loadChildren]);

 const isLoading=authLoading||loading;
 return <div className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h1 className="text-xl font-semibold text-slate-950">Mes enfants</h1>
    <p className="mt-1 text-sm text-gray-500">
     Retrouvez les enfants rattachés à votre compte Parent / Tuteur, même avant leur affectation à une classe.
    </p>
   </div>
   {!isLoading&&!user?.isDemo&&
    <button type="button" className="sn-btn-ghost"
     disabled={loading} onClick={()=>void loadChildren()}>Actualiser</button>}
  </div>
  {user?.isDemo&&<div className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
   Mode démo actif : les données réelles ne sont pas chargées.
  </div>}
  {isLoading&&<div className="grid gap-4 md:grid-cols-2" aria-label="Chargement des enfants">
   {Array.from({length:2}).map((_,i)=><div key={i}
     className="sn-card animate-pulse space-y-4 p-5" aria-hidden="true">
     <div className="flex items-center gap-4"><div className="h-12 w-12 rounded-full bg-gray-200"/>
      <div className="flex-1 space-y-2"><div className="h-4 w-1/2 rounded bg-gray-200"/>
       <div className="h-3 w-1/3 rounded bg-gray-100"/></div></div>
     <div className="h-12 rounded-xl bg-gray-100"/>
    </div>)}
  </div>}
  {!isLoading&&error&&<div role="alert" className="sn-card border border-red-200 bg-red-50 p-5">
   <p className="font-medium text-red-700">Chargement impossible</p>
   <p className="mt-1 text-sm text-red-600">{error}</p>
   <button type="button" className="sn-btn-ghost mt-4"
    onClick={()=>void loadChildren()}>Réessayer</button>
  </div>}
  {!isLoading&&!error&&familyNeedsReview&&
   <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
    Certains rattachements familiaux nécessitent une vérification administrative.
    Les enfants affichés ci-dessous proviennent uniquement des liens autorisés pour votre compte.
   </div>}
  {!isLoading&&!error&&classLookupUnavailable&&
   <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
    Les enfants restent consultables, mais les informations de classe sont temporairement indisponibles.
    Vous pouvez réessayer avec « Actualiser ».
   </div>}
  {!isLoading&&!error&&!user?.isDemo&&children.length===0&&
   <div className="sn-card p-8 text-center">
    <p className="text-base font-semibold">Aucun enfant lié</p>
    <p className="mt-2 text-sm text-gray-500">
     Aucun profil Apprenant n'est actuellement rattaché à ce compte Parent.
    </p>
   </div>}
  {!isLoading&&!error&&children.length>0&&<>
   <p className="text-sm text-slate-500" aria-live="polite">
    {children.length} {children.length>1?'enfants rattachés':'enfant rattaché'}
   </p>
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {children.map(child=><article key={child.id} className="sn-card sn-card-hover p-5">
     <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-600"
       aria-hidden="true">{child.name.charAt(0).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
       <h2 className="truncate text-base font-semibold text-slate-950" title={child.name}>{child.name}</h2>
       <p className="mt-1 break-words text-sm text-slate-600">{child.classLabel}</p>
       <div className="mt-3 flex flex-wrap gap-2">
        <span className="sn-badge sn-badge-green">Rattaché au parent</span>
        {child.classState==='unassigned'&&
         <span className="sn-badge border border-amber-200 bg-amber-50 text-amber-800">Classe à affecter</span>}
        {child.classState==='unavailable'&&
         <span className="sn-badge border border-slate-200 bg-slate-100 text-slate-700">Classe à vérifier</span>}
       </div>
      </div>
     </div>
     <div className="mt-5 rounded-xl bg-gray-50 p-4">
      <p className="text-xs text-gray-500">
       {child.classState==='assigned'?'Dernière classe connue (année non confirmée)':'Affectation scolaire'}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{child.classLabel}</p>
      {child.classState==='assigned'&&
       <p className="mt-2 text-xs leading-5 text-slate-500">
        Cette classe est historique : elle ne confirme pas une inscription active pour l'année scolaire en cours.
       </p>}
      {child.classState==='unassigned'&&
       <p className="mt-2 text-xs leading-5 text-slate-500">
        Le rattachement familial est indépendant de l'affectation dans une classe.
       </p>}
     </div>
    </article>)}
   </div>
  </>}
 </div>;
}
