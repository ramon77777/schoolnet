import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ensureSeed,
  getAssessmentById,
  getAttemptFor,
  getStudentById,
  type AssessmentType,
  type Attempt,
} from "@/lib/mockStore";
import { getQuestionsForAssessment, type Question } from "@/lib/questionBank";

/* =========================
   UI helpers
========================= */

function badgeTypeClass(type: AssessmentType) {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

type ParentViewStatus = "none" | "submitted" | "graded" | "published";

function getParentViewStatus(attempt: Attempt | null | undefined): ParentViewStatus {
  if (!attempt) return "none";
  if (attempt.status === "published") return "published";
  if (attempt.status === "graded") return "graded";
  if (attempt.status === "submitted") return "submitted";
  return "submitted"; // in_progress => traité comme en attente côté parent
}

function statusBadge(status: ParentViewStatus) {
  if (status === "published") return "sn-badge sn-badge-green";
  if (status === "graded") return "sn-badge sn-badge-blue";
  if (status === "submitted") return "sn-badge sn-badge-gray";
  return "sn-badge sn-badge-gray";
}

function statusLabel(status: ParentViewStatus) {
  if (status === "published") return "Publié";
  if (status === "graded") return "Corrigé (non publié)";
  if (status === "submitted") return "Soumis (en attente)";
  return "Non soumis";
}

function parseScore(score?: string | number | null) {
  if (score === undefined || score === null) return null;

  const s = String(score).trim();
  // accepte décimaux (ex: 12.5/20)
  const m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const got = Number(m[1]);
    const max = Number(m[2]);
    if (Number.isFinite(got) && Number.isFinite(max) && max > 0) {
      return { label: `${got}/${max}`, ratio: Math.round((got / max) * 100) };
    }
    return { label: s, ratio: null };
  }

  return { label: s, ratio: null };
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

/* =========================
   Page
========================= */

export default function ParentResultsDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // assessmentId (a1/a2/a3)
  const [searchParams] = useSearchParams();

  const childId = searchParams.get("childId") || "demo-student";

  useEffect(() => {
    ensureSeed();
  }, []);

  const assessment = useMemo(() => {
    if (!id) return null;
    return getAssessmentById(id);
  }, [id]);

  const student = useMemo(() => getStudentById(childId), [childId]);

  const attempt = useMemo(() => {
    if (!id) return null;
    return getAttemptFor(id, childId);
  }, [id, childId]);

  const viewStatus = useMemo(() => getParentViewStatus(attempt), [attempt]);
  const isPublished = viewStatus === "published";

  const questions: Question[] = useMemo(() => {
    if (!id || !assessment) return [];
    return getQuestionsForAssessment(id, assessment.type);
  }, [id, assessment?.type]);

  const answers = useMemo(
    () => ((attempt?.answers || {}) as Record<string, string>),
    [attempt]
  );

  const grading = useMemo(() => attempt?.grading ?? null, [attempt]);

  const totalPoints = useMemo(
    () => questions.reduce((acc, q) => acc + q.points, 0),
    [questions]
  );

  // ✅ Score visible côté parent:
  // - Quiz: score auto possible même si pas publié (si tu veux), mais pour être strict "parent" => publier.
  // Ici: on fait "strict": devoir/examen => publié only; quiz => score ok si existant.
  const scoreInfo = useMemo(() => {
    // priorité grading.finalScore
    const fromTeacher = parseScore(grading?.finalScore);
    if (fromTeacher?.label) return fromTeacher;

    // fallback auto quiz
    return parseScore(attempt?.score);
  }, [grading?.finalScore, attempt?.score]);

  const displayedScore = useMemo(() => {
    if (!attempt) return "—";
    if (assessment?.type === "Quiz") return scoreInfo?.label || "—";
    // Devoir/Examen => seulement publié
    return isPublished ? scoreInfo?.label || "—" : "—";
  }, [attempt, assessment?.type, isPublished, scoreInfo?.label]);

  const progressRatio = useMemo(() => {
    // si ratio score et visible, l'utiliser
    const ratio = scoreInfo?.ratio;
    if (typeof ratio === "number" && (assessment?.type === "Quiz" || isPublished)) return ratio;

    // fallback: % réponses saisies
    const answered = questions.filter((q) => (answers[q.id] || "").trim().length > 0).length;
    return Math.round((answered / Math.max(1, questions.length)) * 100);
  }, [scoreInfo?.ratio, assessment?.type, isPublished, questions, answers]);

  const summary = useMemo(() => {
    let mcqCorrect = 0;
    let mcqWrong = 0;
    let openAnswered = 0;
    let unanswered = 0;

    for (const q of questions) {
      const a = (answers[q.id] || "").trim();
      if (!a) {
        unanswered++;
        continue;
      }
      if (q.type === "short") {
        openAnswered++;
        continue;
      }
      // MCQ (si correct dispo)
      if (q.correct && a === q.correct) mcqCorrect++;
      else mcqWrong++;
    }

    return { mcqCorrect, mcqWrong, openAnswered, unanswered };
  }, [questions, answers]);

  // collapse: par défaut ouvert seulement si publié (sinon inutile)
  const [teacherOpen, setTeacherOpen] = useState<boolean>(() => false);
  useEffect(() => {
    setTeacherOpen(isPublished);
  }, [isPublished]);

  if (!id || !assessment) {
    return (
      <div className="sn-card p-6 space-y-3">
        <div className="text-lg font-semibold">Détail résultat</div>
        <div className="text-sm text-gray-500">Évaluation introuvable.</div>
        <button
          className="sn-btn-primary sn-press w-fit"
          onClick={() => navigate("/app/parent/results")}
        >
          ← Retour
        </button>
      </div>
    );
  }

  const subtitle = `${assessment.title} • ${student?.name ?? childId} • ${assessment.className}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Détail résultat</div>
          <div className="text-sm text-gray-500">{subtitle}</div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => navigate("/app/parent/results")}>
          ← Retour
        </button>
      </div>

      {/* Top */}
      <div className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badgeTypeClass(assessment.type)}>{assessment.type}</span>
            <span className="sn-badge sn-badge-gray">{assessment.className}</span>

            <span className={statusBadge(viewStatus)}>{statusLabel(viewStatus)}</span>

            {isPublished && <span className="sn-badge sn-badge-green">Visible Parent</span>}
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">Score</div>
            <div className="text-2xl font-bold text-gray-900">{displayedScore}</div>
            <div className="text-xs text-gray-500">Max : {totalPoints} pts</div>
          </div>
        </div>

        {/* progress */}
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-blue-600"
              style={{ width: `${Math.min(100, Math.max(0, progressRatio))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{Math.min(100, Math.max(0, progressRatio))}%</span>
            <span>Soumis le : {formatDate(attempt?.submittedAtISO)}</span>
          </div>
        </div>

        {/* Gate */}
        {!attempt ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-700">
            Aucune soumission pour le moment.
          </div>
        ) : !isPublished && assessment.type !== "Quiz" ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">⏳ Résultat pas encore publié</div>
            <div className="mt-1 text-amber-800">
              L’enseignant a peut-être corrigé, mais n’a pas encore publié la correction pour les parents.
            </div>
          </div>
        ) : (
          <>
            {/* Résumé */}
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="text-sm font-semibold text-gray-900">Résumé</div>

              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <div className="rounded-2xl bg-green-50 border border-green-100 p-3">
                  <div className="text-xs text-gray-600">QCM justes</div>
                  <div className="text-lg font-bold text-gray-900">✅ {summary.mcqCorrect}</div>
                </div>

                <div className="rounded-2xl bg-red-50 border border-red-100 p-3">
                  <div className="text-xs text-gray-600">QCM faux</div>
                  <div className="text-lg font-bold text-gray-900">❌ {summary.mcqWrong}</div>
                </div>

                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-3">
                  <div className="text-xs text-gray-600">Ouvert répondu</div>
                  <div className="text-lg font-bold text-gray-900">📝 {summary.openAnswered}</div>
                </div>

                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                  <div className="text-xs text-gray-600">Non répondu</div>
                  <div className="text-lg font-bold text-gray-900">⚪ {summary.unanswered}</div>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-500">
                *QCM = corrigé automatiquement si “correct” existe. Ouvert = corrigé par enseignant.*
              </div>
            </div>

            {/* Commentaire enseignant */}
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Commentaire enseignant</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {isPublished
                      ? "Visible parce que la correction est publiée."
                      : "Non visible tant que la correction n’est pas publiée."}
                  </div>
                </div>

                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={() => setTeacherOpen((v) => !v)}
                  aria-expanded={teacherOpen}
                  disabled={!isPublished}
                  title={!isPublished ? "Disponible après publication" : undefined}
                >
                  {teacherOpen ? "Masquer" : "Afficher"}
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
                <div className="space-y-3">
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                    {grading?.overallComment ? grading.overallComment : "Aucun commentaire global."}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-gray-700">Remarques par question</div>

                    <div className="space-y-2">
                      {questions.map((q) => {
                        const fb = grading?.perQuestion?.[q.id];
                        const a = (answers[q.id] || "").trim();
                        const answered = Boolean(a);

                        return (
                          <div key={q.id} className="rounded-2xl border border-gray-100 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-xs text-gray-500">{q.id}</div>
                                <div className="text-sm font-semibold text-gray-900">{q.prompt}</div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={answered ? "sn-badge sn-badge-blue" : "sn-badge sn-badge-gray"}>
                                  {answered ? "Répondu" : "Non répondu"}
                                </span>

                                {typeof fb?.pointsAwarded === "number" && (
                                  <span className="sn-badge sn-badge-green">
                                    {fb.pointsAwarded}/{q.points} pts
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 text-sm text-gray-700">
                              {fb?.comment ? fb.comment : <span className="text-gray-500">Pas de remarque.</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {!isPublished && (
                <div className="mt-3 text-xs text-gray-500">
                  *Les commentaires apparaîtront ici dès que l’enseignant publie la correction.*
                </div>
              )}
            </div>

            {/* Réponses enfant */}
            <div className="sn-card p-5 space-y-4">
              <div className="font-semibold">Réponses de l’enfant</div>

              <div className="space-y-4">
                {questions.map((q, idx) => {
                  const a = (answers[q.id] || "").trim();
                  const answered = Boolean(a);

                  const fb = grading?.perQuestion?.[q.id];
                  const hasPoints = typeof fb?.pointsAwarded === "number";
                  const isCorrect = q.type === "mcq" && answered && q.correct && a === q.correct;

                  return (
                    <div key={q.id} className="rounded-2xl border border-gray-100 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-gray-500">
                            Question {idx + 1} • {q.points} pts
                            {hasPoints ? <span className="ml-2">• Noté : {fb!.pointsAwarded}/{q.points}</span> : null}
                          </div>
                          <div className="font-semibold text-gray-900">{q.prompt}</div>
                        </div>

                        <span
                          className={
                            answered
                              ? q.type === "mcq"
                                ? isCorrect
                                  ? "sn-badge sn-badge-green"
                                  : "sn-badge sn-badge-red"
                                : "sn-badge sn-badge-blue"
                              : "sn-badge sn-badge-gray"
                          }
                        >
                          {answered
                            ? q.type === "mcq"
                              ? isCorrect
                                ? "Bonne"
                                : "Mauvaise"
                              : "Ouvert"
                            : "Non répondu"}
                        </span>
                      </div>

                      {q.type === "mcq" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {q.choices.map((c) => {
                            const selected = answered && a === c;
                            const correctChoice = q.correct ? c === q.correct : false;

                            const base = "rounded-2xl border p-3 text-left";
                            const cls =
                              selected && correctChoice
                                ? "border-green-500 bg-green-50"
                                : selected && !correctChoice
                                ? "border-red-300 bg-red-50"
                                : !selected && correctChoice
                                ? "border-green-200 bg-green-50/40"
                                : "border-gray-100 bg-white";

                            return (
                              <div key={c} className={`${base} ${cls}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm text-gray-900">{c}</div>
                                  <div className="flex gap-2">
                                    {correctChoice && <span className="sn-badge sn-badge-green">Bonne</span>}
                                    {selected && <span className="sn-badge sn-badge-blue">Choisi</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-sm text-gray-800">
                          {answered ? a : "Aucune réponse saisie."}

                          {fb?.comment && (
                            <div className="mt-3 rounded-xl bg-white border border-gray-100 p-3">
                              <div className="text-xs font-semibold text-gray-700 mb-1">
                                Commentaire enseignant
                              </div>
                              <div className="text-sm text-gray-800">{fb.comment}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-gray-500">
                *Cette page lit attempt + attempt.grading. Les commentaires sont visibles uniquement après publication.*
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
