import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
};

type SectionRow = {
  id: string;
  title: string;
  order_index: number;
};

type ResourceRow = {
  id: string;
  section_id: string | null;
  type: "pdf" | "video" | "link" | "file" | "word" | "powerpoint";
  title: string;
  url: string;
};

function resourceLabel(type: ResourceRow["type"]) {
  if (type === "pdf") return "PDF";
  if (type === "video") return "Vidéo";
  if (type === "link") return "Lien";
  if (type === "word") return "Word";
  if (type === "powerpoint") return "PowerPoint";
  return "Fichier";
}

export default function StudentCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [course, setCourse] = useState<CourseRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourse = useCallback(async () => {
    if (!courseId || !user || user.isDemo) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const enrollment = await supabase
        .from("course_enrollments")
        .select("course_id")
        .eq("course_id", courseId)
        .eq("student_id", user.id)
        .maybeSingle();

      if (enrollment.error) throw enrollment.error;
      if (!enrollment.data) {
        setError("Vous n’êtes pas inscrit à ce cours.");
        return;
      }

      const [courseResult, sectionsResult, resourcesResult] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, description, status")
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
          .eq("visibility", "public_to_course")
          .order("created_at", { ascending: true }),
      ]);

      if (courseResult.error) throw courseResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (resourcesResult.error) throw resourcesResult.error;

      setCourse(courseResult.data as CourseRow);
      setSections((sectionsResult.data ?? []) as SectionRow[]);
      setResources((resourcesResult.data ?? []) as ResourceRow[]);
    } catch (err) {
      console.error("[StudentCourseDetail] loadCourse error:", err);
      setError("Impossible de charger ce cours.");
    } finally {
      setLoading(false);
    }
  }, [courseId, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadCourse();
  }, [authLoading, loadCourse]);

  const resourcesWithoutSection = useMemo(
    () => resources.filter((r) => !r.section_id),
    [resources]
  );

  const isLoading = authLoading || loading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">{course?.title ?? "Cours"}</div>
          <div className="text-sm text-gray-500">
            {course?.description || "Ressources et chapitres du cours."}
          </div>
        </div>

        <button className="sn-btn-ghost sn-press" onClick={() => navigate(-1)}>
          ← Retour
        </button>
      </div>

      {isLoading && (
        <div className="sn-card p-6 animate-pulse space-y-3">
          <div className="h-5 w-1/3 rounded bg-gray-200" />
          <div className="h-20 rounded bg-gray-100" />
        </div>
      )}

      {!isLoading && error && (
        <div className="sn-card p-5 border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {!isLoading && !error && course && (
        <div className="space-y-4">
          {sections.length === 0 && resourcesWithoutSection.length === 0 && (
            <div className="sn-card p-6 text-sm text-gray-600">
              Aucun contenu disponible pour le moment.
            </div>
          )}

          {sections.map((section) => {
            const sectionResources = resources.filter((r) => r.section_id === section.id);

            return (
              <div key={section.id} className="sn-card p-5 space-y-4">
                <div>
                  <div className="font-semibold text-gray-900">{section.title}</div>
                  <div className="text-sm text-gray-500">
                    {sectionResources.length} ressource(s)
                  </div>
                </div>

                {sectionResources.length === 0 ? (
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-500">
                    Aucune ressource dans cette section.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sectionResources.map((resource) => (
                      <ResourceCard key={resource.id} resource={resource} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {resourcesWithoutSection.length > 0 && (
            <div className="sn-card p-5 space-y-4">
              <div className="font-semibold text-gray-900">Ressources générales</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {resourcesWithoutSection.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource }: { resource: ResourceRow }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{resource.title}</div>
        <div className="text-xs text-gray-500">{resourceLabel(resource.type)}</div>
      </div>

      <button
        className="sn-btn-primary sn-press"
        type="button"
        onClick={() => window.open(resource.url, "_blank", "noopener,noreferrer")}
      >
        Ouvrir
      </button>
    </div>
  );
}