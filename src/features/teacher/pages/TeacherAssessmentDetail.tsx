import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentType = "quiz" | "assignment" | "exam";
type AssessmentStatus = "draft" | "published" | "closed";
type SubmissionStatus = "in_progress" | "submitted" | "graded" | "published";
type QuestionType = "mcq" | "true_false" | "short_text";

type AssessmentRow = {
  id: string;
  title: string;
  description: string | null;
  type: AssessmentType;
  status: AssessmentStatus;
  due_at: string | null;
  time_limit_minutes: number | null;
  max_score: number | null;
  created_at: string;
  updated_at: string;
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

type QuizQuestionRow = {
  id: string;
  assessment_id: string;
  question_type: QuestionType;
  prompt: string;
  order_index: number;
};

type QuizChoiceRow = {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean;
  order_index?: number | null;
};

type SubmissionQuestionGradeRow = {
  question_id: string;
  max_points: number;
};

type QuestionView =
  | {
      id: string;
      type: "QCM";
      prompt: string;
      order: number;
      maxPoints: number;
      choices: { id: string; label: string; isCorrect: boolean }[];
    }
  | {
      id: string;
      type: "Vrai / Faux";
      prompt: string;
      order: number;
      maxPoints: number;
      choices: { id: string; label: string; isCorrect: boolean }[];
    }
  | {
      id: string;
      type: "Réponse ouverte";
      prompt: string;
      order: number;
      maxPoints: number;
    };

function normalizeCourse(value: AssessmentRow["courses"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapAssessmentType(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function mapAssessmentStatus(status: AssessmentStatus): "Brouillon" | "Publié" | "Clôturé" {
  if (status === "published") return "Publié";
  if (status === "closed") return "Clôturé";
  return "Brouillon";
}

function typeBadgeClass(type: "Quiz" | "Devoir" | "Examen") {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusBadgeClass(status: "Brouillon" | "Publié" | "Clôturé") {
  if (status === "Publié") return "sn-badge sn-badge-green";
  if (status === "Clôturé") return "sn-badge sn-badge-red";
  return "sn-badge sn-badge-gray";
}

function formatDateTime(value: string | null) {
  if (!value) return "Sans échéance";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function safeErrorMessage(err: unknown, fallback: string) {
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

function sortChoices(rows: QuizChoiceRow[]) {
  return [...rows].sort((a, b) => {
    const ao = typeof a.order_index === "number" ? a.order_index : Number.MAX_SAFE_INTEGER;
    const bo = typeof b.order_index === "number" ? b.order_index : Number.MAX_SAFE_INTEGER;

    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function TeacherAssessmentDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError("Évaluation introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setAssessment(null);
      setQuestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [assessmentResult, questionsResult] = await Promise.all([
        supabase
          .from("assessments")
          .select(
            `
            id,
            title,
            description,
            type,
            status,
            due_at,
            time_limit_minutes,
            max_score,
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
          .eq("id", id)
          .single(),

        supabase
          .from("quiz_questions")
          .select("id, assessment_id, question_type, prompt, order_index")
          .eq("assessment_id", id)
          .order("order_index", { ascending: true }),
      ]);

      if (assessmentResult.error) throw assessmentResult.error;
      if (questionsResult.error) throw questionsResult.error;

      const assessmentData = assessmentResult.data as AssessmentRow;
      const questionRows = (questionsResult.data ?? []) as QuizQuestionRow[];
      const questionIds = questionRows.map((q) => q.id);

      let choiceRows: QuizChoiceRow[] = [];
      if (questionIds.length > 0) {
        const { data: choicesData, error: choicesError } = await supabase
          .from("quiz_choices")
          .select("id, question_id, choice_text, is_correct, order_index")
          .in("question_id", questionIds);

        if (choicesError) throw choicesError;

        choiceRows = sortChoices((choicesData ?? []) as QuizChoiceRow[]);
      }

      let gradedMaxPointsByQuestionId: Record<string, number> = {};
      if (questionIds.length > 0) {
        const { data: gradeRowsData, error: gradesError } = await supabase
          .from("submission_question_grades")
          .select("question_id, max_points")
          .in("question_id", questionIds);

        if (gradesError) throw gradesError;

        const gradeRows = (gradeRowsData ?? []) as SubmissionQuestionGradeRow[];

        gradedMaxPointsByQuestionId = gradeRows.reduce<Record<string, number>>((acc, row) => {
          if (
            typeof row.max_points === "number" &&
            Number.isFinite(row.max_points) &&
            row.max_points > 0 &&
            acc[row.question_id] === undefined
          ) {
            acc[row.question_id] = row.max_points;
          }
          return acc;
        }, {});
      }

      const defaultMaxPoints =
        questionRows.length > 0
          ? Math.max(
              1,
              round2(Number(assessmentData.max_score ?? 0) / questionRows.length || 1)
            )
          : Math.max(1, Number(assessmentData.max_score ?? 0) || 1);

      const mappedQuestions: QuestionView[] = questionRows.map((q) => {
        const maxPoints = gradedMaxPointsByQuestionId[q.id] ?? defaultMaxPoints;

        if (q.question_type === "mcq") {
          const linkedChoices = sortChoices(
            choiceRows.filter((choice) => choice.question_id === q.id)
          );

          return {
            id: q.id,
            type: "QCM",
            prompt: q.prompt,
            order: q.order_index,
            maxPoints,
            choices: linkedChoices.map((choice) => ({
              id: choice.id,
              label: choice.choice_text,
              isCorrect: choice.is_correct,
            })),
          };
        }

        if (q.question_type === "true_false") {
          const tfChoicesFromDb = sortChoices(
            choiceRows.filter((choice) => choice.question_id === q.id)
          );

          const trueChoice = tfChoicesFromDb.find(
            (choice) => choice.choice_text.trim().toLowerCase() === "vrai"
          );
          const falseChoice = tfChoicesFromDb.find(
            (choice) => choice.choice_text.trim().toLowerCase() === "faux"
          );

          return {
            id: q.id,
            type: "Vrai / Faux",
            prompt: q.prompt,
            order: q.order_index,
            maxPoints,
            choices: [
              {
                id: trueChoice?.id ?? `${q.id}__true`,
                label: "Vrai",
                isCorrect: trueChoice?.is_correct ?? false,
              },
              {
                id: falseChoice?.id ?? `${q.id}__false`,
                label: "Faux",
                isCorrect: falseChoice?.is_correct ?? false,
              },
            ],
          };
        }

        return {
          id: q.id,
          type: "Réponse ouverte",
          prompt: q.prompt,
          order: q.order_index,
          maxPoints,
        };
      });

      setAssessment(assessmentData);
      setQuestions(mappedQuestions);
    } catch (err) {
      console.error("[TeacherAssessmentDetail] loadDetail error:", err);
      setError(safeErrorMessage(err, "Impossible de charger le détail de l’évaluation."));
      setAssessment(null);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadDetail();
  }, [authLoading, loadDetail]);

  const assessmentType = useMemo(
    () => (assessment ? mapAssessmentType(assessment.type) : "Quiz"),
    [assessment]
  );

  const assessmentStatus = useMemo(
    () => (assessment ? mapAssessmentStatus(assessment.status) : "Brouillon"),
    [assessment]
  );

  const courseTitle = useMemo(
    () => (assessment ? normalizeCourse(assessment.courses)?.title ?? "Cours" : "Cours"),
    [assessment]
  );

  const sectionTitle = useMemo(
    () =>
      assessment
        ? normalizeSection(assessment.course_sections)?.title ?? "Sans section"
        : "Sans section",
    [assessment]
  );

  async function togglePublish() {
    if (!assessment || updatingStatus) return;

    try {
      setUpdatingStatus(true);

      const isPublishing = assessment.status !== "published";
      const nextAssessmentStatus: AssessmentStatus = isPublishing ? "published" : "draft";
      const fromSubmissionStatus: SubmissionStatus = isPublishing ? "graded" : "published";
      const toSubmissionStatus: SubmissionStatus = isPublishing ? "published" : "graded";

      const { error: updateAssessmentError } = await supabase
        .from("assessments")
        .update({ status: nextAssessmentStatus })
        .eq("id", assessment.id);

      if (updateAssessmentError) throw updateAssessmentError;

      const { error: updateSubmissionsError } = await supabase
        .from("submissions")
        .update({ status: toSubmissionStatus })
        .eq("assessment_id", assessment.id)
        .eq("status", fromSubmissionStatus);

      if (updateSubmissionsError) throw updateSubmissionsError;

      await loadDetail();
    } catch (err) {
      console.error("[TeacherAssessmentDetail] togglePublish error:", err);
      alert(safeErrorMessage(err, "Impossible de modifier le statut de publication."));
    } finally {
      setUpdatingStatus(false);
    }
  }

  function goToCorrections() {
    if (!assessment) return;
    navigate(`/app/teacher/grading?assessmentId=${encodeURIComponent(assessment.id)}`);
  }

  const isLoading = authLoading || loading;

  if (!id) {
    return (
      <div className="sn-card p-6 space-y-3">
        <div className="text-lg font-semibold">Détail évaluation</div>
        <div className="text-sm text-gray-500">Évaluation introuvable.</div>
        <button
          className="sn-btn-primary sn-press w-fit"
          onClick={() => navigate("/app/teacher/assessments")}
        >
          ← Retour
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Détail évaluation</div>
          <div className="text-sm text-gray-500">
            Suivi complet de l’évaluation, de son contenu et de son statut.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="sn-btn-ghost sn-press" onClick={() => navigate(-1)}>
            ← Retour
          </button>
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : le détail réel n’est pas chargé.
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="sn-card p-5 animate-pulse space-y-3">
            <div className="h-6 w-1/3 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-100" />
            <div className="h-4 w-1/4 rounded bg-gray-100" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 sn-card p-5 animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="h-24 rounded bg-gray-100" />
              <div className="h-24 rounded bg-gray-100" />
            </div>
            <div className="sn-card p-5 animate-pulse space-y-3">
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-10 rounded bg-gray-100" />
              <div className="h-10 rounded bg-gray-100" />
              <div className="h-10 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-5 border border-red-200 bg-red-50 text-red-700 space-y-3">
          <div className="font-medium">Erreur de chargement</div>
          <div className="text-sm">{error}</div>
          <button className="sn-btn-primary sn-press w-fit" onClick={() => void loadDetail()}>
            Réessayer
          </button>
        </div>
      )}

      {!isLoading && !error && assessment && (
        <>
          <div className="sn-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xl font-semibold text-gray-900">{assessment.title}</div>
                  <span className={typeBadgeClass(assessmentType)}>{assessmentType}</span>
                  <span className={statusBadgeClass(assessmentStatus)}>{assessmentStatus}</span>
                </div>

                <div className="mt-2 text-sm text-gray-500">
                  {courseTitle} • {sectionTitle}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="sn-btn-ghost sn-press"
                  onClick={() => navigate(`/app/teacher/assessments/${assessment.id}/edit`)}
                >
                  Modifier
                </button>

                <button
                  className="sn-btn-ghost sn-press"
                  onClick={() => void togglePublish()}
                  disabled={updatingStatus}
                >
                  {updatingStatus
                    ? "Mise à jour..."
                    : assessment.status === "published"
                    ? "Dépublier"
                    : "Publier"}
                </button>

                <button className="sn-btn-primary sn-press" onClick={goToCorrections}>
                  Corrections
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCard label="Échéance" value={formatDateTime(assessment.due_at)} />
              <InfoCard
                label="Durée"
                value={
                  assessment.time_limit_minutes
                    ? `${assessment.time_limit_minutes} min`
                    : "Non définie"
                }
              />
              <InfoCard
                label="Note max"
                value={
                  assessment.max_score !== null
                    ? `${assessment.max_score} pts`
                    : "Non définie"
                }
              />
              <InfoCard label="Questions" value={String(questions.length)} />
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Consignes / Description</div>
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                {assessment.description?.trim() || "Aucune consigne fournie."}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="sn-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Questions de l’évaluation</div>
                  <span className="sn-badge sn-badge-gray">{questions.length} question(s)</span>
                </div>

                {questions.length === 0 ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    Aucune question enregistrée pour cette évaluation.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {questions.map((question, idx) => (
                      <div
                        key={question.id}
                        className="rounded-2xl border border-gray-100 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-500">
                              Question {idx + 1} • ordre {question.order + 1} •{" "}
                              {formatPoints(question.maxPoints)} pts
                            </div>
                            <div className="font-semibold text-gray-900">{question.prompt}</div>
                          </div>

                          <span className="sn-badge sn-badge-gray">{question.type}</span>
                        </div>

                        {"choices" in question ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {question.choices.map((choice) => (
                              <div
                                key={choice.id}
                                className="rounded-2xl border border-gray-100 bg-white p-3"
                              >
                                <div className="text-sm text-gray-900">{choice.label}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                            Réponse libre attendue de l’apprenant.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="sn-card p-5 space-y-4">
                <div className="font-semibold">Actions rapides</div>

                <button className="sn-btn-primary w-full sn-press" onClick={goToCorrections}>
                  Aller aux corrections
                </button>

                <button
                  className="sn-btn-ghost w-full sn-press"
                  onClick={() => navigate(`/app/teacher/assessments/${assessment.id}/edit`)}
                >
                  Modifier l’évaluation
                </button>

                <button
                  className="sn-btn-ghost w-full sn-press"
                  onClick={() => void togglePublish()}
                  disabled={updatingStatus}
                >
                  {updatingStatus
                    ? "Mise à jour..."
                    : assessment.status === "published"
                    ? "Dépublier"
                    : "Publier"}
                </button>
              </div>

              <div className="sn-card p-5">
                <div className="font-semibold">Aperçu</div>
                <div className="mt-2 text-sm text-gray-500">
                  Cette zone pourra ensuite afficher :
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>nombre de soumissions</li>
                    <li>copies en attente</li>
                    <li>moyenne de classe</li>
                    <li>taux de complétion</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}