// src/features/admin/pages/AdminDashboard.tsx
import { useEffect, useMemo, useState } from "react";
import {
  ensureSeed,
  getAssessments,
  getAttempts,
  getStudents,
  type Attempt,
  type MockAssessment,
} from "@/lib/mockStore";

type ActivityItem = {
  id: string;
  icon: string;
  text: string;
  badge?: "Nouveau" | "À traiter";
  ts: number;
};

type AlertItem = {
  id: string;
  title: string;
  text: string;
  badge: "Info" | "Nouveau" | "À traiter";
};

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function safeTime(iso?: string) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function computeClassesFromAssessments(assessments: MockAssessment[]) {
  // vu qu'on n'a pas encore "classes" en base, on dérive des className des évaluations
  const classes = assessments.map((a) => a.className).filter(Boolean) as string[];
  return uniq(classes).sort();
}

function labelAttemptStatus(s: Attempt["status"]) {
  if (s === "submitted") return "Soumis";
  if (s === "graded") return "Corrigé";
  if (s === "published") return "Publié";
  return "En cours";
}

export default function AdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    ensureSeed();
  }, []);

  // ✅ auto refresh si localStorage change depuis une autre page/onglet
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("sn_")) setRefreshKey((k) => k + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const { kpis, activity, alerts } = useMemo(() => {
    const assessments = getAssessments();
    const publishedAssessments = assessments.filter((a) => a.status === "published");
    const attempts = getAttempts();
    const students = getStudents();

    const classes = computeClassesFromAssessments(assessments);

    const counts = {
      attemptsTotal: attempts.length,
      submitted: attempts.filter((a) => a.status === "submitted").length,
      graded: attempts.filter((a) => a.status === "graded").length,
      published: attempts.filter((a) => a.status === "published").length,
      inProgress: attempts.filter((a) => a.status === "in_progress").length,
      assessmentsPublished: publishedAssessments.length,
      students: students.length,
      classes: classes.length,
    };

    // ===== Activity (derivée des attempts) =====
    const recentAttempts = [...attempts]
      .sort((a, b) => {
        // priorité à la date la plus récente parmi publishedAt / gradedAt / submittedAt
        const ta = Math.max(
          safeTime(a.grading?.publishedAtISO),
          safeTime(a.grading?.gradedAtISO),
          safeTime(a.submittedAtISO)
        );
        const tb = Math.max(
          safeTime(b.grading?.publishedAtISO),
          safeTime(b.grading?.gradedAtISO),
          safeTime(b.submittedAtISO)
        );
        return tb - ta;
      })
      .slice(0, 8);

    const activityItems: ActivityItem[] = recentAttempts.map((at) => {
      const a = assessments.find((x) => x.id === at.assessmentId);
      const labelEval = a ? `${a.title} (${a.className})` : at.assessmentId;

      const when =
        at.status === "published"
          ? at.grading?.publishedAtISO
          : at.status === "graded"
          ? at.grading?.gradedAtISO
          : at.submittedAtISO;

      const icon =
        at.status === "published" ? "📣" : at.status === "graded" ? "✅" : at.status === "submitted" ? "📝" : "⏳";

      return {
        id: at.id,
        icon,
        text: `${labelAttemptStatus(at.status)} — ${labelEval} • ${formatDateTime(when)}`,
        badge: at.status === "submitted" ? "À traiter" : undefined,
        ts: Math.max(safeTime(when), 0),
      };
    });

    // ===== Alerts (actions admin utiles) =====
    const toGrade = counts.submitted; // copies à corriger
    const gradedNotPublished = counts.graded; // corrigées non publiées (parents ne voient rien)

    // évaluations publiées sans aucune copie
    const attemptsByAssessment: Record<string, number> = {};
    for (const at of attempts) attemptsByAssessment[at.assessmentId] = (attemptsByAssessment[at.assessmentId] || 0) + 1;

    const noSubmission = publishedAssessments.filter((a) => (attemptsByAssessment[a.id] || 0) === 0);

    const alertItems: AlertItem[] = [];

    if (toGrade > 0) {
      alertItems.push({
        id: "a_to_grade",
        title: "Copies à corriger",
        text: `${toGrade} copie(s) soumise(s) attend(ent) une correction.`,
        badge: "À traiter",
      });
    } else {
      alertItems.push({
        id: "a_to_grade_ok",
        title: "Corrections",
        text: "Aucune copie en attente de correction.",
        badge: "Info",
      });
    }

    if (gradedNotPublished > 0) {
      alertItems.push({
        id: "a_graded_not_pub",
        title: "Résultats non publiés",
        text: `${gradedNotPublished} copie(s) corrigée(s) mais pas encore publiée(s) (parents/élèves ne voient rien).`,
        badge: "À traiter",
      });
    }

    if (noSubmission.length > 0) {
      alertItems.push({
        id: "a_no_submission",
        title: "Évaluations sans soumission",
        text: `${noSubmission.length} évaluation(s) publiée(s) sans aucune soumission.`,
        badge: "Nouveau",
      });
    }

    if (counts.inProgress > 0) {
      alertItems.push({
        id: "a_in_progress",
        title: "Tentatives en cours",
        text: `${counts.inProgress} tentative(s) non soumise(s) (en cours).`,
        badge: "Info",
      });
    }

    // KPIs (tu peux changer l'ordre/labels)
    const kpiCards = [
      { title: "Évaluations publiées", value: String(counts.assessmentsPublished), icon: "📚" },
      { title: "Copies soumises", value: String(counts.submitted), icon: "📝" },
      { title: "Copies corrigées", value: String(counts.graded), icon: "✅" },
      { title: "Copies publiées", value: String(counts.published), icon: "📣" },
      { title: "Apprenants", value: String(counts.students), icon: "🎓" },
      { title: "Classes", value: String(counts.classes), icon: "🏫" },
    ];

    return {
      kpis: kpiCards,
      activity: activityItems,
      alerts: alertItems.slice(0, 5),
    };
  }, [refreshKey]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Tableau de bord</div>
          <div className="text-sm text-gray-500">Vue globale (démo) — basé sur le mockStore.</div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => setRefreshKey((k) => k + 1)} type="button">
          ↻ Rafraîchir
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Kpi key={k.title} title={k.title} value={k.value} icon={k.icon} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Activity */}
        <div className="sn-card sn-card-hover p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Activité récente</div>
            <span className="text-xs text-gray-500">Dernières actions</span>
          </div>

          <div className="mt-4 space-y-3">
            {activity.length === 0 ? (
              <div className="text-sm text-gray-500">Aucune activité pour le moment.</div>
            ) : (
              activity.map((a) => <Activity key={a.id} icon={a.icon} text={a.text} badge={a.badge} />)
            )}
          </div>
        </div>

        {/* Alerts */}
        <div className="sn-card sn-card-hover p-5">
          <div className="font-semibold">Alertes</div>
          <div className="mt-4 space-y-3">
            {alerts.map((al) => (
              <Alert key={al.id} title={al.title} text={al.text} badge={al.badge} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-gray-500">
        *Ce dashboard devient “réel” quand on branche Supabase (étape backend) : on remplacera getAttempts/getStudents par des requêtes.*
      </div>
    </div>
  );
}

function Kpi({ title, value, icon }: { title: string; value: string; icon: string }) {
  return (
    <div className="sn-card sn-card-hover p-4 flex items-center gap-3">
      <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center text-lg">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm text-gray-500 truncate">{title}</div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
      </div>
    </div>
  );
}

function Activity({
  icon,
  text,
  badge,
}: {
  icon: string;
  text: string;
  badge?: "Nouveau" | "À traiter";
}) {
  const badgeClass = badge === "À traiter" ? "sn-badge sn-badge-red" : "sn-badge sn-badge-blue";

  return (
    <div className="rounded-2xl border border-gray-100 p-4 text-sm text-gray-700 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate">{text}</span>
      </div>
      {badge && <span className={badgeClass}>{badge}</span>}
    </div>
  );
}

function Alert({
  title,
  text,
  badge,
}: {
  title: string;
  text: string;
  badge: "Info" | "Nouveau" | "À traiter";
}) {
  const badgeClass =
    badge === "Nouveau"
      ? "sn-badge sn-badge-blue"
      : badge === "À traiter"
      ? "sn-badge sn-badge-red"
      : "sn-badge sn-badge-gray";

  return (
    <div className="rounded-2xl border border-gray-100 p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-gray-500">{text}</div>
      </div>
      <span className={badgeClass}>{badge}</span>
    </div>
  );
}
