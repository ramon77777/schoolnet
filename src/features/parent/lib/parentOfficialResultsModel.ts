// Published results only. The server verifies the family link and school context.
// Keep this module free of runtime imports so its contracts can be tested alone.
export type ParentOfficialChild = { childId: string; fullName: string };

export type ParentOfficialResult = {
  childId: string;
  childName: string;
  courseId: string;
  assessmentId: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  schoolYear: string;
  subjectName: string;
  courseTitle: string;
  title: string;
  type: "quiz" | "assignment" | "exam";
  maxScore: number;
  score: number;
  publishedAt: string;
};

export type ParentOfficialResults = {
  children: ParentOfficialChild[];
  results: ParentOfficialResult[];
};

export type ParentOfficialResultDetail =
  | { found: false }
  | { found: true; result: ParentOfficialResult; feedback: string | null };

export const EMPTY_PARENT_OFFICIAL_RESULTS: ParentOfficialResults = {
  children: [],
  results: [],
};

const RESULT_KEYS = [
  "childId", "childName", "courseId", "assessmentId", "schoolId", "schoolName",
  "classId", "className", "schoolYear", "subjectName", "courseTitle", "title",
  "type", "maxScore", "score", "publishedAt",
];

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function isParentOfficialUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validPublishedDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHour, offsetMinute] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && Number(hourText) < 24 && Number(minuteText) < 60 && Number(secondText) < 60
    && (offsetHour === undefined || (Number(offsetHour) < 24 && Number(offsetMinute) < 60));
}

export function isParentOfficialResult(value: unknown): value is ParentOfficialResult {
  if (!exactObject(value, RESULT_KEYS)) return false;
  return ["childId", "courseId", "assessmentId", "schoolId", "classId"]
    .every((key) => isParentOfficialUuid(value[key]))
    && ["childName", "schoolName", "className", "schoolYear", "subjectName", "courseTitle", "title"]
      .every((key) => nonempty(value[key]))
    && (value.type === "quiz" || value.type === "assignment" || value.type === "exam")
    && typeof value.maxScore === "number" && Number.isFinite(value.maxScore) && value.maxScore > 0
    && typeof value.score === "number" && Number.isFinite(value.score)
    && value.score >= 0 && value.score <= value.maxScore
    && validPublishedDate(value.publishedAt);
}

export function isParentOfficialResults(value: unknown): value is ParentOfficialResults {
  if (!exactObject(value, ["children", "results"]) || !Array.isArray(value.children)
    || !Array.isArray(value.results) || value.children.length > 1000 || value.results.length > 5000) return false;
  const children = new Map<string, string>();
  for (const child of value.children) {
    if (!exactObject(child, ["childId", "fullName"]) || !isParentOfficialUuid(child.childId)
      || !nonempty(child.fullName) || children.has(child.childId.toLowerCase())) return false;
    children.set(child.childId.toLowerCase(), child.fullName);
  }
  const results = new Set<string>();
  for (const row of value.results) {
    if (!isParentOfficialResult(row) || children.get(row.childId.toLowerCase()) !== row.childName) return false;
    const key = `${row.childId.toLowerCase()}:${row.assessmentId.toLowerCase()}`;
    if (results.has(key)) return false;
    results.add(key);
  }
  return true;
}

export function isParentOfficialResultDetail(value: unknown): value is ParentOfficialResultDetail {
  if (exactObject(value, ["found"]) && value.found === false) return true;
  return exactObject(value, ["found", "result", "feedback"]) && value.found === true
    && isParentOfficialResult(value.result)
    && (value.feedback === null || (typeof value.feedback === "string"
      && value.feedback.length <= 8000 && Array.from(value.feedback).length <= 4000));
}

export function parentResultsUrl(source: "official" | "legacy", childId?: string | null): string {
  const query = new URLSearchParams({ source });
  if (isParentOfficialUuid(childId)) query.set("childId", childId);
  return `/app/parent/results?${query.toString()}`;
}

export function parentOfficialResultUrl(childId: string, assessmentId: string, allChildren = false): string {
  if (!isParentOfficialUuid(childId) || !isParentOfficialUuid(assessmentId)) {
    throw new Error("Identifiant de résultat invalide.");
  }
  const query = new URLSearchParams({ source: "official", childId });
  if (allChildren) query.set("allChildren", "1");
  return `/app/parent/results/${assessmentId}?${query.toString()}`;
}
