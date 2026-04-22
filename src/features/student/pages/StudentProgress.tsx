export default function StudentProgress() {
  const value = 68;

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Progression</div>

      <div className="sn-card sn-card-hover p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">Progression globale</div>
          <span className="sn-badge sn-badge-green">En bonne voie</span>
        </div>

        <div className="mt-2 text-3xl font-bold">{value}%</div>

        <div className="mt-4 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-green-500" style={{ width: `${value}%` }} />
        </div>

        <div className="mt-4 flex gap-2">
          <button className="sn-btn-primary">Voir détails</button>
          <button className="sn-btn-ghost">Objectifs</button>
        </div>
      </div>
    </div>
  );
}
