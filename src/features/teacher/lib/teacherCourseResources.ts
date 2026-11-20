// SCHOOLNET S4-B.2-R : repartition complete des ressources du cours.
export type SectionRef={id:string};
export type ResourceSectionRef={section_id:string|null};

/**
 * Une ressource appartient soit a un chapitre de CE cours, soit a la liste
 * generale. Un lien de chapitre incoherent est affiche a part, jamais perdu
 * du total. Ne modifie aucun objet source.
 */
export function splitTeacherCourseResources<T extends ResourceSectionRef>(
  resources:readonly T[],
  sections:readonly SectionRef[],
):{
  bySection:Map<string,T[]>;
  general:T[];
  unmatched:T[];
  total:number;
}{
  const ids=new Set(sections.map(s=>s.id));
  const bySection=new Map<string,T[]>(sections.map(s=>[s.id,[]]));
  const general:T[]=[];
  const unmatched:T[]=[];
  for(const resource of resources){
    if(resource.section_id===null){
      general.push(resource);
    }else if(ids.has(resource.section_id)){
      bySection.get(resource.section_id)?.push(resource);
    }else{
      unmatched.push(resource);
    }
  }
  return {bySection,general,unmatched,total:resources.length};
}
