-- SCHOOLNET | Lot 4.2 | Préférences de notifications
-- Préparation versionnée uniquement : NE PAS exécuter sur la production avant validation.
-- Les notifications essentielles restent obligatoires ; seuls les rappels LIVE et
-- les alertes de messagerie sont personnalisables.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id, category, channel),
  CONSTRAINT notification_preferences_supported_pairs CHECK (
    (category = 'live_reminder_15m' AND channel = 'in_app') OR
    (category = 'messages' AND channel IN ('banner', 'browser'))
  )
);

COMMENT ON TABLE public.notification_preferences IS
  'Préférences facultatives par utilisateur : les notifications scolaires essentielles ne sont pas désactivables.';

-- Une nouvelle table du schéma public doit être protégée par les deux couches :
-- GRANT minimaux + RLS par propriétaire. Pas de droit DELETE.
REVOKE ALL ON TABLE public.notification_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.notification_preferences TO authenticated;
GRANT INSERT (user_id, category, channel, enabled)
  ON TABLE public.notification_preferences TO authenticated;
GRANT UPDATE (enabled) ON TABLE public.notification_preferences TO authenticated;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_select_own ON public.notification_preferences;
CREATE POLICY notification_preferences_select_own
ON public.notification_preferences
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_preferences_insert_own ON public.notification_preferences;
CREATE POLICY notification_preferences_insert_own
ON public.notification_preferences
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notification_preferences_update_own ON public.notification_preferences;
CREATE POLICY notification_preferences_update_own
ON public.notification_preferences
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- L'horodatage est géré par la base ; l'utilisateur ne peut modifier que enabled.
CREATE OR REPLACE FUNCTION schoolnet_private.touch_notification_preference_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION schoolnet_private.touch_notification_preference_updated_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at
  ON public.notification_preferences;

CREATE TRIGGER trg_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.touch_notification_preference_updated_at();

-- Bloquer uniquement les FUTURS rappels facultatifs si l'utilisateur s'est
-- désabonné. Les annonces, ouvertures, annulations LIVE, bulletins et inscriptions
-- continuent d'être enregistrés. Aucun changement de fonction Cron, ni de planning.
-- Ce déclencheur est exécuté par le rôle base de données du job pg_cron.
CREATE OR REPLACE FUNCTION schoolnet_private.skip_muted_live_reminder_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.event_key LIKE 'schoolnet_live:reminder_15m:%'
     AND EXISTS (
       SELECT 1
       FROM public.notification_preferences pref
       WHERE pref.user_id = NEW.user_id
         AND pref.category = 'live_reminder_15m'
         AND pref.channel = 'in_app'
         AND pref.enabled = false
     ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION schoolnet_private.skip_muted_live_reminder_notifications()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_schoolnet_live_optional_reminders
  ON public.notifications;

CREATE TRIGGER trg_schoolnet_live_optional_reminders
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.skip_muted_live_reminder_notifications();

-- Aucun enregistrement initial : absence de ligne = préférence activée (compatibilité).
-- Ne pas modifier cron.job, les fonctions LIVE existantes, ni l'historique des notifications.
