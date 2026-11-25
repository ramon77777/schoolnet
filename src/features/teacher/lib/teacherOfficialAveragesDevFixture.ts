import type {TeacherOfficialAveragesCatalog} from "./teacherOfficialAveragesCatalogModel";
import type {TeacherOfficialSubjectAverages,TeacherOfficialSubjectRow} from "./teacherOfficialAveragesModel";

/** Only for local Vite visual testing. Does not read or write school records. */
export function isTeacherOfficialAveragesDevFixtureEnabled():boolean{
 return import.meta.env.DEV && typeof window!=="undefined" &&
  (window.location.hostname==="localhost"||window.location.hostname==="127.0.0.1") &&
  new URLSearchParams(window.location.search).get("schoolnet_c3b4_demo")==="1";
}
const schoolA="20000000-0000-4000-8000-000000000001";
const schoolB="20000000-0000-4000-8000-000000000002";
const year="30000000-0000-4000-8000-000000000001";
const classA="50000000-0000-4000-8000-000000000001";
const classB="50000000-0000-4000-8000-000000000002";
const classC="50000000-0000-4000-8000-000000000003";
const math="40000000-0000-4000-8000-000000000001";
const science="40000000-0000-4000-8000-000000000002";
const periods=[
 {id:"70000000-0000-4000-8000-000000000001",code:"T1",name:"Premier trimestre",startsOn:"2026-09-15",endsOn:"2026-12-18",isLocked:false},
 {id:"70000000-0000-4000-8000-000000000002",code:"T2",name:"Deuxième trimestre",startsOn:"2027-01-04",endsOn:"2027-03-19",isLocked:false},
];
export function makeTeacherOfficialAveragesDemoCatalog():TeacherOfficialAveragesCatalog{
 const a=(assignmentId:string,schoolId:string,schoolName:string,classId:string,
  className:string,subjectId:string,subjectName:string)=>({
   assignmentId,schoolId,schoolName,classId,className,
   schoolYearId:year,schoolYearName:"2026-2027",subjectId,subjectName,
   periods:periods.map(p=>({...p})),
  });
 return {assignments:[
  a("60000000-0000-4000-8000-000000000001",schoolA,"Collège fictif A",classA,"6e A",math,"Mathématiques"),
  a("60000000-0000-4000-8000-000000000002",schoolA,"Collège fictif A",classB,"5e B",science,"Sciences"),
  a("60000000-0000-4000-8000-000000000003",schoolB,"Collège fictif B",classC,"6e B",math,"Mathématiques"),
 ]};
}
export function makeTeacherOfficialAveragesDemoPreview(input:{
 schoolId:string;periodId:string;classId:string;subjectId:string;
}):TeacherOfficialSubjectAverages{
 const assignment=makeTeacherOfficialAveragesDemoCatalog().assignments.find(a=>
  a.schoolId===input.schoolId&&a.classId===input.classId&&
  a.subjectId===input.subjectId&&a.periods.some(p=>p.id===input.periodId));
 if(!assignment)throw new Error("Sélection de démonstration non autorisée.");
 const secondPeriod=input.periodId===periods[1].id;
 const size=assignment.classId===classA?47:assignment.classId===classB?22:18;
 const students=Array.from({length:size},(_,i)=>{
  const state:TeacherOfficialSubjectRow["state"]=secondPeriod||i%4===3?"not_configured":i%4===2?"incomplete":"ready";
  const averageOn20=state==="ready"?(i===0?12.5:i===1?0:Number((8+(i%10)*1.1).toFixed(2))):null;
  return {studentId:"80000000-0000-4000-8000-"+String(i+1).padStart(12,"0"),
   studentName:"Élève fictif "+String(i+1).padStart(2,"0"),
   includedAssessments:state==="not_configured"?0:2,
   publishedAssessments:state==="ready"?2:state==="incomplete"?1:0,
   state,averageOn20};
 });
 return {schoolId:assignment.schoolId,schoolYearId:assignment.schoolYearId,
  classId:assignment.classId,subjectId:assignment.subjectId,periodId:input.periodId,
  subjectCoefficient:secondPeriod?null:2,teacherScoped:true,previewOnly:true,students};
}
