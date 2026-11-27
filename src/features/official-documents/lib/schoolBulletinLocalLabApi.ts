import { supabase } from "@/lib/supabaseClient";
import type { GeneralScope } from "@/features/schools/lib/schoolOfficialGeneralAveragesModel";
import {
  S4D3L_SUPABASE_LOCAL_URL, isLabSchoolAdmin, isS4D3LLocalLab,
} from "./schoolBulletinLocalLabGuard";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record=(v:unknown):v is Record<string,unknown> =>
  v!==null && typeof v==="object" && !Array.isArray(v);
const validInt=(v:unknown):v is number => typeof v==="number" &&
  Number.isSafeInteger(v)&&v>=1;
const asUuid=(v:unknown):v is string => typeof v==="string"&&uuid.test(v);
const maybeUuid=(v:unknown):v is string|null => v===null||asUuid(v);

export type LabCaseState="draft"|"submitted"|"correction_requested"|"refused"|
  "approved"|"authorized_for_publication"|"published"|"withdrawn";
export type LabCapability="submit"|"decide"|"authorize_publication";
export type LabAction="review_submitted"|"approval_granted"|"approval_refused"|
  "correction_requested"|"publication_authorized";

export type LabEvent={
  action:string; actorId:string; fromState:string; toState:string;
  version:number; reason:string|null; createdAt:string;
};
export type LabCase={
  caseId:string; state:LabCaseState; version:number;
  requesterId:string|null; approverId:string|null;
  publicationAuthorizerId:string|null; audit:LabEvent[];
};
export type LabCaseRead={
  schoolId:string;classId:string;periodId:string;studentId:string;
  capabilities:LabCapability[];case:LabCase|null;
};
export type LabTransitionResult={
  caseId:string;state:LabCaseState;version:number;replayed:boolean;
};
export type LabViewer={id:string;role:string;isDemo:boolean};

function isLabRuntime():boolean {
  return typeof window!=="undefined" && isS4D3LLocalLab({
    dev:import.meta.env.DEV,
    explicitLabOptIn:import.meta.env.VITE_SCHOOLNET_S4D3L_LAB,
    locationHostname:window.location.hostname,
    supabaseUrl:String(import.meta.env.VITE_SUPABASE_URL??""),
  }) && new URLSearchParams(window.location.search).get("schoolnet_s4d3l_lab")==="1";
}
export function requireLocalLab(viewer:LabViewer|null,scope:GeneralScope,studentId:string):void {
  if(!isLabRuntime() || !isLabSchoolAdmin(viewer) ||
    !Object.values(scope).every(asUuid) || !asUuid(studentId))
    throw new Error("Laboratoire désactivé : session ou environnement local non autorisé.");
}
export function isLabCaseRead(
 value:unknown,scope:GeneralScope,studentId:string,
):value is LabCaseRead {
 if(!record(value)||value.schoolId!==scope.schoolId||
   value.classId!==scope.classId||value.periodId!==scope.periodId||
   value.studentId!==studentId||!Array.isArray(value.capabilities)||
   !value.capabilities.every((cap:unknown)=>
    ["submit","decide","authorize_publication"].includes(String(cap)))||
   new Set(value.capabilities).size!==value.capabilities.length ||
   value.capabilities.length<1)return false;
 if(value.case===null)return true;
 const c=value.case;
 if(!record(c)||!asUuid(c.caseId)||!validInt(c.version)||
  !["draft","submitted","correction_requested","refused","approved",
    "authorized_for_publication","published","withdrawn"].includes(String(c.state))||
  !maybeUuid(c.requesterId)||!maybeUuid(c.approverId)||
  !maybeUuid(c.publicationAuthorizerId)||!Array.isArray(c.audit)||
  c.audit.length<1||c.audit.length>300)return false;
 for(const event of c.audit){
  if(!record(event)||typeof event.action!=="string"||
   !asUuid(event.actorId)||typeof event.fromState!=="string"||
   typeof event.toState!=="string"||!validInt(event.version)||
   !(event.reason===null||typeof event.reason==="string")||
   typeof event.createdAt!=="string"||!Number.isFinite(Date.parse(event.createdAt)))
   return false;
 }
 return true;
}
function assertTransition(value:unknown):LabTransitionResult {
 if(!record(value)||!asUuid(value.caseId)||
  !validInt(value.version)||typeof value.replayed!=="boolean"||
  !["draft","submitted","correction_requested","refused","approved",
    "authorized_for_publication","published","withdrawn"].includes(String(value.state)))
  throw new Error("Réponse transactionnelle non conforme au contrat serveur.");
 return value as LabTransitionResult;
}
export function safeLabRpcError(error:unknown):string {
 const obj=(error??{}) as {code?:string};
 if(obj.code==="PGRST202"||obj.code==="42883")
  return "RPC du laboratoire absente : démarrez et initialisez Supabase local.";
 if(obj.code==="PT409"||obj.code==="40001")
  return "Décision déjà modifiée : actualisez le dossier avant de réessayer.";
 if(obj.code==="42501"||obj.code==="PGRST301")
  return "Action refusée par PostgreSQL : compte, habilitation, état ou données scolaires non autorisés.";
 return "Opération interrompue. Aucun état local ne sera considéré comme validé sans réponse serveur.";
}

export async function readLabCase(
 scope:GeneralScope,studentId:string,viewer:LabViewer|null,
):Promise<LabCaseRead>{
 requireLocalLab(viewer,scope,studentId);
 const {data,error}=await supabase.rpc(
  "schoolnet_bulletin_v2_prototype_case_for_student",{
   p_school_id:scope.schoolId,p_class_id:scope.classId,
   p_period_id:scope.periodId,p_student_id:studentId,
  });
 if(error)throw error;
 if(!isLabCaseRead(data,scope,studentId))
  throw new Error("Réponse du dossier non conforme ; aucun état inventé.");
 return data;
}
export async function openLabCase(
 scope:GeneralScope,studentId:string,viewer:LabViewer|null,
):Promise<LabTransitionResult>{
 requireLocalLab(viewer,scope,studentId);
 const {data,error}=await supabase.rpc("schoolnet_bulletin_v2_prototype_open_case",{
  p_school_id:scope.schoolId,p_period_id:scope.periodId,
  p_class_id:scope.classId,p_student_id:studentId,
  p_idempotency_key:crypto.randomUUID(),
 });
 if(error)throw error;
 return assertTransition(data);
}
export async function transitionLabCase(
 scope:GeneralScope,studentId:string,viewer:LabViewer|null,
 current:LabCase,action:LabAction,reason:string|null,
):Promise<LabTransitionResult>{
 requireLocalLab(viewer,scope,studentId);
 if(!asUuid(current.caseId)||!validInt(current.version))
  throw new Error("Version de dossier invalide.");
 if(!["review_submitted","approval_granted","approval_refused",
   "correction_requested","publication_authorized"].includes(action))
  throw new Error("Action inconnue ou publication effective interdite.");
 if(["approval_refused","correction_requested"].includes(action)&&
   (!reason||reason.trim().length<5||reason.trim().length>2000))
  throw new Error("Indiquez un motif de 5 à 2000 caractères.");
 const {data,error}=await supabase.rpc("schoolnet_bulletin_v2_prototype_transition",{
  p_case_id:current.caseId,p_action:action,
  p_expected_version:current.version,
  p_idempotency_key:crypto.randomUUID(),p_reason:reason?.trim()||null,
 });
 if(error)throw error;
 return assertTransition(data);
}
export {S4D3L_SUPABASE_LOCAL_URL};
