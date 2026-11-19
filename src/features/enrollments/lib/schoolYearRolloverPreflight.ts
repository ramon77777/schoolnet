/**
 * SCHOOLNET | Lot 5D-B — diagnostic d'annee en LECTURE SEULE.
 *
 * Ce diagnostic examine uniquement les donnees deja visibles dans le
 * navigateur. Il ne constitue JAMAIS une autorisation de bascule.
 *
 * La procedure SQL finale doit recomputer toutes les conditions en une
 * transaction, avec verrouillage et verification RLS / privileges serveur.
 */
export type PreflightSchoolYear = {
  id: string;
  name: string;
  starts_on: string;
  is_current: boolean;
};

export type PreflightClass = {
  id: string;
  school_id: string | null;
  learning_context: string | null;
  school_year_id: string | null;
  school_year: string;
};

export type PreflightEnrollment = {
  enrollment_id: string;
  student_id: string;
  school_year_id: string;
  class_id: string;
  status: string;
};

export type PreflightIssueCode =
  | "CURRENT_YEAR_NOT_UNIQUE"
  | "SOURCE_NOT_CURRENT"
  | "TARGET_NOT_LATER"
  | "SOURCE_EMPTY"
  | "SOURCE_DUPLICATE_STUDENT"
  | "SOURCE_CLASS_MISSING"
  | "SOURCE_CLASS_WRONG_YEAR"
  | "SOURCE_CLASS_OFFICIAL"
  | "TARGET_CLASS_OFFICIAL"
  | "TARGET_ACTIVE_OR_COMPLETED"
  | "OFFICIAL_CLASS_PRESENT";

export type PreflightIssue = {
  code: PreflightIssueCode;
  message: string;
  count: number;
};

export type PreflightReadOnlySnapshot = {
  sourceActive: number;
  targetExisting: number;
  targetActiveOrCompleted: number;
  sourceClassOutsideLegacy: number;
  officialClassesInSourceOrTarget: number;
  issues: PreflightIssue[];
  /** Toujours vrai : la lecture du navigateur n'est jamais exhaustive ni privilegiee. */
  requiresServerValidation: true;
};

export function inspectSchoolYearRolloverSnapshot({
  years,
  classes,
  enrollments,
  sourceYearId,
  targetYearId,
}: {
  years: readonly PreflightSchoolYear[];
  classes: readonly PreflightClass[];
  enrollments: readonly PreflightEnrollment[];
  sourceYearId: string | null;
  targetYearId: string | null;
}): PreflightReadOnlySnapshot {
  const issues: PreflightIssue[] = [];
  const add = (code: PreflightIssueCode, message: string, count = 1) => {
    issues.push({ code, message, count });
  };
  const activeYears = years.filter((year) => year.is_current);
  const source = years.find((year) => year.id === sourceYearId);
  const target = years.find((year) => year.id === targetYearId);

  if (activeYears.length !== 1) {
    add("CURRENT_YEAR_NOT_UNIQUE",
      "Le calendrier doit avoir exactement une annee courante ; verifier la base.",
      activeYears.length);
  }
  if (!source || !source.is_current || (activeYears.length === 1 && activeYears[0].id !== source.id)) {
    add("SOURCE_NOT_CURRENT",
      "La source selectionnee n'est pas l'unique annee courante.");
  }
  if (!target || !source || target.id === source.id || target.is_current ||
    target.starts_on <= source.starts_on) {
    add("TARGET_NOT_LATER",
      "La destination doit etre une annee posterieure non courante.");
  }

  const sourceRows = enrollments.filter((row) =>
    row.school_year_id === sourceYearId && row.status === "active");
  const targetRows = enrollments.filter((row) => row.school_year_id === targetYearId);
  const finalizedTarget = targetRows.filter((row) =>
    row.status === "active" || row.status === "completed");
  if (sourceRows.length === 0) {
    add("SOURCE_EMPTY", "Aucun dossier actif source ne peut etre reinscrit.", 0);
  }
  if (finalizedTarget.length > 0) {
    add("TARGET_ACTIVE_OR_COMPLETED",
      "L'annee cible contient des dossiers actifs ou termines : aucune bascule automatique.",
      finalizedTarget.length);
  }

  const classById = new Map(classes.map((row) => [row.id, row]));
  const seenStudents = new Set<string>();
  let duplicates = 0;
  let missingClasses = 0;
  let wrongYear = 0;
  let officialSources = 0;
  for (const row of sourceRows) {
    if (seenStudents.has(row.student_id)) duplicates += 1;
    seenStudents.add(row.student_id);
    const sourceClass = classById.get(row.class_id);
    if (!sourceClass) {
      missingClasses += 1;
      continue;
    }
    if (sourceClass.school_id !== null || sourceClass.learning_context === "school") {
      officialSources += 1;
      continue;
    }
    if (source && !(
      sourceClass.school_year_id === source.id ||
      (sourceClass.school_year_id === null && sourceClass.school_year === source.name)
    )) wrongYear += 1;
  }
  if (duplicates > 0) add("SOURCE_DUPLICATE_STUDENT",
    "Plusieurs dossiers actifs source concernent le meme apprenant.", duplicates);
  if (missingClasses > 0) add("SOURCE_CLASS_MISSING",
    "Une classe d'origine est absente du catalogue visible.", missingClasses);
  if (wrongYear > 0) add("SOURCE_CLASS_WRONG_YEAR",
    "Des dossiers actifs pointent vers des classes d'une autre annee.", wrongYear);
  if (officialSources > 0) add("SOURCE_CLASS_OFFICIAL",
    "Une inscription source reference une classe officielle d'etablissement.", officialSources);

  const official = classes.filter((row) =>
    row.school_id !== null || row.learning_context === "school");
  const officialInYear = official.filter((row) => (
    (source && (row.school_year_id === source.id ||
      (row.school_year_id === null && row.school_year === source.name))) ||
    (target && (row.school_year_id === target.id ||
      (row.school_year_id === null && row.school_year === target.name)))
  ));
  if (officialInYear.length > 0) add("OFFICIAL_CLASS_PRESENT",
    "Des classes officielles source/cible necessitent un circuit S3-C distinct.",
    officialInYear.length);

  const targetClassOfficial = targetRows.filter((row) => {
    const cls = classById.get(row.class_id);
    return !!cls && (cls.school_id !== null || cls.learning_context === "school");
  }).length;
  if (targetClassOfficial > 0) add("TARGET_CLASS_OFFICIAL",
    "Des dossiers de l'annee cible utilisent des classes officielles.",
    targetClassOfficial);

  return {
    sourceActive: sourceRows.length,
    targetExisting: targetRows.length,
    targetActiveOrCompleted: finalizedTarget.length,
    sourceClassOutsideLegacy: officialSources + missingClasses + wrongYear,
    officialClassesInSourceOrTarget: officialInYear.length,
    issues,
    requiresServerValidation: true,
  };
}
