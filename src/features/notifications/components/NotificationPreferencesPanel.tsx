import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  PREFERENCE_OPTIONS,
  saveNotificationPreference,
} from "@/features/notifications/lib/notificationPreferences";
import type {
  NotificationPreferenceValues,
  PreferenceKey,
} from "@/features/notifications/lib/notificationPreferences";

const ESSENTIAL_NOTIFICATIONS = [
  { icon: "🎥", title: "Cours en direct", detail: "Programmations, ouvertures et annulations" },
  { icon: "📑", title: "Bulletins scolaires", detail: "Publication d'un nouveau bulletin" },
  { icon: "📝", title: "Demandes d'inscription", detail: "Alerte destinée à l'administration" },
];

export default function NotificationPreferencesPanel() {
  const { user } = useAuth();
  const userId = user && !user.isDemo ? user.id : null;

  const [values, setValues] = useState<NotificationPreferenceValues>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  });
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const preferences = await loadNotificationPreferences(userId);
      if (requestId === requestIdRef.current) setValues(preferences);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      console.error("[NotificationPreferencesPanel] load:", caught);
      setError("Impossible de charger les préférences. Le schéma SQL du Bloc 4.2 doit être installé avant le test.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const changePreference = async (key: PreferenceKey, enabled: boolean) => {
    if (!userId || savingKey || loading || error) return;

    setSavingKey(key);
    setNotice(null);
    try {
      await saveNotificationPreference(userId, key, enabled);
      setValues((before) => ({ ...before, [key]: enabled }));
      setNotice("Votre préférence a été enregistrée.");
    } catch (caught) {
      console.error("[NotificationPreferencesPanel] save:", caught);
      setError("Enregistrement impossible. Aucune préférence n'a été modifiée. Réessayez après vérification.");
    } finally {
      setSavingKey(null);
    }
  };

  const requestBrowserPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);
    } catch (caught) {
      console.error("[NotificationPreferencesPanel] browser permission:", caught);
      setNotice("Le navigateur n'a pas pu ouvrir la demande d'autorisation.");
    }
  };

  if (user?.isDemo) {
    return (
      <section className="sn-card p-6 text-sm text-amber-800">
        Les préférences réelles ne sont pas modifiables en mode démonstration.
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="sn-card space-y-2 p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-slate-900">Personnaliser mes notifications</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Choisissez les alertes facultatives que vous souhaitez recevoir. Les informations
          essentielles de votre établissement restent disponibles dans SCHOOLNET.
        </p>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          {error}
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => void reload()}
          >
            Réessayer
          </button>
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          {notice}
        </div>
      )}

      <section className="sn-card p-5 sm:p-6" aria-label="Notifications facultatives">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-slate-900">Alertes facultatives</h3>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Personnalisables
          </span>
        </div>

        {loading ? (
          <p className="py-8 text-sm text-slate-500" role="status">
            Chargement des préférences…
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {PREFERENCE_OPTIONS.map((option) => (
              <label key={option.key} className="flex cursor-pointer flex-wrap items-start justify-between gap-4 py-5 first:pt-1 last:pb-1">
                <span className="flex min-w-0 flex-1 gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="space-y-1">
                    <span className="block font-bold text-slate-900">{option.title}</span>
                    <span className="block text-sm leading-5 text-slate-600">{option.description}</span>
                    {savingKey === option.key && <span className="block text-xs text-blue-700">Enregistrement…</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    {values[option.key] ? "Activée" : "Désactivée"}
                  </span>
                  <input
                    type="checkbox"
                    checked={values[option.key]}
                    onChange={(event) => void changePreference(option.key, event.target.checked)}
                    disabled={loading || savingKey !== null || error !== null}
                    className="h-5 w-5 accent-blue-600 disabled:cursor-not-allowed"
                    aria-label={option.title}
                  />
                </span>
              </label>
            ))}
          </div>
        )}

        {permissionStatus !== "granted" && (
          <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
            {permissionStatus === "unsupported" ? (
              "Ce navigateur ne prend pas en charge les notifications système."
            ) : permissionStatus === "denied" ? (
              "Les notifications système sont bloquées dans les paramètres du navigateur. Cette préférence ne peut pas contourner ce blocage."
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Pour recevoir des notifications système, autorisez-les également dans le navigateur.</span>
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold hover:bg-amber-100"
                  onClick={() => void requestBrowserPermission()}
                >
                  Demander l'autorisation
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="sn-card p-5 sm:p-6" aria-label="Notifications essentielles">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-slate-900">Informations essentielles</h3>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Toujours actives
          </span>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Ces notifications sont indispensables au suivi scolaire et ne peuvent pas être désactivées.
        </p>
        <div className="divide-y divide-slate-100">
          {ESSENTIAL_NOTIFICATIONS.map((item) => (
            <div key={item.title} className="flex items-center justify-between gap-3 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-xl" aria-hidden="true">{item.icon}</span>
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="text-sm text-slate-500">{item.detail}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-bold text-emerald-700" aria-label="Toujours actif">
                Obligatoire
              </span>
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Les changements concernent les alertes futures. Les notifications déjà reçues
        restent visibles dans votre historique.
      </p>
    </div>
  );
}
