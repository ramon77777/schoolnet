// src/features/admin/pages/AdminEnrollments.tsx
// SCHOOLNET | Lot 5 - Inscriptions et dossiers des apprenants
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import AdminEnrollmentDocuments from "@/features/enrollments/components/AdminEnrollmentDocuments";
import {
  enrollmentErrorMessage,
  getAdminEnrollmentCatalog,
  getAdminEnrollmentHistory,
  getAdminEnrollments,
  saveAdminEnrollment,
  setAdminEnrollmentStatus,
} from "@/features/enrollments/lib/adminEnrollmentsApi";
import type {
  AdminEnrollment,
  AdmissionType,
  EnrollmentCatalog,
  EnrollmentEvent,
  EnrollmentStatus,
  StudentGender,
} from "@/features/enrollments/lib/adminEnrollmentsApi";

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  draft: "Brouillon",
  active: "Active",
  withdrawn: "Retirée",
  completed: "Terminée",
  cancelled: "Annulée",
};

const STATUS_COLORS: Record<EnrollmentStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  withdrawn: "border-amber-200 bg-amber-50 text-amber-800",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

const ADMISSION_LABELS: Record<AdmissionType, string> = {
  new: "Nouvelle inscription",
  continuing: "Réinscription",
  transfer: "Transfert",
  reentry: "Retour après interruption",
};

const GENDER_LABELS: Record<StudentGender, string> = {
  male: "Masculin",
  female: "Féminin",
};

function getGenderLabel(gender: StudentGender | null | undefined) {
  return gender ? GENDER_LABELS[gender] : "Non renseigné";
}

const EMPTY_CATALOG: EnrollmentCatalog = {
  years: [],
  classes: [],
  students: [],
};

type EnrollmentFormState = {
  studentId: string;
  yearId: string;
  classId: string;
  gender: StudentGender | "";
  enrolledOn: string;
  admissionType: AdmissionType;
  previousSchool: string;
  notes: string;
};

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyForm(yearId = ""): EnrollmentFormState {
  return {
    studentId: "",
    yearId,
    classId: "",
    gender: "",
    enrolledOn: todayISO(),
    admissionType: "new",
    previousSchool: "",
    notes: "",
  };
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("fr-FR");
}

function StatusBadge({ status }: { status: EnrollmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function SmallStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: string;
}) {
  return (
    <div className="sn-card flex items-center gap-3 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl">
        {icon}
      </div>
      <div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="text-2xl font-extrabold tracking-tight text-slate-900">
          {value}
        </div>
      </div>
    </div>
  );
}

export default function AdminEnrollments() {
  const { user, loading: authLoading } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const userId = user?.id ?? null;

  const [catalog, setCatalog] = useState<EnrollmentCatalog>(EMPTY_CATALOG);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [yearFilter, setYearFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<AdminEnrollment | null>(null);
  const [form, setForm] = useState<EnrollmentFormState>(() => emptyForm());
  const [studentSearch, setStudentSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<AdminEnrollment | null>(null);
  const [history, setHistory] = useState<EnrollmentEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<EnrollmentStatus>("active");
  const [statusNote, setStatusNote] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const currentYear = useMemo(
    () => catalog.years.find((year) => year.is_current) ?? null,
    [catalog.years],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!userId || isDemo) {
      setCatalogReady(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setCatalogReady(false);
    setCatalogError(null);

    void (async () => {
      try {
        const nextCatalog = await getAdminEnrollmentCatalog();
        if (cancelled) return;
        setCatalog(nextCatalog);
        setYearFilter(nextCatalog.years.find((year) => year.is_current)?.id ?? "all");
      } catch (cause) {
        if (!cancelled) {
          setCatalogError(enrollmentErrorMessage(cause));
        }
      } finally {
        if (!cancelled) setCatalogReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, isDemo]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!catalogReady || !userId || isDemo) return;
    if (catalogError) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await getAdminEnrollments({
          schoolYearId: yearFilter === "all" ? null : yearFilter,
          classId: classFilter === "all" ? null : classFilter,
          status: statusFilter === "all" ? null : statusFilter,
          search: debouncedSearch,
        });
        if (!cancelled) {
          setRows(result);
          setPage((previous) =>
            Math.min(previous, Math.max(1, Math.ceil(result.length / PAGE_SIZE))),
          );
        }
      } catch (cause) {
        if (!cancelled) {
          setRows([]);
          setError(enrollmentErrorMessage(cause));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [catalogReady, userId, isDemo, catalogError, yearFilter, classFilter, statusFilter, debouncedSearch, refreshVersion]);

  useEffect(() => setPage(1), [yearFilter, classFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    setHistory([]);
    void (async () => {
      try {
        const result = await getAdminEnrollmentHistory(detail.enrollment_id);
        if (!cancelled) setHistory(result);
      } catch (cause) {
        if (!cancelled) setHistoryError(enrollmentErrorMessage(cause));
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail]);

  const yearClasses = useMemo(
    () => catalog.classes.filter((item) => {
      if (yearFilter === "all") return true;
      const selectedYear = catalog.years.find((year) => year.id === yearFilter);
      return Boolean(
        item.school_year_id === yearFilter ||
        (item.school_year_id === null && selectedYear?.name === item.school_year),
      );
    }),
    [catalog.classes, catalog.years, yearFilter],
  );

  const formClasses = useMemo(() => {
    const formYear = catalog.years.find((year) => year.id === form.yearId);
    return catalog.classes.filter(
      (item) => item.school_year_id === form.yearId ||
        (item.school_year_id === null && item.school_year === formYear?.name),
    );
  }, [catalog.classes, catalog.years, form.yearId]);

  const matchingStudents = useMemo(() => {
    const term = studentSearch.trim().toLocaleLowerCase("fr");
    const matched = catalog.students.filter(
      (student) => Boolean(student.full_name?.trim()) &&
        (!term || (student.full_name ?? "").toLocaleLowerCase("fr").includes(term)),
    );
    const selectedStudent = catalog.students.find((item) => item.id === form.studentId);
    const limited = matched.slice(0, 80);
    if (selectedStudent && !limited.some((item) => item.id === selectedStudent.id)) {
      limited.unshift(selectedStudent);
    }
    return limited;
  }, [catalog.students, form.studentId, studentSearch]);

  const metrics = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    completed: rows.filter((row) => row.status === "completed").length,
    withdrawn: rows.filter((row) => row.status === "withdrawn").length,
  }), [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function changeYearFilter(value: string) {
    setYearFilter(value);
    setClassFilter("all");
  }

  function updateForm<K extends keyof EnrollmentFormState>(
    key: K,
    value: EnrollmentFormState[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFormError(null);
  }

  function openCreate() {
    if (isDemo) return;
    setEditingRow(null);
    setForm(emptyForm(currentYear?.id ?? (yearFilter === "all" ? "" : yearFilter)));
    setStudentSearch("");
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: AdminEnrollment) {
    if (isDemo) return;
    setDetail(null);
    setEditingRow(row);
    setForm({
      studentId: row.student_id,
      yearId: row.school_year_id,
      classId: row.class_id,
      gender: catalog.students.find((student) => student.id === row.student_id)?.gender ?? "",
      enrolledOn: row.enrolled_on,
      admissionType: row.admission_type,
      previousSchool: row.previous_school ?? "",
      notes: row.notes ?? "",
    });
    setStudentSearch("");
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || isDemo) return;
    if (!form.studentId || !form.classId || !form.enrolledOn) {
      setFormError("Choisissez un apprenant, une classe et une date d'inscription.");
      return;
    }
    if (form.gender !== "male" && form.gender !== "female") {
      setFormError("Veuillez choisir le genre de l'apprenant.");
      return;
    }
    if (form.admissionType === "transfer" && !form.previousSchool.trim()) {
      setFormError("Précisez l'ancien établissement pour un transfert.");
      return;
    }
    const selectedClass = formClasses.find((item) => item.id === form.classId);
    if (!selectedClass) {
      setFormError("La classe ne correspond pas à l'année scolaire sélectionnée.");
      return;
    }
    try {
      setSaving(true);
      setFormError(null);
      const result = await saveAdminEnrollment({
        studentId: form.studentId,
        classId: form.classId,
        gender: form.gender,
        enrolledOn: form.enrolledOn,
        admissionType: form.admissionType,
        previousSchool: form.previousSchool,
        notes: form.notes,
      });
      setCatalog((previous) => ({
        ...previous,
        students: previous.students.map((student) =>
          student.id === form.studentId
            ? { ...student, gender: form.gender as StudentGender }
            : student,
        ),
      }));
      setFormOpen(false);
      setEditingRow(null);
      setSuccess(
        `Dossier ${result.enrollment_number ?? ""} enregistré : ${result.student_name} · ${result.class_name}.`,
      );
      setRefreshVersion((version) => version + 1);
    } catch (cause) {
      setFormError(enrollmentErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  function openDetail(row: AdminEnrollment) {
    setDetailError(null);
    setStatusNote("");
    setNewStatus(row.status);
    setDetail(row);
  }

  async function submitStatus() {
    if (!detail || isDemo || statusSaving) return;
    if (newStatus === detail.status && !statusNote.trim()) {
      setDetailError("Aucune modification à enregistrer.");
      return;
    }
    if (
      newStatus === "active" &&
      !catalog.years.find((year) => year.id === detail.school_year_id)?.is_current
    ) {
      setDetailError("Seule une inscription de l'année scolaire courante peut devenir active.");
      return;
    }
    if (newStatus === "completed" && currentYear?.id === detail.school_year_id) {
      setDetailError("Une inscription courante ne peut pas être clôturée ici : sélectionnez un statut adapté.");
      return;
    }
    if (
      ["withdrawn", "cancelled"].includes(newStatus) &&
      !window.confirm(`Confirmer le passage du dossier au statut « ${STATUS_LABELS[newStatus]} » ?`)
    ) return;
    try {
      setStatusSaving(true);
      setDetailError(null);
      await setAdminEnrollmentStatus(detail.enrollment_id, newStatus, statusNote);
      setSuccess(`Statut du dossier ${detail.enrollment_number ?? ""} mis à jour.`);
      setDetail(null);
      setRefreshVersion((version) => version + 1);
    } catch (cause) {
      setDetailError(enrollmentErrorMessage(cause));
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-white via-blue-50/60 to-indigo-50 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-2xl text-white shadow-sm">
              📝
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                Vie administrative · Lot 5
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">
                Inscriptions & dossiers élèves
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Inscrivez, réinscrivez et affectez les apprenants. Retrouvez chaque
                dossier et l'historique de ses changements.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="sn-btn-ghost sn-press"
              disabled={loading || !catalogReady || isDemo}
              onClick={() => setRefreshVersion((version) => version + 1)}
            >
              ↻ Actualiser
            </button>
            <button
              type="button"
              className="sn-btn-primary sn-press"
              disabled={!catalogReady || isDemo || catalog.classes.length === 0}
              onClick={openCreate}
            >
              + Nouvelle inscription
            </button>
          </div>
        </div>
      </header>

      {isDemo && (
        <section className="sn-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Le mode démo n'autorise pas la consultation ni la modification des dossiers réels.
        </section>
      )}

      {success && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <span>✓ {success}</span>
          <button type="button" className="font-semibold underline" onClick={() => setSuccess(null)}>Fermer</button>
        </div>
      )}

      {catalogError && (
        <div role="alert" className="sn-card border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          Impossible de charger le catalogue : {catalogError}. Rechargez la page pour réessayer.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SmallStat icon="📁" label="Dossiers affichés" value={metrics.total} />
        <SmallStat icon="✅" label="Inscriptions actives" value={metrics.active} />
        <SmallStat icon="🎓" label="Années terminées" value={metrics.completed} />
        <SmallStat icon="↩️" label="Retraits" value={metrics.withdrawn} />
      </section>

      <section className="sn-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-slate-900">Rechercher et filtrer</h2>
          <span className="text-xs text-slate-500">Les indicateurs suivent les filtres actifs.</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Recherche</span>
            <input
              className="sn-input w-full"
              type="search"
              placeholder="Nom, numéro ou classe..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Année scolaire</span>
            <select className="sn-input w-full" value={yearFilter} onChange={(event) => changeYearFilter(event.target.value)}>
              <option value="all">Toutes les années</option>
              {catalog.years.map((year) => (
                <option key={year.id} value={year.id}>{year.name}{year.is_current ? " · En cours" : ""}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Classe</span>
            <select className="sn-input w-full" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="all">Toutes les classes</option>
              {yearClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Statut</span>
            <select
              className="sn-input w-full"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as EnrollmentStatus | "all")}
            >
              <option value="all">Tous les statuts</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="sn-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-bold text-slate-950">Dossiers d'inscription</h2>
            <p className="mt-1 text-xs text-slate-500">
              {loading ? "Chargement des dossiers…" : `${rows.length} dossier(s) correspondant aux filtres`}
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error} <button type="button" className="ml-2 font-semibold underline" onClick={() => setRefreshVersion((v) => v + 1)}>Réessayer</button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3 p-5" aria-live="polite">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : rows.length === 0 && !error ? (
          <div className="px-5 py-14 text-center">
            <div className="mb-3 text-4xl">📂</div>
            <h3 className="font-bold text-slate-800">Aucun dossier trouvé</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Ajustez les filtres ou créez une première inscription. Les comptes apprenants
              sont créés dans l'écran Utilisateurs.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4 lg:hidden">
              {visibleRows.map((row) => (
                <article key={row.enrollment_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{row.student_name ?? "Apprenant"}</div>
                      <div className="mt-1 text-xs text-slate-500">{row.enrollment_number || "Numéro à attribuer"}</div>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div><span className="font-semibold text-slate-800">Classe</span><br />{row.class_name}</div>
                    <div><span className="font-semibold text-slate-800">Année</span><br />{row.school_year_name}</div>
                    <div><span className="font-semibold text-slate-800">Admission</span><br />{ADMISSION_LABELS[row.admission_type] ?? row.admission_type}</div>
                    <div><span className="font-semibold text-slate-800">Inscrit le</span><br />{formatDate(row.enrolled_on)}</div>
                  </div>
                  <button type="button" className="sn-btn-ghost mt-4 w-full" onClick={() => openDetail(row)}>Voir le dossier</button>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Dossier / apprenant</th>
                    <th className="px-5 py-4">Classe</th>
                    <th className="px-5 py-4">Année</th>
                    <th className="px-5 py-4">Date d'inscription</th>
                    <th className="px-5 py-4">Statut</th>
                    <th className="px-5 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.map((row) => (
                    <tr key={row.enrollment_id} className="hover:bg-blue-50/50">
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900">{row.student_name ?? "Apprenant"}</div>
                        <div className="mt-1 font-mono text-xs text-slate-500">{row.enrollment_number || "—"}</div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{row.class_name}</td>
                      <td className="px-5 py-4 text-slate-700">{row.school_year_name}</td>
                      <td className="px-5 py-4 text-slate-600">{formatDate(row.enrolled_on)}</td>
                      <td className="px-5 py-4"><StatusBadge status={row.status} /></td>
                      <td className="px-5 py-4 text-right">
                        <button type="button" className="sn-btn-ghost sn-press whitespace-nowrap" onClick={() => openDetail(row)}>Voir le dossier</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
              <span>Page {page} sur {pageCount}</span>
              <div className="flex gap-2">
                <button type="button" className="sn-btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
                <button type="button" className="sn-btn-ghost" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Suivant</button>
              </div>
            </div>
          </>
        )}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-3 py-6 sm:px-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-label={editingRow ? "Modifier l'inscription" : "Nouvelle inscription"} className="mx-auto w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{editingRow ? "Modifier le dossier" : "Nouvelle inscription"}</h2>
                <p className="mt-1 text-sm text-slate-500">Les données sont enregistrées dans le dossier annuel existant, sans doublon.</p>
              </div>
              <button type="button" aria-label="Fermer" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" disabled={saving} onClick={() => setFormOpen(false)}>✕</button>
            </div>
            <form onSubmit={(event) => void submitForm(event)} className="space-y-4 p-5 sm:p-6">
              {formError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Rechercher un apprenant</span>
                <input type="search" className="sn-input w-full" value={studentSearch} disabled={Boolean(editingRow)} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Saisir une partie du nom…" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Apprenant *</span>
                <select
                  className="sn-input w-full"
                  value={form.studentId}
                  disabled={Boolean(editingRow)}
                  required
                  onChange={(event) => {
                    const studentId = event.target.value;
                    const student = catalog.students.find((item) => item.id === studentId);
                    setForm((previous) => ({
                      ...previous,
                      studentId,
                      gender: student?.gender ?? "",
                    }));
                    setFormError(null);
                  }}
                >
                  <option value="">Sélectionner un apprenant</option>
                  {matchingStudents.map((item) => (
                    <option key={item.id} value={item.id}>{item.full_name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">Apprenant absent ? Créez d'abord son compte dans Utilisateurs.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Genre de l'apprenant *</span>
                <select
                  className="sn-input w-full"
                  value={form.gender}
                  required
                  onChange={(event) => updateForm("gender", event.target.value as StudentGender | "")}
                >
                  <option value="">Sélectionner le genre</option>
                  <option value="male">Masculin</option>
                  <option value="female">Féminin</option>
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  Cette information est conservée dans le profil de l'apprenant.
                </span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Année scolaire *</span>
                  <select className="sn-input w-full" required value={form.yearId} disabled={Boolean(editingRow)} onChange={(event) => {
                    setForm((previous) => ({ ...previous, yearId: event.target.value, classId: "" }));
                    setFormError(null);
                  }}>
                    <option value="">Sélectionner l'année</option>
                    {catalog.years.map((item) => <option value={item.id} key={item.id}>{item.name}{item.is_current ? " (courante)" : ""}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Classe *</span>
                  <select className="sn-input w-full" required value={form.classId} onChange={(event) => updateForm("classId", event.target.value)}>
                    <option value="">Sélectionner une classe</option>
                    {formClasses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Date d'inscription *</span>
                  <input className="sn-input w-full" type="date" required value={form.enrolledOn} disabled={Boolean(editingRow)} onChange={(event) => updateForm("enrolledOn", event.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-slate-700">Type d'admission *</span>
                  <select className="sn-input w-full" required value={form.admissionType} onChange={(event) => updateForm("admissionType", event.target.value as AdmissionType)}>
                    {Object.entries(ADMISSION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Établissement précédent{form.admissionType === "transfer" ? " *" : ""}</span>
                <input className="sn-input w-full" value={form.previousSchool} onChange={(event) => updateForm("previousSchool", event.target.value)} maxLength={250} placeholder="Facultatif sauf en cas de transfert" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">Observations administratives</span>
                <textarea className="sn-input w-full" rows={3} maxLength={2000} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="Informations utiles au dossier…" />
              </label>
              {!editingRow && (
                <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
                  Un seul dossier existe par apprenant et par année scolaire. Si un dossier existe déjà,
                  cette action le mettra à jour et pourra réactiver son inscription.
                </p>
              )}
              {editingRow && form.classId !== editingRow.class_id && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Le changement de classe sera enregistré dans l'historique de l'inscription.
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" className="sn-btn-ghost" disabled={saving} onClick={() => setFormOpen(false)}>Annuler</button>
                <button type="submit" className="sn-btn-primary" disabled={saving || formClasses.length === 0}>
                  {saving ? "Enregistrement…" : "Enregistrer le dossier"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 px-3 py-6 sm:px-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Dossier d'inscription" className="mx-auto w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2"><StatusBadge status={detail.status} /><span className="font-mono text-xs text-slate-500">{detail.enrollment_number}</span></div>
                <h2 className="text-xl font-extrabold text-slate-950">{detail.student_name ?? "Apprenant"}</h2>
                <p className="mt-1 text-sm text-slate-600">{detail.class_name} · {detail.school_year_name}</p>
              </div>
              <button type="button" aria-label="Fermer" className="rounded-full p-2 text-slate-500 hover:bg-slate-100" disabled={statusSaving} onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="space-y-6 p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
                <div><div className="text-xs text-slate-500">Genre</div><div className="mt-1 font-semibold text-slate-800">{getGenderLabel(catalog.students.find((student) => student.id === detail.student_id)?.gender)}</div></div>
                <div><div className="text-xs text-slate-500">Date d'inscription</div><div className="mt-1 font-semibold text-slate-800">{formatDate(detail.enrolled_on)}</div></div>
                <div><div className="text-xs text-slate-500">Type d'admission</div><div className="mt-1 font-semibold text-slate-800">{ADMISSION_LABELS[detail.admission_type] ?? detail.admission_type}</div></div>
                <div><div className="text-xs text-slate-500">Établissement précédent</div><div className="mt-1 font-semibold text-slate-800">{detail.previous_school || "—"}</div></div>
                <div className="col-span-2 sm:col-span-3"><div className="text-xs text-slate-500">Observations</div><div className="mt-1 whitespace-pre-wrap font-medium text-slate-700">{detail.notes || "Aucune observation"}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(detail.status === "active" ||
                  (detail.status === "completed" && detail.school_year_id !== currentYear?.id)) ? (
                  <button type="button" className="sn-btn-ghost" onClick={() => openEdit(detail)}>
                    ✎ Modifier / changer de classe
                  </button>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                    Dossier inactif : réactivez-le dans l'année courante avant toute modification.
                    Les dossiers historiques restent consultables.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-3 font-bold text-slate-900">Modifier le statut</h3>
                {detailError && <div role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{detailError}</div>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Nouveau statut</span>
                    <select className="sn-input w-full" value={newStatus} disabled={statusSaving} onChange={(event) => setNewStatus(event.target.value as EnrollmentStatus)}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Observations (facultatif)</span>
                    <input className="sn-input w-full" maxLength={2000} value={statusNote} disabled={statusSaving} onChange={(event) => setStatusNote(event.target.value)} placeholder="Remplace les observations si renseigné" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-slate-500">Le retrait ou l'annulation retire l'affectation active, mais conserve le dossier et son historique.</p>
                <div className="mt-3 flex justify-end">
                  <button type="button" className="sn-btn-primary" disabled={statusSaving} onClick={() => void submitStatus()}>{statusSaving ? "Mise à jour…" : "Valider le statut"}</button>
                </div>
              </div>
              <AdminEnrollmentDocuments enrollmentId={detail.enrollment_id} disabled={isDemo} />
              <div>
                <h3 className="font-bold text-slate-950">Historique du dossier</h3>
                <p className="mb-3 text-xs text-slate-500">Événements enregistrés par le backend.</p>
                {historyLoading ? (
                  <p className="text-sm text-slate-500">Chargement de l'historique…</p>
                ) : historyError ? (
                  <p role="alert" className="text-sm text-red-600">{historyError}</p>
                ) : history.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Aucun événement disponible pour ce dossier.</p>
                ) : (
                  <ol className="space-y-3">
                    {history.map((item) => (
                      <li key={item.event_id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">{item.event_type.replace(/_/g, " ")}</span>
                          <span className="text-xs text-slate-500">{formatDate(item.created_at)}</span>
                        </div>
                        {(item.from_status || item.to_status) && (
                          <p className="mt-1 text-slate-600">Statut : {item.from_status ?? "—"} → {item.to_status ?? "—"}</p>
                        )}
                        {(item.from_class_name || item.to_class_name) && (
                          <p className="mt-1 text-slate-600">Classe : {item.from_class_name ?? "—"} → {item.to_class_name ?? "—"}</p>
                        )}
                        {item.note && <p className="mt-1 whitespace-pre-wrap text-slate-600">{item.note}</p>}
                        <p className="mt-1 text-xs text-slate-400">{item.actor_name || "Système / acteur non renseigné"}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button type="button" className="sn-btn-ghost" onClick={() => setDetail(null)}>Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
