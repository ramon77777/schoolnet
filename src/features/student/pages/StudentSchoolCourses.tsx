import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  getStudentSchoolCourses,
  isStudentSchoolCoursesPending,
} from "@/features/student/lib/studentSchoolCoursesApi";
import type { StudentSchoolCourseCatalog } from "@/features/student/lib/studentSchoolCoursesModel";
import { groupOfficialCoursesBySchool } from "@/features/student/lib/studentCourseTabs";

type Props = {
  /** Permet à l'écran Mes cours de choisir l'onglet initial. */
  onCatalogLoaded?: (userId: string, count: number) => void;
};

/**
 * Panneau des cours officiels (S4-B.2) réutilisé dans "Mes cours".
 * Uniquement la RPC contrôlée par établissement, jamais d'inscription V1.
 */
export default function StudentSchoolCourses({ onCatalogLoaded }: Props) {
  const { user, loading: authLoading } = useAuth();
  const allowed = !authLoading && !!user && !user.isDemo && user.role === "student";
  const userId = user?.id ?? "";

  const [data, setData] = useState<StudentSchoolCourseCatalog | null>(null);
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const loading = authLoading || (allowed && owner !== userId);
  const refresh = useCallback(() => {
    setOwner("");
    setRevision((n) => n + 1);
  }, []);

  useEffect(() => {
    if (authLoading || !allowed || !userId) return;
    let cancelled = false;

    void getStudentSchoolCourses()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setOwner(userId);
        setError(null);
        onCatalogLoaded?.(userId, result.courses.length);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setData(null);
        setOwner(userId);
        setError(
          isStudentSchoolCoursesPending(cause)
            ? "Les cours officiels ne sont pas encore activés sur ce serveur."
            : "Impossible d'afficher les cours officiels de votre classe. Vérifiez votre affectation auprès de votre établissement."
        );
      });
    return () => { cancelled = true; };
  }, [authLoading, allowed, userId, revision, onCatalogLoaded]);

  const catalog = allowed && owner === userId ? data : null;
  const schools = useMemo(
    () => groupOfficialCoursesBySchool(catalog?.courses ?? []),
    [catalog]
  );

  return (
    <section className="sn-card p-5 space-y-4" aria-label="Cours de mon établissement">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Cours de mon établissement {catalog ? `(${catalog.courses.length})` : ""}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Cours des classes où votre établissement vous a officiellement affecté.
          </p>
        </div>
        <button
          type="button"
          className="sn-btn-ghost"
          onClick={refresh}
          disabled={loading || !allowed}
        >
          ↻ Actualiser
        </button>
      </div>

      {user?.isDemo && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Connectez-vous avec un compte apprenant réel pour consulter les cours officiels.
        </p>
      )}

      {loading && (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600" role="status">
          Chargement des cours autorisés…
        </p>
      )}

      {!loading && error && allowed && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700 space-y-2">
          <p>{error}</p>
          <button type="button" className="sn-btn-ghost" onClick={refresh}>
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && catalog?.courses.length === 0 && (
        <div className="rounded-xl bg-slate-50 p-5 space-y-2">
          <p className="font-semibold text-slate-900">Aucun cours officiel pour l'instant.</p>
          <p className="text-sm leading-6 text-slate-600">
            Si vous êtes scolarisé dans un établissement, celui-ci doit d'abord vous
            affecter à une classe officielle ; votre enseignant pourra alors y
            rattacher ses cours. Vous pouvez continuer les cours complémentaires.
          </p>
        </div>
      )}

      {!loading && !error && !!catalog && schools.length > 0 && (
        <div className="space-y-5">
          {schools.map((school) => (
            <div key={school.schoolId} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span aria-hidden="true">🏫</span>
                <h3 className="font-bold text-slate-900">{school.schoolName}</h3>
                <span className="text-xs text-slate-500">
                  {school.courses.length} cours
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {school.courses.map((course) => (
                  <article
                    key={course.courseId}
                    className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                  >
                    <div>
                      <h4 className="text-base font-bold text-slate-900">{course.title}</h4>
                      <p className="mt-2 text-sm text-slate-600">
                        {course.className} · {course.schoolYear}
                      </p>
                      <p className="mt-1 text-sm font-medium text-indigo-700">
                        {course.subjectName}
                      </p>
                    </div>
                    {course.description && (
                      <p className="text-sm text-slate-600 line-clamp-3">
                        {course.description}
                      </p>
                    )}
                    <Link
                      className="sn-btn-primary block text-center"
                      to={`/app/student/school-courses/${course.courseId}`}
                    >
                      Voir les chapitres et ressources
                    </Link>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs leading-5 text-slate-500">
        Les cours de l'établissement sont ouverts par affectation scolaire active,
        sans inscription automatique ni modification de votre progression dans
        les cours complémentaires.
      </p>
    </section>
  );
}
