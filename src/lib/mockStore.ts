// src/lib/mockStore.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

export type AssessmentType = "Quiz" | "Devoir" | "Examen";

export type MockAssessment = {
  id: string; // a1/a2/a3...
  type: AssessmentType;
  title: string;
  courseTitle: string;
  sectionTitle: string;
  className: string;
  when: string;
  isNew?: boolean;
  status: "draft" | "published";
  totalPoints: number;
};

export type AttemptStatus = "in_progress" | "submitted" | "graded" | "published";

export type AttemptQuestion =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      points: number;
      choices: string[];
      correct?: string;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      points: number;
      placeholder?: string;
    };

export type Attempt = {
  id: string;
  assessmentId: string;
  studentId: string;
  submittedAtISO?: string;
  answers: Record<string, string>;
  status: AttemptStatus;

  // ✅ snapshot des questions vues par l'élève au moment de la soumission
  questions?: AttemptQuestion[];

  // Score final (ex "16/20" ou "7/10")
  score?: string;

  // Correction (enseignant)
  grading?: Grading;
};

export type Grading = {
  status: "pending" | "graded" | "published";
  gradedAtISO?: string;
  publishedAtISO?: string;

  overallComment?: string;

  // points par question
  perQuestion?: Record<
    string,
    {
      pointsAwarded?: number; // ex 1.5
      comment?: string;
    }
  >;

  // score final calculé
  finalScore?: string; // ex "16/20"
};

export type Student = {
  id: string;
  name: string;
  className: string;
};

const LS = {
  seeded: "sn_seeded_v2",
  assessments: "sn_assessments_v2",
  attempts: "sn_attempts_v2",
  students: "sn_students_v2",
};

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function ensureSeed() {
  const seeded = localStorage.getItem(LS.seeded);
  if (seeded) return;

  const assessments: MockAssessment[] = [
    {
      id: "a1",
      type: "Quiz",
      title: "Quiz — Chapitre 1",
      courseTitle: "Maths — 6e B",
      sectionTitle: "Chapitre 1 — Nombres entiers",
      className: "6e B",
      when: "Aujourd’hui • 10:00",
      isNew: true,
      status: "published",
      totalPoints: 10,
    },
    {
      id: "a2",
      type: "Devoir",
      title: "Devoir — Exercices Fractions",
      courseTitle: "Maths — 6e B",
      sectionTitle: "Chapitre 2 — Fractions",
      className: "6e B",
      when: "À rendre • mardi",
      status: "published",
      totalPoints: 20,
    },
    {
      id: "a3",
      type: "Examen",
      title: "Examen — Trimestre 1",
      courseTitle: "Sciences — 6e B",
      sectionTitle: "Chapitre 2 — Énergie",
      className: "6e B",
      when: "Jeudi • 10:00",
      status: "published",
      totalPoints: 20,
    },
  ];

  const students: Student[] = [
    { id: "demo-student", name: "Fatou D.", className: "6e B" },
    { id: "s2", name: "Aïcha K.", className: "6e B" },
    { id: "s3", name: "Yao K.", className: "6e B" },
  ];

  const attempts: Attempt[] = [
    {
      id: uid("attempt"),
      assessmentId: "a2",
      studentId: "demo-student",
      submittedAtISO: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      answers: {
        q1: "13",
        q2: "12",
        q3: "Une fraction est un nombre écrit sous forme a/b.",
      },
      status: "submitted",
      questions: [
        {
          id: "q1",
          type: "mcq",
          prompt: "Quel est le résultat de 8 + 5 ?",
          choices: ["11", "12", "13", "14"],
          points: 2,
          correct: "13",
        },
        {
          id: "q2",
          type: "mcq",
          prompt: "Lequel est un nombre pair ?",
          choices: ["9", "11", "12", "15"],
          points: 2,
          correct: "12",
        },
        {
          id: "q3",
          type: "short",
          prompt: "Explique en une phrase ce qu’est une fraction.",
          placeholder: "Ta réponse...",
          points: 6,
        },
      ],
    },
  ];

  write(LS.assessments, assessments);
  write(LS.students, students);
  write(LS.attempts, attempts);

  localStorage.setItem(LS.seeded, "1");
}

/* =========================
   Assessments
========================= */

export function getAssessments(): MockAssessment[] {
  return read<MockAssessment[]>(LS.assessments, []);
}

export function getPublishedAssessments(): MockAssessment[] {
  return getAssessments().filter((a) => a.status === "published");
}

export function getAssessmentById(id: string) {
  return getAssessments().find((a) => a.id === id) || null;
}

/* =========================
   Students
========================= */

export function getStudents(): Student[] {
  return read<Student[]>(LS.students, []);
}

export function getStudentById(id: string) {
  return getStudents().find((s) => s.id === id) || null;
}

/* =========================
   Attempts
========================= */

export function getAttempts(): Attempt[] {
  return read<Attempt[]>(LS.attempts, []);
}

export function getAttemptsForAssessment(assessmentId: string): Attempt[] {
  return getAttempts().filter((a) => a.assessmentId === assessmentId);
}

export function getAttemptFor(assessmentId: string, studentId: string): Attempt | null {
  return getAttempts().find((a) => a.assessmentId === assessmentId && a.studentId === studentId) || null;
}

export function upsertAttempt(attempt: Attempt) {
  const all = getAttempts();
  const idx = all.findIndex((a) => a.id === attempt.id);
  if (idx >= 0) all[idx] = attempt;
  else all.unshift(attempt);
  write(LS.attempts, all);
}

/**
 * ✅ compat ascendante :
 * - anciens appels: submitAttempt({ assessmentId, studentId, answers })
 * - nouveaux appels: submitAttempt({ assessmentId, studentId, answers, questions })
 */
export function submitAttempt(params: {
  assessmentId: string;
  studentId: string;
  answers: Record<string, string>;
  questions?: AttemptQuestion[];
}) {
  const existing = getAttemptFor(params.assessmentId, params.studentId);

  const next: Attempt = existing
    ? {
        ...existing,
        answers: params.answers,
        questions: params.questions ?? existing.questions,
        status: "submitted",
        submittedAtISO: new Date().toISOString(),
      }
    : {
        id: uid("attempt"),
        assessmentId: params.assessmentId,
        studentId: params.studentId,
        answers: params.answers,
        questions: params.questions,
        status: "submitted",
        submittedAtISO: new Date().toISOString(),
      };

  upsertAttempt(next);
  return next;
}

/* =========================
   Grading workflow
========================= */

export function toScoreLabel(got: number, max: number) {
  const safeMax = Math.max(1, max);
  const safeGot = Math.max(0, Math.min(got, safeMax));
  return `${safeGot}/${safeMax}`;
}

export function gradeAttempt(params: {
  assessmentId: string;
  studentId: string;
  grading: Omit<Grading, "status" | "gradedAtISO">;
}) {
  const attempt = getAttemptFor(params.assessmentId, params.studentId);
  if (!attempt) return null;

  const next: Attempt = {
    ...attempt,
    status: "graded",
    score: params.grading.finalScore ?? attempt.score,
    grading: {
      ...params.grading,
      status: "graded",
      gradedAtISO: new Date().toISOString(),
    },
  };

  upsertAttempt(next);
  return next;
}

export function publishAttempt(params: { assessmentId: string; studentId: string }) {
  const attempt = getAttemptFor(params.assessmentId, params.studentId);
  if (!attempt) return null;

  const next: Attempt = {
    ...attempt,
    status: "published",
    grading: {
      ...(attempt.grading || { status: "pending" }),
      status: "published",
      publishedAtISO: new Date().toISOString(),
    },
  };

  upsertAttempt(next);
  return next;
}

// ✅ helper utile pour les vues enseignant / parent mock
export function getAttemptQuestions(assessmentId: string, studentId: string): AttemptQuestion[] {
  return getAttemptFor(assessmentId, studentId)?.questions ?? [];
}

// ✅ compat: utilisé par TeacherAssessments.tsx
export function updateAssessment(_: any) {
  return true;
}