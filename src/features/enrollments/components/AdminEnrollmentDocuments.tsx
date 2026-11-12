import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";

// Lot 5.B : les pieces justificatives sont reservees a l'administration.
// La table et le bucket sont disponibles apres migration autorisee, pas avant.
const BUCKET = "student-enrollment-documents";
const MAX_SIZE = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const DOCUMENT_TYPES: Record<string, string> = {
  birth_certificate: "Acte de naissance",
  previous_report: "Bulletin précédent",
  transfer_certificate: "Certificat de transfert",
  identity_photo: "Photo d'identité",
  other: "Autre pièce justificative",
};

type DocumentRow = {
  id: string;
  enrollment_id: string;
  document_type: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type DbError = { code?: string; message?: string };
function messageFrom(error: unknown): string {
  if (error && typeof error === "object" && "message" in error &&
    typeof error.message === "string") return error.message;
  return "Une erreur inattendue s'est produite.";
}

function isMissingDocumentsTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { code = "", message = "" } = error as DbError;
  return code === "42P01" || code === "PGRST205" ||
    (message.includes("student_enrollment_documents") &&
      (message.includes("schema cache") || message.includes("does not exist")));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value :
    date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminEnrollmentDocuments({
  enrollmentId,
  disabled = false,
}: {
  enrollmentId: string;
  disabled?: boolean;
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [documentType, setDocumentType] = useState("birth_certificate");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingActivation, setPendingActivation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    if (disabled) {
      setDocuments([]);
      setPendingActivation(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await supabase
        .from("student_enrollment_documents")
        .select("id,enrollment_id,document_type,original_filename,storage_path,mime_type,size_bytes,created_at")
        .eq("enrollment_id", enrollmentId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      setDocuments((result.data ?? []) as DocumentRow[]);
      setPendingActivation(false);
    } catch (cause) {
      setDocuments([]);
      if (isMissingDocumentsTable(cause)) setPendingActivation(true);
      else setError(messageFrom(cause));
    } finally {
      setLoading(false);
    }
  }, [disabled, enrollmentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || pendingActivation || !file) return;
    if (!Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, documentType)) {
      setError("Type de pièce justificative inconnu.");
      return;
    }
    const extension = MIME_EXTENSIONS[file.type];
    if (!extension) {
      setError("Format non autorisé : utilisez PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (!file.size || file.size > MAX_SIZE) {
      setError("La taille du fichier doit être comprise entre 1 octet et 10 Mo.");
      return;
    }
    if (!file.name.trim() || file.name.length > 255) {
      setError("Le nom du fichier est invalide ou dépasse 255 caractères.");
      return;
    }

    const objectPath = `${enrollmentId}/${crypto.randomUUID()}.${extension}`;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, file, { contentType: file.type, upsert: false });
      if (storageError) throw storageError;

      const { error: metadataError } = await supabase
        .from("student_enrollment_documents")
        .insert({
          enrollment_id: enrollmentId,
          document_type: documentType,
          original_filename: file.name,
          storage_path: objectPath,
          mime_type: file.type,
          size_bytes: file.size,
        });

      if (metadataError) {
        const { error: cleanupError } = await supabase.storage
          .from(BUCKET).remove([objectPath]);
        if (cleanupError) {
          throw new Error(
            `Enregistrement du fichier incomplet. Nettoyage automatique impossible : ${messageFrom(cleanupError)}. Informez l'administration.`,
          );
        }
        throw metadataError;
      }

      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setSuccess("Pièce justificative enregistrée dans le stockage privé.");
      await reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setSaving(false);
    }
  }

  async function download(item: DocumentRow) {
    if (disabled || busyId !== null) return;
    setBusyId(item.id);
    setError(null);
    setSuccess(null);
    try {
      // Téléchargement authentifié : aucune URL publique ou lien signé partagé.
      const { data: blob, error: storageError } = await supabase.storage
        .from(BUCKET).download(item.storage_path);
      if (storageError) throw storageError;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.original_filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: DocumentRow) {
    if (disabled || busyId !== null) return;
    if (!window.confirm(
      `Supprimer définitivement « ${item.original_filename} » du dossier scolaire ?`,
    )) return;
    setBusyId(item.id);
    setError(null);
    setSuccess(null);
    try {
      const { error: storageError } = await supabase.storage
        .from(BUCKET).remove([item.storage_path]);
      if (storageError) throw storageError;
      const { data: deletedRows, error: metadataError } = await supabase
        .from("student_enrollment_documents")
        .delete()
        .eq("id", item.id)
        .eq("enrollment_id", enrollmentId)
        .select("id");
      if (metadataError || deletedRows?.length !== 1) {
        throw new Error(
          `Fichier supprimé du stockage, mais le registre n'a pas été actualisé. ${metadataError ? messageFrom(metadataError) : "La ligne du dossier n'a pas été supprimée."} Réessayez la suppression.`,
        );
      }
      setSuccess("Pièce justificative supprimée.");
      await reload();
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Pièces justificatives">
      <div>
        <h3 className="font-bold text-slate-950">📎 Pièces justificatives</h3>
        <p className="mt-1 text-xs text-slate-500">
          Accès Administrateur uniquement. Stockage privé : PDF ou image, 10 Mo maximum par fichier.
        </p>
      </div>

      {disabled && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Le mode démonstration ne permet pas d'accéder aux documents réels.
        </p>
      )}
      {pendingActivation && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Les pièces justificatives ne sont pas encore activées sur Supabase.
          L'administration pourra déposer des fichiers après validation de la migration dédiée.
        </p>
      )}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}

      {!disabled && !pendingActivation && (
        <>
          <form onSubmit={(event) => void upload(event)} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Nature du document</span>
              <select className="sn-input w-full" value={documentType} disabled={saving} onChange={(event) => setDocumentType(event.target.value)}>
                {Object.entries(DOCUMENT_TYPES).map(([key, label]) =>
                  <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Fichier</span>
              <input ref={fileRef} className="sn-input w-full text-xs" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={saving} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button type="submit" className="sn-btn-primary" disabled={!file || saving || loading}>
              {saving ? "Dépôt…" : "Ajouter la pièce"}
            </button>
          </form>
          {loading ? (
            <p className="text-sm text-slate-500">Chargement des pièces…</p>
          ) : documents.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Aucun document administratif déposé pour cette inscription.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{item.original_filename}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {DOCUMENT_TYPES[item.document_type] ?? "Autre document"} · {(item.size_bytes / 1024).toFixed(0)} Ko · {formatDate(item.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="sn-btn-ghost" disabled={busyId !== null || saving} onClick={() => void download(item)}>
                      {busyId === item.id ? "Traitement…" : "Télécharger"}
                    </button>
                    <button type="button" className="sn-btn-ghost text-red-600" disabled={busyId !== null || saving} onClick={() => void remove(item)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
