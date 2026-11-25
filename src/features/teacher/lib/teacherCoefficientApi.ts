import {supabase} from "@/lib/supabaseClient";
import {validCoefficient} from "@/features/schools/lib/schoolGradeConfigurationModel";
import {isTeacherCoefficientSettings,isSchoolTeacherCoefficientDelegations,
 type TeacherCoefficientSettings,type SchoolTeacherCoefficientDelegations}
 from "./teacherCoefficientModel";
/** Reads are through scoped RPCs, never direct access to schoolnet_private tables. */
export async function getTeacherCoefficientSettings(schoolId:string):Promise<TeacherCoefficientSettings>{
 if(!schoolId)throw new Error("Établissement obligatoire.");
 const {data,error}=await supabase.rpc("schoolnet_teacher_coefficient_settings",{p_school_id:schoolId});
 if(error)throw error;
 if(!isTeacherCoefficientSettings(data)||data.schoolId!==schoolId)
  throw new Error("Paramètres de coefficients non conformes.");
 return data;
}
export async function saveTeacherAssessmentCoefficient(input:{
 schoolId:string;periodId:string;assessmentId:string;coefficient:number;includeInAverage:boolean;
}):Promise<void>{
 if(!input.schoolId||!input.periodId||!input.assessmentId||
  !validCoefficient(input.coefficient)||typeof input.includeInAverage!=="boolean")
  throw new Error("Paramètres invalides.");
 const {data,error}=await supabase.rpc("schoolnet_teacher_set_assessment_coefficient",{
  p_school_id:input.schoolId,p_period_id:input.periodId,p_assessment_id:input.assessmentId,
  p_coefficient:input.coefficient,p_include_in_average:input.includeInAverage,
 });
 if(error)throw error;
 if(data!==true)throw new Error("Évaluation non confirmée.");
}
export async function saveTeacherSubjectCoefficient(input:{
 schoolId:string;periodId:string;classId:string;subjectId:string;coefficient:number;
}):Promise<void>{
 if(!input.schoolId||!input.periodId||!input.classId||!input.subjectId||
  !validCoefficient(input.coefficient))throw new Error("Coefficient invalide.");
 const {data,error}=await supabase.rpc("schoolnet_teacher_set_subject_coefficient",{
  p_school_id:input.schoolId,p_period_id:input.periodId,p_class_id:input.classId,
  p_subject_id:input.subjectId,p_coefficient:input.coefficient,
 });
 if(error)throw error;
 if(data!==true)throw new Error("Matière non confirmée.");
}
export async function getSchoolTeacherCoefficientDelegations(schoolId:string):Promise<SchoolTeacherCoefficientDelegations>{
 if(!schoolId)throw new Error("Établissement obligatoire.");
 const {data,error}=await supabase.rpc("schoolnet_school_teacher_coefficient_delegations",{
  p_school_id:schoolId,
 });
 if(error)throw error;
 if(!isSchoolTeacherCoefficientDelegations(data)||data.schoolId!==schoolId)
  throw new Error("Délégations hors périmètre ou non conformes.");
 return data;
}
export async function saveSchoolTeacherCoefficientDelegation(input:{
 schoolId:string;assignmentId:string;enabled:boolean;
}):Promise<void>{
 if(!input.schoolId||!input.assignmentId||typeof input.enabled!=="boolean")
  throw new Error("Délégation invalide.");
 const {data,error}=await supabase.rpc("schoolnet_school_set_teacher_coefficient_delegation",{
  p_school_id:input.schoolId,p_teacher_assignment_id:input.assignmentId,p_enabled:input.enabled,
 });
 if(error)throw error;
 if(data!==true)throw new Error("Délégation non confirmée.");
}
