import type {StudentOfficialDashboard} from "./studentOfficialDashboardModel";

export type CombinedAssessmentType="Quiz"|"Devoir"|"Examen";
export type LegacyDashboardCourse={id:string;title:string};
export type LegacyDashboardAssessment={
  id:string;
  course_id:string;
  title:string;
  type:CombinedAssessmentType;
  completed:boolean;
  scorePercent:number|null; // Deja filtre : UNIQUEMENT si submission V1 published.
  submittedAt:string|null;
  created_at:string;
  due_at:string|null;
};
export type CombinedDueAssessment={
  id:string;
  title:string;
  type:CombinedAssessmentType;
  courseTitle:string;
  due_at:string;
  url:string;
};
export type CombinedDashboardSummary={
  courseCount:number;
  assessmentCount:number;
  completedCount:number;
  pendingCount:number;
  publishedCount:number;
  completionRate:number;
  averageScore:number|null; // Moyenne de resultats publies, PAS moyenne scolaire.
  quizCount:number;
  homeworkCount:number;
  examCount:number;
  courseProgressData:Array<{name:string;progression:number}>;
  assessmentMixData:Array<{name:string;value:number;color:string}>;
  scoreTrendData:Array<{name:string;score:number}>;
  upcomingAssessments:CombinedDueAssessment[];
};

type Entry={
  id:string;
  courseId:string;
  title:string;
  type:CombinedAssessmentType;
  completed:boolean;
  scorePercent:number|null;
  published:boolean;
  dueAt:string|null;
  chronology:string|null;
  url:string;
};
const typeFromOfficial=(type:string):CombinedAssessmentType=>
  type==="quiz"?"Quiz":type==="exam"?"Examen":"Devoir";
const shorten=(name:string,max:number)=>
  name.length<=max?name:name.slice(0,max-1)+"…";
const validPct=(v:number|null):v is number=>
  v!==null&&Number.isFinite(v)&&v>=0&&v<=100;
function dateTime(value:string|null):number{
  const time=value===null?NaN:Date.parse(value);
  return Number.isFinite(time)?time:0;
}

/**
 * Unite de mesure : evaluation (identifiee par UUID) et cours (UUID).
 * Les notes de copies officielles privees sont exclues; les copies publiees
 * sont prioritaires en cas de coexistence historique V1/V2 sur un meme UUID.
 */
export function combineStudentDashboards(
  legacyCourses:readonly LegacyDashboardCourse[],
  legacyAssessments:readonly LegacyDashboardAssessment[],
  official:StudentOfficialDashboard,
  now=Date.now(),
):CombinedDashboardSummary{
  const courses=new Map<string,string>();
  for(const course of legacyCourses)courses.set(course.id,course.title);
  for(const course of official.courses)courses.set(course.courseId,course.title);

  const assessments=new Map<string,Entry>();
  for(const a of legacyAssessments){
    if(!courses.has(a.course_id))continue;
    const published=validPct(a.scorePercent);
    assessments.set(a.id,{
      id:a.id,courseId:a.course_id,title:a.title,type:a.type,
      completed:a.completed,published,scorePercent:published?a.scorePercent:null,
      dueAt:a.due_at,chronology:a.submittedAt??a.created_at,
      url:a.type==="Devoir"?"/app/student/homework":"/app/student/assessments",
    });
  }
  for(const a of official.assessments){
    if(!courses.has(a.courseId))continue;
    const published=a.status==="published"&&a.publishedAt!==null
      &&a.maxScore!==null&&a.maxScore>0&&a.score!==null
      &&Number.isFinite(a.score)&&a.score>=0&&a.score<=a.maxScore;
    assessments.set(a.assessmentId,{
      id:a.assessmentId,courseId:a.courseId,title:a.title,
      type:typeFromOfficial(a.type),
      completed:["submitted","graded","published"].includes(a.status),
      published,
      scorePercent:published?Math.round((a.score!/a.maxScore!)*100):null,
      dueAt:a.dueAt,chronology:a.publishedAt??a.submittedAt,
      url:"/app/student/school-courses/"+a.courseId+"/assessments/"+a.assessmentId+"/take",
    });
  }

  const entries=[...assessments.values()];
  const completedCount=entries.filter(a=>a.completed).length;
  const scored=entries.filter((a):a is Entry&{scorePercent:number}=>
    a.published&&validPct(a.scorePercent));
  const quizCount=entries.filter(a=>a.type==="Quiz").length;
  const homeworkCount=entries.filter(a=>a.type==="Devoir").length;
  const examCount=entries.filter(a=>a.type==="Examen").length;
  const byCourse=new Map<string,{total:number;completed:number}>();
  for(const a of entries){
    const progress=byCourse.get(a.courseId)??{total:0,completed:0};
    progress.total++;
    if(a.completed)progress.completed++;
    byCourse.set(a.courseId,progress);
  }
  const courseProgressData=[...courses].flatMap(([courseId,title])=>{
    const counts=byCourse.get(courseId);
    return counts&&counts.total>0?[{
      name:shorten(title,18),
      progression:Math.round(100*counts.completed/counts.total),
    }]:[];
  });
  const assessmentMixData=[
    {name:"Quiz",value:quizCount,color:"#2563eb"},
    {name:"Devoirs",value:homeworkCount,color:"#8b5cf6"},
    {name:"Examens",value:examCount,color:"#ef4444"},
  ].filter(item=>item.value>0);
  const scoreTrendData=scored
    .slice().sort((a,b)=>dateTime(a.chronology)-dateTime(b.chronology))
    .slice(-8).map(a=>({name:shorten(a.title,14),score:a.scorePercent}));
  const upcomingAssessments=entries
    .filter(a=>!a.completed&&a.dueAt!==null&&dateTime(a.dueAt)>=now)
    .sort((a,b)=>dateTime(a.dueAt)-dateTime(b.dueAt))
    .slice(0,5).map(a=>({
      id:a.id,title:a.title,type:a.type,
      courseTitle:courses.get(a.courseId)??"Cours",
      due_at:a.dueAt!,url:a.url,
    }));
  return {
    courseCount:courses.size,assessmentCount:entries.length,
    completedCount,pendingCount:entries.length-completedCount,
    publishedCount:scored.length,
    completionRate:entries.length?Math.round(100*completedCount/entries.length):0,
    averageScore:scored.length?Math.round(
      scored.reduce((sum,a)=>sum+a.scorePercent,0)/scored.length):null,
    quizCount,homeworkCount,examCount,
    courseProgressData,assessmentMixData,scoreTrendData,upcomingAssessments,
  };
}
