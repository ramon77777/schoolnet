import {supabase} from "@/lib/supabaseClient";
import {
 isTeacherOfficialAverageOptions,
 type TeacherOfficialAverageOptions,
} from "./teacherOfficialAverageOptionsModel";

const AVERAGE_RPCS=[
 "schoolnet_teacher_official_average_options",
 "schoolnet_teacher_official_subject_averages",
];

/** Distinguishes a non-installed proposal from access or network failures. */
export function isTeacherOfficialAverageActivationPending(cause:unknown):boolean{
 if(cause===null||typeof cause!=="object")return false;
 const e=cause as {code?:unknown;message?:unknown;details?:unknown};
 const details=[e.message,e.details]
  .filter((value):value is string=>typeof value==="string")
  .join(" ").toLowerCase();
 return (e.code==="PGRST202"||e.code==="42883")&&
  AVERAGE_RPCS.some(name=>details.includes(name));
}

/** No private-table SELECT; server uses auth.uid(), teacher role and live assignments. */
export async function getTeacherOfficialAverageOptions():Promise<TeacherOfficialAverageOptions>{
 const {data,error}=await supabase.rpc("schoolnet_teacher_official_average_options");
 if(error)throw error;
 if(!isTeacherOfficialAverageOptions(data))
  throw new Error("Affectations officielles non conformes ou indisponibles.");
 return data;
}
