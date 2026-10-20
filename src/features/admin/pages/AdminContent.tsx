// src/features/admin/pages/AdminContent.tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";

type CourseStatus = "active" | "archived";

type ResourceType =
  | "pdf"
  | "video"
  | "link"
  | "file"
  | "word"
  | "powerpoint";

type ResourceVisibility = "public_to_course" | "hidden";

type ResourceSourceMode = "upload" | "url";

const COURSE_RESOURCES_BUCKET = "course-resources";

function inferResourceTypeFromFile(file: File): ResourceType {
  const extension =
    file.name.split(".").pop()?.toLowerCase() ?? "";

  const mimeType = file.type.toLowerCase();

  if (
    extension === "pdf" ||
    mimeType === "application/pdf"
  ) {
    return "pdf";
  }

  if (
    extension === "doc" ||
    extension === "docx" ||
    mimeType === "application/msword" ||
    mimeType.includes("wordprocessingml")
  ) {
    return "word";
  }

  if (
    extension === "ppt" ||
    extension === "pptx" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType.includes("presentationml")
  ) {
    return "powerpoint";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return "file";
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "");
}

function sanitizeStorageFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    normalized
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "resource"
  );
}

function getCourseResourceStoragePath(url: string) {
  const marker =
    `/storage/v1/object/public/${COURSE_RESOURCES_BUCKET}/`;

  const index = url.indexOf(marker);

  if (index === -1) {
    return null;
  }

  const encodedPath = url
    .slice(index + marker.length)
    .split("?")[0];

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

type CourseRow = {
  id: string;
  title: string;
  description: string | null;
  level_id: number | null;
  class_id: string | null;
  status: CourseStatus;
  join_code: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ClassRow = {
  id: string;
  level_id: number;
  name: string;
  school_year: string;
  school_year_id: string | null;
};

type LevelRow = {
  id: number;
  name: string;
  order_index: number;
};

type TeacherRow = {
  id: string;
  full_name: string | null;
  role: string;
};

type CourseTeacherRow = {
  course_id: string;
  teacher_id: string;
  created_at: string;
};

type CourseSectionRow = {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

type ResourceRow = {
  id: string;
  course_id: string;
  section_id: string | null;
  type: ResourceType;
  title: string;
  url: string;
  is_downloadable: boolean;
  visibility: ResourceVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type EnrollmentRow = {
  course_id: string;
  student_id: string;
  enrolled_at: string;
};

const PAGE_SIZE = 8;

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    return (
      maybeError.message ||
      maybeError.details ||
      maybeError.hint ||
      fallback
    );
  }

  return fallback;
}

function resourceTypeLabel(type: ResourceType) {
  switch (type) {
    case "pdf":
      return "PDF";
    case "video":
      return "Vidéo";
    case "link":
      return "Lien";
    case "file":
      return "Fichier";
    case "word":
      return "Word";
    case "powerpoint":
      return "PowerPoint";
    default:
      return type;
  }
}

function resourceTypeIcon(type: ResourceType) {
  switch (type) {
    case "pdf":
      return "📕";
    case "video":
      return "🎬";
    case "link":
      return "🔗";
    case "file":
      return "📎";
    case "word":
      return "📘";
    case "powerpoint":
      return "📙";
    default:
      return "📄";
  }
}

export default function AdminContent() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [courseTeachers, setCourseTeachers] = useState<CourseTeacherRow[]>(
    [],
  );
  const [sections, setSections] = useState<CourseSectionRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CourseStatus>(
    "all",
  );
  const [classFilter, setClassFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);

  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseClassId, setNewCourseClassId] = useState("");
  const [newCourseTeacherId, setNewCourseTeacherId] = useState("");

  const [manageCourseId, setManageCourseId] = useState<string | null>(
    null,
  );

  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [teacherBusy, setTeacherBusy] = useState(false);

  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [sectionBusy, setSectionBusy] = useState(false);

  const [newResourceTitle, setNewResourceTitle] = useState("");

  const [newResourceSource, setNewResourceSource] =
    useState<ResourceSourceMode>("upload");

  const [newResourceFile, setNewResourceFile] =
    useState<File | null>(null);

  const [
    resourceFileInputKey,
    setResourceFileInputKey,
  ] = useState(0);

  const [newResourceUrl, setNewResourceUrl] = useState("");

  const [newResourceType, setNewResourceType] =
    useState<ResourceType>("file");

  const [newResourceVisibility, setNewResourceVisibility] =
    useState<ResourceVisibility>("public_to_course");

  const [newResourceSectionId, setNewResourceSectionId] =
    useState<string>("");

  const [newResourceDownloadable, setNewResourceDownloadable] =
    useState(false);

  const [resourceBusy, setResourceBusy] = useState(false);

  const loadContent = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const [
        coursesResult,
        classesResult,
        levelsResult,
        teachersResult,
        courseTeachersResult,
        sectionsResult,
        resourcesResult,
        enrollmentsResult,
      ] = await Promise.all([
        supabase
          .from("courses")
          .select(
            "id, title, description, level_id, class_id, status, join_code, created_by, created_at, updated_at",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("classes")
          .select(
            "id, level_id, name, school_year, school_year_id",
          )
          .order("name", { ascending: true }),

        supabase
          .from("levels")
          .select("id, name, order_index")
          .order("order_index", { ascending: true }),

        supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("role", "teacher")
          .order("full_name", { ascending: true }),

        supabase
          .from("course_teachers")
          .select("course_id, teacher_id, created_at"),

        supabase
          .from("course_sections")
          .select(
            "id, course_id, title, order_index, created_at, updated_at",
          )
          .order("order_index", { ascending: true }),

        supabase
          .from("resources")
          .select(
            "id, course_id, section_id, type, title, url, is_downloadable, visibility, created_by, created_at, updated_at",
          )
          .order("created_at", { ascending: false }),

        supabase
          .from("course_enrollments")
          .select("course_id, student_id, enrolled_at"),
      ]);

      const results = [
        coursesResult,
        classesResult,
        levelsResult,
        teachersResult,
        courseTeachersResult,
        sectionsResult,
        resourcesResult,
        enrollmentsResult,
      ];

      const failed = results.find((result) => result.error);

      if (failed?.error) {
        throw failed.error;
      }

      setCourses((coursesResult.data ?? []) as CourseRow[]);
      setClasses((classesResult.data ?? []) as ClassRow[]);
      setLevels((levelsResult.data ?? []) as LevelRow[]);
      setTeachers((teachersResult.data ?? []) as TeacherRow[]);

      setCourseTeachers(
        (courseTeachersResult.data ?? []) as CourseTeacherRow[],
      );

      setSections(
        (sectionsResult.data ?? []) as CourseSectionRow[],
      );

      setResources((resourcesResult.data ?? []) as ResourceRow[]);

      setEnrollments(
        (enrollmentsResult.data ?? []) as EnrollmentRow[],
      );
    } catch (e: unknown) {
      console.error("[AdminContent] load error:", e);

      setError(
        getErrorMessage(
          e,
          "Impossible de charger les contenus SchoolNet.",
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const classById = useMemo(() => {
    return new Map(classes.map((item) => [item.id, item]));
  }, [classes]);

  const levelById = useMemo(() => {
    return new Map(levels.map((item) => [item.id, item]));
  }, [levels]);

  const teacherById = useMemo(() => {
    return new Map(teachers.map((item) => [item.id, item]));
  }, [teachers]);

  const manageCourse = useMemo(() => {
    return courses.find((course) => course.id === manageCourseId) ?? null;
  }, [courses, manageCourseId]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return courses.filter((course) => {
      if (statusFilter !== "all" && course.status !== statusFilter) {
        return false;
      }

      if (classFilter !== "all" && course.class_id !== classFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const linkedClass = course.class_id
        ? classById.get(course.class_id)
        : undefined;

      const linkedLevel =
        course.level_id !== null
          ? levelById.get(course.level_id)
          : undefined;

      const linkedTeacherNames = courseTeachers
        .filter((item) => item.course_id === course.id)
        .map(
          (item) =>
            teacherById.get(item.teacher_id)?.full_name ?? "",
        )
        .join(" ");

      const haystack = [
        course.title,
        course.description ?? "",
        linkedClass?.name ?? "",
        linkedClass?.school_year ?? "",
        linkedLevel?.name ?? "",
        linkedTeacherNames,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [
    courses,
    search,
    statusFilter,
    classFilter,
    classById,
    levelById,
    courseTeachers,
    teacherById,
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredCourses.length / PAGE_SIZE),
  );

  const currentPage = Math.min(page, pageCount);

  const visibleCourses = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCourses.slice(start, start + PAGE_SIZE);
  }, [filteredCourses, currentPage]);

  const activeCoursesCount = courses.filter(
    (course) => course.status === "active",
  ).length;


  const manageCourseTeachers = useMemo(() => {
    if (!manageCourseId) return [];

    return courseTeachers.filter(
      (item) => item.course_id === manageCourseId,
    );
  }, [courseTeachers, manageCourseId]);

  const manageCourseSections = useMemo(() => {
    if (!manageCourseId) return [];

    return sections
      .filter((item) => item.course_id === manageCourseId)
      .sort((a, b) => a.order_index - b.order_index);
  }, [sections, manageCourseId]);

  const manageCourseResources = useMemo(() => {
    if (!manageCourseId) return [];

    return resources.filter(
      (item) => item.course_id === manageCourseId,
    );
  }, [resources, manageCourseId]);

  const availableTeachers = useMemo(() => {
    const alreadyAssigned = new Set(
      manageCourseTeachers.map((item) => item.teacher_id),
    );

    return teachers.filter(
      (teacher) => !alreadyAssigned.has(teacher.id),
    );
  }, [teachers, manageCourseTeachers]);

  function resetCreateForm() {
    setNewCourseTitle("");
    setNewCourseDescription("");
    setNewCourseClassId("");
    setNewCourseTeacherId("");
  }

  function resetResourceForm() {
    setNewResourceTitle("");
    setNewResourceSource("upload");
    setNewResourceFile(null);
    setResourceFileInputKey((value) => value + 1);
    setNewResourceUrl("");
    setNewResourceType("file");
    setNewResourceVisibility("public_to_course");
    setNewResourceSectionId("");
    setNewResourceDownloadable(false);
  }

  function openCourseManager(courseId: string) {
    setManageCourseId(courseId);
    setSelectedTeacherId("");
    setNewSectionTitle("");
    resetResourceForm();
    setError(null);
    setSuccess(null);
  }

  function closeCourseManager() {
    setManageCourseId(null);
    setSelectedTeacherId("");
    setNewSectionTitle("");
    setNewResourceTitle("");
    setNewResourceUrl("");
    setNewResourceType("pdf");
    setNewResourceVisibility("public_to_course");
    setNewResourceSectionId("");
    setNewResourceDownloadable(false);
    setError(null);
    setSuccess(null);
  }

  async function createCourse() {
    const title = newCourseTitle.trim();

    if (!title || !newCourseClassId || creatingCourse) {
      return;
    }

    const selectedClass = classes.find(
      (item) => item.id === newCourseClassId,
    );

    if (!selectedClass) {
      setError("La classe sélectionnée est introuvable.");
      return;
    }

    setCreatingCourse(true);
    setError(null);
    setSuccess(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error("Session administrateur introuvable.");
      }

      const { data: createdCourse, error: courseError } =
        await supabase
          .from("courses")
          .insert({
            title,
            description:
              newCourseDescription.trim() || null,
            class_id: selectedClass.id,
            level_id: selectedClass.level_id,
            status: "active" satisfies CourseStatus,
            created_by: user.id,
          })
          .select("id")
          .single();

      if (courseError) {
        throw courseError;
      }

      if (!createdCourse?.id) {
        throw new Error(
          "Le cours a été créé, mais son identifiant n’a pas été récupéré.",
        );
      }

      if (newCourseTeacherId) {
        const { error: teacherError } = await supabase
          .from("course_teachers")
          .insert({
            course_id: createdCourse.id,
            teacher_id: newCourseTeacherId,
          });

        if (teacherError) {
          throw teacherError;
        }
      }

      setSuccess(`Le cours « ${title} » a été créé avec succès.`);
      resetCreateForm();
      setCreateOpen(false);
      setPage(1);

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] create course error:", e);

      setError(
        getErrorMessage(
          e,
          "Impossible de créer le cours.",
        ),
      );
    } finally {
      setCreatingCourse(false);
    }
  }

  async function changeCourseStatus(course: CourseRow) {
    const nextStatus: CourseStatus =
      course.status === "active" ? "archived" : "active";

    setError(null);
    setSuccess(null);

    try {
      const { error: updateError } = await supabase
        .from("courses")
        .update({
          status: nextStatus,
        })
        .eq("id", course.id);

      if (updateError) {
        throw updateError;
      }

      setSuccess(
        nextStatus === "active"
          ? `Le cours « ${course.title} » a été réactivé.`
          : `Le cours « ${course.title} » a été archivé.`,
      );

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] status error:", e);

      setError(
        getErrorMessage(
          e,
          "Impossible de modifier le statut du cours.",
        ),
      );
    }
  }

  async function assignTeacher() {
    if (
      !manageCourse ||
      !selectedTeacherId ||
      teacherBusy
    ) {
      return;
    }

    const teacher = teacherById.get(selectedTeacherId);

    setTeacherBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: insertError } = await supabase
        .from("course_teachers")
        .insert({
          course_id: manageCourse.id,
          teacher_id: selectedTeacherId,
        });

      if (insertError) {
        throw insertError;
      }

      setSuccess(
        `${teacher?.full_name ?? "L’enseignant"} a été affecté au cours « ${manageCourse.title} ».`,
      );

      setSelectedTeacherId("");

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] teacher assignment error:", e);

      const message = getErrorMessage(
        e,
        "Impossible d’affecter cet enseignant.",
      );

      if (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      ) {
        setError(
          "Cet enseignant est déjà affecté à ce cours.",
        );
      } else {
        setError(message);
      }
    } finally {
      setTeacherBusy(false);
    }
  }

  async function removeTeacher(teacherId: string) {
    if (!manageCourse || teacherBusy) return;

    const teacher = teacherById.get(teacherId);

    setTeacherBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: deleteError } = await supabase
        .from("course_teachers")
        .delete()
        .eq("course_id", manageCourse.id)
        .eq("teacher_id", teacherId);

      if (deleteError) {
        throw deleteError;
      }

      setSuccess(
        `${teacher?.full_name ?? "L’enseignant"} a été retiré du cours « ${manageCourse.title} ».`,
      );

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] remove teacher error:", e);

      setError(
        getErrorMessage(
          e,
          "Impossible de retirer cet enseignant.",
        ),
      );
    } finally {
      setTeacherBusy(false);
    }
  }

  async function addSection() {
    const title = newSectionTitle.trim();

    if (!manageCourse || !title || sectionBusy) return;

    const nextOrder =
      manageCourseSections.length === 0
        ? 1
        : Math.max(
            ...manageCourseSections.map(
              (section) => section.order_index,
            ),
          ) + 1;

    setSectionBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: insertError } = await supabase
        .from("course_sections")
        .insert({
          course_id: manageCourse.id,
          title,
          order_index: nextOrder,
        });

      if (insertError) {
        throw insertError;
      }

      setSuccess(
        `La section « ${title} » a été ajoutée au cours.`,
      );

      setNewSectionTitle("");

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] add section error:", e);

      setError(
        getErrorMessage(
          e,
          "Impossible d’ajouter cette section.",
        ),
      );
    } finally {
      setSectionBusy(false);
    }
  }

  async function removeSection(section: CourseSectionRow) {
    if (sectionBusy) return;

    // Vérification côté interface pour donner immédiatement
    // un message compréhensible à l'administrateur.
    const linkedResources = resources.filter(
      (resource) => resource.section_id === section.id,
    );

    if (linkedResources.length > 0) {
      setSuccess(null);
      setError(
        `Suppression impossible. La section « ${section.title} » contient encore ${
          linkedResources.length
        } ressource${linkedResources.length > 1 ? "s" : ""} pédagogique${
          linkedResources.length > 1 ? "s" : ""
        }. Supprimez ou déplacez d’abord ${
          linkedResources.length > 1 ? "ces ressources" : "cette ressource"
        }.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Supprimer la section « ${section.title} » ?`,
    );

    if (!confirmed) return;

    setSectionBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: deleteError } = await supabase
        .from("course_sections")
        .delete()
        .eq("id", section.id);

      if (deleteError) {
        throw deleteError;
      }

      setSuccess(
        `La section « ${section.title} » a été supprimée.`,
      );

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] remove section error:", e);

      const databaseError =
        typeof e === "object" && e !== null
          ? (e as {
              code?: string;
              message?: string;
              details?: string;
            })
          : null;

      const technicalMessage = [
        databaseError?.message,
        databaseError?.details,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        databaseError?.code === "23503" ||
        technicalMessage.includes("resources_section_id_fkey")
      ) {
        setError(
          `Suppression impossible. La section « ${section.title} » contient encore une ou plusieurs ressources pédagogiques. Supprimez ou déplacez d’abord les ressources associées à cette section.`,
        );
      } else {
        setError(
          getErrorMessage(
            e,
            "Impossible de supprimer cette section.",
          ),
        );
      }
    } finally {
      setSectionBusy(false);
    }
  }

  async function addResource() {
    const title = newResourceTitle.trim();
    const externalUrl = newResourceUrl.trim();
    const localFile = newResourceFile;

    if (!manageCourse || !title || resourceBusy) {
      return;
    }

    if (
      newResourceSource === "upload" &&
      !localFile
    ) {
      setSuccess(null);
      setError(
        "Sélectionnez d’abord un fichier à importer depuis votre ordinateur.",
      );
      return;
    }

    if (
      newResourceSource === "url" &&
      !externalUrl
    ) {
      setSuccess(null);
      setError(
        "Saisissez l’URL de la ressource.",
      );
      return;
    }

    setResourceBusy(true);
    setError(null);
    setSuccess(null);

    let uploadedStoragePath: string | null = null;

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error(
          "Session administrateur introuvable.",
        );
      }

      let resourceUrl = externalUrl;
      let resourceType = newResourceType;

      if (newResourceSource === "upload") {
        const file = localFile;

        if (!file) {
          throw new Error(
            "Aucun fichier n’a été sélectionné.",
          );
        }

        resourceType =
          inferResourceTypeFromFile(file);

        const safeFileName =
          sanitizeStorageFileName(file.name);

        const storagePath = [
          user.id,
          manageCourse.id,
          `${crypto.randomUUID()}-${safeFileName}`,
        ].join("/");

        const { error: uploadError } =
          await supabase.storage
            .from(COURSE_RESOURCES_BUCKET)
            .upload(storagePath, file, {
              cacheControl: "3600",
              upsert: false,
              contentType:
                file.type || undefined,
            });

        if (uploadError) {
          throw uploadError;
        }

        uploadedStoragePath = storagePath;

        const { data: publicUrlData } =
          supabase.storage
            .from(COURSE_RESOURCES_BUCKET)
            .getPublicUrl(storagePath);

        if (!publicUrlData.publicUrl) {
          throw new Error(
            "Le fichier a été importé, mais son URL n’a pas pu être générée.",
          );
        }

        resourceUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } =
        await supabase
          .from("resources")
          .insert({
            course_id: manageCourse.id,
            section_id:
              newResourceSectionId || null,
            type: resourceType,
            title,
            url: resourceUrl,
            is_downloadable:
              newResourceDownloadable,
            visibility:
              newResourceVisibility,
            created_by: user.id,
          });

      if (insertError) {
        throw insertError;
      }

      setSuccess(
        newResourceSource === "upload"
          ? `La ressource « ${title} » a été importée et ajoutée au cours.`
          : `La ressource « ${title} » a été ajoutée au cours.`,
      );

      resetResourceForm();

      await loadContent(true);
    } catch (e: unknown) {
      console.error(
        "[AdminContent] add resource error:",
        e,
      );

      /*
      * Si l'import Storage a réussi mais que
      * l'enregistrement en base échoue,
      * on évite de laisser un fichier orphelin.
      */
      if (uploadedStoragePath) {
        const { error: cleanupError } =
          await supabase.storage
            .from(COURSE_RESOURCES_BUCKET)
            .remove([uploadedStoragePath]);

        if (cleanupError) {
          console.error(
            "[AdminContent] storage cleanup error:",
            cleanupError,
          );
        }
      }

      setError(
        getErrorMessage(
          e,
          newResourceSource === "upload"
            ? "Impossible d’importer cette ressource."
            : "Impossible d’ajouter cette ressource.",
        ),
      );
    } finally {
      setResourceBusy(false);
    }
  }

  async function removeResource(resource: ResourceRow) {
    if (resourceBusy) return;

    const confirmed = window.confirm(
      `Supprimer la ressource « ${resource.title} » ?`,
    );

    if (!confirmed) return;

    setResourceBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: deleteError } = await supabase
        .from("resources")
        .delete()
        .eq("id", resource.id);

      if (deleteError) {
        throw deleteError;
      }

      const storagePath =
        getCourseResourceStoragePath(
          resource.url,
        );

      let storageCleanupFailed = false;

      if (storagePath) {
        const { error: storageDeleteError } =
          await supabase.storage
            .from(COURSE_RESOURCES_BUCKET)
            .remove([storagePath]);

        if (storageDeleteError) {
          storageCleanupFailed = true;

          console.error(
            "[AdminContent] storage delete error:",
            storageDeleteError,
          );
        }
      }

      setSuccess(
        storageCleanupFailed
          ? `La ressource « ${resource.title} » a été supprimée de SchoolNet, mais le fichier stocké n’a pas pu être nettoyé automatiquement.`
          : `La ressource « ${resource.title} » a été supprimée.`,
      );

      await loadContent(true);
    } catch (e: unknown) {
      console.error("[AdminContent] remove resource error:", e);

      setError(
        getErrorMessage(
          e,
          "Impossible de supprimer cette ressource.",
        ),
      );
    } finally {
      setResourceBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Chargement des contenus...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Contenu
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Gérez les cours, les enseignants, les sections et les
            ressources pédagogiques.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-60"
            disabled={refreshing}
            onClick={() => void loadContent(true)}
          >
            {refreshing ? "Actualisation..." : "Actualiser"}
          </button>

          <button
            type="button"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setCreateOpen(true);
            }}
          >
            + Nouveau cours
          </button>
        </div>
      </div>

      {!createOpen && !manageCourse && success && (
        <FeedbackBanner type="success" message={success} />
      )}

      {!createOpen && !manageCourse && error && (
        <FeedbackBanner type="error" message={error} />
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Cours"
          value={courses.length}
          subtitle="Cours enregistrés"
        />

        <MetricCard
          title="Cours actifs"
          value={activeCoursesCount}
          subtitle="Disponibles dans SchoolNet"
          accent="blue"
        />

        <MetricCard
          title="Sections"
          value={sections.length}
          subtitle="Sections pédagogiques"
          accent="purple"
        />

        <MetricCard
          title="Ressources"
          value={resources.length}
          subtitle="Ressources enregistrées"
          accent="green"
        />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row">
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher un cours, une classe, un niveau, une année, un enseignant..."
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(
                event.target.value as "all" | CourseStatus,
              );
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actifs</option>
            <option value="archived">Archivés</option>
          </select>

          <select
            value={classFilter}
            onChange={(event) => {
              setClassFilter(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none"
          >
            <option value="all">Toutes les classes</option>

            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.school_year}
              </option>
            ))}
          </select>

          <div className="flex items-center px-2 text-sm text-gray-500">
            {filteredCourses.length} résultat
            {filteredCourses.length > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-4 font-medium">Cours</th>
                <th className="px-4 py-4 font-medium">Classe</th>
                <th className="px-4 py-4 font-medium">Niveau</th>
                <th className="px-4 py-4 font-medium">
                  Année scolaire
                </th>
                <th className="px-4 py-4 font-medium">
                  Enseignant(s)
                </th>
                <th className="px-4 py-4 font-medium">Sections</th>
                <th className="px-4 py-4 font-medium">
                  Ressources
                </th>
                <th className="px-4 py-4 font-medium">Statut</th>
                <th className="px-4 py-4 text-right font-medium">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {visibleCourses.map((course) => {
                const linkedClass = course.class_id
                  ? classById.get(course.class_id)
                  : undefined;

                const linkedLevel =
                  course.level_id !== null
                    ? levelById.get(course.level_id)
                    : undefined;

                const assignedTeachers = courseTeachers.filter(
                  (item) => item.course_id === course.id,
                );

                const sectionCount = sections.filter(
                  (item) => item.course_id === course.id,
                ).length;

                const resourceCount = resources.filter(
                  (item) => item.course_id === course.id,
                ).length;

                const enrollmentCount = enrollments.filter(
                  (item) => item.course_id === course.id,
                ).length;

                return (
                  <tr
                    key={course.id}
                    className="align-top transition hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-4">
                      <div className="font-semibold text-gray-900">
                        {course.title}
                      </div>

                      {course.description && (
                        <div className="mt-1 max-w-xs line-clamp-2 text-xs text-gray-500">
                          {course.description}
                        </div>
                      )}

                      <div className="mt-1 text-xs text-gray-400">
                        {enrollmentCount} apprenant
                        {enrollmentCount > 1 ? "s" : ""} inscrit
                        {enrollmentCount > 1 ? "s" : ""}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-gray-700">
                      {linkedClass?.name ?? "Non affectée"}
                    </td>

                    <td className="px-4 py-4">
                      {linkedLevel ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {linkedLevel.name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-gray-700">
                      {linkedClass?.school_year ?? "—"}
                    </td>

                    <td className="px-4 py-4">
                      {assignedTeachers.length === 0 ? (
                        <span className="text-xs text-amber-600">
                          Aucun enseignant affecté
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {assignedTeachers.map((assignment) => {
                            const teacher = teacherById.get(
                              assignment.teacher_id,
                            );

                            return (
                              <span
                                key={assignment.teacher_id}
                                className="rounded-lg bg-gray-50 px-2 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-100"
                              >
                                {teacher?.full_name ??
                                  "Enseignant"}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 text-gray-700">
                      {sectionCount}
                    </td>

                    <td className="px-4 py-4 text-gray-700">
                      {resourceCount}
                    </td>

                    <td className="px-4 py-4">
                      {course.status === "active" ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          Actif
                        </span>
                      ) : (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                          Archivé
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            openCourseManager(course.id)
                          }
                          className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-200"
                        >
                          📚 Gérer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {visibleCourses.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-gray-500"
                  >
                    Aucun cours ne correspond aux critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
          <div className="text-gray-500">
            Affichage{" "}
            {filteredCourses.length === 0
              ? 0
              : (currentPage - 1) * PAGE_SIZE + 1}{" "}
            à{" "}
            {Math.min(
              currentPage * PAGE_SIZE,
              filteredCourses.length,
            )}{" "}
            sur {filteredCourses.length}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() =>
                setPage((value) => Math.max(1, value - 1))
              }
              className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Précédent
            </button>

            <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
              Page {currentPage} / {pageCount}
            </div>

            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() =>
                setPage((value) =>
                  Math.min(pageCount, value + 1),
                )
              }
              className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Suivant →
            </button>
          </div>
        </div>
      </div>

      {createOpen && (
        <ModalShell
          title="Nouveau cours"
          subtitle="Créez un cours et rattachez-le à une classe."
          feedback={
            error ? (
              <FeedbackBanner type="error" message={error} />
            ) : undefined
          }
          onClose={() => {
            if (!creatingCourse) {
              setCreateOpen(false);
              resetCreateForm();
              setError(null);
              setSuccess(null);
            }
          }}
        >
          <div className="space-y-4">
            <Field label="Titre du cours">
              <input
                value={newCourseTitle}
                onChange={(event) =>
                  setNewCourseTitle(event.target.value)
                }
                placeholder="Ex. Mathématiques"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                disabled={creatingCourse}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={newCourseDescription}
                onChange={(event) =>
                  setNewCourseDescription(event.target.value)
                }
                placeholder="Description facultative du cours..."
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                disabled={creatingCourse}
              />
            </Field>

            <Field label="Classe">
              <select
                value={newCourseClassId}
                onChange={(event) =>
                  setNewCourseClassId(event.target.value)
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none"
                disabled={creatingCourse}
              >
                <option value="">Sélectionner une classe</option>

                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.school_year}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Enseignant"
              hint="Facultatif. Vous pourrez également l’affecter plus tard."
            >
              <select
                value={newCourseTeacherId}
                onChange={(event) =>
                  setNewCourseTeacherId(event.target.value)
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none"
                disabled={creatingCourse}
              >
                <option value="">
                  Aucun enseignant pour le moment
                </option>

                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.full_name ?? "Enseignant"}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  resetCreateForm();
                  setError(null);
                  setSuccess(null);
                }}
                disabled={creatingCourse}
                className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() => void createCourse()}
                disabled={
                  creatingCourse ||
                  !newCourseTitle.trim() ||
                  !newCourseClassId
                }
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creatingCourse
                  ? "Création..."
                  : "Créer le cours"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {manageCourse && (
        <ModalShell
          title="Gestion du cours"
          subtitle={manageCourse.title}
          wide
          feedback={
            error ? (
              <FeedbackBanner type="error" message={error} />
            ) : success ? (
              <FeedbackBanner type="success" message={success} />
            ) : undefined
          }
          onClose={closeCourseManager}
        >
          <div className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <InfoItem
                  label="Classe"
                  value={
                    manageCourse.class_id
                      ? classById.get(manageCourse.class_id)
                          ?.name ?? "Non affectée"
                      : "Non affectée"
                  }
                />

                <InfoItem
                  label="Niveau"
                  value={
                    manageCourse.level_id !== null
                      ? levelById.get(manageCourse.level_id)
                          ?.name ?? "—"
                      : "—"
                  }
                />

                <InfoItem
                  label="Année scolaire"
                  value={
                    manageCourse.class_id
                      ? classById.get(manageCourse.class_id)
                          ?.school_year ?? "—"
                      : "—"
                  }
                />

                <InfoItem
                  label="Statut"
                  value={
                    manageCourse.status === "active"
                      ? "Actif"
                      : "Archivé"
                  }
                />
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void changeCourseStatus(manageCourse)
                  }
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    manageCourse.status === "active"
                      ? "border border-amber-200 bg-amber-50 text-amber-700"
                      : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {manageCourse.status === "active"
                    ? "Archiver le cours"
                    : "Réactiver le cours"}
                </button>
              </div>
            </div>

            <SectionBlock
              title="Enseignants affectés"
              subtitle={`${manageCourseTeachers.length} enseignant${
                manageCourseTeachers.length > 1 ? "s" : ""
              } affecté${
                manageCourseTeachers.length > 1 ? "s" : ""
              }`}
            >
              {manageCourseTeachers.length > 0 ? (
                <div className="space-y-2">
                  {manageCourseTeachers.map((assignment) => {
                    const teacher = teacherById.get(
                      assignment.teacher_id,
                    );

                    return (
                      <div
                        key={assignment.teacher_id}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3"
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {teacher?.full_name ?? "Enseignant"}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={teacherBusy}
                          onClick={() =>
                            void removeTeacher(
                              assignment.teacher_id,
                            )
                          }
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"
                        >
                          Retirer
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBox text="Aucun enseignant n’est encore affecté à ce cours." />
              )}

              <div className="mt-4">
                <h4 className="font-semibold text-gray-900">
                  Affecter un enseignant
                </h4>

                {availableTeachers.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <select
                      value={selectedTeacherId}
                      onChange={(event) =>
                        setSelectedTeacherId(
                          event.target.value,
                        )
                      }
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">
                        Sélectionner un enseignant
                      </option>

                      {availableTeachers.map((teacher) => (
                        <option
                          key={teacher.id}
                          value={teacher.id}
                        >
                          {teacher.full_name ?? "Enseignant"}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={
                        teacherBusy || !selectedTeacherId
                      }
                      onClick={() => void assignTeacher()}
                      className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {teacherBusy
                        ? "Affectation..."
                        : "Affecter"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                    Tous les enseignants disponibles sont déjà
                    affectés à ce cours.
                  </div>
                )}
              </div>
            </SectionBlock>

            <SectionBlock
              title="Sections du cours"
              subtitle={`${manageCourseSections.length} section${
                manageCourseSections.length > 1 ? "s" : ""
              }`}
            >
              {manageCourseSections.length > 0 ? (
                <div className="space-y-2">
                  {manageCourseSections.map((section) => {
                    const count = manageCourseResources.filter(
                      (resource) =>
                        resource.section_id === section.id,
                    ).length;

                    return (
                      <div
                        key={section.id}
                        className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3"
                      >
                        <div>
                          <div className="font-medium text-gray-900">
                            {section.order_index}. {section.title}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {count} ressource
                            {count > 1 ? "s" : ""}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={sectionBusy}
                          onClick={() =>
                            void removeSection(section)
                          }
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBox text="Aucune section n’a encore été créée pour ce cours." />
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={newSectionTitle}
                  onChange={(event) =>
                    setNewSectionTitle(event.target.value)
                  }
                  placeholder="Ex. Chapitre 1 — Nombres entiers"
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                />

                <button
                  type="button"
                  disabled={
                    sectionBusy || !newSectionTitle.trim()
                  }
                  onClick={() => void addSection()}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sectionBusy
                    ? "Ajout..."
                    : "+ Ajouter la section"}
                </button>
              </div>
            </SectionBlock>

            <SectionBlock
              title="Ressources pédagogiques"
              subtitle={`${manageCourseResources.length} ressource${
                manageCourseResources.length > 1 ? "s" : ""
              }`}
            >
              {manageCourseResources.length > 0 ? (
                <div className="space-y-2">
                  {manageCourseResources.map((resource) => {
                    const linkedSection =
                      resource.section_id !== null
                        ? manageCourseSections.find(
                            (section) =>
                              section.id ===
                              resource.section_id,
                          )
                        : undefined;

                    return (
                      <div
                        key={resource.id}
                        className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>
                                {resourceTypeIcon(resource.type)}
                              </span>

                              <div className="font-medium text-gray-900">
                                {resource.title}
                              </div>

                              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-gray-600 ring-1 ring-gray-200">
                                {resourceTypeLabel(
                                  resource.type,
                                )}
                              </span>

                              {resource.visibility ===
                              "public_to_course" ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                                  Visible
                                </span>
                              ) : (
                                <span className="rounded-full bg-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600">
                                  Masquée
                                </span>
                              )}
                            </div>

                            <div className="mt-1 text-xs text-gray-500">
                              {linkedSection
                                ? linkedSection.title
                                : "Sans section"}
                              {resource.is_downloadable
                                ? " · Téléchargement autorisé"
                                : ""}
                            </div>

                            <div className="mt-1 max-w-xl truncate text-xs text-blue-600">
                              {resource.url && (
                                <a
                                  href={resource.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block max-w-full truncate text-sm text-blue-600 hover:text-blue-700 hover:underline"
                                  title={resource.url}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {resource.url}
                                </a>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={resourceBusy}
                            onClick={() =>
                              void removeResource(resource)
                            }
                            className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyBox text="Aucune ressource n’a encore été ajoutée à ce cours." />
              )}

              <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <h4 className="font-semibold text-gray-900">
                  Ajouter une ressource
                </h4>

                <div className="mt-4">
                  <Field label="Source de la ressource">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={resourceBusy}
                        onClick={() => {
                          setNewResourceSource("upload");
                          setNewResourceUrl("");

                          setNewResourceType(
                            newResourceFile
                              ? inferResourceTypeFromFile(
                                  newResourceFile,
                                )
                              : "file",
                          );
                        }}
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                          newResourceSource === "upload"
                            ? "border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-100"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        } disabled:opacity-50`}
                      >
                        <div className="font-semibold">
                          📤 Importer un fichier
                        </div>

                        <div className="mt-1 text-xs font-normal opacity-70">
                          Depuis votre ordinateur
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={resourceBusy}
                        onClick={() => {
                          setNewResourceSource("url");
                          setNewResourceFile(null);

                          setResourceFileInputKey(
                            (value) => value + 1,
                          );

                          setNewResourceType("link");
                        }}
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                          newResourceSource === "url"
                            ? "border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-100"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        } disabled:opacity-50`}
                      >
                        <div className="font-semibold">
                          🔗 Lien externe
                        </div>

                        <div className="mt-1 text-xs font-normal opacity-70">
                          URL publique, vidéo ou document en ligne
                        </div>
                      </button>
                    </div>
                  </Field>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Titre">
                    <input
                      value={newResourceTitle}
                      onChange={(event) =>
                        setNewResourceTitle(
                          event.target.value,
                        )
                      }
                      placeholder="Ex. Support du chapitre 1"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                      disabled={resourceBusy}
                    />
                  </Field>

                  <Field
                    label={
                      newResourceSource === "upload"
                        ? "Type détecté"
                        : "Type"
                    }
                  >
                    <select
                      value={newResourceType}
                      onChange={(event) =>
                        setNewResourceType(
                          event.target.value as ResourceType,
                        )
                      }
                      disabled={
                        resourceBusy ||
                        newResourceSource === "upload"
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm disabled:bg-gray-100 disabled:text-gray-500"
                    >
                      <option value="pdf">PDF</option>
                      <option value="video">Vidéo</option>
                      <option value="link">Lien</option>
                      <option value="file">Fichier</option>
                      <option value="word">Word</option>
                      <option value="powerpoint">
                        PowerPoint
                      </option>
                    </select>
                  </Field>

                  <Field label="Section">
                    <select
                      value={newResourceSectionId}
                      onChange={(event) =>
                        setNewResourceSectionId(
                          event.target.value,
                        )
                      }
                      disabled={resourceBusy}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="">
                        Aucune section
                      </option>

                      {manageCourseSections.map(
                        (section) => (
                          <option
                            key={section.id}
                            value={section.id}
                          >
                            {section.order_index}.{" "}
                            {section.title}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>

                  <Field label="Visibilité">
                    <select
                      value={newResourceVisibility}
                      onChange={(event) =>
                        setNewResourceVisibility(
                          event.target
                            .value as ResourceVisibility,
                        )
                      }
                      disabled={resourceBusy}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                    >
                      <option value="public_to_course">
                        Visible dans le cours
                      </option>

                      <option value="hidden">
                        Masquée
                      </option>
                    </select>
                  </Field>

                  {newResourceSource === "upload" ? (
                    <div className="md:col-span-2">
                      <Field
                        label="Fichier local"
                        hint="Sélectionnez un fichier présent sur votre ordinateur. Le fichier sera importé automatiquement dans SchoolNet."
                      >
                        <input
                          key={resourceFileInputKey}
                          type="file"
                          disabled={resourceBusy}
                          onChange={(event) => {
                            const file =
                              event.target.files?.[0] ??
                              null;

                            setNewResourceFile(file);

                            if (!file) {
                              setNewResourceType("file");
                              return;
                            }

                            const detectedType =
                              inferResourceTypeFromFile(
                                file,
                              );

                            setNewResourceType(
                              detectedType,
                            );

                            if (
                              !newResourceTitle.trim()
                            ) {
                              setNewResourceTitle(
                                titleFromFileName(
                                  file.name,
                                ),
                              );
                            }
                          }}
                          className="block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                        />

                        {newResourceFile && (
                          <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            Fichier sélectionné :{" "}
                            <span className="font-semibold">
                              {newResourceFile.name}
                            </span>
                            {" · "}
                            {resourceTypeLabel(
                              newResourceType,
                            )}
                          </div>
                        )}
                      </Field>
                    </div>
                  ) : (
                    <div className="md:col-span-2">
                      <Field
                        label="URL de la ressource"
                        hint="URL publique, lien vidéo ou URL d’un document externe."
                      >
                        <input
                          value={newResourceUrl}
                          onChange={(event) =>
                            setNewResourceUrl(
                              event.target.value,
                            )
                          }
                          placeholder="https://..."
                          disabled={resourceBusy}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={newResourceDownloadable}
                    onChange={(event) =>
                      setNewResourceDownloadable(
                        event.target.checked,
                      )
                    }
                    disabled={resourceBusy}
                    className="h-4 w-4 rounded border-gray-300"
                  />

                  Autoriser le téléchargement de cette ressource
                </label>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={
                      resourceBusy ||
                      !newResourceTitle.trim() ||
                      (newResourceSource === "upload"
                        ? !newResourceFile
                        : !newResourceUrl.trim())
                    }
                    onClick={() =>
                      void addResource()
                    }
                    className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resourceBusy
                      ? newResourceSource === "upload"
                        ? "Importation..."
                        : "Ajout..."
                      : newResourceSource === "upload"
                        ? "📤 Importer la ressource"
                        : "+ Ajouter la ressource"}
                  </button>
                </div>
              </div>
            </SectionBlock>

            <div className="flex justify-end border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={closeCourseManager}
                className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  accent = "default",
}: {
  title: string;
  value: number;
  subtitle: string;
  accent?: "default" | "blue" | "green" | "purple";
}) {
  const valueClass =
    accent === "blue"
      ? "text-blue-600"
      : accent === "green"
        ? "text-emerald-600"
        : accent === "purple"
          ? "text-violet-600"
          : "text-gray-900";

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>

      <div
        className={`mt-2 text-2xl font-semibold ${valueClass}`}
      >
        {value}
      </div>

      <div className="mt-1 text-xs text-gray-400">
        {subtitle}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>

      {children}

      {hint && (
        <div className="text-xs text-gray-400">{hint}</div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-400">
        {label}
      </div>

      <div className="mt-1 font-semibold text-gray-900">
        {value}
      </div>
    </div>
  );
}

function FeedbackBanner({
  type,
  message,
}: {
  type: "success" | "error";
  message: string;
}) {
  if (type === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        <div className="font-semibold">✅ Opération réussie</div>
        <div className="mt-1">{message}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
      {text}
    </div>
  );
}

function SectionBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          {title}
        </h3>

        {subtitle && (
          <p className="mt-1 text-sm text-gray-500">
            {subtitle}
          </p>
        )}
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

function ModalShell({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  feedback,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  feedback?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 px-4 py-8 backdrop-blur-[1px]">
      <div
        className={`my-auto w-full rounded-3xl bg-white shadow-2xl ${
          wide ? "max-w-4xl" : "max-w-xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 text-sm text-gray-500">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 transition hover:bg-gray-200"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {feedback && (
          <div className="border-b border-gray-100 px-6 py-4">
            {feedback}
          </div>
        )}

        <div className="max-h-[78vh] overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}