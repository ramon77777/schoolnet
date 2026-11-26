/** SCHOOLNET V2 — S4-D.3a · Maquette de bulletin individuel.
 * UNIQUEMENT des fixtures de développement C.3-C.4 : aucun grade réel.
 * Les moyennes par matière présentées sont une illustration synthétique calculée
 * à partir de la moyenne générale déjà FICTIVE, pas un résultat de RPC.
 */
import {
  isOfficialCurriculum, isOfficialGeneralPreview,
  type GeneralScope, type GeneralStudent,
} from "../../schools/lib/schoolOfficialGeneralAveragesModel.ts";
import {
  DEMO_SCHOOLS, makeDemoCurriculum, makeDemoGeneralPreview,
  makeDemoGradeConfig,
} from "../../schools/lib/schoolOfficialGeneralAveragesDemo.ts";

export type FictionalSubjectRow = {
  subjectId: string;
  subjectName: string;
  coefficient: number;
  simulatedAverageOn20: number | null;
};

export type FictionalReportCard = {
  source: "schoolnet_v2_synthetic_report_card_v1";
  fictional: true;
  published: false;
  printableOfficialDocument: false;
  scope: GeneralScope;
  schoolName: string;
  className: string;
  yearName: string;
  periodName: string;
  student: GeneralStudent;
  subjects: FictionalSubjectRow[];
  generalAverageOn20: number | null;
  weightedControlOn20: number | null;
  missingSubjectBreakdown: boolean;
  attendance: null;
  ranking: null;
  staffComment: null;
};

function demonstrationScope(): GeneralScope {
  const schoolId = DEMO_SCHOOLS[0].id;
  const cfg = makeDemoGradeConfig(schoolId);
  return {
    schoolId,
    schoolYearId: cfg.years[0].id,
    classId: cfg.subjects[0].classId,
    periodId: cfg.periods[0].id,
  };
}

const roundHundredth = (value: number): number => Math.round(value * 100) / 100;

/** Expose only student IDs already present in the demo school A preview. */
export function listFictionalReportCardStudents(): ReadonlyArray<{
  studentId: string;
  studentName: string;
  state: GeneralStudent["state"];
}> {
  const scope=demonstrationScope();
  const preview=makeDemoGeneralPreview(scope);
  if (!isOfficialGeneralPreview(preview,scope) || preview.state!=="preview")
    return [];
  return preview.students.map(({studentId,studentName,state})=>({
    studentId,studentName,state,
  }));
}

/** Explicitly fictional, DEV fixture only. No conversion from live grade data. */
export function makeFictionalReportCard(
  requestedStudentId: string,
): FictionalReportCard | null {
  if (typeof requestedStudentId!=="string" || requestedStudentId.length===0)
    return null;
  const scope=demonstrationScope();
  const cfg=makeDemoGradeConfig(scope.schoolId);
  const curriculum=makeDemoCurriculum(scope);
  const preview=makeDemoGeneralPreview(scope);

  if (!isOfficialCurriculum(curriculum,scope) ||
      curriculum.status!=="approved" ||
      !isOfficialGeneralPreview(preview,scope) ||
      preview.state!=="preview" ||
      curriculum.subjects.length!==preview.expectedSubjects ||
      curriculum.subjects.length!==3 ||
      !curriculum.subjects.every((s,i)=>s.coefficient===[2,1,1][i]))
    return null;

  const student=preview.students.find(row=>row.studentId===requestedStudentId);
  if (!student) return null;

  const average=student.state==="ready" ? student.averageOn20 : null;
  // 2:1:1 fixture only. Deviations preserve the validated FICTIONAL mean.
  // These invented per-subject values are NEVER teacher notes or server results.
  const delta=average===null ? 0 : Math.min(0.5, average/1.5, 20-average);
  const mockScores=average===null ? [null,null,null] :
    [roundHundredth(average+delta),
      roundHundredth(average-delta/2),
      roundHundredth(average-1.5*delta)];
  const subjects=curriculum.subjects.map((subject,index)=>({
    subjectId:subject.subjectId,
    subjectName:subject.subjectName,
    coefficient:subject.coefficient as number,
    simulatedAverageOn20:mockScores[index],
  }));
  const weighted=average===null ? null : roundHundredth(
    subjects.reduce((sum,s)=>sum+(s.simulatedAverageOn20??0)*s.coefficient,0) /
    subjects.reduce((sum,s)=>sum+s.coefficient,0),
  );
  if (average!==null && (weighted===null || Math.abs(weighted-average)>0.01))
    return null;

  const className=cfg.subjects.find(s=>s.classId===scope.classId)?.className;
  const yearName=cfg.years.find(y=>y.id===scope.schoolYearId)?.name;
  const periodName=cfg.periods.find(p=>p.id===scope.periodId)?.name;
  if (!className || !yearName || !periodName) return null;

  return {
    source:"schoolnet_v2_synthetic_report_card_v1",
    fictional:true, published:false, printableOfficialDocument:false,
    scope:{...scope},
    schoolName:DEMO_SCHOOLS[0].name,
    className, yearName, periodName,
    student:{...student},
    subjects,
    generalAverageOn20:average,
    weightedControlOn20:weighted,
    missingSubjectBreakdown:average===null,
    attendance:null, ranking:null, staffComment:null,
  };
}
