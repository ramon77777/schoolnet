import {supabase} from "@/lib/supabaseClient";
import {
 isOfficialAttemptState,
 type OfficialAttemptAction,
 type OfficialAttemptAnswer,
 type OfficialAttemptState,
} from "./studentSchoolAssessmentAttemptModel";

export function getOfficialAttemptError(error:unknown):string{
 if(!error||typeof error!=="object")return "Impossible de contacter le serveur.";
 const e=error as {code?:unknown;message?:unknown};
 const code=typeof e.code==="string"?e.code:"";
 const message=typeof e.message==="string"?e.message:"";
 if(code==="PGRST202"||message.includes("schoolnet_student_school_assessment_attempt")&&message.includes("schema cache"))
  return "Le service de remise B.2 n'est pas encore activé sur ce serveur.";
 if(message.includes("S4B3B2_TIME_EXPIRED"))
  return "Le délai de remise est dépassé. Aucune réponse supplémentaire ne peut être enregistrée.";
 if(message.includes("S4B3B2_START_REQUIRED"))
  return "Commencez l'évaluation avant d'enregistrer une réponse.";
 if(message.includes("S4B3B2_ALREADY_FINAL"))
  return "Cette copie est déjà remise ou corrigée. Elle ne peut plus être modifiée.";
 if(message.includes("S4B3B2_EMPTY_SUBMISSION"))
  return "Répondez à au moins une question avant de remettre votre travail.";
 if(message.includes("S4B3B2_FILE_MODE_NOT_READY"))
  return "La remise des sujets contenant un fichier sera disponible ultérieurement.";
 if(code==="42501")return "Accès refusé : vérifiez votre classe, l'échéance et la publication.";
 if(code==="22023")return "Certaines réponses ne sont pas valides. Vérifiez vos choix et les champs.";
 return "L'opération n'a pas abouti. Vérifiez votre connexion puis réessayez.";
}

/** Aucun acces direct a assessment_submissions, submission_answers ou quiz_choices. */
export async function requestOfficialAttempt(
 courseId:string,assessmentId:string,action:OfficialAttemptAction,
 answers:OfficialAttemptAnswer[]=[],freeformAnswer:string|null=null,
):Promise<OfficialAttemptState>{
 if(!courseId||!assessmentId)throw new Error("Identifiants d'évaluation manquants.");
 const {data,error}=await supabase.rpc("schoolnet_student_school_assessment_attempt",{
  p_course_id:courseId,p_assessment_id:assessmentId,p_action:action,
  p_answers:answers,p_freeform_answer:freeformAnswer,
 });
 if(error)throw error;
 if(!isOfficialAttemptState(data,courseId,assessmentId))
  throw new Error("Contrat de remise non conforme.");
 return data;
}
