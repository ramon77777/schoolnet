import {supabase} from "@/lib/supabaseClient";
import {
 isTeacherOfficialSubjectAverages,
 type TeacherOfficialSubjectAverages,
} from "./teacherOfficialAveragesModel";

/**
 * C.3-B.2: official V2 subject averages, teacher's OWN assignment only.
 * This is NOT a V1 average API and has no direct table SELECTs.
 * SQL must be installed with a separate approval before this can be called.
 */
export async function getTeacherOfficialSubjectAverages(input:{
 schoolId:string;periodId:string;classId:string;subjectId:string;
}):Promise<TeacherOfficialSubjectAverages>{
 if(!input.schoolId||!input.periodId||!input.classId||!input.subjectId)
  throw new Error("Établissement, classe, matière et période requis.");
 if(import.meta.env.DEV){
  const demo=await import("./teacherOfficialAveragesDevFixture");
  if(demo.isTeacherOfficialAveragesDevFixtureEnabled()){
   const result=demo.makeTeacherOfficialAveragesDemoPreview(input);
   if(!isTeacherOfficialSubjectAverages(result,input))throw new Error("Moyennes fictives invalides.");
   return result;
  }
 }
 const {data,error}=await supabase.rpc("schoolnet_teacher_official_subject_averages",{
  p_school_id:input.schoolId,
  p_period_id:input.periodId,
  p_class_id:input.classId,
  p_subject_id:input.subjectId,
 });
 if(error)throw error;
 if(!isTeacherOfficialSubjectAverages(data,input))
  throw new Error("Prévisualisation officielle non conforme ou hors affectation.");
 return data;
}
