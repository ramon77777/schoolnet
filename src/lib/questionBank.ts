// src/lib/questionBank.ts
import type { AssessmentType } from "@/lib/mockStore";

export type Question =
  | {
      id: string;
      type: "mcq";
      prompt: string;
      choices: string[];
      correct?: string; // utile pour Quiz auto-corrigé
      points: number;
    }
  | {
      id: string;
      type: "short";
      prompt: string;
      placeholder?: string;
      points: number;
    };

export function getQuestionsForAssessment(assessmentId: string, type?: AssessmentType): Question[] {
  // Démo: on garde une base commune.
  // Tu peux ensuite faire un switch assessmentId si tu veux des questions différentes par éval.
  const base: Question[] = [
    {
      id: "q1",
      type: "mcq",
      prompt: "Quel est le résultat de 8 + 5 ?",
      choices: ["11", "12", "13", "14"],
      correct: "13",
      points: 2,
    },
    {
      id: "q2",
      type: "mcq",
      prompt: "Lequel est un nombre pair ?",
      choices: ["9", "11", "12", "15"],
      correct: "12",
      points: 2,
    },
    {
      id: "q3",
      type: "short",
      prompt: "Explique en une phrase ce qu’est une fraction.",
      placeholder: "Ta réponse...",
      points: 6,
    },
  ];

  // Exemple: si Devoir/Examen, on ajoute 2 questions pour monter à 20 pts, etc.
  if (type === "Devoir" || type === "Examen") {
    return [
      ...base,
      {
        id: "q4",
        type: "mcq",
        prompt: "Quelle unité mesure une énergie ?",
        choices: ["Watt", "Joule", "Newton", "Volt"],
        correct: "Joule",
        points: 2,
      },
      {
        id: "q5",
        type: "short",
        prompt: "Donne un exemple de situation où l’on consomme de l’énergie.",
        placeholder: "Ex: ...",
        points: 8,
      },
    ];
  }

  // Quiz
  return base;
}
