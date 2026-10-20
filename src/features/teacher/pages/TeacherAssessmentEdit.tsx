import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";
import RichTextEditor from "@/components/editor/RichTextEditor";

type AssessmentTypeUi = "Quiz" | "Devoir" | "Examen";
type AssessmentTypeDb = "quiz" | "assignment" | "exam";
type DraftQuestionType = "mcq" | "true_false" | "short_text";
type AssessmentStatus = "draft" | "published" | "closed";

type ExamContentMode =
  | "online_questions"
  | "file_and_questions"
  | "file_only";

type CourseRow = {
  id: string;
  title: string;
  class_id: string | null;
};

type SectionRow = {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
};

type ClassRow = {
  id: string;
  name: string;
  school_year: string;
};

type CourseView = {
  id: string;
  title: string;
  classLabel: string;
  sections: {
    id: string;
    title: string;
  }[];
};

type AssessmentRow = {
  id: string;
  title: string;
  description: string | null;
  type: AssessmentTypeDb;

  submission_mode: "online" | "file_upload" | null;

  instruction_file_url: string | null;
  instruction_file_name: string | null;

  exam_content_mode: ExamContentMode | null;
  exam_window_minutes: number | null;
  shuffle_questions: boolean | null;

  due_at: string | null;
  time_limit_minutes: number | null;
  max_score: number | null;
  course_id: string;
  section_id: string | null;
  status: AssessmentStatus;
  created_by: string;
};

type QuizQuestionRow = {
  id: string;
  assessment_id: string;
  question_type: DraftQuestionType;
  prompt: string;
  order_index: number;
};

type QuizChoiceRow = {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean;
  order_index: number;
};

type DraftQuestion = {
  localId: string;
  dbId?: string;
  questionType: DraftQuestionType;
  prompt: string;
  choices: string[];
  correctChoiceIndex: number | null;
};

function toDbType(type: AssessmentTypeUi): AssessmentTypeDb {
  if (type === "Devoir") return "assignment";
  if (type === "Examen") return "exam";
  return "quiz";
}

function toUiType(type: AssessmentTypeDb): AssessmentTypeUi {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function formatDateTime(v: string) {
  const [date, time] = v.split("T");
  return `${date} • ${time}`;
}

function formatDateForInput(value: string | null) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function uid(prefix = "q") {
  return `${prefix}_${Math.random()
    .toString(16)
    .slice(2)}_${Date.now().toString(16)}`;
}

function safeErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null) {
    const maybe = err as {
      message?: string;
      error_description?: string;
      details?: string;
    };

    return (
      maybe.message ||
      maybe.error_description ||
      maybe.details ||
      fallback
    );
  }

  return fallback;
}

function makeQuestion(
  type: DraftQuestionType = "short_text"
): DraftQuestion {
  if (type === "mcq") {
    return {
      localId: uid("q"),
      questionType: "mcq",
      prompt: "",
      choices: ["", ""],
      correctChoiceIndex: 0,
    };
  }

  if (type === "true_false") {
    return {
      localId: uid("q"),
      questionType: "true_false",
      prompt: "",
      choices: ["Vrai", "Faux"],
      correctChoiceIndex: 0,
    };
  }

  return {
    localId: uid("q"),
    questionType: "short_text",
    prompt: "",
    choices: [],
    correctChoiceIndex: null,
  };
}

function mapStatusLabel(status: AssessmentStatus) {
  if (status === "published") return "Publié";
  if (status === "closed") return "Clôturé";
  return "Brouillon";
}

function examModeLabel(mode: ExamContentMode) {
  if (mode === "file_and_questions") return "Fichier + questions";
  if (mode === "file_only") return "Sujet fichier uniquement";
  return "Questions Schoolnet";
}

export default function TeacherAssessmentEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const [courses, setCourses] = useState<CourseView[]>([]);

  const [type, setType] =
    useState<AssessmentTypeUi>("Quiz");

  const [submissionMode, setSubmissionMode] = useState<
    "online" | "file_upload"
  >("online");

  const [examContentMode, setExamContentMode] =
    useState<ExamContentMode>("online_questions");

  const [instructionFileName, setInstructionFileName] =
    useState<string | null>(null);

  const [instructionFileUrl, setInstructionFileUrl] =
    useState<string | null>(null);

  const [instructionFile, setInstructionFile] =
    useState<File | null>(null);

  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(30);
  const [totalPoints, setTotalPoints] = useState(20);
  const [instructions, setInstructions] = useState("");

  const [windowMinutes, setWindowMinutes] = useState(60);
  const [shuffleQuestions, setShuffleQuestions] =
    useState(true);

  const [questions, setQuestions] =
    useState<DraftQuestion[]>([]);

  const [assessmentStatus, setAssessmentStatus] =
    useState<AssessmentStatus>("draft");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExam = type === "Examen";

  const isHomeworkFile =
    type === "Devoir" &&
    submissionMode === "file_upload";

  const examUsesFile =
    isExam &&
    (
      examContentMode === "file_and_questions" ||
      examContentMode === "file_only"
    );

  const examUsesQuestions =
    isExam &&
    examContentMode !== "file_only";

  const usesInstructionFile =
    isHomeworkFile || examUsesFile;

  const usesQuestions =
    !isHomeworkFile &&
    (!isExam || examUsesQuestions);

  const questionCount = usesQuestions
    ? questions.length
    : 0;

  const loadData = useCallback(async () => {
    if (!id) {
      setError("Évaluation introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setCourses([]);
      setQuestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [
        coursesResult,
        sectionsResult,
        classesResult,
        assessmentResult,
        questionsResult,
      ] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, class_id")
          .eq("created_by", user.id)
          .order("title", { ascending: true }),

        supabase
          .from("course_sections")
          .select("id, course_id, title, order_index")
          .order("order_index", { ascending: true }),

        supabase
          .from("classes")
          .select("id, name, school_year"),

        supabase
          .from("assessments")
          .select(
            `
            id,
            title,
            description,
            type,
            submission_mode,
            instruction_file_url,
            instruction_file_name,
            exam_content_mode,
            exam_window_minutes,
            shuffle_questions,
            due_at,
            time_limit_minutes,
            max_score,
            course_id,
            section_id,
            status,
            created_by
            `
          )
          .eq("id", id)
          .single(),

        supabase
          .from("quiz_questions")
          .select(
            "id, assessment_id, question_type, prompt, order_index"
          )
          .eq("assessment_id", id)
          .order("order_index", { ascending: true }),
      ]);

      if (coursesResult.error) throw coursesResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (classesResult.error) throw classesResult.error;
      if (assessmentResult.error) throw assessmentResult.error;
      if (questionsResult.error) throw questionsResult.error;

      const courseRows =
        (coursesResult.data ?? []) as CourseRow[];

      const sectionRows =
        (sectionsResult.data ?? []) as SectionRow[];

      const classRows =
        (classesResult.data ?? []) as ClassRow[];

      const assessmentRow =
        assessmentResult.data as AssessmentRow;

      const questionRows =
        (questionsResult.data ?? []) as QuizQuestionRow[];

      if (assessmentRow.created_by !== user.id) {
        setError(
          "Cette évaluation ne vous appartient pas."
        );
        setCourses([]);
        setQuestions([]);
        return;
      }

      const loadedExamContentMode: ExamContentMode =
        assessmentRow.type === "exam"
          ? assessmentRow.exam_content_mode ??
            "online_questions"
          : "online_questions";

      const loadedHomeworkFile =
        assessmentRow.type === "assignment" &&
        assessmentRow.submission_mode === "file_upload";

      const loadedUsesQuestions =
        !loadedHomeworkFile &&
        !(
          assessmentRow.type === "exam" &&
          loadedExamContentMode === "file_only"
        );

      const classById =
        classRows.reduce<Record<string, string>>(
          (acc, cls) => {
            acc[cls.id] =
              `${cls.name} (${cls.school_year})`;
            return acc;
          },
          {}
        );

      const mappedCourses: CourseView[] =
        courseRows.map((course) => ({
          id: course.id,
          title: course.title,
          classLabel: course.class_id
            ? classById[course.class_id] ??
              "Non assignée"
            : "Non assignée",
          sections: sectionRows
            .filter(
              (section) =>
                section.course_id === course.id
            )
            .sort(
              (a, b) =>
                a.order_index - b.order_index
            )
            .map((section) => ({
              id: section.id,
              title: section.title,
            })),
        }));

      const questionIds =
        questionRows.map((q) => q.id);

      let choiceRows: QuizChoiceRow[] = [];

      if (questionIds.length > 0) {
        const {
          data: choicesData,
          error: choicesError,
        } = await supabase
          .from("quiz_choices")
          .select(
            "id, question_id, choice_text, is_correct, order_index"
          )
          .in("question_id", questionIds)
          .order("order_index", {
            ascending: true,
          });

        if (choicesError) throw choicesError;

        choiceRows =
          (choicesData ?? []) as QuizChoiceRow[];
      }

      let mappedQuestions: DraftQuestion[] = [];

      if (loadedUsesQuestions) {
        mappedQuestions =
          questionRows.length > 0
            ? questionRows.map((question) => {
                if (
                  question.question_type === "mcq"
                ) {
                  const linkedChoices =
                    choiceRows
                      .filter(
                        (choice) =>
                          choice.question_id ===
                          question.id
                      )
                      .sort(
                        (a, b) =>
                          a.order_index -
                          b.order_index
                      );

                  const correctIndex =
                    linkedChoices.findIndex(
                      (choice) =>
                        choice.is_correct
                    );

                  return {
                    localId: uid("q"),
                    dbId: question.id,
                    questionType: "mcq",
                    prompt: question.prompt,
                    choices:
                      linkedChoices.length > 0
                        ? linkedChoices.map(
                            (choice) =>
                              choice.choice_text
                          )
                        : ["", ""],
                    correctChoiceIndex:
                      correctIndex >= 0
                        ? correctIndex
                        : null,
                  };
                }

                if (
                  question.question_type ===
                  "true_false"
                ) {
                  const tfChoices =
                    choiceRows
                      .filter(
                        (choice) =>
                          choice.question_id ===
                          question.id
                      )
                      .sort(
                        (a, b) =>
                          a.order_index -
                          b.order_index
                      );

                  const trueChoice =
                    tfChoices.find(
                      (choice) =>
                        choice.choice_text
                          .trim()
                          .toLowerCase() ===
                        "vrai"
                    );

                  const falseChoice =
                    tfChoices.find(
                      (choice) =>
                        choice.choice_text
                          .trim()
                          .toLowerCase() ===
                        "faux"
                    );

                  return {
                    localId: uid("q"),
                    dbId: question.id,
                    questionType:
                      "true_false",
                    prompt: question.prompt,
                    choices: ["Vrai", "Faux"],
                    correctChoiceIndex:
                      trueChoice?.is_correct
                        ? 0
                        : falseChoice?.is_correct
                        ? 1
                        : 0,
                  };
                }

                return {
                  localId: uid("q"),
                  dbId: question.id,
                  questionType: "short_text",
                  prompt: question.prompt,
                  choices: [],
                  correctChoiceIndex: null,
                };
              })
            : [makeQuestion("short_text")];
      }

      setCourses(mappedCourses);

      setAssessmentStatus(
        assessmentRow.status
      );

      setType(
        toUiType(assessmentRow.type)
      );

      setSubmissionMode(
        assessmentRow.submission_mode ===
          "file_upload"
          ? "file_upload"
          : "online"
      );

      setExamContentMode(
        loadedExamContentMode
      );

      setInstructionFileName(
        assessmentRow.instruction_file_name
      );

      setInstructionFileUrl(
        assessmentRow.instruction_file_url
      );

      setInstructionFile(null);

      setCourseId(
        assessmentRow.course_id
      );

      setSectionId(
        assessmentRow.section_id ?? ""
      );

      setTitle(
        assessmentRow.title
      );

      setDate(
        formatDateForInput(
          assessmentRow.due_at
        )
      );

      setDuration(
        assessmentRow.time_limit_minutes ??
          30
      );

      setTotalPoints(
        Number(
          assessmentRow.max_score ?? 20
        )
      );

      setInstructions(
        assessmentRow.description ?? ""
      );

      setQuestions(mappedQuestions);

      if (assessmentRow.type === "exam") {
        setWindowMinutes(
          assessmentRow.exam_window_minutes ??
            60
        );

        setShuffleQuestions(
          assessmentRow.shuffle_questions ??
            true
        );
      } else {
        setWindowMinutes(60);
        setShuffleQuestions(true);
      }
    } catch (err) {
      console.error(
        "[TeacherAssessmentEdit] loadData error:",
        err
      );

      setError(
        safeErrorMessage(
          err,
          "Impossible de charger l’évaluation à modifier."
        )
      );

      setCourses([]);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading, loadData]);

  const activeCourse = useMemo(
    () =>
      courses.find(
        (c) => c.id === courseId
      ) ?? null,
    [courses, courseId]
  );

  const activeSection = useMemo(
    () =>
      activeCourse?.sections.find(
        (s) => s.id === sectionId
      ) ??
      activeCourse?.sections[0] ??
      null,
    [activeCourse, sectionId]
  );

  function onCourseChange(
    nextCourseId: string
  ) {
    setCourseId(nextCourseId);

    const nextCourse =
      courses.find(
        (c) => c.id === nextCourseId
      );

    setSectionId(
      nextCourse?.sections[0]?.id || ""
    );
  }

  function changeExamContentMode(
    nextMode: ExamContentMode
  ) {
    setExamContentMode(nextMode);

    if (
      nextMode !== "file_only" &&
      questions.length === 0
    ) {
      setQuestions([
        makeQuestion("short_text"),
      ]);
    }
  }

  function addQuestion(
    questionType: DraftQuestionType
  ) {
    setQuestions((prev) => [
      ...prev,
      makeQuestion(questionType),
    ]);
  }

  function removeQuestion(
    localId: string
  ) {
    setQuestions((prev) =>
      prev.filter(
        (q) => q.localId !== localId
      )
    );
  }

  function updateQuestion(
    localId: string,
    patch: Partial<DraftQuestion>
  ) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.localId === localId
          ? { ...q, ...patch }
          : q
      )
    );
  }

  function changeQuestionType(
    localId: string,
    nextType: DraftQuestionType
  ) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId)
          return q;

        return {
          ...makeQuestion(nextType),
          localId,
          dbId: q.dbId,
          prompt: q.prompt,
        };
      })
    );
  }

  function addChoice(localId: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (
          q.localId !== localId ||
          q.questionType !== "mcq"
        ) {
          return q;
        }

        return {
          ...q,
          choices: [...q.choices, ""],
        };
      })
    );
  }

  function removeChoice(
    localId: string,
    index: number
  ) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (
          q.localId !== localId ||
          q.questionType !== "mcq"
        ) {
          return q;
        }

        const nextChoices =
          q.choices.filter(
            (_, i) => i !== index
          );

        let nextCorrectIndex =
          q.correctChoiceIndex;

        if (
          nextCorrectIndex === index
        ) {
          nextCorrectIndex = null;
        }

        if (
          typeof nextCorrectIndex ===
            "number" &&
          nextCorrectIndex > index
        ) {
          nextCorrectIndex -= 1;
        }

        return {
          ...q,
          choices: nextChoices,
          correctChoiceIndex:
            nextCorrectIndex,
        };
      })
    );
  }

  function updateChoice(
    localId: string,
    index: number,
    value: string
  ) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (
          q.localId !== localId ||
          q.questionType !== "mcq"
        ) {
          return q;
        }

        const nextChoices =
          [...q.choices];

        nextChoices[index] = value;

        return {
          ...q,
          choices: nextChoices,
        };
      })
    );
  }

  function richTextToPlainText(
    html: string
  ) {
    return html
      .replace(
        /<style[^>]*>.*?<\/style>/gis,
        ""
      )
      .replace(
        /<script[^>]*>.*?<\/script>/gis,
        ""
      )
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
  }

  function validateQuestions():
    | string
    | null {
    if (questions.length === 0) {
      return "Veuillez ajouter au moins une question.";
    }

    for (
      let i = 0;
      i < questions.length;
      i += 1
    ) {
      const q = questions[i];
      const label = `Question ${i + 1}`;

      if (
        !richTextToPlainText(
          q.prompt
        )
      ) {
        return `${label} : le libellé est obligatoire.`;
      }

      if (
        q.questionType === "mcq"
      ) {
        const cleanedChoices =
          q.choices
            .map((c) => c.trim())
            .filter(Boolean);

        if (
          cleanedChoices.length < 2
        ) {
          return `${label} : un QCM doit avoir au moins 2 choix non vides.`;
        }

        if (
          q.correctChoiceIndex ===
            null ||
          q.correctChoiceIndex < 0 ||
          q.correctChoiceIndex >=
            q.choices.length ||
          !q.choices[
            q.correctChoiceIndex
          ]?.trim()
        ) {
          return `${label} : veuillez sélectionner une bonne réponse valide.`;
        }
      }

      if (
        q.questionType ===
        "true_false"
      ) {
        if (
          q.correctChoiceIndex !== 0 &&
          q.correctChoiceIndex !== 1
        ) {
          return `${label} : veuillez choisir Vrai ou Faux comme bonne réponse.`;
        }
      }
    }

    return null;
  }

  async function submit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    if (!id) {
      setError(
        "Évaluation introuvable."
      );
      return;
    }

    if (!user || user.isDemo) {
      setError(
        "La modification réelle n’est pas disponible en mode démo."
      );
      return;
    }

    if (!courseId) {
      setError(
        "Veuillez sélectionner un cours."
      );
      return;
    }

    if (!title.trim()) {
      setError(
        "Veuillez renseigner un titre."
      );
      return;
    }

    if (
      !Number.isFinite(duration) ||
      duration <= 0
    ) {
      setError(
        "La durée doit être supérieure à 0."
      );
      return;
    }

    if (
      !Number.isFinite(totalPoints) ||
      totalPoints <= 0
    ) {
      setError(
        "La note totale doit être supérieure à 0."
      );
      return;
    }

    if (
      isExam &&
      (
        !Number.isFinite(windowMinutes) ||
        windowMinutes <= 0
      )
    ) {
      setError(
        "La fenêtre de passage doit être supérieure à 0 minute."
      );
      return;
    }

    if (
      usesInstructionFile &&
      !instructionFile &&
      !instructionFileUrl
    ) {
      setError(
        isExam
          ? "Veuillez sélectionner le fichier du sujet d’examen."
          : "Veuillez sélectionner le fichier du devoir maison."
      );
      return;
    }

    if (usesQuestions) {
      const questionsError =
        validateQuestions();

      if (questionsError) {
        setError(questionsError);
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);

      const dueAt = date
        ? new Date(date).toISOString()
        : null;

      let nextInstructionFileUrl =
        instructionFileUrl;

      let nextInstructionFileName =
        instructionFileName;

      if (
        usesInstructionFile &&
        instructionFile
      ) {
        const safeName =
          instructionFile.name.replace(
            /[^\w.\-() ]+/g,
            "_"
          );

        const filePath =
          `${user.id}/${Date.now()}-${safeName}`;

        const {
          error: uploadError,
        } = await supabase.storage
          .from(
            "assessment-instructions"
          )
          .upload(
            filePath,
            instructionFile,
            {
              upsert: false,
            }
          );

        if (uploadError)
          throw uploadError;

        const {
          data: publicUrlData,
        } = supabase.storage
          .from(
            "assessment-instructions"
          )
          .getPublicUrl(filePath);

        nextInstructionFileUrl =
          publicUrlData.publicUrl;

        nextInstructionFileName =
          instructionFile.name;
      }

      const {
        error: updateAssessmentError,
      } = await supabase
        .from("assessments")
        .update({
          course_id: courseId,
          section_id:
            sectionId || null,

          type: toDbType(type),

          title: title.trim(),

          description:
            richTextToPlainText(
              instructions
            )
              ? instructions.trim()
              : null,

          due_at: dueAt,

          time_limit_minutes:
            duration,

          max_score: totalPoints,

          submission_mode:
            type === "Devoir"
              ? submissionMode
              : "online",

          instruction_file_url:
            usesInstructionFile
              ? nextInstructionFileUrl
              : null,

          instruction_file_name:
            usesInstructionFile
              ? nextInstructionFileName
              : null,

          exam_content_mode:
            isExam
              ? examContentMode
              : null,

          exam_window_minutes:
            isExam
              ? windowMinutes
              : null,

          shuffle_questions:
            isExam
              ? examContentMode ===
                "file_only"
                ? false
                : shuffleQuestions
              : null,
        })
        .eq("id", id)
        .eq(
          "created_by",
          user.id
        );

      if (updateAssessmentError) {
        throw updateAssessmentError;
      }

      const {
        data: currentQuestionsData,
        error:
          currentQuestionsError,
      } = await supabase
        .from("quiz_questions")
        .select("id")
        .eq(
          "assessment_id",
          id
        );

      if (currentQuestionsError) {
        throw currentQuestionsError;
      }

      const currentQuestionIds =
        (
          (currentQuestionsData ??
            []) as {
            id: string;
          }[]
        ).map((row) => row.id);

      /*
       * Devoir maison fichier
       * ou examen "Sujet uniquement en fichier" :
       * aucune question Schoolnet ne doit rester.
       */
      if (!usesQuestions) {
        if (
          currentQuestionIds.length > 0
        ) {
          const {
            error:
              deleteChoicesError,
          } = await supabase
            .from("quiz_choices")
            .delete()
            .in(
              "question_id",
              currentQuestionIds
            );

          if (deleteChoicesError) {
            throw deleteChoicesError;
          }

          const {
            error:
              deleteQuestionsError,
          } = await supabase
            .from("quiz_questions")
            .delete()
            .in(
              "id",
              currentQuestionIds
            );

          if (
            deleteQuestionsError
          ) {
            throw deleteQuestionsError;
          }
        }

        navigate(
          `/app/teacher/assessments/${id}`
        );

        return;
      }

      const keptQuestionIds =
        questions
          .map(
            (question) =>
              question.dbId
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          );

      const questionIdsToDelete =
        currentQuestionIds.filter(
          (questionId) =>
            !keptQuestionIds.includes(
              questionId
            )
        );

      if (
        questionIdsToDelete.length > 0
      ) {
        const {
          error:
            deleteOldChoicesError,
        } = await supabase
          .from("quiz_choices")
          .delete()
          .in(
            "question_id",
            questionIdsToDelete
          );

        if (
          deleteOldChoicesError
        ) {
          throw deleteOldChoicesError;
        }

        const {
          error:
            deleteQuestionsError,
        } = await supabase
          .from("quiz_questions")
          .delete()
          .in(
            "id",
            questionIdsToDelete
          );

        if (
          deleteQuestionsError
        ) {
          throw deleteQuestionsError;
        }
      }

      for (
        let index = 0;
        index < questions.length;
        index += 1
      ) {
        const question =
          questions[index];

        let questionId =
          question.dbId ?? null;

        if (questionId) {
          const {
            error:
              updateQuestionError,
          } = await supabase
            .from("quiz_questions")
            .update({
              prompt:
                question.prompt.trim(),

              question_type:
                question.questionType,

              order_index: index,
            })
            .eq(
              "id",
              questionId
            );

          if (
            updateQuestionError
          ) {
            throw updateQuestionError;
          }

          const {
            error:
              deleteChoicesError,
          } = await supabase
            .from("quiz_choices")
            .delete()
            .eq(
              "question_id",
              questionId
            );

          if (
            deleteChoicesError
          ) {
            throw deleteChoicesError;
          }
        } else {
          const {
            data:
              insertedQuestion,
            error:
              insertQuestionError,
          } = await supabase
            .from("quiz_questions")
            .insert({
              assessment_id: id,
              question_type:
                question.questionType,
              prompt:
                question.prompt.trim(),
              order_index: index,
            })
            .select("id")
            .single();

          if (
            insertQuestionError
          ) {
            throw insertQuestionError;
          }

          questionId =
            insertedQuestion.id as string;
        }

        if (!questionId) {
          throw new Error(
            "Impossible d’identifier la question après sauvegarde."
          );
        }

        const choicePayload: Array<{
          question_id: string;
          choice_text: string;
          is_correct: boolean;
          order_index: number;
        }> = [];

        if (
          question.questionType ===
          "mcq"
        ) {
          question.choices.forEach(
            (
              choice,
              choiceIndex
            ) => {
              const trimmed =
                choice.trim();

              if (!trimmed) return;

              choicePayload.push({
                question_id:
                  questionId as string,
                choice_text:
                  trimmed,
                is_correct:
                  question.correctChoiceIndex ===
                  choiceIndex,
                order_index:
                  choiceIndex,
              });
            }
          );
        }

        if (
          question.questionType ===
          "true_false"
        ) {
          choicePayload.push(
            {
              question_id:
                questionId,
              choice_text: "Vrai",
              is_correct:
                question.correctChoiceIndex ===
                0,
              order_index: 0,
            },
            {
              question_id:
                questionId,
              choice_text: "Faux",
              is_correct:
                question.correctChoiceIndex ===
                1,
              order_index: 1,
            }
          );
        }

        if (
          choicePayload.length > 0
        ) {
          const {
            error:
              insertChoicesError,
          } = await supabase
            .from("quiz_choices")
            .insert(choicePayload);

          if (
            insertChoicesError
          ) {
            throw insertChoicesError;
          }
        }
      }

      navigate(
        `/app/teacher/assessments/${id}`
      );
    } catch (err) {
      console.error(
        "[TeacherAssessmentEdit] submit error:",
        err
      );

      setError(
        safeErrorMessage(
          err,
          "Impossible de modifier l’évaluation."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  const isLoading =
    authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">
            Modifier une évaluation
          </div>

          <div className="text-sm text-gray-500">
            Modifiez l’évaluation, ses
            métadonnées et son contenu.
          </div>
        </div>

        <button
          className="sn-btn-ghost sn-press"
          onClick={() => navigate(-1)}
          type="button"
        >
          ← Retour
        </button>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : la modification
          réelle est désactivée.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="sn-card p-5 space-y-4 lg:col-span-2 animate-pulse">
            <div className="h-5 w-1/3 rounded bg-gray-200" />
            <div className="h-12 rounded bg-gray-100" />
            <div className="h-12 rounded bg-gray-100" />
            <div className="h-24 rounded bg-gray-100" />
          </div>

          <div className="sn-card p-5 space-y-4 animate-pulse">
            <div className="h-5 w-1/2 rounded bg-gray-200" />
            <div className="h-4 rounded bg-gray-100" />
            <div className="h-4 rounded bg-gray-100" />
            <div className="h-4 rounded bg-gray-100" />
          </div>
        </div>
      )}

      {!isLoading &&
        error && (
          <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

      {!isLoading &&
        !error &&
        courses.length === 0 && (
          <div className="sn-card p-6 text-sm text-gray-600">
            Aucun cours disponible.
          </div>
        )}

      {!isLoading &&
        !error &&
        courses.length > 0 && (
          <form
            onSubmit={submit}
            className="grid gap-4 lg:grid-cols-3"
          >
            <div className="sn-card p-5 space-y-4 lg:col-span-2">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">
                  Type
                </div>

                <div className="flex flex-wrap gap-2">
                  <TypePill
                    label="Quiz"
                    active={
                      type === "Quiz"
                    }
                    onClick={() =>
                      setType("Quiz")
                    }
                  />

                  <TypePill
                    label="Devoir"
                    active={
                      type === "Devoir"
                    }
                    onClick={() =>
                      setType("Devoir")
                    }
                  />

                  <TypePill
                    label="Examen"
                    active={
                      type === "Examen"
                    }
                    onClick={() =>
                      setType("Examen")
                    }
                    tone="danger"
                  />
                </div>
              </div>

              {type === "Devoir" && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                  <div className="font-semibold text-gray-900">
                    Mode du devoir
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={
                        submissionMode ===
                        "online"
                          ? "sn-btn-primary sn-press"
                          : "sn-btn-ghost sn-press"
                      }
                      onClick={() =>
                        setSubmissionMode(
                          "online"
                        )
                      }
                    >
                      Devoir sur plateforme
                    </button>

                    <button
                      type="button"
                      className={
                        submissionMode ===
                        "file_upload"
                          ? "sn-btn-primary sn-press"
                          : "sn-btn-ghost sn-press"
                      }
                      onClick={() =>
                        setSubmissionMode(
                          "file_upload"
                        )
                      }
                    >
                      Devoir maison avec fichier
                    </button>
                  </div>

                  <div className="text-xs text-gray-500">
                    • Sur plateforme : réponses
                    directement dans Schoolnet.
                    <br />
                    • Avec fichier : l’apprenant
                    télécharge le sujet puis dépose
                    son travail.
                  </div>
                </div>
              )}

              <div className="sn-card p-4 bg-gray-50 border border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">
                    Liaison
                  </div>

                  <span className="sn-badge sn-badge-blue">
                    Cours
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Cours
                    </label>

                    <select
                      className="sn-input"
                      value={courseId}
                      onChange={(e) =>
                        onCourseChange(
                          e.target.value
                        )
                      }
                    >
                      {courses.map(
                        (course) => (
                          <option
                            key={
                              course.id
                            }
                            value={
                              course.id
                            }
                          >
                            {
                              course.title
                            }
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Chapitre / Section
                    </label>

                    <select
                      className="sn-input"
                      value={sectionId}
                      onChange={(e) =>
                        setSectionId(
                          e.target.value
                        )
                      }
                    >
                      {activeCourse
                        ?.sections.length ? (
                        activeCourse.sections.map(
                          (section) => (
                            <option
                              key={
                                section.id
                              }
                              value={
                                section.id
                              }
                            >
                              {
                                section.title
                              }
                            </option>
                          )
                        )
                      ) : (
                        <option value="">
                          Aucune section
                        </option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  Classe associée
                  automatiquement :{" "}
                  <span className="font-semibold text-gray-800">
                    {activeCourse?.classLabel ||
                      "Non assignée"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Titre
                </label>

                <input
                  className="sn-input"
                  placeholder="ex : Examen de mathématiques"
                  value={title}
                  onChange={(e) =>
                    setTitle(
                      e.target.value
                    )
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Date / heure
                  </label>

                  <input
                    className="sn-input"
                    type="datetime-local"
                    value={date}
                    onChange={(e) =>
                      setDate(
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Durée de composition
                    (minutes)
                  </label>

                  <input
                    className="sn-input"
                    type="number"
                    min={5}
                    max={720}
                    value={duration}
                    onChange={(e) =>
                      setDuration(
                        Number(
                          e.target.value
                        )
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Note totale
                </label>

                <input
                  className="sn-input"
                  type="number"
                  min={1}
                  max={200}
                  value={totalPoints}
                  onChange={(e) =>
                    setTotalPoints(
                      Number(
                        e.target.value
                      )
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Consignes
                </label>

                <RichTextEditor
                  value={instructions}
                  onChange={
                    setInstructions
                  }
                  placeholder="Donnez les consignes aux apprenants..."
                />
              </div>

              {isHomeworkFile && (
                <InstructionFileEditor
                  title="Fichier du devoir maison"
                  description="Consultez le fichier actuel ou sélectionnez-en un nouveau pour le remplacer."
                  currentName={
                    instructionFileName
                  }
                  currentUrl={
                    instructionFileUrl
                  }
                  newFile={
                    instructionFile
                  }
                  onFileChange={
                    setInstructionFile
                  }
                  saving={saving}
                />
              )}

              {isExam && (
                <div className="sn-card p-4 bg-red-50/40 ring-1 ring-red-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">
                      Options Examen
                    </div>

                    <span className="sn-badge sn-badge-red">
                      Examen
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">
                      Contenu de l’examen
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <ExamModeCard
                        title="Questions Schoolnet"
                        description="L’examen est entièrement créé dans Schoolnet."
                        active={
                          examContentMode ===
                          "online_questions"
                        }
                        onClick={() =>
                          changeExamContentMode(
                            "online_questions"
                          )
                        }
                      />

                      <ExamModeCard
                        title="Fichier + questions"
                        description="Un sujet est fourni et des questions sont ajoutées dans Schoolnet."
                        active={
                          examContentMode ===
                          "file_and_questions"
                        }
                        onClick={() =>
                          changeExamContentMode(
                            "file_and_questions"
                          )
                        }
                      />

                      <ExamModeCard
                        title="Sujet uniquement en fichier"
                        description="Le document importé constitue tout le sujet de l’examen."
                        active={
                          examContentMode ===
                          "file_only"
                        }
                        onClick={() =>
                          changeExamContentMode(
                            "file_only"
                          )
                        }
                      />
                    </div>
                  </div>

                  {examUsesFile && (
                    <InstructionFileEditor
                      title="Fichier du sujet d’examen"
                      description="Ce document sera affiché à l’apprenant pendant l’examen."
                      currentName={
                        instructionFileName
                      }
                      currentUrl={
                        instructionFileUrl
                      }
                      newFile={
                        instructionFile
                      }
                      onFileChange={
                        setInstructionFile
                      }
                      saving={saving}
                    />
                  )}

                  <div
                    className={
                      examContentMode ===
                      "file_only"
                        ? "grid gap-3 sm:grid-cols-1"
                        : "grid gap-3 sm:grid-cols-2"
                    }
                  >
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Fenêtre de passage
                        (min)
                      </label>

                      <input
                        className="sn-input"
                        type="number"
                        min={1}
                        max={1440}
                        value={
                          windowMinutes
                        }
                        onChange={(e) =>
                          setWindowMinutes(
                            Number(
                              e.target
                                .value
                            )
                          )
                        }
                      />

                      <div className="text-xs text-gray-500">
                        Durée pendant laquelle
                        l’élève est autorisé à
                        démarrer l’examen.
                      </div>
                    </div>

                    {examContentMode !==
                      "file_only" && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                          Mélanger les
                          questions
                        </label>

                        <div className="flex items-center gap-2 min-h-[42px]">
                          <input
                            type="checkbox"
                            checked={
                              shuffleQuestions
                            }
                            onChange={(
                              e
                            ) =>
                              setShuffleQuestions(
                                e.target
                                  .checked
                              )
                            }
                          />

                          <span className="text-sm text-gray-700">
                            Activer le mélange
                            pour limiter la
                            copie.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {examContentMode ===
                    "file_only" && (
                    <div className="rounded-2xl border border-red-100 bg-white p-3 text-xs text-red-700">
                      Dans ce mode, aucune
                      question Schoolnet n’est
                      nécessaire. Le fichier
                      importé constitue le sujet
                      complet de l’examen.
                    </div>
                  )}
                </div>
              )}

              {usesQuestions && (
                <div className="sn-card p-4 bg-gray-50 border border-gray-100 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">
                        Questions
                      </div>

                      <div className="text-sm text-gray-500">
                        Modifiez les questions
                        réelles visibles par les
                        apprenants.
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() =>
                          addQuestion(
                            "short_text"
                          )
                        }
                      >
                        + Ouverte
                      </button>

                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() =>
                          addQuestion(
                            "mcq"
                          )
                        }
                      >
                        + QCM
                      </button>

                      <button
                        type="button"
                        className="sn-btn-ghost sn-press"
                        onClick={() =>
                          addQuestion(
                            "true_false"
                          )
                        }
                      >
                        + Vrai / Faux
                      </button>
                    </div>
                  </div>

                  {questions.length ===
                  0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                      Aucune question pour le
                      moment.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {questions.map(
                        (
                          question,
                          index
                        ) => (
                          <div
                            key={
                              question.localId
                            }
                            className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-xs text-gray-500">
                                  Question{" "}
                                  {index + 1}
                                </div>

                                <div className="font-semibold text-gray-900">
                                  {question.questionType ===
                                  "mcq"
                                    ? "QCM"
                                    : question.questionType ===
                                      "true_false"
                                    ? "Vrai / Faux"
                                    : "Réponse ouverte"}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <select
                                  className="sn-input"
                                  value={
                                    question.questionType
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    changeQuestionType(
                                      question.localId,
                                      e
                                        .target
                                        .value as DraftQuestionType
                                    )
                                  }
                                >
                                  <option value="short_text">
                                    Réponse ouverte
                                  </option>

                                  <option value="mcq">
                                    QCM
                                  </option>

                                  <option value="true_false">
                                    Vrai / Faux
                                  </option>
                                </select>

                                <button
                                  type="button"
                                  className="sn-btn-ghost sn-press"
                                  onClick={() =>
                                    removeQuestion(
                                      question.localId
                                    )
                                  }
                                  disabled={
                                    questions.length ===
                                    1
                                  }
                                >
                                  Supprimer
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                Intitulé
                              </label>

                              <RichTextEditor
                                value={
                                  question.prompt
                                }
                                onChange={(
                                  value
                                ) =>
                                  updateQuestion(
                                    question.localId,
                                    {
                                      prompt:
                                        value,
                                    }
                                  )
                                }
                                placeholder="Ex: Résoudre x² + 5x + 6 = 0"
                              />
                            </div>

                            {question.questionType ===
                              "mcq" && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <label className="text-sm font-medium text-gray-700">
                                    Choix
                                  </label>

                                  <button
                                    type="button"
                                    className="sn-btn-ghost sn-press"
                                    onClick={() =>
                                      addChoice(
                                        question.localId
                                      )
                                    }
                                  >
                                    + Ajouter un choix
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {question.choices.map(
                                    (
                                      choice,
                                      choiceIndex
                                    ) => (
                                      <div
                                        key={`${question.localId}_${choiceIndex}`}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          type="radio"
                                          name={`correct_${question.localId}`}
                                          checked={
                                            question.correctChoiceIndex ===
                                            choiceIndex
                                          }
                                          onChange={() =>
                                            updateQuestion(
                                              question.localId,
                                              {
                                                correctChoiceIndex:
                                                  choiceIndex,
                                              }
                                            )
                                          }
                                        />

                                        <input
                                          className="sn-input flex-1"
                                          placeholder={`Choix ${
                                            choiceIndex +
                                            1
                                          }`}
                                          value={
                                            choice
                                          }
                                          onChange={(
                                            e
                                          ) =>
                                            updateChoice(
                                              question.localId,
                                              choiceIndex,
                                              e
                                                .target
                                                .value
                                            )
                                          }
                                        />

                                        <button
                                          type="button"
                                          className="sn-btn-ghost sn-press"
                                          onClick={() =>
                                            removeChoice(
                                              question.localId,
                                              choiceIndex
                                            )
                                          }
                                          disabled={
                                            question
                                              .choices
                                              .length <=
                                            2
                                          }
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    )
                                  )}
                                </div>

                                <div className="text-xs text-gray-500">
                                  Cochez la bonne
                                  réponse avec le rond
                                  à gauche.
                                </div>
                              </div>
                            )}

                            {question.questionType ===
                              "true_false" && (
                              <div className="space-y-2">
                                <div className="text-sm font-medium text-gray-700">
                                  Bonne réponse
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                                      question.correctChoiceIndex ===
                                      0
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                    }`}
                                    onClick={() =>
                                      updateQuestion(
                                        question.localId,
                                        {
                                          correctChoiceIndex: 0,
                                        }
                                      )
                                    }
                                  >
                                    Vrai
                                  </button>

                                  <button
                                    type="button"
                                    className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                                      question.correctChoiceIndex ===
                                      1
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                                    }`}
                                    onClick={() =>
                                      updateQuestion(
                                        question.localId,
                                        {
                                          correctChoiceIndex: 1,
                                        }
                                      )
                                    }
                                  >
                                    Faux
                                  </button>
                                </div>
                              </div>
                            )}

                            {question.questionType ===
                              "short_text" && (
                              <div className="text-xs text-gray-500">
                                Réponse ouverte :
                                l’apprenant saisira un
                                texte libre, corrigé
                                ensuite par
                                l’enseignant.
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="sn-btn-primary sn-press"
                  disabled={saving}
                >
                  {saving
                    ? "Enregistrement..."
                    : "Enregistrer"}
                </button>

                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={() =>
                    navigate(
                      `/app/teacher/assessments/${id}`
                    )
                  }
                  disabled={saving}
                >
                  Annuler
                </button>
              </div>
            </div>

            <div className="sn-card sn-card-hover p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">
                  Résumé
                </div>

                <span
                  className={
                    type === "Examen"
                      ? "sn-badge sn-badge-red"
                      : type === "Devoir"
                      ? "sn-badge sn-badge-blue"
                      : "sn-badge sn-badge-gray"
                  }
                >
                  {type}
                </span>
              </div>

              <SummaryRow
                label="Statut"
                value={mapStatusLabel(
                  assessmentStatus
                )}
              />

              <SummaryRow
                label="Cours"
                value={
                  activeCourse?.title ||
                  "—"
                }
              />

              <SummaryRow
                label="Section"
                value={
                  activeSection?.title ||
                  "—"
                }
              />

              <SummaryRow
                label="Classe"
                value={
                  activeCourse?.classLabel ||
                  "—"
                }
              />

              <SummaryRow
                label="Titre"
                value={title || "—"}
              />

              <SummaryRow
                label="Date"
                value={
                  date
                    ? formatDateTime(
                        date
                      )
                    : "—"
                }
              />

              <SummaryRow
                label="Durée"
                value={`${duration} min`}
              />

              <SummaryRow
                label="Note"
                value={`${totalPoints} pts`}
              />

              <SummaryRow
                label="Questions"
                value={String(
                  questionCount
                )}
              />

              {isExam && (
                <div className="pt-2 space-y-2">
                  <div className="text-sm font-semibold text-gray-800">
                    Spécifique Examen
                  </div>

                  <SummaryRow
                    label="Mode"
                    value={examModeLabel(
                      examContentMode
                    )}
                  />

                  {examUsesFile && (
                    <SummaryRow
                      label="Sujet"
                      value={
                        instructionFile
                          ?.name ||
                        instructionFileName ||
                        "Non sélectionné"
                      }
                    />
                  )}

                  <SummaryRow
                    label="Fenêtre"
                    value={`${windowMinutes} min`}
                  />

                  <SummaryRow
                    label="Mélange"
                    value={
                      examContentMode ===
                      "file_only"
                        ? "Sans objet"
                        : shuffleQuestions
                        ? "Activé"
                        : "Désactivé"
                    }
                  />
                </div>
              )}

              <div className="pt-2 text-xs text-gray-500">
                *Cette vue modifie
                l’évaluation et son contenu
                réel dans Supabase.*
              </div>
            </div>
          </form>
        )}
    </div>
  );
}

function TypePill({
  label,
  active,
  onClick,
  tone,
}: {
  label:
    | "Quiz"
    | "Devoir"
    | "Examen";
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base =
    "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";

  const activeCls =
    tone === "danger"
      ? "bg-red-600 text-white shadow-sm"
      : "bg-blue-600 text-white shadow-sm";

  const inactiveCls =
    tone === "danger"
      ? "bg-red-50 text-red-700 hover:bg-red-100"
      : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${
        active
          ? activeCls
          : inactiveCls
      }`}
    >
      {label}
    </button>
  );
}

function ExamModeCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl border p-4 text-left transition sn-press",
        active
          ? "border-red-400 bg-red-50 ring-1 ring-red-200"
          : "border-gray-200 bg-white hover:border-red-200",
      ].join(" ")}
    >
      <div className="text-sm font-semibold text-gray-900">
        {title}
      </div>

      <div className="mt-1 text-xs text-gray-500">
        {description}
      </div>
    </button>
  );
}

function InstructionFileEditor({
  title,
  description,
  currentName,
  currentUrl,
  newFile,
  onFileChange,
  saving,
}: {
  title: string;
  description: string;
  currentName: string | null;
  currentUrl: string | null;
  newFile: File | null;
  onFileChange: (
    file: File | null
  ) => void;
  saving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
      <div>
        <div className="font-semibold text-gray-900">
          {title}
        </div>

        <div className="mt-1 text-xs text-gray-500">
          {description}
        </div>
      </div>

      {currentName ? (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
          <div>
            <div className="text-xs text-gray-500">
              Fichier actuel
            </div>

            <div className="text-sm font-semibold text-gray-900">
              {currentName}
            </div>
          </div>

          {currentUrl && (
            <div className="flex flex-wrap gap-2">
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="sn-btn-primary sn-press"
              >
                Ouvrir le fichier
              </a>

              <a
                href={currentUrl}
                download
                className="sn-btn-ghost sn-press"
              >
                Télécharger
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          Aucun fichier actuellement associé.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          {currentName
            ? "Remplacer le fichier"
            : "Sélectionner le fichier"}
        </label>

        <input
          type="file"
          className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          onChange={(e) =>
            onFileChange(
              e.target.files?.[0] ??
                null
            )
          }
          disabled={saving}
        />

        {newFile ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Nouveau fichier sélectionné :{" "}
            <span className="font-semibold">
              {newFile.name}
            </span>
          </div>
        ) : currentName ? (
          <div className="text-xs text-gray-500">
            Aucun nouveau fichier sélectionné.
            Le fichier actuel sera conservé.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-gray-500">
        {label}
      </div>

      <div className="font-medium text-gray-900 text-right">
        {value}
      </div>
    </div>
  );
}