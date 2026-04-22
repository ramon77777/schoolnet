export default function StudentHomework() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Devoirs</div>
        <span className="sn-badge sn-badge-blue">Nouveau</span>
      </div>

      <HomeworkCard
        title="Devoir de Français"
        meta="À rendre avant mardi"
        badge="À faire"
      />
      <HomeworkCard
        title="Exercices de Maths"
        meta="À rendre avant vendredi"
        badge="À faire"
      />
    </div>
  );
}

function HomeworkCard({
  title,
  meta,
  badge,
}: {
  title: string;
  meta: string;
  badge: "À faire";
}) {
  return (
    <div className="sn-card sn-card-hover p-5 flex items-center justify-between gap-4">
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-gray-500">{meta}</div>
      </div>

      <span className="sn-badge sn-badge-blue">{badge}</span>
    </div>
  );
}
