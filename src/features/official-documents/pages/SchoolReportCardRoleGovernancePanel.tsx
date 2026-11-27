import type { ApprovalWorkflowPreparation } from "../lib/schoolReportCardApprovalPreparation";
import { prepareBulletinGovernance } from "../lib/schoolReportCardApprovalGovernance";
import SchoolBulletinPublicationPolicyDraftPanel from "./SchoolBulletinPublicationPolicyDraftPanel";

type Props = {
  workflow: ApprovalWorkflowPreparation;
  fictional: boolean;
};

/** S4-D.3g: governance proposal only, never a permission editor. */
export default function SchoolReportCardRoleGovernancePanel({
  workflow, fictional,
}: Props) {
  const governance = prepareBulletinGovernance(workflow);

  return <details open id="schoolnet-s4d3g-governance"
    className="group rounded-2xl border border-indigo-200 bg-white shadow-sm">
    <summary className="cursor-pointer px-4 py-4 text-slate-950 md:px-6"
      aria-label="Afficher les responsabilités et habilitations proposées">
      <span className="block text-xs font-extrabold uppercase tracking-wider text-indigo-700">
        SCHOOLNET V2 · S4-D.3g
      </span>
      <span className="mt-1 block text-lg font-extrabold">
        Responsabilités et habilitations — cadrage
      </span>
      <span className="mt-1 block text-sm font-normal leading-6 text-slate-700">
        Droits existants, fonctions envisagées, décisions à valider et contrôles
        indispensables. Aucune permission supplémentaire n'est active.
      </span>
    </summary>

    <div className="space-y-5 border-t border-indigo-100 p-4 md:p-6">
      <p role="status"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <strong>Aucun droit de soumission, décision, publication ou retrait attribué.</strong>
        {" "}La consultation actuelle des bulletins V2 par un administrateur
        d'établissement nécessite les vérifications d'identité et d'affiliation
        du serveur. Le rôle administrateur général n'accorde pas d'exception.
        {fictional && <span className="mt-1 block text-xs font-bold">
          Mode recette locale · aucune habilitation réelle créée.
        </span>}
      </p>

      <section aria-label="Matrice indicative des rôles existants et des droits non accordés">
        <h6 className="text-base font-extrabold text-slate-950">
          Matrice des rôles SCHOOLNET
        </h6>
        <p className="mb-3 mt-1 text-xs leading-5 text-slate-700">
          La colonne de lecture décrit uniquement l'entrée de prévisualisation
          individuelle V2 actuelle ; elle ne résume pas tous les autres droits
          des utilisateurs dans SCHOOLNET.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-700">
              <tr>
                <th scope="col" className="px-3 py-3">Rôle existant</th>
                <th scope="col" className="px-3 py-3">Aperçu V2 actuel</th>
                <th scope="col" className="px-3 py-3">Soumettre</th>
                <th scope="col" className="px-3 py-3">Décider</th>
                <th scope="col" className="px-3 py-3">Publier</th>
                <th scope="col" className="px-3 py-3">Retirer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {governance.roleMatrix.map(entry => <tr key={entry.role}
                className="bg-white">
                <th scope="row" className="px-3 py-3 font-bold text-slate-950">
                  {entry.label}
                </th>
                <td className="px-3 py-3 text-xs font-semibold text-slate-700">
                  {entry.currentPreview === "school_admin_scoped_read"
                    ? "Lecture sous contrôle serveur, école affiliée active"
                    : "Non ouvert dans ce parcours"}
                </td>
                {[entry.submitGranted, entry.decideGranted,
                  entry.publishGranted, entry.revokeGranted].map((granted, index) =>
                  <td key={index} className="px-3 py-3 text-xs text-slate-700">
                    {granted ? "Accordé" : "Non attribué"}
                  </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {governance.roleMatrix.map(entry => <p key={entry.role}
            className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
            <strong className="text-slate-900">{entry.label} :</strong>
            {" "}{entry.futureResponsibility}
          </p>)}
        </div>
      </section>

      <section aria-label="Responsables pressentis pour les quatre fonctions"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h6 className="font-extrabold text-slate-950">
          Fonctions et responsabilités à instituer
        </h6>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {governance.functions.map(item => <article key={item.id}
            className="rounded-lg border border-white bg-white p-3">
            <h6 className="text-sm font-bold text-slate-900">{item.function}</h6>
            <p className="mt-2 text-xs leading-5 text-slate-700">{item.accountable}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-indigo-800">
              {item.authorization}
            </p>
          </article>)}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4"
          aria-label="Garde-fous proposés pour les futures habilitations">
          <h6 className="font-extrabold text-slate-950">
            Règles de sécurité proposées
          </h6>
          <ul className="mt-3 space-y-3">
            {governance.guardrails.map(item => <li key={item.id}
              className="border-l-2 border-indigo-200 pl-3">
              <strong className="text-sm text-slate-900">{item.title}</strong>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {item.description}
              </p>
            </li>)}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 p-4"
          aria-label="Décisions métier restant à approuver">
          <h6 className="font-extrabold text-slate-950">
            Décisions à confirmer avant développement réel
          </h6>
          <ol className="mt-3 space-y-3">
            {governance.decisionsToApprove.map((item, index) => <li key={item.id}
              className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">
                {index + 1}. {item.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                Proposition : {item.suggestion}
              </p>
            </li>)}
          </ol>
        </section>
      </div>

      <SchoolBulletinPublicationPolicyDraftPanel
        governance={governance}
        fictional={fictional}
      />

      <p role="status"
        className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs leading-5 text-slate-800">
        <strong>Document de conception seulement.</strong>
        {" "}Aucune approbation métier des règles n'a été enregistrée ;
        aucune habilitation n'a été créée. La future autorité devra être définie,
        validée, implémentée et vérifiée côté serveur, sur une version figée
        du bulletin. Aucun acteur ne peut valider, publier ou retirer un bulletin
        depuis ce panneau.
      </p>
    </div>
  </details>;
}
