// S4-B.2-R : reponse minimale et sans donnees nominatives pour l'enseignant.
export type TeacherCourseClassSummary={
  courseId:string;
  isOfficial:boolean;
  officialStudentCount:number;
};

export function isTeacherCourseClassSummary(
  value:unknown,expectedCourseId:string,
):value is TeacherCourseClassSummary{
  if(value===null||typeof value!=="object"||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  const expected=["courseId","isOfficial","officialStudentCount"];
  if(Object.keys(row).length!==expected.length||
     !expected.every(key=>Object.prototype.hasOwnProperty.call(row,key)))return false;
  return row.courseId===expectedCourseId &&
    typeof row.isOfficial==="boolean" &&
    Number.isSafeInteger(row.officialStudentCount) &&
    (row.officialStudentCount as number)>=0 &&
    (row.isOfficial===true||row.officialStudentCount===0);
}
