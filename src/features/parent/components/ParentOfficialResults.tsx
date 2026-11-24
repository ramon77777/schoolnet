import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getParentOfficialResults } from "../lib/parentOfficialResultsApi";
import {
  EMPTY_PARENT_OFFICIAL_RESULTS, isParentOfficialUuid, parentOfficialResultUrl,
} from "../lib/parentOfficialResultsModel";
import { useParentResultRequest } from "../lib/useParentResultRequest";
import ParentOfficialResultSummary from "./ParentOfficialResultSummary";

const PAGE_SIZE = 10;

export default function ParentOfficialResults() {
  const [params, setParams] = useSearchParams();
  const childParam = params.get("childId");
  const selectedChild = isParentOfficialUuid(childParam) ? childParam.toLowerCase() : "all";
  const request = useParentResultRequest("official-list", getParentOfficialResults);
  const data = request.data ?? EMPTY_PARENT_OFFICIAL_RESULTS;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const filterKey = `${selectedChild}\u0000${query}\u0000${type}`;
  const [pagination, setPagination] = useState({ filterKey, page: 1 });
  const page = pagination.filterKey === filterKey ? pagination.page : 1;
  const setPage = (value: number) => setPagination({ filterKey, page: value });
  const selectedChildExists = selectedChild === "all"
    || data.children.some((child) => child.childId.toLowerCase() === selectedChild);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return data.results.filter((row) => (selectedChild === "all" || row.childId.toLowerCase() === selectedChild)
      && (type === "all" || row.type === type)
      && (!normalized || [row.childName, row.title, row.schoolName, row.className, row.subjectName, row.courseTitle, row.schoolYear]
        .join(" ").toLocaleLowerCase("fr").includes(normalized)))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }, [data.results, query, selectedChild, type]);
  const childResults = data.results.filter((row) => selectedChild === "all" || row.childId.toLowerCase() === selectedChild);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  function selectChild(value: string) {
    const next = new URLSearchParams(params);
    next.set("source", "official");
    if (value === "all") next.delete("childId");
    else next.set("childId", value);
    setParams(next, { replace: true });
  }

  return <section className="min-w-0 space-y-5" aria-labelledby="official-results-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 id="official-results-title" className="text-xl font-semibold text-slate-950">Résultats officiels</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Retrouvez les notes publiées de vos enfants, avec leur établissement, leur classe et leur année scolaire.</p></div>
      {!request.isDemo && !request.unavailable && <button type="button" className="sn-btn-ghost" disabled={request.loading} onClick={request.refresh}>Actualiser</button>}
    </div>

    {request.loading && <div className="sn-card p-6 text-sm text-slate-600" role="status">Chargement des résultats officiels…</div>}
    {request.isDemo && <div className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Mode démo : les résultats réels de vos enfants ne sont pas chargés.</div>}
    {request.unavailable && <div className="sn-card p-6 text-sm text-slate-600">Connectez-vous avec votre compte Parent pour consulter les résultats.</div>}
    {!request.loading && request.failed && <div className="sn-card border border-red-200 bg-red-50 p-5" role="alert">
      <h2 className="font-semibold text-red-800">Résultats officiels indisponibles</h2>
      <p className="mt-2 text-sm text-red-700">Le chargement a échoué. Réessayez dans quelques instants. La vue Cours libres reste accessible.</p>
      <button type="button" className="sn-btn-ghost mt-4" onClick={request.refresh}>Réessayer</button>
    </div>}

    {!request.loading && request.data && <>
      {data.children.length === 0 ? <div className="sn-card p-8 text-center">
        <h2 className="font-semibold text-slate-900">Aucun enfant lié à votre compte</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">L’établissement doit confirmer votre rattachement familial avant que vous puissiez consulter les résultats d’un enfant.</p>
      </div> : <>
        <div className="sn-card grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          <label className="block min-w-0 text-sm font-medium text-slate-700">Enfant
            <select className="mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={selectedChild} onChange={(event) => selectChild(event.target.value)}>
              <option value="all">Tous mes enfants</option>
              {!selectedChildExists && <option value={selectedChild}>Enfant non disponible</option>}
              {data.children.map((child) => <option key={child.childId} value={child.childId.toLowerCase()}>{child.fullName}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-sm font-medium text-slate-700">Type d’évaluation
            <select className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">Tous les types</option><option value="quiz">Quiz</option><option value="assignment">Devoirs</option><option value="exam">Examens</option>
            </select>
          </label>
          <label className="block min-w-0 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-1">Rechercher
            <input type="search" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" placeholder="Évaluation, matière, établissement…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>

        {!selectedChildExists ? <div className="sn-card p-6" role="status">
          <h2 className="font-semibold text-slate-900">Cet enfant n’est plus disponible dans cette vue</h2>
          <p className="mt-2 text-sm text-slate-600">Sélectionnez un enfant actuellement lié à votre compte.</p>
        </div> : <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-950">{childResults.length}</span> résultat{childResults.length > 1 ? "s" : ""} officiel{childResults.length > 1 ? "s" : ""} publié{childResults.length > 1 ? "s" : ""}</p>
            <p className="text-xs">Les notes en cours de correction restent confidentielles.</p>
          </div>
          {childResults.length === 0 ? <div className="sn-card p-8 text-center">
            <h2 className="font-semibold text-slate-900">Aucun résultat officiel publié</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">Vos enfants sont bien rattachés à votre compte. Aucun résultat publié et accessible ne correspond encore à cette sélection.</p>
          </div> : filtered.length === 0 ? <div className="sn-card p-8 text-center">
            <h2 className="font-semibold text-slate-900">Aucun résultat ne correspond à vos filtres</h2>
            <button type="button" className="sn-btn-ghost mt-4" onClick={() => { setQuery(""); setType("all"); }}>Effacer la recherche et le type</button>
          </div> : <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((result) => <article key={`${result.childId}:${result.assessmentId}`} className="sn-card min-w-0 p-5 sm:p-6">
              <ParentOfficialResultSummary result={result} />
              <div className="mt-5 border-t border-slate-100 pt-4"><Link className="sn-btn-primary inline-flex" to={parentOfficialResultUrl(result.childId, result.assessmentId, selectedChild === "all")}>Voir le résultat et l’appréciation</Link></div>
            </article>)}
          </div>}
          {pageCount > 1 && <nav aria-label="Pages des résultats officiels" className="sn-card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-slate-600">{filtered.length} résultats · Page {currentPage} sur {pageCount}</p>
            <div className="flex gap-2"><button type="button" className="sn-btn-ghost" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
              <button type="button" className="sn-btn-ghost" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Suivant</button></div>
          </nav>}
        </>}
      </>}
    </>}
  </section>;
}
