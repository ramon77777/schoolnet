import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentType = "quiz" | "assignment" | "exam";
type AssessmentStatus = "draft" | "published" | "closed";
type SubmissionStatus = "in_progress" | "submitted" | "graded" | "published";

type CourseRow = {
  id: string;
  title: string;
};

type SectionRow = {
  id: string;
  title: string;
};

type AssessmentRow = {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  course_id: string;
  section_id: string | null;
  courses: CourseRow | CourseRow[] | null;
  course_sections: SectionRow | SectionRow[] | null;
};

type FilterValue = "Tous" | "Quiz" | "Devoir" | "Examen";

type AssessmentView = {
  id: string;
  title: string;
  type: "Quiz" | "Devoir" | "Examen";
  status: "Brouillon" | "Publié" | "Clôturé";
  courseTitle: string;
  sectionTitle: string;
  when: string;
  isNew: boolean;
};

function normalizeCourse(value: AssessmentRow["courses"]): CourseRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]): SectionRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapType(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function mapStatus(status: AssessmentStatus): "Brouillon" | "Publié" | "Clôturé" {
  if (status === "published") return "Publié";
  if (status === "closed") return "Clôturé";
  return "Brouillon";
}

function formatDueAt(value: string | null): string {
  if (!value) return "Sans échéance";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function isRecentlyCreated(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const diffDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

function safeErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const maybe = err as {
      message?: string;
      error_description?: string;
      details?: string;
    };
    return maybe.message || maybe.error_description || maybe.details || fallback;
  }
  return fallback;
}

export default function TeacherAssessments() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [filter, setFilter] = useState<FilterValue>("Tous");
  const [rows, setRows] = useState<AssessmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAssessments = useCallback(async () => {
    if (!user || user.isDemo) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("assessments")
        .select(
          `
          id,
          title,
          type,
          status,
          due_at,
          created_at,
          updated_at,
          course_id,
          section_id,
          courses (
            id,
            title
          ),
          course_sections (
            id,
            title
          )
        `
        )
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      const mapped: AssessmentView[] = ((data ?? []) as AssessmentRow[]).map((row) => {
        const course = normalizeCourse(row.courses);
        const section = normalizeSection(row.course_sections);

        return {
          id: row.id,
          title: row.title,
          type: mapType(row.type),
          status: mapStatus(row.status),
          courseTitle: course?.title ?? "Cours",
          sectionTitle: section?.title ?? "Sans section",
          when: formatDueAt(row.due_at),
          isNew: row.status === "published" && isRecentlyCreated(row.created_at),
        };
      });

      setRows(mapped);
    } catch (err) {
      console.error("[TeacherAssessments] loadAssessments error:", err);
      setError("Impossible de charger les évaluations.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadAssessments();
  }, [authLoading, loadAssessments]);

  const filtered = useMemo(() => {
    return rows.filter((row) => (filter === "Tous" ? true : row.type === filter));
  }, [rows, filter]);

  function typeBadge(type: AssessmentView["type"]) {
    if (type === "Examen") return "sn-badge sn-badge-red";
    if (type === "Devoir") return "sn-badge sn-badge-blue";
    return "sn-badge sn-badge-gray";
  }

  function statusBadge(status: AssessmentView["status"]) {
    if (status === "Publié") return "sn-badge sn-badge-green";
    if (status === "Clôturé") return "sn-badge sn-badge-red";
    return "sn-badge sn-badge-gray";
  }

  async function syncSubmissionStatusesForAssessment(
    assessmentId: string,
    mode: "publish" | "unpublish"
  ) {
    if (mode === "publish") {
      const { error } = await supabase
        .from("submissions")
        .update({ status: "published" satisfies SubmissionStatus })
        .eq("assessment_id", assessmentId)
        .eq("status", "graded" satisfies SubmissionStatus);

      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from("submissions")
      .update({ status: "graded" satisfies SubmissionStatus })
      .eq("assessment_id", assessmentId)
      .eq("status", "published" satisfies SubmissionStatus);

    if (error) throw error;
  }

  async function togglePublish(row: AssessmentView) {
    try {
      setPublishingId(row.id);

      const isCurrentlyPublished = row.status === "Publié";
      const nextStatus: AssessmentStatus = isCurrentlyPublished ? "draft" : "published";

      const { error: updateAssessmentError } = await supabase
        .from("assessments")
        .update({ status: nextStatus })
        .eq("id", row.id);

      if (updateAssessmentError) throw updateAssessmentError;

      await syncSubmissionStatusesForAssessment(
        row.id,
        isCurrentlyPublished ? "unpublish" : "publish"
      );

      await loadAssessments();

      if (isCurrentlyPublished) {
        alert("✅ Évaluation dépubliée. Les copies publiées repassent en corrigé non publié.");
      } else {
        alert("✅ Évaluation publiée.");
      }
    } catch (err) {
      console.error("[TeacherAssessments] togglePublish error:", err);
      alert(safeErrorMessage(err, "Impossible de modifier le statut de publication."));
    } finally {
      setPublishingId(null);
    }
  }

  function goToCorrections(assessmentId: string) {
    navigate(`/app/teacher/grading?assessmentId=${encodeURIComponent(assessmentId)}`);
  }

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Évaluations</div>
          <div className="text-sm text-gray-500">
            Gérez vos évaluations réelles et leur publication.
          </div>
        </div>

        <button
          className="sn-btn-primary sn-press"
          onClick={() => navigate("/app/teacher/assessments/new")}
        >
          + Créer
        </button>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les évaluations réelles ne sont pas chargées.
        </div>
      )}

      <div className="sn-card p-3 flex flex-wrap items-center gap-2">
        <Pill label="Tous" active={filter === "Tous"} onClick={() => setFilter("Tous")} />
        <Pill label="Quiz" active={filter === "Quiz"} onClick={() => setFilter("Quiz")} />
        <Pill label="Devoir" active={filter === "Devoir"} onClick={() => setFilter("Devoir")} />
        <Pill
          label="Examen"
          active={filter === "Examen"}
          onClick={() => setFilter("Examen")}
          tone="danger"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="sn-card p-5 space-y-3 animate-pulse">
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-4 w-1/4 rounded bg-gray-100" />
              <div className="h-10 w-40 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="sn-card p-6 text-sm text-gray-600">
          Aucune évaluation pour ce filtre.
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((row) => (
            <div key={row.id} className="sn-card sn-card-hover p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-gray-900">{row.title}</div>
                    <span className={typeBadge(row.type)}>{row.type}</span>
                    {row.isNew && row.status === "Publié" && (
                      <span className="sn-badge sn-badge-blue">Nouveau</span>
                    )}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    {row.courseTitle} • {row.sectionTitle}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">{row.when}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={statusBadge(row.status)}>{row.status}</span>
                  <button
                    className="sn-btn-ghost sn-press"
                    onClick={() => navigate(`/app/teacher/assessments/${row.id}`)}
                  >
                    Ouvrir
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="sn-btn-ghost sn-press"
                  onClick={() => navigate(`/app/teacher/assessments/${row.id}/edit`)}
                >
                  Modifier
                </button>

                <button
                  className="sn-btn-ghost sn-press"
                  onClick={() => void togglePublish(row)}
                  disabled={publishingId === row.id}
                >
                  {publishingId === row.id
                    ? "Mise à jour..."
                    : row.status === "Publié"
                    ? "Dépublier"
                    : "Publier"}
                </button>

                <button
                  className="sn-btn-primary sn-press"
                  onClick={() => goToCorrections(row.id)}
                >
                  Corrections
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500">
        *La publication d’une évaluation publie aussi les copies déjà corrigées, et la dépublication les remet en corrigé non publié.*
      </div>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base = "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";
  const activeCls = tone === "danger" ? "bg-red-600 text-white" : "bg-blue-600 text-white";
  const inactiveCls =
    tone === "danger"
      ? "bg-red-50 text-red-700 hover:bg-red-100"
      : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactiveCls}`}
    >
      {label}
    </button>
  );
}