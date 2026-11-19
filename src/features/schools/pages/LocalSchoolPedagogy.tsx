import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getAdminSchools, type SchoolRecord } from "@/features/schools/lib/schoolManagementApi";
import {
  getLocalSchoolAssignmentsCatalog,
  type SchoolAssignmentsCatalog,
} from "@/features/schools/lib/schoolAssignmentsApi";
import { buildSchoolPedagogyOverview } from "@/features/schools/lib/schoolPedagogyOverview";

type LoadState = "idle" | "loading" | "ready" | "error";

function NumberCard({ value, label, note }: {
  value: number;
  label: string;
  note: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </article>
  );
}

export default function LocalSchoolPedagogy() {
  const { user, loading: authLoading } = useAuth();
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolsForUser, setSchoolsForUser] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SchoolAssignmentsCatalog | null>(null);
  const [catalogForKey, setCatalogForKey] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const canRead = Boolean(
    !authLoading && user?.id && !user.isDemo && user.role === "school_admin",
  );
  const visibleSchools = canRead && schoolsForUser === user?.id ? schools : [];
  const waitingSchools = canRead && schoolsForUser !== user?.id;
  const selectedSchool = visibleSchools.find((school) => school.id === schoolId) ?? null;
  const requestKey = user?.id && schoolId
    ? user.id + "|" + schoolId + "|" + revision : "";

  // Les écoles visibles sont associées à l'utilisateur authentifié courant.
  useEffect(() => {
    if (!canRead || !user?.id) return;
    let cancelled = false;
    void getAdminSchools()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((school) => school.status === "active");
        setSchools(active);
        setSchoolsForUser(user.id);
        setSchoolId((previous) =>
          active.some((school) => school.id === previous)
            ? previous : (active[0]?.id ?? ""),
        );
        setSchoolsError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setSchoolsForUser(user.id);
        setSchoolId("");
        setSchoolsError("Impossible de charger les établissements autorisés.");
      });
    return () => { cancelled = true; };
  }, [canRead, user?.id]);

  // Ne montrer qu'une réponse liée à la session, l'école et la révision.
  // Une réponse réseau tardive ne doit jamais devenir visible après bascule.
  useEffect(() => {
    if (!canRead || !user?.id || !selectedSchool || !requestKey) return;
    let cancelled = false;
    void getLocalSchoolAssignmentsCatalog(schoolId)
      .then((result) => {
        if (cancelled) return;
        if (result.school_id !== schoolId) throw new Error("Catalogue hors établissement.");
        setCatalog(result);
        setCatalogForKey(requestKey);
        setLoadState("ready");
        setCatalogError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setCatalog(null);
        setCatalogForKey(requestKey);
        setLoadState("error");
        setCatalogError("Catalogue pédagogique indisponible ou accès non autorisé.");
      });
    return () => { cancelled = true; };
  }, [canRead, user?.id, selectedSchool, schoolId, requestKey]);

  const isCatalogLoading = Boolean(selectedSchool && catalogForKey !== requestKey);
  const isCatalogError = Boolean(selectedSchool && catalogForKey === requestKey && loadState === "error");
  const overview = useMemo(() => {
    if (!selectedSchool || catalogForKey !== requestKey ||
        loadState !== "ready" || !catalog || !(catalog.school_id === schoolId)) return null;
    return buildSchoolPedagogyOverview(catalog, schoolId);
  }, [selectedSchool, catalogForKey, requestKey, loadState, catalog, schoolId]);

  const isDemo = Boolean(user?.isDemo);
  return (
    <main className="space-y-5 pb-10">
      <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
          SCHOOLNET · Gestion des établissements · S4-A
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
              Pilotage pédagogique
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Vue des classes officielles, des élèves affectés et des interventions
              enseignants / matières de votre établissement.
            </p>
          </div>
          <Link to="/app/school/dashboard" className="sn-btn-ghost">← Mon établissement</Link>
        </div>
        <p className="mt-3 text-xs text-indigo-800">
          Consultation uniquement : aucune modification des affectations ou des cours historiques.
        </p>
      </header>

      {isDemo && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Le mode démonstration ne donne pas accès aux données des établissements réels.
        </div>
      )}

      {!isDemo && (
        <section className="sn-card space-y-3 p-5">
          <label htmlFor="school-pedagogy-select" className="block text-sm font-semibold text-slate-800">
            Établissement autorisé
          </label>
          {authLoading || waitingSchools ? (
            <p role="status" className="text-sm text-slate-600">
              Vérification de vos établissements…
            </p>
          ) : (
            <select
              id="school-pedagogy-select"
              className="sn-input w-full md:max-w-xl"
              value={schoolId}
              disabled={visibleSchools.length === 0}
              onChange={(event) => setSchoolId(event.target.value)}
            >
              {visibleSchools.length === 0 && <option value="">Aucun établissement autorisé</option>}
              {visibleSchools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name} — {school.code}
                </option>
              ))}
            </select>
          )}
          {selectedSchool && (
            <p className="text-xs text-slate-500">
              Code établissement : <span className="font-mono">{selectedSchool.code}</span>
            </p>
          )}
          {!waitingSchools && schoolsError && <p role="alert" className="text-sm text-red-700">{schoolsError}</p>}
          {!waitingSchools && !schoolsError && visibleSchools.length === 0 && (
            <p className="text-sm text-amber-800">
              Aucun établissement actif ne correspond à vos droits. Contactez le Super Administrateur.
            </p>
          )}
        </section>
      )}

      {!isDemo && selectedSchool && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              Situation de {selectedSchool.name}
            </h2>
            <button type="button" className="sn-btn-ghost"
              onClick={() => setRevision((value) => value + 1)}
              disabled={isCatalogLoading}>
              ↻ Actualiser
            </button>
          </div>

          {isCatalogLoading && (
            <div role="status" className="sn-card p-5 text-sm text-slate-600">
              Chargement du catalogue pédagogique autorisé…
            </div>
          )}
          {isCatalogError && (
            <div role="alert" className="sn-card border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              {catalogError}
            </div>
          )}
          {overview && (
            <>
              <section aria-label="Indicateurs de l'établissement"
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <NumberCard value={overview.classCount}
                  label="Classes officielles" note="Classes S2 de cet établissement" />
                <NumberCard value={overview.affiliatedStudentCount}
                  label="Élèves affiliés" note={overview.assignedStudentCount + " avec une classe active"} />
                <NumberCard value={overview.affiliatedTeacherCount}
                  label="Enseignants affiliés" note={overview.assignedTeacherCount + " affecté(s) à une classe"} />
                <NumberCard value={overview.teachingAssignmentCount}
                  label="Interventions pédagogiques" note="Couples enseignant / matière / classe actifs" />
              </section>

              <section className="sn-card space-y-4 p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Classes et affectations</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Chiffres issus des affectations scolaires actives S3-C ;
                      ils ne représentent pas les cours libres de la plateforme.
                    </p>
                  </div>
                  <Link className="sn-btn-ghost" to="/app/school/assignments">
                    Gérer les affectations
                  </Link>
                </div>
                {overview.classes.length === 0 ? (
                  <div role="status" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">
                    <p className="font-semibold text-slate-800">Aucune classe officielle pour cet établissement.</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Les classes historiques ne sont pas rattachées automatiquement.
                      Créez d'abord une classe officielle dans le module Classes,
                      puis vérifiez les affectations et l'année scolaire.
                    </p>
                    <Link to="/app/school/classes" className="sn-btn-ghost mt-3 inline-flex">
                      Consulter les classes
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {overview.classes.map((schoolClass) => (
                      <article key={schoolClass.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-slate-900">{schoolClass.name}</h3>
                            <p className="mt-1 text-xs text-slate-500">
                              {schoolClass.levelName} · {schoolClass.schoolYear}
                            </p>
                          </div>
                          <span className="sn-badge sn-badge-blue">Classe officielle</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-lg bg-white p-3">
                            <p className="font-semibold text-slate-900">{schoolClass.studentsAssigned}</p>
                            <p className="text-xs text-slate-500">Élèves affectés</p>
                          </div>
                          <div className="rounded-lg bg-white p-3">
                            <p className="font-semibold text-slate-900">{schoolClass.teachersAssigned}</p>
                            <p className="text-xs text-slate-500">Enseignants affectés</p>
                          </div>
                        </div>
                        <p className="mt-3 text-xs font-semibold text-slate-700">Matières affectées</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {schoolClass.subjects.length ? schoolClass.subjects.map((subject) => (
                            <span key={subject}
                              className="rounded-full bg-indigo-100 px-3 py-1 text-xs text-indigo-900">
                              {subject}
                            </span>
                          )) : (
                            <span className="text-xs text-slate-500">Aucune matière affectée à cette classe.</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}

      <section className="sn-card space-y-3 p-5 md:p-6">
        <h2 className="text-lg font-bold text-slate-900">Suite de l'intégration S4</h2>
        <p className="text-sm leading-6 text-slate-600">
          Cours, évaluations et bulletins seront reliés aux établissements
          après validation de leurs permissions SQL et de l'isolation entre écoles.
          Les cours libres SCHOOLNET restent indépendants.
        </p>
        <div className="flex flex-wrap gap-2">
          {["Cours et ressources", "Évaluations et notes", "Bulletins et présences"].map((module) => (
            <span key={module}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {module} · À raccorder
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
