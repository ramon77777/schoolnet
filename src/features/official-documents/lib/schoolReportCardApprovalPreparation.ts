/**
 * SCHOOLNET V2 · S4-D.3f — PROPOSED approval process (read-only).
 *
 * This module DESCRIBES a future administrative workflow. It does not create
 * an approval, a publication status, an audit event or a server-side permission.
 * The input is the already-validated S4-D.3e administrative assessment.
 */
import type {
  AdministrativeReview,
} from "./schoolReportCardAdministrativeReview.ts";

export type PreparedReviewStage = {
  id: "academic_check" | "submit_for_review" | "administrative_decision" | "publication";
  title: string;
  responsibility: string;
  status: "checked" | "attention" | "not_activated";
  description: string;
};

export type ReviewPreparationBlocker = {
  code:
    | "academic_incomplete"
    | "school_identity"
    | "complementary_policy"
    | "approval_authority"
    | "immutable_snapshot"
    | "server_audit"
    | "publication_policy";
  label: string;
  detail: string;
};

export const PROPOSED_APPROVAL_EVENTS = [
  "review_submitted",
  "correction_requested",
  "approval_granted",
  "approval_refused",
  "publication_authorized",
  "publication_revoked",
] as const;

/**
 * Proposed minimum audit fields, NOT current persisted data.
 * No raw grades or names are needed in the future event trail.
 */
export const PROPOSED_APPROVAL_AUDIT_FIELDS = [
  { key: "school_scope", label: "Périmètre", detail: "Identifiants école, année, classe, période et élève" },
  { key: "actor", label: "Auteur", detail: "Identifiant serveur, rôle, habilitation effective au moment de l'action" },
  { key: "event", label: "Décision", detail: "Type d'action et motif, sans note brute dans les journaux" },
  { key: "source_version", label: "Preuve source", detail: "Révision immuable du bulletin et du programme approuvé" },
  { key: "server_time", label: "Horodatage", detail: "Date et heure attribuées côté serveur" },
  { key: "trace", label: "Chaînage", detail: "Identifiant d'événement, corrélation et version précédente" },
] as const;

export type ApprovalWorkflowPreparation = {
  pedagogicalReview: "complete" | "requires_corrections";
  stages: PreparedReviewStage[];
  blockers: ReviewPreparationBlocker[];
  proposedEventTypes: typeof PROPOSED_APPROVAL_EVENTS;
  proposedAuditFields: typeof PROPOSED_APPROVAL_AUDIT_FIELDS;
  approvalWorkflowInstalled: false;
  auditLogCreated: false;
  canSubmit: false;
  canApprove: false;
  canPublish: false;
};

/** Guardrails are unconditional: there is NO browser-side approval transition. */
export function prepareReportCardApprovalWorkflow(
  review: AdministrativeReview,
): ApprovalWorkflowPreparation {
  const identity = review.checks.find(check => check.id === "identity");
  const pedagogicalComplete =
    review.academicStatus === "pedagogically_complete" &&
    review.findings.length === 0 &&
    review.completeSubjects === review.expectedSubjects &&
    review.expectedSubjects > 0 &&
    identity?.status === "verified" &&
    review.checks.find(check => check.id === "curriculum")?.status === "verified" &&
    review.checks.find(check => check.id === "subject_results")?.status === "verified";

  const blockers: ReviewPreparationBlocker[] = [];
  if (!pedagogicalComplete) blockers.push({
    code: "academic_incomplete",
    label: "Contrôle pédagogique non terminé",
    detail: "Résoudre les matières non configurées, évaluations manquantes ou résultats indisponibles.",
  });
  if (identity?.status !== "verified") blockers.push({
    code: "school_identity",
    label: "Contexte scolaire à compléter",
    detail: "Vérifier l'identité, l'établissement, la classe, l'année et la période.",
  });
  blockers.push(
    {
      code: "complementary_policy",
      label: "Règles des informations complémentaires non définies",
      detail: "Décider si et comment les rangs, absences et appréciations doivent être exigés.",
    },
    {
      code: "approval_authority",
      label: "Responsabilités d'approbation à arrêter",
      detail: "Désigner les habilitations, la séparation des responsabilités et les règles de délégation.",
    },
    {
      code: "immutable_snapshot",
      label: "Version du bulletin à figer côté serveur",
      detail: "Lier chaque décision à une version immuable du programme et des résultats contrôlés.",
    },
    {
      code: "server_audit",
      label: "Journal des décisions non installé",
      detail: "Prévoir des événements datés côté serveur, avec auteur, motif et traçabilité.",
    },
    {
      code: "publication_policy",
      label: "Publication officielle non autorisée",
      detail: "Définir les permissions, la diffusion, la révocation et les accès parent/élève.",
    },
  );

  const stages: PreparedReviewStage[] = [
    {
      id: "academic_check",
      title: "1 · Contrôles pédagogiques",
      responsibility: "Administration de l'établissement · consultation uniquement",
      status: pedagogicalComplete ? "checked" : "attention",
      description: pedagogicalComplete
        ? "Résultats disponibles : précontrôle effectué, sans décision officielle."
        : "Corrections ou vérifications nécessaires avant toute demande d'examen.",
    },
    {
      id: "submit_for_review",
      title: "2 · Soumission à examen",
      responsibility: "Demandeur habilité · à désigner",
      status: "not_activated",
      description: "Future demande tracée sur une version figée du bulletin.",
    },
    {
      id: "administrative_decision",
      title: "3 · Décision administrative",
      responsibility: "Autorité d'approbation · à définir",
      status: "not_activated",
      description: "Future décision motivée : accord, refus ou retour pour correction.",
    },
    {
      id: "publication",
      title: "4 · Publication officielle",
      responsibility: "Autorité de publication · à définir",
      status: "not_activated",
      description: "Diffusion distincte de l'approbation, après habilitation serveur.",
    },
  ];

  return {
    pedagogicalReview: pedagogicalComplete ? "complete" : "requires_corrections",
    stages,
    blockers,
    proposedEventTypes: PROPOSED_APPROVAL_EVENTS,
    proposedAuditFields: PROPOSED_APPROVAL_AUDIT_FIELDS,
    approvalWorkflowInstalled: false,
    auditLogCreated: false,
    canSubmit: false,
    canApprove: false,
    canPublish: false,
  };
}
