import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  course_id: string;
  section_id: string | null;
  time_limit_minutes: number | null;
  max_score: number | null;
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
  question_type: "mcq" | "true_false" | "short_text";
  prompt: string;
  order_index: number;
};

type QuizChoiceRow = {
  id: string;
  question_id: string;
  choice_text: string;
  order_index: number;
};

type ExistingSubmissionRow = {
  id: string;
  status: SubmissionStatus;
};

type ExistingAnswerRow = {
  question_id: string;
  answer_text: string | null;
  choice_id: string | null;
};

type Question =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      points: number;
      choices: { id: string; label: string }[];
      isFallback?: false;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      points: number;
      placeholder?: string;
      isFallback?: boolean;
    };

function normalizeCourse(value: AssessmentRow["courses"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
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

function getDraftKey(assessmentId?: string) {
  return assessmentId ? `draft_${assessmentId}` : "";
}

export default function StudentAssessmentTake() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | null>(null);
  const [existingSubmissionStatus, setExistingSubmissionStatus] = useState<SubmissionStatus | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitLockRef = useRef(false);
  const timerStartedRef = useRef(false);
  const draftHydratedRef = useRef(false);

  const draftKey = useMemo(() => getDraftKey(id), [id]);

  const loadAssessment = useCallback(async () => {
    if (!id) {
      setError("Évaluation introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setError("La soumission réelle n’est pas disponible en mode démo.");
      setLoading(false);
      return;
    }

    draftHydratedRef.current = false;

    try {
      setLoading(true);
      setError(null);

      const { data: assessmentData, error: assessmentError } = await supabase
        .from("assessments")
        .select(
          `
          id,
          title,
          description,
          type,
          course_id,
          section_id,
          time_limit_minutes,
          max_score,
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
        .single();

      if (assessmentError) throw assessmentError;

      const assessmentRow = assessmentData as AssessmentRow;

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
        const { data: choiceRowsData, error: choicesError } = await supabase
          .from("quiz_choices")
          .select("id, question_id, choice_text, order_index")
          .in("question_id", questionIds)
          .order("order_index", { ascending: true });

        if (choicesError) throw choicesError;

        choiceRows = (choiceRowsData ?? []) as QuizChoiceRow[];
      }

      const { data: existingSubmissionData, error: existingSubmissionError } = await supabase
        .from("submissions")
        .select("id, status")
        .eq("assessment_id", id)
        .eq("student_id", user.id)
        .maybeSingle();

      if (existingSubmissionError) throw existingSubmissionError;

      const existingSubmission = existingSubmissionData as ExistingSubmissionRow | null;

      let initialAnswers: Record<string, string> = {};

      if (existingSubmission) {
        setExistingSubmissionId(existingSubmission.id);
        setExistingSubmissionStatus(existingSubmission.status);

        const { data: existingAnswersData, error: existingAnswersError } = await supabase
          .from("submission_answers")
          .select("question_id, answer_text, choice_id")
          .eq("submission_id", existingSubmission.id);

        if (existingAnswersError) throw existingAnswersError;

        const answerRows = (existingAnswersData ?? []) as ExistingAnswerRow[];

        initialAnswers = answerRows.reduce<Record<string, string>>((acc, row) => {
          if (row.choice_id) {
            acc[row.question_id] = row.choice_id;
          } else if (row.answer_text) {
            acc[row.question_id] = row.answer_text;
          }
          return acc;
        }, {});
      } else {
        setExistingSubmissionId(null);
        setExistingSubmissionStatus(null);
      }

      if (!existingSubmission && draftKey) {
        const draft = localStorage.getItem(draftKey);
        if (draft) {
          try {
            const parsed = JSON.parse(draft) as { answers?: Record<string, string> };
            initialAnswers = {
              ...initialAnswers,
              ...(parsed.answers ?? {}),
            };
          } catch {
            // ignore invalid draft
          }
        }
      }

      const mappedQuestions: Question[] =
        questionRows.length > 0
          ? questionRows.map((q) => {
              const points =
                assessmentRow.max_score && questionRows.length > 0
                  ? Math.max(1, Math.round(Number(assessmentRow.max_score) / questionRows.length))
                  : 1;

              if (q.question_type === "mcq" || q.question_type === "true_false") {
                const choices =
                  q.question_type === "true_false"
                    ? [
                        { id: `${q.id}__true`, label: "Vrai" },
                        { id: `${q.id}__false`, label: "Faux" },
                      ]
                    : choiceRows
                        .filter((choice) => choice.question_id === q.id)
                        .sort((a, b) => a.order_index - b.order_index)
                        .map((choice) => ({
                          id: choice.id,
                          label: choice.choice_text,
                        }));

                return {
                  id: q.id,
                  type: "mcq" as const,
                  prompt: q.prompt,
                  points,
                  choices,
                  isFallback: false,
                };
              }

              return {
                id: q.id,
                type: "short" as const,
                prompt: q.prompt,
                points,
                placeholder: "Votre réponse...",
                isFallback: false,
              };
            })
          : [
              {
                id: "fallback-open-question",
                type: "short" as const,
                prompt:
                  assessmentRow.description?.trim() ||
                  "Répondez aux consignes de cette évaluation.",
                points: Number(assessmentRow.max_score ?? 20),
                placeholder: "Votre réponse...",
                isFallback: true,
              },
            ];

      setAssessment(assessmentRow);
      setQuestions(mappedQuestions);
      setAnswers(initialAnswers);
      setCurrentIndex(0);
    } catch (err) {
      console.error("[StudentAssessmentTake] loadAssessment error:", err);
      setError(safeErrorMessage(err, "Impossible de charger cette évaluation."));
      setAssessment(null);
      setQuestions([]);
      setAnswers({});
    } finally {
      draftHydratedRef.current = true;
      setLoading(false);
    }
  }, [id, user, draftKey]);

  useEffect(() => {
    if (authLoading) return;
    void loadAssessment();
  }, [authLoading, loadAssessment]);

  const total = questions.length;
  const current = questions[currentIndex];

  const answeredCount = useMemo(() => {
    return questions.reduce((acc, q) => acc + ((answers[q.id] || "").trim() ? 1 : 0), 0);
  }, [answers, questions]);

  const progress = Math.round((answeredCount / Math.max(1, total)) * 100);

  const hasTimer =
    assessment?.type === "exam" || typeof assessment?.time_limit_minutes === "number";

  const initialSeconds = useMemo(() => {
    const minutes =
      assessment?.time_limit_minutes ?? (assessment?.type === "exam" ? 30 : 0);
    return minutes ? minutes * 60 : 0;
  }, [assessment?.time_limit_minutes, assessment?.type]);

  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!hasTimer) {
      timerStartedRef.current = true;
      setSecondsLeft(0);
      return;
    }

    timerStartedRef.current = false;
    setSecondsLeft(initialSeconds);

    const t = window.setTimeout(() => {
      timerStartedRef.current = true;
    }, 0);

    return () => window.clearTimeout(t);
  }, [hasTimer, initialSeconds, id]);

  useEffect(() => {
    if (!hasTimer) return;
    if (submitting) return;
    if (secondsLeft <= 0) return;

    const t = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    return () => window.clearInterval(t);
  }, [hasTimer, secondsLeft, submitting]);

  const isReadOnly =
    existingSubmissionStatus === "submitted" || existingSubmissionStatus === "graded";

  const isDirty = useMemo(
    () => answeredCount > 0 && !submitting && !isReadOnly,
    [answeredCount, submitting, isReadOnly]
  );

  useEffect(() => {
    if (!draftKey) return;
    if (isReadOnly) return;
    if (!draftHydratedRef.current) return;
    if (loading) return;

    localStorage.setItem(
      draftKey,
      JSON.stringify({
        answers,
      })
    );
  }, [answers, draftKey, isReadOnly, loading]);

  useEffect(() => {
    if (!draftKey) return;
    if (isReadOnly) {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey, isReadOnly]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function setAnswer(questionId: string, value: string) {
    if (isReadOnly) return;
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function goPrev() {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }

  function confirmLeave() {
    if (!isDirty) return true;
    return window.confirm("Tu as des réponses non soumises. Quitter quand même ?");
  }

  function handleBack() {
    if (!confirmLeave()) return;
    navigate(-1);
  }

  const doSubmit = useCallback(
    async (auto = false) => {
      if (!id || !user) return;
      if (submitting) return;
      if (submitLockRef.current) return;
      if (existingSubmissionStatus === "submitted" || existingSubmissionStatus === "graded") {
        return;
      }

      submitLockRef.current = true;
      setSubmitting(true);
      setError(null);

      try {
        let submissionId = existingSubmissionId;

        if (!submissionId) {
          const { data: insertedSubmission, error: insertSubmissionError } = await supabase
            .from("submissions")
            .insert({
              assessment_id: id,
              student_id: user.id,
              submitted_at: new Date().toISOString(),
              status: "submitted",
            })
            .select("id")
            .single();

          if (insertSubmissionError) throw insertSubmissionError;

          submissionId = insertedSubmission.id as string;
        } else {
          const { error: updateSubmissionError } = await supabase
            .from("submissions")
            .update({
              submitted_at: new Date().toISOString(),
              status: "submitted",
            })
            .eq("id", submissionId);

          if (updateSubmissionError) throw updateSubmissionError;
        }

        const { error: deleteAnswersError } = await supabase
          .from("submission_answers")
          .delete()
          .eq("submission_id", submissionId);

        if (deleteAnswersError) throw deleteAnswersError;

        const realQuestions = questions.filter((q) => !q.isFallback);

        const payload: {
          submission_id: string;
          question_id: string;
          answer_text: string | null;
          choice_id: string | null;
        }[] = [];

        for (const q of realQuestions) {
          const raw = (answers[q.id] || "").trim();
          if (!raw) continue;

          if (q.type === "mcq") {
            const isTrueFalseSynthetic = raw === `${q.id}__true` || raw === `${q.id}__false`;

            payload.push({
              submission_id: submissionId,
              question_id: q.id,
              answer_text: isTrueFalseSynthetic ? (raw.endsWith("__true") ? "Vrai" : "Faux") : null,
              choice_id: isTrueFalseSynthetic ? null : raw,
            });
          } else {
            payload.push({
              submission_id: submissionId,
              question_id: q.id,
              answer_text: raw,
              choice_id: null,
            });
          }
        }

        if (payload.length > 0) {
          const { error: insertAnswersError } = await supabase
            .from("submission_answers")
            .insert(payload);

          if (insertAnswersError) throw insertAnswersError;
        }

        if (draftKey) {
          localStorage.removeItem(draftKey);
        }

        if (auto) {
          alert("⏰ Temps écoulé — soumission effectuée.");
        } else {
          alert("✅ Soumission enregistrée.");
        }

        navigate("/app/student/assessments", { replace: true });
      } catch (err) {
        console.error("[StudentAssessmentTake] submit error:", err);
        setError(safeErrorMessage(err, "Impossible de soumettre l’évaluation."));
      } finally {
        setSubmitting(false);
        submitLockRef.current = false;
      }
    },
    [
      id,
      user,
      submitting,
      existingSubmissionId,
      existingSubmissionStatus,
      questions,
      answers,
      navigate,
      draftKey,
    ]
  );

  useEffect(() => {
    if (!hasTimer) return;
    if (!timerStartedRef.current) return;
    if (secondsLeft === 0 && initialSeconds > 0 && !isReadOnly) {
      void doSubmit(true);
    }
  }, [secondsLeft, hasTimer, initialSeconds, doSubmit, isReadOnly]);

  const showWarning = hasTimer && secondsLeft <= 60;
  const assessmentTypeLabel = assessment ? typeLabel(assessment.type) : "Évaluation";
  const courseTitle = assessment ? normalizeCourse(assessment.courses)?.title ?? "Cours" : "Cours";
  const sectionTitle = assessment
    ? normalizeSection(assessment.course_sections)?.title ?? "Sans section"
    : "Sans section";

  const canSubmit = !submitting && !isReadOnly && answeredCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{assessment?.title ?? "Évaluation"}</div>
          <div className="text-sm text-gray-500">
            {courseTitle} • {sectionTitle}
          </div>
          {isReadOnly && (
            <div className="mt-1 text-xs text-gray-500">
              Cette évaluation a déjà été soumise.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button className="sn-btn-ghost sn-press" onClick={handleBack} disabled={submitting}>
            ← Retour
          </button>

          {hasTimer && (
            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm ${
                showWarning ? "bg-red-600 text-white" : "bg-gray-100 text-gray-800"
              }`}
            >
              ⏱ {formatTime(Math.max(0, secondsLeft))}
            </div>
          )}

          <button
            className="sn-btn-primary sn-press"
            onClick={() => void doSubmit(false)}
            disabled={!canSubmit}
            title={
              isReadOnly
                ? "Cette évaluation a déjà été soumise"
                : answeredCount === 0
                ? "Répondez à au moins une question"
                : undefined
            }
          >
            {submitting ? "Soumission..." : "Soumettre"}
          </button>
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : la soumission réelle est désactivée.
        </div>
      )}

      {(authLoading || loading) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 sn-card p-5 space-y-4 animate-pulse">
            <div className="h-5 w-1/3 rounded bg-gray-200" />
            <div className="h-24 rounded bg-gray-100" />
            <div className="h-10 w-32 rounded bg-gray-200" />
          </div>
          <div className="sn-card p-5 space-y-4 animate-pulse">
            <div className="h-5 w-1/2 rounded bg-gray-200" />
            <div className="h-20 rounded bg-gray-100" />
          </div>
        </div>
      )}

      {!authLoading && !loading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!authLoading && !loading && !error && assessment && current && (
        <>
          <div className="sn-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              Progression : <span className="font-semibold">{answeredCount}</span>/{total} réponses •{" "}
              <span className="font-semibold">{progress}%</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="sn-badge sn-badge-gray">{assessmentTypeLabel}</span>
              <span className="sn-badge sn-badge-gray">{assessment.max_score ?? "—"} pts</span>
              {hasTimer && (
                <span className="sn-badge sn-badge-gray">
                  {assessment.time_limit_minutes ?? 30} min
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 sn-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">
                  Question {currentIndex + 1} / {total}
                </div>
                <span className="sn-badge sn-badge-gray">{current.points} pts</span>
              </div>

              <div className="text-gray-900 font-semibold">{current.prompt}</div>

              {current.type === "mcq" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {current.choices.map((choice) => {
                    const selected = answers[current.id] === choice.id;

                    return (
                      <button
                        key={choice.id}
                        type="button"
                        disabled={submitting || isReadOnly}
                        className={`rounded-2xl border p-3 text-left transition sn-press ${
                          selected
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-100 bg-white hover:bg-gray-50"
                        }`}
                        onClick={() => setAnswer(current.id, choice.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-gray-900">{choice.label}</div>
                          {selected && <span className="sn-badge sn-badge-blue">Choisi</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    className="w-full min-h-[140px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder={current.placeholder || "Votre réponse..."}
                    value={answers[current.id] || ""}
                    onChange={(e) => setAnswer(current.id, e.target.value)}
                    disabled={submitting || isReadOnly}
                  />
                  <div className="text-xs text-gray-500">
                    Réponds clairement. Cette réponse pourra être corrigée par l’enseignant.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  className="sn-btn-ghost sn-press"
                  onClick={goPrev}
                  disabled={currentIndex === 0 || submitting}
                >
                  ← Précédent
                </button>

                <button
                  className="sn-btn-primary sn-press"
                  onClick={goNext}
                  disabled={currentIndex === total - 1 || submitting}
                >
                  Suivant →
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="sn-card p-5 space-y-3">
                <div className="font-semibold">Questions</div>

                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const has = (answers[q.id] || "").trim().length > 0;
                    const active = idx === currentIndex;

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        disabled={submitting}
                        className={`h-10 rounded-xl text-sm font-semibold transition sn-press ${
                          active
                            ? "bg-blue-600 text-white"
                            : has
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                        title={has ? "Répondu" : "Non répondu"}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="text-xs text-gray-500">
                  Bleu clair = répondu • Gris = à faire • Bleu = active
                </div>
              </div>

              <div className="sn-card p-5 space-y-3">
                <div className="font-semibold">Résumé</div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div>
                    Réponses : <span className="font-semibold">{answeredCount}</span>/{total}
                  </div>
                  <div>
                    Points max : <span className="font-semibold">{assessment.max_score ?? "—"}</span>
                  </div>
                  {hasTimer && (
                    <div>
                      Temps restant :{" "}
                      <span className={`font-semibold ${showWarning ? "text-red-600" : ""}`}>
                        {formatTime(Math.max(0, secondsLeft))}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    className="sn-btn-primary w-full sn-press"
                    onClick={() => void doSubmit(false)}
                    disabled={!canSubmit}
                    title={
                      isReadOnly
                        ? "Cette évaluation a déjà été soumise"
                        : answeredCount === 0
                        ? "Répondez à au moins une question"
                        : undefined
                    }
                  >
                    {submitting ? "Soumission..." : "Soumettre"}
                  </button>
                </div>

                <div className="text-xs text-gray-500">
                  *Cette vue crée une vraie soumission dans Supabase et garde un brouillon local tant que ce n’est pas envoyé.*
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}