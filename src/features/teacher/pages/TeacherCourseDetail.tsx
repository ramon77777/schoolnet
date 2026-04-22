import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

type SectionRow = {
  id: string;
  title: string;
  order_index: number;
};

type ResourceRow = {
  id: string;
  section_id: string | null;
  type: "pdf" | "video" | "link" | "file";
  title: string;
  url: string;
};

type AssessmentRow = {
  id: string;
  type: "quiz" | "assignment" | "exam";
  title: string;
  due_at: string | null;
  status: "draft" | "published" | "closed";
};

type SectionView = {
  id: string;
  title: string;
  items: {
    id: string;
    type: "PDF" | "Vidéo" | "Lien" | "Fichier";
    label: string;
    url: string;
  }[];
};

type AssessmentView = {
  id: string;
  type: "Quiz" | "Devoir" | "Examen";
  title: string;
  when: string;
  status: "Brouillon" | "Publié" | "Clôturé";
};

function resourceTypeLabel(type: ResourceRow["type"]): "PDF" | "Vidéo" | "Lien" | "Fichier" {
  if (type === "pdf") return "PDF";
  if (type === "video") return "Vidéo";
  if (type === "link") return "Lien";
  return "Fichier";
}

function assessmentTypeLabel(type: AssessmentRow["type"]): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function assessmentStatusLabel(
  status: AssessmentRow["status"]
): "Brouillon" | "Publié" | "Clôturé" {
  if (status === "published") return "Publié";
  if (status === "closed") return "Clôturé";
  return "Brouillon";
}

function formatDueAt(value: string | null) {
  if (!value) return "Sans échéance";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function badgeClass(type: "Quiz" | "Devoir" | "Examen") {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

export default function TeacherCourseDetail() {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [course, setCourse] = useState<CourseRow | null>(null);
  const [sections, setSections] = useState<SectionView[]>([]);
  const [assessments, setAssessments] = useState<AssessmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourseDetail = useCallback(async () => {
    if (!courseId) {
      setError("Cours introuvable.");
      setLoading(false);
      return;
    }

    if (!user || user.isDemo) {
      setCourse(null);
      setSections([]);
      setAssessments([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [courseResult, sectionsResult, resourcesResult, assessmentsResult] =
        await Promise.all([
          supabase
            .from("courses")
            .select("id, title, description, status, created_at, updated_at")
            .eq("id", courseId)
            .single(),

          supabase
            .from("course_sections")
            .select("id, title, order_index")
            .eq("course_id", courseId)
            .order("order_index", { ascending: true }),

          supabase
            .from("resources")
            .select("id, section_id, type, title, url")
            .eq("course_id", courseId)
            .order("created_at", { ascending: true }),

          supabase
            .from("assessments")
            .select("id, type, title, due_at, status")
            .eq("course_id", courseId)
            .order("created_at", { ascending: false }),
        ]);

      if (courseResult.error) throw courseResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (resourcesResult.error) throw resourcesResult.error;
      if (assessmentsResult.error) throw assessmentsResult.error;

      const courseData = courseResult.data as CourseRow;
      const sectionRows = (sectionsResult.data ?? []) as SectionRow[];
      const resourceRows = (resourcesResult.data ?? []) as ResourceRow[];
      const assessmentRows = (assessmentsResult.data ?? []) as AssessmentRow[];

      const sectionsView: SectionView[] = sectionRows.map((section) => ({
        id: section.id,
        title: section.title,
        items: resourceRows
          .filter((resource) => resource.section_id === section.id)
          .map((resource) => ({
            id: resource.id,
            type: resourceTypeLabel(resource.type),
            label: resource.title,
            url: resource.url,
          })),
      }));

      const assessmentsView: AssessmentView[] = assessmentRows.map((assessment) => ({
        id: assessment.id,
        type: assessmentTypeLabel(assessment.type),
        title: assessment.title,
        when: formatDueAt(assessment.due_at),
        status: assessmentStatusLabel(assessment.status),
      }));

      setCourse(courseData);
      setSections(sectionsView);
      setAssessments(assessmentsView);
    } catch (err) {
      console.error("[TeacherCourseDetail] loadCourseDetail error:", err);
      setError("Impossible de charger le détail du cours.");
      setCourse(null);
      setSections([]);
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadCourseDetail();
  }, [authLoading, loadCourseDetail]);

  const sectionCountLabel = useMemo(() => `${sections.length} section(s)`, [sections.length]);

  const subtitle = useMemo(() => {
    if (!course) return "";
    return course.description?.trim() || "Plan de cours, ressources et évaluations liées";
  }, [course]);

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{course?.title ?? "Cours"}</div>
          <div className="text-sm text-gray-500">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <button className="sn-btn-ghost sn-press" onClick={() => navigate(-1)}>
            ← Retour
          </button>
          <button
            className="sn-btn-ghost sn-press"
            onClick={() => alert("Paramètres du cours (à venir)")}
          >
            Paramètres
          </button>
        </div>
      </div>

      {user?.isDemo && (
        <div className="sn-card p-4 text-sm text-amber-700 bg-amber-50 border border-amber-200">
          Mode démo actif : les données réelles ne sont pas chargées.
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="sn-card p-4 animate-pulse">
            <div className="h-4 w-1/3 rounded bg-gray-200" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 sn-card p-5 animate-pulse space-y-3">
              <div className="h-5 w-1/3 rounded bg-gray-200" />
              <div className="h-20 rounded bg-gray-100" />
              <div className="h-20 rounded bg-gray-100" />
            </div>
            <div className="sn-card p-5 animate-pulse space-y-3">
              <div className="h-5 w-1/2 rounded bg-gray-200" />
              <div className="h-20 rounded bg-gray-100" />
              <div className="h-20 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-5 border border-red-200 bg-red-50 text-red-700 space-y-3">
          <div className="font-medium">Erreur de chargement</div>
          <div className="text-sm">{error}</div>
          <button className="sn-btn-primary sn-press w-fit" onClick={() => void loadCourseDetail()}>
            Réessayer
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="sn-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-gray-700">
              Actions rapides : ajoute des ressources ou crée une évaluation liée au cours.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="sn-btn-ghost sn-press"
                onClick={() => alert("Ajout de section (à venir)")}
              >
                + Ajouter une section
              </button>
              <button
                className="sn-btn-primary sn-press"
                onClick={() =>
                  navigate(`/app/teacher/assessments/new?course=${courseId ?? ""}`)
                }
              >
                + Créer une évaluation
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="sn-card p-5">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Sections / Chapitres</div>
                  <span className="sn-badge sn-badge-gray">{sectionCountLabel}</span>
                </div>

                {sections.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    Aucune section pour le moment.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {sections.map((section) => (
                      <div key={section.id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">{section.title}</div>
                            <div className="text-sm text-gray-500">
                              {section.items.length} ressource(s)
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              className="sn-btn-ghost sn-press"
                              type="button"
                              onClick={() => alert("Ajouter ressource (à venir)")}
                            >
                              + Ressource
                            </button>

                            <button
                              className="sn-btn-primary sn-press"
                              type="button"
                              onClick={() =>
                                navigate(
                                  `/app/teacher/assessments/new?course=${courseId ?? ""}&section=${section.id}`
                                )
                              }
                            >
                              + Évaluation
                            </button>
                          </div>
                        </div>

                        {section.items.length > 0 && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {section.items.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl bg-gray-50 border border-gray-100 p-3 flex items-center justify-between"
                              >
                                <div className="text-sm text-gray-800">
                                  <span className="font-semibold">{item.type}</span>{" "}
                                  <span className="text-gray-600">— {item.label}</span>
                                </div>
                                <button
                                  className="sn-btn-ghost sn-press"
                                  type="button"
                                  onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
                                >
                                  Ouvrir
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="sn-card sn-card-hover p-5">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Évaluations liées</div>
                  <button
                    className="sn-btn-ghost sn-press"
                    onClick={() => navigate("/app/teacher/assessments")}
                  >
                    Voir tout
                  </button>
                </div>

                {assessments.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    Aucune évaluation liée à ce cours pour le moment.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {assessments.map((assessment) => (
                      <div
                        key={assessment.id}
                        className="rounded-2xl border border-gray-100 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{assessment.title}</div>
                            <div className="text-sm text-gray-500">{assessment.when}</div>
                          </div>
                          <span className={badgeClass(assessment.type)}>{assessment.type}</span>
                        </div>

                        <div className="mt-3 flex items-center justify-between">
                          <span
                            className={
                              assessment.status === "Publié"
                                ? "sn-badge sn-badge-green"
                                : assessment.status === "Clôturé"
                                ? "sn-badge sn-badge-red"
                                : "sn-badge sn-badge-gray"
                            }
                          >
                            {assessment.status}
                          </span>

                          <div className="flex gap-2">
                            <button
                              className="sn-btn-ghost sn-press"
                              type="button"
                              onClick={() => navigate(`/app/teacher/grading?assessmentId=${assessment.id}`)}
                            >
                              Corrections
                            </button>
                            <button
                              className="sn-btn-primary sn-press"
                              type="button"
                              onClick={() => navigate(`/app/teacher/assessments/${assessment.id}`)}
                            >
                              Ouvrir
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4">
                  <button
                    className="sn-btn-primary w-full sn-press"
                    onClick={() =>
                      navigate(`/app/teacher/assessments/new?course=${courseId ?? ""}`)
                    }
                  >
                    + Créer une évaluation
                  </button>
                </div>
              </div>

              <div className="sn-card p-5">
                <div className="font-semibold">Aperçu</div>
                <div className="mt-2 text-sm text-gray-500">
                  Cette zone affichera ensuite :
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>progression moyenne</li>
                    <li>activité récente</li>
                    <li>alertes de correction</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}