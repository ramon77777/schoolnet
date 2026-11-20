// SCHOOLNET V2 S4-B.2 — contrat strict des cours officiels des eleves.
// Aucune identite d'eleve, aucune inscription V1 dans ces reponses.
export type StudentSchoolCourse = {
  courseId: string;
  title: string;
  description: string | null;
  schoolId: string;
  schoolName: string;
  classId: string;
  className: string;
  schoolYear: string;
  subjectName: string;
};
export type StudentSchoolCourseCatalog = { courses: StudentSchoolCourse[] };
export type StudentSchoolSection = {
  id: string; title: string; orderIndex: number;
};
export type StudentSchoolResource = {
  id: string; sectionId: string | null; title: string;
  type: string; url: string; isDownloadable: boolean;
};
export type StudentSchoolCourseDetail = {
  courseId: string; title: string; description: string | null;
  schoolName: string; className: string; schoolYear: string; subjectName: string;
  sections: StudentSchoolSection[]; resources: StudentSchoolResource[];
};
const courseKeys = [
  "courseId","title","description","schoolId","schoolName",
  "classId","className","schoolYear","subjectName",
];
const detailKeys = [
  "courseId","title","description","schoolName","className",
  "schoolYear","subjectName","sections","resources",
];
const sectionKeys = ["id","title","orderIndex"];
const resourceKeys = ["id","sectionId","title","type","url","isDownloadable"];
function object(x:unknown):x is Record<string,unknown> {
  return x!==null && typeof x==="object" && !Array.isArray(x);
}
function exact(o:Record<string,unknown>,keys:string[]):boolean {
  return Object.keys(o).length===keys.length &&
    keys.every(key=>Object.prototype.hasOwnProperty.call(o,key));
}
function nonempty(x:unknown):x is string {
  return typeof x==="string" && x.trim().length>0;
}
function nullableText(x:unknown):x is string|null {
  return x===null || typeof x==="string";
}
export function safeSchoolResourceUrl(value:unknown):value is string {
  if (typeof value!=="string" || !value.startsWith("https://") ||
      /[\u0000-\u0020\u007f]/.test(value) || value.length>4096) return false;
  try {
    const url=new URL(value);
    return url.protocol==="https:" && !!url.hostname &&
      !url.username && !url.password;
  } catch { return false; }
}
export function isStudentSchoolCourseCatalog(data:unknown):data is StudentSchoolCourseCatalog {
  if(!object(data)||!exact(data,["courses"])||!Array.isArray(data.courses))return false;
  const ids=new Set<string>();
  for(const item of data.courses){
    if(!object(item)||!exact(item,courseKeys) ||
       !nonempty(item.courseId)||!nonempty(item.title)||!nullableText(item.description)||
       !nonempty(item.schoolId)||!nonempty(item.schoolName)||!nonempty(item.classId)||
       !nonempty(item.className)||!nonempty(item.schoolYear)||!nonempty(item.subjectName)||
       ids.has(item.courseId)) return false;
    ids.add(item.courseId);
  }
  return true;
}
export function isStudentSchoolCourseDetail(
  data:unknown,expectedCourseId:string,
):data is StudentSchoolCourseDetail {
  if(!nonempty(expectedCourseId)||!object(data)||!exact(data,detailKeys) ||
     data.courseId!==expectedCourseId||!nonempty(data.title)||
     !nullableText(data.description)||!nonempty(data.schoolName)||
     !nonempty(data.className)||!nonempty(data.schoolYear)||
     !nonempty(data.subjectName)||!Array.isArray(data.sections)||
     !Array.isArray(data.resources))return false;
  const sectionIds=new Set<string>();
  for(const section of data.sections){
    if(!object(section)||!exact(section,sectionKeys)||
       !nonempty(section.id)||!nonempty(section.title)||
       !Number.isSafeInteger(section.orderIndex)||
       (section.orderIndex as number)<0||sectionIds.has(section.id))return false;
    sectionIds.add(section.id);
  }
  const resourceIds=new Set<string>();
  for(const resource of data.resources){
    if(!object(resource)||!exact(resource,resourceKeys)||
       !nonempty(resource.id)||!nonempty(resource.title)||
       !nonempty(resource.type)||!safeSchoolResourceUrl(resource.url)||
       (resource.sectionId!==null && (!nonempty(resource.sectionId)||!sectionIds.has(resource.sectionId)))||
       typeof resource.isDownloadable!=="boolean"||resourceIds.has(resource.id))return false;
    resourceIds.add(resource.id);
  }
  return true;
}
