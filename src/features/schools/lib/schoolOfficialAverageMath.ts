/**
 * SCHOOLNET V2 / S4-C.3-B.1 — reference calculation contract ONLY.
 *
 * No database access, no persistence and no publication.
 * The future school-local PostgreSQL RPC remains the sole authority for
 * authorization, selection of published scores and calculations.
 * NEVER supply browser-visible assessment_submissions to this function.
 */
export type OfficialSubjectCoefficient={
 subjectId:string;
 coefficient:number|null;
};

export type OfficialAssessmentForAverage={
 assessmentId:string;
 subjectId:string;
 coefficient:number;
 includeInAverage:boolean;
 status:"published"|"not_published";
 score:number|null;
 maxScore:number|null;
 publishedAt:string|null;
};

export type OfficialSubjectPreview={
 subjectId:string;
 coefficient:number|null;
 averageOn20:number|null;
 includedAssessments:number;
 publishedAssessments:number;
 missingAssessments:number;
};

export type OfficialAveragePreview={
 previewOnly:true;
 state:"ready"|"incomplete"|"no_subjects";
 averageOn20:number|null;
 subjects:OfficialSubjectPreview[];
};

function validCoefficient(n:number):boolean{
 return Number.isFinite(n)&&n>=0.25&&n<=20&&
   Math.abs(Math.round(n*100)-n*100)<1e-7;
}
function validId(s:string):boolean{
 return typeof s==="string"&&s.length>0&&s.length<=100;
}
function round2(value:number):number{
 return Math.round((value+Number.EPSILON)*100)/100;
}
function invalid(reason:string):never{
 throw new Error("C3B1_INVALID_INPUT:"+reason);
}

/**
 * Pure, deterministic PREVIEW for one already-authorized student/period.
 * - score 0 is valid only when explicitly published;
 * - unpublished/missing grade is never silently transformed into zero;
 * - each subject average is weighted by assessment coefficients;
 * - general preview is weighted by subject coefficients;
 * - the general result stays null unless ALL configured, included grades
 *   for ALL subjects are published and all subject coefficients exist;
 * - no intermediate rounding (only the displayed final values).
 */
export function computeOfficialAveragePreview(
 subjects:readonly OfficialSubjectCoefficient[],
 assessments:readonly OfficialAssessmentForAverage[],
):OfficialAveragePreview{
 if(!Array.isArray(subjects)||subjects.length>200||
    !Array.isArray(assessments)||assessments.length>3000)
   invalid("TOO_MANY_ITEMS");
 const subjectSet=new Set<string>();
 for(const subject of subjects){
   if(!validId(subject.subjectId)||subjectSet.has(subject.subjectId)||
      !(subject.coefficient===null||validCoefficient(subject.coefficient)))
     invalid("INVALID_SUBJECT");
   subjectSet.add(subject.subjectId);
 }
 const assessmentSet=new Set<string>();
 const grouped=new Map<string,OfficialAssessmentForAverage[]>(
   subjects.map(s=>[s.subjectId,[]]),
 );
 for(const assessment of assessments){
   if(!validId(assessment.assessmentId)||
      assessmentSet.has(assessment.assessmentId)||
      !subjectSet.has(assessment.subjectId)||
      !validCoefficient(assessment.coefficient)||
      typeof assessment.includeInAverage!=="boolean"||
      !["published","not_published"].includes(assessment.status))
     invalid("INVALID_ASSESSMENT");
   assessmentSet.add(assessment.assessmentId);
   if(assessment.status==="not_published"){
     if(assessment.score!==null||assessment.maxScore!==null||
        assessment.publishedAt!==null)invalid("UNPUBLISHED_SCORE");
   }else{
     if(typeof assessment.score!=="number"||
        !Number.isFinite(assessment.score)||assessment.score<0||
        typeof assessment.maxScore!=="number"||
        !Number.isFinite(assessment.maxScore)||assessment.maxScore<=0||
        assessment.score>assessment.maxScore||
        typeof assessment.publishedAt!=="string"||
        !Number.isFinite(Date.parse(assessment.publishedAt)))
       invalid("INVALID_PUBLISHED_SCORE");
   }
   grouped.get(assessment.subjectId)?.push(assessment);
 }
 let weightedGeneral=0;
 let totalSubjectCoefficient=0;
 let complete=subjects.length>0;
 const previewSubjects:OfficialSubjectPreview[]=[];
 for(const subject of subjects){
   let assessmentNumerator=0;
   let assessmentDenominator=0;
   let includedAssessments=0;
   let publishedAssessments=0;
   for(const a of grouped.get(subject.subjectId)??[]){
     if(!a.includeInAverage)continue;
     includedAssessments++;
     if(a.status!=="published")continue;
     // Published score has passed strict validation above.
     publishedAssessments++;
     assessmentNumerator+=(a.score! / a.maxScore!)*20*a.coefficient;
     assessmentDenominator+=a.coefficient;
   }
   const missingAssessments=includedAssessments-publishedAssessments;
   const subjectAverage=assessmentDenominator>0?
      assessmentNumerator/assessmentDenominator:null;
   if(subject.coefficient===null||subjectAverage===null||
      missingAssessments!==0)complete=false;
   if(subject.coefficient!==null&&subjectAverage!==null){
      weightedGeneral+=subjectAverage*subject.coefficient;
      totalSubjectCoefficient+=subject.coefficient;
   }
   previewSubjects.push({
     subjectId:subject.subjectId,
     coefficient:subject.coefficient,
     averageOn20:subjectAverage===null?null:round2(subjectAverage),
     includedAssessments,
     publishedAssessments,
     missingAssessments,
   });
 }
 return {
   previewOnly:true,
   state:subjects.length===0?"no_subjects":complete?"ready":"incomplete",
   averageOn20:complete&&totalSubjectCoefficient>0?
      round2(weightedGeneral/totalSubjectCoefficient):null,
   subjects:previewSubjects,
 };
}
