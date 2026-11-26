/** SCHOOLNET V2 — S4-C.5 : fiche de lecture individuelle d'une moyenne générale.
 * Réutilise EXCLUSIVEMENT une projection de classe déjà autorisée et validée.
 * Aucun recalcul, accès direct aux notes, publication ou appel Supabase.
 */
import {
  isOfficialGeneralPreview,
  type GeneralScope,
  type GeneralStudent,
} from "./schoolOfficialGeneralAveragesModel.ts";

export type GeneralStudentReview = {
  student: GeneralStudent;
  remainingSubjects: number;
  explanation: string;
};

/** L'identifiant d'élève est uniquement sélectionné parmi les lignes de la
 * projection courante. Une portée incorrecte ou une projection altérée échoue.
 */
export function getGeneralStudentReview(
  raw: unknown,
  scope: GeneralScope,
  studentId: string,
): GeneralStudentReview | null {
  if (!isOfficialGeneralPreview(raw, scope) || raw.state !== "preview" ||
      typeof studentId !== "string" || studentId.length === 0) {
    return null;
  }
  const row = raw.students.find((item) => item.studentId === studentId);
  if (!row) return null;

  const explanation = row.state === "ready"
    ? "Toutes les matières attendues sont calculables. Cette moyenne reste provisoire et non publiée."
    : row.state === "incomplete"
      ? "Certaines matières attendues sont encore incomplètes. Aucune moyenne générale ne peut être affichée."
      : "Une ou plusieurs matières attendues ne sont pas configurées. Aucune moyenne générale ne peut être affichée.";

  return {
    student: { ...row },
    remainingSubjects: row.expectedSubjects - row.readySubjects,
    explanation,
  };
}
