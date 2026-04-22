import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentTypeUi = "Quiz" | "Devoir" | "Examen";
type AssessmentTypeDb = "quiz" | "assignment" | "exam";
type DraftQuestionType = "mcq" | "true_false" | "short_text";

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

type InsertedQuestionRow = {
  id: string;
  order_index: number;
  question_type: DraftQuestionType;
};

type DraftQuestion = {
  localId: string;
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

function formatDateTime(v: string) {
  const [date, time] = v.split("T");
  return `${date} • ${time}`;
}

function uid(prefix = "q") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
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

function makeQuestion(type: DraftQuestionType = "short_text"): DraftQuestion {
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

export default function TeacherAssessmentCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const prefillCourse = searchParams.get("course") || "";
  const prefillSection = searchParams.get("section") || "";

  const [courses, setCourses] = useState<CourseView[]>([]);
  const [type, setType] = useState<AssessmentTypeUi>("Quiz");
  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(30);
  const [totalPoints, setTotalPoints] = useState(20);
  const [instructions, setInstructions] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);

  const [questions, setQuestions] = useState<DraftQuestion[]>([
    makeQuestion("short_text"),
  ]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isExam = type === "Examen";

  const loadData = useCallback(async () => {
    if (!user || user.isDemo) {
      setCourses([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [coursesResult, sectionsResult, classesResult] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, class_id")
          .eq("created_by", user.id)
          .order("title", { ascending: true }),

        supabase
          .from("course_sections")
          .select("id, course_id, title, order_index")
          .order("order_index", { ascending: true }),

        supabase.from("classes").select("id, name, school_year"),
      ]);

      if (coursesResult.error) throw coursesResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (classesResult.error) throw classesResult.error;

      const courseRows = (coursesResult.data ?? []) as CourseRow[];
      const sectionRows = (sectionsResult.data ?? []) as SectionRow[];
      const classRows = (classesResult.data ?? []) as ClassRow[];

      const classById = classRows.reduce<Record<string, string>>((acc, cls) => {
        acc[cls.id] = `${cls.name} (${cls.school_year})`;
        return acc;
      }, {});

      const mappedCourses: CourseView[] = courseRows.map((course) => ({
        id: course.id,
        title: course.title,
        classLabel: course.class_id ? classById[course.class_id] ?? "Non assignée" : "Non assignée",
        sections: sectionRows
          .filter((section) => section.course_id === course.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map((section) => ({
            id: section.id,
            title: section.title,
          })),
      }));

      setCourses(mappedCourses);

      if (mappedCourses.length > 0) {
        const initialCourseId = mappedCourses.some((c) => c.id === prefillCourse)
          ? prefillCourse
          : mappedCourses[0].id;

        const initialCourse = mappedCourses.find((c) => c.id === initialCourseId)!;

        const initialSectionId = initialCourse.sections.some((s) => s.id === prefillSection)
          ? prefillSection
          : initialCourse.sections[0]?.id || "";

        setCourseId(initialCourseId);
        setSectionId(initialSectionId);
      }
    } catch (err) {
      console.error("[TeacherAssessmentCreate] loadData error:", err);
      setError(safeErrorMessage(err, "Impossible de charger les cours et sections."));
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [user, prefillCourse, prefillSection]);

  useEffect(() => {
    if (authLoading) return;
    void loadData();
  }, [authLoading, loadData]);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId]
  );

  const activeSection = useMemo(
    () => activeCourse?.sections.find((s) => s.id === sectionId) ?? activeCourse?.sections[0] ?? null,
    [activeCourse, sectionId]
  );

  const questionCount = questions.length;

  function onCourseChange(nextCourseId: string) {
    setCourseId(nextCourseId);
    const nextCourse = courses.find((c) => c.id === nextCourseId);
    setSectionId(nextCourse?.sections[0]?.id || "");
  }

  function addQuestion(questionType: DraftQuestionType) {
    setQuestions((prev) => [...prev, makeQuestion(questionType)]);
  }

  function removeQuestion(localId: string) {
    setQuestions((prev) => prev.filter((q) => q.localId !== localId));
  }

  function updateQuestion(localId: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) =>
      prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q))
    );
  }

  function changeQuestionType(localId: string, nextType: DraftQuestionType) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId) return q;
        return {
          ...makeQuestion(nextType),
          localId,
          prompt: q.prompt,
        };
      })
    );
  }

  function addChoice(localId: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId || q.questionType !== "mcq") return q;
        return { ...q, choices: [...q.choices, ""] };
      })
    );
  }

  function removeChoice(localId: string, index: number) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId || q.questionType !== "mcq") return q;

        const nextChoices = q.choices.filter((_, i) => i !== index);

        let nextCorrectIndex = q.correctChoiceIndex;
        if (nextCorrectIndex === index) nextCorrectIndex = null;
        if (typeof nextCorrectIndex === "number" && nextCorrectIndex > index) {
          nextCorrectIndex -= 1;
        }

        return {
          ...q,
          choices: nextChoices,
          correctChoiceIndex: nextCorrectIndex,
        };
      })
    );
  }

  function updateChoice(localId: string, index: number, value: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId || q.questionType !== "mcq") return q;

        const nextChoices = [...q.choices];
        nextChoices[index] = value;

        return { ...q, choices: nextChoices };
      })
    );
  }

  function validateQuestions(): string | null {
    if (questions.length === 0) {
      return "Veuillez ajouter au moins une question.";
    }

    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      const label = `Question ${i + 1}`;

      if (!q.prompt.trim()) {
        return `${label} : le libellé est obligatoire.`;
      }

      if (q.questionType === "mcq") {
        const cleanedChoices = q.choices.map((c) => c.trim()).filter(Boolean);

        if (cleanedChoices.length < 2) {
          return `${label} : un QCM doit avoir au moins 2 choix non vides.`;
        }

        if (
          q.correctChoiceIndex === null ||
          q.correctChoiceIndex < 0 ||
          q.correctChoiceIndex >= q.choices.length ||
          !q.choices[q.correctChoiceIndex]?.trim()
        ) {
          return `${label} : veuillez sélectionner une bonne réponse valide.`;
        }
      }

      if (q.questionType === "true_false") {
        if (q.correctChoiceIndex !== 0 && q.correctChoiceIndex !== 1) {
          return `${label} : veuillez choisir Vrai ou Faux comme bonne réponse.`;
        }
      }
    }

    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    if (!user || user.isDemo) {
      setError("La création réelle n’est pas disponible en mode démo.");
      return;
    }

    if (!courseId) {
      setError("Veuillez sélectionner un cours.");
      return;
    }

    if (!title.trim()) {
      setError("Veuillez renseigner un titre.");
      return;
    }

    const questionsError = validateQuestions();
    if (questionsError) {
      setError(questionsError);
      return;
    }

    let createdAssessmentId: string | null = null;

    try {
      setSaving(true);
      setError(null);

      const dueAt = date ? new Date(date).toISOString() : null;

      const { data: insertedAssessment, error: insertAssessmentError } = await supabase
        .from("assessments")
        .insert({
          course_id: courseId,
          section_id: sectionId || null,
          type: toDbType(type),
          title: title.trim(),
          description: instructions.trim() || null,
          due_at: dueAt,
          time_limit_minutes: duration,
          max_score: totalPoints,
          status: "draft",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (insertAssessmentError) throw insertAssessmentError;

      createdAssessmentId = insertedAssessment.id as string;

      const questionPayload = questions.map((question, index) => ({
        assessment_id: createdAssessmentId,
        question_type: question.questionType,
        prompt: question.prompt.trim(),
        order_index: index,
      }));

      const { data: insertedQuestions, error: insertQuestionsError } = await supabase
        .from("quiz_questions")
        .insert(questionPayload)
        .select("id, order_index, question_type");

      if (insertQuestionsError) throw insertQuestionsError;

      const insertedQuestionRows = (insertedQuestions ?? []) as InsertedQuestionRow[];
      const questionIdByOrderIndex = insertedQuestionRows.reduce<Record<number, string>>((acc, row) => {
        acc[row.order_index] = row.id;
        return acc;
      }, {});

      const choicePayload: {
        question_id: string;
        choice_text: string;
        is_correct: boolean;
        order_index: number;
      }[] = [];

      questions.forEach((question, index) => {
        const insertedQuestionId = questionIdByOrderIndex[index];
        if (!insertedQuestionId) return;

        if (question.questionType === "mcq") {
          question.choices.forEach((choice, choiceIndex) => {
            const trimmed = choice.trim();
            if (!trimmed) return;

            choicePayload.push({
              question_id: insertedQuestionId,
              choice_text: trimmed,
              is_correct: question.correctChoiceIndex === choiceIndex,
              order_index: choiceIndex,
            });
          });
        }

        if (question.questionType === "true_false") {
          choicePayload.push(
            {
              question_id: insertedQuestionId,
              choice_text: "Vrai",
              is_correct: question.correctChoiceIndex === 0,
              order_index: 0,
            },
            {
              question_id: insertedQuestionId,
              choice_text: "Faux",
              is_correct: question.correctChoiceIndex === 1,
              order_index: 1,
            }
          );
        }
      });

      if (choicePayload.length > 0) {
        const { error: insertChoicesError } = await supabase
          .from("quiz_choices")
          .insert(choicePayload);

        if (insertChoicesError) throw insertChoicesError;
      }

      navigate("/app/teacher/assessments");
    } catch (err) {
      console.error("[TeacherAssessmentCreate] submit error:", err);

      if (createdAssessmentId) {
        await supabase.from("assessments").delete().eq("id", createdAssessmentId);
      }

      setError(safeErrorMessage(err, "Impossible de créer l’évaluation."));
    } finally {
      setSaving(false);
    }
  }

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Créer une évaluation</div>
          <div className="text-sm text-gray-500">
            Liez l’évaluation à un cours, une section et des questions réelles.
          </div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => navigate(-1)} type="button">
          ← Retour
        </button>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : la création réelle est désactivée.
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

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && courses.length === 0 && (
        <div className="sn-card p-6 text-sm text-gray-600">
          Aucun cours disponible. Créez d’abord un cours pour pouvoir créer une évaluation.
        </div>
      )}

      {!isLoading && !error && courses.length > 0 && (
        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
          <div className="sn-card p-5 space-y-4 lg:col-span-2">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-800">Type</div>
              <div className="flex flex-wrap gap-2">
                <TypePill label="Quiz" active={type === "Quiz"} onClick={() => setType("Quiz")} />
                <TypePill label="Devoir" active={type === "Devoir"} onClick={() => setType("Devoir")} />
                <TypePill
                  label="Examen"
                  active={type === "Examen"}
                  onClick={() => setType("Examen")}
                  tone="danger"
                />
              </div>
            </div>

            <div className="sn-card p-4 bg-gray-50 border border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">Liaison</div>
                <span className="sn-badge sn-badge-blue">Cours</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Cours</label>
                  <select
                    className="sn-input"
                    value={courseId}
                    onChange={(e) => onCourseChange(e.target.value)}
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Chapitre / Section</label>
                  <select
                    className="sn-input"
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    {activeCourse?.sections.length ? (
                      activeCourse.sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.title}
                        </option>
                      ))
                    ) : (
                      <option value="">Aucune section</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="text-xs text-gray-500">
                Classe associée automatiquement :{" "}
                <span className="font-semibold text-gray-800">
                  {activeCourse?.classLabel || "Non assignée"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Titre</label>
              <input
                className="sn-input"
                placeholder="ex : Devoir — Exercices Fractions"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Date / heure</label>
                <input
                  className="sn-input"
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Durée (minutes)</label>
                <input
                  className="sn-input"
                  type="number"
                  min={5}
                  max={240}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Note totale</label>
              <input
                className="sn-input"
                type="number"
                min={1}
                max={200}
                value={totalPoints}
                onChange={(e) => setTotalPoints(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Consignes</label>
              <textarea
                className="sn-input"
                style={{ minHeight: 110 }}
                placeholder="Donnez les consignes aux apprenants..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            {isExam && (
              <div className="sn-card p-4 bg-red-50/40 ring-1 ring-red-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">Options Examen</div>
                  <span className="sn-badge sn-badge-red">Examen</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Fenêtre de passage (min)
                    </label>
                    <input
                      className="sn-input"
                      type="number"
                      min={15}
                      max={720}
                      value={windowMinutes}
                      onChange={(e) => setWindowMinutes(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Mélanger questions</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={shuffleQuestions}
                        onChange={(e) => setShuffleQuestions(e.target.checked)}
                      />
                      <span className="text-sm text-gray-700">
                        Activer le mélange pour limiter la copie.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="sn-card p-4 bg-gray-50 border border-gray-100 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">Questions</div>
                  <div className="text-sm text-gray-500">
                    Ajoutez les questions réelles qui seront vues par les apprenants.
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="sn-btn-ghost sn-press" onClick={() => addQuestion("short_text")}>
                    + Ouverte
                  </button>
                  <button type="button" className="sn-btn-ghost sn-press" onClick={() => addQuestion("mcq")}>
                    + QCM
                  </button>
                  <button type="button" className="sn-btn-ghost sn-press" onClick={() => addQuestion("true_false")}>
                    + Vrai / Faux
                  </button>
                </div>
              </div>

              {questions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                  Aucune question pour le moment.
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <div key={question.localId} className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-gray-500">Question {index + 1}</div>
                          <div className="font-semibold text-gray-900">
                            {question.questionType === "mcq"
                              ? "QCM"
                              : question.questionType === "true_false"
                              ? "Vrai / Faux"
                              : "Réponse ouverte"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            className="sn-input"
                            value={question.questionType}
                            onChange={(e) =>
                              changeQuestionType(question.localId, e.target.value as DraftQuestionType)
                            }
                          >
                            <option value="short_text">Réponse ouverte</option>
                            <option value="mcq">QCM</option>
                            <option value="true_false">Vrai / Faux</option>
                          </select>

                          <button
                            type="button"
                            className="sn-btn-ghost sn-press"
                            onClick={() => removeQuestion(question.localId)}
                            disabled={questions.length === 1}
                            title={questions.length === 1 ? "Au moins une question est requise" : "Supprimer"}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Intitulé</label>
                        <textarea
                          className="sn-input"
                          style={{ minHeight: 90 }}
                          placeholder="Ex: Quel est le résultat de 8 + 5 ?"
                          value={question.prompt}
                          onChange={(e) =>
                            updateQuestion(question.localId, { prompt: e.target.value })
                          }
                        />
                      </div>

                      {question.questionType === "mcq" && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Choix</label>
                            <button
                              type="button"
                              className="sn-btn-ghost sn-press"
                              onClick={() => addChoice(question.localId)}
                            >
                              + Ajouter un choix
                            </button>
                          </div>

                          <div className="space-y-2">
                            {question.choices.map((choice, choiceIndex) => (
                              <div key={`${question.localId}_${choiceIndex}`} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`correct_${question.localId}`}
                                  checked={question.correctChoiceIndex === choiceIndex}
                                  onChange={() =>
                                    updateQuestion(question.localId, { correctChoiceIndex: choiceIndex })
                                  }
                                  title="Bonne réponse"
                                />

                                <input
                                  className="sn-input flex-1"
                                  placeholder={`Choix ${choiceIndex + 1}`}
                                  value={choice}
                                  onChange={(e) =>
                                    updateChoice(question.localId, choiceIndex, e.target.value)
                                  }
                                />

                                <button
                                  type="button"
                                  className="sn-btn-ghost sn-press"
                                  onClick={() => removeChoice(question.localId, choiceIndex)}
                                  disabled={question.choices.length <= 2}
                                  title={
                                    question.choices.length <= 2
                                      ? "Un QCM doit garder au moins 2 choix"
                                      : "Supprimer ce choix"
                                  }
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="text-xs text-gray-500">
                            Cochez la bonne réponse avec le rond à gauche.
                          </div>
                        </div>
                      )}

                      {question.questionType === "true_false" && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-gray-700">Bonne réponse</div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                                question.correctChoiceIndex === 0
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                              }`}
                              onClick={() => updateQuestion(question.localId, { correctChoiceIndex: 0 })}
                            >
                              Vrai
                            </button>
                            <button
                              type="button"
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                                question.correctChoiceIndex === 1
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                              }`}
                              onClick={() => updateQuestion(question.localId, { correctChoiceIndex: 1 })}
                            >
                              Faux
                            </button>
                          </div>
                        </div>
                      )}

                      {question.questionType === "short_text" && (
                        <div className="text-xs text-gray-500">
                          Réponse ouverte : l’apprenant saisira un texte libre, corrigé ensuite par l’enseignant.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-wrap gap-2">
              <button type="submit" className="sn-btn-primary sn-press" disabled={saving}>
                {saving ? "Création..." : "Créer"}
              </button>
              <button
                type="button"
                className="sn-btn-ghost sn-press"
                onClick={() => navigate("/app/teacher/assessments")}
                disabled={saving}
              >
                Annuler
              </button>
            </div>
          </div>

          <div className="sn-card sn-card-hover p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Résumé</div>
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

            <SummaryRow label="Cours" value={activeCourse?.title || "—"} />
            <SummaryRow label="Section" value={activeSection?.title || "—"} />
            <SummaryRow label="Classe" value={activeCourse?.classLabel || "—"} />
            <SummaryRow label="Titre" value={title || "—"} />
            <SummaryRow label="Date" value={date ? formatDateTime(date) : "—"} />
            <SummaryRow label="Durée" value={`${duration} min`} />
            <SummaryRow label="Note" value={`${totalPoints} pts`} />
            <SummaryRow label="Questions" value={String(questionCount)} />

            {isExam && (
              <div className="pt-2 space-y-2">
                <div className="text-sm font-semibold text-gray-800">Spécifique Examen</div>
                <SummaryRow label="Fenêtre" value={`${windowMinutes} min`} />
                <SummaryRow label="Mélange" value={shuffleQuestions ? "Activé" : "Désactivé"} />
              </div>
            )}

            <div className="pt-2 text-xs text-gray-500">
              *Cette vue crée maintenant l’évaluation et ses questions réelles dans Supabase.*
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
  label: "Quiz" | "Devoir" | "Examen";
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base = "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";
  const activeCls =
    tone === "danger" ? "bg-red-600 text-white shadow-sm" : "bg-blue-600 text-white shadow-sm";
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className="font-medium text-gray-900 text-right">{value}</div>
    </div>
  );
}