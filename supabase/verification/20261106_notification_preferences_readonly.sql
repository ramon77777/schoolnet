-- SCHOOLNET | Lot 4.2 | Vérification de la migration des préférences
-- LECTURE SEULE. À exécuter APRÈS application explicite de la migration.
-- Ne crée rien, ne change rien, ne relance pas le Cron.

SELECT
  to_regclass('public.notification_preferences') IS NOT NULL
    AS table_preferences_presente,
  COALESCE((
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = to_regclass('public.notification_preferences')
  ), false) AS rls_active,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.notification_preferences')
      AND conname = 'notification_preferences_supported_pairs'
  ) AS paires_controlees,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'notification_preferences'
     AND policyname IN (
       'notification_preferences_select_own',
       'notification_preferences_insert_own',
       'notification_preferences_update_own'
     )) = 3 AS trois_policies_presentes,
  NOT COALESCE(has_table_privilege(
    'anon', to_regclass('public.notification_preferences'), 'SELECT'
  ), false) AS lecture_anonyme_interdite,
  NOT COALESCE(has_table_privilege(
    'authenticated', to_regclass('public.notification_preferences'), 'DELETE'
  ), false) AS suppression_utilisateur_interdite,
  COALESCE(has_column_privilege(
    'authenticated', 'public.notification_preferences', 'enabled', 'UPDATE'
  ), false) AS utilisateur_peut_modifier_enabled,
  NOT COALESCE(has_column_privilege(
    'authenticated', 'public.notification_preferences', 'user_id', 'UPDATE'
  ), false) AS utilisateur_ne_peut_pas_modifier_user_id,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = to_regclass('public.notifications')
      AND tgname = 'trg_schoolnet_live_optional_reminders'
      AND tgenabled = 'O'
  ) AS filtre_rappels_installe,
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'schoolnet_live_reminders_15m'
      AND active = true
      AND schedule = '* * * * *'
      AND command = 'select schoolnet_private.dispatch_live_reminders_15m();'
  ) AS cron_existant_inchange;

-- Vérifier ensuite avec de vrais comptes que :
-- - chaque rôle ne voit que ses propres préférences ;
-- - la désactivation n'affecte que les rappels futurs ;
-- - les autres notifications LIVE, les bulletins et les inscriptions restent actives ;
-- - les notifications déjà enregistrées sont conservées.
