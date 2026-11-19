// SCHOOLNET Lot 5D-J — RETENTION/RECOVERY REHEARSAL ONLY.
// No Storage.remove, no database delete, no public bucket, no secrets.
// Byte-level hash verification precedes audit attestation. Physical deletion
// remains out of scope until a distinct Storage/API/SQL production GO.
import {createHash} from "node:crypto";

const MAX_BYTES=10*1024*1024;
const key=/^[a-z0-9][a-z0-9_-]{2,79}$/i;
const bad=(status)=>({ok:false,status,delete_allowed:false});
const digest=(bytes)=>createHash("sha256").update(bytes).digest("hex");

export async function rehearseVerifiedRetention(input, adapters) {
  if(input?.mode!=="isolated-fixture" || input?.enabled!==true ||
     !key.test(input.operationId??"") || !key.test(input.documentId??"") ||
     input.actorVerified!==true || input.role!=="admin")
    return bad("denied");
  const required=["readDocument","readOriginal","writeBackup","readBackup",
    "attestBackup"];
  if(required.some(k=>typeof adapters?.[k]!=="function"))
    return bad("missing_adapter");
  try {
    const doc=await adapters.readDocument(input.documentId);
    // The authoritative snapshot is server-sourced, not user-supplied.
    if(!doc || doc.id!==input.documentId || doc.yearCurrent!==true ||
       doc.enrollmentStatus!=="active" || doc.yearClosurePending===true ||
       typeof doc.storagePath!=="string" || !doc.storagePath.includes("/") ||
       !Number.isSafeInteger(doc.sizeBytes) || doc.sizeBytes<1 ||
       doc.sizeBytes>MAX_BYTES) return bad("document_blocked");

    const raw=await adapters.readOriginal(doc.storagePath);
    if(!(raw instanceof Uint8Array) || raw.byteLength!==doc.sizeBytes)
      return bad("source_mismatch");
    const sourceHash=digest(raw);
    const retentionPath="private-retention/"+doc.id+"/"+input.operationId;
    try {
      await adapters.writeBackup(retentionPath,raw);
    } catch {
      // An HTTP timeout can occur AFTER the storage provider commits.
      // Never assume the backup write did not happen.
    }
    let saved;
    try {saved=await adapters.readBackup(retentionPath);}
    catch {return bad("backup_unconfirmed");}
    if(!(saved instanceof Uint8Array) || saved.byteLength!==raw.byteLength ||
       digest(saved)!==sourceHash) return bad("backup_mismatch");
    try {
      const audit=await adapters.attestBackup({
        operationId:input.operationId,documentId:doc.id,
        sourcePath:doc.storagePath,backupPath:retentionPath,
        byteLength:raw.byteLength,sha256:sourceHash,
      });
      if(audit?.persisted!==true || audit?.operationId!==input.operationId)
        return bad("audit_unconfirmed");
    } catch {return bad("audit_unconfirmed");}
    return {ok:true,status:"backup_attested",delete_allowed:false,
      operation_id:input.operationId,sha256:sourceHash};
  } catch {return bad("provider_unavailable");}
}

// Classify recovery steps WITHOUT carrying any out. No auto-delete/restore.
export function classifyDocumentReconciliation(input) {
  if(input?.mode!=="isolated-fixture" ||
     input?.documentVerified!==true) return bad("denied");
  const meta=input.metadataPresent, original=input.originalPresent,
    backup=input.verifiedBackupPresent;
  if([meta,original,backup].some(x=>typeof x!=="boolean"))
    return bad("unknown_state");
  if(meta&&original) return {ok:true,status:"consistent",delete_allowed:false};
  if(meta&&!original&&backup)
    return {ok:true,status:"restore_requires_review",delete_allowed:false};
  if(meta&&!original&&!backup)
    return {ok:true,status:"urgent_missing_source",delete_allowed:false};
  if(!meta&&original)
    return {ok:true,status:"orphan_requires_review",delete_allowed:false};
  if(!meta&&!original&&backup)
    return {ok:true,status:"retained_requires_review",delete_allowed:false};
  return {ok:true,status:"not_found",delete_allowed:false};
}
