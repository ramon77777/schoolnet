/** Strict server projection for SCHOOLNET C.3-A (school_admin only). */
export type SchoolGradeYear={id:string;name:string;startsOn:string;endsOn:string};
export type SchoolGradePeriod={
 id:string;schoolYearId:string;code:string;name:string;startsOn:string;endsOn:string;isLocked:boolean;
};
export type SchoolGradeSubject={
 classId:string;className:string;schoolYearId:string;subjectId:string;subjectName:string;
};
export type SchoolGradeSubjectSetting={periodId:string;classId:string;subjectId:string;coefficient:number};
export type SchoolGradeAssessment={
 assessmentId:string;title:string;classId:string;schoolYearId:string;subjectId:string;
 periodId:string|null;coefficient:number|null;includeInAverage:boolean;
};
export type SchoolGradeConfig={
 schoolId:string;years:SchoolGradeYear[];periods:SchoolGradePeriod[];
 subjects:SchoolGradeSubject[];subjectSettings:SchoolGradeSubjectSetting[];
 assessments:SchoolGradeAssessment[];
};
function record(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==="object"&&!Array.isArray(v);
}
function keys(v:Record<string,unknown>,expected:string[]){
 return Object.keys(v).length===expected.length &&
  expected.every(k=>Object.prototype.hasOwnProperty.call(v,k));
}
const s=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=300;
const n=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0.25&&v<=20;
const iso=(v:unknown)=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);
export function isSchoolGradeConfig(v:unknown):v is SchoolGradeConfig{
 if(!record(v)||!keys(v,["schoolId","years","periods","subjects","subjectSettings","assessments"])
  ||!s(v.schoolId)||!Array.isArray(v.years)||v.years.length>100
  ||!Array.isArray(v.periods)||v.periods.length>200
  ||!Array.isArray(v.subjects)||v.subjects.length>600
  ||!Array.isArray(v.subjectSettings)||v.subjectSettings.length>3000
  ||!Array.isArray(v.assessments)||v.assessments.length>300)return false;
 const yearIds=new Set<string>(), periodIds=new Set<string>();
 const subjects=new Set<string>(), assessments=new Set<string>();
 for(const y of v.years){
  if(!record(y)||!keys(y,["id","name","startsOn","endsOn"])||
    !s(y.id)||yearIds.has(y.id)||!s(y.name)||!iso(y.startsOn)||!iso(y.endsOn)||
    y.startsOn>y.endsOn)return false;
  yearIds.add(y.id);
 }
 for(const p of v.periods){
  if(!record(p)||!keys(p,["id","schoolYearId","code","name","startsOn","endsOn","isLocked"])||
    !s(p.id)||periodIds.has(p.id)||!yearIds.has(String(p.schoolYearId))||
    !s(p.code)||!s(p.name)||!iso(p.startsOn)||!iso(p.endsOn)||
    p.startsOn>p.endsOn||typeof p.isLocked!=="boolean")return false;
  periodIds.add(p.id);
 }
 for(const subject of v.subjects){
  if(!record(subject)||!keys(subject,["classId","className","schoolYearId","subjectId","subjectName"])||
   !s(subject.classId)||!s(subject.className)||!yearIds.has(String(subject.schoolYearId))||
   !s(subject.subjectId)||!s(subject.subjectName))return false;
  const id=subject.classId+"|"+subject.subjectId;
  if(subjects.has(id))return false;
  subjects.add(id);
 }
 const configuredSubjects=new Set<string>();
 for(const sc of v.subjectSettings){
  if(!record(sc)||!keys(sc,["periodId","classId","subjectId","coefficient"])||
   !periodIds.has(String(sc.periodId))||!subjects.has(String(sc.classId)+"|"+String(sc.subjectId))||
   !n(sc.coefficient))return false;
  const id=sc.periodId+"|"+sc.classId+"|"+sc.subjectId;
  if(configuredSubjects.has(id))return false;
  configuredSubjects.add(id);
 }
 for(const a of v.assessments){
  if(!record(a)||!keys(a,["assessmentId","title","classId","schoolYearId",
   "subjectId","periodId","coefficient","includeInAverage"])||
   !s(a.assessmentId)||assessments.has(a.assessmentId)||!s(a.title)||
   !yearIds.has(String(a.schoolYearId))||
   !subjects.has(String(a.classId)+"|"+String(a.subjectId))||
   typeof a.includeInAverage!=="boolean" ||
   (a.periodId===null?a.coefficient!==null||a.includeInAverage:
     !periodIds.has(String(a.periodId))||!n(a.coefficient)))return false;
  if(a.periodId!==null){
   const p=v.periods.find(p=>p.id===a.periodId);
   if(p?.schoolYearId!==a.schoolYearId)return false;
  }
  assessments.add(a.assessmentId);
 }
 for(const sc of v.subjectSettings){
  const sub=v.subjects.find(s=>s.classId===sc.classId&&s.subjectId===sc.subjectId);
  const period=v.periods.find(p=>p.id===sc.periodId);
  if(sub?.schoolYearId!==period?.schoolYearId)return false;
 }
 return true;
}
export function validCoefficient(value:number):boolean{
 return Number.isFinite(value)&&value>=0.25&&value<=20&&Math.round(value*100)===value*100;
}
export function availablePeriods(c:SchoolGradeConfig,yearId:string){
 return c.periods.filter(p=>p.schoolYearId===yearId)
  .sort((a,b)=>a.startsOn.localeCompare(b.startsOn));
}
