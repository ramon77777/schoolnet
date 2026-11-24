/** SCHOOLNET V2 — C.3-B.2: strict teacher-only, READ-ONLY official subject preview. */
export type TeacherOfficialSubjectRow={
 studentId:string;studentName:string;
 includedAssessments:number;publishedAssessments:number;
 state:"not_configured"|"incomplete"|"ready";
 averageOn20:number|null;
};
export type TeacherOfficialSubjectAverages={
 schoolId:string;schoolYearId:string;periodId:string;classId:string;subjectId:string;
 subjectCoefficient:number|null;teacherScoped:true;previewOnly:true;
 students:TeacherOfficialSubjectRow[];
};
function record(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==="object"&&!Array.isArray(v);
}
function exact(v:Record<string,unknown>,ks:string[]){
 return Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
}
const uuid=(v:unknown):v is string=>typeof v==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const coefficient=(v:unknown):v is number=>typeof v==="number"&&
 Number.isFinite(v)&&v>=0.25&&v<=20&&Math.abs(v*100-Math.round(v*100))<1e-7;
const count=(v:unknown):v is number=>typeof v==="number"&&
 Number.isSafeInteger(v)&&v>=0&&v<=200;
const score=(v:unknown):v is number=>typeof v==="number"&&
 Number.isFinite(v)&&v>=0&&v<=20;
export function isTeacherOfficialSubjectAverages(
 v:unknown,
 expected?:{schoolId:string;periodId:string;classId:string;subjectId:string},
):v is TeacherOfficialSubjectAverages{
 if(!record(v)||!exact(v,[
  "schoolId","schoolYearId","periodId","classId","subjectId",
  "subjectCoefficient","teacherScoped","previewOnly","students",
 ])||!uuid(v.schoolId)||!uuid(v.schoolYearId)||!uuid(v.periodId)||
 !uuid(v.classId)||!uuid(v.subjectId)||
 !(v.subjectCoefficient===null||coefficient(v.subjectCoefficient))||
 v.teacherScoped!==true||v.previewOnly!==true||
 !Array.isArray(v.students)||v.students.length>250)return false;
 if(expected&&["schoolId","periodId","classId","subjectId"].some(
  key=>v[key]!==expected[key as keyof typeof expected]))return false;
 const seen=new Set<string>();
 for(const row of v.students){
  if(!record(row)||!exact(row,[
   "studentId","studentName","includedAssessments",
   "publishedAssessments","state","averageOn20",
  ])||!uuid(row.studentId)||seen.has(row.studentId)||
   typeof row.studentName!=="string"||row.studentName.length===0||
   row.studentName.length>500||!count(row.includedAssessments)||
   !count(row.publishedAssessments)||
   row.publishedAssessments>row.includedAssessments||
   !["not_configured","incomplete","ready"].includes(String(row.state))||
   !(row.averageOn20===null||score(row.averageOn20)))return false;
  if(row.state==="ready"&&(
   v.subjectCoefficient===null||row.includedAssessments===0||
   row.includedAssessments!==row.publishedAssessments||
   !score(row.averageOn20)))return false;
  if(row.state==="not_configured"&&(
   v.subjectCoefficient!==null&&row.includedAssessments!==0||
   row.averageOn20!==null))return false;
  if(row.state==="incomplete"&&(
   v.subjectCoefficient===null||row.includedAssessments===0||
   row.includedAssessments===row.publishedAssessments||
   row.averageOn20!==null))return false;
  seen.add(row.studentId);
 }
 return true;
}
