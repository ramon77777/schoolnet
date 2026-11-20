// SCHOOLNET V2 S4-B.3-A — contrats stricts des evaluations officielles.
// Ne contient ni note, ni nom d'eleve, ni soumission ni questions.
export type OfficialAssessmentType="quiz"|"assignment"|"exam";
export type SchoolAssessmentTeacherContext={
 assessmentId:string;
 courseId:string;
 title:string;
 status:string;
 eligible:boolean;
 linked:boolean;
 schoolName:string|null;
 className:string|null;
 subjectName:string|null;
};
export type StudentOfficialAssessment={
 assessmentId:string;
 title:string;
 type:OfficialAssessmentType;
 dueAt:string|null;
};
export type StudentOfficialAssessmentCatalog={
 courseId:string;
 assessments:StudentOfficialAssessment[];
};
function record(x:unknown):x is Record<string,unknown> {
 return x!==null&&typeof x==="object"&&!Array.isArray(x);
}
function exact(o:Record<string,unknown>,keys:string[]):boolean {
 return Object.keys(o).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(o,k));
}
function nonempty(x:unknown):x is string {
 return typeof x==="string"&&x.trim().length>0&&x.length<=5000;
}
const contextKeys=[
 "assessmentId","courseId","title","status","eligible","linked",
 "schoolName","className","subjectName",
];
const studentKeys=["assessmentId","title","type","dueAt"];
export function isSchoolAssessmentTeacherContext(
 data:unknown,assessmentId:string,
):data is SchoolAssessmentTeacherContext {
 if(!record(data)||!exact(data,contextKeys))return false;
 return data.assessmentId===assessmentId&&nonempty(data.courseId)&&
   nonempty(data.title)&&typeof data.status==="string"&&
   ["draft","published","closed"].includes(data.status)&&
   typeof data.eligible==="boolean"&&typeof data.linked==="boolean"&&
   ["schoolName","className","subjectName"].every(k=>
     data[k]===null||nonempty(data[k])
   )&&(!data.eligible||["schoolName","className","subjectName"].every(k=>nonempty(data[k])))&&
   (!data.linked||data.eligible);
}
export function isStudentOfficialAssessmentCatalog(
 data:unknown,courseId:string,
):data is StudentOfficialAssessmentCatalog {
 if(!record(data)||!exact(data,["courseId","assessments"])||
    data.courseId!==courseId||!Array.isArray(data.assessments))return false;
 const seen=new Set<string>();
 return data.assessments.every(row=>{
   if(!record(row)||!exact(row,studentKeys)||
      !nonempty(row.assessmentId)||seen.has(row.assessmentId)||
      !nonempty(row.title)||
      !["quiz","assignment","exam"].includes(String(row.type))||
      !(row.dueAt===null||(typeof row.dueAt==="string"&&
        Number.isFinite(Date.parse(row.dueAt)))))return false;
   seen.add(row.assessmentId);
   return true;
 });
}
