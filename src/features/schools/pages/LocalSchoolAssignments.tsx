import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getAdminSchools,
  type SchoolRecord,
} from "@/features/schools/lib/schoolManagementApi";
import { areSchoolAssignmentsReadOnly } from "@/features/schools/lib/schoolAssignmentWritePolicy";
import {
  assignStudentToSchoolClass,
  assignTeacherToSchoolClassSubject,
  getLocalSchoolAssignmentsCatalog,
  isSchoolAssignmentsActivationPending,
  schoolAssignmentsErrorMessage,
  setStudentSchoolAssignmentActive,
  setTeacherSchoolAssignmentActive,
  type SchoolAssignmentsCatalog,
  type StudentClassAssignment,
  type TeacherSubjectAssignment,
} from "@/features/schools/lib/schoolAssignmentsApi";

type Activation = "checking" | "pending" | "ready" | "error";

export default function LocalSchoolAssignments() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const readOnlyPreview = areSchoolAssignmentsReadOnly();

  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [schoolsLoading, setSchoolsLoading] = useState(true);
  const [schoolError, setSchoolError] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<SchoolAssignmentsCatalog | null>(null);
  const [activation, setActivation] = useState<Activation>("checking");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [savingStudent, setSavingStudent] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id || isDemo) {
      setSchools([]);
      setSchoolId("");
      setSchoolsLoading(false);
      return;
    }
    let cancelled = false;
    setSchoolsLoading(true);
    setSchoolError(null);
    void getAdminSchools()
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((item) => item.status === "active");
        setSchools(active);
        setSchoolId((previous) =>
          active.some((row) => row.id === previous) ? previous : (active[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSchools([]);
        setSchoolId("");
        setSchoolError("Impossible de charger vos établissements autorisés.");
      })
      .finally(() => {
        if (!cancelled) setSchoolsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id, isDemo, authLoading]);

  useEffect(() => {
    setCatalog(null);
    setLoadError(null);
    setFormError(null);
    if (authLoading || !user?.id || isDemo || !schoolId) {
      setActivation("checking");
      return;
    }
    let cancelled = false;
    setActivation("checking");
    void getLocalSchoolAssignmentsCatalog(schoolId)
      .then((result) => {
        if (cancelled) return;
        setCatalog(result);
        setClassId((previous) =>
          result.classes.some((c) => c.id === previous) ? previous : (result.classes[0]?.id ?? ""),
        );
        setActivation("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setCatalog(null);
        setClassId("");
        if (isSchoolAssignmentsActivationPending(cause)) {
          setActivation("pending");
        } else {
          setActivation("error");
          setLoadError(schoolAssignmentsErrorMessage(cause));
        }
      });
    return () => { cancelled = true; };
  }, [user?.id, isDemo, authLoading, schoolId, revision]);

  const ready = activation === "ready" && catalog?.school_id === schoolId;
  const safeCatalog = ready ? catalog : null;
  const school = schools.find((item) => item.id === schoolId);
  const selectedClass = safeCatalog?.classes.find((item) => item.id === classId) ?? null;
  const studentAssignments = useMemo(() =>
    (safeCatalog?.student_assignments ?? []).filter((row) => row.class_id === classId),
    [safeCatalog, classId],
  );
  const teacherAssignments = useMemo(() =>
    (safeCatalog?.teacher_assignments ?? []).filter((row) => row.class_id === classId),
    [safeCatalog, classId],
  );
  const historyEvents = useMemo(() =>
    (safeCatalog?.events ?? []).filter((event) => event.class_id === classId),
    [safeCatalog, classId],
  );
  const activeStudentCount = studentAssignments.filter((row) => row.effective_active).length;
  const activeTeacherCount = teacherAssignments.filter((row) => row.effective_active).length;

  const availableStudents = useMemo(() => {
    if (!safeCatalog || !selectedClass) return [];
    return safeCatalog.students.filter((student) => {
      // Une classe active maximum par ecole et annee scolaire.
      const activeInYear = safeCatalog.student_assignments.some((assignment) =>
        assignment.student_id === student.id &&
        assignment.school_year_id === selectedClass.school_year_id &&
        assignment.status === "active",
      );
      // Meme une affectation revoquee se reactive, elle ne se recree pas.
      const existingSameClass = safeCatalog.student_assignments.some((assignment) =>
        assignment.student_id === student.id && assignment.class_id === selectedClass.id,
      );
      return !activeInYear && !existingSameClass;
    });
  }, [safeCatalog, selectedClass]);

  const availableTeachers = useMemo(() => {
    if (!safeCatalog || !selectedClass || !subjectId) return [];
    return safeCatalog.teachers.filter((teacher) =>
      !safeCatalog.teacher_assignments.some((assignment) =>
        assignment.teacher_id === teacher.id &&
        assignment.class_id === selectedClass.id &&
        assignment.subject_id === subjectId,
      ),
    );
  }, [safeCatalog, selectedClass, subjectId]);

  const busy = savingStudent || savingTeacher || changingId !== null;
  const canAssignStudent = Boolean(ready && !readOnlyPreview && !isDemo &&
    schoolId && selectedClass && studentId && !busy &&
    availableStudents.some((row) => row.id === studentId));
  const canAssignTeacher = Boolean(ready && !readOnlyPreview && !isDemo &&
    schoolId && selectedClass && teacherId && subjectId && !busy &&
    safeCatalog?.subjects.some((row) => row.id === subjectId) &&
    availableTeachers.some((row) => row.id === teacherId));

  function refresh() {
    setSuccess(null);
    setRevision((current) => current + 1);
  }

  function selectClass(nextId: string) {
    setClassId(nextId);
    setStudentId("");
    setTeacherId("");
    setSubjectId("");
    setFormError(null);
    setSuccess(null);
  }

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssignStudent || !selectedClass) return;
    setSavingStudent(true);
    setFormError(null);
    setSuccess(null);
    try {
      await assignStudentToSchoolClass(schoolId, selectedClass.id, studentId);
      setStudentId("");
      setSuccess("Élève affecté à cette classe et à cette année scolaire.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setFormError(schoolAssignmentsErrorMessage(cause));
    } finally {
      setSavingStudent(false);
    }
  }

  async function submitTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAssignTeacher || !selectedClass) return;
    setSavingTeacher(true);
    setFormError(null);
    setSuccess(null);
    try {
      await assignTeacherToSchoolClassSubject(schoolId, selectedClass.id, teacherId, subjectId);
      setTeacherId("");
      setSuccess("Enseignant affecté à la classe et à la matière sélectionnées.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setFormError(schoolAssignmentsErrorMessage(cause));
    } finally {
      setSavingTeacher(false);
    }
  }

  async function changeStudentStatus(assignment: StudentClassAssignment) {
    if (!ready || readOnlyPreview || busy || isDemo || !selectedClass) return;
    const activate = assignment.status === "revoked";
    const eligible = safeCatalog?.students.some((item) => item.id === assignment.student_id);
    if (activate && !eligible) return;
    const message = activate
      ? `Réactiver l'affectation de « ${assignment.student_name} » dans cette classe ?`
      : `Révoquer l'affectation de « ${assignment.student_name} » dans cette classe ?`;
    if (!window.confirm(message)) return;
    setChangingId(assignment.id);
    setFormError(null);
    setSuccess(null);
    try {
      await setStudentSchoolAssignmentActive(schoolId, assignment.id, activate);
      setSuccess(activate
        ? "Affectation de l'élève réactivée."
        : "Affectation de l'élève révoquée. Les résultats historiques sont conservés.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setFormError(schoolAssignmentsErrorMessage(cause));
    } finally {
      setChangingId(null);
    }
  }

  async function changeTeacherStatus(assignment: TeacherSubjectAssignment) {
    if (!ready || readOnlyPreview || busy || isDemo || !selectedClass) return;
    const activate = assignment.status === "revoked";
    const eligibleTeacher = safeCatalog?.teachers.some((item) => item.id === assignment.teacher_id);
    const eligibleSubject = safeCatalog?.subjects.some((item) => item.id === assignment.subject_id);
    if (activate && (!eligibleTeacher || !eligibleSubject)) return;
    const message = activate
      ? `Réactiver « ${assignment.teacher_name} » en ${assignment.subject_name} ?`
      : `Révoquer « ${assignment.teacher_name} » en ${assignment.subject_name} ?`;
    if (!window.confirm(message)) return;
    setChangingId(assignment.id);
    setFormError(null);
    setSuccess(null);
    try {
      await setTeacherSchoolAssignmentActive(schoolId, assignment.id, activate);
      setSuccess(activate
        ? "Affectation de l'enseignant réactivée."
        : "Affectation de l'enseignant révoquée. Les cours historiques sont conservés.");
      setRevision((value) => value + 1);
    } catch (cause) {
      setFormError(schoolAssignmentsErrorMessage(cause));
    } finally {
      setChangingId(null);
    }
  }

  return (
    <main className="space-y-5 pb-10">
      <header className="sn-card bg-gradient-to-r from-white via-blue-50 to-indigo-100 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
              SCHOOLNET · Espace établissement
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
              Affectations pédagogiques
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Affectez les élèves aux classes officielles et les enseignants aux
              classes et matières de votre établissement. Les opérations sont
              isolées par année scolaire et ne modifient pas les cours historiques.
            </p>
          </div>
          <Link to="/app/school/dashboard" className="sn-btn-ghost">
            ← Mon établissement
          </Link>
        </div>
      </header>

      <section className="sn-card space-y-3 p-5">
        <label htmlFor="assignment-school" className="block text-sm font-semibold text-slate-800">
          Établissement autorisé
        </label>
        {schoolsLoading ? (
          <p className="text-sm text-slate-500">Vérification des établissements…</p>
        ) : (
          <select
            id="assignment-school"
            className="sn-input w-full md:max-w-xl"
            value={schoolId}
            disabled={busy || isDemo || schools.length === 0}
            onChange={(event) => {
              setSchoolId(event.target.value);
              setClassId("");
              setStudentId("");
              setTeacherId("");
              setSubjectId("");
              setFormError(null);
              setSuccess(null);
            }}
          >
            {schools.length === 0 && <option value="">Aucun établissement autorisé</option>}
            {schools.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.code}
              </option>
            ))}
          </select>
        )}
        {school && (
          <p className="text-xs text-slate-500">
            Code : <span className="font-mono font-semibold">{school.code}</span>
          </p>
        )}
        {schoolError && <p role="alert" className="text-sm text-red-700">{schoolError}</p>}
      </section>

      {isDemo && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Mode démonstration : aucune donnée privée n'est affichée et aucune mutation n'est possible.
        </div>
      )}
      {!isDemo && readOnlyPreview && (
        <div role="status" className="sn-card border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-bold">Prévisualisation SCHOOLNET — lecture seule</p>
          <p className="mt-1">
            Sur localhost et les Previews Vercel, les affectations ne peuvent être
            ni créées ni révoquées ni réactivées. Le serveur applique les mêmes protections.
          </p>
        </div>
      )}
      {!isDemo && schoolId && activation === "pending" && (
        <div role="status" className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">🔒 S3-C — Activation du module en attente</p>
          <p className="mt-1">
            Les fonctions et les tables SQL S3-C ne sont pas encore installées
            dans Supabase. Cette page est préparée pour les tests en lecture seule.
          </p>
        </div>
      )}
      {!isDemo && schoolId && activation === "checking" && (
        <p role="status" className="sn-card p-4 text-sm text-slate-600">
          Chargement des classes, membres et matières de votre établissement…
        </p>
      )}
      {loadError && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</p>}
      {formError && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-800">{formError}</p>}
      {success && <p role="status" className="sn-card border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}

      <section className="sn-card space-y-4 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">1. Choisir une classe officielle</h2>
            <p className="mt-1 text-sm text-slate-600">
              La classe détermine automatiquement le niveau et l'année scolaire des affectations.
            </p>
          </div>
          <button
            className="sn-btn-ghost"
            type="button"
            disabled={!schoolId || schoolsLoading || busy || isDemo}
            onClick={refresh}
          >↻ Actualiser</button>
        </div>
        {safeCatalog && safeCatalog.classes.length > 0 ? (
          <div className="space-y-2">
            <label htmlFor="assignment-class" className="block text-sm font-semibold text-slate-800">
              Classe et année scolaire
            </label>
            <select id="assignment-class" className="sn-input w-full md:max-w-xl"
              value={classId} disabled={busy}
              onChange={(event) => selectClass(event.target.value)}>
              {safeCatalog.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.level_name} · {item.school_year}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            {ready ? "Aucune classe officielle créée dans cet établissement." :
              "Les classes autorisées apparaîtront après activation du catalogue S3-C."}
          </div>
        )}
        {ready && safeCatalog && safeCatalog.classes.length === 0 && (
          <Link className="sn-btn-ghost inline-flex" to="/app/school/classes">
            Préparer mes classes
          </Link>
        )}
        {selectedClass && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-800">
              {selectedClass.level_name}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-800">
              {selectedClass.school_year}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
              {activeStudentCount} élève(s) actif(s)
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
              {activeTeacherCount} intervention(s) active(s)
            </span>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="sn-card space-y-4 p-5 md:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">2. Élèves</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Élèves de la classe</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Un élève ne peut avoir qu'une classe active par établissement
              et par année scolaire. Pour changer de classe, révoquez
              d'abord l'affectation précédente.
            </p>
          </div>
          <form onSubmit={(event) => void submitStudent(event)} className="space-y-3">
            <label htmlFor="assignment-student" className="block text-sm font-semibold text-slate-800">
              Élève affilié à l'établissement *
            </label>
            <select id="assignment-student" className="sn-input w-full"
              value={studentId}
              required
              disabled={!selectedClass || busy || !ready}
              onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Sélectionner un élève disponible</option>
              {availableStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name || "Élève"}
                </option>
              ))}
            </select>
            <button className="sn-btn-primary w-full" type="submit" disabled={!canAssignStudent}>
              {savingStudent ? "Affectation en cours…" :
                readOnlyPreview ? "Aperçu en lecture seule" : "Affecter l'élève à la classe"}
            </button>
            {ready && safeCatalog && safeCatalog.students.length === 0 && (
              <p className="text-xs text-amber-800">
                Aucun élève affilié. <Link className="underline" to="/app/school/students">
                  Gérer les rattachements des élèves
                </Link>
              </p>
            )}
            {ready && selectedClass && safeCatalog && safeCatalog.students.length > 0 &&
              availableStudents.length === 0 && (
              <p className="text-xs text-slate-500">
                Aucun autre élève disponible pour cette classe et cette année.
              </p>
            )}
          </form>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Historique des affectations de la classe</h3>
            {!selectedClass || studentAssignments.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Aucune affectation élève enregistrée pour cette classe.
              </p>
            ) : studentAssignments.map((assignment) => {
              const reactivationEligible = safeCatalog?.students.some((item) => item.id === assignment.student_id);
              const actionDisabled = readOnlyPreview || busy || isDemo ||
                (assignment.status === "revoked" && !reactivationEligible);
              return (
                <article key={assignment.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {assignment.student_name || "Élève"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignment.status === "revoked" ? "Révoquée" :
                          assignment.effective_active ? "Active" : "Suspendue (affiliation inactive)"}
                      </p>
                    </div>
                    <button type="button" className="sn-btn-ghost"
                      disabled={actionDisabled}
                      onClick={() => void changeStudentStatus(assignment)}>
                      {changingId === assignment.id ? "Traitement…" :
                        assignment.status === "revoked" ? "Réactiver" : "Révoquer"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="sn-card space-y-4 p-5 md:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">3. Enseignants et matières</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Interventions pédagogiques</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Associez un enseignant affilié à une matière active pour cette classe.
              Plusieurs enseignants peuvent intervenir dans une même matière.
            </p>
          </div>
          <form onSubmit={(event) => void submitTeacher(event)} className="space-y-3">
            <label htmlFor="assignment-subject" className="block text-sm font-semibold text-slate-800">
              Matière *
            </label>
            <select id="assignment-subject" className="sn-input w-full" value={subjectId}
              required disabled={!selectedClass || busy || !ready}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setTeacherId("");
              }}>
              <option value="">Choisir une matière active</option>
              {(safeCatalog?.subjects ?? []).map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            </select>
            <label htmlFor="assignment-teacher" className="block text-sm font-semibold text-slate-800">
              Enseignant affilié *
            </label>
            <select id="assignment-teacher" className="sn-input w-full" value={teacherId}
              required disabled={!selectedClass || !subjectId || busy || !ready}
              onChange={(event) => setTeacherId(event.target.value)}>
              <option value="">Choisir un enseignant disponible</option>
              {availableTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name || "Enseignant"}
                </option>
              ))}
            </select>
            <button className="sn-btn-primary w-full" type="submit" disabled={!canAssignTeacher}>
              {savingTeacher ? "Affectation en cours…" :
                readOnlyPreview ? "Aperçu en lecture seule" : "Affecter l'enseignant et la matière"}
            </button>
            {ready && safeCatalog && safeCatalog.teachers.length === 0 && (
              <p className="text-xs text-amber-800">
                Aucun enseignant affilié. <Link to="/app/school/teachers" className="underline">
                  Gérer les enseignants
                </Link>
              </p>
            )}
            {ready && safeCatalog && safeCatalog.subjects.length === 0 && (
              <p className="text-xs text-amber-800">
                Aucune matière active dans le catalogue académique SCHOOLNET.
              </p>
            )}
          </form>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">Historique des interventions de la classe</h3>
            {!selectedClass || teacherAssignments.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Aucune intervention enseignant–matière enregistrée pour cette classe.
              </p>
            ) : teacherAssignments.map((assignment) => {
              const reactivationEligible =
                safeCatalog?.teachers.some((item) => item.id === assignment.teacher_id) &&
                safeCatalog?.subjects.some((item) => item.id === assignment.subject_id);
              const actionDisabled = readOnlyPreview || busy || isDemo ||
                (assignment.status === "revoked" && !reactivationEligible);
              return (
                <article key={assignment.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">
                        {assignment.teacher_name || "Enseignant"}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{assignment.subject_name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {assignment.status === "revoked" ? "Révoquée" :
                          assignment.effective_active ? "Active" : "Suspendue (affiliation ou matière inactive)"}
                      </p>
                    </div>
                    <button type="button" className="sn-btn-ghost"
                      disabled={actionDisabled}
                      onClick={() => void changeTeacherStatus(assignment)}>
                      {changingId === assignment.id ? "Traitement…" :
                        assignment.status === "revoked" ? "Réactiver" : "Révoquer"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sn-card space-y-3 p-5 md:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">
            4. Traçabilité des affectations
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">Journal des mouvements</h2>
          <p className="mt-1 text-sm text-slate-600">
            Chaque création, révocation et réactivation reste journalisée.
            Les événements affichés concernent uniquement la classe sélectionnée.
          </p>
        </div>
        {!ready || !selectedClass || historyEvents.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Aucun mouvement enregistré pour cette classe.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {historyEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {event.member_name || "Utilisateur"} ·
                  {event.action === "assigned" ? " Affectation" :
                    event.action === "revoked" ? " Révocation" : " Réactivation"}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {event.assignment_kind === "student_class" ? "Élève" :
                    `Enseignant · ${event.subject_name ?? "Matière"}`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(event.created_at).toLocaleString("fr-CI")} ·
                  Par {event.actor_name || "Administrateur"}
                </p>
              </div>
            ))}
          </div>
        )}
        {historyEvents.length >= 100 && (
          <p className="text-xs text-slate-500">
            Seuls les 100 mouvements les plus récents de l'établissement sont chargés.
          </p>
        )}
      </section>

      <div className="sn-card border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
        Les affectations officielles S3-C ne créent ni cours ni notes,
        ne changent pas les bulletins historiques et ne déplacent pas
        automatiquement les inscriptions scolaires existantes.
      </div>
    </main>
  );
}
