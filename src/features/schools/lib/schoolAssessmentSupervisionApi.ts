import {supabase} from "@/lib/supabaseClient";
import {isSchoolAssessmentSupervision,type SchoolAssessmentSupervision}
 from "./schoolAssessmentSupervisionModel";

/** Lecture unique du serveur; aucune lecture directe des copies par le navigateur. */
export async function getSchoolAssessmentSupervision(schoolId:string):Promise<SchoolAssessmentSupervision>{
 if(!schoolId)throw new Error("Établissement obligatoire.");
 const {data,error}=await supabase.rpc("schoolnet_school_assessment_supervision",{p_school_id:schoolId});
 if(error)throw error;
 if(!isSchoolAssessmentSupervision(data)||data.schoolId!==schoolId){
  throw new Error("Synthèse scolaire invalide ou hors établissement.");
 }
 return data;
}
