import { useCallback } from "react";
import { Link } from "react-router-dom";
import { getParentOfficialResult } from "../lib/parentOfficialResultsApi";
import { isParentOfficialUuid, parentResultsUrl, type ParentOfficialResultDetail as ResultDetail } from "../lib/parentOfficialResultsModel";
import { useParentResultRequest } from "../lib/useParentResultRequest";
import ParentOfficialResultSummary from "./ParentOfficialResultSummary";

export default function ParentOfficialResultDetail({ childId, assessmentId, returnToAll = false }: { childId: string | null; assessmentId: string | undefined; returnToAll?: boolean }) {
  const validIds = isParentOfficialUuid(childId) && isParentOfficialUuid(assessmentId);
  const load = useCallback(async (): Promise<ResultDetail> => {
    if (!isParentOfficialUuid(childId) || !isParentOfficialUuid(assessmentId)) return { found: false };
    return getParentOfficialResult(childId, assessmentId);
  }, [childId, assessmentId]);
  const request = useParentResultRequest(`official-detail:${childId ?? ""}:${assessmentId ?? ""}`, load);
  const data = request.data;

  return <section className="min-w-0 space-y-5" aria-labelledby="official-detail-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 id="official-detail-title" className="text-xl font-semibold text-slate-950">Résultat officiel</h1>
        <p className="mt-1 text-sm text-slate-600">Note et appréciation publiées par l’enseignant.</p></div>
      <Link to={parentResultsUrl("official", returnToAll ? null : childId)} className="sn-btn-ghost">← Retour aux résultats</Link>
    </div>
    {request.loading && <div className="sn-card p-6 text-sm text-slate-600" role="status">Chargement du résultat…</div>}
    {request.isDemo && <div className="sn-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">Le détail réel n’est pas disponible en mode démo.</div>}
    {request.unavailable && <div className="sn-card p-6 text-sm text-slate-600">Connectez-vous avec votre compte Parent pour consulter ce résultat.</div>}
    {!request.loading && request.failed && <div className="sn-card border border-red-200 bg-red-50 p-6" role="alert">
      <h2 className="font-semibold text-red-800">Chargement impossible</h2>
      <p className="mt-2 text-sm text-red-700">Le résultat n’a pas pu être chargé. Réessayez dans quelques instants.</p>
      <button type="button" className="sn-btn-ghost mt-4" onClick={request.refresh}>Réessayer</button>
    </div>}
    {!request.loading && !request.failed && !request.isDemo && !request.unavailable && (!validIds || (data && !data.found)) && <div className="sn-card p-8 text-center" role="status">
      <h2 className="font-semibold text-slate-900">Résultat indisponible</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">Ce résultat n’est plus publié ou n’est pas accessible dans le contexte scolaire actuel de votre enfant. Retrouvez les résultats disponibles dans la liste.</p>
    </div>}
    {!request.loading && data?.found && <>
      <article className="sn-card min-w-0 p-5 sm:p-7"><ParentOfficialResultSummary result={data.result} /></article>
      <section className="sn-card p-5 sm:p-7" aria-labelledby="official-feedback-title">
        <h2 id="official-feedback-title" className="text-base font-semibold text-slate-950">Appréciation de l’enseignant</h2>
        {data.feedback?.trim() ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{data.feedback}</p>
          : <p className="mt-3 text-sm text-slate-500">Aucune appréciation globale n’a été publiée pour ce résultat.</p>}
      </section>
    </>}
  </section>;
}
