import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

// Lot 5 : consultation des dossiers annuels déjà gérés par l'administration.
// Aucune écriture client, aucun accès aux observations internes "notes".
// L'isolation Parent/Enfant repose sur parent_links et sur les politiques RLS.
type EnrollmentStatus = "draft" | "active" | "withdrawn" | "completed" | "cancelled";
type EnrollmentRow = {
  id: string;
  enrollment_number: string;
  student_id: string;
  school_year_id: string;
  class_id: string;
  status: EnrollmentStatus;
  enrolled_on: string;
  admission_type: string;
  previous_school: string | null;
};
type EnrollmentView = EnrollmentRow & {
  student_name: string;
  class_name: string;
  year_name: string;
  year_start: string;
};
type IdName = { id: string; name: string };
type StudentProfile = { id: string; full_name: string | null };
type SchoolYear = { id: string; name: string; starts_on: string };

const statusLabels: Record<EnrollmentStatus, string> = {
  draft: "En préparation",
  active: "Inscription active",
  withdrawn: "Retirée",
  completed: "Année terminée",
  cancelled: "Annulée",
};

const admissionLabels: Record<string, string> = {
  new: "Nouvelle inscription",
  continuing: "Réinscription",
  transfer: "Transfert",
  reentry: "Retour en scolarité",
};

function formattedDate(value: string) {
  if (!value) return "—";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

export default function EnrollmentRecordsPage() {
  const { user, loading: authLoading } = useAuth();
  const isParent = user?.role === "parent";
  const isStudent = user?.role === "student";
  const [records, setRecords] = useState<EnrollmentView[]>([]);
  const [childCount, setChildCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setRecords([]);
    setChildCount(0);
    setError(null);

    if (!user || user.isDemo || (!isParent && !isStudent)) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        let studentIds: string[] = [user.id];

        if (isParent) {
          // La table parent_links est la relation utilisée par les règles RLS ;
          // ne pas se fier uniquement à profiles.child_ids.
          const { data, error: linksError } = await supabase
            .from("parent_links")
            .select("student_id")
            .eq("parent_id", user.id);
          if (linksError) throw linksError;
          studentIds = Array.from(new Set(
            (data ?? []).map((row) => row.student_id as string).filter(Boolean),
          ));
        }

        if (cancelled) return;
        setChildCount(isParent ? studentIds.length : 0);
        if (studentIds.length === 0) {
          setRecords([]);
          return;
        }

        const { data, error: enrollmentsError } = await supabase
          .from("student_enrollments")
          .select("id, enrollment_number, student_id, school_year_id, class_id, status, enrolled_on, admission_type, previous_school")
          .in("student_id", studentIds)
          .order("enrolled_on", { ascending: false });

        if (enrollmentsError) throw enrollmentsError;
        const enrollments = (data ?? []) as EnrollmentRow[];
        if (enrollments.length === 0) {
          setRecords([]);
          return;
        }

        const classIds = Array.from(new Set(enrollments.map((item) => item.class_id)));
        const yearIds = Array.from(new Set(enrollments.map((item) => item.school_year_id)));
        const [studentsResult, classesResult, yearsResult] = await Promise.all([
          supabase.from("profiles").select("id, full_name").in("id", studentIds).eq("role", "student"),
          supabase.from("classes").select("id, name").in("id", classIds),
          supabase.from("school_years").select("id, name, starts_on").in("id", yearIds),
        ]);
        if (studentsResult.error) throw studentsResult.error;
        if (classesResult.error) throw classesResult.error;
        if (yearsResult.error) throw yearsResult.error;

        const names = new Map(
          ((studentsResult.data ?? []) as StudentProfile[]).map((item) => [item.id, item.full_name || "Apprenant"]),
        );
        const classes = new Map(
          ((classesResult.data ?? []) as IdName[]).map((item) => [item.id, item.name]),
        );
        const years = new Map(
          ((yearsResult.data ?? []) as SchoolYear[]).map((item) => [item.id, item]),
        );

        const views: EnrollmentView[] = enrollments.map((record) => ({
          ...record,
          student_name: names.get(record.student_id) || "Apprenant",
          class_name: classes.get(record.class_id) || "Classe non disponible",
          year_name: years.get(record.school_year_id)?.name || "Année scolaire inconnue",
          year_start: years.get(record.school_year_id)?.starts_on || "",
        }));

        views.sort((a, b) =>
          b.year_start.localeCompare(a.year_start)
          || b.enrolled_on.localeCompare(a.enrolled_on)
          || a.student_name.localeCompare(b.student_name, "fr"),
        );
        if (!cancelled) setRecords(views);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Impossible de charger les dossiers.");
          setRecords([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [authLoading, user?.id, user?.role, user?.isDemo, isParent, isStudent, refreshKey]);

  const yearOptions = useMemo(() => Array.from(new Map(
    records.map((record) => [record.school_year_id, record.year_name]),
  ).entries()), [records]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return records.filter((record) => {
      if (yearFilter !== "all" && record.school_year_id !== yearFilter) return false;
      if (!query) return true;
      return [
        record.student_name, record.enrollment_number, record.class_name, record.year_name,
      ].some((value) => value.toLocaleLowerCase("fr").includes(query));
    });
  }, [records, search, yearFilter]);

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-5 pb-10">
      <header className="rounded-3xl bg-gradient-to-r from-blue-700 to-violet-700 p-6 text-white shadow-md">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-100">SCHOOLNET · Inscriptions</p>
        <h1 className="mt-2 text-2xl font-extrabold">
          {isParent ? "Dossiers scolaires de mes enfants" : "Mon dossier scolaire"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">
          Consultez les inscriptions par année scolaire, les classes et les statuts.
          Les décisions et modifications administratives sont réservées à l'établissement.
        </p>
      </header>

      {user?.isDemo ? (
        <div className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Les dossiers réels ne sont pas accessibles en mode démonstration.
        </div>
      ) : !isParent && !isStudent ? (
        <div className="sn-card p-5 text-sm text-slate-600">Cette rubrique est réservée aux Apprenants et Parents/Tuteurs.</div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            {[
              ["Dossiers annuels", records.length],
              ["Inscriptions actives", records.filter((record) => record.status === "active").length],
              [isParent ? "Enfants rattachés" : "Années scolaires", isParent ? childCount : yearOptions.length],
            ].map(([label, count]) => (
              <div key={label} className="sn-card p-4">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-extrabold text-slate-950">{count}</p>
              </div>
            ))}
          </section>

          {error && <p role="alert" className="sn-card border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

          <div className="sn-card grid gap-3 p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Rechercher un dossier</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} className={inputClass} placeholder="Nom, numéro, classe…" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Année scolaire</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className={inputClass}>
                <option value="all">Toutes les années</option>
                {yearOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <button type="button" className="sn-btn-ghost" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>
              {loading ? "Chargement…" : "Actualiser"}
            </button>
          </div>

          {loading ? (
            <div className="sn-card p-10 text-center text-sm text-slate-500">Chargement des dossiers…</div>
          ) : visible.length === 0 ? (
            <div className="sn-card p-8 text-center">
              <p className="font-semibold text-slate-800">
                {records.length > 0 ? "Aucun dossier ne correspond aux filtres." : "Aucun dossier annuel disponible."}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {isParent && childCount === 0
                  ? "Aucun enfant n'est actuellement rattaché à votre compte. Contactez l'administration."
                  : "Les dossiers sont créés par l'administration. Si une inscription manque, contactez votre établissement."}
              </p>
            </div>
          ) : (
            <section className="grid gap-4 lg:grid-cols-2" aria-label="Dossiers scolaires">
              {visible.map((record) => (
                <article key={record.id} className="sn-card overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{record.year_name}</p>
                      <h2 className="mt-1 text-lg font-extrabold text-slate-950">{record.student_name}</h2>
                      <p className="mt-1 font-mono text-xs text-slate-500">{record.enrollment_number}</p>
                    </div>
                    <span className={record.status === "active"
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                      : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"
                    }>
                      {statusLabels[record.status] ?? record.status}
                    </span>
                  </div>
                  <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs font-semibold text-slate-500">Classe</dt><dd className="mt-1 font-semibold text-slate-900">{record.class_name}</dd></div>
                    <div><dt className="text-xs font-semibold text-slate-500">Date d'inscription</dt><dd className="mt-1 text-slate-800">{formattedDate(record.enrolled_on)}</dd></div>
                    <div><dt className="text-xs font-semibold text-slate-500">Type d'admission</dt><dd className="mt-1 text-slate-800">{admissionLabels[record.admission_type] ?? record.admission_type}</dd></div>
                    {record.previous_school && <div><dt className="text-xs font-semibold text-slate-500">Établissement précédent</dt><dd className="mt-1 text-slate-800">{record.previous_school}</dd></div>}
                  </dl>
                </article>
              ))}
            </section>
          )}

          <p className="text-xs text-slate-500">
            Lecture seule : seules les inscriptions vous concernant sont accessibles.
            Les observations internes, les pièces justificatives et les coordonnées privées ne sont pas affichées.
            {isParent && <><span> </span><Link className="font-semibold text-blue-700 underline" to="/app/parent/children">Voir mes enfants</Link>.</>}
          </p>
        </>
      )}
    </div>
  );
}
