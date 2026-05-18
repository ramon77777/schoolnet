import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

type ProfileRow = {
  id: string;
  full_name: string | null;
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

type ClassStudentRow = {
  student_id: string;
  class_id: string;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string;
};

type QuestionView =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      points: number;
      choices: { id: string; label: string; selected: boolean }[];
      answerLabel: string;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      points: number;
      answerLabel: string;
    };

type QuestionGradeDraft = {
  points: string;
  feedback: string;
};

function normalizeCourse(value: AssessmentRow["courses"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeSection(value: AssessmentRow["course_sections"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function badgeTypeClass(type: "Quiz" | "Devoir" | "Examen") {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function mapType(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function badgeStatus(status?: SubmissionStatus) {
  if (status === "published") return "sn-badge sn-badge-green";
  if (status === "graded") return "sn-badge sn-badge-green";
  if (status === "submitted") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusLabel(status?: SubmissionStatus) {
  if (status === "in_progress") return "En cours";
  if (status === "submitted") return "Soumis";
  if (status === "graded") return "Corrigé";
  if (status === "published") return "Publié";
  return "—";
}

function parseLocalizedNumber(value: string) {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(n, max));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatPoints(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return "[Circular]";
    seen.add(v as object);

    if (Array.isArray(v)) return v.map(walk);

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = walk(obj[key]);
    return out;
  };

  try {
    return JSON.stringify(walk(value));
  } catch {
    return "";
  }
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

export default function TeacherGradingDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const studentId = searchParams.get("studentId") || "";

  const [assessment, setAssessment] = useState<AssessmentRow | null>(null);
  const [submission, setSubmission] = useState<SubmissionRow | null>(null);
  const [student, setStudent] = useState<ProfileRow | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [studentClassLabel, setStudentClassLabel] = useState("Classe non assignée");

  const [questionGrades, setQuestionGrades] = useState<Record<string, QuestionGradeDraft>>({});
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initialDraftRef = useRef("");

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError("Évaluation introuvable.");
      setLoading(false);
      return;
    }

    if (!studentId) {
      setError("Élève introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setError("La correction réelle n’est pas disponible en mode démo.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [assessmentResult, submissionResult, studentResult] = await Promise.all([
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
          .select(`
            id,
            assessment_id,
            student_id,
            submitted_at,
            status,
            score,
            feedback
          `)
          .eq("assessment_id", id)
          .eq("student_id", studentId)
          .maybeSingle(),

        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", studentId)
          .maybeSingle(),
      ]);

      if (assessmentResult.error) throw assessmentResult.error;
      if (submissionResult.error) throw submissionResult.error;
      if (studentResult.error) throw studentResult.error;

      const assessmentData = assessmentResult.data as AssessmentRow;
      const submissionData = submissionResult.data as SubmissionRow | null;
      const studentData = studentResult.data as ProfileRow | null;

      if (!submissionData) {
        setAssessment(assessmentData);
        setSubmission(null);
        setStudent(studentData);
        setQuestions([]);
        setQuestionGrades({});
        setStudentClassLabel("Classe non assignée");
        setError("Aucune soumission trouvée pour cet élève.");
        return;
      }

      const { data: classStudentsData, error: classStudentsError } = await supabase
        .from("class_students")
        .select("student_id, class_id")
        .eq("student_id", studentId);

      if (classStudentsError) throw classStudentsError;

      const classStudents = (classStudentsData ?? []) as ClassStudentRow[];
      const classIds = Array.from(new Set(classStudents.map((row) => row.class_id)));

      let computedClassLabel = "Classe non assignée";

      if (classIds.length > 0) {
        const { data: classesData, error: classesError } = await supabase
          .from("classes")
          .select("id, name, school_year")
          .in("id", classIds);

        if (classesError) throw classesError;

        const classes = (classesData ?? []) as ClassRow[];
        const firstClass = classes[0];
        if (firstClass) {
          computedClassLabel = `${firstClass.name} (${firstClass.school_year})`;
        }
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
        const { data: choiceRowsData, error: choicesError } = await supabase
          .from("quiz_choices")
          .select("id, question_id, choice_text, order_index")
          .in("question_id", questionIds);

        if (choicesError) throw choicesError;

        choiceRows = sortChoices((choiceRowsData ?? []) as QuizChoiceRow[]);
      }

      const { data: answerRowsData, error: answersError } = await supabase
        .from("submission_answers")
        .select("question_id, answer_text, choice_id")
        .eq("submission_id", submissionData.id);

      if (answersError) throw answersError;

      const { data: questionGradesData, error: questionGradesError } = await supabase
        .from("submission_question_grades")
        .select("question_id, points_awarded, max_points, feedback")
        .eq("submission_id", submissionData.id);

      if (questionGradesError) throw questionGradesError;

      const answerRows = (answerRowsData ?? []) as SubmissionAnswerRow[];
      const gradeRows = (questionGradesData ?? []) as SubmissionQuestionGradeRow[];

      const answerByQuestionId = answerRows.reduce<Record<string, SubmissionAnswerRow>>((acc, row) => {
        acc[row.question_id] = row;
        return acc;
      }, {});

      const gradeByQuestionId = gradeRows.reduce<Record<string, SubmissionQuestionGradeRow>>((acc, row) => {
        acc[row.question_id] = row;
        return acc;
      }, {});

      const defaultPointsPerQuestion =
        assessmentData.max_score && questionRows.length > 0
          ? Math.max(1, round2(Number(assessmentData.max_score) / questionRows.length))
          : 1;

      const mappedQuestions: QuestionView[] =
        questionRows.length > 0
          ? questionRows.map((q) => {
              const answer = answerByQuestionId[q.id];
              const existingGrade = gradeByQuestionId[q.id];
              const points = round2(existingGrade?.max_points ?? defaultPointsPerQuestion);

              if (q.question_type === "mcq" || q.question_type === "true_false") {
                const choices =
                  q.question_type === "true_false"
                    ? [
                        {
                          id: `${q.id}__true`,
                          label: "Vrai",
                          selected: answer?.answer_text === "Vrai",
                        },
                        {
                          id: `${q.id}__false`,
                          label: "Faux",
                          selected: answer?.answer_text === "Faux",
                        },
                      ]
                    : sortChoices(choiceRows.filter((choice) => choice.question_id === q.id)).map(
                        (choice) => ({
                          id: choice.id,
                          label: choice.choice_text,
                          selected: answer?.choice_id === choice.id,
                        })
                      );

                const answerLabel =
                  q.question_type === "true_false"
                    ? answer?.answer_text || "Aucune réponse."
                    : choices.find((c) => c.selected)?.label || "Aucune réponse.";

                return {
                  id: q.id,
                  type: "mcq" as const,
                  prompt: q.prompt,
                  points,
                  choices,
                  answerLabel,
                };
              }

              return {
                id: q.id,
                type: "short" as const,
                prompt: q.prompt,
                points,
                answerLabel: answer?.answer_text || "Aucune réponse.",
              };
            })
          : [];

      const initialQuestionGrades = mappedQuestions.reduce<Record<string, QuestionGradeDraft>>(
        (acc, question) => {
          const existingGrade = gradeByQuestionId[question.id];
          acc[question.id] = {
            points:
              existingGrade?.points_awarded !== null &&
              existingGrade?.points_awarded !== undefined
                ? String(existingGrade.points_awarded)
                : "",
            feedback: existingGrade?.feedback ?? "",
          };
          return acc;
        },
        {}
      );

      setAssessment(assessmentData);
      setSubmission(submissionData);
      setStudent(studentData);
      setQuestions(mappedQuestions);
      setQuestionGrades(initialQuestionGrades);
      setStudentClassLabel(computedClassLabel);
      setFeedback(submissionData.feedback ?? "");

      initialDraftRef.current = stableStringify({
        feedback: (submissionData.feedback ?? "").trim(),
        questionGrades: Object.fromEntries(
          Object.entries(initialQuestionGrades).map(([questionId, grade]) => [
            questionId,
            {
              points: grade.points.trim(),
              feedback: grade.feedback.trim(),
            },
          ])
        ),
      });
    } catch (err) {
      console.error("[TeacherGradingDetail] loadDetail error:", err);
      setError(safeErrorMessage(err, "Impossible de charger le détail de la copie."));
      setAssessment(null);
      setSubmission(null);
      setStudent(null);
      setQuestions([]);
      setQuestionGrades({});
      setStudentClassLabel("Classe non assignée");
    } finally {
      setLoading(false);
    }
  }, [id, studentId, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadDetail();
  }, [authLoading, loadDetail]);

  const currentDraftFingerprint = useMemo(() => {
    return stableStringify({
      feedback: feedback.trim(),
      questionGrades: Object.fromEntries(
        Object.entries(questionGrades).map(([questionId, grade]) => [
          questionId,
          {
            points: grade.points.trim(),
            feedback: grade.feedback.trim(),
          },
        ])
      ),
    });
  }, [feedback, questionGrades]);

  const hasUnsaved = useMemo(() => {
    if (!initialDraftRef.current) return false;
    return currentDraftFingerprint !== initialDraftRef.current;
  }, [currentDraftFingerprint]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const computedTotal = useMemo(() => {
    return round2(
      questions.reduce((sum, question) => {
        const raw = questionGrades[question.id]?.points ?? "";
        const parsed = parseLocalizedNumber(raw);
        if (typeof parsed !== "number") return sum;
        return sum + clamp(parsed, 0, question.points);
      }, 0)
    );
  }, [questions, questionGrades]);

  const maxScore = Number(assessment?.max_score ?? 20);
  const canSave = !saving && submission !== null && hasUnsaved;

  function setQuestionPoints(questionId: string, value: string) {
    setQuestionGrades((prev) => ({
      ...prev,
      [questionId]: {
        points: value,
        feedback: prev[questionId]?.feedback ?? "",
      },
    }));
  }

  function setQuestionFeedback(questionId: string, value: string) {
    setQuestionGrades((prev) => ({
      ...prev,
      [questionId]: {
        points: prev[questionId]?.points ?? "",
        feedback: value,
      },
    }));
  }

  function handleBack() {
    if (hasUnsaved) {
      const ok = window.confirm("Tu as des modifications non enregistrées. Quitter quand même ?");
      if (!ok) return;
    }

    if (submission?.assessment_id) {
      navigate(`/app/teacher/grading?assessmentId=${encodeURIComponent(submission.assessment_id)}`);
      return;
    }

    navigate("/app/teacher/grading");
  }

  async function onSaveGrade() {
    if (!submission || saving || !user) return;

    try {
      setSaving(true);

      // 1. Upsert des notes par question
      const perQuestionPayload = questions.map((question) => {
        const rawPoints = questionGrades[question.id]?.points ?? "";
        const parsedPoints = parseLocalizedNumber(rawPoints);

        return {
          submission_id: submission.id,
          question_id: question.id,
          points_awarded:
            typeof parsedPoints === "number"
              ? round2(clamp(parsedPoints, 0, question.points))
              : null,
          max_points: round2(question.points),
          feedback: questionGrades[question.id]?.feedback.trim() || null,
          graded_by: user.id,
        };
      });

      const { error: upsertError } = await supabase
        .from("submission_question_grades")
        .upsert(perQuestionPayload, {
          onConflict: "submission_id,question_id",
        });

      if (upsertError) throw upsertError;

      // 2. RPC sécurisé (remplace update manuel)
      const { error: rpcError } = await supabase.rpc("mark_submission_as_graded", {
        p_submission_id: submission.id,
        p_feedback: feedback.trim() || null,
      });

      if (rpcError) throw rpcError;

      initialDraftRef.current = currentDraftFingerprint;

      alert("✅ Correction enregistrée");

      navigate(
        `/app/teacher/grading?assessmentId=${encodeURIComponent(submission.assessment_id)}`,
        { replace: true }
      );
    } catch (err) {
      console.error(err);
      alert(safeErrorMessage(err, "Erreur enregistrement"));
    } finally {
      setSaving(false);
    }
  }

  async function onPublishGrade() {
    if (!submission || saving) return;

    const ok = window.confirm(
      "Publier cette correction ? L’élève pourra voir sa note et le feedback."
    );
    if (!ok) return;

    try {
      setSaving(true);

      const { error } = await supabase.rpc("publish_assessment_submission", {
        p_submission_id: submission.id,
      });

      if (error) throw error;

      alert("✅ Correction publiée");

      navigate(
        `/app/teacher/grading?assessmentId=${encodeURIComponent(submission.assessment_id)}`,
        { replace: true }
      );
    } catch (err) {
      console.error(err);
      alert(safeErrorMessage(err, "Erreur publication"));
    } finally {
      setSaving(false);
    }
  }

  const assessmentType = assessment ? mapType(assessment.type) : "Quiz";
  const courseTitle = assessment ? normalizeCourse(assessment.courses)?.title ?? "Cours" : "Cours";
  const sectionTitle = assessment
    ? normalizeSection(assessment.course_sections)?.title ?? "Sans section"
    : "Sans section";

  const studentDisplayName = student?.full_name?.trim() || "Élève";
  const isLoading = authLoading || loading;

  if (!id) {
    return (
      <div className="sn-card p-6 space-y-3">
        <div className="text-lg font-semibold">Correction</div>
        <div className="text-sm text-gray-500">Évaluation introuvable.</div>
        <button
          className="sn-btn-primary sn-press w-fit"
          onClick={() => navigate("/app/teacher/grading")}
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
          <div className="text-xl font-semibold">Correction</div>
          <div className="text-sm text-gray-500">
            <span className={badgeTypeClass(assessmentType)}>{assessmentType}</span>
            <span className="ml-2">{assessment?.title ?? "Évaluation"}</span> • {courseTitle} •{" "}
            {sectionTitle}
          </div>

          {submission && (
            <div className="mt-2 text-xs text-gray-500">
              Soumis : {formatDateTime(submission.submitted_at)}
            </div>
          )}
        </div>

        <button className="sn-btn-ghost sn-press" onClick={handleBack}>
          ← Retour
        </button>
      </div>

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="sn-card p-4 space-y-3 animate-pulse">
            <div className="h-5 w-1/2 rounded bg-gray-200" />
            <div className="h-16 rounded bg-gray-100" />
          </div>
          <div className="lg:col-span-2 sn-card p-5 space-y-4 animate-pulse">
            <div className="h-5 w-1/3 rounded bg-gray-200" />
            <div className="h-20 rounded bg-gray-100" />
            <div className="h-20 rounded bg-gray-100" />
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">{error}</div>
      )}

      {!isLoading && !error && submission && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="sn-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Copie</div>
              <span className={badgeStatus(submission.status)}>{statusLabel(submission.status)}</span>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="font-semibold text-gray-900">{studentDisplayName}</div>
              <div className="mt-1 text-sm text-gray-600">{studentClassLabel}</div>
              <div className="mt-2 text-xs text-gray-500">
                Soumission : {formatDateTime(submission.submitted_at)}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Notation</div>
                <span className="sn-badge sn-badge-gray">Max {formatPoints(maxScore)} pts</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Score total calculé</label>
                <input
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none"
                  value={formatPoints(computedTotal)}
                  readOnly
                />
                <div className="text-xs text-gray-500">
                  Le total est calculé automatiquement à partir des notes par question.
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700">Feedback global</label>
                <textarea
                  className="w-full min-h-[160px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="Commentaire global pour l’élève..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={saving}
                />
              </div>

              {hasUnsaved && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Modifications non enregistrées.
                </div>
              )}

              <button
                className="sn-btn-primary sn-press w-full"
                onClick={onSaveGrade}
                disabled={!canSave}
              >
                {saving ? "Enregistrement..." : "Enregistrer correction"}
              </button>
              {submission.status === "graded" && (
                <button
                  className="sn-btn-primary sn-press w-full"
                  onClick={onPublishGrade}
                  disabled={saving || hasUnsaved}
                  type="button"
                >
                  {saving ? "Publication..." : "Publier la correction"}
                </button>
              )}
            </div>

            <div className="text-xs text-gray-500">
              *La note globale est calculée automatiquement depuis les notes question par question.*
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="sn-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Réponses de l’élève</div>
                <span className="sn-badge sn-badge-gray">{questions.length} question(s)</span>
              </div>

              {questions.length === 0 ? (
                <div className="text-sm text-gray-500">Aucune réponse détaillée disponible.</div>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, idx) => {
                    const gradeDraft = questionGrades[question.id] ?? { points: "", feedback: "" };
                    const parsedDraft = parseLocalizedNumber(gradeDraft.points);
                    const clampedPreview =
                      typeof parsedDraft === "number"
                        ? round2(clamp(parsedDraft, 0, question.points))
                        : null;

                    return (
                      <div
                        key={question.id}
                        className="rounded-2xl border border-gray-100 p-4 space-y-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-500">
                              Question {idx + 1} • {formatPoints(question.points)} pts
                            </div>
                            <div className="font-semibold text-gray-900">{question.prompt}</div>
                          </div>

                          <span className="sn-badge sn-badge-gray">
                            {question.type === "mcq" ? "QCM / Vrai-Faux" : "Réponse ouverte"}
                          </span>
                        </div>

                        {question.type === "mcq" ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {question.choices.map((choice) => (
                              <div
                                key={choice.id}
                                className={`rounded-2xl border p-3 text-left ${
                                  choice.selected
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-gray-100 bg-white"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-gray-900">{choice.label}</div>
                                  {choice.selected && (
                                    <span className="sn-badge sn-badge-blue">Réponse élève</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-gray-900 whitespace-pre-wrap">
                            {question.answerLabel}
                          </div>
                        )}

                        {question.type === "mcq" && question.answerLabel === "Aucune réponse." && (
                          <div className="text-xs text-gray-500">
                            L’élève n’a sélectionné aucune proposition.
                          </div>
                        )}

                        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4 space-y-3">
                          <div className="font-semibold text-sm text-gray-900">Correction de la question</div>

                          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-gray-700">
                                Note attribuée
                              </label>
                              <input
                                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                inputMode="decimal"
                                placeholder={`0 - ${formatPoints(question.points)}`}
                                value={gradeDraft.points}
                                onChange={(e) => setQuestionPoints(question.id, e.target.value)}
                                disabled={saving}
                              />
                              <div className="text-xs text-gray-500">
                                Max : {formatPoints(question.points)} pts
                              </div>
                              {clampedPreview !== null && (
                                <div className="text-xs text-blue-700">
                                  Valeur retenue : {formatPoints(clampedPreview)} pt(s)
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs font-semibold text-gray-700">
                                Feedback question
                              </label>
                              <textarea
                                className="w-full min-h-[92px] rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="Commentaire précis sur cette réponse..."
                                value={gradeDraft.feedback}
                                onChange={(e) => setQuestionFeedback(question.id, e.target.value)}
                                disabled={saving}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}