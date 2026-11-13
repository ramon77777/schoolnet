import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  resolveSchoolLevelCatalog,
  type AcademicSchoolLevel,
  type AcademicSchoolClass,
  type PublicSchoolLevel,
  type SchoolLevelResolution,
} from "@/features/enrollments/lib/schoolLevelConsistency";
import { inspectFamilyInvitation, type FamilyInvitationInspection, type FamilyInvitationRecipient } from "@/features/enrollments/lib/adminFamilyInvitationApi";

type RequestType = "student_enrollment" | "parent_access";

type Person = {
  id: string;
  role: string | null;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
};

type Request = {
  id: string;
  request_type: RequestType;
  guardian_full_name: string;
  guardian_email: string | null;
  student_full_name: string;
  student_email: string | null;
  requested_level: string | null;
};

type SchoolYear = { name: string; is_current: boolean };

type Catalog =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; resolution: SchoolLevelResolution; currentYears: string[] };

type InspectionSlot = {
  requestId: string;
  email: string;
  loading: boolean;
  result?: FamilyInvitationInspection;
  error?: string;
};

const invitationDecisionLabels: Record<FamilyInvitationInspection["decision"], string> = {
  new_invitation_possible: "Aucun compte trouvé. Préparation envisageable après vérification (désactivée).",
  reuse_after_verification: "Compte existant : confirmer l'identité et réutiliser manuellement.",
  manual_review: "Incohérence détectée : vérification manuelle obligatoire.",
  already_prepared: "Une préparation figure déjà au registre : aucune duplication autorisée.",
  already_activated: "Une activation est déjà enregistrée : contrôle administratif requis.",
};

function normalizedEmail(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizedName(value: string | null): string {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

type Matching = {
  email: Person[];
  nameOnly: Person[];
  emailAlreadyOtherRole: Person[];
};

function findCandidates(
  users: Person[],
  role: "parent" | "student",
  requestedName: string,
  requestedEmail: string | null,
): Matching {
  const email = normalizedEmail(requestedEmail);
  const name = normalizedName(requestedName);
  const matchingEmail = email
    ? users.filter((item) => normalizedEmail(item.email) === email)
    : [];

  const emailMatches = matchingEmail.filter((item) => item.role === role);
  const emailAlreadyOtherRole = matchingEmail.filter((item) => item.role !== role);
  const nameOnly = name
    ? users.filter((item) =>
      item.role === role &&
      normalizedName(item.full_name) === name &&
      !emailMatches.some((match) => match.id === item.id)
    )
    : [];

  return {
    email: emailMatches,
    nameOnly,
    emailAlreadyOtherRole,
  };
}

function CandidateSummary({
  title,
  email,
  matches,
  role,
  requestedName,
  selectedId,
  onSelectCandidate,
}: {
  title: string;
  email: string | null;
  matches: Matching;
  role: "parent" | "student";
  requestedName: string;
  selectedId: string;
  onSelectCandidate: (role: "parent" | "student", userId: string) => void;
}) {
  const uniqueEmailMatch = matches.email.length === 1 &&
    matches.emailAlreadyOtherRole.length === 0 &&
    matches.email[0].is_active &&
    normalizedName(matches.email[0].full_name) === normalizedName(requestedName)
    ? matches.email[0]
    : null;
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 break-all text-xs text-slate-500">
        {email?.trim() || "Adresse e-mail personnelle non fournie"}
      </p>
      {matches.email.length === 1 && matches.email[0].is_active && (
        <p className="mt-2 text-xs text-emerald-800">
          ✓ Un compte de ce rôle utilise déjà cet e-mail :{" "}
          <strong>{matches.email[0].full_name || "Nom à vérifier"}</strong>.
          Identité à confirmer avant réutilisation.
        </p>
      )}
      {uniqueEmailMatch && (
        <button
          className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-default disabled:opacity-60"
          type="button"
          disabled={selectedId === uniqueEmailMatch.id}
          onClick={() => onSelectCandidate(role, uniqueEmailMatch.id)}
        >
          {selectedId === uniqueEmailMatch.id
            ? "Compte déjà présélectionné"
            : "Présélectionner ce compte"}
        </button>
      )}
      {matches.email.length === 1 && !uniqueEmailMatch &&
        !matches.emailAlreadyOtherRole.length && matches.email[0].is_active && (
          <p className="mt-2 text-xs font-semibold text-amber-800">
            Le nom du compte diffère de celui de la demande : vérifiez-le
            manuellement avant toute sélection.
          </p>
        )}
      {matches.email.length > 1 && (
        <p className="mt-2 text-xs text-amber-800">
          Plusieurs comptes correspondent à cet e-mail. Vérification manuelle obligatoire.
        </p>
      )}
      {matches.email.some((item) => !item.is_active) && (
        <p className="mt-2 text-xs text-amber-800">
          Un compte correspondant est désactivé. Aucune réactivation automatique.
        </p>
      )}
      {matches.emailAlreadyOtherRole.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-red-700">
          Cet e-mail appartient à un compte d'un autre rôle : aucune création ou promotion automatique.
        </p>
      )}
      {matches.email.length === 0 && matches.emailAlreadyOtherRole.length === 0 && (
        <p className="mt-2 text-xs text-slate-700">
          {email
            ? "Aucun compte de ce rôle trouvé avec cet e-mail. Un accès pourra être préparé après validation."
            : "Sans e-mail distinct, la méthode d'accès personnel reste à définir avant création."}
        </p>
      )}
      {matches.nameOnly.length > 0 && (
        <p className="mt-2 text-xs text-amber-800">
          {matches.nameOnly.length} profil(s) portent le même nom.
          Ce n'est <strong>pas</strong> une preuve d'identité ni un motif de rattachement.
        </p>
      )}
    </div>
  );
}

/**
 * Lots 5.C-A / 5.C-B (préparation) : sans écriture côté serveur. Cet écran ne
 * crée aucun utilisateur, compte Auth, lien familial, dossier annuel ou affectation.
 * L'administration doit garder la décision d'identité et de classe.
 */
export default function AdminEnrollmentRequestPreflight({
  request,
  users,
  selectedParentId,
  selectedStudentId,
  onSelectCandidate,
}: {
  request: Request;
  users: Person[];
  selectedParentId: string;
  selectedStudentId: string;
  onSelectCandidate: (role: "parent" | "student", userId: string) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog>({ status: "loading" });
  const [inspections, setInspections] =
    useState<Partial<Record<FamilyInvitationRecipient, InspectionSlot>>>({});

  async function checkInvitation(recipient: FamilyInvitationRecipient): Promise<void> {
    const requestId = request.id;
    const email = normalizedEmail(recipient === "parent" ? request.guardian_email : request.student_email);
    const otherEmail = normalizedEmail(recipient === "parent" ? request.student_email : request.guardian_email);
    if (!email || (otherEmail && email === otherEmail)) return;
    setInspections((current) => ({
      ...current,
      [recipient]: { requestId, email, loading: true },
    }));

    function finish(next: Pick<InspectionSlot, "loading" | "result" | "error">): void {
      setInspections((current) => {
        const previous = current[recipient];
        if (!previous || previous.requestId !== requestId || previous.email !== email) {
          return current;
        }
        return { ...current, [recipient]: { ...previous, ...next } };
      });
    }

    try {
      const result = await inspectFamilyInvitation(requestId, recipient);
      if (normalizedEmail(result.email) !== email) {
        throw new Error("Le destinataire a changé : relancez l'inspection avant toute décision.");
      }
      finish({ loading: false, result, error: undefined });
    } catch (error) {
      finish({
        loading: false,
        result: undefined,
        error: error instanceof Error ? error.message : "Inspection indisponible.",
      });
    }
  }

  const parentCandidates = useMemo(
    () => findCandidates(users, "parent", request.guardian_full_name, request.guardian_email),
    [users, request.guardian_full_name, request.guardian_email],
  );
  const studentCandidates = useMemo(
    () => findCandidates(users, "student", request.student_full_name, request.student_email),
    [users, request.student_full_name, request.student_email],
  );
  const guardianEmail = normalizedEmail(request.guardian_email);
  const studentEmail = normalizedEmail(request.student_email);
  const sameEmail = Boolean(guardianEmail && guardianEmail === studentEmail);
  const availableRecipients: FamilyInvitationRecipient[] =
    request.request_type === "student_enrollment" ? ["parent", "student"] : ["parent"];
  const currentInspection = (recipient: FamilyInvitationRecipient): InspectionSlot | undefined => {
    const inspection = inspections[recipient];
    const email = recipient === "parent" ? guardianEmail : studentEmail;
    return inspection?.requestId === request.id && inspection.email === email
      ? inspection : undefined;
  };
  const inspectionLoading = availableRecipients.some((recipient) => currentInspection(recipient)?.loading);
  const parentAccountFound = parentCandidates.email.length === 1 &&
    parentCandidates.emailAlreadyOtherRole.length === 0 &&
    parentCandidates.email[0].is_active;
  const studentAccountFound = studentCandidates.email.length === 1 &&
    studentCandidates.emailAlreadyOtherRole.length === 0 &&
    studentCandidates.email[0].is_active;

  useEffect(() => {
    if (request.request_type !== "student_enrollment") return;
    let cancelled = false;

    setCatalog({ status: "loading" });
    void (async () => {
      const [publicLevels, academicLevels, classes, years] = await Promise.all([
        supabase.from("public_levels").select("slug,name,short_label,is_visible"),
        supabase.from("levels").select("id,name"),
        supabase.from("classes").select("id,name,level_id,school_year"),
        supabase.from("school_years").select("name,is_current"),
      ]);
      if (cancelled) return;

      if (publicLevels.error || academicLevels.error || classes.error || years.error) {
        setCatalog({ status: "error" });
        return;
      }

      const currentYears = ((years.data ?? []) as SchoolYear[])
        .filter((year) => year.is_current)
        .map((year) => year.name);
      const resolution = resolveSchoolLevelCatalog({
        requestedLevel: request.requested_level,
        publicLevels: (publicLevels.data ?? []) as PublicSchoolLevel[],
        academicLevels: (academicLevels.data ?? []) as AcademicSchoolLevel[],
        classes: (classes.data ?? []) as AcademicSchoolClass[],
        currentYears,
      });
      setCatalog({ status: "ready", resolution, currentYears });
    })().catch(() => {
      if (!cancelled) setCatalog({ status: "error" });
    });

    return () => { cancelled = true; };
  }, [request.id, request.request_type, request.requested_level]);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3 sm:p-4" aria-label="Préparation de la demande en lecture seule">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-extrabold text-slate-950">
          Assistant de préparation — étape 1 : reconnaissance
        </h4>
        <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-blue-700">
          Lecture seule
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        SCHOOLNET suggère les comptes et classes existants, sans créer de compte
        ni vérifier automatiquement l'identité ou le lien familial.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CandidateSummary
          title="Parent / tuteur"
          email={request.guardian_email}
          matches={parentCandidates}
          role="parent"
          requestedName={request.guardian_full_name}
          selectedId={selectedParentId}
          onSelectCandidate={onSelectCandidate}
        />
        <CandidateSummary
          title="Apprenant"
          email={request.student_email}
          matches={studentCandidates}
          role="student"
          requestedName={request.student_full_name}
          selectedId={selectedStudentId}
          onSelectCandidate={onSelectCandidate}
        />
      </div>

      <details className="mt-3 rounded-xl border border-sky-200 bg-white">
        <summary className="cursor-pointer p-3 text-sm font-bold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
          Recette serveur 5.C-B.2 — inspection sans écriture
        </summary>
        <div className="space-y-3 border-t border-sky-100 p-3">
          <p className="text-xs leading-5 text-slate-600">
            Vérification du registre et des comptes par la fonction serveur, séparément pour chaque destinataire.
            Aucun compte, lien d'activation ou invitation n'est créé.
          </p>
          {sameEmail && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              Parent et apprenant utilisent la même adresse : vérification manuelle obligatoire.
              Aucune préparation de deux comptes distincts.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={inspectionLoading || !guardianEmail || sameEmail}
              onClick={() => { void checkInvitation("parent"); }}
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Inspecter le parent
            </button>
            {request.request_type === "student_enrollment" && (
              <button
                type="button"
                disabled={inspectionLoading || !studentEmail || sameEmail}
                onClick={() => { void checkInvitation("student"); }}
                className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Inspecter l'apprenant
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableRecipients.map((recipient) => {
              const current = currentInspection(recipient);
              const label = recipient === "parent" ? "Parent / tuteur" : "Apprenant";
              return (
                <div key={recipient} className="min-w-0 rounded-xl border border-sky-100 bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-900">{label}</p>
                  {!current && (
                    <p className="mt-1 text-xs text-slate-600">Inspection non exécutée pour cette demande.</p>
                  )}
                  {current?.loading && (
                    <p role="status" className="mt-1 text-xs text-slate-600">Inspection en cours…</p>
                  )}
                  {current?.error && (
                    <p role="alert" className="mt-1 text-xs text-amber-800">{current.error}</p>
                  )}
                  {current?.result && (
                    <div role="status" className="mt-2 space-y-1 text-xs leading-5 text-emerald-950">
                      <p className="font-bold text-emerald-800">Inspection confirmée — aucune écriture</p>
                      <p>{invitationDecisionLabels[current.result.decision]}</p>
                      <p>Registre : {current.result.invitation_status ?? "Aucune invitation enregistrée"}</p>
                      <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-slate-700">
                        <p className="font-semibold text-slate-900">Suivi transmission / activation (A.2)</p>
                        <p>
                          Transmission :{" "}
                          {current.result.delivery_status === "declared_by_admin"
                            ? "déclarée manuellement par un administrateur"
                            : current.result.delivery_status === "ready_to_declare"
                              ? "lien préparé, transmission non déclarée"
                              : current.result.delivery_status === "not_declared"
                                ? "aucune transmission déclarée"
                                : "suivi A.2 serveur en attente de publication"}
                        </p>
                        {current.result.delivery_declared_at &&
                          Number.isFinite(Date.parse(current.result.delivery_declared_at)) && (
                          <p>Date déclarée : {new Date(current.result.delivery_declared_at).toLocaleString("fr-FR")}</p>
                        )}
                        <p>
                          Activation :{" "}
                          {current.result.activation_status === "recorded_in_registry"
                            ? "statut enregistré au registre, preuve Auth encore à vérifier"
                            : "non confirmée"}
                        </p>
                        <p>
                          Preuve serveur :{" "}
                          {current.result.activation_evidence_verified === true &&
                            current.result.activation_proof_state === "verified"
                              ? "correspondance Auth contrôlée"
                              : current.result.activation_proof_state === "requires_review" ||
                                current.result.activation_proof_state === "identity_mismatch" ||
                                current.result.activation_proof_state === "invalid_chronology"
                                  ? "incohérence — vérification humaine requise"
                                  : current.result.activation_proof_state === "awaiting_delivery"
                                    ? "transmission préalable attendue"
                                    : "non disponible — aucun contrôle Auth complet déployé"}
                        </p>
                        <p className="text-amber-800">
                          Une déclaration d'envoi, une session ou un e-mail confirmé ne prouvent pas
                          l'activation. Le serveur doit vérifier le changement de mot de passe
                          puis une authentification par mot de passe avant toute confirmation.
                        </p>
                      </div>
                      {current.result.can_resume && (
                        <p>Reprise à examiner par l'administration, non activée.</p>
                      )}
                      {current.result.can_renew && (
                        <p>Renouvellement à examiner par l'administration, non activé.</p>
                      )}
                      {current.result.can_flag_review && (
                        <p>Interruption ancienne détectée : revue humaine nécessaire.</p>
                      )}
                      <p className="text-slate-500">Décision technique : {current.result.decision}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700">
            <p className="font-bold text-slate-900">Avant toute future activation</p>
            <p>Vérifier hors de cet assistant l'identité, le lien familial, le dossier scolaire
              et la propriété de chaque adresse e-mail. Un compte retrouvé ne prouve pas la filiation.</p>
            <p className="mt-1 font-semibold text-violet-800">
              Création de comptes, déclaration de transmission, confirmation d'activation
              et rattachements toujours désactivés. Vérification A.2.2 strictement consultative.
            </p>
          </div>
        </div>
      </details>

      <details className="mt-3 rounded-xl border border-violet-200 bg-white">
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-3 text-sm font-bold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600">
          <span>Étape 2 — Accès à préparer</span>
          <span className="text-xs font-normal text-violet-800">
            {parentAccountFound ? "Parent retrouvé" : "Parent à vérifier"} ·{" "}
            {studentAccountFound ? "Apprenant retrouvé" : studentEmail ? "Invitation à préparer" : "Apprenant sans e-mail"} · Détails
          </span>
        </summary>
        <div className="space-y-2 border-t border-violet-100 p-3">
        <p className="text-xs text-slate-600">
          Prévisualisation uniquement : les comptes et invitations ne sont pas
          encore créés. L'administration conserve la vérification de l'identité.
        </p>
        <div className="space-y-1 text-xs leading-5 text-slate-700">
          <p>
            <strong>Parent :</strong>{" "}
            {parentCandidates.emailAlreadyOtherRole.length
              ? "Adresse déjà utilisée par un autre rôle : examen manuel obligatoire."
              : parentAccountFound
                ? "Compte Parent retrouvé. Le réutiliser après contrôle du lien familial."
                : guardianEmail
                  ? "Compte à vérifier puis, s'il manque, invitation à préparer avec cet e-mail."
                  : "E-mail du responsable manquant : demander un contact vérifié avant une invitation."}
          </p>
          <p>
            <strong>Apprenant :</strong>{" "}
            {sameEmail
              ? "Même adresse que le parent : elle ne peut pas activer deux comptes distincts."
              : studentCandidates.emailAlreadyOtherRole.length
                ? "Adresse occupée par un autre rôle : examen manuel obligatoire."
                : studentAccountFound
                  ? "Compte Apprenant retrouvé. Le réutiliser après vérification."
                  : studentEmail
                    ? "E-mail personnel distinct disponible : accès à préparer après validation."
                    : "Aucun e-mail personnel : prévoir un accès individualisé, sous supervision parentale."}
          </p>
        </div>
        {!studentEmail && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Sans e-mail personnel, l'apprenant disposera d'un identifiant
            SCHOOLNET unique et de son propre mot de passe. Le téléphone familial
            pourra être partagé entre plusieurs enfants : chaque accès restera
            individualisé par son code SCHOOLNET et son mot de passe. Le mot de
            passe et le compte Auth du Parent ne seront jamais réutilisés.
            L'e-mail du Parent reste uniquement un contact de remise vérifié.
          </p>
        )}
        <p className="text-xs font-medium text-violet-800">
          Invitations non actives à cette étape. Ne transmettez aucun mot de passe par e-mail.
        </p>
        </div>
      </details>
      {request.request_type === "student_enrollment" && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-bold text-slate-900">
            Classes existantes du niveau demandé : {request.requested_level || "à vérifier"}
          </p>
          {catalog.status === "loading" && (
            <p role="status" className="mt-2 text-xs text-slate-600">
              Recherche dans les classes existantes…
            </p>
          )}
          {catalog.status === "error" && (
            <p role="alert" className="mt-2 text-xs text-amber-800">
              Répertoire des classes indisponible. Aucun rattachement n'est proposé automatiquement.
            </p>
          )}
          {catalog.status === "ready" && catalog.resolution.publicLevel && (
            <p className="mt-2 text-xs text-slate-700">
              Niveau de référence : <strong>{catalog.resolution.publicLevel.name}</strong>
              {" "}({catalog.resolution.publicLevel.short_label || catalog.resolution.publicLevel.slug})
              {" "}— présent dans le catalogue public.
              {!catalog.resolution.publicLevel.is_visible && (
                <span className="text-amber-800"> Actuellement masqué sur le site public.</span>
              )}
            </p>
          )}
          {catalog.status === "ready" && catalog.resolution.state === "academic_catalog_missing" && (
            <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">
              Ce niveau existe déjà dans « Niveaux & Matières » du site public,
              mais il n'est pas encore synchronisé dans les niveaux de gestion scolaire.
              Il faudra synchroniser le niveau avant de créer une classe. Aucune classe
              ni inscription n'est créée automatiquement.
            </p>
          )}
          {catalog.status === "ready" && catalog.resolution.state === "classes_missing" && (
            <p role="status" className="mt-2 text-xs leading-5 text-amber-800">
              Le niveau est configuré dans la gestion scolaire, mais aucune classe
              n'a encore été créée pour ce niveau. L'établissement doit ouvrir
              une classe réelle avant toute affectation.
            </p>
          )}
          {catalog.status === "ready" && catalog.resolution.state === "classes_other_school_year" && (
            <p role="status" className="mt-2 text-xs leading-5 text-amber-800">
              Des classes existent pour ce niveau, mais aucune pour l'année scolaire
              courante. Ne pas affecter un apprenant à une classe d'une autre année.
            </p>
          )}
          {catalog.status === "ready" && (
            catalog.resolution.state === "public_catalog_missing" ||
            catalog.resolution.state === "public_catalog_missing_for_academic" ||
            catalog.resolution.state === "academic_catalog_ambiguous" ||
            catalog.resolution.state === "missing_request"
          ) && (
            <p role="alert" className="mt-2 text-xs leading-5 text-amber-800">
              {catalog.resolution.state === "missing_request"
                ? "Niveau scolaire non renseigné dans la demande."
                : catalog.resolution.state === "academic_catalog_ambiguous"
                  ? "Plusieurs niveaux de gestion correspondent au même niveau : correction administrative nécessaire."
                  : catalog.resolution.state === "public_catalog_missing_for_academic"
                    ? "Ce niveau existe dans la gestion scolaire mais pas dans le catalogue public : cohérence à vérifier."
                    : "Niveau introuvable dans les catalogues public et scolaire : vérification nécessaire."}
            </p>
          )}
          {catalog.status === "ready" && catalog.resolution.state === "classes_available" && (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {catalog.resolution.currentClasses.slice(0, 8).map((item) => (
                <li key={item.id}>• {item.name} — {item.school_year} (année courante)</li>
              ))}
              {catalog.resolution.currentClasses.length > 8 && (
                <li>Et {catalog.resolution.currentClasses.length - 8} autre(s) classe(s) pour l'année courante…</li>
              )}
            </ul>
          )}
          {catalog.status === "ready" && catalog.resolution.state === "classes_other_school_year" && (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {catalog.resolution.classes.slice(0, 5).map((item) => (
                <li key={item.id}>• {item.name} — {item.school_year} (autre année, non proposée)</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-600">
        La présélection reste une aide à la vérification, jamais une validation définitive.
      </p>
    </section>
  );
}
