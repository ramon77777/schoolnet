/** SCHOOLNET V2 — S4-D.2c.1: dormant transport bridge for server-scoped V2 exports.
 * NO UI calls this bridge yet. Do not activate PDF/XLSX real-data downloads.
 * Caller-side checks are defense in depth; the SQL RPC MUST reauthorize the
 * user on every invocation with auth.uid(), school membership and assignments.
 */
import {
  isOfficialExportProjection,
  type OfficialExportProjection,
  type OfficialExportScope,
} from "./schoolOfficialExportProjectionModel.ts";
import type { ExportRequest } from "./schoolOfficialExportPlanning.ts";

export const OFFICIAL_EXPORT_RPC_NAME = "schoolnet_official_export_preview" as const;
/** Do not flip as part of a refactor: needs separate security + deployment GO. */
export const SCHOOLNET_REAL_EXPORTS_RELEASED = false as const;

export type VerifiedExportViewer = {
  /** From the active Auth session, never supplied by a form or query string. */
  id: string;
  role: "teacher" | "school_admin";
  isDemo: boolean;
};

export type ExportPreviewRpcArgs = {
  p_school_id: string;
  p_period_id: string;
  p_class_id: string;
  p_kind: "subject_period" | "class_general";
  p_subject_id: string | null;
  p_format: "pdf" | "xlsx";
  p_document_state: "provisional";
};

export type ExportPreviewRpcTransport = (
  name: typeof OFFICIAL_EXPORT_RPC_NAME,
  args: ExportPreviewRpcArgs,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Construct exactly the allow-listed RPC parameters; no grades or viewer ID. */
export function makeOfficialExportRpcArgs(
  request: ExportRequest,
  viewer: VerifiedExportViewer | null,
): ExportPreviewRpcArgs {
  if (!viewer || viewer.isDemo || !uuid.test(viewer.id) ||
      viewer.id !== request.viewerId || viewer.role !== request.role ||
      !uuid.test(request.scope.schoolId) || !uuid.test(request.scope.schoolYearId) ||
      !uuid.test(request.scope.classId) ||
      !request.scope.periodId || !uuid.test(request.scope.periodId) ||
      request.state !== "provisional" || request.cadence === "annual" ||
      !["trimester", "semester"].includes(request.cadence) ||
      !["pdf", "xlsx"].includes(request.format)) {
    throw new Error("Préparation d'export scolaire refusée : contexte non admissible.");
  }

  if (viewer.role === "teacher") {
    if (request.kind !== "subject_period" ||
        typeof request.subjectId !== "string" || !uuid.test(request.subjectId)) {
      throw new Error("L'enseignant doit choisir une matière de sa classe.");
    }
  } else if (viewer.role === "school_admin") {
    if (request.kind !== "class_general" || request.subjectId !== null) {
      throw new Error("Ce type d'export établissement n'est pas encore disponible.");
    }
  } else {
    throw new Error("Rôle non autorisé.");
  }
  return {
    p_school_id: request.scope.schoolId,
    p_period_id: request.scope.periodId,
    p_class_id: request.scope.classId,
    p_kind: request.kind,
    p_subject_id: request.subjectId,
    p_format: request.format,
    p_document_state: "provisional",
  };
}

/** Reject upstream projections that do not match the requested school year.
 * The previous S4-D.2b contract checks exact school/class/period/kind/format.
 */
export function assertMatchingOfficialExportProjection(
  raw: unknown,
  request: ExportRequest,
  viewer: VerifiedExportViewer | null,
): OfficialExportProjection {
  const args = makeOfficialExportRpcArgs(request,viewer);
  const scope: OfficialExportScope = {
    schoolId: args.p_school_id, classId: args.p_class_id,
    periodId: args.p_period_id, kind: args.p_kind,
    subjectId: args.p_subject_id, format: args.p_format,
  };
  if (!isOfficialExportProjection(raw,scope) ||
      raw.schoolYearId !== request.scope.schoolYearId) {
    throw new Error("Réponse serveur hors périmètre ou non conforme. Export annulé.");
  }
  return raw;
}

export function isExportRpcNotInstalled(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const code = (error as {code?: unknown}).code;
  return code === "PGRST202" || code === "42883";
}

/** This function is intentionally NOT imported by any UI route in S4-D.2c.1.
 * It has no fallback to fictional exports, V1 data, or direct grade SELECT.
 * Runtime wiring + release must be separately approved.
 */
export async function reviewOfficialExportWithRpc(
  request: ExportRequest,
  viewer: VerifiedExportViewer | null,
  transport: ExportPreviewRpcTransport,
): Promise<OfficialExportProjection> {
  const args = makeOfficialExportRpcArgs(request,viewer);
  // Fail closed on every production/DEV build of this proposal.
  if (!SCHOOLNET_REAL_EXPORTS_RELEASED) {
    throw new Error("Activation SQL et habilitations d'export encore en attente.");
  }
  const { data, error } = await transport(OFFICIAL_EXPORT_RPC_NAME,args);
  if (error) {
    if (isExportRpcNotInstalled(error)) throw new Error("RPC des exports non installée.");
    throw new Error("Export refusé ou service indisponible. Aucun fichier produit.");
  }
  return assertMatchingOfficialExportProjection(data,request,viewer);
}
