// SCHOOLNET Lot 5.C — modèle de lecture du portefeuille familial.
// Les liens "parent_links" filtrés par le JWT Parent sont la source d'autorité.
// child_ids sert de contrôle de cohérence et ne donne jamais accès à un profil.
export type ParentLinkRow = {student_id:string};
export type ParentChildProfile = {id:string;full_name:string|null;role:string|null};
export type ParentClassStudent = {
 student_id:string;class_id:string;created_at:string;
};
export type ParentClass = {id:string;name:string|null};
export type ParentChildClassState = 'assigned'|'unassigned'|'unavailable';
export type ParentChildCard = {
 id:string;name:string;classLabel:string;classState:ParentChildClassState;
};
export type ParentChildResult = {
 children:ParentChildCard[];
 linksMissingFromParentProfile:number;
 linkedProfilesNotVisible:number;
};

export function linkedStudentIds(rows:readonly ParentLinkRow[]):string[]{
 return [...new Set(rows.map(row=>row.student_id?.trim()).filter(
  (id):id is string=>typeof id==='string'&&id.length>0
 ))];
}

export function buildParentChildCards(input:{
 links:readonly ParentLinkRow[];
 parentChildIds:readonly string[]|null;
 profiles:readonly ParentChildProfile[];
 classStudents:readonly ParentClassStudent[];
 classes:readonly ParentClass[];
 classLookupUnavailable:boolean;
}):ParentChildResult{
 const ids=linkedStudentIds(input.links);
 const linked=new Set(ids);
 const checkedIds=new Set(input.parentChildIds??[]);
 const profiles=new Map(
  input.profiles.filter(p=>linked.has(p.id)&&p.role==='student')
    .map(p=>[p.id,p] as const),
 );
 const classes=new Map(input.classes.map(row=>[row.id,row] as const));
 const lastAssignment=new Map<string,ParentClassStudent>();
 // Even if historical rows are returned in arbitrary order, prefer the newest
 // recorded class association. It is not evidence of current-year enrolment.
 for(const row of input.classStudents){
  if(!linked.has(row.student_id))continue;
  const old=lastAssignment.get(row.student_id);
  if(!old||row.created_at>old.created_at)lastAssignment.set(row.student_id,row);
 }
 const children=ids.flatMap((id):ParentChildCard[]=>{
  const student=profiles.get(id);
  if(!student)return [];
  const assignment=lastAssignment.get(id);
  const title=assignment?classes.get(assignment.class_id)?.name?.trim():null;
  const classState:ParentChildClassState=input.classLookupUnavailable
   ? 'unavailable'
   : !assignment?'unassigned':title?'assigned':'unavailable';
  const classLabel=classState==='assigned'&&title
   ? title
   : classState==='unassigned'?'Affectation scolaire à venir'
   : 'Information de classe indisponible';
  return [{id,name:student.full_name?.trim()||'Apprenant SCHOOLNET',
   classLabel,classState}];
 }).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
 return {
  children,
  linksMissingFromParentProfile:ids.filter(id=>!checkedIds.has(id)).length,
  linkedProfilesNotVisible:ids.filter(id=>!profiles.has(id)).length,
 };
}
