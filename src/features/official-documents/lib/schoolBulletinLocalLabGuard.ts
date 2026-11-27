/** S4-D.3l: a local-only QA workspace, NEVER a production authorization.
 * All SQL RPCs also check auth.uid(), live membership and explicit grants.
 */
export const S4D3L_SUPABASE_LOCAL_URL = "http://127.0.0.1:55421";
export const S4D3L_SCHOOLS = [
  {
    id:"00000000-0000-4000-8000-000000000010",
    name:"Établissement fictif A",
    schoolYearId:"00000000-0000-4000-8000-000000000020",
    classId:"00000000-0000-4000-8000-000000000030",
    periodId:"00000000-0000-4000-8000-000000000040",
    className:"Classe fictive A",periodName:"Trimestre fictif",
  },
  {
    id:"00000000-0000-4000-8000-000000000011",
    name:"Établissement fictif B",
    schoolYearId:"00000000-0000-4000-8000-000000000020",
    classId:"00000000-0000-4000-8000-000000000031",
    periodId:"00000000-0000-4000-8000-000000000041",
    className:"Classe fictive B",periodName:"Trimestre fictif",
  },
] as const;

export type S4D3LLabConfig = {
  dev:boolean;
  explicitLabOptIn:string | undefined;
  locationHostname:string;
  supabaseUrl:string;
};
export function isS4D3LLocalLab(config:S4D3LLabConfig):boolean {
  return config.dev===true && config.explicitLabOptIn==="1" &&
    ["localhost","127.0.0.1"].includes(config.locationHostname) &&
    config.supabaseUrl===S4D3L_SUPABASE_LOCAL_URL;
}
export function isS4D3LLabRequested(dev:boolean,search:string):boolean {
  return dev && new URLSearchParams(search).get("schoolnet_s4d3l_lab")==="1";
}
export function isLabSchoolAdmin(
  viewer: {id:string;role:string;isDemo?:boolean} | null,
):boolean {
  return Boolean(viewer && viewer.role==="school_admin" && viewer.isDemo===false &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(viewer.id));
}
