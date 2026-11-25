/** S4-C.3-B.6.1 — View routing only: V1 and V2 calculations stay independent. */
export type TeacherAverageTab="official"|"free";
export type TeacherAverageLayout="official"|"free"|"dual"|"empty";
export type TeacherAverageSelection={
 layout:TeacherAverageLayout;tab:TeacherAverageTab|null;
};

/** Fail closed for suspicious availability values, never infer rights from roles alone. */
export function selectTeacherAverageSpace(
 officialCount:number,legacyCount:number,requestedTab:string|null,
):TeacherAverageSelection{
 if(!Number.isSafeInteger(officialCount)||officialCount<0||
    !Number.isSafeInteger(legacyCount)||legacyCount<0){
  throw new Error("Comptage des affectations invalide.");
 }
 if(officialCount>0&&legacyCount>0){
  return {layout:"dual",tab:requestedTab==="free"?"free":"official"};
 }
 if(officialCount>0)return {layout:"official",tab:"official"};
 if(legacyCount>0)return {layout:"free",tab:"free"};
 return {layout:"empty",tab:null};
}

/** Deduplicate legacy class identifiers. Never load notes for navigation. */
export function countTeacherLegacyAverageClasses(data:unknown):number{
 if(data===null)return 0;
 if(!Array.isArray(data))throw new Error("Catalogue V1 invalide.");
 const ids=new Set<string>();
 for(const entry of data){
  if(entry===null||typeof entry!=="object"||Array.isArray(entry)||
     !("class_id" in entry)||typeof entry.class_id!=="string"||
     entry.class_id.trim().length===0){
   throw new Error("Catalogue V1 non conforme.");
  }
  ids.add(entry.class_id);
 }
 return ids.size;
}
