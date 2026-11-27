import type { AdministrativeReview } from "../lib/schoolReportCardAdministrativeReview";
import {
  prepareReportCardApprovalWorkflow,
} from "../lib/schoolReportCardApprovalPreparation";

type Props = {
  review: AdministrativeReview;
  fictional: boolean;
};

const stageLabels = {
  checked: "Précontrôle uniquement",
  attention: "Corrections nécessaires",
  not_activated: "Non activé",
} as const;
const stageStyles = {
  checked: "border-emerald-200 bg-emerald-50 text-emerald-900",
  attention: "border-amber-200 bg-amber-50 text-amber-950",
  not_activated: "border-slate-200 bg-slate-100 text-slate-700",
} as const;

/** Informational UI ONLY. No decision controls, service calls or audit writes. */
export default function SchoolReportCardApprovalPreparationPanel({
  review, fictional,
}: Props) {
  const plan = prepareReportCardApprovalWorkflow(review);

  return <section id="schoolnet-s4d3f-review-process"
    className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-6"
    aria-labelledby="schoolnet-s4d3f-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
          SCHOOLNET V2 · S4-D.3f
        </p>
        <h6 id="schoolnet-s4d3f-title"
          className="mt-1 text-lg font-extrabold text-slate-950">
          Circuit de validation administrative — préparation
        </h6>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          Parcours proposé pour organiser la vérification, une future décision
          motivée et la publication distincte. Aucune étape n'enregistre
          d'accord ni ne change le statut du bulletin.
        </p>
      </div>
      <span className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-800">
        Circuit non activé
      </span>
    </div>

    <div role="status"
      className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
      <strong>{plan.pedagogicalReview === "complete"
        ? "Précontrôle pédagogique sans anomalie calculatoire."
        : "Précontrôle : corrections ou vérifications nécessaires."}</strong>
      {" "}Même lorsqu'un élève a 20/20 ou 0,00/20 avec toutes ses matières,
      cela ne constitue pas une approbation administrative.
      {fictional && <span className="block text-xs font-bold">
        Spécimen de recette · données 100 % fictives.
      </span>}
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Quatre phases proposées du circuit de validation">
      {plan.stages.map(stage => <article key={stage.id}
        className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
        <span className={"self-start rounded-full border px-2.5 py-1 text-xs font-extrabold " +
          stageStyles[stage.status]}>
          {stageLabels[stage.status]}
        </span>
        <h6 className="mt-3 text-sm font-extrabold text-slate-950">
          {stage.title}
        </h6>
        <p className="mt-2 text-xs font-semibold leading-5 text-indigo-900">
          {stage.responsibility}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-700">
          {stage.description}
        </p>
      </article>)}
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border border-amber-200 bg-white p-4"
        aria-label="Conditions à lever pour un futur circuit réel">
        <h6 className="font-extrabold text-slate-950">
          Conditions à lever ({plan.blockers.length})
        </h6>
        <ul className="mt-3 space-y-3">
          {plan.blockers.map(item => <li key={item.code}
            className="border-l-2 border-amber-300 pl-3">
            <p className="text-sm font-bold text-slate-900">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-700">{item.detail}</p>
          </li>)}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4"
        aria-label="Traçabilité à prévoir pour les décisions administratives">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h6 className="font-extrabold text-slate-950">
            Traçabilité des décisions à prévoir
          </h6>
          <span className="text-xs font-bold text-slate-600">Aucun événement enregistré</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Le journal devra être alimenté et vérifié côté serveur.
          Les champs suivants sont une proposition de contrat,
          pas des données déjà enregistrées.
        </p>
        <dl className="mt-3 space-y-2">
          {plan.proposedAuditFields.map(field => <div key={field.key}
            className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
            <dt className="text-xs font-bold text-slate-900">{field.label}</dt>
            <dd className="mt-1 text-xs leading-5 text-slate-600">{field.detail}</dd>
          </div>)}
        </dl>
      </section>
    </div>

    <p role="status"
      className="rounded-xl border border-slate-300 bg-white p-4 text-xs leading-5 text-slate-800">
      <strong>Validation, refus, demande de correction et publication désactivés.</strong>
      {" "}Le rôle de l'autorité de décision, le gel des résultats, le journal
      immuable et les règles de diffusion nécessitent un cadrage puis des
      contrôles serveur séparés. Aucun bouton de soumission, de signature,
      de diffusion ou d'export réel n'est disponible ici.
    </p>
  </section>;
}
