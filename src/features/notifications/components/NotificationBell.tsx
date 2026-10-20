import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

type NotificationType = "info" | "warning" | "success" | "error";

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
  action_url: string | null;
  event_key: string | null;
  related_id: string | null;
  read_at: string | null;
};

function notificationIcon(type: NotificationType) {
  if (type === "success") return "✅";
  if (type === "warning") return "⚠️";
  if (type === "error") return "❌";
  return "ℹ️";
}

function formatNotificationDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!user || user.isDemo) {
      setNotifications([]);
      setUnreadCount(0);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [notificationsResult, unreadResult] = await Promise.all([
        supabase
          .from("notifications")
          .select(
            `
              id,
              user_id,
              title,
              body,
              type,
              is_read,
              created_at,
              action_url,
              event_key,
              related_id,
              read_at
            `
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("notifications")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("user_id", user.id)
          .eq("is_read", false),
      ]);

      if (notificationsResult.error) {
        throw notificationsResult.error;
      }

      if (unreadResult.error) {
        throw unreadResult.error;
      }

      setNotifications(
        (notificationsResult.data ?? []) as NotificationRow[]
      );

      setUnreadCount(unreadResult.count ?? 0);
    } catch (err) {
      console.error("[NotificationBell] loadNotifications error:", err);
      setError("Impossible de charger les notifications.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!user || user.isDemo) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void loadNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;

      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, []);

  const hasUnread = unreadCount > 0;

  const unreadLabel = useMemo(() => {
    if (unreadCount <= 0) return null;
    if (unreadCount > 99) return "99+";
    return String(unreadCount);
  }, [unreadCount]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user || user.isDemo) return;

      const notification = notifications.find(
        (item) => item.id === notificationId
      );

      if (!notification || notification.is_read) return;

      const { error: updateError } = await supabase
        .from("notifications")
        .update({
          is_read: true,
        })
        .eq("id", notificationId)
        .eq("user_id", user.id);

      if (updateError) {
        console.error(
          "[NotificationBell] markAsRead error:",
          updateError
        );
        return;
      }

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                is_read: true,
              }
            : item
        )
      );

      setUnreadCount((current) =>
        Math.max(0, current - 1)
      );
    },
    [notifications, user]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user || user.isDemo || unreadCount === 0) return;

    const { error: updateError } = await supabase
      .from("notifications")
      .update({
        is_read: true,
      })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (updateError) {
      console.error(
        "[NotificationBell] markAllAsRead error:",
        updateError
      );
      return;
    }

    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        is_read: true,
      }))
    );

    setUnreadCount(0);
  }, [user, unreadCount]);

  const openNotification = useCallback(
    async (notification: NotificationRow) => {
      await markAsRead(notification.id);

      setOpen(false);

      if (
        notification.action_url &&
        notification.action_url.startsWith("/app/")
      ) {
        navigate(notification.action_url);
      }
    },
    [markAsRead, navigate]
  );

  if (!user || user.isDemo) {
    return null;
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={[
          "relative h-10 w-10 rounded-full",
          "border border-gray-200 bg-white",
          "flex items-center justify-center",
          "transition hover:bg-gray-50",
          "sn-press",
        ].join(" ")}
        aria-label="Notifications"
        title="Notifications"
      >
        <span className="text-lg">🔔</span>

        {hasUnread && unreadLabel && (
          <span
            className={[
              "absolute -right-1 -top-1",
              "min-w-5 h-5 px-1",
              "rounded-full bg-red-500 text-white",
              "text-[10px] font-bold",
              "flex items-center justify-center",
              "border-2 border-white",
            ].join(" ")}
          >
            {unreadLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          className={[
            "absolute right-0 top-12 z-50",
            "w-[390px] max-w-[90vw]",
            "overflow-hidden rounded-2xl",
            "border border-gray-200 bg-white",
            "shadow-xl",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <div className="font-semibold text-gray-900">
                Notifications
              </div>

              <div className="text-xs text-gray-500">
                {unreadCount === 0
                  ? "Aucune notification non lue"
                  : `${unreadCount} notification${
                      unreadCount > 1 ? "s" : ""
                    } non lue${unreadCount > 1 ? "s" : ""}`}
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
                onClick={() => void markAllAsRead()}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="max-h-[430px] overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="p-5 text-center text-sm text-gray-500">
                Chargement…
              </div>
            )}

            {!loading && error && (
              <div className="p-4">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}

                  <button
                    type="button"
                    className="ml-2 font-semibold underline"
                    onClick={() => void loadNotifications()}
                  >
                    Réessayer
                  </button>
                </div>
              </div>
            )}

            {!loading &&
              !error &&
              notifications.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <div className="text-2xl">🔔</div>

                  <div className="mt-2 font-medium text-gray-700">
                    Aucune notification
                  </div>

                  <div className="mt-1 text-xs text-gray-500">
                    Les nouvelles informations SchoolNet
                    apparaîtront ici.
                  </div>
                </div>
              )}

            {!error &&
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() =>
                    void openNotification(notification)
                  }
                  className={[
                    "w-full border-b border-gray-100",
                    "px-4 py-3 text-left",
                    "transition hover:bg-gray-50",
                    notification.is_read
                      ? "bg-white"
                      : "bg-blue-50/60",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg">
                      {notificationIcon(notification.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={[
                            "text-sm text-gray-900",
                            notification.is_read
                              ? "font-medium"
                              : "font-semibold",
                          ].join(" ")}
                        >
                          {notification.title}
                        </div>

                        {!notification.is_read && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        )}
                      </div>

                      {notification.body && (
                        <div className="mt-1 text-xs leading-5 text-gray-600">
                          {notification.body}
                        </div>
                      )}

                      <div className="mt-2 text-[11px] text-gray-400">
                        {formatNotificationDate(
                          notification.created_at
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}