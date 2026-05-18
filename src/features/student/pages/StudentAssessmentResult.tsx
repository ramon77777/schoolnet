import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentType = "quiz" | "assignment" | "exam";
type SubmissionStatus = "in_progress" | "submitted" | "graded" | "published";

type AssessmentRow = {
  id: string;
  title: string;
  description: string | null;
  type: AssessmentType;
  max_score: number | null;
  course_id: string;
  section_id: string | null;
  courses: { id: string; title: string } | { id: string; title: string }[] | null;
  course_sections: { id: string; title: string } | { id: string; title: string }[] | null;
};

type SubmissionRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
};

function normalizeCourse(value: AssessmentRow["courses"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function badgeTypeClass(type: AssessmentType) {
  if (type === "exam") return "sn-badge sn-badge-red";
  if (type === "assignment") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function typeLabel(type: AssessmentType) {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatPoints(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function safeErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null) {
    const maybe = err as { message?: string; error_description?: string; details?: string };
    return maybe.message || maybe.error_description || maybe.details || fallback;
  }
  return fallback;
}

export default function StudentAssessmentResult() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadResult = useCallback(async () => {
    if (!id) {
      setError("Résultat introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setError("Le résultat réel n’est pas disponible en mode démo.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [assessmentResult, submissionResult] = await Promise.all([
        supabase
          .from("assessments")
          .select(`
            id,
            title,
            description,
            type,
            max_score,
            course_id,
            section_id,
            courses (id, title),
            course_sections (id, title)
          `)
          .eq("id", id)
          .single(),

        supabase
          .from("assessment_submissions")
          .select("id, assessment_id, student_id, submitted_at, status, score, feedback")
          .eq("assessment_id", id)
          .eq("student_id", user.id)
          .maybeSingle(),
      ]);

      if (assessmentResult.error) throw assessmentResult.error;
      if (submissionResult.error) throw submissionResult.error;

      const assessmentData = assessmentResult.data as AssessmentRow;
      const submissionData = submissionResult.data as SubmissionRow | null;

      if (!submissionData) {
        setAssessment(assessmentData);
        setSubmission(null);
        setError("Aucune soumission trouvée pour cette évaluation.");
        return;
      }

      setAssessment(assessmentData);
      setSubmission(submissionData);
    } catch (err) {
      console.error("[StudentAssessmentResult] loadResult error:", err);
      setAssessment(null);
      setSubmission(null);
      setError(safeErrorMessage(err, "Impossible de charger le résultat."));
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadResult();
  }, [authLoading, loadResult]);

  const isLoading = authLoading || loading;
  const isPublished = submission?.status === "published";
  const canShowTeacherDetails = isPublished;

  const teacherStatusLabel = (() => {
    if (!submission) return "Non soumis";
    if (submission.status === "published") return "Publié";
    if (submission.status === "graded") return "Corrigé, en attente de publication";
    if (submission.status === "submitted") return "Soumis, en attente de correction";
    return "En cours";
  })();

  const displayedScoreLabel =
    canShowTeacherDetails && assessment
      ? `${formatPoints(submission?.score)} / ${formatPoints(assessment.max_score)}`
      : "—";

  const courseTitle = assessment ? normalizeCourse(assessment.courses)?.title ?? "Cours" : "Cours";
  const sectionTitle = assessment
    ? normalizeSection(assessment.course_sections)?.title ?? "Sans section"
    : "Sans section";

  if (!id) {
    return (
      <div className="sn-card p-6">
        <div className="text-lg font-semibold">Résultat</div>
        <div className="text-sm text-gray-500 mt-1">Évaluation introuvable.</div>
        <div className="mt-4">
          <button
            className="sn-btn-primary sn-press"
            onClick={() => navigate("/app/student/assessments")}
          >
            ← Retour aux évaluations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Résultat</div>
          <div className="text-sm text-gray-500">
            {assessment?.title ?? "Évaluation"} • {courseTitle} • {sectionTitle}
          </div>
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => navigate("/app/student/assessments")}
        >
          ← Retour aux évaluations
        </button>
      </div>

      {isLoading && (
        <div className="sn-card p-5 animate-pulse space-y-3">
          <div className="h-6 w-1/3 rounded bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-100" />
          <div className="h-24 rounded bg-gray-100" />
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && assessment && submission && (
        <>
          <div className="sn-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={badgeTypeClass(assessment.type)}>{typeLabel(assessment.type)}</span>
                <span className="sn-badge sn-badge-green">Soumis</span>

                <span
                  className={
                    submission.status === "published"
                      ? "sn-badge sn-badge-green"
                      : submission.status === "graded"
                      ? "sn-badge sn-badge-blue"
                      : "sn-badge sn-badge-gray"
                  }
                >
                  {teacherStatusLabel}
                </span>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-500">Score</div>
                <div className="text-2xl font-bold text-gray-900">{displayedScoreLabel}</div>
              </div>
            </div>

            <div className="text-xs text-gray-500">
              Soumis le : {formatDate(submission.submitted_at)}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Commentaire enseignant</div>
              <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">
                {canShowTeacherDetails
                  ? submission.feedback || "Aucun commentaire global."
                  : "Le commentaire sera visible après publication par l’enseignant."}
              </div>
            </div>
          </div>

          <div className="sn-card p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-gray-900">Correction détaillée</div>
              <div className="text-sm text-gray-500">
                Consulte tes réponses, les points par question et les commentaires de l’enseignant.
              </div>
            </div>

            <button
              className="sn-btn-primary sn-press"
              onClick={() => navigate(`/app/student/assessments/${id}/details`)}
              type="button"
            >
              Voir les détails
            </button>
          </div>
        </>
      )}
    </div>
  );
}