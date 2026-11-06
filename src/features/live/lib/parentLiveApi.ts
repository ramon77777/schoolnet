import { supabase } from "@/lib/supabaseClient";

/** Données de consultation uniquement : aucun identifiant de salle Daily. */
export type ParentLiveChild = {
  id: string;
  name: string;
  classId: string | null;
  className: string;
};

type ParentProfile = { child_ids: string[] | null };
type ParentLink = { student_id: string };
type StudentProfile = { id: string; full_name: string | null };
type Enrollment = {
  student_id: string;
  class_id: string;
  enrolled_on: string;
};
type Assignment = { student_id: string; class_id: string };
type SchoolClass = { id: string; name: string };

function nonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Un enfant n'a de cours visibles que si son dossier est actif
 * ET qu'une affectation class_students correspond à sa classe.
 *
 * Toutes les requêtes utilisent la session Supabase du parent, avec RLS.
 * La policy RLS live_sessions reste l'autorité finale sur les séances.
 */
export async function listParentLiveChildren(
  parentId: string
): Promise<ParentLiveChild[]> {
  const { data: parent, error: parentError } = await supabase
    .from("profiles")
    .select("child_ids")
    .eq("id", parentId)
    .eq("role", "parent")
    .maybeSingle();

  if (parentError) throw parentError;
  if (!parent) {
    throw new Error("Profil Parent / Tuteur introuvable.");
  }

  // Les deux relations parent-enfant existantes sont prises en charge.
  // Si parent_links n'est pas lisible, le profil du parent sert de repli.
  const { data: linked, error: linkError } = await supabase
    .from("parent_links")
    .select("student_id")
    .eq("parent_id", parentId);

  const childIds = Array.from(
    new Set([
      ...(((parent as ParentProfile).child_ids ?? []).filter(nonEmptyId)),
      ...((linked ?? []) as ParentLink[]).map((row) => row.student_id).filter(nonEmptyId),
    ])
  );

  if (childIds.length === 0) {
    if (linkError) throw linkError;
    return [];
  }

  const [profilesResult, enrollmentResult, assignmentsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", childIds)
        .eq("role", "student")
        .order("full_name"),
      supabase
        .from("student_enrollments")
        .select("student_id, class_id, enrolled_on")
        .in("student_id", childIds)
        .eq("status", "active")
        .order("enrolled_on", { ascending: false }),
      supabase
        .from("class_students")
        .select("student_id, class_id")
        .in("student_id", childIds),
    ]);

  if (profilesResult.error) throw profilesResult.error;
  if (enrollmentResult.error) throw enrollmentResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;

  const profiles = (profilesResult.data ?? []) as StudentProfile[];
  const enrollments = (enrollmentResult.data ?? []) as Enrollment[];
  const memberships = new Set(
    ((assignmentsResult.data ?? []) as Assignment[])
      .map((entry) => entry.student_id + ":" + entry.class_id)
  );

  const classByChild = new Map<string, string>();
  for (const row of enrollments) {
    if (
      !classByChild.has(row.student_id) &&
      memberships.has(row.student_id + ":" + row.class_id)
    ) {
      classByChild.set(row.student_id, row.class_id);
    }
  }

  const classIds = [...new Set(classByChild.values())];
  let names = new Map<string, string>();
  if (classIds.length > 0) {
    const { data, error } = await supabase
      .from("classes")
      .select("id, name")
      .in("id", classIds);
    if (error) throw error;
    names = new Map(
      ((data ?? []) as SchoolClass[]).map((row) => [row.id, row.name])
    );
  }

  return profiles.map((student) => {
    const classId = classByChild.get(student.id) ?? null;
    return {
      id: student.id,
      name: student.full_name?.trim() || "Apprenant",
      classId,
      className: classId
        ? names.get(classId) || "Classe non renseignée"
        : "Aucune inscription active",
    };
  });
}
