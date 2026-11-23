// SCHOOLNET V2 B.4 : resume strict, sans donnees d'identite, note non publiee ou reponses.
export type OfficialDashboardStatus="not_started"|"in_progress"|"submitted"|"graded"|"published";
export type OfficialDashboardCourse={
  courseId:string;title:string;description:string|null;schoolId:string;schoolName:string;
  classId:string;className:string;schoolYear:string;subjectName:string;
};
export type OfficialDashboardAssessment={
  assessmentId:string;courseId:string;title:string;type:"quiz"|"assignment"|"exam";
  dueAt:string|null;maxScore:number|null;status:OfficialDashboardStatus;
  submittedAt:string|null;score:number|null;publishedAt:string|null;
};
export type StudentOfficialDashboard={
  courses:OfficialDashboardCourse[];assessments:OfficialDashboardAssessment[];
};
function object(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function exact(value:Record<string,unknown>,keys:readonly string[]):boolean{
  return Object.keys(value).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(value,k));
}
function text(value:unknown):value is string{
  return typeof value==="string"&&value.trim().length>0&&value.length<=5000;
}
function optionalText(value:unknown):value is string|null{
  return value===null||(typeof value==="string"&&value.length<=10000);
}
function date(value:unknown):value is string|null{
  return value===null||(typeof value==="string"&&value.length<65&&Number.isFinite(Date.parse(value)));
}
function number(value:unknown):value is number{
  return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=1000000;
}
const courseKeys=[
  "courseId","title","description","schoolId","schoolName",
  "classId","className","schoolYear","subjectName",
] as const;
const assessmentKeys=[
  "assessmentId","courseId","title","type","dueAt","maxScore",
  "status","submittedAt","score","publishedAt",
] as const;
export function isStudentOfficialDashboard(input:unknown):input is StudentOfficialDashboard{
  if(!object(input)||!exact(input,["courses","assessments"])||
      !Array.isArray(input.courses)||input.courses.length>1000||
      !Array.isArray(input.assessments)||input.assessments.length>5000)return false;
  const courseIds=new Set<string>();
  for(const course of input.courses){
    if(!object(course)||!exact(course,courseKeys)||
       !text(course.courseId)||courseIds.has(course.courseId)||
       !text(course.title)||!optionalText(course.description)||
       !text(course.schoolId)||!text(course.schoolName)||
       !text(course.classId)||!text(course.className)||
       !text(course.schoolYear)||!text(course.subjectName))return false;
    courseIds.add(course.courseId);
  }
  const assessmentIds=new Set<string>();
  for(const a of input.assessments){
    if(!object(a)||!exact(a,assessmentKeys)||
       !text(a.assessmentId)||assessmentIds.has(a.assessmentId)||
       !text(a.courseId)||!courseIds.has(a.courseId)||
       !text(a.title)||!["quiz","assignment","exam"].includes(String(a.type))||
       !date(a.dueAt)||!(a.maxScore===null||number(a.maxScore))||
       !["not_started","in_progress","submitted","graded","published"].includes(String(a.status))||
       !date(a.submittedAt)||!(a.score===null||number(a.score))||!date(a.publishedAt))return false;
    if(a.status!=="published"&&(a.score!==null||a.publishedAt!==null))return false;
    if(a.status==="not_started"&&a.submittedAt!==null)return false;
    if(a.status==="published"&&
       (a.score===null||a.publishedAt===null||a.maxScore===null||
        a.maxScore<=0||a.score>a.maxScore))return false;
    assessmentIds.add(a.assessmentId);
  }
  return true;
}
export const EMPTY_OFFICIAL_DASHBOARD:StudentOfficialDashboard={courses:[],assessments:[]};
