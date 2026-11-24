import {supabase} from "@/lib/supabaseClient";
import {
 isTeacherOfficialCopies,isTeacherOfficialGradeReceipt,
 isStudentOfficialPublishedResult,
 type TeacherOfficialCopies,type TeacherOfficialGradeReceipt,
 type StudentOfficialPublishedResult,
} from "./officialTeacherGradingModel";

export function officialGradingError(error:unknown):string{
 if(!isError(error))return "Impossible d'effectuer cette opération.";
 const code=typeof error.code==="string"?error.code:"";
 const message=typeof error.message==="string"?error.message:"";
 if(code==="PGRST202"||message.includes("schema cache"))
  return "Le service officiel de correction B.3 n'est pas encore installé sur ce serveur.";
 if(message.includes("S4B3B3_CANNOT_PUBLISH"))
  return "La copie doit d'abord être corrigée et notée avant publication.";
 if(message.includes("S4B3B3_INVALID_GRADE"))
  return "Vérifiez la note, le barème et l'appréciation de l'enseignant.";
 if(message.includes("S4B3B3_MISSING_MAX_SCORE"))
  return "Impossible de corriger : le barème maximal de l'évaluation n'est pas défini.";
 if(code==="42501")return "Accès refusé : vérifiez votre affectation, votre établissement et votre classe.";
 if(code==="22023")return "Les données de correction ne sont pas valides.";
 return "Opération impossible. Vérifiez votre connexion, puis réessayez.";
}
function isError(v:unknown):v is {message?:unknown;code?:unknown}{
 return v!==null&&typeof v==="object";
}

/** Pas de SELECT direct sur les copies (RLS B.0). */
export async function getTeacherOfficialCopies(assessmentId:string):Promise<TeacherOfficialCopies>{
 if(!assessmentId)throw new Error("Identifiant d'évaluation requis.");
 const {data,error}=await supabase.rpc("schoolnet_teacher_official_copies",{
  p_assessment_id:assessmentId,
 });
 if(error)throw error;
 if(!isTeacherOfficialCopies(data,assessmentId))
  throw new Error("Réponse du suivi enseignant invalide.");
 return data;
}

/** Deux opérations métier atomiques : corriger ou publier une copie déjà corrigée. */
export async function teacherOfficialGrade(
 assessmentId:string,submissionId:string,action:"grade"|"publish",
 points:number|null,feedback:string|null,
):Promise<TeacherOfficialGradeReceipt>{
 const {data,error}=await supabase.rpc("schoolnet_teacher_official_grade",{
  p_assessment_id:assessmentId,p_submission_id:submissionId,p_action:action,
  p_score:action==="grade"?points:null,p_feedback:action==="grade"?feedback:null,
 });
 if(error)throw error;
 if(!isTeacherOfficialGradeReceipt(data,submissionId))
  throw new Error("Reçu de correction non conforme.");
 return data;
}

/** Retourne null tant que la copie personnelle n'est pas publiée. */
export async function getStudentOfficialPublishedResult(
 courseId:string,assessmentId:string,
):Promise<StudentOfficialPublishedResult|null>{
 const {data,error}=await supabase.rpc("schoolnet_student_official_published_result",{
  p_course_id:courseId,p_assessment_id:assessmentId,
 });
 if(error)throw error;
 if(data===null)return null;
 if(!isStudentOfficialPublishedResult(data,assessmentId))
  throw new Error("Contrat du résultat publié non conforme.");
 return data;
}
