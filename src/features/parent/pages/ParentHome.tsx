import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  ensureSeed,
  getPublishedAssessments,
  getAttemptFor,
  type AssessmentType,
} from "@/lib/mockStore";

type Child = { id: string; label: string; className: string };

type Row = {
  id: string; // assessmentId
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
};

function monthLabel(d = new Date()) {
  const m = d.toLocaleString("fr-FR", { month: "long" });
  const y = d.getFullYear();
  return `${m.charAt(0).toUpperCase() + m.slice(1)} ${y}`;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function parseScore(score?: string | number | null) {
  if (score === undefined || score === null) return null;
  const s = String(score).trim();
  const m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return { label: s, ratio: null as number | null };
  const got = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(got) || !Number.isFinite(max) || max <= 0) {
    return { label: s, ratio: null as number | null };
  }
  return { label: `${got}/${max}`, ratio: Math.round((got / max) * 100) };
}

function badgeTypeClass(type: AssessmentType) {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function typeIcon(type: AssessmentType) {
  if (type === "Quiz") return "🧩";
  if (type === "Devoir") return "📝";
  return "🧪";
}

// ISO week helpers (premium grouping)
function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

function weekLabelFromISO(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const w = getISOWeek(d);
  return `Semaine ${w.week} • ${w.year}`;
}

function sortKey(r: Row) {
  // Terminé récent d’abord, puis À faire
  if (r.submittedAtISO) {
    const t = new Date(r.submittedAtISO).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  return -1;
}

export default function ParentHome() {
  const navigate = useNavigate();

  const children: Child[] = useMemo(
    () => [
      { id: "demo-student", label: "Aïcha", className: "6e B" },
      { id: "demo-student-2", label: "Ibrahim", className: "5e A" },
    ],
    []
  );

  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id || "demo-student");
  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId) || children[0],
    [children, selectedChildId]
  );

  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    ensureSeed();
    const published = getPublishedAssessments();

    const mapped: Row[] = published.map((a) => {
      const attempt = getAttemptFor(a.id, selectedChildId);
      const done = Boolean(attempt);

      return {
        id: a.id,
        type: a.type,
        title: a.title,
        courseTitle: a.courseTitle,
        sectionTitle: a.sectionTitle,
        className: a.className,
        when: a.when,

        childId: selectedChildId,
        childLabel: selectedChild?.label || "Enfant",

        status: done ? "Terminé" : "À faire",
        scoreLabel:
          attempt?.score !== undefined && attempt?.score !== null
            ? String(attempt.score)
            : undefined,
        submittedAtISO: attempt?.submittedAtISO,
      };
    });

    setRows(mapped);
  }, [selectedChildId, selectedChild?.label]);

  // ===== Option 3: Focus stats =====
  const focus = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.status === "Terminé").length;
    const todo = rows.filter((r) => r.status === "À faire").length;

    const ratios = rows
      .map((r) => parseScore(r.scoreLabel)?.ratio)
      .filter((x): x is number => typeof x === "number");

    const avg = ratios.length ? Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length) : null;
    const trend = avg === null ? null : avg >= 60 ? +2 : avg >= 40 ? +1 : -1;

    return { total, done, todo, avg, trend };
  }, [rows]);

  const latest = useMemo(() => {
    const doneRows = rows
      .filter((r) => r.status === "Terminé" && r.submittedAtISO)
      .slice()
      .sort((a, b) => (b.submittedAtISO || "").localeCompare(a.submittedAtISO || ""));
    return doneRows[0] || null;
  }, [rows]);

  // ===== Option 1: KPI =====
  const kpis = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((r) => r.status === "Terminé").length;
    const pending = rows.filter((r) => r.status === "À faire").length;

    const awaitingCorrection = rows.filter(
      (r) =>
        r.status === "Terminé" &&
        (r.type === "Devoir" || r.type === "Examen") &&
        !r.scoreLabel
    ).length;

    const quiz = rows.filter((r) => r.type === "Quiz").length;
    const devoir = rows.filter((r) => r.type === "Devoir").length;
    const examen = rows.filter((r) => r.type === "Examen").length;

    const ratios = rows
      .map((r) => parseScore(r.scoreLabel)?.ratio)
      .filter((x): x is number => typeof x === "number");

    const avg = ratios.length ? Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length) : null;

    return { total, completed, pending, awaitingCorrection, quiz, devoir, examen, avg };
  }, [rows]);

  const typeSplit = useMemo(() => {
    const total = Math.max(1, kpis.total);
    return {
      quizPct: Math.round((kpis.quiz / total) * 100),
      devoirPct: Math.round((kpis.devoir / total) * 100),
      examenPct: Math.round((kpis.examen / total) * 100),
    };
  }, [kpis]);

  // ===== Option 2 Premium: Timeline =====
  type TimelineFilter = "Tous" | "À faire" | "Terminé";
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("Tous");

  const timelineSorted = useMemo(() => {
    const sorted = rows.slice().sort((a, b) => sortKey(b) - sortKey(a));
    return timelineFilter === "Tous" ? sorted : sorted.filter((r) => r.status === timelineFilter);
  }, [rows, timelineFilter]);

  const timelineDone = useMemo(() => timelineSorted.filter((r) => r.status === "Terminé"), [timelineSorted]);
  const timelineTodo = useMemo(() => timelineSorted.filter((r) => r.status === "À faire"), [timelineSorted]);

  const groupedDone = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of timelineDone) {
      const label = weekLabelFromISO(r.submittedAtISO) || "Soumis";
      const arr = groups.get(label) || [];
      arr.push(r);
      groups.set(label, arr);
    }
    return Array.from(groups.entries()).map(([label, items]) => ({
      label,
      items: items.slice().sort((a, b) => sortKey(b) - sortKey(a)),
    }));
  }, [timelineDone]);

  return (
    <div className="space-y-6">
      {/* ✅ OPTION 3 — Focus Enfant */}
      <div className="sn-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Résumé du mois</div>
            <div className="text-2xl font-bold text-gray-900">{monthLabel()}</div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="sn-badge sn-badge-gray">👨‍👩‍👧 Parent</span>
              <span className="sn-badge sn-badge-gray">🎓 {selectedChild?.className}</span>
              {focus.avg !== null && <span className="sn-badge sn-badge-green">📊 Moyenne {focus.avg}%</span>}
              {latest?.submittedAtISO && (
                <span className="sn-badge sn-badge-gray">Dernière soumission : {formatDate(latest.submittedAtISO)}</span>
              )}
            </div>

            <div className="mt-3 text-sm text-gray-600 max-w-2xl">
              Suivi rapide : performances, évaluations terminées, à faire et commentaires enseignants (démo).
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap gap-2 justify-end">
              {children.map((c) => {
                const active = c.id === selectedChildId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition sn-press ${
                      active ? "bg-blue-600 text-white shadow" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                    }`}
                    onClick={() => setSelectedChildId(c.id)}
                    title={`Voir ${c.label}`}
                  >
                    {c.label}
                    <span className={`${active ? "text-white/80" : "text-gray-500"} ml-2 text-xs`}>
                      {c.className}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <span className="sn-badge sn-badge-gray">
                {focus.done}/{focus.total} terminées
              </span>

              {focus.todo > 0 && <span className="sn-badge sn-badge-blue">{focus.todo} à faire</span>}

              <button className="sn-btn-primary sn-press" onClick={() => navigate("/app/parent/results")}>
                Voir résultats
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <InfoMini
            title="Progression"
            value={focus.avg !== null ? `${focus.avg}%` : "—"}
            desc={
              focus.trend === null
                ? "Pas assez de données."
                : focus.trend > 0
                ? `⬆️ +${focus.trend}% vs mois précédent (démo)`
                : `⬇️ ${focus.trend}% vs mois précédent (démo)`
            }
          />
          <InfoMini
            title="Dernière activité"
            value={latest ? latest.title : "—"}
            desc={latest?.submittedAtISO ? `Soumis le ${formatDate(latest.submittedAtISO)}` : "Aucune soumission"}
          />
          <InfoMini
            title="Prochaine étape"
            value={focus.todo > 0 ? "Vérifier les évaluations à faire" : "Tout est à jour 🎉"}
            desc={focus.todo > 0 ? "Ouvre la liste des résultats pour voir les détails." : "Tu peux consulter les commentaires enseignants."}
          />
        </div>
      </div>

      {/* ✅ OPTION 1 — KPI Dashboard */}
      <div className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Aperçu (KPI)</div>
            <div className="text-sm text-gray-500">Synthèse rapide des performances et du suivi ce mois-ci.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="sn-badge sn-badge-gray">🎓 {selectedChild?.label}</span>
            <span className="sn-badge sn-badge-gray">{monthLabel()}</span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Moyenne du mois"
            value={kpis.avg !== null ? `${kpis.avg}%` : "—"}
            icon="📊"
            hint="Basé sur les scores disponibles"
            right={kpis.avg !== null ? <span className="sn-badge sn-badge-green">OK</span> : <span className="sn-badge sn-badge-gray">N/A</span>}
          />
          <KpiCard
            title="Évaluations terminées"
            value={`${kpis.completed}`}
            icon="✅"
            hint={`Sur ${kpis.total} publiées`}
            right={<span className="sn-badge sn-badge-green">Soumis</span>}
          />
          <KpiCard
            title="À faire"
            value={`${kpis.pending}`}
            icon="⏳"
            hint="Non soumises"
            right={kpis.pending > 0 ? <span className="sn-badge sn-badge-blue">Action</span> : <span className="sn-badge sn-badge-green">OK</span>}
          />
          <KpiCard
            title="En attente de correction"
            value={`${kpis.awaitingCorrection}`}
            icon="🧑‍🏫"
            hint="Devoir/Examen soumis sans note"
            right={kpis.awaitingCorrection > 0 ? <span className="sn-badge sn-badge-gray">En cours</span> : <span className="sn-badge sn-badge-green">OK</span>}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 p-4 bg-white lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Répartition des évaluations</div>
              <div className="flex items-center gap-2">
                <span className="sn-badge sn-badge-gray">Quiz {kpis.quiz}</span>
                <span className="sn-badge sn-badge-gray">Devoir {kpis.devoir}</span>
                <span className="sn-badge sn-badge-gray">Examen {kpis.examen}</span>
              </div>
            </div>

            <div className="mt-4">
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden flex">
                <div className="h-full bg-blue-600" style={{ width: `${typeSplit.quizPct}%` }} />
                <div className="h-full bg-indigo-500" style={{ width: `${typeSplit.devoirPct}%` }} />
                <div className="h-full bg-red-600" style={{ width: `${typeSplit.examenPct}%` }} />
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>Quiz {typeSplit.quizPct}%</span>
                <span>Devoir {typeSplit.devoirPct}%</span>
                <span>Examen {typeSplit.examenPct}%</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 p-4 bg-white">
            <div className="text-sm font-semibold text-gray-900">Score moyen</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{kpis.avg !== null ? `${kpis.avg}%` : "—"}</div>
            <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, kpis.avg ?? 0))}%` }} />
            </div>
            <div className="mt-2 text-xs text-gray-500">
              *Démo : la moyenne s’affiche quand des scores sont disponibles.*
            </div>
          </div>
        </div>
      </div>

      {/* ✅ OPTION 2 — Premium Timeline */}
      <div className="sn-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Timeline du mois</div>
            <div className="text-sm text-gray-500">
              Chronologie premium : groupée par semaine, avec statuts et détails.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Pill label="Tous" active={timelineFilter === "Tous"} onClick={() => setTimelineFilter("Tous")} />
            <Pill label="À faire" active={timelineFilter === "À faire"} onClick={() => setTimelineFilter("À faire")} tone="info" />
            <Pill label="Terminé" active={timelineFilter === "Terminé"} onClick={() => setTimelineFilter("Terminé")} tone="success" />
          </div>
        </div>

        {/* À venir / À faire (premium section) */}
        {timelineTodo.length > 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="font-semibold text-gray-900">À venir</div>
              <span className="sn-badge sn-badge-blue">{timelineTodo.length} à faire</span>
            </div>

            <div className="divide-y divide-gray-100">
              {timelineTodo.map((r) => (
                <TimelineRow
                  key={`todo-${r.id}`}
                  row={r}
                  rightHint={r.when}
                  statusBadge="À faire"
                  statusBadgeClass="sn-badge sn-badge-blue"
                  dotClass="bg-blue-600"
                  onDetail={() => navigate(`/app/parent/results/${r.id}?child=${r.childId}`)}
                  onList={() => navigate("/app/parent/results")}
                />
              ))}
            </div>
          </div>
        )}

        {/* Terminé groupé par semaine */}
        {groupedDone.length > 0 ? (
          <div className="space-y-3">
            {groupedDone.map((g) => (
              <div key={g.label} className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="font-semibold text-gray-900">{g.label}</div>
                  <span className="sn-badge sn-badge-gray">{g.items.length} soumis</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {g.items.map((r) => {
                    const awaiting =
                      r.status === "Terminé" &&
                      (r.type === "Devoir" || r.type === "Examen") &&
                      !r.scoreLabel;

                    const badge = r.scoreLabel ? String(r.scoreLabel) : awaiting ? "À corriger" : "Soumis";
                    const badgeClass = r.scoreLabel
                      ? "sn-badge sn-badge-green"
                      : awaiting
                      ? "sn-badge sn-badge-gray"
                      : "sn-badge sn-badge-green";

                    const dot = r.scoreLabel ? "bg-green-600" : awaiting ? "bg-amber-500" : "bg-green-600";
                    const hint = r.submittedAtISO ? `Soumis le ${formatDate(r.submittedAtISO)}` : "Soumis";

                    return (
                      <div key={`done-${r.id}`} className="px-5 py-4">
                        <div className="flex items-start gap-4">
                          <div className="pt-1">
                            <div className={`h-3 w-3 rounded-full ${dot} shadow-sm ring-4 ring-white`} />
                            <div className="mx-auto mt-2 h-full w-px bg-gray-200" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-semibold text-gray-900">
                                    <span className="mr-2">{typeIcon(r.type)}</span>
                                    {r.title}
                                  </div>
                                  <span className={badgeTypeClass(r.type)}>{r.type}</span>
                                  <span className={badgeClass}>{badge}</span>
                                </div>

                                <div className="mt-1 text-sm text-gray-500">
                                  {r.courseTitle} • {r.sectionTitle}
                                </div>

                                <div className="mt-1 text-xs text-gray-500">
                                  {selectedChild?.label} • {r.className} • {hint}
                                </div>

                                {awaiting && (
                                  <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-sm text-gray-700">
                                    🧑‍🏫 Correction en cours : le commentaire enseignant apparaîtra dès que c’est corrigé.
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-2">
                                <button className="sn-btn-ghost sn-press" onClick={() => navigate("/app/parent/results")}>
                                  Liste
                                </button>
                                <button
                                  className="sn-btn-primary sn-press"
                                  onClick={() => navigate(`/app/parent/results/${r.id}?child=${r.childId}`)}
                                >
                                  Voir détail
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-600">
            Aucun élément terminé pour ce filtre.
          </div>
        )}

        <div className="text-xs text-gray-500">
          *Premium : groupement par semaine basé sur la date de soumission (localStorage). Plus tard : vraies dates backend.*
        </div>
      </div>
    </div>
  );
}

function InfoMini({ title, value, desc }: { title: string; value: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-4 bg-white">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-sm text-gray-600">{desc}</div>
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
          <div className="text-xs text-gray-500">{title}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            <span className="mr-2">{icon}</span>
            {value}
          </div>
          {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
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
  const base = "rounded-full px-4 py-2 text-sm font-semibold transition sn-press";
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
    <button type="button" onClick={onClick} className={`${base} ${active ? activeCls : inactiveCls}`}>
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
          <div className={`h-3 w-3 rounded-full ${dotClass} shadow-sm ring-4 ring-white`} />
          <div className="mx-auto mt-2 h-full w-px bg-gray-200" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 transition sn-press hover:-translate-y-0.5 hover:shadow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-gray-900">
                    <span className="mr-2">{typeIcon(row.type)}</span>
                    {row.title}
                  </div>
                  <span className={badgeTypeClass(row.type)}>{row.type}</span>
                  <span className={statusBadgeClass}>{statusBadge}</span>
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  {row.courseTitle} • {row.sectionTitle}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {row.childLabel} • {row.className} • {rightHint}
                </div>
              </div>

              <div className="flex gap-2">
                <button className="sn-btn-ghost sn-press" onClick={onList}>
                  Liste
                </button>
                <button className="sn-btn-primary sn-press" onClick={onDetail}>
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
