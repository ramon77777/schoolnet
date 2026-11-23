import {supabase} from "@/lib/supabaseClient";
import {isStudentOfficialDashboard,type StudentOfficialDashboard}
  from "./studentOfficialDashboardModel";

/** Une RPC unique ; aucune lecture directe des notes ou soumissions V2. */
export async function getStudentOfficialDashboard():Promise<StudentOfficialDashboard>{
  const {data,error}=await supabase.rpc("schoolnet_student_official_dashboard");
  if(error)throw error;
  if(!isStudentOfficialDashboard(data))throw new Error("Resume scolaire officiel invalide.");
  return data;
}
