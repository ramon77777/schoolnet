import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type ConversationRow = {
  conversation_id: string;
  conversation_type: string | null;
  contact_id: string;
  contact_name: string | null;
  contact_role: string | null;
  contact_class_name: string | null;
  contact_avatar_url: string | null;

  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  last_message_is_mine: boolean | null;

  unread_count: number | null;
  last_read_at: string | null;
  archived_at: string | null;
};

type ContactRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  class_name: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function initials(name: string | null) {
  const value = name?.trim();

  if (!value) {
    return "?";
  }

  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function roleLabel(role: string | null) {
  switch (role) {
    case "student":
      return "Élève";

    case "teacher":
      return "Enseignant";

    case "parent":
      return "Parent / Tuteur";

    case "admin":
      return "Administration";

    default:
      return "Utilisateur";
  }
}

function roleBadgeClass(role: string | null) {
  switch (role) {
    case "student":
      return "bg-blue-50 text-blue-700";

    case "teacher":
      return "bg-violet-50 text-violet-700";

    case "parent":
      return "bg-amber-50 text-amber-700";

    case "admin":
      return "bg-emerald-50 text-emerald-700";

    default:
      return "bg-gray-100 text-gray-600";
  }
}

function formatMessageDate(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

function formatFullDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMOJI_GROUPS = [
  {
    label: "Visages",
    emojis: [
      "😀", "😃", "😄", "😁", "😊", "😍",
      "🥰", "😎", "🤓", "🤩", "🥳", "😂",
      "🤣", "😉", "🙂", "😇", "🤔", "😅",
    ],
  },
  {
    label: "Gestes",
    emojis: [
      "👍", "👎", "👏", "🙌", "👌", "✌️",
      "🤝", "🙏", "💪", "👋", "🤞", "🫶",
    ],
  },
  {
    label: "École",
    emojis: [
      "📚", "📖", "✏️", "📝", "🎓", "🏫",
      "📐", "📏", "🧮", "🔬", "💡", "✅",
    ],
  },
  {
    label: "Symboles",
    emojis: [
      "❤️", "💙", "💚", "💛", "⭐", "✨",
      "🔥", "🎉", "🎯", "🏆", "💯", "🚀",
    ],
  },
] as const;

export default function MessagingPage() {
  const { user, loading: authLoading } = useAuth();

  const [conversations, setConversations] = useState<
    ConversationRow[]
  >([]);

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [selectedConversationId, setSelectedConversationId] =
    useState<string | null>(null);

  const [conversationSearch, setConversationSearch] =
    useState("");

    const [contactSearch, setContactSearch] = useState("");
    const [draft, setDraft] = useState("");

    const [emojiOpen, setEmojiOpen] = useState(false);

    const [newMessageOpen, setNewMessageOpen] =
        useState(false);

  const [loadingConversations, setLoadingConversations] =
    useState(true);

  const [loadingMessages, setLoadingMessages] =
    useState(false);

  const [loadingContacts, setLoadingContacts] =
    useState(false);

  const [creatingConversation, setCreatingConversation] =
    useState(false);

  const [sending, setSending] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [contactError, setContactError] =
    useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] =
        useState<MessageRow | null>(null);

    const [deletingMessageId, setDeletingMessageId] =
        useState<string | null>(null);

    const [deleteError, setDeleteError] =
        useState<string | null>(null);
    
    const [messageMenuId, setMessageMenuId] =
        useState<string | null>(null);

    const [
        hidingMessageId,
        setHidingMessageId,
    ] = useState<string | null>(null);

    const [
        conversationMenuOpen,
        setConversationMenuOpen,
    ] = useState(false);

    const [
        archiveConversationOpen,
        setArchiveConversationOpen,
    ] = useState(false);

    const [
        archivingConversation,
        setArchivingConversation,
    ] = useState(false);

    const [
        archiveConversationError,
        setArchiveConversationError,
    ] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const textareaRef =
        useRef<HTMLTextAreaElement | null>(null);

    const emojiAreaRef =
        useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (item) =>
          item.conversation_id ===
          selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );

  const filteredConversations = useMemo(() => {
    const query = conversationSearch
      .trim()
      .toLocaleLowerCase("fr");

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const searchable = [
        conversation.contact_name,
        roleLabel(conversation.contact_role),
        conversation.contact_class_name,
        conversation.last_message_body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr");

      return searchable.includes(query);
    });
  }, [conversationSearch, conversations]);

  const filteredContacts = useMemo(() => {
    const query = contactSearch
      .trim()
      .toLocaleLowerCase("fr");

    if (!query) {
      return contacts;
    }

    return contacts.filter((contact) => {
      const searchable = [
        contact.full_name,
        roleLabel(contact.role),
        contact.class_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr");

      return searchable.includes(query);
    });
  }, [contactSearch, contacts]);

  const loadConversations = useCallback(
    async (silent = false) => {
      if (!user || user.isDemo) {
        setConversations([]);
        setLoadingConversations(false);
        return;
      }

      try {
        if (!silent) {
          setLoadingConversations(true);
        }

        setError(null);

        const { data, error: rpcError } =
          await supabase.rpc(
            "chat_conversation_list",
          );

        if (rpcError) {
          throw rpcError;
        }

        const rows =
            (data ?? []) as unknown as ConversationRow[];

        const visibleRows =
            rows.filter(
                (row) => !row.archived_at,
            );

        setConversations(visibleRows);

        setSelectedConversationId((current) => {
            if (
                current &&
                visibleRows.some(
                (row) =>
                    row.conversation_id === current,
                )
            ) {
                return current;
            }

            return (
                visibleRows[0]?.conversation_id ??
                null
            );
        });
      } catch (err) {
        console.error(
          "[MessagingPage] loadConversations:",
          err,
        );

        setError(
          "Impossible de charger vos conversations.",
        );
      } finally {
        if (!silent) {
          setLoadingConversations(false);
        }
      }
    },
    [user],
  );

  const loadMessages = useCallback(
    async (
      conversationId: string,
      silent = false,
    ) => {
      if (!user || user.isDemo) {
        setMessages([]);
        return;
      }

      try {
        if (!silent) {
          setLoadingMessages(true);
        }

        setError(null);

        const { data, error: messagesError } =
            await supabase.rpc(
                "chat_message_list",
                {
                p_conversation_id: conversationId,
                },
        );

        if (messagesError) {
          throw messagesError;
        }

        const rows =
          (data ?? []) as unknown as MessageRow[];

        setMessages(rows);

        const { error: readError } =
          await supabase
            .from("chat_conversation_members")
            .update({
              last_read_at:
                new Date().toISOString(),
            })
            .eq(
              "conversation_id",
              conversationId,
            )
            .eq("user_id", user.id);

        if (readError) {
          console.warn(
            "[MessagingPage] mark read:",
            readError,
          );
        }

        void loadConversations(true);
      } catch (err) {
        console.error(
          "[MessagingPage] loadMessages:",
          err,
        );

        setError(
          "Impossible de charger les messages de cette conversation.",
        );
      } finally {
        if (!silent) {
          setLoadingMessages(false);
        }
      }
    },
    [loadConversations, user],
  );

  const loadContacts = useCallback(async () => {
    if (!user || user.isDemo) {
      setContacts([]);
      return;
    }

    try {
      setLoadingContacts(true);
      setContactError(null);

      const { data, error: contactsError } =
        await supabase.rpc(
          "chat_available_contacts",
        );

      if (contactsError) {
        throw contactsError;
      }

      const rows =
        (data ?? []) as unknown as ContactRow[];

      setContacts(rows);
    } catch (err) {
      console.error(
        "[MessagingPage] loadContacts:",
        err,
      );

      setContactError(
        "Impossible de charger les utilisateurs disponibles.",
      );
    } finally {
      setLoadingContacts(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void loadConversations();
  }, [authLoading, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    void loadMessages(selectedConversationId);
  }, [
    loadMessages,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (!newMessageOpen) {
      return;
    }

    void loadContacts();
  }, [loadContacts, newMessageOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

    useEffect(() => {
        if (!emojiOpen) {
            return;
        }

        function handlePointerDown(
            event: MouseEvent,
        ) {
            const target = event.target as Node;

            if (
            emojiAreaRef.current &&
            !emojiAreaRef.current.contains(target)
            ) {
            setEmojiOpen(false);
            }
        }

        document.addEventListener(
            "mousedown",
            handlePointerDown,
        );

        return () => {
            document.removeEventListener(
            "mousedown",
            handlePointerDown,
            );
        };
    }, [emojiOpen]);

    useEffect(() => {
        if (
            !messageMenuId &&
            !conversationMenuOpen
        ) {
            return;
        }

        function handleDocumentMouseDown(
            event: MouseEvent,
        ) {
            const target = event.target;

            if (!(target instanceof Element)) {
            return;
            }

            if (
            target.closest("[data-message-menu]") ||
            target.closest("[data-conversation-menu]")
            ) {
            return;
            }

            setMessageMenuId(null);
            setConversationMenuOpen(false);
        }

        document.addEventListener(
            "mousedown",
            handleDocumentMouseDown,
        );

        return () => {
            document.removeEventListener(
            "mousedown",
            handleDocumentMouseDown,
            );
        };
        }, [
        messageMenuId,
        conversationMenuOpen,
    ]);

  /*
   * Actualisation périodique légère de la liste.
   * Cela garantit que les badges de messages non lus
   * restent à jour même si Realtime n'est pas activé
   * côté Supabase.
   */
  useEffect(() => {
    if (!user || user.isDemo) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadConversations(true);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadConversations, user]);

  /*
   * Realtime sur la conversation actuellement ouverte.
   */
  useEffect(() => {
    if (
      !selectedConversationId ||
      !user ||
      user.isDemo
    ) {
      return;
    }

    const channel = supabase
      .channel(
        `schoolnet-chat-${selectedConversationId}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${selectedConversationId}`,
        },
        () => {
          void loadMessages(
            selectedConversationId,
            true,
          );
        },
      )

      .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "chat_messages",
                filter: `conversation_id=eq.${selectedConversationId}`,
            },
            (payload) => {
                const updatedMessage =
                payload.new as MessageRow;

                setMessages((current) =>
                current.map((message) =>
                    message.id === updatedMessage.id
                    ? updatedMessage
                    : message,
                ),
                );
            },
        )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [
    loadMessages,
    selectedConversationId,
    user,
  ]);

  async function openConversationWith(
    contact: ContactRow,
  ) {
    if (!user || user.isDemo) {
      return;
    }

    try {
      setCreatingConversation(true);
      setContactError(null);

      const {
        data,
        error: conversationError,
      } = await supabase.rpc(
        "chat_get_or_create_direct_conversation",
        {
          p_target_user_id: contact.id,
        },
      );

      if (conversationError) {
        throw conversationError;
      }

      if (typeof data !== "string") {
        throw new Error(
          "Identifiant de conversation invalide.",
        );
      }

        const {
            error: restoreError,
            } = await supabase.rpc(
            "chat_restore_conversation_for_me",
            {
                p_conversation_id: data,
            },
            );

            if (restoreError) {
            throw restoreError;
        }

      await loadConversations(true);

      setSelectedConversationId(data);
      setNewMessageOpen(false);
      setContactSearch("");
    } catch (err) {
      console.error(
        "[MessagingPage] create conversation:",
        err,
      );

      setContactError(
        "Impossible d'ouvrir cette conversation.",
      );
    } finally {
      setCreatingConversation(false);
    }
  }

    function insertEmoji(emoji: string) {
        const textarea = textareaRef.current;

        const start =
            textarea?.selectionStart ?? draft.length;

        const end =
            textarea?.selectionEnd ?? start;

        const nextDraft = [
            draft.slice(0, start),
            emoji,
            draft.slice(end),
        ]
            .join("")
            .slice(0, 4000);

        setDraft(nextDraft);

        const nextCursorPosition =
            Math.min(
            start + emoji.length,
            nextDraft.length,
            );

        window.requestAnimationFrame(() => {
            textareaRef.current?.focus();

            textareaRef.current?.setSelectionRange(
            nextCursorPosition,
            nextCursorPosition,
            );
        });
    }

    async function hideMessageForMe(
        message: MessageRow,
    ) {
        if (
            !user ||
            user.isDemo ||
            hidingMessageId
        ) {
            return;
        }

        try {
            setHidingMessageId(message.id);
            setError(null);
            setMessageMenuId(null);

            const {
            data,
            error: hideError,
            } = await supabase.rpc(
            "chat_hide_message_for_me",
            {
                p_message_id: message.id,
            },
            );

            if (hideError) {
            throw hideError;
            }

            if (data !== true) {
            throw new Error(
                "Le message n'a pas pu être masqué.",
            );
            }

            setMessages((current) =>
            current.filter(
                (currentMessage) =>
                currentMessage.id !== message.id,
            ),
            );
        } catch (err) {
            console.error(
            "[MessagingPage] hide message:",
            err,
            );

            setError(
            "Impossible de supprimer ce message pour vous.",
            );
        } finally {
            setHidingMessageId(null);
        }
    }

async function archiveConversationForMe() {
  if (
    !selectedConversationId ||
    !user ||
    user.isDemo ||
    archivingConversation
  ) {
    return;
  }

  const conversationId =
    selectedConversationId;

  try {
    setArchivingConversation(true);
    setArchiveConversationError(null);

    const {
      data,
      error: archiveError,
    } = await supabase.rpc(
      "chat_archive_conversation_for_me",
      {
        p_conversation_id:
          conversationId,
      },
    );

    if (archiveError) {
      throw archiveError;
    }

    if (data !== true) {
      throw new Error(
        "La conversation n'a pas pu être supprimée.",
      );
    }

    setConversations((current) =>
      current.filter(
        (conversation) =>
          conversation.conversation_id !==
          conversationId,
      ),
    );

    setSelectedConversationId(null);
    setMessages([]);

    setArchiveConversationOpen(false);
    setConversationMenuOpen(false);

    await loadConversations(true);
  } catch (err) {
    console.error(
      "[MessagingPage] archive conversation:",
      err,
    );

    setArchiveConversationError(
      "Impossible de supprimer cette conversation.",
    );
  } finally {
    setArchivingConversation(false);
  }
}

    async function confirmDeleteMessage() {
        if (
            !deleteTarget ||
            !user ||
            user.isDemo
        ) {
            return;
        }

        if (
            deleteTarget.sender_id !== user.id ||
            deleteTarget.deleted_at
        ) {
            setDeleteTarget(null);
            return;
        }

        try {
            setDeletingMessageId(deleteTarget.id);
            setDeleteError(null);

            const {
            data,
            error,
            } = await supabase.rpc(
            "chat_delete_own_message",
            {
                p_message_id: deleteTarget.id,
            },
            );

            if (error) {
            throw error;
            }

            if (data !== true) {
            throw new Error(
                "Le message n’a pas pu être supprimé.",
            );
            }

            /*
            * Mise à jour locale immédiate.
            * Le Realtime fera la même chose chez
            * l'autre utilisateur.
            */
            const deletedAt =
            new Date().toISOString();

            setMessages((current) =>
            current.map((message) =>
                message.id === deleteTarget.id
                ? {
                    ...message,
                    body: "Message supprimé",
                    deleted_at: deletedAt,
                    }
                : message,
            ),
            );

            void loadConversations(true);
            setDeleteTarget(null);
        } catch (err) {
            console.error(
            "[MessagingPage] delete message:",
            err,
            );

            setDeleteError(
            err instanceof Error
                ? err.message
                : "Impossible de supprimer ce message.",
            );
        } finally {
            setDeletingMessageId(null);
        }
    }

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const body = draft.trim();

    if (
      !body ||
      !selectedConversationId ||
      !user ||
      user.isDemo ||
      sending
    ) {
      return;
    }

    try {
      setSending(true);
      setError(null);

      const { error: sendError } =
        await supabase
          .from("chat_messages")
          .insert({
            conversation_id:
              selectedConversationId,
            sender_id: user.id,
            body,
          });

      if (sendError) {
        throw sendError;
      }

      setDraft("");

      setEmojiOpen(false);

      await loadMessages(
        selectedConversationId,
        true,
      );

      void loadConversations(true);
    } catch (err) {
      console.error(
        "[MessagingPage] sendMessage:",
        err,
      );

      setError(
        "Le message n'a pas pu être envoyé.",
      );
    } finally {
      setSending(false);
    }
  }

  if (authLoading) {
    return (
      <div className="sn-card flex min-h-[420px] items-center justify-center">
        <div className="text-sm text-gray-500">
          Chargement de la messagerie...
        </div>
      </div>
    );
  }

  if (user?.isDemo) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Messagerie
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Échangez avec les membres autorisés de
            SchoolNet.
          </p>
        </div>

        <div className="sn-card border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
          La messagerie réelle est désactivée en mode
          démonstration.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
              <MessageIcon />
            </div>

            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Messagerie
              </h1>

              <p className="mt-0.5 text-sm text-gray-500">
                Échangez simplement et en toute
                sécurité sur SchoolNet.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void loadConversations()
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          >
            <RefreshIcon />
            Actualiser
          </button>

          <button
            type="button"
            onClick={() =>
              setNewMessageOpen(true)
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
          >
            <PlusIcon />
            Nouveau message
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Interface principale */}
      <div className="overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-sm">
        <div className="grid min-h-[620px] lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Colonne conversations */}
          <aside className="border-b border-gray-200 bg-white lg:border-b-0 lg:border-r">
            <div className="border-b border-gray-100 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    Conversations
                  </h2>

                  <p className="mt-1 text-xs text-gray-500">
                    {conversations.length}{" "}
                    {conversations.length > 1
                      ? "conversations"
                      : "conversation"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setNewMessageOpen(true)
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition hover:bg-blue-100"
                  aria-label="Nouveau message"
                >
                  <PlusIcon />
                </button>
              </div>

              <div className="relative mt-4">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <SearchIcon />
                </div>

                <input
                  type="search"
                  value={conversationSearch}
                  onChange={(event) =>
                    setConversationSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Rechercher une conversation..."
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </div>

            <div className="max-h-[535px] overflow-y-auto">
              {loadingConversations ? (
                <div className="space-y-2 p-3">
                  {Array.from({
                    length: 5,
                  }).map((_, index) => (
                    <div
                      key={index}
                      className="flex animate-pulse gap-3 rounded-2xl p-3"
                    >
                      <div className="h-11 w-11 rounded-full bg-gray-200" />

                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 w-1/2 rounded bg-gray-200" />
                        <div className="h-3 w-4/5 rounded bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length ===
                0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center px-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-500">
                    <MessageIcon />
                  </div>

                  <div className="mt-4 font-semibold text-gray-900">
                    Aucune conversation
                  </div>

                  <p className="mt-1 text-sm leading-6 text-gray-500">
                    Commencez un nouvel échange avec
                    un utilisateur autorisé.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setNewMessageOpen(true)
                    }
                    className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Démarrer une conversation
                  </button>
                </div>
              ) : (
                <div className="p-2">
                  {filteredConversations.map(
                    (conversation) => {
                      const selected =
                        conversation.conversation_id ===
                        selectedConversationId;

                      const unread =
                        Number(
                          conversation.unread_count ??
                            0,
                        ) > 0;

                      return (
                        <button
                          key={
                            conversation.conversation_id
                          }
                          type="button"
                          onClick={() =>
                            setSelectedConversationId(
                              conversation.conversation_id,
                            )
                          }
                          className={[
                            "group flex w-full items-start gap-3 rounded-2xl p-3 text-left transition",
                            selected
                              ? "bg-blue-50 ring-1 ring-blue-100"
                              : "hover:bg-gray-50",
                          ].join(" ")}
                        >
                          <div className="relative shrink-0">
                            {conversation.contact_avatar_url ? (
                              <img
                                src={
                                  conversation.contact_avatar_url
                                }
                                alt=""
                                className="h-11 w-11 rounded-full object-cover"
                              />
                            ) : (
                              <div
                                className={[
                                  "flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold",
                                  selected
                                    ? "bg-blue-600 text-white"
                                    : "bg-blue-50 text-blue-600",
                                ].join(" ")}
                              >
                                {initials(
                                  conversation.contact_name,
                                )}
                              </div>
                            )}

                            {unread && (
                              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-blue-500" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div
                                className={[
                                  "min-w-0 flex-1 truncate text-sm",
                                  unread
                                    ? "font-bold text-gray-950"
                                    : "font-semibold text-gray-900",
                                ].join(" ")}
                              >
                                {conversation.contact_name ||
                                  "Utilisateur"}
                              </div>

                              <div className="shrink-0 text-[11px] text-gray-400">
                                {formatMessageDate(
                                  conversation.last_message_at,
                                )}
                              </div>
                            </div>

                            <div className="mt-1 flex items-center gap-2">
                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  roleBadgeClass(
                                    conversation.contact_role,
                                  ),
                                ].join(" ")}
                              >
                                {roleLabel(
                                  conversation.contact_role,
                                )}
                              </span>

                              {conversation.contact_class_name && (
                                <span className="truncate text-[11px] text-gray-400">
                                  {
                                    conversation.contact_class_name
                                  }
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex items-center gap-2">
                              <p
                                className={[
                                  "min-w-0 flex-1 truncate text-xs",
                                  unread
                                    ? "font-semibold text-gray-700"
                                    : "text-gray-500",
                                ].join(" ")}
                              >
                                {conversation.last_message_body
                                  ? `${
                                      conversation.last_message_is_mine
                                        ? "Vous : "
                                        : ""
                                    }${
                                      conversation.last_message_body
                                    }`
                                  : "Nouvelle conversation"}
                              </p>

                              {unread && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                                  {Number(
                                    conversation.unread_count,
                                  ) > 99
                                    ? "99+"
                                    : conversation.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* Conversation */}
          <section className="flex min-h-[620px] min-w-0 flex-col bg-gray-50/70">
            {!selectedConversation ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="relative">
                  <div className="absolute inset-0 scale-125 rounded-full bg-blue-100 blur-2xl" />

                  <div className="relative flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-xl shadow-blue-200">
                    <MessageIcon />
                  </div>
                </div>

                <h2 className="mt-6 text-xl font-semibold text-gray-900">
                  Votre messagerie SchoolNet
                </h2>

                <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                  Sélectionnez une conversation ou
                  démarrez un nouvel échange avec un
                  membre autorisé.
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setNewMessageOpen(true)
                  }
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
                >
                  <PlusIcon />
                  Nouveau message
                </button>
              </div>
            ) : (
              <>
                {/* En-tête de conversation */}
                <div className="flex min-h-[82px] items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {selectedConversation.contact_avatar_url ? (
                      <img
                        src={
                          selectedConversation.contact_avatar_url
                        }
                        alt=""
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white shadow-md shadow-blue-100">
                        {initials(
                          selectedConversation.contact_name,
                        )}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-950">
                        {selectedConversation.contact_name ||
                          "Utilisateur"}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            roleBadgeClass(
                              selectedConversation.contact_role,
                            ),
                          ].join(" ")}
                        >
                          {roleLabel(
                            selectedConversation.contact_role,
                          )}
                        </span>

                        {selectedConversation.contact_class_name && (
                          <span className="text-xs text-gray-400">
                            {
                              selectedConversation.contact_class_name
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                     <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() =>
                            void loadMessages(
                                selectedConversation.conversation_id,
                            )
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-blue-600"
                            aria-label="Actualiser la conversation"
                        >
                            <RefreshIcon />
                        </button>

                        <div
                            data-conversation-menu
                            className="relative"
                        >
                            <button
                            type="button"
                            onClick={() => {
                                setConversationMenuOpen(
                                (current) => !current,
                                );
                                setMessageMenuId(null);
                            }}
                            className={[
                                "flex h-9 w-9 items-center justify-center",
                                "rounded-xl border border-gray-200",
                                "bg-white text-lg font-bold text-gray-500",
                                "transition hover:border-blue-200",
                                "hover:bg-blue-50 hover:text-blue-600",
                                conversationMenuOpen
                                ? "border-blue-200 bg-blue-50 text-blue-600"
                                : "",
                            ].join(" ")}
                            aria-label="Options de la conversation"
                            aria-expanded={conversationMenuOpen}
                            >
                            ⋯
                            </button>

                            {conversationMenuOpen && (
                            <div
                                className="
                                absolute right-0 top-11 z-50
                                w-64 overflow-hidden
                                rounded-2xl border border-gray-200
                                bg-white p-2
                                shadow-[0_18px_55px_rgba(15,23,42,0.18)]
                                "
                            >
                                <div className="px-3 pb-2 pt-1">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                    Conversation
                                </div>
                                </div>

                                <button
                                type="button"
                                onClick={() => {
                                    setConversationMenuOpen(false);
                                    setArchiveConversationError(null);
                                    setArchiveConversationOpen(true);
                                }}
                                className="
                                    flex w-full items-center gap-3
                                    rounded-xl px-3 py-2.5
                                    text-left text-sm font-medium
                                    text-red-600 transition
                                    hover:bg-red-50
                                "
                                >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                                    🗑️
                                </span>

                                <span>
                                    Supprimer la conversation
                                </span>
                                </button>
                            </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <div className="relative flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-blue-50/30 px-4 py-6 sm:px-6">
                  {loadingMessages ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-full bg-white px-4 py-2 text-sm text-gray-500 shadow-sm">
                        Chargement des messages...
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-500 shadow-sm ring-1 ring-gray-100">
                        <MessageIcon />
                      </div>

                      <div className="mt-4 font-semibold text-gray-900">
                        Commencez la conversation
                      </div>

                      <p className="mt-1 max-w-sm text-sm leading-6 text-gray-500">
                        Envoyez votre premier message
                        à{" "}
                        {selectedConversation.contact_name ||
                          "cet utilisateur"}
                        .
                      </p>
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl space-y-3">
                        {messages.map((message) => {
                            const isMine =
                            message.sender_id === user?.id;

                            const isDeleted =
                            Boolean(message.deleted_at);

                            const isHiding =
                            hidingMessageId === message.id;

                            const messageMenu = (
                            <div
                                data-message-menu
                                className="relative mt-1 shrink-0"
                            >
                                <button
                                type="button"
                                onClick={() => {
                                    setMessageMenuId((current) =>
                                    current === message.id
                                        ? null
                                        : message.id,
                                    );

                                    setConversationMenuOpen(false);
                                }}
                                className={[
                                    "flex h-8 w-8 items-center justify-center",
                                    "rounded-xl text-base font-bold text-gray-400",
                                    "transition hover:bg-white hover:text-gray-700",
                                    "hover:shadow-sm",
                                    "opacity-0 group-hover:opacity-100",
                                    "focus:opacity-100",
                                    "max-md:opacity-100",
                                    messageMenuId === message.id
                                    ? "bg-white text-gray-700 opacity-100 shadow-sm"
                                    : "",
                                ].join(" ")}
                                aria-label="Options du message"
                                aria-expanded={
                                    messageMenuId === message.id
                                }
                                >
                                ⋯
                                </button>

                                {messageMenuId === message.id && (
                                <div
                                    className={[
                                    "absolute top-9 z-50 w-56",
                                    "overflow-hidden rounded-2xl",
                                    "border border-gray-200",
                                    "bg-white p-2",
                                    "shadow-[0_18px_55px_rgba(15,23,42,0.18)]",
                                    isMine
                                        ? "right-0"
                                        : "left-0",
                                    ].join(" ")}
                                >
                                    <button
                                    type="button"
                                    disabled={isHiding}
                                    onClick={() =>
                                        void hideMessageForMe(
                                        message,
                                        )
                                    }
                                    className="
                                        flex w-full items-center gap-3
                                        rounded-xl px-3 py-2.5
                                        text-left text-sm font-medium
                                        text-gray-700 transition
                                        hover:bg-gray-50
                                        disabled:cursor-not-allowed
                                        disabled:opacity-50
                                    "
                                    >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                                        👁️‍🗨️
                                    </span>

                                    <span>
                                        {isHiding
                                        ? "Suppression..."
                                        : "Supprimer pour moi"}
                                    </span>
                                    </button>

                                    {isMine && !isDeleted && (
                                    <>
                                        <div className="my-1 h-px bg-gray-100" />

                                        <button
                                        type="button"
                                        onClick={() => {
                                            setDeleteError(null);
                                            setDeleteTarget(message);
                                            setMessageMenuId(null);
                                        }}
                                        className="
                                            flex w-full items-center gap-3
                                            rounded-xl px-3 py-2.5
                                            text-left text-sm font-medium
                                            text-red-600 transition
                                            hover:bg-red-50
                                        "
                                        >
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                                            🗑️
                                        </span>

                                        <span>
                                            Supprimer pour tous
                                        </span>
                                        </button>
                                    </>
                                    )}
                                </div>
                                )}
                            </div>
                            );

                            return (
                            <div
                                key={message.id}
                                className={[
                                "group flex items-start gap-2",
                                isMine
                                    ? "justify-end"
                                    : "justify-start",
                                ].join(" ")}
                            >
                                {isMine && messageMenu}

                                <div className="max-w-[82%] sm:max-w-[72%]">
                                <div
                                    className={[
                                    "rounded-2xl px-4 py-3",
                                    "text-sm leading-6 shadow-sm",
                                    isDeleted
                                        ? "border border-gray-200 bg-white text-gray-400"
                                        : isMine
                                        ? "rounded-br-md bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
                                        : "rounded-bl-md border border-gray-100 bg-white text-gray-800",
                                    ].join(" ")}
                                >
                                    <div className="whitespace-pre-wrap break-words">
                                    {isDeleted ? (
                                        <span className="flex items-center gap-2 italic text-gray-400">
                                        <span>🗑️</span>

                                        <span>
                                            Ce message a été supprimé.
                                        </span>
                                        </span>
                                    ) : (
                                        message.body
                                    )}
                                    </div>
                                </div>

                                <div
                                    className={[
                                    "mt-1 flex items-center gap-1",
                                    "px-1 text-[10px] text-gray-400",
                                    isMine
                                        ? "justify-end"
                                        : "justify-start",
                                    ].join(" ")}
                                    title={formatFullDate(
                                    message.created_at,
                                    )}
                                >
                                    {formatFullDate(
                                    message.created_at,
                                    )}

                                    {message.edited_at &&
                                    !isDeleted && (
                                        <span>· modifié</span>
                                    )}
                                </div>
                                </div>

                                {!isMine && messageMenu}
                            </div>
                            );
                        })}

                        <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Saisie */}
                <form
                  onSubmit={sendMessage}
                  className="border-t border-gray-200 bg-white p-4"
                >
                  <div className="mx-auto max-w-4xl">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-2 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50">
                      <textarea
                        ref={textareaRef}
                        value={draft}
                        onChange={(event) =>
                          setDraft(
                            event.target.value.slice(
                              0,
                              4000,
                            ),
                          )
                        }
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey
                          ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        maxLength={4000}
                        rows={2}
                        placeholder={`Écrire à ${
                          selectedConversation.contact_name ||
                          "votre contact"
                        }...`}
                        className="max-h-36 min-h-[56px] w-full resize-none bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400"
                        aria-label="Votre message"
                      />

                      <div className="flex items-center justify-between gap-3 px-2 pb-1">
                            <div className="flex min-w-0 items-center gap-2">
                                <div
                                ref={emojiAreaRef}
                                className="relative shrink-0"
                                >
                                <button
                                    type="button"
                                    onClick={() =>
                                    setEmojiOpen((current) => !current)
                                    }
                                    className={[
                                    "flex h-9 w-9 items-center justify-center",
                                    "rounded-xl border text-lg transition",
                                    emojiOpen
                                        ? "border-blue-200 bg-blue-50 shadow-sm"
                                        : "border-transparent text-gray-500 hover:border-gray-200 hover:bg-white",
                                    ].join(" ")}
                                    aria-label="Ajouter un émoji"
                                    aria-expanded={emojiOpen}
                                >
                                    😊
                                </button>

                                {emojiOpen && (
                                    <div
                                    className="
                                        absolute bottom-12 left-0 z-50
                                        w-[320px]
                                        overflow-hidden
                                        rounded-2xl
                                        border border-gray-200
                                        bg-white
                                        shadow-[0_18px_55px_rgba(15,23,42,0.18)]
                                    "
                                    >
                                    <div className="border-b border-gray-100 px-4 py-3">
                                        <div className="text-sm font-semibold text-gray-900">
                                        Émojis
                                        </div>

                                        <div className="mt-0.5 text-xs text-gray-400">
                                        Ajoutez une touche personnelle à votre message.
                                        </div>
                                    </div>

                                    <div className="max-h-[300px] overflow-y-auto p-3">
                                        {EMOJI_GROUPS.map((group) => (
                                        <div
                                            key={group.label}
                                            className="mb-4 last:mb-0"
                                        >
                                            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                            {group.label}
                                            </div>

                                            <div className="grid grid-cols-6 gap-1">
                                            {group.emojis.map((emoji) => (
                                                <button
                                                key={emoji}
                                                type="button"
                                                onClick={() =>
                                                    insertEmoji(emoji)
                                                }
                                                className="
                                                    flex h-10 w-10
                                                    items-center justify-center
                                                    rounded-xl
                                                    text-xl
                                                    transition
                                                    hover:scale-110
                                                    hover:bg-blue-50
                                                "
                                                aria-label={`Ajouter ${emoji}`}
                                                >
                                                {emoji}
                                                </button>
                                            ))}
                                            </div>
                                        </div>
                                        ))}
                                    </div>
                                    </div>
                                )}
                                </div>

                                <div className="truncate text-[11px] text-gray-400">
                                Entrée pour envoyer ·
                                Maj+Entrée pour une nouvelle ligne
                                </div>
                            </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-400">
                            {draft.length}/4000
                          </span>

                          <button
                            type="submit"
                            disabled={
                              !draft.trim() ||
                              sending
                            }
                            className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="hidden sm:inline">
                              {sending
                                ? "Envoi..."
                                : "Envoyer"}
                            </span>

                            <SendIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>

        {/* Confirmation suppression conversation */}
        {archiveConversationOpen &&
        selectedConversation && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-[26px] border border-white/60 bg-white shadow-2xl">
                <div className="p-6">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-xl">
                    🗑️
                    </div>

                    <div className="min-w-0">
                    <div className="text-lg font-semibold text-gray-950">
                        Supprimer la conversation ?
                    </div>

                    <p className="mt-1 text-sm leading-6 text-gray-500">
                        Cette conversation sera retirée
                        uniquement de votre messagerie.
                    </p>
                    </div>
                </div>

                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Conversation avec
                    </div>

                    <div className="mt-1 font-semibold text-gray-900">
                    {selectedConversation.contact_name ||
                        "Utilisateur"}
                    </div>

                    <p className="mt-2 text-xs leading-5 text-gray-500">
                    L'autre participant conservera son
                    historique. La conversation pourra
                    réapparaître si un nouveau message
                    est envoyé.
                    </p>
                </div>

                {archiveConversationError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {archiveConversationError}
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button
                    type="button"
                    disabled={archivingConversation}
                    onClick={() => {
                        setArchiveConversationOpen(false);
                        setArchiveConversationError(null);
                    }}
                    className="
                        rounded-xl bg-gray-100
                        px-4 py-2.5 text-sm font-semibold
                        text-gray-700 transition
                        hover:bg-gray-200
                        disabled:opacity-50
                    "
                    >
                    Annuler
                    </button>

                    <button
                    type="button"
                    disabled={archivingConversation}
                    onClick={() =>
                        void archiveConversationForMe()
                    }
                    className="
                        rounded-xl bg-red-600
                        px-4 py-2.5 text-sm font-semibold
                        text-white shadow-md shadow-red-100
                        transition hover:bg-red-700
                        disabled:cursor-not-allowed
                        disabled:opacity-50
                    "
                    >
                    {archivingConversation
                        ? "Suppression..."
                        : "Supprimer la conversation"}
                    </button>
                </div>
                </div>
            </div>
            </div>
        )}   

      {/* Fenêtre nouveau message */}
      {newMessageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-[24px] border border-white/60 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-lg font-semibold text-gray-950">
                  Nouveau message
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Choisissez un utilisateur autorisé.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setNewMessageOpen(false);
                  setContactSearch("");
                  setContactError(null);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                aria-label="Fermer"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="p-5">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <SearchIcon />
                </div>

                <input
                  autoFocus
                  type="search"
                  value={contactSearch}
                  onChange={(event) =>
                    setContactSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Rechercher un utilisateur..."
                  className="h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </div>

              {contactError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {contactError}
                </div>
              )}

              <div className="mt-4 max-h-[430px] overflow-y-auto">
                {loadingContacts ? (
                  <div className="space-y-2">
                    {Array.from({
                      length: 4,
                    }).map((_, index) => (
                      <div
                        key={index}
                        className="flex animate-pulse items-center gap-3 rounded-2xl p-3"
                      >
                        <div className="h-11 w-11 rounded-full bg-gray-200" />

                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-1/3 rounded bg-gray-200" />
                          <div className="h-3 w-1/5 rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="py-14 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
                      <SearchIcon />
                    </div>

                    <div className="mt-3 font-medium text-gray-800">
                      Aucun contact disponible
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      Aucun utilisateur autorisé ne
                      correspond à votre recherche.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredContacts.map(
                      (contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          disabled={
                            creatingConversation
                          }
                          onClick={() =>
                            void openConversationWith(
                              contact,
                            )
                          }
                          className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-blue-50 disabled:opacity-50"
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                            {initials(
                              contact.full_name,
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {contact.full_name ||
                                "Utilisateur"}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  roleBadgeClass(
                                    contact.role,
                                  ),
                                ].join(" ")}
                              >
                                {roleLabel(
                                  contact.role,
                                )}
                              </span>

                              {contact.class_name && (
                                <span className="text-xs text-gray-400">
                                  {contact.class_name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-sm font-semibold text-blue-600">
                            Écrire
                          </div>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation de suppression */}
      {deleteTarget && (
        <div
          className="
            fixed inset-0 z-[100]
            flex items-center justify-center
            bg-slate-950/35
            p-4 backdrop-blur-[2px]
          "
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-message-title"
        >
          <div
            className="
              w-full max-w-md
              rounded-3xl
              border border-gray-200
              bg-white
              p-6
              shadow-[0_25px_80px_rgba(15,23,42,0.25)]
            "
          >
            <div className="flex items-start gap-4">
              <div
                className="
                  flex h-12 w-12 shrink-0
                  items-center justify-center
                  rounded-2xl
                  bg-red-50
                  text-xl
                "
              >
                🗑️
              </div>

              <div className="min-w-0 flex-1">
                <div
                  id="delete-message-title"
                  className="text-lg font-bold text-gray-900"
                >
                  Supprimer ce message ?
                </div>

                <div className="mt-1 text-sm leading-6 text-gray-500">
                  Le message sera supprimé pour tous les
                  participants de la conversation.
                </div>
              </div>
            </div>

            <div
              className="
                mt-5 max-h-32 overflow-y-auto
                whitespace-pre-wrap break-words
                rounded-2xl
                border border-gray-100
                bg-gray-50
                p-4
                text-sm text-gray-600
              "
            >
              {deleteTarget.body}
            </div>

            {deleteError && (
              <div
                className="
                  mt-4 rounded-xl
                  border border-red-200
                  bg-red-50
                  px-4 py-3
                  text-sm text-red-700
                "
              >
                {deleteError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="sn-btn-ghost"
                disabled={deletingMessageId !== null}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
              >
                Annuler
              </button>

              <button
                type="button"
                disabled={deletingMessageId !== null}
                onClick={() =>
                  void confirmDeleteMessage()
                }
                className="
                  rounded-xl
                  bg-red-600
                  px-4 py-2.5
                  text-sm font-semibold text-white
                  shadow-sm
                  transition
                  hover:bg-red-700
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                "
              >
                {deletingMessageId
                  ? "Suppression..."
                  : "Supprimer pour tous"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}