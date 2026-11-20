// SCHOOLNET S4-B.1 — Contrats stricts de la passerelle cours officiels.
// La V1 des cours reste independante. Les reponses sont validees avant usage.
export type TeacherSchoolCourseAssignment = {
  assignmentId: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  schoolYear: string;
  subjectName: string;
};
export type TeacherSchoolCourseLink = {
  courseId: string;
  courseTitle: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  schoolYear: string;
  subjectName: string;
  assignmentId: string;
};
export type TeacherSchoolCourseContext = {
  assignments: TeacherSchoolCourseAssignment[];
  links: TeacherSchoolCourseLink[];
};
export type AdminSchoolCourse = {
  courseId: string;
  courseTitle: string;
  classId: string;
  className: string;
  schoolYear: string;
  subjectName: string;
  teacherName: string;
};
export type AdminSchoolCourseCatalog = {
  schoolId: string;
  courses: AdminSchoolCourse[];
};

const assignmentFields = ["assignmentId","schoolId","schoolName","classId","className","schoolYear","subjectName"];
const linkFields = ["courseId","courseTitle","schoolId","schoolName","classId","className","schoolYear","subjectName","assignmentId"];
const courseFields = ["courseId","courseTitle","classId","className","schoolYear","subjectName","teacherName"];

function record(value: unknown): value is Record<string, unknown> {
  return value!==null && typeof value==="object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length===keys.length &&
    keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
}
function text(value: unknown): value is string {
  return typeof value==="string" && value.trim().length>0;
}
function validItem(value: unknown, keys: string[]): value is Record<string,string> {
  return record(value) && exactKeys(value,keys) && keys.every(k=>text(value[k]));
}

export function isTeacherSchoolCourseContext(value: unknown): value is TeacherSchoolCourseContext {
  if (!record(value) || !exactKeys(value,["assignments","links"]) ||
      !Array.isArray(value.assignments) || !Array.isArray(value.links)) return false;
  const assignmentIds = new Set<string>();
  for (const item of value.assignments) {
    if (!validItem(item,assignmentFields) || assignmentIds.has(item.assignmentId)) return false;
    assignmentIds.add(item.assignmentId);
  }
  const courseIds = new Set<string>();
  for (const item of value.links) {
    if (!validItem(item,linkFields) || courseIds.has(item.courseId)) return false;
    courseIds.add(item.courseId);
  }
  return true;
}

export function isAdminSchoolCourseCatalog(
  value: unknown,schoolId: string,
): value is AdminSchoolCourseCatalog {
  if (!text(schoolId) || !record(value) ||
      !exactKeys(value,["schoolId","courses"]) ||
      value.schoolId!==schoolId || !Array.isArray(value.courses)) return false;
  const courseIds = new Set<string>();
  for (const item of value.courses) {
    if (!validItem(item,courseFields) || courseIds.has(item.courseId)) return false;
    courseIds.add(item.courseId);
  }
  return true;
}
