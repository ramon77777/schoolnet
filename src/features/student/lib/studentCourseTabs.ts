// S4-B.2 UX: sélection pure, sans dépendance à la BDD ou au parcours V1.
export type StudentCourseTab = "official" | "complementary";

/**
 * Les paramètres explicites (liens, retour depuis le détail) ont priorité.
 * Sans paramètre, un élève ayant des cours officiels y arrive en premier ;
 * un apprenant indépendant (catalogue vide) voit ses cours complémentaires.
 * Pendant le chargement du catalogue, l'onglet officiel reste affiché.
 */
export function selectStudentCourseTab(
  requested: string | null,
  officialCount: number | null
): StudentCourseTab {
  if (requested === "official" || requested === "complementary") return requested;
  return officialCount === 0 ? "complementary" : "official";
}

export function groupOfficialCoursesBySchool<
  T extends { schoolId: string; schoolName: string; courseId: string; className: string; title: string }
>(
  courses: readonly T[]
): Array<{ schoolId: string; schoolName: string; courses: T[] }> {
  const groups = new Map<string, { schoolId: string; schoolName: string; courses: T[] }>();
  for (const course of courses) {
    const current = groups.get(course.schoolId);
    if (current) current.courses.push(course);
    else groups.set(course.schoolId, {
      schoolId: course.schoolId,
      schoolName: course.schoolName,
      courses: [course],
    });
  }
  const byName = (a: string, b: string) => a.localeCompare(b, "fr");
  for (const group of groups.values()) {
    group.courses.sort((a, b) =>
      byName(a.className, b.className) ||
      byName(a.title, b.title) ||
      byName(a.courseId, b.courseId)
    );
  }
  return Array.from(groups.values()).sort((a, b) =>
    byName(a.schoolName, b.schoolName) || byName(a.schoolId, b.schoolId)
  );
}
