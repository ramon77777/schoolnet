import { useCallback, useEffect, useMemo, useState } from "react";
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
  id: string;
  assessment_id: string;
  student_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
};

type QuizQuestionRow = {
  id: string;
  assessment_id: string;
  question_type: "mcq" | "true_false" | "short_text";
  prompt: string;
  order_index: number;
};

type QuizChoiceRow = {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean | null;
  order_index?: number | null;
};

type SubmissionAnswerRow = {
  question_id: string;
  answer_text: string | null;
  choice_id: string | null;
};

type SubmissionQuestionGradeRow = {
  question_id: string;
  points_awarded: number | null;
  max_points: number;
  feedback: string | null;
};

type QuestionResultView =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      maxPoints: number;
      studentAnswerLabel: string;
      teacherPoints: number | null;
      teacherFeedback: string | null;
      choices: {
        id: string;
        label: string;
        selected: boolean;
        isCorrect: boolean;
      }[];
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      maxPoints: number;
      studentAnswerLabel: string;
      teacherPoints: number | null;
      teacherFeedback: string | null;
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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
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

function formatPoints(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function StudentAssessmentDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [questions, setQuestions] = useState<QuestionResultView[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherOpen, setTeacherOpen] = useState(true);
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
          .select(
            `
            id,
            title,
            description,
            type,
            max_score,
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
        setQuestions([]);
        setError("Aucune soumission trouvée pour cette évaluation.");
        return;
      }

      const { data: questionRowsData, error: questionsError } = await supabase
        .from("quiz_questions")
        .select("id, assessment_id, question_type, prompt, order_index")
        .eq("assessment_id", id)
        .order("order_index", { ascending: true });

      if (questionsError) throw questionsError;

      const questionRows = (questionRowsData ?? []) as QuizQuestionRow[];
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

      const { data: answerRowsData, error: answersError } = await supabase
        .from("submission_answers")
        .select("question_id, answer_text, choice_id")
        .eq("submission_id", submissionData.id);

      if (answersError) throw answersError;

      const answerRows = (answerRowsData ?? []) as SubmissionAnswerRow[];

      const { data: gradeRowsData, error: gradesError } = await supabase
        .from("submission_question_grades")
        .select("question_id, points_awarded, max_points, feedback")
        .eq("submission_id", submissionData.id);

      if (gradesError) throw gradesError;

      const gradeRows = (gradeRowsData ?? []) as SubmissionQuestionGradeRow[];

      const answerByQuestionId = answerRows.reduce<Record<string, SubmissionAnswerRow>>((acc, row) => {
        acc[row.question_id] = row;
        return acc;
      }, {});

      const gradeByQuestionId = gradeRows.reduce<Record<string, SubmissionQuestionGradeRow>>((acc, row) => {
        acc[row.question_id] = row;
        return acc;
      }, {});

      const defaultMaxPoints =
        assessmentData.max_score && questionRows.length > 0
          ? Math.max(1, round2(Number(assessmentData.max_score) / questionRows.length))
          : 1;

      const mappedQuestions: QuestionResultView[] = questionRows.map((question) => {
        const answer = answerByQuestionId[question.id];
        const grade = gradeByQuestionId[question.id];
        const maxPoints = round2(grade?.max_points ?? defaultMaxPoints);

        if (question.question_type === "mcq") {
          const linkedChoices = sortChoices(
            choiceRows.filter((choice) => choice.question_id === question.id)
          );

          const choices = linkedChoices.map((choice) => ({
            id: choice.id,
            label: choice.choice_text,
            selected: answer?.choice_id === choice.id,
            isCorrect: Boolean(choice.is_correct),
          }));

          return {
            id: question.id,
            type: "mcq",
            prompt: question.prompt,
            maxPoints,
            studentAnswerLabel:
              choices.find((choice) => choice.selected)?.label || "Aucune réponse.",
            teacherPoints: grade?.points_awarded ?? null,
            teacherFeedback: grade?.feedback ?? null,
            choices,
          };
        }

        if (question.question_type === "true_false") {
          const linkedChoices = sortChoices(
            choiceRows.filter((choice) => choice.question_id === question.id)
          );

          const vraiChoice = linkedChoices.find(
            (choice) => choice.choice_text.trim().toLowerCase() === "vrai"
          );
          const fauxChoice = linkedChoices.find(
            (choice) => choice.choice_text.trim().toLowerCase() === "faux"
          );

          const studentAnswer = answer?.answer_text?.trim().toLowerCase() || "";

          const choices = [
            {
              id: `${question.id}__true`,
              label: "Vrai",
              selected: studentAnswer === "vrai",
              isCorrect: Boolean(vraiChoice?.is_correct),
            },
            {
              id: `${question.id}__false`,
              label: "Faux",
              selected: studentAnswer === "faux",
              isCorrect: Boolean(fauxChoice?.is_correct),
            },
          ];

          return {
            id: question.id,
            type: "mcq",
            prompt: question.prompt,
            maxPoints,
            studentAnswerLabel: answer?.answer_text || "Aucune réponse.",
            teacherPoints: grade?.points_awarded ?? null,
            teacherFeedback: grade?.feedback ?? null,
            choices,
          };
        }

        return {
          id: question.id,
          type: "short",
          prompt: question.prompt,
          maxPoints,
          studentAnswerLabel: answer?.answer_text || "Aucune réponse.",
          teacherPoints: grade?.points_awarded ?? null,
          teacherFeedback: grade?.feedback ?? null,
        };
      });

      setAssessment(assessmentData);
      setSubmission(submissionData);
      setQuestions(mappedQuestions);
    } catch (err) {
      console.error("[StudentAssessmentResult] loadResult error:", err);
      setAssessment(null);
      setSubmission(null);
      setQuestions([]);
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
  const isSubmitted = Boolean(submission);
  const canShowTeacherDetails = isPublished;

  const teacherStatusLabel = (() => {
    if (!isSubmitted) return "Non soumis";
    if (submission?.status === "published") return "Publié";
    if (submission?.status === "graded") return "Corrigé (non publié)";
    if (submission?.status === "submitted") return "En attente";
    return "En attente";
  })();

  const summary = useMemo(() => {
    let corrected = 0;
    let pending = 0;
    let unanswered = 0;

    for (const question of questions) {
      const answered = question.studentAnswerLabel !== "Aucune réponse.";

      if (!answered) {
        unanswered += 1;
        continue;
      }

      if (canShowTeacherDetails && question.teacherPoints !== null) {
        corrected += 1;
      } else {
        pending += 1;
      }
    }

    return { corrected, pending, unanswered };
  }, [questions, canShowTeacherDetails]);

  const displayedScoreLabel =
    canShowTeacherDetails && assessment
      ? `${formatPoints(submission?.score)} / ${formatPoints(assessment.max_score)}`
      : "—";

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

  const courseTitle = assessment ? normalizeCourse(assessment.courses)?.title ?? "Cours" : "Cours";
  const sectionTitle = assessment
    ? normalizeSection(assessment.course_sections)?.title ?? "Sans section"
    : "Sans section";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Détails de la correction</div>
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
        <div className="space-y-4">
          <div className="sn-card p-5 animate-pulse space-y-3">
            <div className="h-6 w-1/3 rounded bg-gray-200" />
            <div className="h-4 w-1/2 rounded bg-gray-100" />
            <div className="h-4 w-1/4 rounded bg-gray-100" />
          </div>
          <div className="sn-card p-5 animate-pulse space-y-3">
            <div className="h-20 rounded bg-gray-100" />
            <div className="h-20 rounded bg-gray-100" />
          </div>
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

                <span className={isSubmitted ? "sn-badge sn-badge-green" : "sn-badge sn-badge-gray"}>
                  {isSubmitted ? "Soumis" : "Non soumis"}
                </span>

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

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Soumis le : {formatDate(submission.submitted_at)}</span>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">Résumé pédagogique</div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl bg-green-50 border border-green-100 p-3">
                  <div className="text-xs text-gray-600">Questions corrigées</div>
                  <div className="text-lg font-bold text-gray-900">✅ {summary.corrected}</div>
                </div>

                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
                  <div className="text-xs text-gray-600">En attente</div>
                  <div className="text-lg font-bold text-gray-900">⏳ {summary.pending}</div>
                </div>

                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                  <div className="text-xs text-gray-600">Non répondu</div>
                  <div className="text-lg font-bold text-gray-900">⚪ {summary.unanswered}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Commentaire enseignant</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {canShowTeacherDetails
                      ? "Correction publiée par l’enseignant."
                      : submission.status === "graded"
                      ? "Correction faite, en attente de publication."
                      : "Correction en attente."}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="sn-btn-ghost sn-press"
                    onClick={() => setTeacherOpen((v) => !v)}
                    aria-expanded={teacherOpen}
                  >
                    {teacherOpen ? "Masquer" : "Afficher"}
                  </button>
                </div>
              </div>

              <div
                className={[
                  "transition-all duration-300 ease-out",
                  teacherOpen
                    ? "opacity-100 translate-y-0 mt-4 max-h-[900px]"
                    : "opacity-0 -translate-y-1 mt-0 max-h-0 overflow-hidden pointer-events-none",
                ].join(" ")}
              >
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                  {canShowTeacherDetails
                    ? submission.feedback || "Aucun commentaire global."
                    : "Le commentaire sera visible après publication par l’enseignant."}
                </div>
              </div>
            </div>
          </div>

          <div className="sn-card p-5 space-y-4">
            <div className="font-semibold">Correction détaillée question par question</div>

            <div className="space-y-4">
              {questions.map((question, idx) => {
                const answered = question.studentAnswerLabel !== "Aucune réponse.";

                return (
                  <div key={question.id} className="rounded-2xl border border-gray-100 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">
                          Question {idx + 1} • {formatPoints(question.maxPoints)} pts
                          {canShowTeacherDetails && question.teacherPoints !== null ? (
                            <span className="ml-2">
                              {" "}
                              • Noté : {formatPoints(question.teacherPoints)}/{formatPoints(question.maxPoints)}
                            </span>
                          ) : null}
                        </div>
                        <div className="font-semibold text-gray-900">{question.prompt}</div>
                      </div>

                      <span className={answered ? "sn-badge sn-badge-blue" : "sn-badge sn-badge-gray"}>
                        {answered ? "Répondu" : "Non répondu"}
                      </span>
                    </div>

                    {question.type === "mcq" ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {question.choices.map((choice) => {
                          const cls = choice.selected
                            ? "border-blue-500 bg-blue-50"
                            : canShowTeacherDetails && choice.isCorrect
                            ? "border-green-200 bg-green-50/40"
                            : "border-gray-100 bg-white";

                          return (
                            <div
                              key={choice.id}
                              className={`rounded-2xl border p-3 text-left ${cls}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm text-gray-900">{choice.label}</div>
                                <div className="flex gap-2">
                                  {canShowTeacherDetails && choice.isCorrect && (
                                    <span className="sn-badge sn-badge-green">Bonne</span>
                                  )}
                                  {choice.selected && (
                                    <span className="sn-badge sn-badge-blue">Choisi</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800 whitespace-pre-wrap">
                        {question.studentAnswerLabel}
                      </div>
                    )}

                    {canShowTeacherDetails && question.teacherFeedback && (
                      <div className="rounded-2xl bg-white border border-gray-100 p-3 text-sm text-gray-800">
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          Commentaire enseignant
                        </div>
                        {question.teacherFeedback}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-gray-500">
              *La correction détaillée est visible uniquement après publication par l’enseignant.*
            </div>
          </div>
        </>
      )}
    </div>
  );
}