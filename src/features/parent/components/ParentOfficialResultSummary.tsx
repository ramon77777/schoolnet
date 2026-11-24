import type { ParentOfficialResult } from "../lib/parentOfficialResultsModel";

const typeLabels = { quiz: "Quiz", assignment: "Devoir", exam: "Examen" };
const scoreFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function ParentOfficialResultSummary({ result }: { result: ParentOfficialResult }) {
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-52">
        <p className="break-words text-sm font-medium text-blue-700">{result.childName}</p>
        <h2 className="mt-1 break-words text-lg font-semibold text-slate-950">{result.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="sn-badge sn-badge-blue">{typeLabels[result.type]}</span>
          <span className="sn-badge sn-badge-green">Résultat publié</span>
        </div>
      </div>
      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-right">
        <p className="text-xs font-medium text-blue-700">Note</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-blue-800">
          {scoreFormat.format(result.score)} <span className="text-base font-medium">/ {scoreFormat.format(result.maxScore)}</span>
        </p>
      </div>
    </div>
    <dl className="grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div className="min-w-0"><dt className="text-xs text-slate-500">Établissement</dt>
        <dd className="mt-1 break-words font-medium text-slate-800">{result.schoolName}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500">Classe · Année scolaire</dt>
        <dd className="mt-1 break-words font-medium text-slate-800">{result.className} · {result.schoolYear}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500">Matière</dt>
        <dd className="mt-1 break-words font-medium text-slate-800">{result.subjectName}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500">Cours</dt>
        <dd className="mt-1 break-words font-medium text-slate-800">{result.courseTitle}</dd></div>
    </dl>
    <p className="text-xs text-slate-500">Publié le <time dateTime={result.publishedAt}>{dateFormat.format(new Date(result.publishedAt))}</time></p>
  </div>;
}
