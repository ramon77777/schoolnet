/** C.3-B.2-UI: teacher-scoped selector metadata, no scores or roster. */
export type TeacherOfficialAverageAssignment={
 assignmentId:string;schoolId:string;schoolName:string;
 schoolYearId:string;schoolYearName:string;
 classId:string;className:string;
 subjectId:string;subjectName:string;
};
export type TeacherOfficialAveragePeriod={
 id:string;schoolId:string;schoolYearId:string;code:string;name:string;
 startsOn:string;endsOn:string;isLocked:boolean;
};
export type TeacherOfficialAverageOptions={
 teacherScoped:true;
 assignments:TeacherOfficialAverageAssignment[];
 periods:TeacherOfficialAveragePeriod[];
};
export type TeacherOfficialAverageChoice={
 schoolId:string;schoolYearId:string;classId:string;subjectId:string;periodId:string;
};
export type TeacherOfficialAveragePicker={
 schools:{id:string;name:string}[];
 years:{id:string;name:string}[];
 classes:{id:string;name:string}[];
 subjects:{id:string;name:string}[];
 periods:TeacherOfficialAveragePeriod[];
 choice:TeacherOfficialAverageChoice;
 assignment:TeacherOfficialAverageAssignment|null;
 period:TeacherOfficialAveragePeriod|null;
};
type AnyRecord=Record<string,unknown>;
const record=(value:unknown):value is AnyRecord=>
 value!==null&&typeof value==="object"&&!Array.isArray(value);
const exact=(value:AnyRecord,fields:string[]):boolean=>
 Object.keys(value).length===fields.length&&
 fields.every(key=>Object.prototype.hasOwnProperty.call(value,key));
const uuid=(value:unknown):value is string=>
 typeof value==="string"&&
 /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const text=(value:unknown):value is string=>
 typeof value==="string"&&value.trim().length>0&&value.length<=300;
const date=(value:unknown):value is string=>
 typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);

export function isTeacherOfficialAverageOptions(value:unknown):value is TeacherOfficialAverageOptions{
 if(!record(value)||!exact(value,["teacherScoped","assignments","periods"])||
  value.teacherScoped!==true||!Array.isArray(value.assignments)||
  value.assignments.length>200||!Array.isArray(value.periods)||
  value.periods.length>250)return false;
 const assignments=new Set<string>(),periods=new Set<string>(),access=new Set<string>();
 for(const row of value.assignments){
  if(!record(row)||!exact(row,[
   "assignmentId","schoolId","schoolName","schoolYearId","schoolYearName",
   "classId","className","subjectId","subjectName",
  ])||![row.assignmentId,row.schoolId,row.schoolYearId,row.classId,row.subjectId].every(uuid)||
   ![row.schoolName,row.schoolYearName,row.className,row.subjectName].every(text)||
   assignments.has(String(row.assignmentId)))return false;
  assignments.add(row.assignmentId as string);
  access.add(row.schoolId+"|"+row.schoolYearId);
 }
 for(const period of value.periods){
  if(!record(period)||!exact(period,[
   "id","schoolId","schoolYearId","code","name","startsOn","endsOn","isLocked",
  ])||![period.id,period.schoolId,period.schoolYearId].every(uuid)||
   !text(period.code)||!text(period.name)||
   !date(period.startsOn)||!date(period.endsOn)||
   period.startsOn>period.endsOn||typeof period.isLocked!=="boolean"||
   !access.has(period.schoolId+"|"+period.schoolYearId)||
   periods.has(String(period.id)))return false;
  periods.add(period.id as string);
 }
 return true;
}
function distinct<T>(items:T[],key:(item:T)=>string,name:(item:T)=>string){
 const unique=new Map<string,string>();
 items.forEach(item=>{const id=key(item);if(!unique.has(id))unique.set(id,name(item));});
 return Array.from(unique.entries()).map(([id,label])=>({id,name:label}));
}
function prefer<T extends {id:string}>(options:T[],preferred:string|undefined){
 return options.some(option=>option.id===preferred)?preferred??"":options[0]?.id??"";
}
/** Cascading picker never constructs a foreign school/class/subject/period tuple. */
export function resolveTeacherOfficialAveragePicker(
 context:TeacherOfficialAverageOptions,
 requested:Partial<TeacherOfficialAverageChoice>={},
):TeacherOfficialAveragePicker{
 const schools=distinct(context.assignments,a=>a.schoolId,a=>a.schoolName);
 const schoolId=prefer(schools,requested.schoolId);
 const atSchool=context.assignments.filter(a=>a.schoolId===schoolId);
 const years=distinct(atSchool,a=>a.schoolYearId,a=>a.schoolYearName);
 const schoolYearId=prefer(years,requested.schoolYearId);
 const atYear=atSchool.filter(a=>a.schoolYearId===schoolYearId);
 const classes=distinct(atYear,a=>a.classId,a=>a.className);
 const classId=prefer(classes,requested.classId);
 const atClass=atYear.filter(a=>a.classId===classId);
 const subjects=distinct(atClass,a=>a.subjectId,a=>a.subjectName);
 const subjectId=prefer(subjects,requested.subjectId);
 const periods=context.periods.filter(p=>p.schoolId===schoolId&&
  p.schoolYearId===schoolYearId).sort((a,b)=>
   a.startsOn.localeCompare(b.startsOn)||a.code.localeCompare(b.code));
 const periodId=prefer(periods,requested.periodId);
 return {schools,years,classes,subjects,periods,
  choice:{schoolId,schoolYearId,classId,subjectId,periodId},
  assignment:atClass.find(a=>a.subjectId===subjectId)??null,
  period:periods.find(p=>p.id===periodId)??null,
 };
}
