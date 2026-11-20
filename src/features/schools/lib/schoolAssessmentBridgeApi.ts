import {supabase} from "@/lib/supabaseClient";
import {
 isSchoolAssessmentTeacherContext,
 isStudentOfficialAssessmentCatalog,
 type SchoolAssessmentTeacherContext,
 type StudentOfficialAssessmentCatalog,
} from "./schoolAssessmentBridgeModel";

export function isSchoolAssessmentActivationPending(cause:unknown):boolean{
 if(!cause||typeof cause!=="object")return false;
 const e=cause as {code?:unknown;message?:unknown;details?:unknown};
 const msg=[e.message,e.details].filter((x):x is string=>typeof x==="string")
  .join(" ").toLowerCase();
 return e.code==="PGRST202"||
  (msg.includes("schoolnet_")&&msg.includes("assessment")&&
   (msg.includes("schema cache")||msg.includes("not find")));
}
export async function getSchoolAssessmentTeacherContext(
 assessmentId:string,
):Promise<SchoolAssessmentTeacherContext>{
 if(!assessmentId)throw new Error("Evaluation requise.");
 const {data,error}=await supabase.rpc(
  "schoolnet_teacher_school_assessment_context",{p_assessment_id:assessmentId});
 if(error)throw error;
 if(!isSchoolAssessmentTeacherContext(data,assessmentId))
  throw new Error("Contexte scolaire de l'evaluation non conforme.");
 return data;
}
export async function linkSchoolAssessment(assessmentId:string):Promise<void>{
 const {data,error}=await supabase.rpc(
  "schoolnet_teacher_link_school_assessment",{p_assessment_id:assessmentId});
 if(error)throw error;
 if(data!==true)throw new Error("Rattachement refuse.");
}
export async function unlinkSchoolAssessment(assessmentId:string):Promise<void>{
 const {data,error}=await supabase.rpc(
  "schoolnet_teacher_unlink_school_assessment",{p_assessment_id:assessmentId});
 if(error)throw error;
 if(data!==true)throw new Error("Lien deja retire ou non autorise.");
}
export async function getStudentSchoolCourseAssessments(
 courseId:string,
):Promise<StudentOfficialAssessmentCatalog>{
 if(!courseId)throw new Error("Cours requis.");
 const {data,error}=await supabase.rpc(
  "schoolnet_student_school_course_assessments",{p_course_id:courseId});
 if(error)throw error;
 if(!isStudentOfficialAssessmentCatalog(data,courseId))
  throw new Error("Catalogue des evaluations officielles non conforme.");
 return data;
}
