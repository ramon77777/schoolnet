/**
 * SCHOOLNET Lot 5D-H - no destructive browser compensation.
 *
 * Storage and Postgres do not provide a single distributed transaction.
 * Once an object has been uploaded, a registration failure or HTTP timeout
 * may be ambiguous: deleting the object can destroy a valid archived file.
 * Do not automatically delete an uploaded object on metadata uncertainty.
 */
export const ENROLLMENT_DOCUMENT_BROWSER_DELETE_BLOCKED = true as const;

export const ENROLLMENT_DOCUMENT_DELETE_NOTICE =
  "La suppression des justificatifs est suspendue pour protéger les archives scolaires. " +
  "Le téléchargement et le dépôt restent disponibles. Une procédure de " +
  "suppression sécurisée avec contrôle serveur sera validée séparément.";

export type SafeDocumentUploadOutcome =
  | "saved"
  | "storage_failed"
  | "metadata_unconfirmed";

export async function persistEnrollmentDocumentSafely(
  uploadObject: () => Promise<void>,
  registerMetadata: () => Promise<void>,
): Promise<SafeDocumentUploadOutcome> {
  try {
    await uploadObject();
  } catch {
    return "storage_failed";
  }
  try {
    await registerMetadata();
  } catch {
    // Even an error response can arrive after the metadata was committed.
    // Keep the object and escalate for reconciliation by an administrator.
    return "metadata_unconfirmed";
  }
  return "saved";
}
