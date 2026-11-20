// SCHOOLNET V2 - S4-B.3-B.1 : projection strictement publique des questions
// des evaluations officielles accessibles a l'eleve. Aucun champ de correction
// isCorrect, is_correct, note, reponse attendue, utilisateur ou soumission.
export type OfficialPreviewQuestionType="mcq"|"true_false"|"short_text";
export type OfficialPreviewChoice={
  id:string;
  text:string;
  orderIndex:number;
};
export type OfficialPreviewQuestion={
  id:string;
  type:OfficialPreviewQuestionType;
  prompt:string;
  orderIndex:number;
  choices:OfficialPreviewChoice[];
};
export type StudentOfficialAssessmentPreview={
  courseId:string;
  assessmentId:string;
  title:string;
  type:"quiz"|"assignment"|"exam";
  description:string|null;
  dueAt:string|null;
  timeLimitMinutes:number|null;
  maxScore:number|null;
  submissionMode:string|null;
  examContentMode:string|null;
  instructionFileName:string|null;
  sectionTitle:string|null;
  questions:OfficialPreviewQuestion[];
};

const previewKeys=[
  "courseId","assessmentId","title","type","description","dueAt",
  "timeLimitMinutes","maxScore","submissionMode","examContentMode",
  "instructionFileName","sectionTitle","questions",
];
const questionKeys=["id","type","prompt","orderIndex","choices"];
const choiceKeys=["id","text","orderIndex"];

function record(value:unknown):value is Record<string,unknown>{
  return value!==null&&typeof value==="object"&&!Array.isArray(value);
}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]):boolean{
  return Object.keys(value).length===keys.length&&
    keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
}
function nonempty(value:unknown):value is string{
  return typeof value==="string"&&value.trim().length>0&&value.length<=10000;
}
function nullableText(value:unknown):value is string|null{
  return value===null||(typeof value==="string"&&value.length<=10000);
}
function validDate(value:unknown):value is string|null{
  return value===null||(typeof value==="string"&&value.length<=40&&
    Number.isFinite(Date.parse(value)));
}
function integer(value:unknown):value is number{
  return Number.isSafeInteger(value)&&Number(value)>=0;
}
function optionalPositiveInt(value:unknown):value is number|null{
  return value===null||(integer(value)&&Number(value)>0&&Number(value)<=100000);
}
function optionalScore(value:unknown):value is number|null{
  return value===null||(typeof value==="number"&&
    Number.isFinite(value)&&value>=0&&value<=1000000);
}
export function isStudentOfficialAssessmentPreview(
 data:unknown,expectedCourseId:string,expectedAssessmentId:string,
):data is StudentOfficialAssessmentPreview{
 if(!nonempty(expectedCourseId)||!nonempty(expectedAssessmentId)||
    !record(data)||!exactKeys(data,previewKeys)||
    data.courseId!==expectedCourseId||
    data.assessmentId!==expectedAssessmentId||
    !nonempty(data.title)||!["quiz","assignment","exam"].includes(String(data.type))||
    !nullableText(data.description)||!validDate(data.dueAt)||
    !optionalPositiveInt(data.timeLimitMinutes)||
    !optionalScore(data.maxScore)||
    !nullableText(data.submissionMode)||
    !nullableText(data.examContentMode)||
    !nullableText(data.instructionFileName)||
    !nullableText(data.sectionTitle)||
    !Array.isArray(data.questions)||data.questions.length>500)return false;

 const questionIds=new Set<string>();
 for(const question of data.questions){
  if(!record(question)||!exactKeys(question,questionKeys)||
     !nonempty(question.id)||questionIds.has(question.id)||
     !["mcq","true_false","short_text"].includes(String(question.type))||
     !nonempty(question.prompt)||!integer(question.orderIndex)||
     !Array.isArray(question.choices)||question.choices.length>100)return false;
  questionIds.add(question.id);
  const choiceIds=new Set<string>();
  for(const choice of question.choices){
   if(!record(choice)||!exactKeys(choice,choiceKeys)||
      !nonempty(choice.id)||choiceIds.has(choice.id)||
      !nonempty(choice.text)||!integer(choice.orderIndex))return false;
   choiceIds.add(choice.id);
  }
 }
 return true;
}
