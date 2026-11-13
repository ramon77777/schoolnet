// Admin-only SCHOOLNET student access, rollout guarded. No sandbox or DEV writes.
import {supabase} from '@/lib/supabaseClient';
const PROD='https://anttmbhaphkhmkoqsofd.supabase.co';
// Consultation des dossiers : disponible sur le projet principal uniquement.
 // L'API exige toujours un JWT d'Admin. La création est autorisée
 // exclusivement par SCHOOLNET_STUDENT_ACCOUNTS_ENABLED côté Edge Function.
export const studentNoEmailAdminEnabled =
  import.meta.env.PROD && import.meta.env.VITE_SUPABASE_URL === PROD;

export type StudentNoEmailStatus='not_prepared'|'reserved'|'auth_created'|'prepared'|
 'sent_declared'|'enabled'|'requires_review'|'revoked';
export type StudentNoEmailResponse={
 success:boolean;
 status:StudentNoEmailStatus;
 admin_enabled?:boolean;
 request_id?:string;
 student_id?:string|null;
 schoolnet_code?:string;
 family_phone?:string;
 invitation_url?:string;
 delivery_contact_email?:string;
 manual_delivery_only?:boolean;
 has_delivery?:boolean;
 is_activated?:boolean;
 parent_verified?:boolean;
 message?:string;
};
export type StudentAdminAction='inspect'|'prepare'|'declare_sent';

export async function studentNoEmailAdminAction(input:{
  action:StudentAdminAction;requestId:string;verified?:boolean;
  verificationNote?:string;deliveryConfirmed?:boolean;
}):Promise<StudentNoEmailResponse>{
 if(!studentNoEmailAdminEnabled)throw Error('MODE_PREVISUALISATION_SANS_ECRITURE');
 const {data,error}=await supabase.functions.invoke('schoolnet-student-no-email-admin',{
  body:{action:input.action,request_id:input.requestId,verified:input.verified??false,
   verification_note:input.verificationNote??'',delivery_confirmed:input.deliveryConfirmed??false},
 });
 const response=data as StudentNoEmailResponse|null;
 if(error||!response||response.success!==true)throw Error(
  response?.message || 'Service Apprenant sans e-mail indisponible.');
 return response;
}

export function formatStudentNoEmailMessage(p:StudentNoEmailResponse):string{
 if(!p.schoolnet_code||!p.family_phone||!p.invitation_url)throw Error('INVITATION_INCOMPLETE');
 return [
  'Objet : Votre accès Apprenant SCHOOLNET',
  '',
  'Bonjour,',
  'Après vérification par SCHOOLNET, voici les informations de première connexion de votre enfant.',
  `Téléphone familial : ${p.family_phone}`,
  `Identifiant SCHOOLNET : ${p.schoolnet_code}`,
  `Lien personnel pour créer son mot de passe : ${p.invitation_url}`,
  'Ce lien est personnel, temporaire et à usage unique. Ne le transmettez pas à un tiers.',
  'Après création du mot de passe, votre enfant se connectera avec son téléphone familial, son identifiant SCHOOLNET et son propre mot de passe.',
  'Le mot de passe du parent ne doit jamais être utilisé pour le compte Apprenant.',
 ].join('\n');
}