/** S4-C.3-B.2 — Teacher-only list of active assignments and local periods.
 * No grades, student identifiers, coefficients or answers belong in this contract.
 */
export type TeacherOfficialAveragesPeriod={
 id:string;code:string;name:string;startsOn:string;endsOn:string;isLocked:boolean;
};
export type TeacherOfficialAveragesAssignment={
 assignmentId:string;schoolId:string;schoolName:string;
 classId:string;className:string;
 schoolYearId:string;schoolYearName:string;
 subjectId:string;subjectName:string;
 periods:TeacherOfficialAveragesPeriod[];
};
export type TeacherOfficialAveragesCatalog={
 assignments:TeacherOfficialAveragesAssignment[];
};
function record(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==="object"&&!Array.isArray(v);
}
function exact(v:Record<string,unknown>,expected:string[]):boolean{
 return Object.keys(v).length===expected.length &&
  expected.every(key=>Object.prototype.hasOwnProperty.call(v,key));
}
const uuid=(v:unknown):v is string=>
 typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const label=(v:unknown):v is string=>
 typeof v==="string"&&v.trim().length>0&&v.length<=300;
const iso=(v:unknown):v is string=>
 typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v);

export function isTeacherOfficialAveragesCatalog(v:unknown):v is TeacherOfficialAveragesCatalog{
 if(!record(v)||!exact(v,["assignments"])||!Array.isArray(v.assignments)||
  v.assignments.length>200)return false;
 const seenAssignments=new Set<string>();
 for(const a of v.assignments){
  if(!record(a)||!exact(a,[
   "assignmentId","schoolId","schoolName","classId","className",
   "schoolYearId","schoolYearName","subjectId","subjectName","periods",
  ])||!uuid(a.assignmentId)||seenAssignments.has(a.assignmentId)||
  !uuid(a.schoolId)||!label(a.schoolName)||
  !uuid(a.classId)||!label(a.className)||
  !uuid(a.schoolYearId)||!label(a.schoolYearName)||
  !uuid(a.subjectId)||!label(a.subjectName)||
  !Array.isArray(a.periods)||a.periods.length>100)return false;
  seenAssignments.add(a.assignmentId);
  const seenPeriods=new Set<string>();
  for(const p of a.periods){
   if(!record(p)||!exact(p,[
    "id","code","name","startsOn","endsOn","isLocked",
   ])||!uuid(p.id)||seenPeriods.has(p.id)||!label(p.code)||!label(p.name)||
   !iso(p.startsOn)||!iso(p.endsOn)||p.startsOn>p.endsOn||
   typeof p.isLocked!=="boolean")return false;
   seenPeriods.add(p.id);
  }
 }
 return true;
}
export function isTeacherOfficialAveragesActivationPending(cause:unknown):boolean{
 if(!record(cause))return false;
 const message=[cause.message,cause.details]
  .filter((x):x is string=>typeof x==="string").join(" ").toLowerCase();
 return cause.code==="PGRST202"||cause.code==="42883"||
  (message.includes("schoolnet_teacher_official_averages_catalog")&&
   (message.includes("schema cache")||message.includes("not find")||message.includes("does not exist")));
}
