import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type CourseStatus = "active" | "archived";
type ResourceType =
  | "pdf"
  | "video"
  | "link"
  | "file"
  | "word"
  | "powerpoint";
type AssessmentType = "quiz" | "assignment" | "exam";
type AssessmentStatus = "draft" | "published" | "closed";

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  status: CourseStatus;
  join_code: string | null;
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
  type: ResourceType;
  title: string;
  url: string;
};

type AssessmentRow = {
  id: string;
  type: AssessmentType;
  title: string;
  due_at: string | null;
  status: AssessmentStatus;
};

type EnrollmentRow = {
  student_id: string;
  profiles:
    | {
        id: string;
        full_name: string | null;
      }
    | {
        id: string;
        full_name: string | null;
      }[]
    | null;
};

type ProgressRow = {
  student_id: string;
  progress_percent: number;
};

type SectionView = {
  id: string;
  title: string;
  orderIndex: number;
  items: {
    id: string;
    type: "PDF" | "Vidéo" | "Lien" | "Fichier" | "Word" | "PowerPoint";
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

type StudentView = {
  id: string;
  name: string;
  progress: number;
};

function normalizeProfile(value: EnrollmentRow["profiles"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function resourceTypeLabel(
  type: ResourceType
): "PDF" | "Vidéo" | "Lien" | "Fichier" | "Word" | "PowerPoint" {
  if (type === "pdf") return "PDF";
  if (type === "video") return "Vidéo";
  if (type === "link") return "Lien";
  if (type === "word") return "Word";
  if (type === "powerpoint") return "PowerPoint";

  return "Fichier";
}

function assessmentTypeLabel(type: AssessmentType): "Quiz" | "Devoir" | "Examen" {
  if (type === "assignment") return "Devoir";
  if (type === "exam") return "Examen";
  return "Quiz";
}

function assessmentStatusLabel(status: AssessmentStatus): "Brouillon" | "Publié" | "Clôturé" {
  if (status === "published") return "Publié";
  if (status === "closed") return "Clôturé";
  return "Brouillon";
}

function formatDateTime(value: string | null) {
  if (!value) return "Sans échéance";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function typeBadgeClass(type: "Quiz" | "Devoir" | "Examen") {
  if (type === "Examen") return "sn-badge sn-badge-red";
  if (type === "Devoir") return "sn-badge sn-badge-blue";
  return "sn-badge sn-badge-gray";
}

function statusBadgeClass(status: "Brouillon" | "Publié" | "Clôturé") {
  if (status === "Publié") return "sn-badge sn-badge-green";
  if (status === "Clôturé") return "sn-badge sn-badge-red";
  return "sn-badge sn-badge-gray";
}

function clampProgress(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeErrorMessage(err: unknown, fallback: string) {
  if (typeof err === "object" && err !== null) {
    const maybe = err as {
      message?: string;
      error_description?: string;
      details?: string;
    };

    return maybe.message || maybe.error_description || maybe.details || fallback;
  }

  return fallback;
}

export default function TeacherCourseDetail() {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [course, setCourse] = useState<CourseRow | null>(null);
  const [sections, setSections] = useState<SectionView[]>([]);
  const [assessments, setAssessments] = useState<AssessmentView[]>([]);
  const [students, setStudents] = useState<StudentView[]>([]);

  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [resourceSectionId, setResourceSectionId] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceType, setResourceType] = useState<ResourceType>("file");

  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(false);
  const [savingResource, setSavingResource] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
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
      setStudents([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [
        courseResult,
        sectionsResult,
        resourcesResult,
        assessmentsResult,
        enrollmentsResult,
        progressResult,
      ] = await Promise.all([
        supabase
          .from("courses")
          .select("id, title, description, status, join_code, created_at, updated_at")
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

        supabase
          .from("course_enrollments")
          .select(
            `
            student_id,
            profiles (
              id,
              full_name
            )
          `
          )
          .eq("course_id", courseId),

        supabase
          .from("student_progress")
          .select("student_id, progress_percent")
          .eq("course_id", courseId),
      ]);

      if (courseResult.error) throw courseResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (resourcesResult.error) throw resourcesResult.error;
      if (assessmentsResult.error) throw assessmentsResult.error;
      if (enrollmentsResult.error) throw enrollmentsResult.error;
      if (progressResult.error) throw progressResult.error;

      const sectionRows = (sectionsResult.data ?? []) as SectionRow[];
      const resourceRows = (resourcesResult.data ?? []) as ResourceRow[];
      const assessmentRows = (assessmentsResult.data ?? []) as AssessmentRow[];
      const enrollmentRows = (enrollmentsResult.data ?? []) as EnrollmentRow[];
      const progressRows = (progressResult.data ?? []) as ProgressRow[];

      const progressByStudentId = progressRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.student_id] = clampProgress(row.progress_percent);
        return acc;
      }, {});

      setCourse(courseResult.data as CourseRow);

      setSections(
        sectionRows.map((section) => ({
          id: section.id,
          title: section.title,
          orderIndex: section.order_index,
          items: resourceRows
            .filter((resource) => resource.section_id === section.id)
            .map((resource) => ({
              id: resource.id,
              type: resourceTypeLabel(resource.type),
              label: resource.title,
              url: resource.url,
            })),
        }))
      );

      setAssessments(
        assessmentRows.map((assessment) => ({
          id: assessment.id,
          type: assessmentTypeLabel(assessment.type),
          title: assessment.title,
          when: formatDateTime(assessment.due_at),
          status: assessmentStatusLabel(assessment.status),
        }))
      );

      setStudents(
        enrollmentRows
          .map((row) => {
            const profile = normalizeProfile(row.profiles);

            return {
              id: row.student_id,
              name: profile?.full_name?.trim() || "Apprenant",
              progress: progressByStudentId[row.student_id] ?? 0,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err) {
      console.error("[TeacherCourseDetail] loadCourseDetail error:", err);
      setError(safeErrorMessage(err, "Impossible de charger le détail du cours."));
      setCourse(null);
      setSections([]);
      setAssessments([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [courseId, user]);

  useEffect(() => {
    if (authLoading) return;
    void loadCourseDetail();
  }, [authLoading, loadCourseDetail]);

  const averageProgress = useMemo(() => {
    if (students.length === 0) return 0;
    const total = students.reduce((sum, student) => sum + student.progress, 0);
    return Math.round(total / students.length);
  }, [students]);

  const resourceCount = useMemo(() => {
    return sections.reduce((sum, section) => sum + section.items.length, 0);
  }, [sections]);

  const subtitle = useMemo(() => {
    if (!course) return "";
    return course.description?.trim() || "Plan de cours, ressources et évaluations liées.";
  }, [course]);

  const isLoading = authLoading || loading;

  async function createSection() {
    if (!courseId || savingSection) return;

    const title = newSectionTitle.trim();

    if (title.length < 2) {
      alert("Le titre de la section doit contenir au moins 2 caractères.");
      return;
    }

    try {
      setSavingSection(true);

      const nextOrder =
        sections.length > 0 ? Math.max(...sections.map((section) => section.orderIndex)) + 1 : 0;

      const { data: insertedSection, error: insertError } = await supabase
        .from("course_sections")
        .insert({
          course_id: courseId,
          title,
          order_index: nextOrder,
        })
        .select("id, title, order_index")
        .single();

      if (insertError) throw insertError;

      console.log("[TeacherCourseDetail] section created:", insertedSection);

      if (insertError) throw insertError;

      setNewSectionTitle("");
      await loadCourseDetail();
    } catch (err) {
      console.error("[TeacherCourseDetail] createSection error:", err);
      alert(safeErrorMessage(err, "Impossible de créer la section."));
    } finally {
      setSavingSection(false);
    }
  }

  async function createResource() {
    if (!courseId || !user || savingResource) return;

    const title = resourceTitle.trim();

    if (title.length < 2) {
      alert("Le titre de la ressource doit contenir au moins 2 caractères.");
      return;
    }

    try {
      setSavingResource(true);

      let finalUrl = resourceUrl.trim();

      // =====================================================
      // Upload fichier local
      // =====================================================

      if (resourceFile) {
        //const ext = resourceFile.name.split(".").pop() ?? "file";

        const filePath = `${courseId}/${Date.now()}-${resourceFile.name}`;

        const { error: uploadError } = await supabase.storage
          .from("course-resources")
          .upload(filePath, resourceFile, {
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage
          .from("course-resources")
          .getPublicUrl(filePath);

        finalUrl = data.publicUrl;
      }

      if (!finalUrl) {
        alert("Veuillez sélectionner un fichier ou renseigner une URL.");
        return;
      }

      const { error: insertError } = await supabase.from("resources").insert({
        course_id: courseId,
        section_id: resourceSectionId || null,
        type: resourceType,
        title,
        url: finalUrl,
        created_by: user.id,
        is_downloadable: true,
        visibility: "public_to_course",
      });

      if (insertError) throw insertError;

      setResourceTitle("");
      setResourceUrl("");
      setResourceFile(null);
      setResourceType("file");
      setResourceSectionId("");

      await loadCourseDetail();
    } catch (err) {
      console.error("[TeacherCourseDetail] createResource error:", err);

      alert(
        safeErrorMessage(err, "Impossible d’ajouter la ressource.")
      );
    } finally {
      setSavingResource(false);
    }
  }

  async function toggleCourseStatus() {
    if (!course || updatingStatus) return;

    try {
      setUpdatingStatus(true);

      const nextStatus: CourseStatus = course.status === "active" ? "archived" : "active";

      const { error: updateError } = await supabase
        .from("courses")
        .update({ status: nextStatus })
        .eq("id", course.id);

      if (updateError) throw updateError;

      await loadCourseDetail();
    } catch (err) {
      console.error("[TeacherCourseDetail] toggleCourseStatus error:", err);
      alert(safeErrorMessage(err, "Impossible de modifier le statut du cours."));
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xl font-semibold">{course?.title ?? "Cours"}</div>
            {course && (
              <span
                className={
                  course.status === "active"
                    ? "sn-badge sn-badge-green"
                    : "sn-badge sn-badge-gray"
                }
              >
                {course.status === "active" ? "Actif" : "Archivé"}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <button className="sn-btn-ghost sn-press" onClick={() => navigate("/app/teacher/courses")}>
            ← Retour
          </button>

          {course && (
            <button
              className="sn-btn-ghost sn-press"
              onClick={() => void toggleCourseStatus()}
              disabled={updatingStatus}
            >
              {updatingStatus
                ? "Mise à jour..."
                : course.status === "active"
                ? "Archiver"
                : "Réactiver"}
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 sn-card p-5 animate-pulse space-y-3">
            <div className="h-5 w-1/3 rounded bg-gray-200" />
            <div className="h-20 rounded bg-gray-100" />
            <div className="h-20 rounded bg-gray-100" />
          </div>
          <div className="sn-card p-5 animate-pulse space-y-3">
            <div className="h-5 w-1/2 rounded bg-gray-200" />
            <div className="h-20 rounded bg-gray-100" />
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

      {!isLoading && !error && course && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <InfoCard label="Sections" value={String(sections.length)} />
            <InfoCard label="Ressources" value={String(resourceCount)} />
            <InfoCard label="Évaluations" value={String(assessments.length)} />
            <InfoCard label="Apprenants" value={String(students.length)} />
            <InfoCard label="Progression moy." value={`${averageProgress}%`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="sn-card p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Sections / Chapitres</div>
                    <div className="text-sm text-gray-500">
                      Structurez le cours en chapitres et ajoutez des ressources.
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      className="w-64 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Titre de section"
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      disabled={savingSection}
                    />
                    <button
                      className="sn-btn-primary sn-press"
                      onClick={() => void createSection()}
                      disabled={savingSection || !newSectionTitle.trim()}
                    >
                      {savingSection ? "Ajout..." : "+ Section"}
                    </button>
                  </div>
                </div>

                {sections.length === 0 ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    Aucune section pour le moment.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sections.map((section) => (
                      <div key={section.id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">{section.title}</div>
                            <div className="text-sm text-gray-500">
                              {section.items.length} ressource(s)
                            </div>
                          </div>

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

                        {section.items.length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {section.items.map((item) => (
                              <div
                                key={item.id}
                                className="rounded-2xl bg-gray-50 border border-gray-100 p-3 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0 text-sm text-gray-800">
                                  <span className="font-semibold">{item.type}</span>{" "}
                                  <span className="text-gray-600">— {item.label}</span>
                                </div>
                                <button
                                  className="sn-btn-ghost sn-press"
                                  type="button"
                                  onClick={() =>
                                    window.open(item.url, "_blank", "noopener,noreferrer")
                                  }
                                >
                                  Ouvrir
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-gray-500">
                            Aucune ressource dans cette section.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sn-card p-5 space-y-4">
                <div>
                  <div className="font-semibold">Ajouter une ressource</div>
                  <div className="text-sm text-gray-500">
                    Ajoutez un lien, un PDF, une vidéo ou un fichier lié au cours.
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="Titre de la ressource"
                    value={resourceTitle}
                    onChange={(e) => setResourceTitle(e.target.value)}
                    disabled={savingResource}
                  />

                  <select
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    value={resourceType}
                    onChange={(e) => setResourceType(e.target.value as ResourceType)}
                    disabled={savingResource}
                  >
                    <option value="file">Fichier</option>
                    <option value="pdf">PDF</option>
                    <option value="word">Word</option>
                    <option value="powerpoint">PowerPoint</option>
                    <option value="video">Vidéo</option>
                    <option value="link">Lien</option>
                  </select>

                  {resourceType === "link" || resourceType === "video" ? (
                    <input
                      className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="URL de la ressource"
                      value={resourceUrl}
                      onChange={(e) => setResourceUrl(e.target.value)}
                      disabled={savingResource}
                    />
                  ) : (
                    <input
                      type="file"
                      className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      accept="
                        .pdf,
                        .doc,
                        .docx,
                        .ppt,
                        .pptx,
                        .xls,
                        .xlsx,
                        .zip,
                        .rar,
                        video/*,
                        image/*
                      "
                      disabled={savingResource}
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setResourceFile(file);

                        if (file && !resourceTitle.trim()) {
                          const cleanName = file.name.replace(/\.[^/.]+$/, "");
                          setResourceTitle(cleanName);
                        }
                      }}
                    />
                  )}

                  <select
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    value={resourceSectionId}
                    onChange={(e) => setResourceSectionId(e.target.value)}
                    disabled={savingResource}
                  >
                    <option value="">Sans section</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  className="sn-btn-primary sn-press w-fit"
                  onClick={() => void createResource()}
                  disabled={
                    savingResource ||
                    !resourceTitle.trim() ||
                    (
                      !resourceFile &&
                      !resourceUrl.trim()
                    )
                  }
                >
                  {savingResource ? "Ajout..." : "+ Ajouter la ressource"}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="sn-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Évaluations liées</div>
                  <button
                    className="sn-btn-ghost sn-press"
                    onClick={() =>
                      navigate(`/app/teacher/assessments/new?course=${courseId ?? ""}`)
                    }
                  >
                    + Créer
                  </button>
                </div>

                {assessments.length === 0 ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    Aucune évaluation liée.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assessments.map((assessment) => (
                      <div key={assessment.id} className="rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{assessment.title}</div>
                            <div className="text-sm text-gray-500">{assessment.when}</div>
                          </div>
                          <span className={typeBadgeClass(assessment.type)}>
                            {assessment.type}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className={statusBadgeClass(assessment.status)}>
                            {assessment.status}
                          </span>

                          <button
                            className="sn-btn-primary sn-press"
                            type="button"
                            onClick={() => navigate(`/app/teacher/assessments/${assessment.id}`)}
                          >
                            Ouvrir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sn-card p-5 space-y-4">
                <div>
                  <div className="font-semibold">Apprenants inscrits</div>
                  <div className="text-sm text-gray-500">
                    Suivi rapide de la progression par apprenant.
                  </div>
                </div>

                {students.length === 0 ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                    Aucun apprenant inscrit.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {students.map((student) => (
                      <div key={student.id} className="rounded-2xl border border-gray-100 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-sm text-gray-900">{student.name}</div>
                          <div className="text-xs text-gray-500">{student.progress}%</div>
                        </div>
                        <div className="mt-2 sn-progress">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${student.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sn-card p-5 text-sm text-gray-600 space-y-2">
                <div className="font-semibold text-gray-900">Informations</div>
                <div>Code du cours : {course.join_code ?? "Non défini"}</div>
                <div>Créé le : {formatDateTime(course.created_at)}</div>
                <div>Mis à jour : {formatDateTime(course.updated_at)}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}