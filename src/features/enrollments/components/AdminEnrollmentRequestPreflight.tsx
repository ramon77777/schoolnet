import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

type Level = { id: number; name: string };
type Class = {
  id: string;
  level_id: number;
  name: string;
  school_year: string;
};
type SchoolYear = { name: string; is_current: boolean };

type Catalog =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; classes: Class[]; currentYears: string[] };

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

function normalizedLevel(value: string | null): string {
  return normalizedName(value).replace(/[\s.\-–_]/g, "");
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
  const parentAccountFound = parentCandidates.email.length === 1 &&
    parentCandidates.emailAlreadyOtherRole.length === 0 &&
    parentCandidates.email[0].is_active;
  const studentAccountFound = studentCandidates.email.length === 1 &&
    studentCandidates.emailAlreadyOtherRole.length === 0 &&
    studentCandidates.email[0].is_active;

  useEffect(() => {
    if (request.request_type !== "student_enrollment") return;
    let cancelled = false;

    void (async () => {
      const [levels, classes, years] = await Promise.all([
        supabase.from("levels").select("id,name"),
        supabase.from("classes").select("id,name,level_id,school_year"),
        supabase.from("school_years").select("name,is_current"),
      ]);
      if (cancelled) return;

      if (levels.error || classes.error || years.error) {
        setCatalog({ status: "error" });
        return;
      }

      const wantedLevel = normalizedLevel(request.requested_level);
      const allowedLevelIds = new Set(
        ((levels.data ?? []) as Level[])
          .filter((level) => normalizedLevel(level.name) === wantedLevel)
          .map((level) => level.id),
      );
      const suggestedClasses = ((classes.data ?? []) as Class[])
        .filter((item) => allowedLevelIds.has(item.level_id))
        .sort((a, b) => a.school_year.localeCompare(b.school_year) || a.name.localeCompare(b.name));

      setCatalog({
        status: "ready",
        classes: suggestedClasses,
        currentYears: ((years.data ?? []) as SchoolYear[])
          .filter((year) => year.is_current)
          .map((year) => year.name),
      });
    })().catch(() => {
      if (!cancelled) setCatalog({ status: "error" });
    });

    return () => { cancelled = true; };
  }, [request.id, request.request_type, request.requested_level]);

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4" aria-label="Préparation de la demande en lecture seule">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-extrabold text-slate-950">
          Assistant de préparation — étape 1 : reconnaissance
        </h4>
        <span className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-blue-700">
          Lecture seule
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        SCHOOLNET recherche les comptes possibles et les classes existantes.
        Aucune personne n'est automatiquement identifiée, aucun lien familial
        n'est validé et aucune écriture en base n'est effectuée.
        La présélection n'agit que sur le formulaire de vérification ci-dessous.
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

      <div className="mt-3 space-y-2 rounded-xl border border-violet-200 bg-white p-3">
        <p className="text-sm font-bold text-slate-900">
          Étape 2 — Accès à préparer
        </p>
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
            Sans e-mail, un numéro propre à l'apprenant pourra servir à la
            connexion si l'authentification téléphone est configurée et le
            numéro vérifié. Le téléphone du parent sert au contact familial,
            jamais d'identifiant partagé entre plusieurs comptes.
            L'e-mail du parent recevra les communications après vérification ;
            ce n'est pas l'e-mail Auth de l'enfant.
          </p>
        )}
        <p className="text-xs font-medium text-violet-800">
          Activation des invitations en attente de la fonction serveur sécurisée.
          Ne transmettez aucun mot de passe par e-mail.
        </p>
      </div>
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
          {catalog.status === "ready" && catalog.classes.length === 0 && (
            <p className="mt-2 text-xs text-amber-800">
              Aucune classe du niveau demandé n'a été trouvée. Vérifiez le niveau
              et les classes disponibles avant de valider une affectation.
            </p>
          )}
          {catalog.status === "ready" && catalog.classes.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {catalog.classes.slice(0, 8).map((item) => (
                <li key={item.id}>
                  • {item.name} — {item.school_year}
                  {catalog.currentYears.includes(item.school_year)
                    ? " (année courante)"
                    : " (année différente de l'année courante : à vérifier)"}
                </li>
              ))}
              {catalog.classes.length > 8 && (
                <li>Et {catalog.classes.length - 8} autre(s) classe(s)…</li>
              )}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-600">
        Prochaine étape : l'administrateur confirme l'identité du responsable
        et la classe. L'automatisation des comptes et des invitations sera
        activée séparément après ses tests de sécurité.
      </p>
    </section>
  );
}
