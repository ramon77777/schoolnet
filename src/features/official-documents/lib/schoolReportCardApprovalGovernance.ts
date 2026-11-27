/**
 * SCHOOLNET V2 · S4-D.3g — governance proposal, NOT a permission engine.
 *
 * Roles are the existing application roles. Approval responsibilities are
 * proposed functions rather than newly granted application roles.
 * No UI element can assign, approve, publish, or change membership from here.
 */
import type { UserRole } from "../../../lib/auth/auth-context.ts";
import type { ApprovalWorkflowPreparation } from "./schoolReportCardApprovalPreparation.ts";

export type CurrentBulletinVisibility = "school_admin_scoped_read" | "not_in_this_workspace";
export type RoleGovernanceProposal = {
  role: UserRole;
  label: string;
  currentPreview: CurrentBulletinVisibility;
  futureResponsibility: string;
  submitGranted: false;
  decideGranted: false;
  publishGranted: false;
  revokeGranted: false;
};

export const SCHOOLNET_BULLETIN_ROLE_GOVERNANCE: readonly RoleGovernanceProposal[] = [
  {
    role: "school_admin",
    label: "Administrateur d'établissement",
    currentPreview: "school_admin_scoped_read",
    futureResponsibility: "Candidat à une soumission encadrée, à confirmer par l'établissement",
    submitGranted: false, decideGranted: false, publishGranted: false,
    revokeGranted: false,
  },
  {
    role: "teacher",
    label: "Enseignant",
    currentPreview: "not_in_this_workspace",
    futureResponsibility: "Participation pédagogique limitée à ses affectations ; aucune approbation déduite",
    submitGranted: false, decideGranted: false, publishGranted: false,
    revokeGranted: false,
  },
  {
    role: "admin",
    label: "Administrateur général SCHOOLNET",
    currentPreview: "not_in_this_workspace",
    futureResponsibility: "Administration technique sans droit automatique de décision scolaire",
    submitGranted: false, decideGranted: false, publishGranted: false,
    revokeGranted: false,
  },
  {
    role: "parent",
    label: "Parent / tuteur",
    currentPreview: "not_in_this_workspace",
    futureResponsibility: "Éventuelle consultation d'un bulletin publié pour son enfant, à cadrer",
    submitGranted: false, decideGranted: false, publishGranted: false,
    revokeGranted: false,
  },
  {
    role: "student",
    label: "Apprenant",
    currentPreview: "not_in_this_workspace",
    futureResponsibility: "Éventuelle consultation de son propre bulletin publié, à cadrer",
    submitGranted: false, decideGranted: false, publishGranted: false,
    revokeGranted: false,
  },
];

export const PROPOSED_BULLETIN_RESPONSIBILITIES = [
  {
    id: "precontrol",
    function: "Vérifier les résultats",
    accountable: "Administrateur de l'établissement affilié",
    authorization: "Lecture V2 existante, sous contrôle serveur",
  },
  {
    id: "submit",
    function: "Demander un examen",
    accountable: "Demandeur explicitement habilité, à désigner",
    authorization: "Aucune habilitation actuellement accordée",
  },
  {
    id: "decide",
    function: "Approuver, refuser ou demander une correction",
    accountable: "Responsable de décision, à désigner",
    authorization: "Aucune habilitation actuellement accordée",
  },
  {
    id: "publish",
    function: "Publier ou retirer un bulletin",
    accountable: "Responsable de diffusion, à désigner",
    authorization: "Aucune habilitation actuellement accordée",
  },
] as const;

export const PROPOSED_GOVERNANCE_GUARDS = [
  {
    id: "active_membership",
    title: "Établissement et affiliation",
    description: "Recontrôler sur le serveur l'établissement actif, la classe, la période, l'élève et l'affiliation de l'acteur à chaque action.",
  },
  {
    id: "explicit_grants",
    title: "Droits nominatifs distincts",
    description: "Aucune action sensible ne découle du seul rôle admin, school_admin ou teacher. Prévoir des habilitations spécifiques, limitées et révocables.",
  },
  {
    id: "maker_checker",
    title: "Séparation demandeur / décideur",
    description: "Proposer qu'un demandeur ne puisse jamais approuver sa propre demande ; vérifier l'identité sur le serveur.",
  },
  {
    id: "publisher_separation",
    title: "Séparation décision / diffusion",
    description: "Proposer une autorisation de publication distincte de l'approbation ; décider si les deux responsables doivent être des personnes différentes.",
  },
  {
    id: "immutable_snapshot",
    title: "Version scolaire figée",
    description: "Signer une décision uniquement pour la version immuable du programme et des résultats ; toute modification rend la validation précédente inapplicable.",
  },
  {
    id: "server_transaction",
    title: "Décisions atomiques et horodatées",
    description: "Écriture future côté serveur avec vérification des droits au moment de l'action, gestion des doublons, version concurrente et journal append-only.",
  },
  {
    id: "school_data_privacy",
    title: "Confidentialité par établissement",
    description: "Éviter les accès croisés, limiter les événements de journal à des identifiants et motifs et définir l'accès des parents/élèves après publication.",
  },
] as const;

export const GOVERNANCE_DECISIONS_TO_APPROVE = [
  {
    id: "requester",
    title: "Qui pourra soumettre ?",
    suggestion: "Administrateur de l'établissement, uniquement avec une délégation explicite et active.",
  },
  {
    id: "approver",
    title: "Qui pourra décider ?",
    suggestion: "Responsable de l'établissement habilité, distinct du demandeur selon le principe des quatre yeux.",
  },
  {
    id: "publisher",
    title: "Qui pourra publier ou retirer ?",
    suggestion: "Responsable de diffusion désigné ; l'approbation seule ne déclenche aucune publication.",
  },
  {
    id: "delegations",
    title: "Comment déléguer et révoquer ?",
    suggestion: "Habilitations par établissement, durée, périmètre, auteur de délégation et journal d'audit.",
  },
  {
    id: "supplementary_data",
    title: "Quelles informations sont obligatoires ?",
    suggestion: "Décider pour les rangs, absences, appréciations et signatures avant d'ouvrir le circuit réel.",
  },
  {
    id: "withdrawal",
    title: "Que faire après une correction ?",
    suggestion: "Réexamen obligatoire d'une version modifiée ; définir correction, nouvelle publication et retrait.",
  },
  {
    id: "family_access",
    title: "Qui verra le bulletin publié ?",
    suggestion: "Définir l'accès de l'élève et de ses parents autorisés, sans fuite entre familles ou établissements.",
  },
] as const;

export type DraftBulletinGovernance = {
  roleMatrix: typeof SCHOOLNET_BULLETIN_ROLE_GOVERNANCE;
  functions: typeof PROPOSED_BULLETIN_RESPONSIBILITIES;
  guardrails: typeof PROPOSED_GOVERNANCE_GUARDS;
  decisionsToApprove: typeof GOVERNANCE_DECISIONS_TO_APPROVE;
  academicPrecontrol: "satisfied" | "requires_correction";
  currentPreviewOnly: true;
  roleAssignmentsApproved: false;
  canSubmit: false;
  canApprove: false;
  canPublish: false;
  canRevoke: false;
};

/** Fail closed even if upstream UI data is forged. Never returns granted rights. */
export function prepareBulletinGovernance(
  workflow: ApprovalWorkflowPreparation,
): DraftBulletinGovernance {
  if (workflow.canSubmit !== false ||
      workflow.canApprove !== false ||
      workflow.canPublish !== false ||
      workflow.approvalWorkflowInstalled !== false ||
      workflow.auditLogCreated !== false ||
      !Array.isArray(workflow.stages) ||
      workflow.stages.length !== 4 ||
      workflow.stages.slice(1).some(stage => stage.status !== "not_activated")) {
    throw new Error("Habilitations non disponibles : circuit administratif non sécurisé.");
  }

  return {
    roleMatrix: SCHOOLNET_BULLETIN_ROLE_GOVERNANCE,
    functions: PROPOSED_BULLETIN_RESPONSIBILITIES,
    guardrails: PROPOSED_GOVERNANCE_GUARDS,
    decisionsToApprove: GOVERNANCE_DECISIONS_TO_APPROVE,
    academicPrecontrol: workflow.pedagogicalReview === "complete"
      ? "satisfied" : "requires_correction",
    currentPreviewOnly: true,
    roleAssignmentsApproved: false,
    canSubmit: false,
    canApprove: false,
    canPublish: false,
    canRevoke: false,
  };
}
