import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";

import type {
  PublicLevel,
  PublicSubject,
} from "@/features/public/lib/publicCms";

type Props = {
  onChanged?: () => void | Promise<void>;
};

type LibraryItem = {
  id: string;
  title: string;
  slug: string;
  description: string | null;

  resource_type: string;

  subject: string | null;
  subject_id: string | null;
  level_id: string | null;

  author: string | null;

  file_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime_type: string | null;

  external_url: string | null;

  cover_url: string | null;
  cover_path: string | null;

  download_label: string;

  is_featured: boolean;
  sort_order: number;
  is_visible: boolean;

  created_at: string;
  updated_at: string;
};

type LibraryForm = {
  title: string;
  slug: string;
  description: string;

  resourceType: string;

  subjectId: string;
  levelId: string;

  author: string;

  fileUrl: string;
  externalUrl: string;

  coverUrl: string;

  downloadLabel: string;

  sortOrder: number;
  isFeatured: boolean;
  isVisible: boolean;
};

type UploadedObject = {
  path: string;
  url: string;
};

const STORAGE_BUCKET = "public-library";

const MAX_RESOURCE_SIZE =
  50 * 1024 * 1024;

const MAX_COVER_SIZE =
  10 * 1024 * 1024;

const EMPTY_FORM: LibraryForm = {
  title: "",
  slug: "",
  description: "",

  resourceType: "document",

  subjectId: "",
  levelId: "",

  author: "SchoolNet",

  fileUrl: "",
  externalUrl: "",

  coverUrl: "",

  downloadLabel: "Consulter",

  sortOrder: 10,
  isFeatured: false,
  isVisible: true,
};

const RESOURCE_TYPES = [
  {
    value: "document",
    label: "Document",
  },
  {
    value: "exercise",
    label: "Exercice",
  },
  {
    value: "guide",
    label: "Guide",
  },
  {
    value: "book",
    label: "Livre",
  },
  {
    value: "course",
    label: "Cours",
  },
  {
    value: "worksheet",
    label: "Fiche",
  },
  {
    value: "video",
    label: "Vidéo",
  },
];

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown })
      .message === "string"
  ) {
    return (error as { message: string })
      .message;
  }

  return fallback;
}

function nullableText(value: string) {
  const clean = value.trim();

  return clean.length > 0
    ? clean
    : null;
}

function makeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resourceTypeLabel(
  value: string,
) {
  return (
    RESOURCE_TYPES.find(
      (type) => type.value === value,
    )?.label ?? value
  );
}

function formatFileSize(
  bytes?: number | null,
) {
  if (
    bytes === null ||
    bytes === undefined
  ) {
    return "";
  }

  if (bytes < 1024) {
    return `${bytes} o`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} Ko`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} Mo`;
}

function sanitizeFileName(
  fileName: string,
) {
  const dotIndex =
    fileName.lastIndexOf(".");

  const extension =
    dotIndex >= 0
      ? fileName
          .slice(dotIndex)
          .toLowerCase()
      : "";

  const rawName =
    dotIndex >= 0
      ? fileName.slice(0, dotIndex)
      : fileName;

  const cleanName =
    rawName
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-",
      )
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "fichier";

  return `${cleanName}${extension}`;
}

function normalizeSearchText(
  value?: string | null,
) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createStoragePath(
  folder: "resources" | "covers",
  fileName: string,
) {
  const uniqueId =
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

  return `${folder}/${uniqueId}-${sanitizeFileName(
    fileName,
  )}`;
}

async function uploadStorageFile(
  file: File,
  folder: "resources" | "covers",
): Promise<UploadedObject> {
  const path =
    createStoragePath(
      folder,
      file.name,
    );

  const {
    error: uploadError,
  } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType:
        file.type ||
        "application/octet-stream",
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } =
    supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

  return {
    path,
    url: data.publicUrl,
  };
}

async function removeStoragePaths(
  paths: Array<
    string | null | undefined
  >,
) {
  const cleanPaths = paths.filter(
    (path): path is string =>
      Boolean(path?.trim()),
  );

  if (cleanPaths.length === 0) {
    return;
  }

  const {
    error: removeError,
  } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove(cleanPaths);

  if (removeError) {
    throw removeError;
  }
}

export default function AdminPublicLibraryEditor({
  onChanged,
}: Props) {
  const [items, setItems] =
    useState<LibraryItem[]>([]);

  const [levels, setLevels] =
    useState<PublicLevel[]>([]);

  const [subjects, setSubjects] =
    useState<PublicSubject[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [workingId, setWorkingId] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [showEditor, setShowEditor] =
    useState(false);

  const [editingItem, setEditingItem] =
    useState<LibraryItem | null>(null);

  const [pendingDelete, setPendingDelete] =
    useState<LibraryItem | null>(null);

  const [form, setForm] =
    useState<LibraryForm>(EMPTY_FORM);

  const [
    pendingResourceFile,
    setPendingResourceFile,
  ] = useState<File | null>(null);

  const [
    pendingCoverFile,
    setPendingCoverFile,
  ] = useState<File | null>(null);

  const [
    removeExistingFile,
    setRemoveExistingFile,
  ] = useState(false);

  const [
    removeExistingCover,
    setRemoveExistingCover,
  ] = useState(false);

  const [
    coverPreview,
    setCoverPreview,
  ] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] =
    useState("");

  useEffect(() => {
    if (!pendingCoverFile) {
      setCoverPreview(null);
      return;
    }

    const previewUrl =
      URL.createObjectURL(
        pendingCoverFile,
      );

    setCoverPreview(previewUrl);

    return () => {
      URL.revokeObjectURL(
        previewUrl,
      );
    };
  }, [pendingCoverFile]);

  const loadData =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const [
          itemsResult,
          levelsResult,
          subjectsResult,
        ] = await Promise.all([
          supabase
            .from(
              "public_library_items",
            )
            .select("*")
            .order("sort_order", {
              ascending: true,
            })
            .order("created_at", {
              ascending: true,
            }),

          supabase
            .from("public_levels")
            .select("*")
            .order("sort_order", {
              ascending: true,
            }),

          supabase
            .from("public_subjects")
            .select("*")
            .order("sort_order", {
              ascending: true,
            }),
        ]);

        const firstError =
          itemsResult.error ??
          levelsResult.error ??
          subjectsResult.error;

        if (firstError) {
          throw firstError;
        }

        setItems(
          (itemsResult.data as
            | LibraryItem[]
            | null) ?? [],
        );

        setLevels(
          (levelsResult.data as
            | PublicLevel[]
            | null) ?? [],
        );

        setSubjects(
          (subjectsResult.data as
            | PublicSubject[]
            | null) ?? [],
        );
      } catch (loadError) {
        setError(
          getErrorMessage(
            loadError,
            "Impossible de charger la bibliothèque.",
          ),
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleCount = useMemo(
    () =>
      items.filter(
        (item) => item.is_visible,
      ).length,
    [items],
  );

  const featuredCount = useMemo(
    () =>
      items.filter(
        (item) => item.is_featured,
      ).length,
    [items],
  );

  const levelsById = useMemo(
    () =>
      new Map(
        levels.map((level) => [
          level.id,
          level,
        ]),
      ),
    [levels],
  );

  const subjectsById = useMemo(
    () =>
      new Map(
        subjects.map((subject) => [
          subject.id,
          subject,
        ]),
      ),
    [subjects],
  );

  function updateForm(
    patch: Partial<LibraryForm>,
  ) {
    setForm((current) => ({
      ...current,
      ...patch,
    }));

    setError(null);
    setSuccess(null);
  }

  function resetFileStates() {
    setPendingResourceFile(null);
    setPendingCoverFile(null);

    setRemoveExistingFile(false);
    setRemoveExistingCover(false);
  }

  function openCreate() {
    const maxOrder =
      items.reduce(
        (max, item) =>
          Math.max(
            max,
            item.sort_order,
          ),
        0,
      );

    setEditingItem(null);

    setForm({
      ...EMPTY_FORM,
      sortOrder:
        maxOrder > 0
          ? maxOrder + 10
          : 10,
    });

    resetFileStates();

    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function openEdit(
    item: LibraryItem,
  ) {
    setEditingItem(item);

    setForm({
      title: item.title,
      slug: item.slug,

      description:
        item.description ?? "",

      resourceType:
        item.resource_type,

      subjectId:
        item.subject_id ?? "",

      levelId:
        item.level_id ?? "",

      author:
        item.author ?? "",

      fileUrl:
        item.file_url ?? "",

      externalUrl:
        item.external_url ?? "",

      coverUrl:
        item.cover_url ?? "",

      downloadLabel:
        item.download_label ||
        "Consulter",

      sortOrder:
        item.sort_order,

      isFeatured:
        item.is_featured,

      isVisible:
        item.is_visible,
    });

    resetFileStates();

    setError(null);
    setSuccess(null);
    setShowEditor(true);
  }

  function closeEditor() {
    if (saving) {
      return;
    }

    setShowEditor(false);
    setEditingItem(null);

    setForm(EMPTY_FORM);

    resetFileStates();

    setError(null);
  }

  function handleResourceFile(
    file?: File,
  ) {
    if (!file) {
      return;
    }

    if (
      file.size >
      MAX_RESOURCE_SIZE
    ) {
      setError(
        "Le fichier dépasse la limite de 50 Mo.",
      );
      return;
    }

    setPendingResourceFile(file);

    setRemoveExistingFile(false);

    setError(null);
    setSuccess(null);
  }

  function handleCoverFile(
    file?: File,
  ) {
    if (!file) {
      return;
    }

    if (
      !file.type.startsWith(
        "image/",
      )
    ) {
      setError(
        "Le fichier sélectionné doit être une image.",
      );
      return;
    }

    if (
      file.size >
      MAX_COVER_SIZE
    ) {
      setError(
        "L’image dépasse la limite de 10 Mo.",
      );
      return;
    }

    setPendingCoverFile(file);

    setRemoveExistingCover(false);

    setError(null);
    setSuccess(null);
  }

  function removeResourceSelection() {
    if (pendingResourceFile) {
      setPendingResourceFile(null);
      return;
    }

    if (
      editingItem?.file_path ||
      form.fileUrl.trim()
    ) {
      setRemoveExistingFile(true);

      updateForm({
        fileUrl: "",
      });
    }
  }

  function removeCoverSelection() {
    if (pendingCoverFile) {
      setPendingCoverFile(null);
      return;
    }

    if (
      editingItem?.cover_path ||
      form.coverUrl.trim()
    ) {
      setRemoveExistingCover(true);

      updateForm({
        coverUrl: "",
      });
    }
  }

  async function saveItem() {
    const title =
      form.title.trim();

    const slug =
      form.slug.trim() ||
      makeSlug(title);

    if (!title) {
      setError(
        "Le titre de la ressource est obligatoire.",
      );
      return;
    }

    if (!slug) {
      setError(
        "Impossible de générer le slug de cette ressource.",
      );
      return;
    }

    if (
      !Number.isFinite(
        form.sortOrder,
      ) ||
      form.sortOrder < 0
    ) {
      setError(
        "L’ordre de la ressource est invalide.",
      );
      return;
    }

    const selectedSubject =
      form.subjectId
        ? subjectsById.get(
            form.subjectId,
          )
        : null;

    setSaving(true);
    setError(null);
    setSuccess(null);

    let uploadedResource:
      | UploadedObject
      | null = null;

    let uploadedCover:
      | UploadedObject
      | null = null;

    try {
      /*
       * =====================================
       * 1. IMPORT EVENTUEL DES NOUVEAUX
       *    FICHIERS
       * =====================================
       */

      if (pendingResourceFile) {
        uploadedResource =
          await uploadStorageFile(
            pendingResourceFile,
            "resources",
          );
      }

      if (pendingCoverFile) {
        uploadedCover =
          await uploadStorageFile(
            pendingCoverFile,
            "covers",
          );
      }

      /*
       * =====================================
       * 2. CALCUL DE L'ETAT FINAL DU FICHIER
       * =====================================
       */

      const originalFileUrl =
        editingItem?.file_url?.trim() ??
        "";

      const manuallyEnteredFileUrl =
        form.fileUrl.trim();

      let finalFileUrl:
        | string
        | null =
        manuallyEnteredFileUrl ||
        null;

      let finalFilePath:
        | string
        | null =
        editingItem?.file_path ??
        null;

      let finalFileName:
        | string
        | null =
        editingItem?.file_name ??
        null;

      let finalFileSize:
        | number
        | null =
        editingItem?.file_size ??
        null;

      let finalFileMimeType:
        | string
        | null =
        editingItem
          ?.file_mime_type ??
        null;

      let shouldDeleteOldFile =
        false;

      if (
        uploadedResource &&
        pendingResourceFile
      ) {
        finalFileUrl =
          uploadedResource.url;

        finalFilePath =
          uploadedResource.path;

        finalFileName =
          pendingResourceFile.name;

        finalFileSize =
          pendingResourceFile.size;

        finalFileMimeType =
          pendingResourceFile.type ||
          "application/octet-stream";

        shouldDeleteOldFile =
          Boolean(
            editingItem?.file_path,
          );
      } else if (
        removeExistingFile
      ) {
        finalFileUrl = null;
        finalFilePath = null;
        finalFileName = null;
        finalFileSize = null;
        finalFileMimeType = null;

        shouldDeleteOldFile =
          Boolean(
            editingItem?.file_path,
          );
      } else if (
        editingItem?.file_path &&
        manuallyEnteredFileUrl !==
          originalFileUrl
      ) {
        /*
         * L'admin a remplacé un fichier
         * Supabase par une URL manuelle.
         */
        finalFilePath = null;
        finalFileName = null;
        finalFileSize = null;
        finalFileMimeType = null;

        shouldDeleteOldFile =
          true;
      }

      /*
       * =====================================
       * 3. CALCUL DE L'ETAT FINAL DE L'IMAGE
       * =====================================
       */

      const originalCoverUrl =
        editingItem?.cover_url?.trim() ??
        "";

      const manuallyEnteredCoverUrl =
        form.coverUrl.trim();

      let finalCoverUrl:
        | string
        | null =
        manuallyEnteredCoverUrl ||
        null;

      let finalCoverPath:
        | string
        | null =
        editingItem?.cover_path ??
        null;

      let shouldDeleteOldCover =
        false;

      if (uploadedCover) {
        finalCoverUrl =
          uploadedCover.url;

        finalCoverPath =
          uploadedCover.path;

        shouldDeleteOldCover =
          Boolean(
            editingItem?.cover_path,
          );
      } else if (
        removeExistingCover
      ) {
        finalCoverUrl = null;
        finalCoverPath = null;

        shouldDeleteOldCover =
          Boolean(
            editingItem?.cover_path,
          );
      } else if (
        editingItem?.cover_path &&
        manuallyEnteredCoverUrl !==
          originalCoverUrl
      ) {
        /*
         * Une ancienne image importée
         * est remplacée par une URL externe.
         */
        finalCoverPath = null;

        shouldDeleteOldCover =
          true;
      }

      /*
       * =====================================
       * 4. PAYLOAD SUPABASE
       * =====================================
       */

      const payload = {
        title,
        slug,

        description:
          nullableText(
            form.description,
          ),

        resource_type:
          form.resourceType,

        subject_id:
          form.subjectId || null,

        subject:
          selectedSubject?.name ??
          null,

        level_id:
          form.levelId || null,

        author:
          nullableText(
            form.author,
          ),

        file_url:
          finalFileUrl,

        file_path:
          finalFilePath,

        file_name:
          finalFileName,

        file_size:
          finalFileSize,

        file_mime_type:
          finalFileMimeType,

        external_url:
          nullableText(
            form.externalUrl,
          ),

        cover_url:
          finalCoverUrl,

        cover_path:
          finalCoverPath,

        download_label:
          form.downloadLabel.trim() ||
          "Consulter",

        sort_order:
          form.sortOrder,

        is_featured:
          form.isFeatured,

        is_visible:
          form.isVisible,
      };

      /*
       * =====================================
       * 5. INSERT / UPDATE
       * =====================================
       */

      if (editingItem) {
        const {
          error: updateError,
        } = await supabase
          .from(
            "public_library_items",
          )
          .update(payload)
          .eq(
            "id",
            editingItem.id,
          );

        if (updateError) {
          throw updateError;
        }
      } else {
        const {
          error: insertError,
        } = await supabase
          .from(
            "public_library_items",
          )
          .insert(payload);

        if (insertError) {
          throw insertError;
        }
      }

      /*
       * =====================================
       * 6. NETTOYAGE DES ANCIENS FICHIERS
       *    UNIQUEMENT APRES SUCCES BDD
       * =====================================
       */

      const oldPathsToDelete: string[] =
        [];

      if (
        shouldDeleteOldFile &&
        editingItem?.file_path &&
        editingItem.file_path !==
          uploadedResource?.path
      ) {
        oldPathsToDelete.push(
          editingItem.file_path,
        );
      }

      if (
        shouldDeleteOldCover &&
        editingItem?.cover_path &&
        editingItem.cover_path !==
          uploadedCover?.path
      ) {
        oldPathsToDelete.push(
          editingItem.cover_path,
        );
      }

      if (
        oldPathsToDelete.length >
        0
      ) {
        try {
          await removeStoragePaths(
            oldPathsToDelete,
          );
        } catch (
          storageCleanupError
        ) {
          console.warn(
            "Nettoyage Storage incomplet :",
            storageCleanupError,
          );
        }
      }

      const message =
        editingItem
          ? `La ressource « ${title} » a été modifiée avec succès.`
          : `La ressource « ${title} » a été ajoutée avec succès.`;

      setShowEditor(false);
      setEditingItem(null);

      setForm(EMPTY_FORM);

      resetFileStates();

      await loadData();
      await onChanged?.();

      setSuccess(message);
    } catch (saveError) {
      /*
       * Si la BDD échoue après un upload,
       * supprimer les nouveaux objets afin
       * de ne pas laisser de fichiers orphelins.
       */

      const newPaths = [
        uploadedResource?.path,
        uploadedCover?.path,
      ];

      try {
        await removeStoragePaths(
          newPaths,
        );
      } catch (
        cleanupError
      ) {
        console.warn(
          "Nettoyage des uploads échoués impossible :",
          cleanupError,
        );
      }

      setError(
        getErrorMessage(
          saveError,
          "Impossible d’enregistrer cette ressource.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateFlags(
    item: LibraryItem,
    patch: Partial<
      Pick<
        LibraryItem,
        | "is_visible"
        | "is_featured"
      >
    >,
  ) {
    setWorkingId(item.id);

    setError(null);
    setSuccess(null);

    try {
      const {
        error: updateError,
      } = await supabase
        .from(
          "public_library_items",
        )
        .update(patch)
        .eq("id", item.id);

      if (updateError) {
        throw updateError;
      }

      await loadData();
      await onChanged?.();

      setSuccess(
        `La ressource « ${item.title} » a été mise à jour.`,
      );
    } catch (updateError) {
      setError(
        getErrorMessage(
          updateError,
          "Impossible de modifier cette ressource.",
        ),
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function moveItem(
    item: LibraryItem,
    direction: -1 | 1,
  ) {
    const ordered =
      [...items].sort(
        (a, b) =>
          a.sort_order -
            b.sort_order ||
          a.created_at.localeCompare(
            b.created_at,
          ),
      );

    const index =
      ordered.findIndex(
        (row) =>
          row.id === item.id,
      );

    const targetIndex =
      index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >=
        ordered.length
    ) {
      return;
    }

    const target =
      ordered[targetIndex];

    setWorkingId(item.id);

    setError(null);
    setSuccess(null);

    try {
      const [
        firstResult,
        secondResult,
      ] = await Promise.all([
        supabase
          .from(
            "public_library_items",
          )
          .update({
            sort_order:
              target.sort_order,
          })
          .eq("id", item.id),

        supabase
          .from(
            "public_library_items",
          )
          .update({
            sort_order:
              item.sort_order,
          })
          .eq("id", target.id),
      ]);

      const firstError =
        firstResult.error ??
        secondResult.error;

      if (firstError) {
        throw firstError;
      }

      await loadData();
      await onChanged?.();
    } catch (moveError) {
      setError(
        getErrorMessage(
          moveError,
          "Impossible de déplacer cette ressource.",
        ),
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteItem() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);

    setError(null);
    setSuccess(null);

    const itemToDelete =
      pendingDelete;

    try {
      const {
        error: deleteError,
      } = await supabase
        .from(
          "public_library_items",
        )
        .delete()
        .eq(
          "id",
          itemToDelete.id,
        );

      if (deleteError) {
        throw deleteError;
      }

      /*
       * L'enregistrement BDD est déjà
       * supprimé : on peut ensuite nettoyer
       * les objets Storage.
       */

      try {
        await removeStoragePaths([
          itemToDelete.file_path,
          itemToDelete.cover_path,
        ]);
      } catch (
        cleanupError
      ) {
        console.warn(
          "La ressource a été supprimée mais certains objets Storage n'ont pas pu être nettoyés :",
          cleanupError,
        );
      }

      setPendingDelete(null);

      await loadData();
      await onChanged?.();

      setSuccess(
        `La ressource « ${itemToDelete.title} » a été supprimée définitivement.`,
      );
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "Impossible de supprimer cette ressource.",
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <section className="sn-card p-6">
        <div className="text-sm text-gray-500">
          Chargement de la bibliothèque…
        </div>
      </section>
    );
  }

  const orderedItems =
    [...items].sort(
      (a, b) =>
        a.sort_order -
          b.sort_order ||
        a.created_at.localeCompare(
          b.created_at,
        ),
    );
  
  const normalizedSearch =
    normalizeSearchText(searchTerm);

  const filteredItems =
    normalizedSearch.length === 0
      ? orderedItems
      : orderedItems.filter((item) => {
          const level =
            item.level_id
              ? levelsById.get(
                  item.level_id,
                )
              : null;

          const subject =
            item.subject_id
              ? subjectsById.get(
                  item.subject_id,
                )
              : null;

          const searchable =
            normalizeSearchText(
              [
                item.title,
                item.slug,
                item.description,
                item.author,
                item.resource_type,
                item.file_name,
                item.file_mime_type,
                level?.name,
                level?.short_label,
                level?.audience,
                subject?.name,
                subject?.short_label,
                subject?.slug,
              ].join(" "),
            );

          return searchable.includes(
            normalizedSearch,
          );
        });

  const currentCoverPreview =
    coverPreview ||
    (!removeExistingCover
      ? form.coverUrl.trim()
      : "");

  return (
    <>
      <section className="sn-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              📚 Gestion de la bibliothèque
            </div>

            <p className="mt-1 text-sm text-gray-500">
              Ajoutez, importez, modifiez et organisez les ressources pédagogiques de SchoolNet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              {items.length} ressource(s)
            </span>

            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              {visibleCount} visible(s)
            </span>

            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
              {featuredCount} en vedette
            </span>

            <button
              type="button"
              onClick={openCreate}
              className="sn-btn-primary sn-press"
            >
              + Ajouter une ressource
            </button>

            <a
              href="/bibliotheque"
              target="_blank"
              rel="noreferrer"
              className="sn-btn-ghost sn-press"
            >
              Voir la bibliothèque ↗
            </a>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">
            <strong>Erreur :</strong>{" "}
            {error}
          </div>
        )}

        {success && (
          <div className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:mx-6">
            ✅ {success}
          </div>
        )}

        {orderedItems.length > 0 && (
          <div className="mx-5 mt-5 rounded-2xl border border-gray-200 bg-white p-4 sm:mx-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Rechercher dans la bibliothèque
                </label>

                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    🔎
                  </span>

                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) =>
                      setSearchTerm(
                        event.target.value,
                      )
                    }
                    placeholder="Titre, CM2, Mathématiques, auteur, fichier..."
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 lg:pt-6">
                <div className="whitespace-nowrap text-sm text-gray-500">
                  <strong className="text-gray-900">
                    {filteredItems.length}
                  </strong>{" "}
                  résultat
                  {filteredItems.length > 1
                    ? "s"
                    : ""}{" "}
                  sur{" "}
                  <strong className="text-gray-900">
                    {orderedItems.length}
                  </strong>
                </div>

                {searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      setSearchTerm("")
                    }
                    className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-200"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {orderedItems.length > 0 &&
          filteredItems.length === 0 && (
            <div className="mx-5 mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center sm:mx-6">
              <div className="text-4xl">
                🔎
              </div>

              <div className="mt-3 font-semibold text-gray-900">
                Aucune ressource trouvée
              </div>

              <p className="mt-1 text-sm text-gray-500">
                Aucun élément ne correspond à
                « {searchTerm} ».
              </p>

              <button
                type="button"
                onClick={() =>
                  setSearchTerm("")
                }
                className="mt-4 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Afficher toutes les ressources
              </button>
            </div>
          )
        }

        {orderedItems.length ===
        0 ? (
          <div className="p-10 text-center">
            <div className="text-5xl">
              📚
            </div>

            <div className="mt-4 text-lg font-semibold text-gray-900">
              Aucune ressource
            </div>

            <p className="mt-2 text-sm text-gray-500">
              Ajoutez la première ressource de la bibliothèque SchoolNet.
            </p>

            <button
              type="button"
              onClick={openCreate}
              className="sn-btn-primary sn-press mt-5"
            >
              + Ajouter une ressource
            </button>
          </div>
        ) : (
          <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-2">
            {filteredItems.map(
              (item) => {
                const actualIndex =
                  orderedItems.findIndex(
                    (row) =>
                      row.id === item.id,
                  );
                const level =
                  item.level_id
                    ? levelsById.get(
                        item.level_id,
                      )
                    : null;

                const subject =
                  item.subject_id
                    ? subjectsById.get(
                        item.subject_id,
                      )
                    : null;

                const busy =
                  workingId ===
                  item.id;

                return (
                  <article
                    key={item.id}
                    className={[
                      "overflow-hidden rounded-3xl border bg-white shadow-sm transition",
                      item.is_visible
                        ? "border-gray-200"
                        : "border-gray-200 opacity-70",
                    ].join(" ")}
                  >
                    <div className="grid sm:grid-cols-[180px_1fr]">
                      <div className="relative min-h-48 bg-gradient-to-br from-blue-50 to-indigo-100">
                        {item.cover_url ? (
                          <img
                            src={
                              item.cover_url
                            }
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full min-h-48 items-center justify-center text-5xl">
                            📚
                          </div>
                        )}

                        {item.is_featured && (
                          <div className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold text-amber-950 shadow">
                            ⭐ En vedette
                          </div>
                        )}
                      </div>

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                              Ressource{" "}
                              {actualIndex + 1}
                            </div>

                            <h3 className="mt-1 text-lg font-semibold text-gray-900">
                              {item.title}
                            </h3>

                            <div className="mt-1 font-mono text-[11px] text-gray-400">
                              /{item.slug}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void updateFlags(
                                item,
                                {
                                  is_visible:
                                    !item.is_visible,
                                },
                              )
                            }
                            className={[
                              "rounded-full px-3 py-1.5 text-xs font-semibold",
                              item.is_visible
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-gray-100 text-gray-600",
                            ].join(
                              " ",
                            )}
                          >
                            {item.is_visible
                              ? "● Visible"
                              : "● Masquée"}
                          </button>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            {resourceTypeLabel(
                              item.resource_type,
                            )}
                          </span>

                          {level && (
                            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                              {level.short_label ||
                                level.name}
                            </span>
                          )}

                          {subject && (
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600">
                              {subject.name}
                            </span>
                          )}

                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                            Ordre{" "}
                            {item.sort_order}
                          </span>
                        </div>

                        {item.description && (
                          <p className="mt-4 text-sm leading-6 text-gray-500">
                            {item.description}
                          </p>
                        )}

                        {item.file_name && (
                          <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            📎{" "}
                            <span className="font-semibold">
                              {item.file_name}
                            </span>

                            {item.file_size !==
                              null && (
                              <span className="ml-2 text-slate-400">
                                (
                                {formatFileSize(
                                  item.file_size,
                                )}
                                )
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEdit(
                                item,
                              )
                            }
                            disabled={busy}
                            className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                          >
                            ✏️ Modifier
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void updateFlags(
                                item,
                                {
                                  is_featured:
                                    !item.is_featured,
                                },
                              )
                            }
                            className={[
                              "rounded-xl px-3 py-2 text-xs font-semibold",
                              item.is_featured
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-600",
                            ].join(
                              " ",
                            )}
                          >
                            {item.is_featured
                              ? "★ Retirer vedette"
                              : "☆ Mettre en vedette"}
                          </button>

                          <button
                            type="button"
                            disabled={
                              actualIndex === 0 ||
                              busy
                            }
                            onClick={() =>
                              void moveItem(
                                item,
                                -1,
                              )
                            }
                            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-30"
                          >
                            ↑
                          </button>

                          <button
                            type="button"
                            disabled={
                              actualIndex === orderedItems.length - 1 ||
                              busy
                            }
                            onClick={() =>
                              void moveItem(
                                item,
                                1,
                              )
                            }
                            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 disabled:opacity-30"
                          >
                            ↓
                          </button>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setPendingDelete(
                                item,
                              )
                            }
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40"
                          >
                            🗑 Supprimer
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              },
            )}
          </div>
        )}
      </section>

      {showEditor && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="mx-auto my-6 w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div>
                <div className="text-xl font-semibold text-gray-900">
                  {editingItem
                    ? "Modifier la ressource"
                    : "Ajouter une ressource"}
                </div>

                <p className="mt-1 text-sm text-gray-500">
                  L’administrateur peut importer directement le document et son image de couverture.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xl text-gray-500 hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Titre *
                  </label>

                  <input
                    value={form.title}
                    disabled={saving}
                    onChange={(event) => {
                      const title =
                        event.target.value;

                      updateForm({
                        title,

                        ...(!editingItem &&
                        (!form.slug ||
                          form.slug ===
                            makeSlug(
                              form.title,
                            ))
                          ? {
                              slug:
                                makeSlug(
                                  title,
                                ),
                            }
                          : {}),
                      });
                    }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Slug *
                  </label>

                  <input
                    value={form.slug}
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        slug:
                          makeSlug(
                            event.target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 font-mono text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Type de ressource
                  </label>

                  <select
                    value={
                      form.resourceType
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        resourceType:
                          event.target
                            .value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    {RESOURCE_TYPES.map(
                      (type) => (
                        <option
                          key={
                            type.value
                          }
                          value={
                            type.value
                          }
                        >
                          {type.label}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Auteur
                  </label>

                  <input
                    value={form.author}
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        author:
                          event.target
                            .value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Niveau
                  </label>

                  <select
                    value={form.levelId}
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        levelId:
                          event.target
                            .value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">
                      Aucun niveau spécifique
                    </option>

                    {levels.map(
                      (level) => (
                        <option
                          key={level.id}
                          value={level.id}
                        >
                          {level.short_label
                            ? `${level.short_label} — ${level.name}`
                            : level.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Matière
                  </label>

                  <select
                    value={
                      form.subjectId
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        subjectId:
                          event.target
                            .value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">
                      Aucune matière spécifique
                    </option>

                    {subjects.map(
                      (subject) => (
                        <option
                          key={subject.id}
                          value={subject.id}
                        >
                          {subject.name}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Description
                </label>

                <textarea
                  rows={4}
                  value={
                    form.description
                  }
                  disabled={saving}
                  onChange={(event) =>
                    updateForm({
                      description:
                        event.target
                          .value,
                    })
                  }
                  className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 leading-6 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* ==============================
                  FICHIER DE LA RESSOURCE
                  ============================== */}

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">
                      📄 Fichier de la ressource
                    </div>

                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      Importez directement un PDF, document Word, PowerPoint, Excel, ZIP, EPUB, fichier audio ou vidéo. Taille maximale : 50 Mo.
                    </p>
                  </div>

                  {editingItem?.file_path &&
                    !removeExistingFile &&
                    !pendingResourceFile && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Hébergé par SchoolNet
                      </span>
                    )}
                </div>

                {editingItem?.file_name &&
                  !removeExistingFile &&
                  !pendingResourceFile && (
                    <div className="mt-4 rounded-xl border border-indigo-100 bg-white p-4">
                      <div className="text-sm font-semibold text-gray-900">
                        📎{" "}
                        {editingItem.file_name}
                      </div>

                      <div className="mt-1 text-xs text-gray-500">
                        {formatFileSize(
                          editingItem.file_size,
                        )}

                        {editingItem.file_mime_type
                          ? ` · ${editingItem.file_mime_type}`
                          : ""}
                      </div>

                      {editingItem.file_url && (
                        <a
                          href={
                            editingItem.file_url
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Ouvrir le fichier ↗
                        </a>
                      )}
                    </div>
                  )}

                {pendingResourceFile && (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                      Nouveau fichier sélectionné
                    </div>

                    <div className="mt-2 font-semibold text-gray-900">
                      📎{" "}
                      {pendingResourceFile.name}
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      {formatFileSize(
                        pendingResourceFile.size,
                      )}

                      {pendingResourceFile.type
                        ? ` · ${pendingResourceFile.type}`
                        : ""}
                    </div>
                  </div>
                )}

                {removeExistingFile &&
                  !pendingResourceFile && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                      Le fichier actuel sera retiré lors de l’enregistrement.
                    </div>
                  )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
                    {pendingResourceFile ||
                    editingItem?.file_path
                      ? "Remplacer le fichier"
                      : "Choisir un fichier"}

                    <input
                      type="file"
                      disabled={saving}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,.epub,.mp4,.webm,.mp3,.wav"
                      onChange={(event) =>
                        handleResourceFile(
                          event.target
                            .files?.[0],
                        )
                      }
                    />
                  </label>

                  {(pendingResourceFile ||
                    editingItem?.file_path ||
                    form.fileUrl.trim()) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={
                        removeResourceSelection
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                    >
                      Retirer le fichier
                    </button>
                  )}
                </div>

                <div className="mt-5 border-t border-indigo-100 pt-5">
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    Ou utiliser une URL de fichier distante
                  </label>

                  <input
                    value={form.fileUrl}
                    disabled={
                      saving ||
                      Boolean(
                        pendingResourceFile,
                      )
                    }
                    onChange={(event) => {
                      setRemoveExistingFile(
                        false,
                      );

                      updateForm({
                        fileUrl:
                          event.target.value,
                      });
                    }}
                    placeholder="https://.../document.pdf"
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                  />

                  <p className="mt-2 text-[11px] leading-5 text-gray-400">
                    Pour l’usage normal, privilégiez l’import depuis l’ordinateur. L’URL reste utile pour un document déjà hébergé ailleurs.
                  </p>
                </div>
              </div>

              {/* ==============================
                  IMAGE DE COUVERTURE
                  ============================== */}

              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
                <div>
                  <div className="font-semibold text-gray-900">
                    🖼 Image de couverture
                  </div>

                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    Importez une image depuis votre ordinateur. Si aucune image n’est renseignée, SchoolNet choisira automatiquement une illustration adaptée à la matière.
                  </p>
                </div>

                {currentCoverPreview && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <img
                      src={
                        currentCoverPreview
                      }
                      alt="Aperçu de la couverture"
                      className="h-56 w-full object-cover"
                    />
                  </div>
                )}

                {pendingCoverFile && (
                  <div className="mt-3 text-xs text-gray-600">
                    Nouvelle image :{" "}
                    <strong>
                      {pendingCoverFile.name}
                    </strong>{" "}
                    ·{" "}
                    {formatFileSize(
                      pendingCoverFile.size,
                    )}
                  </div>
                )}

                {removeExistingCover &&
                  !pendingCoverFile && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                      L’image personnalisée sera retirée. SchoolNet utilisera alors l’illustration automatique.
                    </div>
                  )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
                    {currentCoverPreview
                      ? "Remplacer l’image"
                      : "Importer une image"}

                    <input
                      type="file"
                      accept="image/*"
                      disabled={saving}
                      className="hidden"
                      onChange={(event) =>
                        handleCoverFile(
                          event.target
                            .files?.[0],
                        )
                      }
                    />
                  </label>

                  {(pendingCoverFile ||
                    editingItem?.cover_path ||
                    form.coverUrl.trim()) && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={
                        removeCoverSelection
                      }
                      className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
                    >
                      Retirer l’image
                    </button>
                  )}
                </div>

                <div className="mt-5 border-t border-blue-100 pt-5">
                  <label className="mb-2 block text-xs font-semibold text-gray-600">
                    Ou URL d’image personnalisée
                  </label>

                  <input
                    value={form.coverUrl}
                    disabled={
                      saving ||
                      Boolean(
                        pendingCoverFile,
                      )
                    }
                    onChange={(event) => {
                      setRemoveExistingCover(
                        false,
                      );

                      updateForm({
                        coverUrl:
                          event.target.value,
                      });
                    }}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  Lien externe complémentaire
                </label>

                <input
                  value={
                    form.externalUrl
                  }
                  disabled={saving}
                  onChange={(event) =>
                    updateForm({
                      externalUrl:
                        event.target
                          .value,
                    })
                  }
                  placeholder="https://..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <p className="mt-1 text-xs text-gray-400">
                  Optionnel. Utilisez-le pour rediriger vers une ressource externe.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Libellé du bouton
                  </label>

                  <input
                    value={
                      form.downloadLabel
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        downloadLabel:
                          event.target
                            .value,
                      })
                    }
                    placeholder="Consulter"
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Ordre
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={
                      form.sortOrder
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        sortOrder:
                          Number(
                            event.target
                              .value,
                          ),
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <div className="font-semibold text-gray-900">
                      Visible
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      Afficher cette ressource sur le site.
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      form.isVisible
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        isVisible:
                          event.target
                            .checked,
                      })
                    }
                    className="h-5 w-5 accent-blue-600"
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div>
                    <div className="font-semibold text-gray-900">
                      Mise en avant
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      Ajouter le badge « En vedette ».
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      form.isFeatured
                    }
                    disabled={saving}
                    onChange={(event) =>
                      updateForm({
                        isFeatured:
                          event.target
                            .checked,
                      })
                    }
                    className="h-5 w-5 accent-amber-500"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-5">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="sn-btn-ghost sn-press"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void saveItem()
                }
                disabled={saving}
                className="sn-btn-primary sn-press"
              >
                {saving
                  ? pendingResourceFile ||
                    pendingCoverFile
                    ? "Import et enregistrement…"
                    : "Enregistrement…"
                  : editingItem
                    ? "Enregistrer les modifications"
                    : "Ajouter la ressource"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="px-6 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-xl">
                🗑
              </div>

              <h2 className="mt-5 text-xl font-semibold text-gray-900">
                Supprimer cette ressource ?
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-500">
                La ressource{" "}
                <strong className="text-gray-900">
                  {pendingDelete.title}
                </strong>{" "}
                sera supprimée de la bibliothèque SchoolNet.
              </p>

              {(pendingDelete.file_path ||
                pendingDelete.cover_path) && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                  Les fichiers importés associés seront également supprimés de Supabase Storage.
                </div>
              )}

              <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">
                Cette action est définitive.
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-5">
              <button
                type="button"
                onClick={() =>
                  setPendingDelete(
                    null,
                  )
                }
                disabled={deleting}
                className="sn-btn-ghost sn-press"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={() =>
                  void deleteItem()
                }
                disabled={deleting}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleting
                  ? "Suppression…"
                  : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}