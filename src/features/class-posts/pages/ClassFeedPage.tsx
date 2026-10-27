import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  archiveClassPost,
  createClassPost,
  deleteClassPost,
  getClassPostArchiveFeed,
  getClassPostFeed,
  getPublishableClasses,
  markClassPostAsRead,
  restoreClassPost,
  updateClassPost,
} from "../api/classPostsApi";

import type {
  ClassPost,
  ClassPostAudience,
  ClassPostPriority,
  ClassPostType,
  PublishableClass,
} from "../types/classPosts.types";

type PriorityFilter = "all" | ClassPostPriority;
type FeedView = "active" | "archived";

interface CreateFormState {
  classId: string;
  title: string;
  body: string;
  audience: ClassPostAudience;
  priority: ClassPostPriority;
  postType: ClassPostType;
  isPinned: boolean;
}

const initialCreateForm: CreateFormState = {
  classId: "",
  title: "",
  body: "",
  audience: "students_and_parents",
  priority: "normal",
  postType: "announcement",
  isPinned: false,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error
  ) {
    return String(error.message);
  }

  return "Une erreur inattendue est survenue.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getAudienceLabel(
  audience: ClassPostAudience,
) {
  switch (audience) {
    case "students":
      return "Élèves";

    case "parents":
      return "Parents / Tuteurs";

    case "students_and_parents":
      return "Élèves + Parents";

    default:
      return audience;
  }
}

function getTypeLabel(type: ClassPostType) {
  switch (type) {
    case "announcement":
      return "Annonce";

    case "academic":
      return "Information pédagogique";

    case "homework":
      return "Travail / Devoir";

    case "event":
      return "Événement";

    case "reminder":
      return "Rappel";

    default:
      return type;
  }
}

function getTypeIcon(type: ClassPostType) {
  switch (type) {
    case "announcement":
      return "📢";

    case "academic":
      return "🎓";

    case "homework":
      return "📝";

    case "event":
      return "📅";

    case "reminder":
      return "⏰";

    default:
      return "📌";
  }
}

function getPriorityLabel(
  priority: ClassPostPriority,
) {
  switch (priority) {
    case "normal":
      return "Normal";

    case "important":
      return "Important";

    case "urgent":
      return "Urgent";

    default:
      return priority;
  }
}

function getPriorityClasses(
  priority: ClassPostPriority,
) {
  switch (priority) {
    case "urgent":
      return {
        card:
          "border-red-200 bg-gradient-to-br from-red-50/90 via-white to-white",
        badge:
          "border-red-200 bg-red-50 text-red-700",
        dot: "bg-red-500",
        accent: "bg-red-500",
      };

    case "important":
      return {
        card:
          "border-amber-200 bg-gradient-to-br from-amber-50/80 via-white to-white",
        badge:
          "border-amber-200 bg-amber-50 text-amber-700",
        dot: "bg-amber-500",
        accent: "bg-amber-500",
      };

    default:
      return {
        card:
          "border-slate-200 bg-white",
        badge:
          "border-slate-200 bg-slate-50 text-slate-600",
        dot: "bg-blue-500",
        accent: "bg-blue-500",
      };
  }
}

export default function ClassFeedPage() {
  const [posts, setPosts] = useState<ClassPost[]>([]);
  const [
    publishableClasses,
    setPublishableClasses,
  ] = useState<PublishableClass[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] = useState<
    string | null
  >(null);

  const [search, setSearch] = useState("");

  const [classFilter, setClassFilter] =
    useState("all");

  const [priorityFilter, setPriorityFilter] =
    useState<PriorityFilter>("all");

  const [feedView, setFeedView] =
    useState<FeedView>("active");

  const [archivedPosts, setArchivedPosts] =
    useState<ClassPost[]>([]);

  const [postActionId, setPostActionId] =
    useState<string | null>(null);

  const [postActionError, setPostActionError] =
    useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] =
    useState(false);

  const [selectedPost, setSelectedPost] =
    useState<ClassPost | null>(null);

  const [createForm, setCreateForm] =
    useState<CreateFormState>(
      initialCreateForm,
    );

  const [creating, setCreating] =
    useState(false);

  const [createError, setCreateError] =
    useState<string | null>(null);

  const [
    actionMenuPostId,
    setActionMenuPostId,
  ] = useState<string | null>(null);

  const [editTarget, setEditTarget] =
    useState<ClassPost | null>(null);

  const [editForm, setEditForm] =
    useState<CreateFormState>(
      initialCreateForm,
    );

  const [editing, setEditing] =
    useState(false);

  const [editError, setEditError] =
    useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] =
    useState<ClassPost | null>(null);
  
  const [archiveTarget, setArchiveTarget] =
    useState<ClassPost | null>(null);

  const [restoreTarget, setRestoreTarget] =
    useState<ClassPost | null>(null);

  const [deleting, setDeleting] =
    useState(false);

  const [deleteError, setDeleteError] =
    useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setError(null);
        setPostActionError(null);

        const [feedResult, classesResult] =
          await Promise.all([
            getClassPostFeed(null, 100, 0),
            getPublishableClasses(),
          ]);

        setPosts(feedResult);
        setPublishableClasses(classesResult);

        /*
        * Les archives sont réservées aux utilisateurs
        * capables de gérer/publier.
        *
        * Surtout : une éventuelle erreur sur les archives
        * ne doit jamais empêcher un élève ou un parent
        * d'accéder à son fil normal.
        */
        if (classesResult.length > 0) {
          try {
            const archiveResult =
              await getClassPostArchiveFeed(
                null,
                100,
                0,
              );

            setArchivedPosts(archiveResult);
          } catch {
            setArchivedPosts([]);
          }
        } else {
          setArchivedPosts([]);
        }
      } catch (loadError) {
        setError(
          getErrorMessage(loadError),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentPosts =
    feedView === "archived"
      ? archivedPosts
      : posts;

  const availableClasses = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        schoolYear: string | null;
      }
    >();

    currentPosts.forEach((post) => {
      map.set(post.class_id, {
        id: post.class_id,
        name: post.class_name,
        schoolYear: post.school_year,
      });
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "fr",
          {
            numeric: true,
          },
        ),
    );
  }, [currentPosts]);

  const filteredPosts = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return currentPosts.filter((post) => {
      if (
        classFilter !== "all" &&
        post.class_id !== classFilter
      ) {
        return false;
      }

      if (
        priorityFilter !== "all" &&
        post.priority !== priorityFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        post.title,
        post.body,
        post.class_name,
        post.author_name,
        getTypeLabel(post.post_type),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [
    currentPosts,
    search,
    classFilter,
    priorityFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: posts.length,

      unread: posts.filter(
        (post) =>
          !post.is_read &&
          !post.can_manage,
      ).length,

      urgent: posts.filter(
        (post) =>
          post.priority === "urgent",
      ).length,

      pinned: posts.filter(
        (post) => post.is_pinned,
      ).length,
    };
  }, [posts]);

  const canPublish =
    publishableClasses.length > 0;
  
  function changeFeedView(view: FeedView) {
    setFeedView(view);
    setClassFilter("all");
    setPriorityFilter("all");
    setSelectedPost(null);
    setPostActionError(null);
  }

    function openCreateModal() {
        setCreateError(null);

        setCreateForm({
            ...initialCreateForm,
            classId: "",
        });

        setShowCreateModal(true);
    }

  async function openPost(post: ClassPost) {
    setSelectedPost(post);

    if (
      !post.is_read &&
      !post.can_manage
    ) {
      try {
        const marked =
          await markClassPostAsRead(
            post.id,
          );

        if (marked) {
          const readAt =
            new Date().toISOString();

          const markAsRead = (
            items: ClassPost[],
          ) =>
            items.map((currentPost) =>
              currentPost.id === post.id
                ? {
                    ...currentPost,
                    is_read: true,
                    read_at: readAt,
                  }
                : currentPost,
            );

          setPosts((current) =>
            markAsRead(current),
          );

          setArchivedPosts((current) =>
            markAsRead(current),
          );

          setSelectedPost((current) =>
            current?.id === post.id
              ? {
                  ...current,
                  is_read: true,
                  read_at: readAt,
                }
              : current,
          );
        }
      } catch {
        // La lecture de la publication reste possible
        // même si le marquage comme lu échoue.
      }
    }
  }

async function handleArchivePost(
  post: ClassPost,
) {
  try {
    setPostActionId(post.id);
    setPostActionError(null);

    const archived =
      await archiveClassPost(post.id);

    if (!archived) {
      throw new Error(
        "La publication n'a pas pu être archivée.",
      );
    }

    setSelectedPost(null);
    setArchiveTarget(null);

    await loadData(true);
  } catch (archiveError) {
    setPostActionError(
      getErrorMessage(archiveError),
    );
  } finally {
    setPostActionId(null);
  }
}

async function handleRestorePost(
  post: ClassPost,
) {
  try {
    setPostActionId(post.id);
    setPostActionError(null);

    const restored =
      await restoreClassPost(post.id);

    if (!restored) {
      throw new Error(
        "La publication n'a pas pu être restaurée.",
      );
    }

    // La restauration a réussi :
    // on ferme immédiatement la modale SchoolNet.
    setRestoreTarget(null);
    setSelectedPost(null);

    await loadData(true);
  } catch (restoreError) {
    setPostActionError(
      getErrorMessage(restoreError),
    );
  } finally {
    setPostActionId(null);
  }
}

  function openEditModal(post: ClassPost) {
    setActionMenuPostId(null);
    setEditError(null);

    setEditTarget(post);

    setEditForm({
      classId: post.class_id,
      title: post.title,
      body: post.body,
      audience: post.audience,
      priority: post.priority,
      postType: post.post_type,
      isPinned: post.is_pinned,
    });
  }

  function openDeleteModal(post: ClassPost) {
    setActionMenuPostId(null);
    setDeleteError(null);
    setDeleteTarget(post);
  }

  function openArchiveModal(post: ClassPost) {
    setActionMenuPostId(null);
    setPostActionError(null);
    setArchiveTarget(post);
  }

  function openRestoreModal(post: ClassPost) {
    setActionMenuPostId(null);
    setPostActionError(null);
    setRestoreTarget(post);
  }

  async function handleUpdatePost() {
    if (!editTarget) {
      return;
    }

    if (!editForm.title.trim()) {
      setEditError(
        "Le titre est obligatoire.",
      );
      return;
    }

    if (!editForm.body.trim()) {
      setEditError(
        "Le contenu est obligatoire.",
      );
      return;
    }

    try {
      setEditing(true);
      setEditError(null);

      const updated =
        await updateClassPost({
          postId: editTarget.id,
          title: editForm.title.trim(),
          body: editForm.body.trim(),
          audience: editForm.audience,
          priority: editForm.priority,
          postType: editForm.postType,
          isPinned: editForm.isPinned,

          // On conserve les dates actuelles.
          publishedAt:
            editTarget.published_at,

          expiresAt:
            editTarget.expires_at,
        });

      if (!updated) {
        throw new Error(
          "La publication n'a pas pu être modifiée.",
        );
      }

      setEditTarget(null);

      if (
        selectedPost?.id ===
        editTarget.id
      ) {
        setSelectedPost(null);
      }

      await loadData(true);
    } catch (updateError) {
      setEditError(
        getErrorMessage(updateError),
      );
    } finally {
      setEditing(false);
    }
  }

  async function handleDeletePost() {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeleting(true);
      setDeleteError(null);

      const deleted =
        await deleteClassPost(
          deleteTarget.id,
        );

      if (!deleted) {
        throw new Error(
          "La publication n'a pas pu être supprimée.",
        );
      }

      if (
        selectedPost?.id ===
        deleteTarget.id
      ) {
        setSelectedPost(null);
      }

      setDeleteTarget(null);

      await loadData(true);
    } catch (deletePostError) {
      setDeleteError(
        getErrorMessage(
          deletePostError,
        ),
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreatePost() {
    if (!createForm.classId) {
      setCreateError(
        "Sélectionne une classe.",
      );
      return;
    }

    if (!createForm.title.trim()) {
      setCreateError(
        "Le titre est obligatoire.",
      );
      return;
    }

    if (!createForm.body.trim()) {
      setCreateError(
        "Le contenu est obligatoire.",
      );
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);

      await createClassPost({
        classId: createForm.classId,
        title: createForm.title.trim(),
        body: createForm.body.trim(),
        audience: createForm.audience,
        priority: createForm.priority,
        postType: createForm.postType,
        isPinned: createForm.isPinned,
      });

      setShowCreateModal(false);
      setCreateForm(initialCreateForm);

      await loadData(true);
    } catch (createPostError) {
      setCreateError(
        getErrorMessage(
          createPostError,
        ),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen space-y-5 pb-12">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-6 py-7 text-white shadow-[0_20px_70px_-30px_rgba(37,99,235,0.7)] sm:px-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
              <span>🏫</span>
              <span>Vie de classe SchoolNet</span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Espace de classe
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50 sm:text-base">
              Retrouvez les annonces, informations
              pédagogiques, rappels et événements
              importants de votre communauté scolaire.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                void loadData(true)
              }
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              >
                ↻
              </span>

              {refreshing
                ? "Actualisation..."
                : "Actualiser"}
            </button>

            {canPublish ? (
              <button
                type="button"
                onClick={() =>
                  changeFeedView(
                    feedView === "active"
                      ? "archived"
                      : "active",
                  )
                }
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                {feedView === "active" ? (
                  <>
                    <span>🗄️</span>
                    Archives
                    {archivedPosts.length > 0 ? (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
                        {archivedPosts.length}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span>←</span>
                    Publications actives
                  </>
                )}
              </button>
            ) : null}

            {canPublish &&
            feedView === "active" ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg shadow-blue-950/10 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <span className="text-lg">
                  +
                </span>
                Nouvelle publication
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {feedView === "archived" ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-amber-900">
              🗄️ Publications archivées
            </p>

            <p className="mt-1 text-sm text-amber-700">
              Ces publications ne sont plus visibles
              par les élèves et les parents dans leur
              fil actif.
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 shadow-sm">
            {archivedPosts.length} archive
            {archivedPosts.length !== 1
              ? "s"
              : ""}
          </span>
        </section>
      ) : null}

      {/* STATS */}
      {feedView === "active" ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Publications
            </span>

            <span className="rounded-xl bg-blue-50 p-2">
              📚
            </span>
          </div>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {stats.total}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Dans votre fil actuel
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              À découvrir
            </span>

            <span className="rounded-xl bg-violet-50 p-2">
              ✨
            </span>
          </div>

          <p className="mt-2 text-2xl font-bold text-violet-600">
            {stats.unread}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Publications non encore lues
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Urgentes
            </span>

            <span className="rounded-xl bg-red-50 p-2">
              🚨
            </span>
          </div>

          <p className="mt-2 text-2xl font-bold text-red-600">
            {stats.urgent}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Informations prioritaires
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Épinglées
            </span>

            <span className="rounded-xl bg-amber-50 p-2">
              📌
            </span>
          </div>

          <p className="mt-2 text-2xl font-bold text-amber-600">
            {stats.pinned}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            À garder sous la main
          </p>
        </div>
      </section>
      ) : null}

      {/* FILTRES */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              🔎
            </span>

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Rechercher une publication, un auteur ou une classe..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <select
            value={classFilter}
            onChange={(event) =>
              setClassFilter(
                event.target.value,
              )
            }
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            <option value="all">
              Toutes les classes
            </option>

            {availableClasses.map(
              (item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                  {item.schoolYear
                    ? ` · ${item.schoolYear}`
                    : ""}
                </option>
              ),
            )}
          </select>

          <div className="flex gap-2 overflow-x-auto">
            {(
              [
                ["all", "Toutes"],
                ["normal", "Normales"],
                [
                  "important",
                  "Importantes",
                ],
                ["urgent", "Urgentes"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setPriorityFilter(value)
                }
                className={[
                  "whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold transition",
                  priorityFilter === value
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ERREUR */}
      {error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <div className="text-xl">
              ⚠️
            </div>

            <div>
              <p className="font-semibold text-red-800">
                Impossible de charger
                l’espace de classe
              </p>

              <p className="mt-1 text-sm text-red-600">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void loadData()
                }
                className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Réessayer
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {postActionError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          ⚠️ {postActionError}
        </section>
      ) : null}

      {/* CONTENU */}
      {loading ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {Array.from({
            length: 4,
          }).map((_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-3xl border border-slate-200 bg-white"
            />
          ))}
        </section>
      ) : filteredPosts.length === 0 ? (
        <section className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl">
            📰
          </div>

          <h2 className="mt-5 text-lg font-bold text-slate-900">
            {feedView === "archived"
              ? "Aucune publication archivée"
              : "Aucune publication"}
          </h2>

          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            {feedView === "archived"
              ? "Aucune publication n'est actuellement conservée dans les archives."
              : "Il n’y a actuellement aucune publication correspondant aux filtres sélectionnés."}
          </p>

          {canPublish &&
          feedView === "active" ? ( 
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              + Créer une publication
            </button>
          ) : null}
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredPosts.map((post) => {
            const priority =
              getPriorityClasses(
                post.priority,
              );

            return (
              <article
                key={post.id}
                className={[
                  "group relative overflow-hidden rounded-3xl border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl",
                  priority.card,
                ].join(" ")}
              >
                <div
                  className={[
                    "absolute inset-y-0 left-0 w-1",
                    priority.accent,
                  ].join(" ")}
                />

                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-md">
                    {post.author_avatar_url ? (
                      <img
                        src={
                          post.author_avatar_url
                        }
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(
                        post.author_name,
                      )
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {post.author_name}
                      </p>

                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                        {post.class_name}
                      </span>

                      {post.is_pinned ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          📌 Épinglée
                        </span>
                      ) : null}

                      {!post.is_read &&
                      !post.can_manage ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                          Nouveau
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(
                        post.published_at,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span
                    className={[
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      priority.badge,
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "h-1.5 w-1.5 rounded-full",
                        priority.dot,
                      ].join(" ")}
                    />

                    {getPriorityLabel(
                      post.priority,
                    )}
                  </span>

                  <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {getTypeIcon(
                      post.post_type,
                    )}{" "}
                    {getTypeLabel(
                      post.post_type,
                    )}
                  </span>

                  <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    👥{" "}
                    {getAudienceLabel(
                      post.audience,
                    )}
                  </span>
                </div>

                <h2 className="mt-4 text-lg font-bold leading-snug text-slate-900">
                  {post.title}
                </h2>

                <p className="mt-2 max-h-[72px] overflow-hidden whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {post.body}
                </p>

                <div className="mt-5 flex items-center justify-between border-t border-slate-200/70 pt-4">
                  <div className="text-xs text-slate-500">
                    {post.can_manage &&
                    post.read_count !== null ? (
                      <span className="inline-flex items-center gap-1.5">
                        👁️{" "}
                        <strong className="font-semibold text-slate-700">
                          {
                            post.read_count
                          }
                        </strong>{" "}
                        lecture
                        {post.read_count !==
                        1
                          ? "s"
                          : ""}
                      </span>
                    ) : post.is_read ? (
                      <span className="text-emerald-600">
                        ✓ Consultée
                      </span>
                    ) : (
                      <span>
                        À consulter
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center gap-2">
                    {(post.can_edit ||
                      post.can_manage) ? (
                      <div className="relative">
                        <button
                          type="button"
                          aria-label="Actions de la publication"
                          onClick={() =>
                            setActionMenuPostId(
                              (current) =>
                                current === post.id
                                  ? null
                                  : post.id,
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                        >
                          ⋯
                        </button>

                        {actionMenuPostId ===
                        post.id ? (
                          <div className="absolute bottom-full right-0 z-30 mb-2 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                            {feedView ===
                              "active" &&
                            post.can_edit ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openEditModal(post)
                                }
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                              >
                                <span>✏️</span>
                                Modifier
                              </button>
                            ) : null}

                            {feedView ===
                              "active" &&
                            post.can_manage ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openArchiveModal(post)
                                }
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-amber-50 hover:text-amber-700"
                              >
                                <span>🗄️</span>
                                Archiver
                              </button>
                            ) : null}

                            {feedView ===
                              "archived" &&
                            post.can_manage ? (
                              <button
                                type="button"
                                onClick={() =>
                                  openRestoreModal(post)
                                }
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
                              >
                                <span>↩️</span>
                                Restaurer
                              </button>
                            ) : null}

                            {post.can_manage ? (
                              <>
                                <div className="my-1 border-t border-slate-100" />

                                <button
                                  type="button"
                                  onClick={() =>
                                    openDeleteModal(
                                      post,
                                    )
                                  }
                                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50"
                                >
                                  <span>🗑️</span>
                                  Supprimer
                                </button>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() =>
                        void openPost(post)
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-600"
                    >
                      Lire
                      <span>→</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* MODAL DÉTAIL */}
      {selectedPost ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() =>
              setSelectedPost(null)
            }
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                      {
                        selectedPost.class_name
                      }
                    </span>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {getTypeIcon(
                        selectedPost.post_type,
                      )}{" "}
                      {getTypeLabel(
                        selectedPost.post_type,
                      )}
                    </span>

                    {selectedPost.is_pinned ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        📌 Épinglée
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-900">
                    {selectedPost.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSelectedPost(null)
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-500 transition hover:bg-slate-200"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                  {selectedPost.author_avatar_url ? (
                    <img
                      src={
                        selectedPost.author_avatar_url
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    getInitials(
                      selectedPost.author_name,
                    )
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {
                      selectedPost.author_name
                    }
                  </p>

                  <p className="text-xs text-slate-400">
                    {formatDate(
                      selectedPost.published_at,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-6 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">
                {selectedPost.body}
              </div>

              <div className="mt-7 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Destinataires
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {getAudienceLabel(
                      selectedPost.audience,
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Priorité
                  </p>

                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {getPriorityLabel(
                      selectedPost.priority,
                    )}
                  </p>
                </div>

                {selectedPost.can_manage &&
                selectedPost.read_count !==
                  null ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Lectures
                    </p>

                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {
                        selectedPost.read_count
                      }{" "}
                      consultation
                      {selectedPost.read_count !==
                      1
                        ? "s"
                        : ""}
                    </p>
                  </div>
                ) : null}

                {selectedPost.read_at ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Consultée le
                    </p>

                    <p className="mt-1 text-sm font-semibold text-emerald-600">
                      {formatDate(
                        selectedPost.read_at,
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL MODIFICATION */}
      {editTarget ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() =>
              !editing &&
              setEditTarget(null)
            }
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-violet-50 p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white">
                    ✏️
                  </div>

                  <h2 className="text-xl font-bold text-slate-900">
                    Modifier la publication
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Classe :{" "}
                    <strong>
                      {editTarget.class_name}
                    </strong>
                  </p>
                </div>

                <button
                  type="button"
                  disabled={editing}
                  onClick={() =>
                    setEditTarget(null)
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6 sm:p-7">
              {editError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {editError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Titre
                </label>

                <input
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm(
                      (current) => ({
                        ...current,
                        title:
                          event.target.value,
                      }),
                    )
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Contenu
                </label>

                <textarea
                  rows={7}
                  value={editForm.body}
                  onChange={(event) =>
                    setEditForm(
                      (current) => ({
                        ...current,
                        body:
                          event.target.value,
                      }),
                    )
                  }
                  className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Destinataires
                  </label>

                  <select
                    value={
                      editForm.audience
                    }
                    onChange={(event) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          audience:
                            event.target
                              .value as ClassPostAudience,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="students_and_parents">
                      Élèves + Parents
                    </option>
                    <option value="students">
                      Élèves uniquement
                    </option>
                    <option value="parents">
                      Parents uniquement
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Type
                  </label>

                  <select
                    value={
                      editForm.postType
                    }
                    onChange={(event) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          postType:
                            event.target
                              .value as ClassPostType,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="announcement">
                      Annonce
                    </option>
                    <option value="academic">
                      Information pédagogique
                    </option>
                    <option value="homework">
                      Travail / Devoir
                    </option>
                    <option value="event">
                      Événement
                    </option>
                    <option value="reminder">
                      Rappel
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Priorité
                  </label>

                  <select
                    value={
                      editForm.priority
                    }
                    onChange={(event) =>
                      setEditForm(
                        (current) => ({
                          ...current,
                          priority:
                            event.target
                              .value as ClassPostPriority,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="normal">
                      Normale
                    </option>
                    <option value="important">
                      Importante
                    </option>
                    <option value="urgent">
                      Urgente
                    </option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <input
                  type="checkbox"
                  checked={
                    editForm.isPinned
                  }
                  onChange={(event) =>
                    setEditForm(
                      (current) => ({
                        ...current,
                        isPinned:
                          event.target
                            .checked,
                      }),
                    )
                  }
                  className="h-4 w-4"
                />

                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    📌 Épingler cette publication
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    La publication sera mise en avant dans le fil.
                  </p>
                </div>
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={editing}
                  onClick={() =>
                    setEditTarget(null)
                  }
                  className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  disabled={editing}
                  onClick={() =>
                    void handleUpdatePost()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {editing
                    ? "Enregistrement..."
                    : "✓ Enregistrer les modifications"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL SUPPRESSION */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() =>
              !deleting &&
              setDeleteTarget(null)
            }
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-2xl">
                🗑️
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                Supprimer cette publication ?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                La publication sera retirée de
                l’espace de classe.
              </p>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-800">
                  {deleteTarget.title}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {deleteTarget.class_name}
                </p>
              </div>

              {deleteError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {deleteError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() =>
                    setDeleteTarget(null)
                  }
                  className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  disabled={deleting}
                  onClick={() =>
                    void handleDeletePost()
                  }
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting
                    ? "Suppression..."
                    : "🗑️ Supprimer définitivement"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL ARCHIVAGE */}
      {archiveTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => {
              if (!postActionId) {
                setPostActionError(null);
                setArchiveTarget(null);
              }
            }}
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl">
                🗄️
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                Archiver cette publication ?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                La publication ne sera plus visible dans le fil
                actif des élèves et des parents. Elle pourra être
                restaurée ultérieurement depuis les archives.
              </p>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-800">
                  {archiveTarget.title}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {archiveTarget.class_name}
                </p>
              </div>

              {postActionError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {postActionError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    postActionId ===
                    archiveTarget.id
                  }
                  onClick={() => {
                    setPostActionError(null);
                    setArchiveTarget(null);
                  }}
                  className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  disabled={
                    postActionId ===
                    archiveTarget.id
                  }
                  onClick={() =>
                    void handleArchivePost(
                      archiveTarget,
                    )
                  }
                  className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {postActionId ===
                  archiveTarget.id
                    ? "Archivage..."
                    : "🗄️ Archiver"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL RESTAURATION */}
      {restoreTarget ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => {
              if (!postActionId) {
                setPostActionError(null);
                setRestoreTarget(null);
              }
            }}
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="p-6 sm:p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                ↩️
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                Restaurer cette publication ?
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                La publication quittera les archives et
                redeviendra visible dans le fil actif pour ses
                destinataires.
              </p>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="font-semibold text-slate-800">
                  {restoreTarget.title}
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  {restoreTarget.class_name}
                </p>
              </div>

              {postActionError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {postActionError}
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    postActionId ===
                    restoreTarget.id
                  }
                  onClick={() => {
                    setPostActionError(null);
                    setRestoreTarget(null);
                  }}
                  className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  disabled={
                    postActionId ===
                    restoreTarget.id
                  }
                  onClick={() =>
                    void handleRestorePost(
                      restoreTarget,
                    )
                  }
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {postActionId ===
                  restoreTarget.id
                    ? "Restauration..."
                    : "↩️ Restaurer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL CRÉATION */}
      {showCreateModal ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Fermer"
            onClick={() =>
              !creating &&
              setShowCreateModal(false)
            }
            className="absolute inset-0 cursor-default"
          />

          <div className="relative z-10 max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[30px] bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-blue-50 to-violet-50 p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20">
                    📢
                  </div>

                  <h2 className="text-xl font-bold text-slate-900">
                    Nouvelle publication
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Partagez une information
                    avec votre communauté de
                    classe.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={creating}
                  onClick={() =>
                    setShowCreateModal(false)
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg text-slate-500 shadow-sm transition hover:bg-slate-100 disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-5 p-6 sm:p-7">
              {createError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createError}
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Classe
                </label>

                <select
                  value={
                    createForm.classId
                  }
                  onChange={(event) =>
                    setCreateForm(
                      (current) => ({
                        ...current,
                        classId:
                          event.target
                            .value,
                      }),
                    )
                  }
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                    <option value="" disabled>
                         Sélectionner une classe...
                    </option>
                  {publishableClasses.map(
                    (item) => (
                      <option
                        key={
                          item.class_id
                        }
                        value={
                          item.class_id
                        }
                      >
                        {
                          item.class_name
                        }
                        {item.school_year
                          ? ` · ${item.school_year}`
                          : ""}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Titre
                </label>

                <input
                  value={createForm.title}
                  maxLength={180}
                  onChange={(event) =>
                    setCreateForm(
                      (current) => ({
                        ...current,
                        title:
                          event.target
                            .value,
                      }),
                    )
                  }
                  placeholder="Ex. Réunion parents-professeurs"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Message
                  </label>

                  <span className="text-xs text-slate-400">
                    {
                      createForm.body
                        .length
                    }
                    /10000
                  </span>
                </div>

                <textarea
                  value={createForm.body}
                  maxLength={10000}
                  rows={7}
                  onChange={(event) =>
                    setCreateForm(
                      (current) => ({
                        ...current,
                        body:
                          event.target
                            .value,
                      }),
                    )
                  }
                  placeholder="Rédigez votre publication..."
                  className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Destinataires
                  </label>

                  <select
                    value={
                      createForm.audience
                    }
                    onChange={(event) =>
                      setCreateForm(
                        (current) => ({
                          ...current,
                          audience:
                            event
                              .target
                              .value as ClassPostAudience,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="students_and_parents">
                      Élèves + Parents
                    </option>

                    <option value="students">
                      Élèves uniquement
                    </option>

                    <option value="parents">
                      Parents uniquement
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Type
                  </label>

                  <select
                    value={
                      createForm.postType
                    }
                    onChange={(event) =>
                      setCreateForm(
                        (current) => ({
                          ...current,
                          postType:
                            event
                              .target
                              .value as ClassPostType,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="announcement">
                      Annonce
                    </option>

                    <option value="academic">
                      Information pédagogique
                    </option>

                    <option value="homework">
                      Travail / Devoir
                    </option>

                    <option value="event">
                      Événement
                    </option>

                    <option value="reminder">
                      Rappel
                    </option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Priorité
                  </label>

                  <select
                    value={
                      createForm.priority
                    }
                    onChange={(event) =>
                      setCreateForm(
                        (current) => ({
                          ...current,
                          priority:
                            event
                              .target
                              .value as ClassPostPriority,
                        }),
                      )
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="normal">
                      Normale
                    </option>

                    <option value="important">
                      Importante
                    </option>

                    <option value="urgent">
                      Urgente
                    </option>
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <input
                  type="checkbox"
                  checked={
                    createForm.isPinned
                  }
                  onChange={(event) =>
                    setCreateForm(
                      (current) => ({
                        ...current,
                        isPinned:
                          event.target
                            .checked,
                      }),
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />

                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    📌 Épingler cette
                    publication
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    Elle apparaîtra en
                    priorité dans le fil de
                    classe.
                  </p>
                </div>
              </label>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={creating}
                  onClick={() =>
                    setShowCreateModal(false)
                  }
                  className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  Annuler
                </button>

                <button
                  type="button"
                  disabled={creating}
                  onClick={() =>
                    void handleCreatePost()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <>
                      <span className="animate-spin">
                        ◌
                      </span>
                      Publication...
                    </>
                  ) : (
                    <>
                      <span>📨</span>
                      Publier
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}