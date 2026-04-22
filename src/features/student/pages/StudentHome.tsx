export default function StudentHome() {
  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          title="Cours actifs"
          value="5"
          color="bg-blue-500"
          icon="📘"
        />
        <Kpi
          title="Devoirs à faire"
          value="2"
          color="bg-orange-500"
          icon="📝"
        />
        <Kpi
          title="Progression"
          value="68%"
          color="bg-green-500"
          icon="📊"
        />
      </div>

      {/* Cours */}
      <div>
        <div className="mb-3 text-lg font-semibold">Mes cours</div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CourseCard
            title="Mathématiques"
            progress={70}
            color="bg-blue-100"
          />
          <CourseCard
            title="Français"
            progress={45}
            color="bg-purple-100"
          />
          <CourseCard
            title="Sciences"
            progress={90}
            color="bg-green-100"
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white shadow p-4 flex items-center gap-4">
      <div
        className={`h-12 w-12 rounded-xl ${color} text-white flex items-center justify-center text-xl`}
      >
        {icon}
      </div>
      <div>
        <div className="text-sm text-gray-500">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function CourseCard({
  title,
  progress,
  color,
}: {
  title: string;
  progress: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white shadow p-4 space-y-3">
      <div className={`h-2 rounded-full ${color}`} />
      <div className="font-semibold">{title}</div>

      <div className="text-sm text-gray-500">
        Progression : {progress}%
      </div>

      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full bg-blue-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button className="mt-2 w-full rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        Continuer
      </button>
    </div>
  );
}
