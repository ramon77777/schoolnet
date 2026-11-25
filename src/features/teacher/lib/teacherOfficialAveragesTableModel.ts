import type {TeacherOfficialSubjectRow} from "./teacherOfficialAveragesModel";

export type OfficialAverageStatusFilter="all"|TeacherOfficialSubjectRow["state"];
export const OFFICIAL_AVERAGES_PAGE_SIZE=20;

/** Presentation-only filtering. All rows must already come from the teacher-scoped RPC. */
export function paginateOfficialAverageRows(
 rows:readonly TeacherOfficialSubjectRow[],
 query:string,
 status:OfficialAverageStatusFilter,
 page:number,
 pageSize=OFFICIAL_AVERAGES_PAGE_SIZE,
){
 const needle=query.trim().toLocaleLowerCase("fr-FR");
 const filtered=rows.filter(row=>
  (status==="all"||row.state===status)&&
  (!needle||row.studentName.toLocaleLowerCase("fr-FR").includes(needle)),
 ).sort((a,b)=>a.studentName.localeCompare(b.studentName,"fr",{numeric:true}));
 const safePageSize=Number.isSafeInteger(pageSize)&&pageSize>0?pageSize:OFFICIAL_AVERAGES_PAGE_SIZE;
 const pageCount=Math.max(1,Math.ceil(filtered.length/safePageSize));
 const requestedPage=Number.isSafeInteger(page)&&page>0?page:1;
 const currentPage=Math.min(requestedPage,pageCount);
 const start=(currentPage-1)*safePageSize;
 return {
  rows:filtered.slice(start,start+safePageSize),
  total:filtered.length,
  pageCount,
  currentPage,
 };
}
