import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type AssessmentType = "quiz" | "assignment" | "exam";
type SubmissionStatus = "in_progress" | "submitted" | "graded" | "published";
type AssessmentStatus = "draft" | "published" | "closed";

type ChildProfile = {
  id: string;
  full_name: string | null;
};

type AssessmentRow = {
  id: string;
  title: string;
  type: AssessmentType;
  status: AssessmentStatus;
  max_score: number | null;
  due_at: string | null;
  course_id: string;
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
};

type SubmissionRow = {
  id: string;
  student_id: string;
  assessment_id: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  assessments:
    | AssessmentRow
    | AssessmentRow[]
    | null;
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

type ParentChild = {
  id: string;
  label: string;
};

type ResultRow = {
  submissionId: string;
  assessmentId: string;
  childId: string;
  childLabel: string;
  title: string;
  type: AssessmentType;
  courseTitle: string;
  classLabel: string;
  submissionStatus: SubmissionStatus;
  assessmentStatus: AssessmentStatus;
  score: number | null;
  maxScore: number | null;
  submittedAt: string | null;
  feedback: string | null;
};

function typeBadgeClass(type: AssessmentType) {
  if (type === "exam") return "sn-badge sn-badge-red";
  if (type === "assignment") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function typeLabel(type: AssessmentType) {
  if (type === "exam") return "Examen";
  if (type === "assignment") return "Devoir";
  return "Quiz";
}

function submissionStatusBadge(status: SubmissionStatus) {
  if (status === "graded") return "sn-badge sn-badge-green";
  if (status === "submitted") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function submissionStatusLabel(status: SubmissionStatus) {
  if (status === "graded") return "Corrigé";
  if (status === "submitted") return "Soumis";
  return "En cours";
}

function safeLower(v: unknown) {
  return String(v ?? "").toLowerCase();
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeAssessment(
  value: SubmissionRow["assessments"]
): AssessmentRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeCourse(
  value: AssessmentRow["courses"]
): { id: string; title: string } | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function scoreLabel(score: number | null, maxScore: number | null) {
  if (score === null || score === undefined) return "—";
  if (maxScore === null || maxScore === undefined) return String(score);
  return `${score}/${maxScore}`;
}

export default function ParentResults() {
  const { user, loading: authLoading } = useAuth();

  const [children, setChildren] = useState<ParentChild[]>([]);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("all");
  const [filter, setFilter] = useState<"all" | AssessmentType>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    if (!user || user.isDemo) {
      setChildren([]);
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1) récupérer les enfants liés
      const { data: linksData, error: linksError } = await supabase
        .from("parent_links")
        .select("student_id")
        .eq("parent_id", user.id);

      if (linksError) throw linksError;

      const childIds = (linksData ?? [])
        .map((row) => row.student_id)
        .filter(Boolean) as string[];

      if (childIds.length === 0) {
        setChildren([]);
        setRows([]);
        return;
      }

      // 2) récupérer profils enfants
      const { data: childProfilesData, error: childProfilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", childIds);

      if (childProfilesError) throw childProfilesError;

      const childProfiles = (childProfilesData ?? []) as ChildProfile[];

      // 3) récupérer classes enfants
      const { data: classStudentsData, error: classStudentsError } = await supabase
        .from("class_students")
        .select("student_id, class_id")
        .in("student_id", childIds);

      if (classStudentsError) throw classStudentsError;

      const classStudents = (classStudentsData ?? []) as ClassStudentRow[];

      const classIds = Array.from(
        new Set(classStudents.map((row) => row.class_id).filter(Boolean))
      );

      let classesById: Record<string, string> = {};

      if (classIds.length > 0) {
        const { data: classesData, error: classesError } = await supabase
          .from("classes")
          .select("id, name, school_year")
          .in("id", classIds);

        if (classesError) throw classesError;

        classesById = ((classesData ?? []) as ClassRow[]).reduce<Record<string, string>>(
          (acc, row) => {
            acc[row.id] = `${row.name} (${row.school_year})`;
            return acc;
          },
          {}
        );
      }

      const classByStudentId = classStudents.reduce<Record<string, string>>((acc, row) => {
        acc[row.student_id] = classesById[row.class_id] ?? "Non assigné";
        return acc;
      }, {});

      const childLabelById = childProfiles.reduce<Record<string, string>>((acc, child) => {
        acc[child.id] = child.full_name?.trim() || "Élève";
        return acc;
      }, {});

      const childrenOptions: ParentChild[] = childIds.map((childId) => ({
        id: childId,
        label: childLabelById[childId] ?? "Élève",
      }));

      setChildren(childrenOptions);

      // 4) récupérer soumissions + évaluations + cours
      const { data: submissionsData, error: submissionsError } = await supabase
        .from("submissions")
        .select(
          `
          id,
          student_id,
          assessment_id,
          submitted_at,
          status,
          score,
          feedback,
          assessments (
            id,
            title,
            type,
            status,
            max_score,
            due_at,
            course_id,
            courses (
              id,
              title
            )
          )
        `
        )
        .in("student_id", childIds)
        .order("submitted_at", { ascending: false });

      if (submissionsError) throw submissionsError;

      const finalRows: ResultRow[] = ((submissionsData ?? []) as SubmissionRow[])
        .map((submission) => {
          const assessment = normalizeAssessment(submission.assessments);
          if (!assessment) return null;

          const course = normalizeCourse(assessment.courses);

          return {
            submissionId: submission.id,
            assessmentId: assessment.id,
            childId: submission.student_id,
            childLabel: childLabelById[submission.student_id] ?? "Élève",
            title: assessment.title,
            type: assessment.type,
            courseTitle: course?.title ?? "Cours",
            classLabel: classByStudentId[submission.student_id] ?? "Non assigné",
            submissionStatus: submission.status,
            assessmentStatus: assessment.status,
            score: submission.score,
            maxScore: assessment.max_score,
            submittedAt: submission.submitted_at,
            feedback: submission.feedback,
          };
        })
        .filter((row): row is ResultRow => Boolean(row));

      setRows(finalRows);
    } catch (err) {
      console.error("[ParentResults] loadResults error:", err);
      setError("Impossible de charger les résultats.");
      setChildren([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadResults();
  }, [authLoading, loadResults]);

  useEffect(() => {
    if (selectedChild === "all") return;
    const stillExists = children.some((child) => child.id === selectedChild);
    if (!stillExists) setSelectedChild("all");
  }, [children, selectedChild]);

  const stats = useMemo(() => {
    const s = { graded: 0, submitted: 0, inProgress: 0 };
    for (const row of rows) {
      if (row.submissionStatus === "graded") s.graded++;
      else if (row.submissionStatus === "submitted") s.submitted++;
      else s.inProgress++;
    }
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows
      .filter((row) => (selectedChild === "all" ? true : row.childId === selectedChild))
      .filter((row) => (filter === "all" ? true : row.type === filter))
      .filter((row) => {
        if (!q) return true;

        const haystack = [
          row.childLabel,
          row.title,
          row.courseTitle,
          row.classLabel,
          typeLabel(row.type),
          submissionStatusLabel(row.submissionStatus),
        ]
          .map(safeLower)
          .join(" ");

        return haystack.includes(q);
      })
      .sort((a, b) => {
        const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tb - ta;
      });
  }, [rows, selectedChild, filter, query]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Résultats</div>
          <div className="text-sm text-gray-500">
            Consultez les évaluations soumises par vos enfants et leurs notes.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
              selectedChild === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
            onClick={() => setSelectedChild("all")}
          >
            Tous
          </button>

          {children.map((child) => {
            const active = child.id === selectedChild;
            return (
              <button
                key={child.id}
                type="button"
                className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                  active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
                onClick={() => setSelectedChild(child.id)}
              >
                {child.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi title="Corrigés" value={String(stats.graded)} icon="✅" />
        <Kpi title="Soumis" value={String(stats.submitted)} icon="📩" />
        <Kpi title="En cours" value={String(stats.inProgress)} icon="⏳" />
      </div>

      <div className="sn-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            className="w-full sm:w-[420px] rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Rechercher (cours, évaluation, enfant, statut)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <button
            type="button"
            className="sn-btn-ghost sn-press"
            onClick={() => void loadResults()}
            title="Rafraîchir"
          >
            ↻ Rafraîchir
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Pill label="Tous" active={filter === "all"} onClick={() => setFilter("all")} />
          <Pill label="Quiz" active={filter === "quiz"} onClick={() => setFilter("quiz")} />
          <Pill
            label="Devoir"
            active={filter === "assignment"}
            onClick={() => setFilter("assignment")}
          />
          <Pill
            label="Examen"
            active={filter === "exam"}
            onClick={() => setFilter("exam")}
            tone="danger"
          />
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les résultats réels ne sont pas chargés.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="sn-card p-5 space-y-3 animate-pulse">
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
              <div className="h-4 w-1/3 rounded bg-gray-100" />
              <div className="h-10 w-28 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-4 bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="sn-card p-6 text-sm text-gray-600">
          Aucun résultat ne correspond à ce filtre.
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((row) => (
            <div key={row.submissionId} className="sn-card sn-card-hover p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-gray-900">{row.title}</div>
                    <span className={typeBadgeClass(row.type)}>{typeLabel(row.type)}</span>
                    <span className={submissionStatusBadge(row.submissionStatus)}>
                      {submissionStatusLabel(row.submissionStatus)}
                    </span>
                    {row.score !== null && (
                      <span className="sn-badge sn-badge-green">
                        {scoreLabel(row.score, row.maxScore)}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    {row.childLabel} • {row.courseTitle}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">{row.classLabel}</div>

                  <div className="mt-1 text-xs text-gray-500">
                    Soumis : {formatDate(row.submittedAt)}
                  </div>
                </div>

                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  disabled
                  title="Le détail sera branché après stabilisation du workflow évaluation"
                >
                  Voir
                </button>
              </div>

              {row.feedback && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Feedback</div>
                  {row.feedback}
                </div>
              )}

              <div className="text-xs text-gray-500">
                *Cette vue affiche les soumissions réelles disponibles pour les enfants liés.*
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "danger";
}) {
  const base = "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";
  const activeCls = tone === "danger" ? "bg-red-600 text-white" : "bg-blue-600 text-white";
  const inactiveCls =
    tone === "danger"
      ? "bg-red-50 text-red-700 hover:bg-red-100"
      : "bg-gray-100 text-gray-800 hover:bg-gray-200";

  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? activeCls : inactiveCls}`}>
      {label}
    </button>
  );
}

function Kpi({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="sn-card sn-card-hover p-4 flex items-center gap-3">
      <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center text-lg">
        {icon}
      </div>
      <div>
        <div className="text-sm text-gray-500">{title}</div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}