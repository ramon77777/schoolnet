import {supabase} from "@/lib/supabaseClient";
import {
  isStudentSchoolCourseCatalog,isStudentSchoolCourseDetail,
  type StudentSchoolCourseCatalog,type StudentSchoolCourseDetail,
} from "./studentSchoolCoursesModel";

export function isStudentSchoolCoursesPending(cause:unknown):boolean {
  if(!cause||typeof cause!=="object")return false;
  const err=cause as {code?:unknown;message?:unknown;details?:unknown};
  const s=[err.message,err.details].filter((v):v is string=>typeof v==="string").join(" ").toLowerCase();
  return err.code==="PGRST202" ||
    ((s.includes("schoolnet_student_school_courses")||
      s.includes("schoolnet_student_school_course_detail")) &&
      (s.includes("schema cache")||s.includes("not find")));
}

export async function getStudentSchoolCourses():Promise<StudentSchoolCourseCatalog> {
  const {data,error}=await supabase.rpc("schoolnet_student_school_courses");
  if(error)throw error;
  if(!isStudentSchoolCourseCatalog(data))throw new Error("Catalogue scolaire non conforme.");
  return data;
}
export async function getStudentSchoolCourseDetail(courseId:string):Promise<StudentSchoolCourseDetail> {
  if(!courseId)throw new Error("Identifiant de cours requis.");
  const {data,error}=await supabase.rpc("schoolnet_student_school_course_detail",{p_course_id:courseId});
  if(error)throw error;
  if(!isStudentSchoolCourseDetail(data,courseId))
    throw new Error("Ressources scolaires non conformes.");
  return data;
}
