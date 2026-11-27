import type { DraftBulletinGovernance } from "../lib/schoolReportCardApprovalGovernance";
import { prepareBulletinPublicationPolicyDraft } from "../lib/schoolBulletinPublicationPolicyDraft";

type Props = {
  governance: DraftBulletinGovernance;
  fictional: boolean;
};

/** S4-D.3h — no administrative decisions, storage or publication operations. */
export default function SchoolBulletinPublicationPolicyDraftPanel({
  governance, fictional,
}: Props) {
  const policy = prepareBulletinPublicationPolicyDraft(governance);

  return <details id="schoolnet-s4d3h-policy"
    className="rounded-2xl border border-indigo-200 bg-white shadow-sm">
    <summary className="cursor-pointer px-4 py-4 text-slate-950 md:px-6"
      aria-label="Ouvrir le projet de politique de publication des bulletins">
      <span className="block text-xs font-extrabold uppercase tracking-wider text-indigo-700">
        SCHOOLNET V2 · S4-D.3h
      </span>
      <span className="mt-1 block text-lg font-extrabold">
        Politique d'approbation et de publication — projet
      </span>
      <span className="mt-1 block text-sm font-normal text-slate-700">
        7 clauses proposées · 0 validée · aucune règle activée.
        Ouvrir pour examiner les dispositions, conditions et transitions futures.
      </span>
    </summary>

    <div className="space-y-6 border-t border-indigo-100 p-4 md:p-6">
      <p role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>Projet non approuvé — aucune publication autorisée.</strong>
        {" "}Les propositions ci-dessous ne sont ni des règles déjà adoptées,
        ni un règlement officiel ni une décision d'établissement.
        Toutes les clauses exigent une validation métier explicite.
        {fictional && <span className="mt-1 block text-xs font-bold">
          Recette locale fictive : aucune règle réelle enregistrée.
        </span>}
      </p>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold text-slate-600">Clauses proposées</p>
          <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-950">
            {policy.proposedClauseCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold text-slate-600">Clauses approuvées</p>
          <p className="mt-1 text-xl font-extrabold tabular-nums text-slate-950">
            {policy.approvedClauseCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold text-slate-600">Précontrôle pédagogique</p>
          <p className="mt-1 text-sm font-extrabold text-slate-950">
            {policy.pedagogicalPrecontrol === "satisfied"
              ? "Satisfaisant · sans effet d'approbation"
              : "Vérifications ou corrections nécessaires"}
          </p>
        </div>
      </div>

      <section aria-label="Sept clauses métier soumises à arbitrage">
        <h6 className="text-base font-extrabold text-slate-950">
          Sept clauses métier — toutes à valider
        </h6>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {policy.clauses.map((clause, index) => <article key={clause.id}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h6 className="text-sm font-extrabold text-slate-950">
                {index + 1}. {clause.title}
              </h6>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
                À valider
              </span>
            </div>
            <p className="mt-3 text-xs font-bold text-indigo-950">
              Règle proposée
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-800">
              {clause.proposedRule}
            </p>
            <p className="mt-3 text-xs font-bold text-slate-950">
              Condition préalable
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              {clause.prerequisite}
            </p>
            <p className="mt-3 text-xs font-bold text-amber-900">
              Décision encore ouverte
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-700">
              {clause.alternativeToArbitrate}
            </p>
          </article>)}
        </div>
      </section>

      <section aria-label="Transitions du circuit de décision proposées">
        <h6 className="text-base font-extrabold text-slate-950">
          Transitions envisagées — non exécutables
        </h6>
        <p className="mb-3 mt-1 text-xs leading-5 text-slate-700">
          Accord administratif, autorisation de diffusion et publication
          effective sont trois événements distincts.
          L'événement de publication effective reste à définir et à adopter.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-slate-100 font-bold uppercase text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-3">Événement proposé</th>
                <th scope="col" className="px-3 py-3">Depuis</th>
                <th scope="col" className="px-3 py-3">Vers</th>
                <th scope="col" className="px-3 py-3">Précondition</th>
                <th scope="col" className="px-3 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policy.transitions.map(item => <tr key={item.event}>
                <td className="px-3 py-3 font-semibold text-slate-900">{item.event}</td>
                <td className="px-3 py-3 text-slate-700">{item.from}</td>
                <td className="px-3 py-3 text-slate-700">{item.to}</td>
                <td className="px-3 py-3 text-slate-700">{item.required}</td>
                <td className="px-3 py-3 font-bold text-amber-900">Désactivé</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 p-4"
        aria-label="Contrôles serveur nécessaires avant une future activation">
        <h6 className="font-extrabold text-slate-950">
          Contrôles serveur indispensables avant activation
        </h6>
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {policy.serverControls.map(item => <li key={item.id}
            className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
            {item.label}
          </li>)}
        </ul>
      </section>

      <p role="status"
        className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-xs leading-5 text-slate-900">
        <strong>Décisions et publication toujours désactivées.</strong>
        {" "}Aucune habilitation, aucun état de bulletin, aucune table d'audit
        et aucun fichier officiel ne sont créés par ce projet de politique.
        L'activation nécessitera une validation métier distincte, une
        implémentation sécurisée côté serveur et une nouvelle recette.
      </p>
    </div>
  </details>;
}
