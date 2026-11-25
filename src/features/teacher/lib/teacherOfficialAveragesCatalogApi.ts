import {supabase} from "@/lib/supabaseClient";
import {
 isTeacherOfficialAveragesCatalog,
 type TeacherOfficialAveragesCatalog,
} from "./teacherOfficialAveragesCatalogModel";

/** Only teacher-scoped server RPC. Never query grading or assignment tables directly. */
export async function getTeacherOfficialAveragesCatalog():Promise<TeacherOfficialAveragesCatalog>{
 const {data,error}=await supabase.rpc("schoolnet_teacher_official_averages_catalog");
 if(error)throw error;
 if(!isTeacherOfficialAveragesCatalog(data))
  throw new Error("Catalogue officiel de l'enseignant non conforme.");
 return data;
}
