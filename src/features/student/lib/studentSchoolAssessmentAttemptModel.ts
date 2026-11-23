import type {OfficialPreviewQuestion} from "./studentSchoolAssessmentPreviewModel";

export type OfficialAttemptStatus=
 "not_started"|"in_progress"|"submitted"|"graded"|"published";
export type OfficialAttemptAction="read"|"start"|"save"|"submit";
export type OfficialAttemptAnswer={
 questionId:string;
 choiceId:string|null;
 answerText:string|null;
};
export type OfficialAttemptState={
 courseId:string;
 assessmentId:string;
 attemptId:string|null;
 status:OfficialAttemptStatus;
 startedAt:string|null;
 submittedAt:string|null;
 serverNow:string;
 dueAt:string|null;
 expiresAt:string|null;
 freeformAnswer:string|null;
 answers:OfficialAttemptAnswer[];
};

const keys=[
 "courseId","assessmentId","attemptId","status","startedAt","submittedAt",
 "serverNow","dueAt","expiresAt","freeformAnswer","answers",
];
const answerKeys=["questionId","choiceId","answerText"];

function record(value:unknown):value is Record<string,unknown>{
 return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function exactKeys(value:Record<string,unknown>,expected:readonly string[]):boolean{
 return Object.keys(value).length===expected.length&&
  expected.every(key=>Object.prototype.hasOwnProperty.call(value,key));
}
function nonEmpty(value:unknown):value is string{
 return typeof value==="string"&&value.length>0&&value.length<=10000;
}
function nullableString(value:unknown):value is string|null{
 return value===null||(typeof value==="string"&&value.length<=10000);
}
function validTimestamp(value:unknown):value is string{
 return typeof value==="string"&&value.length<64&&Number.isFinite(Date.parse(value));
}
function nullableTimestamp(value:unknown):value is string|null{
 return value===null||validTimestamp(value);
}

/** Contrat strict : rejet de tout score, correction, reponse attendue ou identite tierce. */
export function isOfficialAttemptState(
 input:unknown,courseId:string,assessmentId:string,
):input is OfficialAttemptState{
 if(!record(input)||!exactKeys(input,keys)||
  input.courseId!==courseId||input.assessmentId!==assessmentId||
  ![ "not_started","in_progress","submitted","graded","published" ].includes(String(input.status))||
  !nullableString(input.attemptId)||
  !nullableTimestamp(input.startedAt)||!nullableTimestamp(input.submittedAt)||
  !validTimestamp(input.serverNow)||!nullableTimestamp(input.dueAt)||
  !nullableTimestamp(input.expiresAt)||!nullableString(input.freeformAnswer)||
  !Array.isArray(input.answers)||input.answers.length>200
 )return false;
 if(input.status==="not_started"&&input.attemptId!==null)return false;
 if(input.status!=="not_started"&&(!nonEmpty(input.attemptId)||input.startedAt===null))return false;
 const ids=new Set<string>();
 for(const answer of input.answers){
  if(!record(answer)||!exactKeys(answer,answerKeys)||
   !nonEmpty(answer.questionId)||ids.has(answer.questionId)||
   !nullableString(answer.choiceId)||!nullableString(answer.answerText)||
   (answer.choiceId!==null&&answer.answerText!==null))return false;
  ids.add(answer.questionId);
 }
 return true;
}

export function isOfficialOnlineMode(
 submissionMode:string|null,examContentMode:string|null,
):boolean{
 return submissionMode!=="file_upload"&&
  examContentMode!=="file_only"&&examContentMode!=="file_and_questions";
}

/** Seulement des reponses existant dans la liste publique B.1. */
export function buildOfficialAnswerPayload(
 questions:OfficialPreviewQuestion[],
 values:Record<string,string>,
):OfficialAttemptAnswer[]{
 const result:OfficialAttemptAnswer[]=[];
 for(const q of questions){
  const raw=values[q.id]?.trim()??"";
  if(!raw)continue;
  if(q.type==="short_text"){
   if(raw.length<=10000)result.push({questionId:q.id,choiceId:null,answerText:raw});
  }else if(q.choices.some(choice=>choice.id===raw)){
   result.push({questionId:q.id,choiceId:raw,answerText:null});
  }
 }
 return result;
}

export function restoreOfficialAnswers(
 questions:OfficialPreviewQuestion[],state:OfficialAttemptState,
):Record<string,string>{
 const qMap=new Map(questions.map(q=>[q.id,q]));
 const out:Record<string,string>={};
 for(const a of state.answers){
  const q=qMap.get(a.questionId);
  if(!q)continue;
  if(q.type==="short_text"&&a.answerText!==null)out[q.id]=a.answerText;
  else if(q.type!=="short_text"&&a.choiceId&&q.choices.some(c=>c.id===a.choiceId))
   out[q.id]=a.choiceId;
 }
 return out;
}

/** Heure du serveur transmise par B.2 : le compte a rebours reste informatif. */
export function remainingAttemptSeconds(state:OfficialAttemptState,receivedAtMs:number,nowMs:number):number|null{
 if(!state.expiresAt)return null;
 const duration=Date.parse(state.expiresAt)-Date.parse(state.serverNow)-(nowMs-receivedAtMs);
 return Math.max(0,Math.ceil(duration/1000));
}
