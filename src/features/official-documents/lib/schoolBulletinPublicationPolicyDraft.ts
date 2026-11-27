/**
 * SCHOOLNET V2 · S4-D.3h — UNADOPTED proposal for school report-card governance.
 *
 * This is a business POLICY DRAFT for review, not an authorization engine:
 * zero approved clauses, grants, persistence, workflow transitions or publication.
 * Existing S4-D.3f/S4-D.3g gates remain authoritative for the preview.
 */
import {
  GOVERNANCE_DECISIONS_TO_APPROVE,
  type DraftBulletinGovernance,
} from "./schoolReportCardApprovalGovernance.ts";

type DecisionId = (typeof GOVERNANCE_DECISIONS_TO_APPROVE)[number]["id"];

export type ProposedPolicyClause = {
  id: DecisionId;
  title: string;
  proposedRule: string;
  prerequisite: string;
  alternativeToArbitrate: string;
  status: "awaiting_business_decision";
  approved: false;
};

export const PROPOSED_BULLETIN_POLICY_CLAUSES: readonly ProposedPolicyClause[] = [
  {
    id: "requester",
    title: "Demande de validation",
    proposedRule: "Un administrateur d'établissement affilié, explicitement délégué pour l'action, pourrait demander l'examen d'un bulletin individuel précontrôlé sur une version figée.",
    prerequisite: "Vérifier côté serveur l'affiliation active, l'établissement, l'élève, la période, la délégation de soumission et l'intégrité de la version.",
    alternativeToArbitrate: "Décider si la demande peut être déposée par un autre responsable pédagogique habilité.",
    status: "awaiting_business_decision", approved: false,
  },
  {
    id: "approver",
    title: "Décision d'approbation",
    proposedRule: "Une personne mandatée par l'établissement et distincte du demandeur examinerait une version immuable, puis pourrait approuver, refuser ou demander une correction motivée.",
    prerequisite: "Confirmer le décideur, son droit explicite, la séparation des personnes, le motif et les vérifications transactionnelles côté serveur.",
    alternativeToArbitrate: "Décider du titulaire de cette autorité, des suppléants et des situations exceptionnelles.",
    status: "awaiting_business_decision", approved: false,
  },
  {
    id: "publisher",
    title: "Publication ou retrait",
    proposedRule: "Une permission de diffusion distincte de l'approbation serait nécessaire ; l'accord administratif ne publierait jamais automatiquement le bulletin.",
    prerequisite: "Désigner le responsable de diffusion, confirmer son habilitation et enregistrer l'autorisation, puis l'exécution effective de la publication.",
    alternativeToArbitrate: "Décider si la personne qui approuve peut également publier, ou si les deux fonctions doivent obligatoirement être séparées.",
    status: "awaiting_business_decision", approved: false,
  },
  {
    id: "delegations",
    title: "Délégations et révocation",
    proposedRule: "Chaque délégation future serait nominative, limitée à une action, un établissement, un périmètre scolaire et des dates d'effet, avec révocation et trace d'audit.",
    prerequisite: "Définir l'autorité habilitée à déléguer, les durées et les changements d'affiliation ; recontrôler l'état actif à chaque décision.",
    alternativeToArbitrate: "Choisir les niveaux d'étendue autorisés : établissement, année, classe, période et éventuel remplacement temporaire.",
    status: "awaiting_business_decision", approved: false,
  },
  {
    id: "supplementary_data",
    title: "Mentions obligatoires du bulletin",
    proposedRule: "L'établissement fixerait avant émission la politique applicable aux rangs, absences, appréciations, signatures et éventuelles mentions obligatoires, sans créer de valeurs absentes.",
    prerequisite: "Valider les exigences officielles applicables et la disponibilité d'une source vérifiable pour chaque donnée exigée.",
    alternativeToArbitrate: "Déterminer quels champs sont obligatoires, facultatifs ou non applicables selon le cycle et l'établissement.",
    status: "awaiting_business_decision", approved: false,
  },
  {
    id: "withdrawal",
    title: "Corrections, nouvelles versions et retrait",
    proposedRule: "Toute correction affectant une version déjà examinée exigerait un nouvel examen ; aucune décision de l'ancienne version ne vaudrait autorisation de la nouvelle.",
    prerequisite: "Figer une version horodatée, enregistrer l'historique des changements, définir le retrait, l'archivage et la nouvelle diffusion sans effacement de traces.",
    alternativeToArbitrate: "Fixer les motifs, délais, responsables et effets d'un retrait sur les accès déjà accordés.",
    status: "awaiting_business_decision", approved: false,
  },
  {
    id: "family_access",
    title: "Accès de l'élève et de sa famille",
    proposedRule: "L'élève ne verrait que son propre bulletin réellement publié et le parent uniquement ceux de ses enfants dont le lien est vérifié côté serveur.",
    prerequisite: "Valider le lien parent/enfant, la visibilité après publication, la révocation d'accès et l'isolation entre écoles et familles.",
    alternativeToArbitrate: "Définir le calendrier de diffusion, les cas de garde/tutelle et l'accès après retrait.",
    status: "awaiting_business_decision", approved: false,
  },
];

/**
 * These transitions are only proposed future events. In particular,
 * approval_granted != publication_authorized != publication_executed.
 * publication_executed is a NEW event requiring explicit contract approval.
 */
export const PROPOSED_BULLETIN_STATE_TRANSITIONS = [
  { event: "review_submitted", from: "draft", to: "submitted", required: "Précontrôle complet, auteur habilité et version figée", enabled: false },
  { event: "correction_requested", from: "submitted", to: "correction_requested", required: "Motif enregistré par un décideur distinct", enabled: false },
  { event: "approval_refused", from: "submitted", to: "refused", required: "Motif enregistré et trace serveur", enabled: false },
  { event: "approval_granted", from: "submitted", to: "approved", required: "Décideur habilité, version intacte et séparation demandeur/décideur", enabled: false },
  { event: "publication_authorized", from: "approved", to: "authorized_for_publication", required: "Autorité de diffusion distinctement habilitée", enabled: false },
  { event: "publication_executed", from: "authorized_for_publication", to: "published", required: "Nouvel événement à adopter, contrôle atomique de diffusion et trace", enabled: false },
  { event: "publication_revoked", from: "published", to: "withdrawn", required: "Motif de retrait, auteur habilité et révocation des accès", enabled: false },
] as const;

export const REQUIRED_SERVER_CONTROLS = [
  { id: "identity", label: "Acteur authentifié par le serveur, habilitation et affiliation active au moment exact de la décision" },
  { id: "scope", label: "Établissement, année, classe, période et élève recontrôlés avant chaque action" },
  { id: "separation", label: "Demandeur et décideur différents ; publication sur permission distincte à arbitrer" },
  { id: "snapshot", label: "Version immuable des notes et coefficients, rejet des versions obsolètes" },
  { id: "transaction", label: "Transaction atomique, anti-doublon, contrôle de concurrence et idempotence" },
  { id: "audit", label: "Événements append-only horodatés côté serveur, sans note brute dans les journaux" },
  { id: "publication", label: "Diffusion explicite, droits familiaux vérifiés, retrait et révocation des accès" },
] as const;

export type BulletinPublicationPolicyDraft = {
  clauses: readonly ProposedPolicyClause[];
  transitions: typeof PROPOSED_BULLETIN_STATE_TRANSITIONS;
  serverControls: typeof REQUIRED_SERVER_CONTROLS;
  pedagogicalPrecontrol: "satisfied" | "requires_correction";
  adoptionStatus: "unapproved_draft";
  proposedClauseCount: 7;
  approvedClauseCount: 0;
  serverWorkflowInstalled: false;
  canSubmit: false;
  canApprove: false;
  canPublish: false;
  canWithdraw: false;
};

/** Fail closed on forged upstream governance, never authorizes anything. */
export function prepareBulletinPublicationPolicyDraft(
  governance: DraftBulletinGovernance,
): BulletinPublicationPolicyDraft {
  const decisionIds = governance.decisionsToApprove.map(item => item.id);
  const expectedIds = PROPOSED_BULLETIN_POLICY_CLAUSES.map(item => item.id);
  const expectedRoles = ["admin", "parent", "school_admin", "student", "teacher"];
  const roles = governance.roleMatrix.map(item => item.role).sort();
  if (governance.currentPreviewOnly !== true ||
      governance.roleAssignmentsApproved !== false ||
      governance.canSubmit !== false || governance.canApprove !== false ||
      governance.canPublish !== false || governance.canRevoke !== false ||
      governance.academicPrecontrol !== "satisfied" &&
        governance.academicPrecontrol !== "requires_correction" ||
      governance.roleMatrix.length !== expectedRoles.length ||
      roles.some((role, index) => role !== expectedRoles[index]) ||
      governance.roleMatrix.some(item =>
        item.submitGranted !== false || item.decideGranted !== false ||
        item.publishGranted !== false || item.revokeGranted !== false) ||
      decisionIds.length !== expectedIds.length ||
      expectedIds.some((id, index) => decisionIds[index] !== id)) {
    throw new Error("Projet de politique indisponible : habilitations ou décisions incohérentes.");
  }

  return {
    clauses: PROPOSED_BULLETIN_POLICY_CLAUSES,
    transitions: PROPOSED_BULLETIN_STATE_TRANSITIONS,
    serverControls: REQUIRED_SERVER_CONTROLS,
    pedagogicalPrecontrol: governance.academicPrecontrol,
    adoptionStatus: "unapproved_draft",
    proposedClauseCount: 7,
    approvedClauseCount: 0,
    serverWorkflowInstalled: false,
    canSubmit: false, canApprove: false,
    canPublish: false, canWithdraw: false,
  };
}
