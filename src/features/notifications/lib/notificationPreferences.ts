import { supabase } from "@/lib/supabaseClient";

/**
 * Absence d'une ligne en base = préférence activée, afin de conserver
 * le comportement historique de SCHOOLNET pour tous les comptes.
 */
export const NOTIFICATION_PREFERENCES_CHANGED = "schoolnet-notification-preferences-changed";

export const PREFERENCE_OPTIONS = [
  {
    key: "liveReminder",
    category: "live_reminder_15m",
    channel: "in_app",
    icon: "⏰",
    title: "Rappels des cours en direct",
    description: "Notification dans SCHOOLNET environ 15 minutes avant le cours.",
  },
  {
    key: "messageBanner",
    category: "messages",
    channel: "banner",
    icon: "💬",
    title: "Alertes visuelles des messages",
    description: "Bannière lors de la réception d'un nouveau message.",
  },
  {
    key: "messageBrowser",
    category: "messages",
    channel: "browser",
    icon: "🔔",
    title: "Notifications du navigateur",
    description: "Alerte système pour les messages si SCHOOLNET est en arrière-plan.",
  },
] as const;

export type PreferenceKey = (typeof PREFERENCE_OPTIONS)[number]["key"];
export type NotificationPreferenceValues = Record<PreferenceKey, boolean>;

type PreferenceRow = {
  category: string;
  channel: string;
  enabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceValues = {
  liveReminder: true,
  messageBanner: true,
  messageBrowser: true,
};

export async function loadNotificationPreferences(userId: string): Promise<NotificationPreferenceValues> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("category, channel, enabled")
    .eq("user_id", userId);

  if (error) throw error;

  const values = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const rows = (data ?? []) as PreferenceRow[];

  for (const option of PREFERENCE_OPTIONS) {
    const row = rows.find(
      (entry) => entry.category === option.category && entry.channel === option.channel,
    );
    if (row) values[option.key] = row.enabled;
  }

  return values;
}

export async function saveNotificationPreference(
  userId: string,
  key: PreferenceKey,
  enabled: boolean,
): Promise<void> {
  const option = PREFERENCE_OPTIONS.find((item) => item.key === key);
  if (!option) throw new Error("Préférence inconnue.");

  // Ne pas utiliser upsert : seuls les changements de colonne enabled sont
  // autorisés au rôle authenticated ; les colonnes d'identité sont immuables.
  const { data, error: readError } = await supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .eq("category", option.category)
    .eq("channel", option.channel)
    .maybeSingle();

  if (readError) throw readError;

  if (data) {
    const { error: updateError } = await supabase
      .from("notification_preferences")
      .update({ enabled })
      .eq("user_id", userId)
      .eq("category", option.category)
      .eq("channel", option.channel);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from("notification_preferences")
      .insert({
        user_id: userId,
        category: option.category,
        channel: option.channel,
        enabled,
      });

    // Deux onglets peuvent essayer d'enregistrer simultanément la même
    // préférence. Une collision d'unicité se résout par UPDATE limité.
    if (insertError?.code === "23505") {
      const { error: updateError } = await supabase
        .from("notification_preferences")
        .update({ enabled })
        .eq("user_id", userId)
        .eq("category", option.category)
        .eq("channel", option.channel);
      if (updateError) throw updateError;
    } else if (insertError) {
      throw insertError;
    }
  }

  window.dispatchEvent(new CustomEvent(NOTIFICATION_PREFERENCES_CHANGED));
}
