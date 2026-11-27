/**
 * SCHOOLNET V2 · S4-D.3e — non-persisted administrative review.
 * This is a PRESENTATION aid over an ALREADY validated S4-D.3b server projection.
 * It is NOT an authorization, an approval, an official snapshot or a publication gate.
 * The verified raw result is supplied by SchoolAuthorizedStudentReportCard.
 */
import type { OfficialCurriculum } from "../../schools/lib/schoolOfficialGeneralAveragesModel.ts";
import type {
  AuthorizedReportCardPreview,
} from "./schoolAuthorizedReportCardModel.ts";

export type ReportCardAcademicLabels = {
  schoolName: string;
  schoolYearName: string;
  className: string;
  periodName: string;
};
export type AdministrativeCheck = {
  id: "identity" | "curriculum" | "subject_results" | "complementary";
  label: string;
  status: "verified" | "attention" | "not_integrated";
  explanation: string;
};
export type AdministrativeSubjectFinding = {
  subjectId: string;
  subjectName: string;
  status: "incomplete" | "not_configured" | "unavailable";
  missingAssessments: number;
  explanation: string;
};
export type AdministrativeReview = {
  academicStatus: "pedagogically_complete" | "to_complete" | "not_configured";
  completeSubjects: number;
  expectedSubjects: number;
  findings: AdministrativeSubjectFinding[];
  checks: AdministrativeCheck[];
  publicationAuthorized: false;
};

/**
 * Uses subject states and counts from the server, NOT grade calculation.
 * All official publication rules, rankings, attendance and comments are
 * unspecified and remain outside this review.
 */
export function makeReportCardAdministrativeReview(
  report: AuthorizedReportCardPreview,
  curriculum: OfficialCurriculum,
  labels: ReportCardAcademicLabels,
): AdministrativeReview {
  // Defensive same-context check; the authoritative security control remains
  // the existing school-admin RPC and S4-D.3b projection validator.
  const idsMatch = (["schoolId", "schoolYearId", "classId", "periodId"] as const)
    .every(field => report[field] === curriculum[field]);
  const catalog = new Map(curriculum.subjects.map(subject => [subject.subjectId, subject]));
  const catalogMatch = catalog.size === report.expectedSubjects &&
    curriculum.subjects.length === report.expectedSubjects &&
    report.subjects.length === report.expectedSubjects &&
    report.subjects.every(subject => {
      const expected = catalog.get(subject.subjectId);
      return expected?.subjectName === subject.subjectName &&
        expected.coefficient === subject.coefficient;
    });
  if (!idsMatch || !catalogMatch || curriculum.status !== "approved" ||
      report.projection !== "schoolnet_v2_report_card_provisional_v1" ||
      report.previewOnly !== true || report.schoolAdminScoped !== true ||
      report.documentState !== "provisional") {
    throw new Error("Contrôle administratif indisponible : projection ou programme incohérent.");
  }

  const identityComplete = [
    report.studentName, labels.schoolName, labels.schoolYearName,
    labels.className, labels.periodName,
  ].every(value => typeof value === "string" &&
    value.trim().length > 0 && value === value.trim());

  const findings: AdministrativeSubjectFinding[] = [];
  for (const subject of report.subjects) {
    if (subject.state === "not_configured") {
      findings.push({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        status: "not_configured",
        missingAssessments: subject.missingAssessments,
        explanation: "Matière attendue, mais paramétrage ou résultat non disponible.",
      });
    } else if (subject.state === "incomplete") {
      findings.push({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        status: "incomplete",
        missingAssessments: subject.missingAssessments,
        explanation: subject.missingAssessments > 0
          ? subject.missingAssessments + " évaluation(s) attendue(s) non publiée(s)."
          : "Moyenne de matière indisponible malgré le programme attendu.",
      });
    } else if (subject.averageOn20 === null) {
      // Transfer review can suppress every otherwise-ready subject average.
      findings.push({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        status: "unavailable",
        missingAssessments: 0,
        explanation: "Résultat masqué ou indisponible : vérifier le dossier avant toute décision.",
      });
    }
  }

  const allGradesAvailable = report.state === "ready" &&
    report.averageOn20 !== null &&
    report.readySubjects === report.expectedSubjects &&
    findings.length === 0;
  const academicStatus: AdministrativeReview["academicStatus"] =
    report.state === "not_configured" ? "not_configured" :
    allGradesAvailable && identityComplete ? "pedagogically_complete" : "to_complete";

  const checks: AdministrativeCheck[] = [
    {
      id: "identity", label: "Informations scolaires",
      status: identityComplete ? "verified" : "attention",
      explanation: identityComplete
        ? "Élève, établissement, année, classe et période identifiés."
        : "Une information scolaire manque : vérifier les libellés du contexte.",
    },
    {
      id: "curriculum", label: "Matières et coefficients",
      status: "verified",
      explanation: "Programme approuvé : matières et coefficients cohérents avec la projection.",
    },
    {
      id: "subject_results", label: "Résultats par matière",
      status: allGradesAvailable ? "verified" : "attention",
      explanation: allGradesAvailable
        ? "Toutes les matières attendues possèdent un résultat calculable."
        : "Au moins un résultat ou une condition de calcul reste à vérifier.",
    },
    {
      id: "complementary", label: "Informations complémentaires",
      status: "not_integrated",
      explanation: "Rang, absences et appréciation non intégrés à ce contrôle ; aucune donnée inventée.",
    },
  ];

  return {
    academicStatus,
    completeSubjects: report.subjects.filter(subject =>
      subject.state === "ready" && subject.averageOn20 !== null).length,
    expectedSubjects: report.expectedSubjects,
    findings,
    checks,
    publicationAuthorized: false,
  };
}
