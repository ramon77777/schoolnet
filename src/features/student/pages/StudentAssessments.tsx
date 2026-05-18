import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentType = "quiz" | "assignment" | "exam";
type AssessmentStatus = "draft" | "published" | "closed";
type SubmissionStatus = "in_progress" | "submitted" | "graded" | "published";

type AssessmentRow = {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  created_at: string;
  due_at: string | null;
  course_id: string;
  section_id: string | null;
  courses:
    | {
        id: string;
        title: string;
      }
    | {
        id: string;
        title: string;
      }[]
    | null;
  course_sections:
    | {
        id: string;
        title: string;
      }
    | {
        id: string;
        title: string;
      }[]
    | null;
};

type SubmissionRow = {
  assessment_id: string;
  status: SubmissionStatus;
  score: number | null;
};

type AssessmentView = {
  id: string;
  title: string;
  type: "Quiz" | "Devoir" | "Examen";
  courseTitle: string;
  sectionTitle: string;
  when: string;
  isNew: boolean;
  studentStatus: "À faire" | "En cours" | "Terminé";
  submissionStatus?: SubmissionStatus;
  scoreLabel?: string;
};

function normalizeCourse(value: AssessmentRow["courses"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapType(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function formatDueAt(value: string | null) {
  if (!value) return "Sans échéance";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function isRecentlyCreated(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const diffDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
}

export default function StudentAssessments() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [filter, setFilter] = useState<"Tous" | "Quiz" | "Devoir" | "Examen">("Tous");
  const [rows, setRows] = useState<AssessmentView[]>([]);
  const [loading, setLoading] = useState(true);
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

      // 1) cours de l'élève
      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("student_id", user.id);

      if (enrollmentsError) throw enrollmentsError;

      const courseIds = (enrollmentsData ?? []).map((row) => row.course_id) as string[];

      if (courseIds.length === 0) {
        setRows([]);
        return;
      }

      // 2) évaluations publiées des cours où l'élève est inscrit
      const { data: assessmentsData, error: assessmentsError } = await supabase
        .from("assessments")
        .select(
          `
          id,
          title,
          type,
          status,
          created_at,
          due_at,
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
        .in("course_id", courseIds)
        .eq("status", "published")
        .order("created_at", { ascending: false });

      if (assessmentsError) throw assessmentsError;

      const assessmentRows = (assessmentsData ?? []) as AssessmentRow[];

      const assessmentIds = assessmentRows.map((row) => row.id);

      // 3) soumissions éventuelles de l'élève
      let submissionsByAssessmentId: Record<string, SubmissionRow> = {};
      if (assessmentIds.length > 0) {
        const { data: submissionsData, error: submissionsError } = await supabase
          .from("assessment_submissions")
          .select("assessment_id, status, score")
          .eq("student_id", user.id)
          .in("assessment_id", assessmentIds);

        if (submissionsError) throw submissionsError;

        submissionsByAssessmentId = ((submissionsData ?? []) as SubmissionRow[]).reduce<
          Record<string, SubmissionRow>
        >((acc, row) => {
          acc[row.assessment_id] = row;
          return acc;
        }, {});
      }

      const mapped: AssessmentView[] = assessmentRows.map((row) => {
        const course = normalizeCourse(row.courses);
        const section = normalizeSection(row.course_sections);
        const submission = submissionsByAssessmentId[row.id];

        return {
          id: row.id,
          title: row.title,
          type: mapType(row.type),
          courseTitle: course?.title ?? "Cours",
          sectionTitle: section?.title ?? "Sans section",
          when: formatDueAt(row.due_at),
          isNew: isRecentlyCreated(row.created_at),
          submissionStatus: submission?.status,
          studentStatus:
            submission?.status === "in_progress"
              ? "En cours"
              : submission &&
                ["submitted", "graded", "published"].includes(submission.status)
              ? "Terminé"
              : "À faire",
          scoreLabel:
            submission?.score !== null && submission?.score !== undefined
              ? String(submission.score)
              : undefined,
        };
      });

      setRows(mapped);
    } catch (err) {
      console.error("[StudentAssessments] loadAssessments error:", err);
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

  const isLoading = authLoading || loading;

  const typeBadgeClass = (type: AssessmentView["type"]) => {
    if (type === "Examen") return "sn-badge sn-badge-red";
    if (type === "Devoir") return "sn-badge sn-badge-blue";
    return "sn-badge sn-badge-gray";
  };

  const statusBadgeClass = (s: AssessmentView["studentStatus"]) => {
    return s === "Terminé" ? "sn-badge sn-badge-green" : "sn-badge sn-badge-gray";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Mes évaluations</div>
          <div className="text-sm text-gray-500">
            Seules les évaluations publiées sont visibles.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
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
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les évaluations réelles ne sont pas chargées.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="sn-card p-5 space-y-4 animate-pulse">
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-4 w-1/3 rounded bg-gray-100" />
              <div className="h-4 w-1/4 rounded bg-gray-100" />
              <div className="h-10 w-28 rounded bg-gray-200" />
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
          Aucune évaluation disponible pour le moment.
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((row) => (
            <div key={row.id} className="sn-card sn-card-hover p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-gray-900">{row.title}</div>

                    {row.isNew && <span className="sn-badge sn-badge-blue">Nouveau</span>}

                    <span className={typeBadgeClass(row.type)}>{row.type}</span>
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    {row.courseTitle} • {row.sectionTitle}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">{row.when}</div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className={statusBadgeClass(row.studentStatus)}>{row.studentStatus}</span>

                  {row.studentStatus === "Terminé" && row.scoreLabel && (
                    <span className="sn-badge sn-badge-green">{row.scoreLabel}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500">
                  {row.studentStatus === "Terminé"
                    ? "Soumis. Résultat visible selon l’état de correction."
                    : "Prêt ? Tu peux commencer."}
                </div>

                <div className="flex gap-2">
                  {row.studentStatus === "Terminé" ? (
                    <button
                      className="sn-btn-ghost sn-press"
                      onClick={() => navigate(`/app/student/assessments/${row.id}/result`)}
                    >
                      Voir résultat
                    </button>
                  ) : (
                    <button
                      className="sn-btn-primary sn-press"
                      onClick={() => navigate(`/app/student/assessments/${row.id}`)}
                    >
                      {row.studentStatus === "En cours" ? "Continuer" : "Commencer"}
                    </button>
                  )}

                  <button
                    className="sn-btn-ghost sn-press"
                    onClick={() => navigate(`/app/student/assessments/${row.id}/details`)}
                                      >
                    Détails
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500">
        *Cette vue lit maintenant les évaluations réelles publiées depuis Supabase.*
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