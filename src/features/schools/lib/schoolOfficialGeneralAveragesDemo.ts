/** SCHOOLNET S4-C.3-C.4 - visual-only LOCAL DEV fixture.
 * Never sourced from Supabase, never activated in a production Vite build.
 * None of these values represents a real pupil, school, or grade.
 */
import type { SchoolGradeConfig } from "./schoolGradeConfigurationModel";
import type {
  GeneralScope, OfficialCurriculum, OfficialGeneralPreview,
  GeneralStudent,
} from "./schoolOfficialGeneralAveragesModel";

export const DEMO_SCHOOLS = [
  { id: "00000000-0000-4000-8000-000000000100", code: "FICT-A", name: "Établissement fictif A" },
  { id: "00000000-0000-4000-8000-000000000101", code: "FICT-B", name: "Établissement fictif B" },
] as const;

const YEAR = "00000000-0000-4000-8000-000000000110";
const MATH = "00000000-0000-4000-8000-000000000150";
const FRENCH = "00000000-0000-4000-8000-000000000151";
const SCIENCE = "00000000-0000-4000-8000-000000000152";
const id = (n: number) => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");

export function makeDemoGradeConfig(schoolId: string): SchoolGradeConfig {
  if (!DEMO_SCHOOLS.some((school) => school.id === schoolId))
    throw new Error("SCHOOLNET_DEMO_UNKNOWN_SCHOOL");
  const offset = schoolId === DEMO_SCHOOLS[0].id ? 0 : 10;
  const classIds = [id(0x120 + offset), id(0x121 + offset)];
  const periods = [
    { id: id(0x130 + offset), schoolYearId: YEAR, code: "T1",
      name: "1er trimestre", startsOn: "2026-09-01", endsOn: "2026-12-15", isLocked: false },
    { id: id(0x131 + offset), schoolYearId: YEAR, code: "T2",
      name: "2e trimestre", startsOn: "2027-01-04", endsOn: "2027-03-31", isLocked: false },
  ];
  const subjects = classIds.flatMap((classId, index) =>
    [[MATH, "Mathématiques"], [FRENCH, "Français"], [SCIENCE, "Sciences"]]
      .map(([subjectId, subjectName]) => ({
        classId, className: index === 0 ? "6e B (fictive)" : "5e A (fictive)",
        schoolYearId: YEAR, subjectId, subjectName,
      })));
  return {
    schoolId,
    years: [{ id: YEAR, name: "2026–2027 (fictive)", startsOn: "2026-09-01", endsOn: "2027-08-31" }],
    periods,
    subjects,
    subjectSettings: subjects.map((s, index) => ({
      periodId: periods[0].id, classId: s.classId, subjectId: s.subjectId,
      coefficient: index % 3 === 0 ? 2 : 1,
    })),
    assessments: [],
  };
}

export function makeDemoCurriculum(scope: GeneralScope): OfficialCurriculum {
  const config = makeDemoGradeConfig(scope.schoolId);
  const subjects = config.subjects.filter((s) => s.classId === scope.classId &&
    s.schoolYearId === scope.schoolYearId);
  const firstClass = subjects[0]?.className.startsWith("6e B");
  const firstPeriod = scope.periodId === config.periods[0]?.id;
  const approved = Boolean(firstClass && firstPeriod);
  const status: OfficialCurriculum["status"] =
    !firstPeriod ? "missing" : approved ? "approved" : "draft";
  return {
    ...scope, status,
    approvedAt: approved ? "2026-11-26T08:00:00.000Z" : null,
    subjects: status === "missing" ? [] : subjects.map((s) => ({
      subjectId: s.subjectId, subjectName: s.subjectName,
      coefficient: config.subjectSettings.find((coef) => coef.periodId === scope.periodId &&
        coef.classId === s.classId && coef.subjectId === s.subjectId)?.coefficient ?? null,
    })),
  };
}

export function makeDemoGeneralPreview(scope: GeneralScope): OfficialGeneralPreview {
  if (makeDemoCurriculum(scope).status !== "approved")
    return {
      ...scope, schoolAdminScoped: true, previewOnly: true,
      state: "not_configured", expectedSubjects: 0, studentCount: 0, students: [],
    };
  const subjects = 3;
  const students: GeneralStudent[] = Array.from({ length: 13 }, (_, index) => {
    const state: GeneralStudent["state"] = index % 6 === 3
      ? "not_configured" : index % 5 === 2 ? "incomplete" : "ready";
    const averageOn20 = state !== "ready" ? null :
      index === 0 ? 16.67 : index === 1 ? 0 : Math.round((11 + index * 0.47) * 100) / 100;
    return {
      studentId: id(0x300 + index + (scope.schoolId === DEMO_SCHOOLS[0].id ? 0 : 100)),
      studentName: "Élève fictif " + String(index + 1).padStart(2, "0"),
      state,
      averageOn20,
      expectedSubjects: subjects,
      readySubjects: state === "ready" ? subjects : index % 2 === 0 ? 2 : 1,
    };
  });
  return {
    ...scope, schoolAdminScoped: true, previewOnly: true,
    state: "preview", expectedSubjects: subjects,
    studentCount: students.length, students,
  };
}
