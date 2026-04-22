export default function ParentDeadlines() {
  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Échéances</div>

      <div className="rounded-2xl bg-white shadow p-4">
        <div className="font-semibold">Devoir de Français</div>
        <div className="text-sm text-gray-500">À rendre avant mardi</div>
      </div>

      <div className="rounded-2xl bg-white shadow p-4">
        <div className="font-semibold">Examen de Maths</div>
        <div className="text-sm text-gray-500">Jeudi 10:00 — 45 min</div>
      </div>
    </div>
  );
}
