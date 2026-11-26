/** SCHOOLNET S4-D.3b — DEV fixture only. Never called for hosted data.
 * The subject scores below are made-up illustration values: NOT server grades.
 * This fixture exercises the SAME strict shape as the future server RPC.
 */
import {
  isOfficialCurriculum, isOfficialGeneralPreview,
  type GeneralScope, type OfficialCurriculum, type OfficialGeneralPreview,
} from "../../schools/lib/schoolOfficialGeneralAveragesModel.ts";
import {
  validateAuthorizedReportCardPreview,
  type AuthorizedReportCardPreview,
} from "./schoolAuthorizedReportCardModel.ts";

const hundredth = (value: number) => Math.round(value * 100) / 100;

/** No hidden fallback to fixtures outside explicit DEV mode. */
export function makeDevAuthorizedReportCardPreview(
  scope: GeneralScope, studentId: string,
  curriculum: OfficialCurriculum, general: OfficialGeneralPreview,
): AuthorizedReportCardPreview {
  if (!import.meta.env.DEV) {
    throw new Error("Les données fictives du bulletin sont interdites hors développement.");
  }
  if (!isOfficialCurriculum(curriculum, scope) ||
      curriculum.status !== "approved" ||
      !isOfficialGeneralPreview(general, scope) || general.state !== "preview")
    throw new Error("Fixture de bulletin fictif non approuvée.");

  const student=general.students.find(item => item.studentId === studentId);
  if (!student) throw new Error("Élève fictif absent de la classe.");

  // The three illustrative scores are not teacher grades. In production the
  // dedicated server RPC returns actual, authorized subject averages instead.
  const avg=student.averageOn20;
  const delta=avg===null ? 0 : Math.min(0.5, avg/1.5, 20-avg);
  const illustrated=avg===null ? [] : [
    hundredth(avg+delta),hundredth(avg-delta/2),hundredth(avg-1.5*delta),
  ];
  const subjects=curriculum.subjects.map((subject,index)=>{
    const ready=student.state==="ready" || index<student.readySubjects;
    const state=ready ? "ready" as const :
      student.state==="not_configured" ? "not_configured" as const :
        "incomplete" as const;
    const fakeScore=ready ? (avg!==null ?
      illustrated[index] : hundredth(11 + index)) : null;
    return {
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      coefficient: subject.coefficient,
      state,
      averageOn20: fakeScore,
      includedAssessments: state==="not_configured" ? 0 : 1,
      publishedAssessments: ready ? 1 : 0,
      missingAssessments: state==="incomplete" ? 1 : 0,
    };
  });
  const draft={
    projection:"schoolnet_v2_report_card_provisional_v1" as const,
    ...scope,
    studentId,
    studentName:student.studentName,
    schoolAdminScoped:true as const,
    previewOnly:true as const,
    documentState:"provisional" as const,
    state:student.state,
    averageOn20:student.averageOn20,
    expectedSubjects:student.expectedSubjects,
    readySubjects:student.readySubjects,
    subjects,
  };
  return validateAuthorizedReportCardPreview(
    draft, scope, studentId, curriculum, general,
  );
}
