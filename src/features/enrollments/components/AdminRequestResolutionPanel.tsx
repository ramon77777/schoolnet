import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { getAdminEnrollments, type AdminEnrollment } from "@/features/enrollments/lib/adminEnrollmentsApi";
import AdminEnrollmentRequestPreflight from "@/features/enrollments/components/AdminEnrollmentRequestPreflight";
import AdminFamilyInvitationManager from "@/features/enrollments/components/AdminFamilyInvitationManager";

type RequestStatus = "new" | "contacted" | "processed" | "rejected";
type RequestType = "student_enrollment" | "parent_access";
type UserChoice = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean;
};
export type PublicRequestForResolution = {
  id: string;
  reference: string;
  request_type: RequestType;
  status: RequestStatus;
  student_full_name: string;
  guardian_full_name: string;
  guardian_relationship: string;
  requested_level: string | null;
  student_email: string | null;
  guardian_email: string | null;
};
export type RequestResolution = {
  request_id: string;
  parent_id: string;
  student_id: string;
  enrollment_id: string | null;
  verified_by?: string;
  verified_at: string;
  already_finalized?: boolean;
  status?: string;
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error &&
    typeof error.message === "string") return error.message;
  return "Une erreur inattendue est survenue.";
}
function isMissingMigration(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: string; message?: string };
  return code === "42P01" || code === "PGRST205" ||
    Boolean(message?.includes("public_enrollment_request_resolutions") &&
      (message.includes("schema cache") || message.includes("does not exist")));
}
function displayChoice(value: UserChoice) {
  const name = value.full_name?.trim() || "Compte sans nom";
  return value.email ? name + " · " + value.email : name;
}

// Administration uniquement. Les identifiants choisis sont revalides par
// la RPC transactionnelle ; la validation d'interface ne suffit pas.
export default function AdminRequestResolutionPanel({
  request, disabled = false, onFinalized, onBusyChange,
}: {
  request: PublicRequestForResolution;
  disabled?: boolean;
  onFinalized: (result: RequestResolution) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [users, setUsers] = useState<UserChoice[]>([]);
  const [enrollments, setEnrollments] = useState<AdminEnrollment[]>([]);
  const [resolution, setResolution] = useState<RequestResolution | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [parentId, setParentId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [familyVerified, setFamilyVerified] = useState(false);
  const [verificationNote, setVerificationNote] = useState("");
  const [linkExists, setLinkExists] = useState<boolean | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const load = useCallback(async (cancelled: () => boolean) => {
    if (disabled) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setSuccess(null);
    setMigrationPending(false);
    setResolution(null);
    try {
      const result = await supabase
        .from("public_enrollment_request_resolutions")
        .select("request_id,parent_id,student_id,enrollment_id,verified_by,verified_at")
        .eq("request_id", request.id).maybeSingle();
      if (result.error) throw result.error;
      if (cancelled()) return;
      const userResult = await supabase.rpc("admin_list_users");
      if (userResult.error) throw userResult.error;
      if (cancelled()) return;
      // Conserver les autres rôles pour détecter un e-mail déjà occupé.
      // Les listes de sélection Parent et Apprenant restent filtrées par rôle.
      setUsers((userResult.data ?? []) as UserChoice[]);
      if (result.data) {
        setResolution(result.data as RequestResolution);
        return;
      }
      const enrollmentResult = await getAdminEnrollments();
      if (!cancelled()) setEnrollments(enrollmentResult);
    } catch (cause) {
      if (cancelled()) return;
      if (isMissingMigration(cause)) setMigrationPending(true);
      else setError(errorMessage(cause));
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, [disabled, request.id]);

  useEffect(() => {
    let cancelled = false;
    setParentId("");
    setStudentId("");
    setEnrollmentId("");
    setFamilyVerified(false);
    setVerificationNote("");
    setParentSearch("");
    setStudentSearch("");
    setLinkExists(null);
    void load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!parentId || !studentId || migrationPending || disabled || resolution) {
      setLinkExists(null);
      setLinkLoading(false);
      return;
    }
    setLinkExists(null);
    setLinkLoading(true);
    void (async () => {
      try {
        const { data, error: linkError } = await supabase.from("parent_links")
          .select("id").eq("parent_id", parentId).eq("student_id", studentId)
          .maybeSingle();
        if (linkError) throw linkError;
        if (!cancelled) setLinkExists(Boolean(data));
      } catch (cause) {
        if (!cancelled) { setError(errorMessage(cause)); setLinkExists(null); }
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [parentId, studentId, migrationPending, disabled, resolution]);

  const parents = useMemo(() => users.filter((item) => item.role === "parent" &&
    (item.id === parentId || displayChoice(item).toLocaleLowerCase("fr")
      .includes(parentSearch.trim().toLocaleLowerCase("fr")))), [users, parentId, parentSearch]);
  const students = useMemo(() => users.filter((item) => item.role === "student" &&
    (item.id === studentId || displayChoice(item).toLocaleLowerCase("fr")
      .includes(studentSearch.trim().toLocaleLowerCase("fr")))), [users, studentId, studentSearch]);
  const studentEnrollments = useMemo(
    () => enrollments.filter((item) => item.student_id === studentId &&
      (item.status === "active" || item.status === "completed")),
    [enrollments, studentId],
  );
  const selectedParent = users.find((item) => item.id === parentId);
  const selectedStudent = users.find((item) => item.id === studentId);
  const selectedEnrollment = studentEnrollments.find((item) => item.enrollment_id === enrollmentId);
  const ready = !disabled && !loading && !saving && !error && !migrationPending && !resolution &&
    request.status !== "rejected" && Boolean(
      parentId && studentId && parentId !== studentId && selectedParent && selectedStudent
    ) &&
    selectedParent?.is_active !== false && selectedStudent?.is_active !== false &&
    (request.request_type === "parent_access" || Boolean(selectedEnrollment)) &&
    linkExists !== null && !linkLoading && familyVerified &&
    verificationNote.trim().length >= 10 && verificationNote.trim().length <= 1000;

  async function finalize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    if (!window.confirm(
      "Confirmer la verification de l'identite et du lien familial ?\n" +
      "Cette action rattache definitivement la demande aux comptes selectionnes.",
    )) return;
    setSaving(true);
    onBusyChange?.(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "admin_finalize_public_enrollment_request", {
          p_request_id: request.id,
          p_parent_id: parentId,
          p_student_id: studentId,
          p_enrollment_id: request.request_type === "parent_access" ? null : enrollmentId,
          p_verified: true,
          p_verification_note: verificationNote.trim(),
        },
      );
      if (rpcError) throw rpcError;
      const saved = data as RequestResolution | null;
      if (!saved || saved.status !== "processed" || saved.request_id !== request.id) {
        throw new Error("Finalisation non confirmee par le serveur.");
      }
      setResolution(saved);
      setSuccess(saved.already_finalized
        ? "Cette demande etait deja rattachee aux memes comptes."
        : "Demande finalisee : lien familial et dossier verifies sans doublon.");
      await onFinalized(saved);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); onBusyChange?.(false); }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4" aria-label="Rattachement vérifié">
      <div>
        <h3 className="font-extrabold text-slate-950">🔗 Rattachement vérifié</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Retrouvez les comptes puis confirmez le lien familial avant toute finalisation.
        </p>
      </div>
      {!loading && !migrationPending && request.status !== "rejected" && (
        <AdminFamilyInvitationManager
          request={request}
          disabled={disabled}
          onBusyChange={onBusyChange}
          onAccountPrepared={async (recipient, userId) => {
            const { data: refreshed, error: refreshError } =
              await supabase.rpc("admin_list_users");
            if (refreshError) throw refreshError;
            const usersAfter = (refreshed ?? []) as UserChoice[];
            const target = usersAfter.find((item) =>
              item.id === userId && item.role === recipient
            );
            if (!target) {
              throw new Error("Compte préparé mais liste des utilisateurs non actualisée.");
            }
            setUsers(usersAfter);
            if (recipient === "parent") {
              setParentId(userId);
            } else {
              setStudentId(userId);
              setEnrollmentId("");
            }
            setFamilyVerified(false);
            setLinkExists(null);
          }}
        />
      )}
      {!disabled && !loading && !error && !resolution && request.status !== "rejected" && (
        <AdminEnrollmentRequestPreflight
          request={request}
          users={users}
          selectedParentId={parentId}
          selectedStudentId={studentId}
          onSelectCandidate={(role, userId) => {
            // Proposition seulement : le lien familial reste soumis à une
            // attestation humaine puis à la RPC sécurisée existante.
            if (role === "parent") {
              setParentId(userId);
            } else {
              setStudentId(userId);
              setEnrollmentId("");
            }
            setFamilyVerified(false);
            setLinkExists(null);
          }}
        />
      )}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
      {disabled ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Rattachements réels interdits en mode démonstration.</p>
      ) : loading ? (
        <p className="text-sm text-slate-600">Chargement des rattachements…</p>
      ) : migrationPending ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Le rattachement sécurisé attend l'activation de sa migration Supabase.
          Les demandes restent consultables, mais ne peuvent pas être marquées « Traitée ».
        </p>
      ) : resolution ? (
        <div className="space-y-2 rounded-xl border border-emerald-200 bg-white p-4 text-sm text-slate-800">
          <p className="font-bold text-emerald-700">✓ Finalisation vérifiée et enregistrée</p>
          <p>Parent / Tuteur : <strong>{
            users.find((item) => item.id === resolution.parent_id)
              ? displayChoice(users.find((item) => item.id === resolution.parent_id)!)
              : resolution.parent_id
          }</strong></p>
          <p>Apprenant : <strong>{
            users.find((item) => item.id === resolution.student_id)
              ? displayChoice(users.find((item) => item.id === resolution.student_id)!)
              : resolution.student_id
          }</strong></p>
          {resolution.enrollment_id && <p>Inscription : <strong>{resolution.enrollment_id}</strong></p>}
          <p className="text-xs text-slate-500">
            Enregistrée le {new Date(resolution.verified_at).toLocaleString("fr-FR")}.
            Les nouveaux clics ne créent aucun doublon.
          </p>
        </div>
      ) : request.status === "rejected" ? (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
          Demande refusée : aucun lien ni dossier scolaire ne sera créé.
        </p>
      ) : (
        <details className="rounded-xl border border-indigo-200 bg-white">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm font-bold text-indigo-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
            <span>Finalisation vérifiée — formulaire manuel</span>
            <span className="text-xs font-normal text-indigo-700">
              {parentId ? "Parent présélectionné" : "Parent à sélectionner"} ·{" "}
              {studentId ? "Apprenant sélectionné" : "Apprenant à sélectionner"} · Ouvrir
            </span>
          </summary>
          <form onSubmit={(event) => void finalize(event)} className="space-y-3 border-t border-indigo-100 p-3">
          {request.status === "processed" && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Ancienne demande marquée « Traitée » sans preuve de rattachement :
              régularisation possible après vérification.
            </p>
          )}
          <p className="rounded-xl bg-white p-3 text-xs text-slate-600">
            Identifiez ou créez les comptes dans{" "}
            <Link className="font-bold text-blue-700 underline" to="/app/admin/users">Utilisateurs</Link>.
            {request.request_type === "student_enrollment" && (
              <> Vérifiez le dossier annuel dans{" "}
                <Link className="font-bold text-blue-700 underline" to="/app/admin/enrollments">Inscriptions</Link>.</>
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-700">
              Recherche Parent / Tuteur
              <input className={inputClass} value={parentSearch} placeholder="Nom ou e-mail…"
                onChange={(event) => setParentSearch(event.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Compte Parent / Tuteur *
              <select className={inputClass} value={parentId} onChange={(event) => {
                setParentId(event.target.value); setFamilyVerified(false);
              }}>
                <option value="">Sélectionner un compte</option>
                {parents.map((item) => <option key={item.id} value={item.id}>
                  {displayChoice(item)}{!item.is_active ? " (inactif)" : ""}
                </option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Recherche Apprenant
              <input className={inputClass} value={studentSearch} placeholder="Nom ou e-mail…"
                onChange={(event) => setStudentSearch(event.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-slate-700">
              Compte Apprenant *
              <select className={inputClass} value={studentId} onChange={(event) => {
                setStudentId(event.target.value); setEnrollmentId(""); setFamilyVerified(false);
              }}>
                <option value="">Sélectionner un compte</option>
                {students.map((item) => <option key={item.id} value={item.id}>
                  {displayChoice(item)}{!item.is_active ? " (inactif)" : ""}
                </option>)}
              </select>
            </label>
          </div>
          {parentId && studentId && (
            <p className={linkExists ? "rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"
              : "rounded-xl bg-amber-50 p-3 text-xs text-amber-800"}>
              {linkLoading || linkExists === null ? "Vérification du lien familial…"
                : linkExists ? "✓ Lien Parent–Enfant existant, il sera conservé."
                  : "Le lien Parent–Enfant sera établi lors de la finalisation vérifiée."}
            </p>
          )}
          {parentId && studentId && selectedParent && selectedStudent &&
            (selectedParent.full_name?.trim().toLocaleLowerCase("fr") !== request.guardian_full_name.trim().toLocaleLowerCase("fr") ||
              selectedStudent.full_name?.trim().toLocaleLowerCase("fr") !== request.student_full_name.trim().toLocaleLowerCase("fr")) && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Le nom déclaré dans la demande diffère d'au moins un des profils sélectionnés.
                Vérifiez l'identité et documentez la différence avant toute finalisation.
              </p>
            )}
          {request.request_type === "student_enrollment" && (
            <label className="block text-xs font-semibold text-slate-700">
              Inscription annuelle de cet Apprenant *
              <select className={inputClass} value={enrollmentId}
                disabled={!studentId || studentEnrollments.length === 0}
                onChange={(event) => { setEnrollmentId(event.target.value); setFamilyVerified(false); }}>
                <option value="">Sélectionner un dossier valide</option>
                {studentEnrollments.map((item) =>
                  <option key={item.enrollment_id} value={item.enrollment_id}>
                    {item.enrollment_number || "N° à vérifier"} · {item.school_year_name} · {item.class_name} ({item.status})
                  </option>)}
              </select>
              {studentId && studentEnrollments.length === 0 && (
                <span className="mt-1 block text-amber-700">
                  Aucun dossier actif ou terminé : créez-en un dans Inscriptions.
                </span>
              )}
            </label>
          )}
          <label className="block text-xs font-semibold text-slate-700">
            Note interne de vérification * (10 à 1000 caractères)
            <textarea className={inputClass + " min-h-20"} value={verificationNote} maxLength={1000}
              placeholder="Ex. : Identité et autorité parentale vérifiées par l'administration…"
              onChange={(event) => setVerificationNote(event.target.value)} />
          </label>
          <label className="flex items-start gap-2 rounded-xl bg-white p-3 text-xs leading-relaxed text-slate-700">
            <input type="checkbox" className="mt-0.5 accent-blue-600" checked={familyVerified}
              onChange={(event) => setFamilyVerified(event.target.checked)} />
            <span>
              Je confirme avoir vérifié l'identité du responsable, son lien avec l'enfant
              et la correspondance des comptes sélectionnés.
              {request.request_type === "student_enrollment" &&
                " Le dossier scolaire choisi concerne bien cet apprenant."}
            </span>
          </label>
          <button type="submit" className="sn-btn-primary w-full" disabled={!ready}>
            {saving ? "Finalisation…" : "✓ Finaliser et rattacher"}
          </button>
          <p className="text-xs text-slate-500">
            Transaction atomique : un échec annule également la création éventuelle du lien familial.
          </p>
          </form>
        </details>
      )}
    </div>
  );
}
