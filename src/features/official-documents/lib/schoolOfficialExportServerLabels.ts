/** SCHOOLNET V2 S4-D.2c.4 — STRICT RESPONSE SHAPE for DB-derived labels.
 * This is an isolated contract, never called by the application yet.
 * Browser checks cannot substitute auth.uid() + RLS/privileged RPC checks.
 * Live export release gate remains FALSE in S4-D.2c.1.
 */
import {
  assertMatchingOfficialExportProjection,
  makeOfficialExportRpcArgs,
  type VerifiedExportViewer,
} from "./schoolOfficialExportPreviewBridge.ts";
import type { OfficialExportProjection } from "./schoolOfficialExportProjectionModel.ts";
import type { ExportRequest } from "./schoolOfficialExportPlanning.ts";

export const SCHOOLNET_EXPORT_LABELS_RPC = "schoolnet_official_export_labels" as const;

export type ServerExportLabelArgs = {
  p_school_id: string;
  p_period_id: string;
  p_class_id: string;
  p_kind: "class_general" | "subject_period";
  p_subject_id: string | null;
};

export type VerifiedServerExportLabels = {
  source: "schoolnet_v2_db_scoped_labels_v1";
  previewOnly: true;
  kind: "class_general" | "subject_period";
  roleScope: "school_admin" | "teacher";
  schoolId: string;
  schoolYearId: string;
  classId: string;
  periodId: string;
  subjectId: string | null;
  schoolName: string;
  schoolYear: string;
  className: string;
  periodName: string;
  subjectName: string | null;
  activeRosterCount: number;
};

const own = (o: object,k: string) =>
  Object.prototype.hasOwnProperty.call(o,k);
const isObject = (x: unknown): x is Record<string,unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const field = (value: unknown, max: number): value is string =>
  typeof value === "string" &&
  value.length > 0 && value.length <= max && value.trim() === value &&
  !Array.from(value).some(c => {
    const cp = c.codePointAt(0) ?? 0;
    return cp < 32 || cp === 127;
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** No free-form request fields, claims or user IDs are sent to the SQL RPC. */
export function makeServerExportLabelArgs(
  request: ExportRequest,
  viewer: VerifiedExportViewer | null,
): ServerExportLabelArgs {
  const args=makeOfficialExportRpcArgs(request,viewer);
  return {
    p_school_id: args.p_school_id,
    p_period_id: args.p_period_id,
    p_class_id: args.p_class_id,
    p_kind: args.p_kind,
    p_subject_id: args.p_subject_id,
  };
}

/** Check labels with BOTH the requested scope and already-validated preview.
 * A mismatch rejects the entire document rather than silently fixing metadata.
 */
export function verifyServerExportLabels(
  raw: unknown,
  request: ExportRequest,
  viewer: VerifiedExportViewer | null,
  projection: unknown,
): VerifiedServerExportLabels {
  const accepted: OfficialExportProjection =
    assertMatchingOfficialExportProjection(projection,request,viewer);
  const args=makeServerExportLabelArgs(request,viewer);
  const keys=[
    "source","previewOnly","kind","roleScope","schoolId","schoolYearId",
    "classId","periodId","subjectId","schoolName","schoolYear","className",
    "periodName","subjectName","activeRosterCount",
  ];
  if (!isObject(raw) || Object.keys(raw).length!==keys.length ||
      !keys.every(k=>own(raw,k)) ||
      raw.source!=="schoolnet_v2_db_scoped_labels_v1" ||
      raw.previewOnly!==true ||
      raw.kind!==args.p_kind || raw.kind!==accepted.kind ||
      raw.roleScope!==(viewer?.role) ||
      raw.schoolId!==args.p_school_id || raw.schoolId!==accepted.schoolId ||
      raw.schoolYearId!==request.scope.schoolYearId ||
      raw.schoolYearId!==accepted.schoolYearId ||
      raw.classId!==args.p_class_id || raw.classId!==accepted.classId ||
      raw.periodId!==args.p_period_id || raw.periodId!==accepted.periodId ||
      raw.subjectId!==args.p_subject_id || raw.subjectId!==accepted.subjectId ||
      ![raw.schoolId,raw.schoolYearId,raw.classId,raw.periodId].every(
        x=>typeof x==="string"&&uuid.test(x)) ||
      (raw.subjectId!==null && (typeof raw.subjectId!=="string"||!uuid.test(raw.subjectId))) ||
      !field(raw.schoolName,75) || !field(raw.schoolYear,40) ||
      !field(raw.className,40) || !field(raw.periodName,55) ||
      (accepted.kind==="subject_period" ? !field(raw.subjectName,50)
        : raw.subjectName!==null) ||
      typeof raw.activeRosterCount!=="number" ||
      !Number.isSafeInteger(raw.activeRosterCount) ||
      raw.activeRosterCount<1 || raw.activeRosterCount>250 ||
      raw.activeRosterCount!==accepted.studentCount) {
    throw new Error("Intitulés scolaires non certifiés pour ce périmètre. Export annulé.");
  }
  return raw as VerifiedServerExportLabels;
}
