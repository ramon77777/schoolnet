import type {SchoolGradePeriod} from "./schoolGradeConfigurationModel";

/** Only the period KIND is selected in the browser; PostgreSQL owns the final code. */
export type SchoolPeriodKind="trimester"|"semester"|"custom";
export function isSchoolPeriodKind(value:unknown):value is SchoolPeriodKind{
 return value==="trimester"||value==="semester"||value==="custom";
}
export function periodPrefix(kind:SchoolPeriodKind):"T"|"S"|"P"{
 return kind==="trimester"?"T":kind==="semester"?"S":"P";
}
export function periodKindFromCode(code:string):SchoolPeriodKind{
 if(/^T[1-9][0-9]*$/i.test(code))return "trimester";
 if(/^S[1-9][0-9]*$/i.test(code))return "semester";
 return "custom";
}
/** Preview only. Server locks the school row and assigns the authoritative number. */
export function previewNextPeriodCode(periods:ReadonlyArray<Pick<SchoolGradePeriod,"code">>,
 kind:SchoolPeriodKind):string|null{
 const prefix=periodPrefix(kind);
 const pattern=new RegExp("^"+prefix+"([0-9]+)$","i");
 let highest=0;
 for(const p of periods){
  const match=pattern.exec(p.code);
  if(!match)continue;
  const value=Number(match[1]);
  if(!Number.isSafeInteger(value))return null;
  highest=Math.max(highest,value);
 }
 const next=highest+1;
 if(!Number.isSafeInteger(next)||
  (kind==="trimester"&&next>3)||
  (kind==="semester"&&next>2)||
  (kind==="custom"&&next>9999))return null;
 return prefix+(kind==="custom"?String(next).padStart(2,"0"):String(next));
}
export function suggestedPeriodName(kind:SchoolPeriodKind,code:string|null):string{
 if(!code)return "";
 const rank=Number(code.slice(1));
 const names=["Premier","Deuxième","Troisième"];
 if(kind==="trimester")return names[rank-1]+" trimestre";
 if(kind==="semester")return names[rank-1]+" semestre";
 return "Période personnalisée "+String(rank);
}
