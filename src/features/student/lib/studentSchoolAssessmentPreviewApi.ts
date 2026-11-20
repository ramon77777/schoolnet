import {supabase} from "@/lib/supabaseClient";
import {
 isStudentOfficialAssessmentPreview,
 type StudentOfficialAssessmentPreview,
} from "./studentSchoolAssessmentPreviewModel";

export function isStudentOfficialAssessmentPreviewPending(cause:unknown):boolean{
 if(!cause||typeof cause!=="object")return false;
 const err=cause as {code?:unknown;message?:unknown;details?:unknown};
 const message=[err.message,err.details].filter((x):x is string=>typeof x==="string")
  .join(" ").toLowerCase();
 return err.code==="PGRST202"||
  (message.includes("schoolnet_student_school_assessment_preview")&&
   (message.includes("schema cache")||message.includes("not find")));
}

/** Un seul appel RPC restreint ; jamais de SELECT direct sur les tables V1. */
export async function getStudentOfficialAssessmentPreview(
 courseId:string,assessmentId:string,
):Promise<StudentOfficialAssessmentPreview>{
 if(!courseId||!assessmentId)throw new Error("Cours et évaluation requis.");
 const {data,error}=await supabase.rpc(
  "schoolnet_student_school_assessment_preview",
  {p_course_id:courseId,p_assessment_id:assessmentId},
 );
 if(error)throw error;
 if(!isStudentOfficialAssessmentPreview(data,courseId,assessmentId))
   throw new Error("Aperçu de l'évaluation non conforme.");
 return data;
}
