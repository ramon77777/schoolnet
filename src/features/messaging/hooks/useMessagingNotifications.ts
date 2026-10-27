import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth/AuthProvider";

type ConversationSummaryRow = {
  conversation_id: string;
  contact_id: string;
  contact_name: string | null;
  contact_role: string | null;

  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  last_message_is_mine: boolean | null;

  unread_count: number | null;
};

type RealtimeMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type MessagingIncomingAlert = {
  messageId: string;
  conversationId: string;
  senderName: string;
  body: string;
};

function normalizeCount(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? Math.max(0, numberValue)
    : 0;
}

function messagePreview(body: string) {
  const cleanBody = body.trim();

  if (cleanBody.length <= 100) {
    return cleanBody;
  }

  return `${cleanBody.slice(0, 97)}...`;
}

export function useMessagingNotifications() {
  const { user } = useAuth();

  const [unreadCount, setUnreadCount] = useState(0);

  const [incomingAlert, setIncomingAlert] =
    useState<MessagingIncomingAlert | null>(null);

  const [realtimeConnected, setRealtimeConnected] =
    useState(false);

  const lastNotifiedMessageIdRef =
    useRef<string | null>(null);

  const loadConversationSummary =
    useCallback(async () => {
      if (!user || user.isDemo) {
        setUnreadCount(0);
        return [] as ConversationSummaryRow[];
      }

      const { data, error } = await supabase.rpc(
        "chat_conversation_list",
      );

      if (error) {
        console.error(
          "[MessagingNotifications] conversation list:",
          error,
        );

        return [] as ConversationSummaryRow[];
      }

      const rows = (data ?? []) as unknown as
        ConversationSummaryRow[];

      const totalUnread = rows.reduce(
        (total, row) =>
          total + normalizeCount(row.unread_count),
        0,
      );

      setUnreadCount(totalUnread);

      return rows;
    }, [user]);

  const refreshUnreadCount = useCallback(async () => {
    await loadConversationSummary();
  }, [loadConversationSummary]);

  const dismissIncomingAlert = useCallback(() => {
    setIncomingAlert(null);
  }, []);

  const requestBrowserNotificationPermission =
    useCallback(async () => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window)
      ) {
        return "unsupported" as const;
      }

      if (Notification.permission === "granted") {
        return "granted" as const;
      }

      if (Notification.permission === "denied") {
        return "denied" as const;
      }

      const permission =
        await Notification.requestPermission();

      return permission;
    }, []);

  const showBrowserNotification = useCallback(
    (
      senderName: string,
      body: string,
      conversationId: string,
    ) => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window)
      ) {
        return;
      }

      if (Notification.permission !== "granted") {
        return;
      }

      const notification = new Notification(
        `Nouveau message de ${senderName}`,
        {
          body: messagePreview(body),
          tag: `schoolnet-message-${conversationId}`,
        },
      );

      notification.onclick = () => {
        window.focus();

        notification.close();
      };
    },
    [],
  );

    const emitIncomingAlertFromSummary = useCallback(
        (rows: ConversationSummaryRow[]) => {
            if (!user || user.isDemo) {
            return;
            }

            const candidates = rows.filter((row) => {
            return (
                normalizeCount(row.unread_count) > 0 &&
                Boolean(row.last_message_id) &&
                row.last_message_is_mine !== true &&
                row.last_message_sender_id !== user.id
            );
            });

            const candidate =
            candidates.reduce<ConversationSummaryRow | null>(
                (latest, row) => {
                if (!latest) {
                    return row;
                }

                const rowTime = row.last_message_at
                    ? new Date(row.last_message_at).getTime()
                    : 0;

                const latestTime = latest.last_message_at
                    ? new Date(latest.last_message_at).getTime()
                    : 0;

                return rowTime > latestTime
                    ? row
                    : latest;
                },
                null,
            );

            if (
            !candidate ||
            !candidate.last_message_id
            ) {
            return;
            }

            /*
            * Si le listener INSERT a déjà traité
            * ce message, on ne crée pas une deuxième alerte.
            */
            if (
            lastNotifiedMessageIdRef.current ===
            candidate.last_message_id
            ) {
            return;
            }

            lastNotifiedMessageIdRef.current =
            candidate.last_message_id;

            const senderName =
            candidate.contact_name?.trim() ||
            "Un utilisateur";

            const body =
            candidate.last_message_body?.trim() ||
            "Vous avez reçu un nouveau message.";

            setIncomingAlert({
            messageId: candidate.last_message_id,
            conversationId:
                candidate.conversation_id,
            senderName,
            body,
            });

            /*
            * Notification système uniquement si
            * SchoolNet n'est pas actuellement visible.
            */
            if (
            typeof document !== "undefined" &&
            document.visibilityState !== "visible"
            ) {
            showBrowserNotification(
                senderName,
                body,
                candidate.conversation_id,
            );
            }
        },
        [
            showBrowserNotification,
            user,
        ],
    );

  useEffect(() => {
    if (!user || user.isDemo) {
        return;
    }

    const channel = supabase
      .channel(`schoolnet-messaging-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        async (payload) => {
          const message = payload.new as unknown as
            RealtimeMessageRow;

          if (!message?.id) {
            return;
          }

          /*
           * Ne jamais déclencher une alerte pour
           * son propre message.
           */
          if (message.sender_id === user.id) {
            await loadConversationSummary();
            return;
          }

          /*
           * Protection contre une éventuelle
           * double réception du même événement.
           */
          if (
            lastNotifiedMessageIdRef.current ===
            message.id
          ) {
            return;
          }

          lastNotifiedMessageIdRef.current =
            message.id;

          const conversations =
            await loadConversationSummary();

          const conversation = conversations.find(
            (item) =>
              item.conversation_id ===
              message.conversation_id,
          );

          const senderName =
            conversation?.contact_name?.trim() ||
            "Un utilisateur";

          const alert: MessagingIncomingAlert = {
            messageId: message.id,
            conversationId:
              message.conversation_id,
            senderName,
            body: message.body,
          };

          setIncomingAlert(alert);

          /*
           * Notification système surtout utile
           * lorsque l'utilisateur ne regarde pas
           * actuellement SchoolNet.
           */
          if (
            typeof document !== "undefined" &&
            document.visibilityState !== "visible"
          ) {
            showBrowserNotification(
              senderName,
              message.body,
              message.conversation_id,
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
            event: "UPDATE",
            schema: "public",
            table: "chat_conversation_members",
            filter: `user_id=eq.${user.id}`,
        },
        async () => {
            /*
            * Une modification de l'état de la conversation
            * déclenche le recalcul des messages non lus.
            *
            * Si l'événement INSERT du message n'a pas créé
            * l'alerte visuelle, le résumé de conversation
            * constitue ici notre mécanisme de secours.
            */
            const conversations =
            await loadConversationSummary();

            emitIncomingAlertFromSummary(
            conversations,
            );
        },
     )
        .subscribe((status, error) => {
            if (status === "SUBSCRIBED") {
                setRealtimeConnected(true);

                /*
                * Le premier chargement est effectué ici,
                * après confirmation de la connexion Realtime.
                * Cela évite un setState synchrone directement
                * dans le corps du useEffect.
                */
                void loadConversationSummary();

                return;
            }

            if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT"
            ) {
                console.error(
                "[MessagingNotifications] Realtime:",
                status,
                error,
                );

                setRealtimeConnected(false);
            }

            if (status === "CLOSED") {
                setRealtimeConnected(false);
            }
        });

    return () => {
      setRealtimeConnected(false);

      void supabase.removeChannel(channel);
    };
 }, [
    emitIncomingAlertFromSummary,
    loadConversationSummary,
    showBrowserNotification,
    user,
 ]);

    const messagingEnabled =
        Boolean(user && !user.isDemo);

        return {
        unreadCount: messagingEnabled
            ? unreadCount
            : 0,

        incomingAlert: messagingEnabled
            ? incomingAlert
            : null,

        realtimeConnected: messagingEnabled
            ? realtimeConnected
            : false,

        refreshUnreadCount,
        dismissIncomingAlert,
        requestBrowserNotificationPermission,
    };
}