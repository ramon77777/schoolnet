// SCHOOLNET - align academic class suggestions with the public level catalog.
// Pure/read-only logic: never creates a level, class or enrollment.
export type PublicSchoolLevel = {
  slug: string;
  name: string;
  short_label: string | null;
  is_visible: boolean;
};

export type AcademicSchoolLevel = {
  id: number;
  name: string;
};

export type AcademicSchoolClass = {
  id: string;
  name: string;
  level_id: number;
  school_year: string;
};

export type SchoolLevelState =
  | 'missing_request'
  | 'public_catalog_missing'
  | 'academic_catalog_missing'
  | 'academic_catalog_ambiguous'
  | 'public_catalog_missing_for_academic'
  | 'classes_missing'
  | 'classes_other_school_year'
  | 'classes_available';

export type SchoolLevelResolution = {
  state: SchoolLevelState;
  publicLevel: PublicSchoolLevel | null;
  academicLevels: AcademicSchoolLevel[];
  classes: AcademicSchoolClass[];
  currentClasses: AcademicSchoolClass[];
};

const ALIASES: Record<string, string> = {
  petitesection: 'ps', moyennesection: 'ms', grandesection: 'gs',
  courspreparatoire1: 'cp1', courspreparatoire2: 'cp2',
  courselementaire1: 'ce1', courselementaire2: 'ce2',
  coursmoyen1: 'cm1', coursmoyen2: 'cm2',
  sixieme: '6e', cinquieme: '5e', quatrieme: '4e', troisieme: '3e',
  seconde: '2nde', '2de': '2nde',
  premiere: '1ere', '1re': '1ere',
  tle: 'terminale',
};

export function normalizeSchoolLevel(value: string | null | undefined): string {
  const token = (value ?? '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ALIASES[token] ?? token;
}

export function resolveSchoolLevelCatalog(input: {
  requestedLevel: string | null;
  publicLevels: readonly PublicSchoolLevel[];
  academicLevels: readonly AcademicSchoolLevel[];
  classes: readonly AcademicSchoolClass[];
  currentYears: readonly string[];
}): SchoolLevelResolution {
  const key = normalizeSchoolLevel(input.requestedLevel);
  const publicLevel = key
    ? input.publicLevels.find((item) =>
      [item.slug, item.name, item.short_label].some((value) => normalizeSchoolLevel(value) === key),
    ) ?? null
    : null;
  const canonical = publicLevel ? normalizeSchoolLevel(publicLevel.slug) : key;
  const academicLevels = canonical
    ? input.academicLevels.filter((item) => normalizeSchoolLevel(item.name) === canonical)
    : [];
  const ids = new Set(academicLevels.map((item) => item.id));
  const classes = input.classes.filter((item) => ids.has(item.level_id))
    .sort((a, b) => a.school_year.localeCompare(b.school_year) || a.name.localeCompare(b.name));
  const currentClasses = input.currentYears.length
    ? classes.filter((item) => input.currentYears.includes(item.school_year))
    : classes;

  let state: SchoolLevelState;
  if (!key) state = 'missing_request';
  else if (!publicLevel && academicLevels.length === 0) state = 'public_catalog_missing';
  else if (!publicLevel) state = 'public_catalog_missing_for_academic';
  else if (academicLevels.length === 0) state = 'academic_catalog_missing';
  else if (academicLevels.length > 1) state = 'academic_catalog_ambiguous';
  else if (classes.length === 0) state = 'classes_missing';
  else if (currentClasses.length === 0) state = 'classes_other_school_year';
  else state = 'classes_available';

  return { state, publicLevel, academicLevels, classes, currentClasses };
}