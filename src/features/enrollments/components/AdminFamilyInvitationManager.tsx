import { useState } from "react";
import {
  confirmFamilyInvitationActivation,
  declareFamilyInvitationSent,
  flagStaleFamilyInvitation,
  formatFamilyInvitationEmail,
  inspectFamilyInvitation,
  prepareFamilyInvitation,
  retryFamilyInvitation,
  type FamilyInvitationInspection,
  type FamilyInvitationRecipient,
  type PreparedFamilyInvitation,
} from "@/features/enrollments/lib/adminFamilyInvitationApi";

type Request = {
  id: string;
  reference: string;
  request_type: "student_enrollment" | "parent_access";
  status: string;
  guardian_email: string | null;
  guardian_full_name: string;
  student_email: string | null;
  student_full_name: string;
};

type PanelState = {
  inspection?: FamilyInvitationInspection;
  draft?: PreparedFamilyInvitation;
  notice?: string;
  error?: string;
};

const initialPanels: Record<FamilyInvitationRecipient, PanelState> = {
  parent: {}, student: {},
};
const initialNotes: Record<FamilyInvitationRecipient, string> = {
  parent: "", student: "",
};
const initialConfirmed: Record<FamilyInvitationRecipient, boolean> = {
  parent: false, student: false,
};
type MutationAction = "prepare" | "resume" | "renew" | "declare_sent" |
  "confirm_activation" | "flag_review";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Opération indisponible. Réessayez plus tard.";
}
function labelStatus(status?: string | null): string {
  switch (status) {
    case "preparing": return "Création en cours";
    case "auth_created": return "Compte créé, finalisation nécessaire";
    case "profile_ready": return "Profil prêt, lien à finaliser";
    case "prepared": return "Lien préparé — à transmettre";
    case "sent_declared": return "Transmission déclarée — activation attendue";
    case "activated": return "Accès activé après contrôle Auth";
    case "renewing": return "Renouvellement en cours";
    case "requires_review": return "Revue administrative nécessaire";
    default: return "Aucune invitation";
  }
}
function labelProof(state?: string): string {
  switch (state) {
    case "verified": return "Connexion password prouvée et associée à une session Auth";
    case "awaiting_password_login": return "Première connexion par mot de passe attendue";
    case "awaiting_delivery": return "Transmission du lien à confirmer";
    case "requires_review": return "Preuve incohérente : contrôle requis";
    case "evidence_source_unavailable": return "Preuve Auth indisponible : aucune activation possible";
    default: return "Aucune preuve d'activation enregistrée";
  }
}

export default function AdminFamilyInvitationManager({
  request, disabled = false, onAccountPrepared, onBusyChange,
}: {
  request: Request;
  disabled?: boolean;
  onAccountPrepared?: (recipient: FamilyInvitationRecipient, userId: string) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [panels, setPanels] = useState(initialPanels);
  const [notes, setNotes] = useState(initialNotes);
  const [verified, setVerified] = useState(initialConfirmed);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(initialConfirmed);
  const [deliveryMethod, setDeliveryMethod] =
    useState<Record<FamilyInvitationRecipient, "manual_email" | "in_person">>({
      parent: "manual_email", student: "manual_email",
    });
  const [working, setWorking] = useState<FamilyInvitationRecipient | null>(null);

  const recipients: FamilyInvitationRecipient[] =
    request.request_type === "student_enrollment" ? ["parent", "student"] : ["parent"];

  function update(recipient: FamilyInvitationRecipient, next: Partial<PanelState>) {
    setPanels((current) => ({
      ...current,
      [recipient]: { ...current[recipient], ...next },
    }));
  }
  async function inspect(recipient: FamilyInvitationRecipient) {
    const result = await inspectFamilyInvitation(request.id, recipient);
    const expectedEmail = recipient === "parent" ? request.guardian_email : request.student_email;
    if (result.email !== expectedEmail?.trim().toLowerCase()) {
      throw new Error("L'adresse e-mail du destinataire a changé : recommencez la vérification.");
    }
    update(recipient, { inspection: result });
  }
  async function run(recipient: FamilyInvitationRecipient, action: MutationAction | "inspect") {
    if (working || disabled) return;
    setWorking(recipient);
    onBusyChange?.(true);
    update(recipient, { error: undefined, notice: undefined });
    try {
      if (action === "inspect") {
        await inspect(recipient);
        update(recipient, { notice: "Inspection serveur actualisée." });
        return;
      }

      const note = notes[recipient].trim();
      if (!verified[recipient] || note.length < 10 || note.length > 1000) {
        throw new Error("Confirmez l'identité et décrivez votre vérification (10 à 1000 caractères).");
      }

      if (action === "declare_sent") {
        if (!panels[recipient].draft || !deliveryConfirmed[recipient]) {
          throw new Error("Copiez puis transmettez le lien, et confirmez la remise.");
        }
        if (!window.confirm("Avez-vous réellement transmis ce lien au destinataire vérifié ?")) return;
        await declareFamilyInvitationSent({
          requestId: request.id, recipient, verified: true,
          deliveryConfirmed: true, verificationNote: note,
          deliveryMethod: deliveryMethod[recipient],
        });
        update(recipient, { draft: undefined, notice: "Transmission enregistrée. Activation non encore confirmée." });
        setDeliveryConfirmed((current) => ({ ...current, [recipient]: false }));
      } else if (action === "confirm_activation") {
        if (!window.confirm("Confirmer l'activation après vérification serveur de la connexion par mot de passe ?")) return;
        await confirmFamilyInvitationActivation({
          requestId: request.id, recipient, verified: true, verificationNote: note,
        });
        update(recipient, { draft: undefined, notice: "Activation vérifiée par le serveur et enregistrée." });
      } else if (action === "flag_review") {
        if (!window.confirm("Mettre cette invitation en revue manuelle, sans supprimer de compte ?")) return;
        await flagStaleFamilyInvitation({
          requestId: request.id, recipient, verified: true, verificationNote: note,
        });
        update(recipient, { draft: undefined, notice: "Invitation placée en revue manuelle." });
      } else {
        if (action === "prepare" && !window.confirm(
          "Créer le compte de " + (recipient === "parent" ? "Parent" : "Apprenant") +
          " et générer un lien d'invitation personnel ? Aucun e-mail ne sera envoyé par SCHOOLNET.",
        )) return;
        const draft = action === "prepare"
          ? await prepareFamilyInvitation({
            requestId: request.id, recipient, verified: true, verificationNote: note,
          })
          : await retryFamilyInvitation({
            action, requestId: request.id, recipient, verified: true, verificationNote: note,
          });
        update(recipient, {
          draft,
          notice: "Lien généré. Copiez le message, transmettez-le au destinataire puis déclarez l'envoi.",
        });
        if (action === "prepare" && onAccountPrepared) {
          try {
            await onAccountPrepared(recipient, draft.user_id);
          } catch {
            update(recipient, {
              notice: "Lien préparé. Actualisez les comptes avant la finalisation du rattachement familial.",
            });
          }
        }
      }

      await inspect(recipient);
    } catch (error) {
      update(recipient, { error: errorText(error) });
    } finally {
      setWorking(null);
      onBusyChange?.(false);
    }
  }

  async function copyMessage(recipient: FamilyInvitationRecipient) {
    const draft = panels[recipient].draft;
    if (!draft) return;
    try {
      const message = formatFamilyInvitationEmail(draft);
      await navigator.clipboard.writeText(
        "À : " + message.to + "\nObjet : " + message.subject + "\n\n" + message.body,
      );
      update(recipient, { notice: "Message copié. Transmettez-le par un canal sûr." });
    } catch {
      update(recipient, { error: "Copie refusée par le navigateur. Autorisez le presse-papiers." });
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3 sm:p-4"
      aria-label="Création des comptes et activation familiale">
      <div>
        <h4 className="text-sm font-extrabold text-slate-950">
          Comptes et liens d'activation
        </h4>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Vérifiez chaque identité séparément. SCHOOLNET prépare un lien personnel
          sans envoyer d'e-mail. La transmission et l'activation sont suivies et
          contrôlées par le serveur.
        </p>
      </div>

      {disabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Aucune création ou transmission en mode démonstration.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {recipients.map((recipient) => {
          const parent = recipient === "parent";
          const email = parent ? request.guardian_email : request.student_email;
          const name = parent ? request.guardian_full_name : request.student_full_name;
          const panel = panels[recipient];
          const inspection = panel.inspection;
          const duplicate = Boolean(email && email.trim().toLowerCase() ===
            (parent ? request.student_email : request.guardian_email)?.trim().toLowerCase());
          const canWrite = !disabled && !working && Boolean(email) && !duplicate &&
            verified[recipient] && notes[recipient].trim().length >= 10 &&
            notes[recipient].trim().length <= 1000;
          const canCreate = inspection?.decision === "new_invitation_possible" &&
            request.status !== "processed";
          const canResume = inspection?.can_resume === true;
          const canRenew = inspection?.can_renew === true;
          const canConfirm = inspection?.can_confirm_activation === true &&
            inspection?.activation_evidence_verified === true;
          return (
            <div key={recipient} className="min-w-0 space-y-3 rounded-xl border border-indigo-100 bg-white p-3">
              <div>
                <strong className="text-sm text-slate-950">{parent ? "Parent / Tuteur" : "Apprenant"}</strong>
                <p className="mt-1 text-xs text-slate-600">{name}</p>
                <p className="mt-1 break-all text-xs text-blue-700">{email || "Adresse personnelle manquante"}</p>
              </div>
              <button type="button" onClick={() => void run(recipient, "inspect")}
                disabled={disabled || Boolean(working) || !email || duplicate}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">
                {working === recipient ? "Vérification…" : "Vérifier le compte et l'activation"}
              </button>
              {duplicate && <p className="text-xs text-amber-800">Même e-mail pour deux comptes : opération interdite.</p>}
              {panel.error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{panel.error}</p>}
              {panel.notice && <p role="status" className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{panel.notice}</p>}
              {inspection && (
                <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                  <p className="font-bold">Registre : {labelStatus(inspection.invitation_status)}</p>
                  <p>Décision : {inspection.decision === "new_invitation_possible" ? "Nouveau compte possible" :
                    inspection.decision === "reuse_after_verification" ? "Compte existant à réutiliser après vérification" :
                    inspection.decision === "already_activated" ? "Accès activé" :
                    inspection.decision === "already_prepared" ? "Accès déjà préparé" :
                    "Revue humaine nécessaire"}</p>
                  <p>Preuve : {labelProof(inspection.activation_proof_state)}</p>
                  {inspection.delivery_declared_at && (
                    <p>Transmission déclarée le {new Date(inspection.delivery_declared_at).toLocaleString("fr-FR")}</p>
                  )}
                </div>
              )}
              {(canCreate || canResume || canRenew || canConfirm || inspection?.can_flag_review) && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={verified[recipient]}
                      onChange={(event) => setVerified((state) => ({ ...state, [recipient]: event.target.checked }))}
                      disabled={disabled || Boolean(working)} />
                    J'ai contrôlé l'identité, le dossier scolaire et le lien familial.
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Justification administrative (10 caractères minimum)
                    <textarea value={notes[recipient]} maxLength={1000} rows={2}
                      onChange={(event) => setNotes((state) => ({ ...state, [recipient]: event.target.value }))}
                      placeholder="Décrivez le contrôle effectué, sans lien ni mot de passe."
                      disabled={disabled || Boolean(working)}
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs outline-blue-500" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {canCreate && <button type="button" disabled={!canWrite} onClick={() => void run(recipient, "prepare")}
                      className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      Créer le compte et le lien
                    </button>}
                    {canResume && <button type="button" disabled={!canWrite} onClick={() => void run(recipient, "resume")}
                      className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      Reprendre l'invitation
                    </button>}
                    {canRenew && <button type="button" disabled={!canWrite} onClick={() => void run(recipient, "renew")}
                      className="rounded-lg border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50">
                      Générer un nouveau lien
                    </button>}
                    {canConfirm && <button type="button" disabled={!canWrite}
                      onClick={() => void run(recipient, "confirm_activation")}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                      Confirmer l'activation prouvée
                    </button>}
                    {inspection?.can_flag_review && <button type="button" disabled={!canWrite}
                      onClick={() => void run(recipient, "flag_review")}
                      className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50">
                      Mettre en revue
                    </button>}
                  </div>
                </div>
              )}
              {panel.draft && (
                <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                  <p className="font-bold text-emerald-900">Lien temporaire prêt — génération {panel.draft.generation_count}</p>
                  <p className="text-emerald-900">
                    Ce lien personnel est affiché uniquement pendant cette session.
                    Il n'est pas sauvegardé en clair dans le registre.
                  </p>
                  <button type="button" onClick={() => void copyMessage(recipient)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white">
                    Copier le message avec le lien
                  </button>
                  <label className="block text-slate-700">
                    Mode de transmission
                    <select value={deliveryMethod[recipient]}
                      onChange={(event) => setDeliveryMethod((state) => ({
                        ...state,
                        [recipient]: event.target.value as "manual_email" | "in_person",
                      }))}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2">
                      <option value="manual_email">E-mail manuel</option>
                      <option value="in_person">Remise personnelle vérifiée</option>
                    </select>
                  </label>
                  <label className="flex items-start gap-2 text-slate-700">
                    <input type="checkbox" checked={deliveryConfirmed[recipient]}
                      onChange={(event) => setDeliveryConfirmed((state) => ({
                        ...state, [recipient]: event.target.checked,
                      }))} />
                    J'ai réellement transmis le message au bon destinataire.
                  </label>
                  <button type="button" disabled={!canWrite || !deliveryConfirmed[recipient]}
                    onClick={() => void run(recipient, "declare_sent")}
                    className="rounded-lg bg-indigo-700 px-3 py-2 font-bold text-white disabled:opacity-50">
                    Déclarer la transmission
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-amber-800">
        Un lien préparé ou une transmission déclarée ne signifie pas compte activé.
        Le destinataire choisit son mot de passe puis se connecte. La confirmation
        exige une preuve Auth serveur et une session réelle.
      </p>
    </section>
  );
}
