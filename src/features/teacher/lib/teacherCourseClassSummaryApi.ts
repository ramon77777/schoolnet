import { supabase } from "@/lib/supabaseClient";
import {
 isTeacherCourseClassSummary,
 type TeacherCourseClassSummary,
} from "./teacherCourseClassSummaryModel";

export function isTeacherCourseClassSummaryActivationPending(cause:unknown):boolean{
 if(!cause||typeof cause!=="object")return false;
 const e=cause as {code?:unknown;message?:unknown;details?:unknown};
 const msg=[e.message,e.details]
   .filter((x):x is string=>typeof x==="string").join(" ").toLowerCase();
 return e.code==="PGRST202" ||
   (msg.includes("schoolnet_teacher_course_class_summary") &&
    (msg.includes("schema cache")||msg.includes("not find")));
}

export async function getTeacherCourseClassSummary(
 courseId:string,
):Promise<TeacherCourseClassSummary>{
 if(!courseId)throw new Error("Identifiant de cours requis.");
 const {data,error}=await supabase.rpc(
  "schoolnet_teacher_course_class_summary",{p_course_id:courseId},
 );
 if(error)throw error;
 if(!isTeacherCourseClassSummary(data,courseId))
  throw new Error("Effectif scolaire non conforme.");
 return data;
}
