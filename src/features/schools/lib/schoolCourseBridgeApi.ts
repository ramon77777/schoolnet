import { supabase } from "@/lib/supabaseClient";
import { areSchoolAssignmentsReadOnly } from "./schoolAssignmentWritePolicy";
import {
  isTeacherSchoolCourseContext,
  isAdminSchoolCourseCatalog,
  type TeacherSchoolCourseContext,
  type AdminSchoolCourseCatalog,
} from "./schoolCourseBridgeModel";

export const SCHOOL_COURSE_PREVIEW_READ_ONLY =
  "Le rattachement d'un cours officiel est réservé au site SCHOOLNET de production, après activation de S4-B.1.";

export function isSchoolCourseBridgeActivationPending(cause: unknown): boolean {
  if (!cause || typeof cause!=="object") return false;
  const err=cause as {code?:unknown;message?:unknown;details?:unknown};
  const msg=[err.message,err.details].filter((v):v is string=>typeof v==="string")
    .join(" ").toLowerCase();
  return err.code==="PGRST202" || (
    (msg.includes("schoolnet_teacher_school_course_context") ||
     msg.includes("schoolnet_school_course_catalog")) &&
    (msg.includes("schema cache") || msg.includes("not find"))
  );
}

export async function getTeacherSchoolCourseContext(): Promise<TeacherSchoolCourseContext> {
  const {data,error}=await supabase.rpc("schoolnet_teacher_school_course_context");
  if(error) throw error;
  if(!isTeacherSchoolCourseContext(data)) throw new Error("Contexte des cours officiels non conforme.");
  return data;
}
export async function getSchoolCourseCatalog(schoolId: string): Promise<AdminSchoolCourseCatalog> {
  if(!schoolId) throw new Error("Établissement requis.");
  const {data,error}=await supabase.rpc("schoolnet_school_course_catalog",{p_school_id:schoolId});
  if(error) throw error;
  if(!isAdminSchoolCourseCatalog(data,schoolId))
    throw new Error("Catalogue scolaire hors établissement ou non conforme.");
  return data;
}
export async function linkTeacherSchoolCourse(courseId:string,assignmentId:string):Promise<string> {
  if(areSchoolAssignmentsReadOnly()) throw new Error(SCHOOL_COURSE_PREVIEW_READ_ONLY);
  if(!courseId || !assignmentId) throw new Error("Cours et affectation requis.");
  const {data,error}=await supabase.rpc("schoolnet_teacher_link_school_course",{
    p_course_id:courseId,p_assignment_id:assignmentId,
  });
  if(error) throw error;
  if(typeof data!=="string" || !data) throw new Error("Rattachement non confirmé.");
  return data;
}
export async function unlinkTeacherSchoolCourse(courseId:string):Promise<boolean> {
  if(areSchoolAssignmentsReadOnly()) throw new Error(SCHOOL_COURSE_PREVIEW_READ_ONLY);
  if(!courseId) throw new Error("Cours requis.");
  const {data,error}=await supabase.rpc("schoolnet_teacher_unlink_school_course",{p_course_id:courseId});
  if(error) throw error;
  if(typeof data!=="boolean") throw new Error("Retrait non confirmé.");
  return data;
}
