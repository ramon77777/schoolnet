/** Synthetic fixture only. NEVER load data from an external school / Supabase. */
export const TEST_SCHOOL = "00000000-0000-4000-8000-000000000010";
export const TEST_YEAR = "00000000-0000-4000-8000-000000000020";
export const TEST_CLASS = "00000000-0000-4000-8000-000000000030";
export const TEST_PERIOD = "00000000-0000-4000-8000-000000000040";
export const TEST_MATH = "00000000-0000-4000-8000-000000000050";
export const TEST_TEACHER = "00000000-0000-4000-8000-000000000060";
export const TEST_ADMIN = "00000000-0000-4000-8000-000000000061";
export const TEST_ISSUED_AT = "2026-11-26T12:00:00.000Z";

const states = [
 "ready","ready","incomplete","not_configured","ready","ready","ready",
 "incomplete","ready","not_configured","ready","ready","incomplete",
];
const mathGrades = [17.25,0,null,null,11.5,14.25,13,null,15,null,16.75,18,null];
const generalGrades = [16.67,0,null,null,12.88,13.5,13.87,null,14.76,null,15.79,16.17,null];

const studentUuid = i => "00000000-0000-4000-8000-" + String(i+100).padStart(12,"0");

export function makeSyntheticExportCase({
 kind="subject_period",
 format="pdf",
 rowCount=13,
}={}){
 if(!["subject_period","class_general"].includes(kind) ||
    !["pdf","xlsx"].includes(format) || !Number.isInteger(rowCount) ||
    rowCount<1 || rowCount>250) throw new Error("Only bounded school fixtures are permitted.");
 const teacher=kind==="subject_period";
 const subjectId=teacher?TEST_MATH:null;
 const viewer={id:teacher?TEST_TEACHER:TEST_ADMIN,
  role:teacher?"teacher":"school_admin",isDemo:false};
 const request={
  viewerId:viewer.id,role:viewer.role,
  scope:{schoolId:TEST_SCHOOL,schoolYearId:TEST_YEAR,classId:TEST_CLASS,periodId:TEST_PERIOD},
  kind,cadence:"trimester",state:"provisional",format,subjectId,
 };
 const labels={
  source:"SCHOOLNET_SYNTHETIC_QA_LABELS",
  schoolId:TEST_SCHOOL,schoolYearId:TEST_YEAR,
  classId:TEST_CLASS,periodId:TEST_PERIOD,subjectId,
  schoolName:"Établissement synthétique A",
  schoolYear:"2026-2027 (simulation)",
  className:"6e B (simulation)",
  periodName:"Premier trimestre (simulation)",
  subjectName:teacher?"Mathématiques (simulation)":null,
 };
 const averages=teacher?mathGrades:generalGrades;
 const students=Array.from({length:rowCount},(_,i)=>{
  const state=i<states.length?states[i]:"ready";
  return {
   studentId:studentUuid(i),studentName:"Élève synthétique "+String(i+1).padStart(3,"0"),
   state,
   completedItems:state==="ready"?3:state==="incomplete"?2:0,
   expectedItems:3,
   averageOn20:state==="ready"?(i<averages.length?averages[i]:(i%20)):null,
  };
 });
 const projection={
  projection:"schoolnet_v2_export_provisional_v1",
  previewOnly:true,documentState:"provisional",
  kind,format,
  schoolId:TEST_SCHOOL,schoolYearId:TEST_YEAR,classId:TEST_CLASS,
  periodId:TEST_PERIOD,subjectId,
  completionUnit:teacher?"évaluations":"matières",
  auditId:"00000000-0000-4000-8000-000000000090",
  studentCount:students.length,
  students,
 };
 return {request,viewer,labels,projection,generatedAt:TEST_ISSUED_AT};
}
