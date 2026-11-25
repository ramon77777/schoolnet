import type {SchoolGradePeriod,SchoolGradeSubjectSetting,SchoolGradeAssessment}
 from "@/features/schools/lib/schoolGradeConfigurationModel";
export type TeacherCoefficientAssignment={
 assignmentId:string;classId:string;className:string;schoolYearId:string;schoolYearName:string;
 subjectId:string;subjectName:string;canEditSubjectCoefficient:boolean;
};
export type TeacherCoefficientEvent={
 action:"teacher_assessment_coefficient"|"teacher_subject_coefficient"|"school_subject_delegation";
 at:string;periodId:string|null;assessmentId:string|null;classId:string|null;subjectId:string|null;
 previousValue:unknown;currentValue:unknown;
};
export type TeacherCoefficientSettings={
 schoolId:string;assignments:TeacherCoefficientAssignment[];periods:SchoolGradePeriod[];
 subjectSettings:SchoolGradeSubjectSetting[];assessments:SchoolGradeAssessment[];
 history:TeacherCoefficientEvent[];
};
export type SchoolTeacherCoefficientDelegations={
 schoolId:string;assignments:Array<{
  assignmentId:string;teacherName:string;className:string;subjectName:string;
  schoolYearName:string;canEditSubjectCoefficient:boolean;
 }>;
};
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const str=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<301;
const keys=(v:Record<string,unknown>,wanted:string[])=>Object.keys(v).length===wanted.length&&
 wanted.every(k=>Object.prototype.hasOwnProperty.call(v,k));
const coefficient=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&
 v>=0.25&&v<=20&&Math.abs(Math.round(v*100)/100-v)<1e-8;
export function isTeacherCoefficientSettings(v:unknown):v is TeacherCoefficientSettings{
 if(!obj(v)||!keys(v,["schoolId","assignments","periods","subjectSettings","assessments","history"])||
  !str(v.schoolId)||!Array.isArray(v.assignments)||v.assignments.length>200||
  !Array.isArray(v.periods)||v.periods.length>200||
  !Array.isArray(v.subjectSettings)||v.subjectSettings.length>3000||
  !Array.isArray(v.assessments)||v.assessments.length>300||
  !Array.isArray(v.history)||v.history.length>30)return false;
 const assigned=new Set<string>(),years=new Set<string>(),periods=new Map<string,string>();
 const assessments=new Set<string>();
 for(const a of v.assignments){
  if(!obj(a)||!keys(a,["assignmentId","classId","className","schoolYearId","schoolYearName",
     "subjectId","subjectName","canEditSubjectCoefficient"])||
   ![a.assignmentId,a.classId,a.className,a.schoolYearId,a.schoolYearName,a.subjectId,a.subjectName].every(str)||
   typeof a.canEditSubjectCoefficient!=="boolean"||assigned.has(String(a.assignmentId)))return false;
  assigned.add(String(a.assignmentId));years.add(String(a.schoolYearId));
 }
 if(!assigned.size)return false;
 for(const p of v.periods){
  if(!obj(p)||!keys(p,["id","schoolYearId","code","name","startsOn","endsOn","isLocked"])||
   ![p.id,p.schoolYearId,p.code,p.name,p.startsOn,p.endsOn].every(str)||
   typeof p.isLocked!=="boolean"||!years.has(String(p.schoolYearId))||
   periods.has(String(p.id)))return false;
  periods.set(String(p.id),String(p.schoolYearId));
 }
 const hasScope=(classId:unknown,subjectId:unknown,yearId:unknown)=>
  v.assignments.some((a:TeacherCoefficientAssignment)=>a.classId===classId&&a.subjectId===subjectId&&a.schoolYearId===yearId);
 for(const c of v.subjectSettings){
  if(!obj(c)||!keys(c,["periodId","classId","subjectId","coefficient"])||
   !coefficient(c.coefficient)||!periods.has(String(c.periodId))||
   !hasScope(c.classId,c.subjectId,periods.get(String(c.periodId))))return false;
 }
 for(const a of v.assessments){
  if(!obj(a)||!keys(a,["assessmentId","title","classId","schoolYearId","subjectId",
   "periodId","coefficient","includeInAverage"])||
   ![a.assessmentId,a.title,a.classId,a.schoolYearId,a.subjectId].every(str)||
   assessments.has(String(a.assessmentId))||!hasScope(a.classId,a.subjectId,a.schoolYearId)||
   typeof a.includeInAverage!=="boolean"||
   (a.periodId===null?(a.coefficient!==null||a.includeInAverage):
    !periods.has(String(a.periodId))||periods.get(String(a.periodId))!==a.schoolYearId||
    !coefficient(a.coefficient)))return false;
  assessments.add(String(a.assessmentId));
 }
 for(const h of v.history){
  if(!obj(h)||!keys(h,["action","at","periodId","assessmentId","classId","subjectId",
   "previousValue","currentValue"])||
   !["teacher_assessment_coefficient","teacher_subject_coefficient","school_subject_delegation"].includes(String(h.action))||
   !str(h.at)||![h.periodId,h.assessmentId,h.classId,h.subjectId].every(x=>x===null||str(x))||
   !obj(h.currentValue))return false;
 }
 return true;
}
export function isSchoolTeacherCoefficientDelegations(v:unknown):v is SchoolTeacherCoefficientDelegations{
 if(!obj(v)||!keys(v,["schoolId","assignments"])||
  !str(v.schoolId)||!Array.isArray(v.assignments)||v.assignments.length>600)return false;
 const ids=new Set<string>();
 for(const a of v.assignments){
  if(!obj(a)||!keys(a,["assignmentId","teacherName","className","subjectName",
    "schoolYearName","canEditSubjectCoefficient"])||
   ![a.assignmentId,a.teacherName,a.className,a.subjectName,a.schoolYearName].every(str)||
   typeof a.canEditSubjectCoefficient!=="boolean"||ids.has(String(a.assignmentId)))return false;
  ids.add(String(a.assignmentId));
 }
 return true;
}
export function coefficientActivationPending(cause:unknown):boolean{
 if(!obj(cause))return false;
 const text=[cause.message,cause.details].filter((v):v is string=>typeof v==="string")
  .join(" ").toLowerCase();
 return cause.code==="PGRST202"||
  ((text.includes("schoolnet_teacher_coefficient_settings")||
    text.includes("schoolnet_school_teacher_coefficient_delegations"))&&
   (text.includes("not find")||text.includes("schema cache")||text.includes("does not exist")));
}
