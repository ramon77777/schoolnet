import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: "info" | "warning" | "success" | "error";
  is_read: boolean;
  created_at: string;
  action_url: string | null;
  event_key: string | null;
  related_id: string | null;
  read_at: string | null;
};

type ReadFilter = "all" | "unread" | "read";
type CategoryFilter = "all" | "live" | "report_cards" | "enrollments";

const PAGE_SIZE = 12;
const FIELDS = "id, user_id, title, body, type, is_read, created_at, action_url, event_key, related_id, read_at";

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "Toutes les catégories" },
  { value: "live", label: "Cours en direct" },
  { value: "report_cards", label: "Bulletins" },
  { value: "enrollments", label: "Inscriptions" },
];

function notificationCategory(eventKey: string | null) {
  if (eventKey?.startsWith("schoolnet_live:")) return "Cours en direct";
  if (eventKey?.startsWith("report_card_published:")) return "Bulletins";
  if (eventKey?.startsWith("public_enrollment_request:")) return "Inscriptions";
  return "Informations";
}

function notificationIcon(type: NotificationRow["type"]) {
  if (type === "success") return "✅";
  if (type === "warning") return "⚠️";
  if (type === "error") return "❗";
  return "🔔";
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

function notificationTarget(notification: NotificationRow, role: string) {
  // Compatibilité avec les anciennes notifications parent SCHOOLNET LIVE.
  if (role === "parent" && notification.event_key?.startsWith("schoolnet_live:")) {
    return "/app/parent/live";
  }
  const target = notification.action_url;
  if (!target || !target.startsWith("/app/") || target.startsWith("/app//")) return null;
  // Les autorisations sont aussi vérifiées par les routes protégées.
  return target;
}

function cleanSearch(value: string) {
  // Supabase .or() utilise une grammaire PostgREST : retirer les délimiteurs.
  return value.trim().replace(/[(),.%*_"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function endOfDate(value: string) {
  const date = new Date(value + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<ReadFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;

    if (!user || user.isDemo) {
      setRows([]);
      setTotal(0);
      setUnreadCount(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      setError(null);
      let query = supabase
        .from("notifications")
        .select(FIELDS, { count: "exact" })
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (status !== "all") query = query.eq("is_read", status === "read");

      if (category === "live") query = query.like("event_key", "schoolnet_live:%");
      if (category === "report_cards") query = query.like("event_key", "report_card_published:%");
      if (category === "enrollments") query = query.like("event_key", "public_enrollment_request:%");

      const term = cleanSearch(debouncedSearch);
      if (term) query = query.or("title.ilike.%" + term + "%,body.ilike.%" + term + "%");
      if (fromDate) query = query.gte("created_at", fromDate + "T00:00:00.000Z");
      if (toDate) query = query.lt("created_at", endOfDate(toDate));

      const [notificationsResult, unreadResult] = await Promise.all([
        query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false),
      ]);

      if (notificationsResult.error) throw notificationsResult.error;
      if (unreadResult.error) throw unreadResult.error;
      if (requestId !== requestIdRef.current) return;

      const count = notificationsResult.count ?? 0;
      const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
      if (page > lastPage) {
        setPage(lastPage);
        return;
      }

      setRows((notificationsResult.data ?? []) as NotificationRow[]);
      setTotal(count);
      setUnreadCount(unreadResult.count ?? 0);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      console.error("[NotificationsPage] load error:", caught);
      setError("Impossible de charger vos notifications. Réessayez.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user, status, category, debouncedSearch, fromDate, toDate, page]);

  useEffect(() => {
    if (authLoading) return;
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [authLoading, load]);

  useEffect(() => {
    if (!user || user.isDemo) return;
    const channel = supabase
      .channel("notifications-page:" + user.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + user.id,
        },
        () => {
          void load(true);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fromItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toItem = Math.min(page * PAGE_SIZE, total);
  const invalidDates = Boolean(fromDate && toDate && fromDate > toDate);

  const markRead = async (notification: NotificationRow) => {
    if (!user || user.isDemo || workingId || markingAll) return false;
    if (notification.is_read) return true;
    setWorkingId(notification.id);
    try {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notification.id)
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (updateError) throw updateError;
      await load(true);
      return true;
    } catch (caught) {
      console.error("[NotificationsPage] markRead error:", caught);
      setError("Impossible de marquer cette notification comme lue.");
      return false;
    } finally {
      setWorkingId(null);
    }
  };

  const openNotification = async (notification: NotificationRow) => {
    const ok = await markRead(notification);
    if (!ok || !user) return;
    const destination = notificationTarget(notification, user.role);
    if (destination) navigate(destination);
  };

  const markAllRead = async () => {
    if (!user || user.isDemo || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    try {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (updateError) throw updateError;
      await load(true);
    } catch (caught) {
      console.error("[NotificationsPage] markAllRead error:", caught);
      setError("Impossible de marquer toutes les notifications comme lues.");
    } finally {
      setMarkingAll(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatus("all");
    setCategory("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  if (authLoading) {
    return <div className="sn-card p-8 text-sm text-slate-500">Chargement de votre espace…</div>;
  }

  return (
    <div className="space-y-5 pb-8">
      <header className="sn-card overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-violet-700 p-6 text-white sm:p-8">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-100">
          SchoolNet · Centre de notifications
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">Toutes mes notifications</h1>
            <p className="mt-2 max-w-2xl text-sm text-blue-100">
              Retrouvez vos informations scolaires, cours en direct, bulletins et inscriptions.
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-center">
            <div className="text-3xl font-black">{user?.isDemo ? "—" : unreadCount}</div>
            <div className="text-xs text-blue-100">Non lues</div>
          </div>
        </div>
      </header>

      {user?.isDemo ? (
        <section className="sn-card p-6 text-sm text-amber-800" role="status">
          L'historique réel n'est pas disponible en mode démonstration. Connectez-vous avec un compte SCHOOLNET pour le consulter.
        </section>
      ) : (
        <>
          <section className="sn-card space-y-4 p-5 sm:p-6" aria-label="Rechercher et filtrer les notifications">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold text-slate-900">Rechercher et filtrer</h2>
              <button type="button" className="text-sm font-semibold text-blue-700 hover:underline" onClick={clearFilters}>
                Effacer les filtres
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-semibold">Recherche</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Titre ou contenu d'une notification"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-semibold">Statut</span>
                <select
                  value={status}
                  onChange={(event) => { setStatus(event.target.value as ReadFilter); setPage(1); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                >
                  <option value="all">Toutes</option>
                  <option value="unread">Non lues</option>
                  <option value="read">Lues</option>
                </select>
              </label>
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-semibold">Catégorie</span>
                <select
                  value={category}
                  onChange={(event) => { setCategory(event.target.value as CategoryFilter); setPage(1); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-semibold">Du</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => { setFromDate(event.target.value); setPage(1); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                />
              </label>
              <label className="block space-y-1.5 text-sm text-slate-700">
                <span className="font-semibold">Au</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => { setToDate(event.target.value); setPage(1); }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  className="sn-btn-ghost"
                  disabled={loading || refreshing || invalidDates}
                  onClick={() => void load(true)}
                >
                  {refreshing ? "Actualisation…" : "Actualiser"}
                </button>
                <button
                  type="button"
                  className="sn-btn-primary"
                  disabled={markingAll || unreadCount === 0 || Boolean(workingId)}
                  onClick={() => void markAllRead()}
                >
                  {markingAll ? "Traitement…" : "Tout marquer comme lu"}
                </button>
              </div>
            </div>
            {invalidDates && (
              <p className="text-sm font-semibold text-rose-700" role="alert">
                La date de début doit précéder ou être égale à la date de fin.
              </p>
            )}
          </section>

          {error && (
            <div className="sn-card border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
              {error}
              <button type="button" className="ml-3 font-semibold underline" onClick={() => void load(true)}>
                Réessayer
              </button>
            </div>
          )}

          <section aria-label="Historique des notifications" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">Historique</h2>
              <p className="text-sm text-slate-500" aria-live="polite">
                {loading ? "Chargement…" : total === 0 ? "Aucun résultat" : fromItem + " à " + toItem + " sur " + total}
              </p>
            </div>

            {loading ? (
              <div className="sn-card p-10 text-center text-sm text-slate-500" role="status">
                Chargement des notifications…
              </div>
            ) : rows.length === 0 && !error ? (
              <div className="sn-card px-6 py-12 text-center">
                <div className="text-4xl" aria-hidden="true">🔔</div>
                <h3 className="mt-3 font-bold text-slate-900">Aucune notification pour ces critères</h3>
                <p className="mt-1 text-sm text-slate-500">Modifiez les filtres ou effacez-les pour revoir tout l'historique.</p>
                <button type="button" onClick={clearFilters} className="sn-btn-ghost mt-4">
                  Effacer les filtres
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((notification) => {
                  const destination = user ? notificationTarget(notification, user.role) : null;
                  return (
                    <article
                      key={notification.id}
                      className={"sn-card border p-4 sm:p-5 " + (notification.is_read ? "border-slate-100" : "border-blue-200 bg-blue-50/40")}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm" aria-hidden="true">
                          {notificationIcon(notification.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-900">{notification.title}</h3>
                            {!notification.is_read && (
                              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">Non lue</span>
                            )}
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {notificationCategory(notification.event_key)}
                            </span>
                          </div>
                          {notification.body && (
                            <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-600">{notification.body}</p>
                          )}
                          <p className="mt-3 text-xs text-slate-500">{formatDate(notification.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          {!notification.is_read && (
                            <button
                              type="button"
                              disabled={Boolean(workingId) || markingAll}
                              onClick={() => void markRead(notification)}
                              className="sn-btn-ghost text-xs"
                            >
                              {workingId === notification.id ? "Traitement…" : "Marquer comme lue"}
                            </button>
                          )}
                          {destination && (
                            <button
                              type="button"
                              disabled={Boolean(workingId) || markingAll}
                              onClick={() => void openNotification(notification)}
                              className="sn-btn-primary text-xs"
                            >
                              Ouvrir
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {total > PAGE_SIZE && !loading && (
            <nav aria-label="Pagination des notifications" className="sn-card flex flex-wrap items-center justify-between gap-3 p-3 sm:px-5">
              <span className="text-xs text-slate-500">Page {page} sur {totalPages}</span>
              <div className="flex items-center gap-2">
                <button
                  className="sn-btn-ghost"
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Précédent
                </button>
                <button
                  className="sn-btn-ghost"
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Suivant
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
