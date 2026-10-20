import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type SubmissionStatus = "in_progress" | "submitted" | "graded" | "published";

type AssignmentRow = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "draft" | "published" | "closed";
  submission_mode: "online" | "file_upload" | null;
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
  assessment_id: string;
  status: SubmissionStatus;
  score: number | null;
};

type HomeworkSubmissionRow = {
  homework_id: string;
  status: SubmissionStatus;
  score: number | null;
};

type HomeworkView = {
  id: string;
  title: string;
  courseTitle: string;
  sectionTitle: string;
  dueLabel: string;

  submissionMode: "online" | "file_upload";

  studentStatus: "À faire" | "Soumis" | "Corrigé" | "Publié";
  scoreLabel?: string;
};

function normalizeOne<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatDueDate(value: string | null) {
  if (!value) return "Sans date limite";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `À rendre avant le ${d.toLocaleString()}`;
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return undefined;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function statusBadgeClass(status: HomeworkView["studentStatus"]) {
  if (status === "Publié") return "sn-badge sn-badge-green";
  if (status === "Corrigé") return "sn-badge sn-badge-blue";
  if (status === "Soumis") return "sn-badge sn-badge-amber";
  return "sn-badge sn-badge-gray";
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

export default function StudentHomework() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [homeworks, setHomeworks] = useState<HomeworkView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHomeworks = useCallback(async () => {
    if (!user || user.isDemo) {
      setHomeworks([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("student_id", user.id);

      if (enrollmentsError) throw enrollmentsError;

      const courseIds = Array.from(
        new Set((enrollmentsData ?? []).map((row) => row.course_id).filter(Boolean))
      );

      if (courseIds.length === 0) {
        setHomeworks([]);
        return;
      }

      const [
        assignmentsResult,
        assessmentSubmissionsResult,
        homeworkSubmissionsResult,
      ] = await Promise.all([
        supabase
          .from("assessments")
          .select(
            `
            id,
            title,
            description,
            due_at,
            status,
            submission_mode,
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
          .eq("type", "assignment")
          .eq("status", "published")
          .in("course_id", courseIds)
          .order("due_at", { ascending: true, nullsFirst: false }),

        supabase
          .from("assessment_submissions")
          .select("assessment_id, status, score")
          .eq("student_id", user.id),

        supabase
          .from("homework_submissions")
          .select("homework_id, status, score")
          .eq("student_id", user.id),
      ]);

      if (assignmentsResult.error) throw assignmentsResult.error;

      if (assessmentSubmissionsResult.error) {
        throw assessmentSubmissionsResult.error;
      }

      if (homeworkSubmissionsResult.error) {
        throw homeworkSubmissionsResult.error;
      }

      const submissionsByAssessmentId = (
        (assessmentSubmissionsResult.data ?? []) as SubmissionRow[]
      ).reduce<Record<string, SubmissionRow>>((acc, row) => {
        acc[row.assessment_id] = row;
        return acc;
      }, {});

      const homeworkSubmissionsByHomeworkId = (
        (homeworkSubmissionsResult.data ?? []) as HomeworkSubmissionRow[]
      ).reduce<Record<string, HomeworkSubmissionRow>>((acc, row) => {
        acc[row.homework_id] = row;
        return acc;
      }, {});

      const mapped = ((assignmentsResult.data ?? []) as AssignmentRow[]).map<HomeworkView>(
        (assignment) => {
          const submission =
            assignment.submission_mode === "file_upload"
              ? homeworkSubmissionsByHomeworkId[assignment.id]
              : submissionsByAssessmentId[assignment.id];
          const course = normalizeOne(assignment.courses);
          const section = normalizeOne(assignment.course_sections);

          const studentStatus: HomeworkView["studentStatus"] =
            submission?.status === "published"
              ? "Publié"
              : submission?.status === "graded"
              ? "Corrigé"
              : submission?.status === "submitted"
              ? "Soumis"
              : "À faire";

          return {
            id: assignment.id,
            title: assignment.title,
            submissionMode:
              assignment.submission_mode === "file_upload"
                ? "file_upload"
                : "online",
            courseTitle: course?.title ?? "Cours",
            sectionTitle: section?.title ?? "Sans section",
            dueLabel: formatDueDate(assignment.due_at),
            studentStatus,
            scoreLabel: submission?.status === "published" ? formatScore(submission.score) : undefined,
          };
        }
      );

      setHomeworks(mapped);
    } catch (err) {
      console.error("[StudentHomework] loadHomeworks error:", err);
      setError(safeErrorMessage(err, "Impossible de charger les devoirs."));
      setHomeworks([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void loadHomeworks();
  }, [authLoading, loadHomeworks]);

  const counts = useMemo(() => {
    return {
      total: homeworks.length,
      todo: homeworks.filter((h) => h.studentStatus === "À faire").length,
      submitted: homeworks.filter((h) => h.studentStatus === "Soumis").length,
      published: homeworks.filter((h) => h.studentStatus === "Publié").length,
    };
  }, [homeworks]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Devoirs</div>
          <div className="text-sm text-gray-500">
            Retrouvez vos devoirs publiés, les dates limites et vos rendus.
          </div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => void loadHomeworks()} type="button">
          ↻ Rafraîchir
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="À faire" value={counts.todo} />
        <StatCard label="Soumis" value={counts.submitted} />
        <StatCard label="Publiés" value={counts.published} />
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les devoirs réels Supabase ne sont pas chargés.
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="sn-card p-5 space-y-3 animate-pulse">
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="h-4 w-1/2 rounded bg-gray-100" />
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

      {!isLoading && !error && homeworks.length === 0 && (
        <div className="sn-card p-8 text-center space-y-2">
          <div className="text-lg font-semibold text-gray-900">Aucun devoir pour le moment</div>
          <div className="text-sm text-gray-500">
            Les devoirs publiés par vos enseignants apparaîtront ici.
          </div>
        </div>
      )}

      {!isLoading && !error && homeworks.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {homeworks.map((homework) => (
            <HomeworkCard
              key={homework.id}
              homework={homework}
              onOpen={() => {
                if (homework.submissionMode === "file_upload") {
                  navigate(`/app/student/homework/${homework.id}`);
                  return;
                }

                navigate(`/app/student/assessments/${homework.id}`);
              }}
              onResult={() => {
                if (homework.submissionMode === "file_upload") {
                  navigate(`/app/student/homework/${homework.id}`);
                  return;
                }

                navigate(`/app/student/assessments/${homework.id}/result`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="sn-card p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function HomeworkCard({
  homework,
  onOpen,
  onResult,
}: {
  homework: HomeworkView;
  onOpen: () => void;
  onResult: () => void;
}) {
  const isFinished = homework.studentStatus === "Corrigé" || homework.studentStatus === "Publié";

  return (
    <div className="sn-card sn-card-hover p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate">{homework.title}</div>
          <div className="text-sm text-gray-500">
            {homework.courseTitle} • {homework.sectionTitle}
          </div>
          <div className="mt-1 text-sm text-gray-500">{homework.dueLabel}</div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={statusBadgeClass(homework.studentStatus)}>{homework.studentStatus}</span>
          {homework.scoreLabel && (
            <span className="sn-badge sn-badge-green">{homework.scoreLabel}</span>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {isFinished ? (
          <button className="sn-btn-primary sn-press" onClick={onResult} type="button">
            Voir résultat
          </button>
        ) : (
          <button className="sn-btn-primary sn-press" onClick={onOpen} type="button">
            {homework.studentStatus === "Soumis" ? "Voir le rendu" : "Déposer"}
          </button>
        )}
      </div>
    </div>
  );
}