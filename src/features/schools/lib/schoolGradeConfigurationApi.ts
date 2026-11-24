import {supabase} from "@/lib/supabaseClient";
import {isSchoolGradeConfig,validCoefficient,type SchoolGradeConfig}
 from "./schoolGradeConfigurationModel";
import {isSchoolPeriodKind,periodPrefix,type SchoolPeriodKind} from "./schoolGradePeriodCodes";

/** Only public RPC facades; no direct SELECT or write on grading tables. */
export async function getSchoolGradeConfiguration(schoolId:string):Promise<SchoolGradeConfig>{
 if(!schoolId)throw new Error("Établissement obligatoire.");
 const {data,error}=await supabase.rpc("schoolnet_school_grading_configuration",{p_school_id:schoolId});
 if(error)throw error;
 if(!isSchoolGradeConfig(data)||data.schoolId!==schoolId)
  throw new Error("Configuration non conforme ou hors établissement.");
 return data;
}
export type PeriodInput={schoolId:string;periodId:string|null;schoolYearId:string;
 periodKind:SchoolPeriodKind;name:string;startsOn:string;endsOn:string};
export async function saveSchoolGradePeriod(input:PeriodInput):Promise<string>{
 if(!input.schoolId||!input.schoolYearId||!isSchoolPeriodKind(input.periodKind)||!input.name.trim()
  ||!input.startsOn||!input.endsOn||input.startsOn>input.endsOn)
  throw new Error("Période invalide.");
 const {data,error}=await supabase.rpc("schoolnet_school_upsert_grading_period",{
  p_school_id:input.schoolId,p_period_id:input.periodId,p_school_year_id:input.schoolYearId,
  // AUTO: is deliberately rejected by C.3-A's old SQL regex (fail closed).
  p_code:"AUTO:"+periodPrefix(input.periodKind),p_name:input.name.trim(),
  p_starts_on:input.startsOn,p_ends_on:input.endsOn,
 });
 if(error)throw error;
 if(typeof data!=="string"||!data)throw new Error("Période non confirmée.");
 return data;
}
export async function lockSchoolGradePeriod(schoolId:string,periodId:string):Promise<void>{
 if(!schoolId||!periodId)throw new Error("Période obligatoire.");
 const {data,error}=await supabase.rpc("schoolnet_school_lock_grading_period",{
  p_school_id:schoolId,p_period_id:periodId,
 });
 if(error)throw error;
 if(data!==true)throw new Error("Verrouillage non confirmé.");
}
export async function saveSchoolSubjectCoefficient(input:{
 schoolId:string;periodId:string;classId:string;subjectId:string;coefficient:number;
}):Promise<void>{
 if(!input.schoolId||!input.periodId||!input.classId||!input.subjectId||
   !validCoefficient(input.coefficient))throw new Error("Coefficient invalide.");
 const {data,error}=await supabase.rpc("schoolnet_school_set_subject_coefficient",{
  p_school_id:input.schoolId,p_period_id:input.periodId,p_class_id:input.classId,
  p_subject_id:input.subjectId,p_coefficient:input.coefficient,
 });
 if(error)throw error;
 if(data!==true)throw new Error("Coefficient matière non confirmé.");
}
export async function saveSchoolAssessmentCoefficient(input:{
 schoolId:string;periodId:string;assessmentId:string;coefficient:number;includeInAverage:boolean;
}):Promise<void>{
 if(!input.schoolId||!input.periodId||!input.assessmentId||
   !validCoefficient(input.coefficient))throw new Error("Coefficient invalide.");
 const {data,error}=await supabase.rpc("schoolnet_school_set_assessment_coefficient",{
  p_school_id:input.schoolId,p_period_id:input.periodId,
  p_assessment_id:input.assessmentId,p_coefficient:input.coefficient,
  p_include_in_average:input.includeInAverage,
 });
 if(error)throw error;
 if(data!==true)throw new Error("Coefficient évaluation non confirmé.");
}
