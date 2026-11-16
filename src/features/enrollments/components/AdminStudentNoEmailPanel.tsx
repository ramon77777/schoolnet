import {useEffect,useState} from 'react';
import {studentNoEmailAdminEnabled,studentNoEmailAdminAction,formatStudentNoEmailMessage,
 type StudentNoEmailResponse} from '@/features/enrollments/lib/adminStudentNoEmailApi';

type RequestInfo={
 id:string;reference:string;student_full_name:string;student_email:string|null;
 request_type:string;guardian_email:string|null;
};
export default function AdminStudentNoEmailPanel({request}:{request:RequestInfo}){
 const [inspection,setInspection]=useState<StudentNoEmailResponse|null>(null);
 const [draft,setDraft]=useState<StudentNoEmailResponse|null>(null);
 const [note,setNote]=useState('');
 const [verified,setVerified]=useState(false);
 const [delivered,setDelivered]=useState(false);
 const [busy,setBusy]=useState(false);
 const [inspecting,setInspecting]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);
 const eligible=request.request_type==='student_enrollment'&&!request.student_email;
 useEffect(()=>{
  let cancelled=false;
  setDraft(null);setInspection(null);setMessage(null);setError(null);
  setVerified(false);setDelivered(false);setNote('');
  if(!eligible||!studentNoEmailAdminEnabled)return;
  setInspecting(true);
  void studentNoEmailAdminAction({action:'inspect',requestId:request.id})
   .then(result=>{if(!cancelled)setInspection(result);})
   .catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'Vérification indisponible.');})
   .finally(()=>{if(!cancelled)setInspecting(false);});
  return ()=>{cancelled=true;};
 },[request.id,eligible]);
 if(!eligible)return null;
 async function act(action:'inspect'|'prepare'|'declare_sent'){
  if(busy||!studentNoEmailAdminEnabled)return;
  if(action==='prepare'&&!window.confirm('Préparer un compte Apprenant sans e-mail personnel, uniquement après vérification du Parent activé ?'))return;
  if(action==='declare_sent'&&!window.confirm('Confirmez-vous la remise réelle du lien personnel et du code SCHOOLNET à la famille vérifiée ?'))return;
  setBusy(true);setError(null);setMessage(null);
  try{
   const result=await studentNoEmailAdminAction({action,requestId:request.id,
    verified,verificationNote:note,deliveryConfirmed:delivered});
   if(action==='prepare'){setDraft(result);setMessage('Invitation préparée. Copiez et transmettez le message avant de déclarer la remise.');}
   if(action==='declare_sent'){
    setDraft(null);setDelivered(false);
    setMessage('Remise enregistrée. Le mot de passe sera défini par l’enfant ; la première connexion pourra ensuite activer son accès.');
   }
   setInspection(result);
  }catch(e){setError(e instanceof Error?e.message:'Action indisponible.');}
  finally{setBusy(false);}
 }
 async function copyInvitation(){
  if(!draft)return;
  try{await navigator.clipboard.writeText(formatStudentNoEmailMessage(draft));
   setMessage('Message personnel copié. Transmettez-le uniquement au contact Parent/Tuteur vérifié.');}
  catch{setError('Copie impossible : utilisez un navigateur sécurisé.');}
 }
 const status=inspection?.status??null;
 const statusLabels:Record<StudentNoEmailResponse['status'],string>={
  not_prepared:'Compte à préparer',reserved:'Création en cours',
  auth_created:'Compte créé, invitation en cours',prepared:'Invitation prête',
  sent_declared:'Invitation transmise',enabled:'Compte activé',
  requires_review:'Vérification technique nécessaire',revoked:'Accès révoqué'
 };
 return <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4" aria-label="Accès Apprenant sans e-mail">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="text-sm font-bold text-indigo-900">Accès Apprenant sans e-mail</div>
    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-800">
     {inspecting?'Vérification…':status?statusLabels[status]:'À vérifier'}
    </span>
   </div>
   <p className="text-xs leading-5 text-slate-600">
    Compte individuel de {request.student_full_name}, distinct de celui du Parent.
   </p>
  {!studentNoEmailAdminEnabled ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
   Prévisualisation locale uniquement. Aucun compte ni lien ne sera généré depuis cet environnement.
  </div> : <>
   <button type="button" disabled={busy||inspecting} onClick={()=>void act('inspect')}
    className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-800">
    {busy||inspecting?'Vérification…':'Actualiser la vérification'}</button>
   <details className="rounded-lg border border-indigo-100 bg-white text-xs">
    <summary className="cursor-pointer px-3 py-2 font-semibold text-slate-600">Diagnostic technique</summary>
    <p className="px-3 pb-3 text-slate-600">État serveur : {status??'chargement'}. Le serveur contrôle toutes les mutations.</p>
   </details>
   {status==='not_prepared' && inspection && !inspection.admin_enabled && <p role="status"
     className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
     Dossier consultable, mais création des comptes désactivée par le serveur.
     Contactez l'administrateur technique avant de préparer une invitation.
   </p>}
   {status==='not_prepared' && inspection?.admin_enabled === true && <div className="space-y-3">
    <label className="block text-xs font-semibold text-slate-700">Note de vérification Parent–Enfant (10 caractères minimum)
     <textarea rows={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}
      className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" />
    </label>
    <label className="flex items-start gap-2 text-xs text-slate-700">
     <input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} />
     J’ai vérifié le dossier familial et l’identité du parent déjà activé.
    </label>
    <button type="button" disabled={busy||!verified||note.trim().length<10}
     onClick={()=>void act('prepare')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
     Préparer le compte et le lien</button>
   </div>}
   {draft?.invitation_url && <div className="space-y-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs">
    <p className="font-semibold text-emerald-800">Code et lien générés une seule fois, uniquement pour le parent vérifié.</p>
    <p>Destinataire manuel : <strong>{draft.delivery_contact_email}</strong></p>
    <button type="button" onClick={()=>void copyInvitation()} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">Copier le message sécurisé</button>
    <label className="flex items-start gap-2"><input type="checkbox" checked={delivered} onChange={e=>setDelivered(e.target.checked)} />
     J’ai réellement transmis le message à la famille.</label>
    <button type="button" onClick={()=>void act('declare_sent')} disabled={!delivered||busy||!verified||note.trim().length<10}
     className="rounded-lg bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-50">Déclarer la remise</button>
   </div>}
   {status==='enabled' && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
    {inspection?.family_linked===true
     ? 'Compte activé et lien familial confirmé. L’affectation à une classe reste indépendante.'
     : 'Compte activé. Le rattachement familial reste à vérifier dans « Famille & finalisation ».'}
   </p>}
   {status==='requires_review' && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Vérification technique nécessaire. Ne relancez pas la création du compte.</p>}
  </>}
  {message&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{message}</p>}
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
 </section>;
}