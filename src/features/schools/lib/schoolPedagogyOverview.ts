import type { SchoolAssignmentsCatalog } from "./schoolAssignmentsApi";
import type { SchoolMembership, SchoolRecord } from "./schoolManagementApi";

// S4-A - Vue de lecture uniquement, calculée à partir du catalogue S3-C
// contrôlé côté PostgreSQL pour l'établissement de l'administrateur local.
// Ce résumé ne requalifie ni les cours libres ni les classes historiques.
export type SchoolPedagogyClass = {
  id: string;
  name: string;
  schoolYear: string;
  levelName: string;
  studentsAssigned: number;
  teachersAssigned: number;
  subjects: string[];
};

export type SchoolPedagogyOverview = {
  schoolId: string;
  classes: SchoolPedagogyClass[];
  classCount: number;
  affiliatedStudentCount: number;
  affiliatedTeacherCount: number;
  assignedStudentCount: number;
  assignedTeacherCount: number;
  teachingAssignmentCount: number;
};

export function buildSchoolPedagogyOverview(
  catalog: SchoolAssignmentsCatalog,
  expectedSchoolId: string,
): SchoolPedagogyOverview {
  // Refus explicite de tout catalogue dont le tenant ne correspond pas.
  if (!expectedSchoolId || catalog.school_id !== expectedSchoolId) {
    throw new Error("Le catalogue ne correspond pas à l'établissement autorisé.");
  }

  const classesById = new Map(
    catalog.classes.map((item) => [item.id, item]),
  );
  const studentsByClass = new Map<string, Set<string>>();
  const teachersByClass = new Map<string, Set<string>>();
  const subjectsByClass = new Map<string, Map<string, string>>();
  const allStudents = new Set<string>();
  const allTeachers = new Set<string>();
  const teachingLinks = new Set<string>();

  for (const row of catalog.student_assignments) {
    const schoolClass = classesById.get(row.class_id);
    if (!schoolClass || row.school_year_id !== schoolClass.school_year_id ||
        row.status !== "active" || row.effective_active !== true) continue;
    if (!studentsByClass.has(row.class_id)) {
      studentsByClass.set(row.class_id, new Set());
    }
    studentsByClass.get(row.class_id)!.add(row.student_id);
    allStudents.add(row.student_id);
  }

  for (const row of catalog.teacher_assignments) {
    const schoolClass = classesById.get(row.class_id);
    if (!schoolClass || row.school_year_id !== schoolClass.school_year_id ||
        row.status !== "active" || row.effective_active !== true) continue;
    if (!teachersByClass.has(row.class_id)) {
      teachersByClass.set(row.class_id, new Set());
    }
    if (!subjectsByClass.has(row.class_id)) {
      subjectsByClass.set(row.class_id, new Map());
    }
    teachersByClass.get(row.class_id)!.add(row.teacher_id);
    subjectsByClass.get(row.class_id)!.set(row.subject_id, row.subject_name);
    allTeachers.add(row.teacher_id);
    teachingLinks.add(JSON.stringify([row.class_id, row.teacher_id, row.subject_id]));
  }

  const classes = [...classesById.values()].map((item) => ({
    id: item.id,
    name: item.name,
    schoolYear: item.school_year,
    levelName: item.level_name,
    studentsAssigned: studentsByClass.get(item.id)?.size ?? 0,
    teachersAssigned: teachersByClass.get(item.id)?.size ?? 0,
    subjects: [...(subjectsByClass.get(item.id)?.values() ?? [])]
      .filter((value) => value.trim().length > 0)
      .sort((a, b) => a.localeCompare(b, "fr")),
  })).sort((a, b) =>
    b.schoolYear.localeCompare(a.schoolYear, "fr") ||
    a.name.localeCompare(b.name, "fr"),
  );

  // Aucune donnée personnelle n'est retournée par ce modèle d'affichage.
  return {
    schoolId: catalog.school_id,
    classes,
    classCount: classes.length,
    affiliatedStudentCount: new Set(catalog.students.map((item) => item.id)).size,
    affiliatedTeacherCount: new Set(catalog.teachers.map((item) => item.id)).size,
    assignedStudentCount: allStudents.size,
    assignedTeacherCount: allTeachers.size,
    teachingAssignmentCount: teachingLinks.size,
  };
}

// Un administrateur ne doit voir que les établissements où il dispose
// lui-même d'une appartenance school_admin active, même si la RLS autorise
// également la lecture d'une autre école au titre d'un rôle local différent.
// Le contrôle d'accès définitif reste assuré par les RPC PostgreSQL.
export function filterSchoolsForLocalAdmin(
  schools: SchoolRecord[],
  memberships: SchoolMembership[],
  userId: string,
): SchoolRecord[] {
  if (!userId) return [];
  const administeredSchoolIds = new Set(
    memberships
      .filter((membership) =>
        membership.user_id === userId &&
        membership.member_role === "school_admin" &&
        membership.status === "active",
      )
      .map((membership) => membership.school_id),
  );
  return schools.filter((school) =>
    school.status === "active" && administeredSchoolIds.has(school.id),
  );
}
