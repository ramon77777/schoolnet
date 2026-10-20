import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

/* =========================================================
   Types
========================================================= */

type AssessmentType = "quiz" | "assignment" | "exam";

type SubmissionStatus =
  | "in_progress"
  | "submitted"
  | "graded"
  | "published";

type ExamContentMode =
  | "online_questions"
  | "file_and_questions"
  | "file_only"
  | null;

type StudentView = {
  id: string;
  full_name: string | null;
  class_name: string | null;
};

type AssessmentView = {
  id: string;
  title: string;
  description: string | null;

  type: AssessmentType;
  status: string;

  due_at: string | null;

  time_limit_minutes: number | null;
  max_score: number | null;

  course_id: string;
  section_id: string | null;

  course_title: string | null;
  section_title: string | null;

  submission_mode: string | null;

  exam_content_mode: ExamContentMode;
  exam_window_minutes: number | null;
  exam_file_max_score: number | null;
};

type SubmissionView = {
  id: string;

  assessment_id: string;
  student_id: string;

  status: SubmissionStatus;

  started_at: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  published_at: string | null;

  score: number | null;
  feedback: string | null;

  freeform_answer: string | null;
  freeform_score: number | null;
  freeform_feedback: string | null;
};

type ChoiceView = {
  id: string;
  label: string;
  selected: boolean;
  is_correct: boolean;
};

type QuestionView = {
  id: string;

  question_type:
    | "mcq"
    | "true_false"
    | "short_text";

  prompt: string;
  order_index: number;

  answer_text: string | null;
  choice_id: string | null;
  answer_is_correct: boolean | null;

  points_awarded: number | null;
  max_points: number | null;
  feedback: string | null;

  choices: ChoiceView[];
};

type ParentAssessmentDetailResponse = {
  found: boolean;
  reason?: string;

  student?: StudentView;
  assessment?: AssessmentView;
  submission?: SubmissionView | null;

  questions?: QuestionView[];
};

type ParentViewStatus =
  | "none"
  | "submitted"
  | "graded"
  | "published";

/* =========================================================
   Helpers
========================================================= */

function safeErrorMessage(
  error: unknown,
  fallback: string
) {
  if (
    typeof error === "object" &&
    error !== null
  ) {
    const value = error as {
      message?: string;
      details?: string;
      hint?: string;
      error_description?: string;
    };

    return (
      value.message ||
      value.error_description ||
      value.details ||
      value.hint ||
      fallback
    );
  }

  return fallback;
}

function typeLabel(type?: AssessmentType) {
  if (type === "exam") return "Examen";
  if (type === "assignment") return "Devoir";
  return "Quiz";
}

function badgeTypeClass(
  type?: AssessmentType
) {
  if (type === "exam") {
    return "sn-badge sn-badge-red";
  }

  if (type === "assignment") {
    return "sn-badge sn-badge-blue";
  }

  return "sn-badge sn-badge-gray";
}

function getParentViewStatus(
  submission?: SubmissionView | null
): ParentViewStatus {
  if (!submission) {
    return "none";
  }

  if (submission.status === "published") {
    return "published";
  }

  if (submission.status === "graded") {
    return "graded";
  }

  if (submission.status === "submitted") {
    return "submitted";
  }

  /*
   * in_progress n'est PAS considéré comme soumis.
   */
  return "none";
}

function statusLabel(
  status: ParentViewStatus
) {
  if (status === "published") {
    return "Publié";
  }

  if (status === "graded") {
    return "Corrigé (non publié)";
  }

  if (status === "submitted") {
    return "En attente";
  }

  return "Non soumis";
}

function statusBadgeClass(
  status: ParentViewStatus
) {
  if (status === "published") {
    return "sn-badge sn-badge-green";
  }

  if (status === "graded") {
    return "sn-badge sn-badge-blue";
  }

  if (status === "submitted") {
    return "sn-badge sn-badge-gray";
  }

  return "sn-badge sn-badge-gray";
}

function formatPoints(
  value?: number | null
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(
    Math.round(value * 100) / 100
  ).replace(".", ",");
}

function formatDate(
  value?: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStudentAnswerLabel(
  question: QuestionView
) {
  if (
    question.question_type === "mcq"
  ) {
    const selected =
      question.choices.find(
        (choice) => choice.selected
      );

    return (
      selected?.label ||
      "Aucune réponse."
    );
  }

  const answer =
    question.answer_text?.trim();

  return (
    answer ||
    "Aucune réponse."
  );
}

function isQuestionAnswered(
  question: QuestionView
) {
  if (
    question.question_type === "mcq"
  ) {
    return question.choices.some(
      (choice) => choice.selected
    );
  }

  return Boolean(
    question.answer_text?.trim()
  );
}

/* =========================================================
   Page
========================================================= */

export default function ParentResultsDetail() {
  const navigate = useNavigate();

  const { id } =
    useParams<{ id: string }>();

  const [searchParams] =
    useSearchParams();

  const {
    user,
    loading: authLoading,
  } = useAuth();

  const childId =
    searchParams.get("childId");

  const [student, setStudent] =
    useState<StudentView | null>(null);

  const [
    assessment,
    setAssessment,
  ] =
    useState<AssessmentView | null>(
      null
    );

  const [
    submission,
    setSubmission,
  ] =
    useState<SubmissionView | null>(
      null
    );

  const [
    questions,
    setQuestions,
  ] =
    useState<QuestionView[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [
    teacherOpen,
    setTeacherOpen,
  ] =
    useState(false);

  /* =======================================================
     Navigation
  ======================================================= */

  const backToResults =
    useCallback(() => {
      const query = childId
        ? `?childId=${encodeURIComponent(
            childId
          )}`
        : "";

      navigate(
        `/app/parent/results${query}`
      );
    }, [navigate, childId]);

  /* =======================================================
     Chargement Supabase
  ======================================================= */

  const loadResult =
    useCallback(async () => {
      if (!id) {
        setError(
          "Évaluation introuvable."
        );

        setLoading(false);
        return;
      }

      if (!childId) {
        setError(
          "Aucun enfant n’a été sélectionné."
        );

        setLoading(false);
        return;
      }

      if (
        !user ||
        user.isDemo
      ) {
        setError(
          "Le détail réel n’est pas disponible en mode démo."
        );

        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          "get_parent_child_assessment_detail",
          {
            p_assessment_id: id,
            p_child_id: childId,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        const response =
          data as
            | ParentAssessmentDetailResponse
            | null;

        if (
          !response ||
          response.found !== true
        ) {
          const reason =
            response?.reason;

          if (
            reason ===
            "student_not_found"
          ) {
            throw new Error(
              "Profil élève introuvable."
            );
          }

          if (
            reason ===
            "assessment_not_accessible"
          ) {
            throw new Error(
              "Cette évaluation n’est pas accessible pour cet enfant."
            );
          }

          throw new Error(
            "Résultat introuvable."
          );
        }

        setStudent(
          response.student ?? null
        );

        setAssessment(
          response.assessment ?? null
        );

        setSubmission(
          response.submission ?? null
        );

        setQuestions(
          response.questions ?? []
        );
      } catch (err) {
        console.error(
          "[ParentResultsDetail] loadResult error:",
          err
        );

        setStudent(null);
        setAssessment(null);
        setSubmission(null);
        setQuestions([]);

        setError(
          safeErrorMessage(
            err,
            "Impossible de charger le détail du résultat."
          )
        );
      } finally {
        setLoading(false);
      }
    }, [
      id,
      childId,
      user,
    ]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadResult();
  }, [
    authLoading,
    loadResult,
  ]);

  /* =======================================================
     Etat métier
  ======================================================= */

  const isLoading =
    authLoading || loading;

  const viewStatus =
    useMemo(
      () =>
        getParentViewStatus(
          submission
        ),
      [submission]
    );

  const isPublished =
    viewStatus === "published";

  useEffect(() => {
    setTeacherOpen(isPublished);
  }, [isPublished]);

  const hasExamFilePart =
    assessment?.type === "exam" &&
    (
      assessment.exam_content_mode ===
        "file_and_questions" ||
      assessment.exam_content_mode ===
        "file_only"
    );

  const isFileOnlyExam =
    assessment?.type === "exam" &&
    assessment.exam_content_mode ===
      "file_only";

  const summary =
    useMemo(() => {
      let corrected = 0;
      let unanswered = 0;
      let answered = 0;

      for (
        const question of questions
      ) {
        const hasAnswer =
          isQuestionAnswered(
            question
          );

        if (!hasAnswer) {
          unanswered += 1;
          continue;
        }

        answered += 1;

        if (
          question.points_awarded !==
            null &&
          question.points_awarded !==
            undefined
        ) {
          corrected += 1;
        }
      }

      return {
        corrected,
        answered,
        unanswered,
      };
    }, [questions]);

  const displayedScore =
    isPublished && assessment
      ? `${formatPoints(
          submission?.score
        )} / ${formatPoints(
          assessment.max_score
        )}`
      : "—";

  const subtitle = assessment
    ? [
        assessment.title,
        student?.full_name ||
          "Élève",
        assessment.course_title ||
          "Cours",
      ]
        .filter(Boolean)
        .join(" • ")
    : "Résultat";

  /* =======================================================
     Pas d'id
  ======================================================= */

  if (!id) {
    return (
      <div className="sn-card p-6 space-y-4">
        <div>
          <div className="text-lg font-semibold">
            Détail du résultat
          </div>

          <div className="mt-1 text-sm text-gray-500">
            Évaluation introuvable.
          </div>
        </div>

        <button
          type="button"
          className="sn-btn-primary sn-press w-fit"
          onClick={backToResults}
        >
          ← Retour aux résultats
        </button>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="space-y-6">
      {/* Header */}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Détail du résultat
          </div>

          <div className="text-sm text-gray-500">
            {subtitle}
          </div>
        </div>

        <button
          type="button"
          className="sn-btn-ghost sn-press"
          onClick={backToResults}
        >
          ← Retour aux résultats
        </button>
      </div>

      {/* Chargement */}

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

      {/* Erreur */}

      {!isLoading && error && (
        <div className="sn-card p-5 border border-red-200 bg-red-50">
          <div className="font-semibold text-red-800">
            Impossible d’afficher ce résultat
          </div>

          <div className="mt-1 text-sm text-red-700">
            {error}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="sn-btn-primary sn-press"
              onClick={() =>
                void loadResult()
              }
            >
              Réessayer
            </button>

            <button
              type="button"
              className="sn-btn-ghost sn-press"
              onClick={backToResults}
            >
              Retour
            </button>
          </div>
        </div>
      )}

      {/* Contenu */}

      {!isLoading &&
        !error &&
        assessment && (
          <>
            {/* Résumé principal */}

            <div className="sn-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={badgeTypeClass(
                      assessment.type
                    )}
                  >
                    {typeLabel(
                      assessment.type
                    )}
                  </span>

                  {assessment.course_title && (
                    <span className="sn-badge sn-badge-gray">
                      {
                        assessment.course_title
                      }
                    </span>
                  )}

                  {student?.class_name && (
                    <span className="sn-badge sn-badge-gray">
                      {
                        student.class_name
                      }
                    </span>
                  )}

                  <span
                    className={statusBadgeClass(
                      viewStatus
                    )}
                  >
                    {statusLabel(
                      viewStatus
                    )}
                  </span>

                  {isPublished && (
                    <span className="sn-badge sn-badge-green">
                      Visible Parent
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-xs text-gray-500">
                    Score
                  </div>

                  <div className="text-2xl font-bold text-gray-900">
                    {displayedScore}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    Élève
                  </div>

                  <div className="mt-1 font-semibold">
                    {student?.full_name ||
                      "Élève"}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    Soumis le
                  </div>

                  <div className="mt-1 font-semibold">
                    {viewStatus ===
                      "none"
                      ? "—"
                      : formatDate(
                          submission?.submitted_at
                        )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">
                    Échéance
                  </div>

                  <div className="mt-1 font-semibold">
                    {formatDate(
                      assessment.due_at
                    )}
                  </div>
                </div>
              </div>

              {/* Non soumis */}

              {viewStatus === "none" && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="font-semibold text-gray-900">
                    Aucune soumission
                  </div>

                  <div className="mt-1 text-sm text-gray-600">
                    Cet élève n’a pas
                    encore soumis cette
                    évaluation.
                  </div>
                </div>
              )}

              {/* Soumis, pas corrigé */}

              {viewStatus ===
                "submitted" && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                  <div className="font-semibold text-blue-900">
                    ⏳ Correction en
                    attente
                  </div>

                  <div className="mt-1 text-sm text-blue-800">
                    L’évaluation a bien
                    été soumise. La note,
                    les bonnes réponses
                    et les commentaires
                    seront disponibles
                    après correction et
                    publication par
                    l’enseignant.
                  </div>
                </div>
              )}

              {/* Corrigé non publié */}

              {viewStatus === "graded" && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
                  <div className="font-semibold text-amber-900">
                    Correction non
                    publiée
                  </div>

                  <div className="mt-1 text-sm text-amber-800">
                    L’enseignant a
                    corrigé cette
                    évaluation, mais la
                    correction n’a pas
                    encore été publiée.
                    La note, les bonnes
                    réponses et les
                    commentaires restent
                    donc masqués.
                  </div>
                </div>
              )}

              {/* Résumé publié */}

              {isPublished &&
                !isFileOnlyExam && (
                  <div className="rounded-2xl border border-gray-100 bg-white p-4">
                    <div className="text-sm font-semibold text-gray-900">
                      Résumé pédagogique
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl border border-green-100 bg-green-50 p-3">
                        <div className="text-xs text-gray-600">
                          Questions
                          corrigées
                        </div>

                        <div className="text-lg font-bold text-gray-900">
                          ✅{" "}
                          {
                            summary.corrected
                          }
                        </div>
                      </div>

                      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                        <div className="text-xs text-gray-600">
                          Répondues
                        </div>

                        <div className="text-lg font-bold text-gray-900">
                          📝{" "}
                          {
                            summary.answered
                          }
                        </div>
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                        <div className="text-xs text-gray-600">
                          Non répondues
                        </div>

                        <div className="text-lg font-bold text-gray-900">
                          ⚪{" "}
                          {
                            summary.unanswered
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {/* Commentaire global */}

              {isPublished && (
                <div className="rounded-2xl border border-gray-100 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        Commentaire
                        enseignant
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        Correction publiée
                        par l’enseignant.
                      </div>
                    </div>

                    <button
                      type="button"
                      className="sn-btn-ghost sn-press"
                      aria-expanded={
                        teacherOpen
                      }
                      onClick={() =>
                        setTeacherOpen(
                          (current) =>
                            !current
                        )
                      }
                    >
                      {teacherOpen
                        ? "Masquer"
                        : "Afficher"}
                    </button>
                  </div>

                  <div
                    className={[
                      "transition-all duration-300 ease-out",
                      teacherOpen
                        ? "opacity-100 translate-y-0 mt-4 max-h-[900px]"
                        : "opacity-0 -translate-y-1 mt-0 max-h-0 overflow-hidden pointer-events-none",
                    ].join(" ")}
                  >
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-800 whitespace-pre-wrap">
                      {submission
                        ?.feedback ||
                        "Aucun commentaire global."}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sujet fichier */}

            {isPublished &&
              hasExamFilePart && (
                <div className="sn-card p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">
                        Correction du
                        sujet fichier
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        Partie de
                        l’examen traitée
                        à partir du
                        document fourni
                        par
                        l’enseignant.
                      </div>
                    </div>

                    <span className="sn-badge sn-badge-blue">
                      Sujet fichier
                    </span>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                    <div className="mb-2 text-xs font-semibold text-gray-700">
                      Réponses de
                      l’élève
                    </div>

                    {submission
                      ?.freeform_answer ? (
                      <div
                        className="prose max-w-none text-sm text-gray-900"
                        dangerouslySetInnerHTML={{
                          __html:
                            submission.freeform_answer,
                        }}
                      />
                    ) : (
                      <div className="text-sm text-gray-500">
                        Aucune réponse
                        n’a été saisie
                        pour le sujet
                        fichier.
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                      <div className="text-xs text-gray-600">
                        Note obtenue
                      </div>

                      <div className="mt-1 text-xl font-bold text-gray-900">
                        {formatPoints(
                          submission
                            ?.freeform_score
                        )}{" "}
                        /{" "}
                        {formatPoints(
                          assessment.exam_file_max_score
                        )}{" "}
                        pts
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                      <div className="text-xs font-semibold text-gray-700">
                        Commentaire
                        enseignant
                      </div>

                      <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">
                        {submission
                          ?.freeform_feedback ||
                          "Aucun commentaire sur le sujet fichier."}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {/* Correction question par question */}

            {isPublished &&
              !isFileOnlyExam && (
                <div className="sn-card p-5 space-y-4">
                  <div>
                    <div className="font-semibold">
                      Correction détaillée
                    </div>

                    <div className="mt-1 text-sm text-gray-500">
                      Réponses de
                      l’élève, points
                      obtenus et
                      commentaires de
                      l’enseignant.
                    </div>
                  </div>

                  {questions.length ===
                  0 ? (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-500">
                      Aucune question
                      SchoolNet pour
                      cette évaluation.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {questions.map(
                        (
                          question,
                          index
                        ) => {
                          const answered =
                            isQuestionAnswered(
                              question
                            );

                          const answerLabel =
                            getStudentAnswerLabel(
                              question
                            );

                          return (
                            <div
                              key={
                                question.id
                              }
                              className="rounded-2xl border border-gray-100 p-4 space-y-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs text-gray-500">
                                    Question{" "}
                                    {index +
                                      1}

                                    {question.max_points !==
                                      null &&
                                      question.max_points !==
                                        undefined && (
                                        <>
                                          {" "}
                                          •{" "}
                                          {formatPoints(
                                            question.max_points
                                          )}{" "}
                                          pts
                                        </>
                                      )}

                                    {question.points_awarded !==
                                      null &&
                                      question.points_awarded !==
                                        undefined && (
                                        <>
                                          {" "}
                                          •
                                          Noté
                                          :{" "}
                                          {formatPoints(
                                            question.points_awarded
                                          )}
                                          /
                                          {formatPoints(
                                            question.max_points
                                          )}
                                        </>
                                      )}
                                  </div>

                                  <div
                                    className="prose max-w-none font-semibold text-gray-900"
                                    dangerouslySetInnerHTML={{
                                      __html:
                                        question.prompt,
                                    }}
                                  />
                                </div>

                                <span
                                  className={
                                    answered
                                      ? "sn-badge sn-badge-blue"
                                      : "sn-badge sn-badge-gray"
                                  }
                                >
                                  {answered
                                    ? "Répondu"
                                    : "Non répondu"}
                                </span>
                              </div>

                              {question.question_type ===
                                "mcq" ||
                              question.question_type ===
                                "true_false" ? (
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {question.choices.map(
                                    (
                                      choice
                                    ) => {
                                      const className =
                                        choice.selected &&
                                        choice.is_correct
                                          ? "border-green-500 bg-green-50"
                                          : choice.selected &&
                                            !choice.is_correct
                                          ? "border-red-300 bg-red-50"
                                          : !choice.selected &&
                                            choice.is_correct
                                          ? "border-green-200 bg-green-50/40"
                                          : "border-gray-100 bg-white";

                                      return (
                                        <div
                                          key={
                                            choice.id
                                          }
                                          className={`rounded-2xl border p-3 text-left ${className}`}
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm text-gray-900">
                                              {
                                                choice.label
                                              }
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                              {choice.is_correct && (
                                                <span className="sn-badge sn-badge-green">
                                                  Bonne
                                                </span>
                                              )}

                                              {choice.selected && (
                                                <span className="sn-badge sn-badge-blue">
                                                  Choisi
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              ) : (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-800">
                                  {answerLabel ===
                                  "Aucune réponse." ? (
                                    <div className="text-gray-500">
                                      Aucune
                                      réponse.
                                    </div>
                                  ) : (
                                    <div
                                      className="prose max-w-none"
                                      dangerouslySetInnerHTML={{
                                        __html:
                                          answerLabel,
                                      }}
                                    />
                                  )}
                                </div>
                              )}

                              {question.feedback && (
                                <div className="rounded-2xl border border-gray-100 bg-white p-3">
                                  <div className="mb-1 text-xs font-semibold text-gray-700">
                                    Commentaire
                                    enseignant
                                  </div>

                                  <div className="text-sm text-gray-800 whitespace-pre-wrap">
                                    {
                                      question.feedback
                                    }
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}

                  <div className="text-xs text-gray-500">
                    *Les notes, les
                    bonnes réponses et
                    les commentaires
                    détaillés sont
                    accessibles au
                    parent uniquement
                    après publication
                    par l’enseignant.*
                  </div>
                </div>
              )}
          </>
        )}
    </div>
  );
}
