export type SchoolAssessmentSupervisionRow={
 assessmentId:string;title:string;type:"quiz"|"assignment"|"exam";
 status:string;dueAt:string|null;
 courseId:string;courseTitle:string;classId:string;className:string;
 schoolYearId:string;schoolYear:string;subjectId:string;subjectName:string;
 teacherId:string;teacherName:string;
 inProgress:number;submitted:number;graded:number;published:number;
};
export type SchoolAssessmentSupervision={
 schoolId:string;assessmentCount:number;assessments:SchoolAssessmentSupervisionRow[];
};
const keys=["assessmentId","title","type","status","dueAt","courseId","courseTitle",
 "classId","className","schoolYearId","schoolYear","subjectId","subjectName",
 "teacherId","teacherName","inProgress","submitted","graded","published"];
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==="object"&&!Array.isArray(v);
}
function exact(v:Record<string,unknown>,expected:readonly string[]):boolean{
 return Object.keys(v).length===expected.length&&expected.every(k=>Object.prototype.hasOwnProperty.call(v,k));
}
const str=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=5000;
const integer=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
export function isSchoolAssessmentSupervision(v:unknown):v is SchoolAssessmentSupervision{
 if(!obj(v)||!exact(v,["schoolId","assessmentCount","assessments"])||
    !str(v.schoolId)||!integer(v.assessmentCount)||!Array.isArray(v.assessments)||
    v.assessments.length>300||v.assessments.length!==v.assessmentCount)return false;
 const seen=new Set<string>();
 for(const row of v.assessments){
  if(!obj(row)||!exact(row,keys)||!str(row.assessmentId)||seen.has(row.assessmentId))return false;
  if(!["quiz","assignment","exam"].includes(String(row.type))||
     !str(row.status)||!(row.dueAt===null||(typeof row.dueAt==="string"&&Number.isFinite(Date.parse(row.dueAt)))))return false;
  for(const field of ["title","courseId","courseTitle","classId","className","schoolYearId",
    "schoolYear","subjectId","subjectName","teacherId","teacherName"]){
    if(!str(row[field]))return false;
  }
  for(const field of ["inProgress","submitted","graded","published"]){
    if(!integer(row[field]))return false;
  }
  seen.add(row.assessmentId);
 }
 return true;
}
export type SupervisionFilters={
 schoolYearId:string;classId:string;subjectId:string;teacherId:string;
 type:string;status:string;search:string;
};
export function filterSupervision(rows:SchoolAssessmentSupervisionRow[],f:SupervisionFilters){
 const term=f.search.trim().toLocaleLowerCase("fr");
 return rows.filter(r=>
  (!f.schoolYearId||r.schoolYearId===f.schoolYearId)&&
  (!f.classId||r.classId===f.classId)&&
  (!f.subjectId||r.subjectId===f.subjectId)&&
  (!f.teacherId||r.teacherId===f.teacherId)&&
  (!f.type||r.type===f.type)&&
  (!f.status||r.status===f.status)&&
  (!term||[r.title,r.courseTitle,r.subjectName,r.className,r.teacherName].some(v=>v.toLocaleLowerCase("fr").includes(term)))
 );
}
export function supervisionTotals(rows:SchoolAssessmentSupervisionRow[]){
 return rows.reduce((a,r)=>({
  inProgress:a.inProgress+r.inProgress,submitted:a.submitted+r.submitted,
  graded:a.graded+r.graded,published:a.published+r.published
 }),{inProgress:0,submitted:0,graded:0,published:0});
}
