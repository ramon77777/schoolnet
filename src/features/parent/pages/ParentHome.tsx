import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type AssessmentType = "Quiz" | "Devoir" | "Examen";

type Child = {
  id: string;
  label: string;
  className: string;
};

type Row = {
  id: string;
  type: AssessmentType;
  title: string;
  courseTitle: string;
  sectionTitle: string;
  className: string;
  when: string;

  childId: string;
  childLabel: string;

  status: "Terminé" | "À faire";
  scoreLabel?: string;
  submittedAtISO?: string;
  dueAtISO?: string;
  createdAtISO?: string;
};

function monthLabel(d = new Date()) {
  const m = d.toLocaleString("fr-FR", { month: "long" });
  const y = d.getFullYear();

  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return iso;
  }

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();

  return `${dd}/${mm}/${yy}`;
}

function parseScore(score?: string | number | null) {
  if (score === undefined || score === null) {
    return null;
  }

  const s = String(score).trim();

  const m = s.match(
    /^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/,
  );

  if (!m) {
    return {
      label: s,
      ratio: null as number | null,
    };
  }

  const got = Number(m[1].replace(",", "."));
  const max = Number(m[2].replace(",", "."));

  if (
    !Number.isFinite(got) ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return {
      label: s,
      ratio: null as number | null,
    };
  }

  return {
    label: `${got}/${max}`,
    ratio: Math.round((got / max) * 100),
  };
}

function badgeTypeClass(type: AssessmentType) {
  if (type === "Examen") {
    return "sn-badge sn-badge-red";
  }

  if (type === "Devoir") {
    return "sn-badge sn-badge-blue";
  }

  return "sn-badge sn-badge-gray";
}

function typeIcon(type: AssessmentType) {
  if (type === "Quiz") return "🧩";
  if (type === "Devoir") return "📝";

  return "🧪";
}

function getISOWeek(d: Date) {
  const date = new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  );

  const dayNum = date.getUTCDay() || 7;

  date.setUTCDate(
    date.getUTCDate() + 4 - dayNum,
  );

  const yearStart = new Date(
    Date.UTC(date.getUTCFullYear(), 0, 1),
  );

  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );

  return {
    year: date.getUTCFullYear(),
    week: weekNo,
  };
}

function weekLabelFromISO(iso?: string) {
  if (!iso) return null;

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  const w = getISOWeek(d);

  return `Semaine ${w.week} • ${w.year}`;
}

function sortKey(row: Row) {
  if (row.submittedAtISO) {
    const t = new Date(row.submittedAtISO).getTime();

    return Number.isFinite(t) ? t : 0;
  }

  if (row.dueAtISO) {
    const t = new Date(row.dueAtISO).getTime();

    return Number.isFinite(t) ? t : 0;
  }

  return -1;
}

function toAssessmentType(value: string): AssessmentType {
  if (value === "quiz") {
    return "Quiz";
  }

  if (value === "assignment") {
    return "Devoir";
  }

  return "Examen";
}

function isCompletedSubmission(
  status?: string | null,
) {
  return (
    status === "submitted" ||
    status === "graded" ||
    status === "published"
  );
}

function cleanNumeric(value: unknown) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  return Number.isInteger(n)
    ? String(n)
    : String(n);
}

function makeScoreLabel(
  score: unknown,
  maxScore: unknown,
) {
  const scoreText = cleanNumeric(score);
  const maxText = cleanNumeric(maxScore);

  if (!scoreText) {
    return undefined;
  }

  if (
    !maxText ||
    Number(maxScore) <= 0
  ) {
    return scoreText;
  }

  return `${scoreText}/${maxText}`;
}

function isCurrentMonth(iso?: string) {
  if (!iso) return false;

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

export default function ParentHome() {
  const navigate = useNavigate();

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] =
    useState("");

  const [rows, setRows] = useState<Row[]>([]);

  const [loadingChildren, setLoadingChildren] =
    useState(true);

  const [loadingRows, setLoadingRows] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const selectedChild = useMemo(
    () =>
      children.find(
        (child) =>
          child.id === selectedChildId,
      ) || children[0],
    [children, selectedChildId],
  );

  /*
   * ============================================================
   * Chargement des enfants réellement liés au compte Parent
   * ============================================================
   */

  const loadChildren =
    useCallback(async () => {
      setLoadingChildren(true);
      setError(null);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) {
          throw authError;
        }

        if (!user) {
          throw new Error(
            "Session parent introuvable.",
          );
        }

        const {
          data: parentProfile,
          error: parentError,
        } = await supabase
          .from("profiles")
          .select("child_ids")
          .eq("id", user.id)
          .eq("role", "parent")
          .maybeSingle();

        if (parentError) {
          throw parentError;
        }

        const childIds = Array.isArray(
          parentProfile?.child_ids,
        )
          ? parentProfile.child_ids
          : [];

        if (childIds.length === 0) {
          setChildren([]);
          setSelectedChildId("");
          setRows([]);
          return;
        }

        const [
          childProfilesResult,
          childClassAssignmentsResult,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              `
              id,
              full_name,
              role
              `,
            )
            .in("id", childIds)
            .eq("role", "student")
            .order("full_name"),

          supabase
            .from("class_students")
            .select(
              `
              student_id,
              class_id
              `,
            )
            .in("student_id", childIds),
        ]);

        if (childProfilesResult.error) {
          throw childProfilesResult.error;
        }

        if (childClassAssignmentsResult.error) {
          throw childClassAssignmentsResult.error;
        }

        const childProfiles =
          childProfilesResult.data ?? [];

        const childClassAssignments =
          childClassAssignmentsResult.data ?? [];

        /*
        * Récupérer les classes réellement affectées
        * aux élèves.
        */
        const classIds = Array.from(
          new Set(
            childClassAssignments
              .map((row) => row.class_id)
              .filter(
                (classId): classId is string =>
                  typeof classId === "string" &&
                  classId.trim().length > 0,
              ),
          ),
        );

        const classNameById =
          new Map<string, string>();

        if (classIds.length > 0) {
          const {
            data: classRows,
            error: classesError,
          } = await supabase
            .from("classes")
            .select("id, name")
            .in("id", classIds);

          if (classesError) {
            throw classesError;
          }

          for (const classRow of classRows ?? []) {
            classNameById.set(
              classRow.id,
              classRow.name?.trim() ||
                "Classe non renseignée",
            );
          }
        }

        /*
        * Associer chaque élève à sa classe.
        */
        const classIdByStudentId =
          new Map<string, string>();

        for (const assignment of childClassAssignments) {
          if (
            assignment.student_id &&
            assignment.class_id &&
            !classIdByStudentId.has(
              assignment.student_id,
            )
          ) {
            classIdByStudentId.set(
              assignment.student_id,
              assignment.class_id,
            );
          }
        }

        /*
        * Modèle final utilisé par le tableau de bord.
        */
        const nextChildren: Child[] =
          childProfiles.map((child) => {
            const classId =
              classIdByStudentId.get(child.id);

            const resolvedClassName = classId
              ? classNameById.get(classId)
              : undefined;

            return {
              id: child.id,
              label:
                child.full_name?.trim() ||
                "Élève",
              className:
                resolvedClassName ||
                "Classe non renseignée",
            };
          });

        setChildren(nextChildren);

        setSelectedChildId((current) => {
          if (
            nextChildren.some(
              (child) =>
                child.id === current,
            )
          ) {
            return current;
          }

          return nextChildren[0]?.id ?? "";
        });
      } catch (err) {
        console.error(
          "[ParentHome] loadChildren error:",
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : "Impossible de charger les enfants liés au compte parent.",
        );
      } finally {
        setLoadingChildren(false);
      }
    }, []);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  /*
   * ============================================================
   * Chargement du suivi réel de l'enfant sélectionné
   * ============================================================
   */

  const loadRows =
    useCallback(async () => {
      if (
        !selectedChildId ||
        !selectedChild
      ) {
        setRows([]);
        return;
      }

      setLoadingRows(true);
      setError(null);
      setRows([]);

      try {
        /*
         * 1. Cours suivis par l'enfant
         */

        const {
          data: enrollmentRows,
          error: enrollmentError,
        } = await supabase
          .from("course_enrollments")
          .select("course_id")
          .eq(
            "student_id",
            selectedChildId,
          );

        if (enrollmentError) {
          throw enrollmentError;
        }

        const courseIds = Array.from(
          new Set(
            (enrollmentRows ?? [])
              .map(
                (row) => row.course_id,
              )
              .filter(Boolean),
          ),
        );

        if (courseIds.length === 0) {
          setRows([]);
          return;
        }

        /*
         * 2. Cours
         * 3. Sections
         * 4. Évaluations publiées
         */

        const [
          coursesResult,
          sectionsResult,
          assessmentsResult,
        ] = await Promise.all([
          supabase
            .from("courses")
            .select("id, title")
            .in("id", courseIds),

          supabase
            .from("course_sections")
            .select(
              "id, course_id, title",
            )
            .in(
              "course_id",
              courseIds,
            ),

          supabase
            .from("assessments")
            .select(
              `
              id,
              course_id,
              section_id,
              type,
              title,
              due_at,
              max_score,
              created_at,
              status
              `,
            )
            .in(
              "course_id",
              courseIds,
            )
            .eq(
              "status",
              "published",
            )
            .order("due_at", {
              ascending: false,
              nullsFirst: false,
            }),
        ]);

        if (coursesResult.error) {
          throw coursesResult.error;
        }

        if (sectionsResult.error) {
          throw sectionsResult.error;
        }

        if (assessmentsResult.error) {
          throw assessmentsResult.error;
        }

        const assessments =
          assessmentsResult.data ?? [];

        if (
          assessments.length === 0
        ) {
          setRows([]);
          return;
        }

        /*
        * 5. Soumissions Quiz / Examens
        * 6. Soumissions Devoirs
        *
        * Lecture sécurisée via les RPC Parent.
        * Le Parent ne reçoit les notes
        * que lorsqu'elles ont été publiées.
        */

        const [
          assessmentSubmissionsResult,
          homeworkSubmissionsResult,
        ] = await Promise.all([
          supabase.rpc(
            "get_parent_child_assessment_submissions",
            {
              p_child_id: selectedChildId,
            },
          ),

          supabase.rpc(
            "get_parent_child_homework_submissions",
            {
              p_child_id: selectedChildId,
            },
          ),
        ]);

        if (
          assessmentSubmissionsResult.error
        ) {
          throw assessmentSubmissionsResult.error;
        }

        if (
          homeworkSubmissionsResult.error
        ) {
          throw homeworkSubmissionsResult.error;
        }

        /*
         * Index des cours
         */

        const courseMap =
          new Map<string, string>();

        for (
          const course of
          coursesResult.data ?? []
        ) {
          courseMap.set(
            course.id,
            course.title,
          );
        }

        /*
         * Index des sections
         */

        const sectionMap =
          new Map<string, string>();

        for (
          const section of
          sectionsResult.data ?? []
        ) {
          sectionMap.set(
            section.id,
            section.title,
          );
        }

        /*
         * Index assessment_submissions
         */

        const assessmentSubmissionMap =
          new Map<
            string,
            {
              status: string;
              score: unknown;
              submitted_at:
                | string
                | null;
              published_at:
                | string
                | null;
            }
          >();

        for (
          const submission of
          assessmentSubmissionsResult.data ??
          []
        ) {
          assessmentSubmissionMap.set(
            submission.assessment_id,
            {
              status:
                submission.status,
              score:
                submission.score,
              submitted_at:
                submission.submitted_at,
              published_at:
                submission.published_at,
            },
          );
        }

        /*
         * Index homework_submissions
         */

        const homeworkSubmissionMap =
          new Map<
            string,
            {
              status: string;
              score: unknown;
              submitted_at:
                | string
                | null;
              published_at:
                | string
                | null;
            }
          >();

        for (
          const submission of
          homeworkSubmissionsResult.data ??
          []
        ) {
          homeworkSubmissionMap.set(
            submission.homework_id,
            {
              status:
                submission.status,
              score:
                submission.score,
              submitted_at:
                submission.submitted_at,
              published_at:
                submission.published_at,
            },
          );
        }

        /*
         * Transformation vers le modèle
         * utilisé par l'interface
         */

        const nextRows: Row[] =
          assessments.map(
            (assessment) => {
              const uiType =
                toAssessmentType(
                  String(
                    assessment.type,
                  ),
                );

              const assessmentSubmission =
                assessmentSubmissionMap.get(
                  assessment.id,
                );

              const homeworkSubmission =
                homeworkSubmissionMap.get(
                  assessment.id,
                );

              /*
               * Pour un devoir :
               * priorité à homework_submissions.
               *
               * Pour Quiz/Examen :
               * priorité à assessment_submissions.
               *
               * Le fallback conserve la compatibilité
               * avec d'anciennes données éventuelles.
               */

              const submission =
                uiType === "Devoir"
                  ? homeworkSubmission ??
                    assessmentSubmission
                  : assessmentSubmission ??
                    homeworkSubmission;

              const done =
                isCompletedSubmission(
                  submission?.status,
                );

              /*
               * Le parent ne voit la note
               * que lorsqu'elle a été publiée.
               */

              const publishedScore =
                submission?.status ===
                "published"
                  ? makeScoreLabel(
                      submission.score,
                      assessment.max_score,
                    )
                  : undefined;

              return {
                id: assessment.id,

                type: uiType,

                title:
                  assessment.title,

                courseTitle:
                  courseMap.get(
                    assessment.course_id,
                  ) || "Cours",

                sectionTitle:
                  assessment.section_id
                    ? sectionMap.get(
                        assessment.section_id,
                      ) || "Section"
                    : "Cours",

                className:
                  selectedChild.className,

                when:
                  formatDate(
                    assessment.due_at,
                  ) !== "—"
                    ? formatDate(
                        assessment.due_at,
                      )
                    : formatDate(
                        assessment.created_at,
                      ),

                childId:
                  selectedChild.id,

                childLabel:
                  selectedChild.label,

                status: done
                  ? "Terminé"
                  : "À faire",

                scoreLabel:
                  publishedScore,

                submittedAtISO:
                  done &&
                  submission?.submitted_at
                    ? submission.submitted_at
                    : undefined,

                dueAtISO:
                  assessment.due_at ||
                  undefined,

                createdAtISO:
                  assessment.created_at ||
                  undefined,
              };
            },
          );

        setRows(nextRows);
      } catch (err) {
        console.error(
          "[ParentHome] loadRows error:",
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : "Impossible de charger le suivi de l'élève.",
        );
      } finally {
        setLoadingRows(false);
      }
    }, [
      selectedChildId,
      selectedChild,
    ]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  /*
   * ============================================================
   * Données du mois actuel
   * ============================================================
   */

  const monthRows = useMemo(() => {
    return rows.filter((row) => {
      const referenceDate =
        row.submittedAtISO ||
        row.dueAtISO ||
        row.createdAtISO;

      return isCurrentMonth(
        referenceDate,
      );
    });
  }, [rows]);

  /*
   * ============================================================
   * Focus mensuel
   * ============================================================
   */

  const focus = useMemo(() => {
    const total =
      monthRows.length;

    const done =
      monthRows.filter(
        (row) =>
          row.status === "Terminé",
      ).length;

    const todo =
      monthRows.filter(
        (row) =>
          row.status === "À faire",
      ).length;

    const ratios = monthRows
      .map(
        (row) =>
          parseScore(
            row.scoreLabel,
          )?.ratio,
      )
      .filter(
        (value): value is number =>
          typeof value ===
          "number",
      );

    const avg = ratios.length
      ? Math.round(
          ratios.reduce(
            (a, b) => a + b,
            0,
          ) / ratios.length,
        )
      : null;

    return {
      total,
      done,
      todo,
      avg,
    };
  }, [monthRows]);

  /*
   * ============================================================
   * Dernière soumission du mois
   * ============================================================
   */

  const latest = useMemo(() => {
    const doneRows = monthRows
      .filter(
        (row) =>
          row.status ===
            "Terminé" &&
          row.submittedAtISO,
      )
      .slice()
      .sort((a, b) =>
        (
          b.submittedAtISO || ""
        ).localeCompare(
          a.submittedAtISO || "",
        ),
      );

    return doneRows[0] || null;
  }, [monthRows]);

  /*
   * ============================================================
   * KPI
   * ============================================================
   */

  const kpis = useMemo(() => {
    const total =
      monthRows.length;

    const completed =
      monthRows.filter(
        (row) =>
          row.status === "Terminé",
      ).length;

    const pending =
      monthRows.filter(
        (row) =>
          row.status === "À faire",
      ).length;

    const awaitingCorrection =
      monthRows.filter(
        (row) =>
          row.status ===
            "Terminé" &&
          (row.type === "Devoir" ||
            row.type ===
              "Examen") &&
          !row.scoreLabel,
      ).length;

    const quiz =
      monthRows.filter(
        (row) =>
          row.type === "Quiz",
      ).length;

    const devoir =
      monthRows.filter(
        (row) =>
          row.type === "Devoir",
      ).length;

    const examen =
      monthRows.filter(
        (row) =>
          row.type === "Examen",
      ).length;

    const ratios = monthRows
      .map(
        (row) =>
          parseScore(
            row.scoreLabel,
          )?.ratio,
      )
      .filter(
        (value): value is number =>
          typeof value ===
          "number",
      );

    const avg = ratios.length
      ? Math.round(
          ratios.reduce(
            (a, b) => a + b,
            0,
          ) / ratios.length,
        )
      : null;

    return {
      total,
      completed,
      pending,
      awaitingCorrection,
      quiz,
      devoir,
      examen,
      avg,
    };
  }, [monthRows]);

  const typeSplit = useMemo(() => {
    const total = Math.max(
      1,
      kpis.total,
    );

    return {
      quizPct: Math.round(
        (kpis.quiz / total) *
          100,
      ),

      devoirPct: Math.round(
        (kpis.devoir / total) *
          100,
      ),

      examenPct: Math.round(
        (kpis.examen / total) *
          100,
      ),
    };
  }, [kpis]);

  /*
   * ============================================================
   * Timeline
   * ============================================================
   */

  type TimelineFilter =
    | "Tous"
    | "À faire"
    | "Terminé";

  const [
    timelineFilter,
    setTimelineFilter,
  ] =
    useState<TimelineFilter>(
      "Tous",
    );

  const timelineSorted =
    useMemo(() => {
      const sorted = monthRows
        .slice()
        .sort(
          (a, b) =>
            sortKey(b) -
            sortKey(a),
        );

      return timelineFilter ===
        "Tous"
        ? sorted
        : sorted.filter(
            (row) =>
              row.status ===
              timelineFilter,
          );
    }, [
      monthRows,
      timelineFilter,
    ]);

  const timelineDone =
    useMemo(
      () =>
        timelineSorted.filter(
          (row) =>
            row.status ===
            "Terminé",
        ),
      [timelineSorted],
    );

  const timelineTodo =
    useMemo(
      () =>
        timelineSorted.filter(
          (row) =>
            row.status ===
            "À faire",
        ),
      [timelineSorted],
    );

  const groupedDone =
    useMemo(() => {
      const groups =
        new Map<
          string,
          Row[]
        >();

      for (const row of timelineDone) {
        const label =
          weekLabelFromISO(
            row.submittedAtISO,
          ) || "Soumis";

        const arr =
          groups.get(label) || [];

        arr.push(row);

        groups.set(
          label,
          arr,
        );
      }

      return Array.from(
        groups.entries(),
      ).map(
        ([label, items]) => ({
          label,

          items: items
            .slice()
            .sort(
              (a, b) =>
                sortKey(b) -
                sortKey(a),
            ),
        }),
      );
    }, [timelineDone]);

  /*
   * ============================================================
   * États de chargement / absence d'enfant
   * ============================================================
   */

  if (loadingChildren) {
    return (
      <div className="space-y-4">
        <div className="text-xl font-semibold">
          Tableau de bord Parent
        </div>

        <div className="sn-card p-6">
          <div className="text-sm text-gray-600">
            Chargement des enfants liés au compte…
          </div>
        </div>
      </div>
    );
  }

  if (
    !loadingChildren &&
    children.length === 0
  ) {
    return (
      <div className="space-y-4">
        <div className="text-xl font-semibold">
          Tableau de bord Parent
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="sn-card p-6">
          <div className="text-lg font-semibold text-gray-900">
            Aucun enfant lié
          </div>

          <div className="mt-2 text-sm text-gray-600">
            Aucun profil élève n’est actuellement rattaché à ce compte parent.
          </div>

          <button
            type="button"
            className="sn-btn-primary sn-press mt-4"
            onClick={() =>
              void loadChildren()
            }
          >
            Actualiser
          </button>
        </div>
      </div>
    );
  }

  /*
   * ============================================================
   * Interface
   * ============================================================
   */

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Résumé du mois */}

      <div className="sn-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">
              Résumé du mois
            </div>

            <div className="text-2xl font-bold text-gray-900">
              {monthLabel()}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="sn-badge sn-badge-gray">
                👨‍👩‍👧 Parent
              </span>

              <span className="sn-badge sn-badge-gray">
                🎓{" "}
                {selectedChild?.className}
              </span>

              {focus.avg !==
                null && (
                <span className="sn-badge sn-badge-green">
                  📊 Moyenne{" "}
                  {focus.avg}%
                </span>
              )}

              {latest?.submittedAtISO && (
                <span className="sn-badge sn-badge-gray">
                  Dernière soumission :{" "}
                  {formatDate(
                    latest.submittedAtISO,
                  )}
                </span>
              )}

              {loadingRows && (
                <span className="sn-badge sn-badge-gray">
                  Chargement…
                </span>
              )}
            </div>

            <div className="mt-3 text-sm text-gray-600 max-w-2xl">
              Suivi rapide :
              performances,
              évaluations terminées,
              à faire et commentaires
              enseignants.
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap gap-2 justify-end">
              {children.map(
                (child) => {
                  const active =
                    child.id ===
                    selectedChildId;

                  return (
                    <button
                      key={
                        child.id
                      }
                      type="button"
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                        active
                          ? "bg-blue-600 text-white shadow"
                          : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                      }`}
                      onClick={() =>
                        setSelectedChildId(
                          child.id,
                        )
                      }
                      title={`Voir ${child.label}`}
                    >
                      {
                        child.label
                      }

                      <span
                        className={`${
                          active
                            ? "text-white/80"
                            : "text-gray-500"
                        } ml-2 text-xs`}
                      >
                        {
                          child.className
                        }
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="sn-badge sn-badge-gray">
                {focus.done}/
                {focus.total}{" "}
                terminées
              </span>

              {focus.todo > 0 && (
                <span className="sn-badge sn-badge-blue">
                  {focus.todo} à
                  faire
                </span>
              )}

              <button
                type="button"
                className="sn-btn-primary sn-press"
                onClick={() =>
                  navigate(
                    "/app/parent/results",
                  )
                }
              >
                Voir résultats
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <InfoMini
            title="Progression"
            value={
              focus.avg !== null
                ? `${focus.avg}%`
                : "—"
            }
            desc={
              focus.avg === null
                ? "Pas encore de note publiée ce mois-ci."
                : "Basé sur les notes publiées ce mois-ci."
            }
          />

          <InfoMini
            title="Dernière activité"
            value={
              latest
                ? latest.title
                : "—"
            }
            desc={
              latest?.submittedAtISO
                ? `Soumis le ${formatDate(
                    latest.submittedAtISO,
                  )}`
                : "Aucune soumission ce mois-ci"
            }
          />

          <InfoMini
            title="Prochaine étape"
            value={
              focus.todo > 0
                ? "Vérifier les évaluations à faire"
                : "Tout est à jour 🎉"
            }
            desc={
              focus.todo > 0
                ? "Ouvre la liste des résultats pour voir les détails."
                : "Tu peux consulter les commentaires enseignants."
            }
          />
        </div>
      </div>

      {/* KPI */}

      <div className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">
              Aperçu (KPI)
            </div>

            <div className="text-sm text-gray-500">
              Synthèse rapide des
              performances et du
              suivi ce mois-ci.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="sn-badge sn-badge-gray">
              🎓{" "}
              {
                selectedChild?.label
              }
            </span>

            <span className="sn-badge sn-badge-gray">
              {monthLabel()}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Moyenne du mois"
            value={
              kpis.avg !== null
                ? `${kpis.avg}%`
                : "—"
            }
            icon="📊"
            hint="Basé sur les scores publiés disponibles"
            right={
              kpis.avg !==
              null ? (
                <span className="sn-badge sn-badge-green">
                  OK
                </span>
              ) : (
                <span className="sn-badge sn-badge-gray">
                  N/A
                </span>
              )
            }
          />

          <KpiCard
            title="Évaluations terminées"
            value={`${kpis.completed}`}
            icon="✅"
            hint={`Sur ${kpis.total} publiées ce mois-ci`}
            right={
              <span className="sn-badge sn-badge-green">
                Soumis
              </span>
            }
          />

          <KpiCard
            title="À faire"
            value={`${kpis.pending}`}
            icon="⏳"
            hint="Non soumises"
            right={
              kpis.pending >
              0 ? (
                <span className="sn-badge sn-badge-blue">
                  Action
                </span>
              ) : (
                <span className="sn-badge sn-badge-green">
                  OK
                </span>
              )
            }
          />

          <KpiCard
            title="En attente de correction"
            value={`${kpis.awaitingCorrection}`}
            icon="🧑‍🏫"
            hint="Devoir/Examen soumis sans note publiée"
            right={
              kpis.awaitingCorrection >
              0 ? (
                <span className="sn-badge sn-badge-gray">
                  En cours
                </span>
              ) : (
                <span className="sn-badge sn-badge-green">
                  OK
                </span>
              )
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 p-4 bg-white lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">
                Répartition des
                évaluations
              </div>

              <div className="flex items-center gap-2">
                <span className="sn-badge sn-badge-gray">
                  Quiz{" "}
                  {kpis.quiz}
                </span>

                <span className="sn-badge sn-badge-gray">
                  Devoir{" "}
                  {kpis.devoir}
                </span>

                <span className="sn-badge sn-badge-gray">
                  Examen{" "}
                  {kpis.examen}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
                <div
                  className="h-full bg-blue-600"
                  style={{
                    width: `${typeSplit.quizPct}%`,
                  }}
                />

                <div
                  className="h-full bg-indigo-500"
                  style={{
                    width: `${typeSplit.devoirPct}%`,
                  }}
                />

                <div
                  className="h-full bg-red-600"
                  style={{
                    width: `${typeSplit.examenPct}%`,
                  }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>
                  Quiz{" "}
                  {
                    typeSplit.quizPct
                  }
                  %
                </span>

                <span>
                  Devoir{" "}
                  {
                    typeSplit.devoirPct
                  }
                  %
                </span>

                <span>
                  Examen{" "}
                  {
                    typeSplit.examenPct
                  }
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 bg-white">
            <div className="text-sm font-semibold text-gray-900">
              Score moyen
            </div>

            <div className="mt-1 text-2xl font-bold text-gray-900">
              {kpis.avg !== null
                ? `${kpis.avg}%`
                : "—"}
            </div>

            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-blue-600"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      kpis.avg ?? 0,
                    ),
                  )}%`,
                }}
              />
            </div>

            <div className="mt-2 text-xs text-gray-500">
              *La moyenne est
              calculée à partir des
              notes publiées
              disponibles.*
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}

      <div className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">
              Timeline du mois
            </div>

            <div className="text-sm text-gray-500">
              Chronologie des
              évaluations du mois,
              groupée par semaine
              avec leurs statuts.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill
              label="Tous"
              active={
                timelineFilter ===
                "Tous"
              }
              onClick={() =>
                setTimelineFilter(
                  "Tous",
                )
              }
            />

            <Pill
              label="À faire"
              active={
                timelineFilter ===
                "À faire"
              }
              onClick={() =>
                setTimelineFilter(
                  "À faire",
                )
              }
              tone="info"
            />

            <Pill
              label="Terminé"
              active={
                timelineFilter ===
                "Terminé"
              }
              onClick={() =>
                setTimelineFilter(
                  "Terminé",
                )
              }
              tone="success"
            />
          </div>
        </div>

        {/* À venir */}

        {timelineTodo.length >
          0 && (
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="font-semibold text-gray-900">
                À venir
              </div>

              <span className="sn-badge sn-badge-blue">
                {
                  timelineTodo.length
                }{" "}
                à faire
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {timelineTodo.map(
                (row) => (
                  <TimelineRow
                    key={`todo-${row.id}`}
                    row={row}
                    rightHint={
                      row.when
                    }
                    statusBadge="À faire"
                    statusBadgeClass="sn-badge sn-badge-blue"
                    dotClass="bg-blue-600"
                    onDetail={() =>
                      navigate(
                        `/app/parent/results/${row.id}?child=${row.childId}`,
                      )
                    }
                    onList={() =>
                      navigate(
                        "/app/parent/results",
                      )
                    }
                  />
                ),
              )}
            </div>
          </div>
        )}

        {/* Terminé par semaine */}

        {groupedDone.length >
        0 ? (
          <div className="space-y-3">
            {groupedDone.map(
              (group) => (
                <div
                  key={
                    group.label
                  }
                  className="rounded-2xl border border-gray-100 bg-white overflow-hidden"
                >
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <div className="font-semibold text-gray-900">
                      {
                        group.label
                      }
                    </div>

                    <span className="sn-badge sn-badge-gray">
                      {
                        group.items
                          .length
                      }{" "}
                      soumis
                    </span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {group.items.map(
                      (row) => {
                        const awaiting =
                          row.status ===
                            "Terminé" &&
                          (row.type ===
                            "Devoir" ||
                            row.type ===
                              "Examen") &&
                          !row.scoreLabel;

                        const badge =
                          row.scoreLabel
                            ? String(
                                row.scoreLabel,
                              )
                            : awaiting
                              ? "À corriger"
                              : "Soumis";

                        const badgeClass =
                          row.scoreLabel
                            ? "sn-badge sn-badge-green"
                            : awaiting
                              ? "sn-badge sn-badge-gray"
                              : "sn-badge sn-badge-green";

                        const dot =
                          row.scoreLabel
                            ? "bg-green-600"
                            : awaiting
                              ? "bg-amber-500"
                              : "bg-green-600";

                        const hint =
                          row.submittedAtISO
                            ? `Soumis le ${formatDate(
                                row.submittedAtISO,
                              )}`
                            : "Soumis";

                        return (
                          <div
                            key={`done-${row.id}`}
                            className="px-5 py-4"
                          >
                            <div className="flex items-start gap-4">
                              <div className="pt-1">
                                <div
                                  className={`h-3 w-3 rounded-full ${dot} shadow-sm ring-4 ring-white`}
                                />

                                <div className="mx-auto mt-2 h-full w-px bg-gray-200" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="font-semibold text-gray-900">
                                        <span className="mr-2">
                                          {typeIcon(
                                            row.type,
                                          )}
                                        </span>

                                        {
                                          row.title
                                        }
                                      </div>

                                      <span
                                        className={badgeTypeClass(
                                          row.type,
                                        )}
                                      >
                                        {
                                          row.type
                                        }
                                      </span>

                                      <span
                                        className={
                                          badgeClass
                                        }
                                      >
                                        {
                                          badge
                                        }
                                      </span>
                                    </div>

                                    <div className="mt-1 text-sm text-gray-500">
                                      {
                                        row.courseTitle
                                      }{" "}
                                      •{" "}
                                      {
                                        row.sectionTitle
                                      }
                                    </div>

                                    <div className="mt-1 text-xs text-gray-500">
                                      {
                                        selectedChild?.label
                                      }{" "}
                                      •{" "}
                                      {
                                        row.className
                                      }{" "}
                                      •{" "}
                                      {
                                        hint
                                      }
                                    </div>

                                    {awaiting && (
                                      <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-gray-700">
                                        🧑‍🏫
                                        Correction
                                        en cours :
                                        le
                                        commentaire
                                        enseignant
                                        apparaîtra
                                        dès que
                                        la
                                        correction
                                        sera
                                        publiée.
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="sn-btn-ghost sn-press"
                                      onClick={() =>
                                        navigate(
                                          "/app/parent/results",
                                        )
                                      }
                                    >
                                      Liste
                                    </button>

                                    <button
                                      type="button"
                                      className="sn-btn-primary sn-press"
                                      onClick={() =>
                                        navigate(
                                          `/app/parent/results/${row.id}?child=${row.childId}`,
                                        )
                                      }
                                    >
                                      Voir
                                      détail
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-600">
            {loadingRows
              ? "Chargement des évaluations…"
              : "Aucun élément terminé pour ce filtre ce mois-ci."}
          </div>
        )}

        <div className="text-xs text-gray-500">
          *Groupement par semaine
          basé sur les dates réelles
          de soumission enregistrées
          dans SchoolNet.*
        </div>
      </div>
    </div>
  );
}

function InfoMini({
  title,
  value,
  desc,
}: {
  title: string;
  value: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 p-4 bg-white">
      <div className="text-xs text-gray-500">
        {title}
      </div>

      <div className="mt-1 text-sm font-semibold text-gray-900">
        {value}
      </div>

      <div className="mt-1 text-sm text-gray-600">
        {desc}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon,
  hint,
  right,
}: {
  title: string;
  value: string;
  icon: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="sn-card sn-card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-gray-500">
            {title}
          </div>

          <div className="mt-1 text-2xl font-bold text-gray-900">
            <span className="mr-2">
              {icon}
            </span>

            {value}
          </div>

          {hint && (
            <div className="mt-1 text-xs text-gray-500">
              {hint}
            </div>
          )}
        </div>

        {right}
      </div>
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
  tone?: "info" | "success";
}) {
  const base =
    "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";

  const activeCls =
    tone === "success"
      ? "bg-green-600 text-white"
      : tone === "info"
        ? "bg-blue-600 text-white"
        : "bg-gray-900 text-white";

  const inactiveCls =
    tone === "success"
      ? "bg-green-50 text-green-700 hover:bg-green-100"
      : tone === "info"
        ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
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

function TimelineRow({
  row,
  rightHint,
  statusBadge,
  statusBadgeClass,
  dotClass,
  onDetail,
  onList,
}: {
  row: Row;
  rightHint: string;
  statusBadge: string;
  statusBadgeClass: string;
  dotClass: string;
  onDetail: () => void;
  onList: () => void;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="pt-1">
          <div
            className={`h-3 w-3 rounded-full ${dotClass} shadow-sm ring-4 ring-white`}
          />

          <div className="mx-auto mt-2 h-full w-px bg-gray-200" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 transition sn-press hover:-translate-y-0.5 hover:shadow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-gray-900">
                    <span className="mr-2">
                      {typeIcon(
                        row.type,
                      )}
                    </span>

                    {row.title}
                  </div>

                  <span
                    className={badgeTypeClass(
                      row.type,
                    )}
                  >
                    {row.type}
                  </span>

                  <span
                    className={
                      statusBadgeClass
                    }
                  >
                    {statusBadge}
                  </span>
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {row.courseTitle} •{" "}
                  {row.sectionTitle}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {row.childLabel} •{" "}
                  {row.className} •{" "}
                  {rightHint}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="sn-btn-ghost sn-press"
                  onClick={onList}
                >
                  Liste
                </button>

                <button
                  type="button"
                  className="sn-btn-primary sn-press"
                  onClick={onDetail}
                >
                  Voir détail
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}