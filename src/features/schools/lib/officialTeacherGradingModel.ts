// S4-B.3-B.3 : contrats fermes pour les copies officielles.
// Les resultats des eleves restent distincts du suivi enseignant.
export type OfficialCopyStatus="in_progress"|"submitted"|"graded"|"published";
export type TeacherOfficialChoice={
 id:string;text:string;isCorrect:boolean;orderIndex:number;
};
export type TeacherOfficialQuestion={
 id:string;type:"mcq"|"true_false"|"short_text";prompt:string;
 orderIndex:number;choices:TeacherOfficialChoice[];
};
export type TeacherOfficialAnswer={
 questionId:string;choiceId:string|null;answerText:string|null;
};
export type TeacherOfficialCopy={
 id:string;studentName:string;status:OfficialCopyStatus;
 startedAt:string|null;submittedAt:string|null;gradedAt:string|null;
 publishedAt:string|null;score:number|null;feedback:string|null;
 freeformAnswer:string|null;answers:TeacherOfficialAnswer[];
};
export type TeacherOfficialCounts={
 notStarted:number;inProgress:number;submitted:number;graded:number;published:number;
};
export type TeacherOfficialCopies={
 assessmentId:string;courseId:string;title:string;maxScore:number|null;
 classSize:number;counts:TeacherOfficialCounts;questions:TeacherOfficialQuestion[];
 copies:TeacherOfficialCopy[];
};
export type TeacherOfficialGradeReceipt={
 submissionId:string;status:"graded"|"published";score:number;
 maxScore:number;feedback:string|null;gradedAt:string;publishedAt:string|null;
};
export type StudentOfficialPublishedResult={
 assessmentId:string;submissionId:string;score:number;maxScore:number;
 feedback:string|null;gradedAt:string;publishedAt:string;
};

export function isRecord(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function keys(o:Record<string,unknown>,values:readonly string[]){
 return Object.keys(o).length===values.length&&values.every(k=>Object.hasOwn(o,k));
}
function str(v:unknown,max=10000):v is string{
 return typeof v==="string"&&v.length>0&&v.length<=max;
}
function optText(v:unknown,max=10000):v is string|null{
 return v===null||(typeof v==="string"&&v.length<=max);
}
function date(v:unknown):v is string|null{
 return v===null||(typeof v==="string"&&v.length<65&&Number.isFinite(Date.parse(v)));
}
function dateReq(v:unknown):v is string{
 return v!==null&&date(v);
}
function score(v:unknown):v is number{
 return typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1_000_000;
}
function optScore(v:unknown):v is number|null{return v===null||score(v);}
function count(v:unknown):v is number{
 return typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
}
const countKeys=["notStarted","inProgress","submitted","graded","published"];
const copyKeys=[
 "id","studentName","status","startedAt","submittedAt","gradedAt",
 "publishedAt","score","feedback","freeformAnswer","answers",
];
const questionKeys=["id","type","prompt","orderIndex","choices"];
const choiceKeys=["id","text","isCorrect","orderIndex"];
const answerKeys=["questionId","choiceId","answerText"];

export function isTeacherOfficialCopies(
 input:unknown,assessmentId:string,
):input is TeacherOfficialCopies{
 if(!isRecord(input)||!keys(input,[
   "assessmentId","courseId","title","maxScore","classSize","counts","questions","copies",
 ])||input.assessmentId!==assessmentId||!str(input.courseId)||!str(input.title)||
  !optScore(input.maxScore)||!count(input.classSize)||!isRecord(input.counts)||
  !keys(input.counts,countKeys)||countKeys.some(k=>!count(input.counts[k]))||
  !Array.isArray(input.questions)||input.questions.length>500||
  !Array.isArray(input.copies)||input.copies.length>250)return false;
 const questionIds=new Set<string>();
 for(const q of input.questions){
  if(!isRecord(q)||!keys(q,questionKeys)||!str(q.id)||questionIds.has(q.id)||
   !["mcq","true_false","short_text"].includes(String(q.type))||
   !str(q.prompt)||!count(q.orderIndex)||!Array.isArray(q.choices)||
   q.choices.length>100)return false;
  questionIds.add(q.id);
  const ids=new Set<string>();
  for(const c of q.choices){
   if(!isRecord(c)||!keys(c,choiceKeys)||!str(c.id)||ids.has(c.id)||
    !str(c.text)||typeof c.isCorrect!=="boolean"||!count(c.orderIndex))return false;
   ids.add(c.id);
  }
 }
 const copyIds=new Set<string>();
 for(const c of input.copies){
  if(!isRecord(c)||!keys(c,copyKeys)||!str(c.id)||copyIds.has(c.id)||
   !str(c.studentName,500)||!["in_progress","submitted","graded","published"].includes(String(c.status))||
   !dateReq(c.startedAt)||!date(c.submittedAt)||!date(c.gradedAt)||
   !date(c.publishedAt)||!optScore(c.score)||!optText(c.feedback,4000)||
   !optText(c.freeformAnswer)||!Array.isArray(c.answers)||c.answers.length>200)return false;
  copyIds.add(c.id);
  if(c.status==="in_progress"&&(c.score!==null||c.feedback!==null||c.answers.length!==0||
    c.freeformAnswer!==null))return false;
  if((c.status==="graded"||c.status==="published")&&c.score===null)return false;
  const ids=new Set<string>();
  for(const a of c.answers){
   if(!isRecord(a)||!keys(a,answerKeys)||!str(a.questionId)||
    !questionIds.has(a.questionId)||ids.has(a.questionId)||
    !optText(a.choiceId)||!optText(a.answerText)||
    (a.choiceId!==null&&a.answerText!==null))return false;
   ids.add(a.questionId);
  }
 }
 return true;
}

export function isTeacherOfficialGradeReceipt(
 input:unknown,submissionId:string,
):input is TeacherOfficialGradeReceipt{
 if(!isRecord(input)||!keys(input,[
   "submissionId","status","score","maxScore","feedback","gradedAt","publishedAt",
 ])||input.submissionId!==submissionId||
  !["graded","published"].includes(String(input.status))||
  !score(input.score)||!score(input.maxScore)||input.score>input.maxScore||
  !optText(input.feedback,4000)||!dateReq(input.gradedAt)||!date(input.publishedAt))return false;
 return input.status!=="published"||input.publishedAt!==null;
}

export function isStudentOfficialPublishedResult(
 input:unknown,assessmentId:string,
):input is StudentOfficialPublishedResult{
 return isRecord(input)&&keys(input,[
  "assessmentId","submissionId","score","maxScore","feedback","gradedAt","publishedAt",
 ])&&input.assessmentId===assessmentId&&str(input.submissionId)&&
 score(input.score)&&score(input.maxScore)&&input.score<=input.maxScore&&
 optText(input.feedback,4000)&&dateReq(input.gradedAt)&&dateReq(input.publishedAt);
}
export function formatOfficialPoints(value:number):string{
 return new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(value);
}
