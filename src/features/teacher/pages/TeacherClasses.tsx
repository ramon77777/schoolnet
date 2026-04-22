import { useMemo, useState } from "react";

type Student = { id: string; name: string; level: string };
type ClassItem = {
  id: string;
  name: string;
  meta: string;
  students: Student[];
};

export default function TeacherClasses() {
  const classes: ClassItem[] = useMemo(
    () => [
      {
        id: "6b",
        name: "6e B",
        meta: "24 élèves • Maths & Sciences",
        students: [
          { id: "s1", name: "Aïcha K.", level: "6e" },
          { id: "s2", name: "Yao K.", level: "6e" },
          { id: "s3", name: "Fatou D.", level: "6e" },
          { id: "s4", name: "Koffi A.", level: "6e" },
        ],
      },
      {
        id: "5a",
        name: "5e A",
        meta: "28 élèves • Maths & Français",
        students: [
          { id: "s5", name: "Mariam C.", level: "5e" },
          { id: "s6", name: "Issa T.", level: "5e" },
          { id: "s7", name: "Nadia S.", level: "5e" },
          { id: "s8", name: "Ousmane B.", level: "5e" },
        ],
      },
    ],
    []
  );

  const [activeId, setActiveId] = useState(classes[0].id);
  const active = classes.find((c) => c.id === activeId)!;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Mes classes</div>
          <div className="text-sm text-gray-500">
            Gérez vos élèves et suivez les effectifs.
          </div>
        </div>
        <button className="sn-btn-primary sn-press">+ Nouvelle classe</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Liste classes */}
        <div className="sn-card p-3 space-y-2">
          {classes.map((c) => {
            const selected = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left rounded-2xl p-4 transition sn-press ${
                  selected
                    ? "bg-blue-600 text-white shadow-sm"
                    : "hover:bg-gray-50 text-gray-900"
                }`}
              >
                <div className="font-semibold">{c.name}</div>
                <div className={`text-sm ${selected ? "text-blue-100" : "text-gray-500"}`}>
                  {c.meta}
                </div>
              </button>
            );
          })}
        </div>

        {/* Détails classe */}
        <div className="lg:col-span-2 space-y-4">
          <div className="sn-card sn-card-hover p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{active.name}</div>
                <div className="text-sm text-gray-500">{active.meta}</div>
              </div>
              <div className="flex gap-2">
                <button className="sn-btn-ghost sn-press">Exporter</button>
                <button className="sn-btn-primary sn-press">Ajouter élève</button>
              </div>
            </div>
          </div>

          <div className="sn-card p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Élèves (aperçu)</div>
              <span className="sn-badge sn-badge-gray">
                {active.students.length} affichés
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {active.students.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-gray-100 p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-500">{s.level}</div>
                  </div>
                  <button className="sn-btn-ghost sn-press">Voir profil</button>
                </div>
              ))}
            </div>
          </div>

          <div className="sn-card p-5">
            <div className="font-semibold">Actions rapides</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button className="sn-btn-primary sn-press">Créer une évaluation</button>
              <button className="sn-btn-ghost sn-press">Voir les corrections</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
