-- SCHOOLNET | Lot 4.3.A | Audit et vérification des notifications d'absence
-- LECTURE SEULE - ne crée aucune donnée ni notification.
-- Avant migration : trigger_present = false attendu.
-- Après migration : trigger_present = true, version_history_present = true.
-- Les notifications n'apparaissent que lors de prochaines clôtures d'appels.

SELECT
  (SELECT COUNT(*) FROM supabase_migrations.schema_migrations) AS total_migrations,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261106164129'
  ) AS version_history_present,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = to_regclass('public.attendance_sessions')
      AND t.tgname = 'trg_notify_attendance_closed_parents'
      AND t.tgenabled = 'O'
  ) AS trigger_present,
  COALESCE((
    SELECT p.prosecdef
    FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure(
      'schoolnet_private.notify_attendance_closed_parents()'
    )
  ), false) AS security_definer,
  COALESCE((
    SELECT 'search_path=pg_catalog' = ANY(p.proconfig)
    FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure(
      'schoolnet_private.notify_attendance_closed_parents()'
    )
  ), false) AS fixed_search_path,
  NOT COALESCE(
    has_function_privilege(
      'anon',
      to_regprocedure('schoolnet_private.notify_attendance_closed_parents()'),
      'EXECUTE'
    ), false
  ) AS anon_execute_denied,
  NOT COALESCE(
    has_function_privilege(
      'authenticated',
      to_regprocedure('schoolnet_private.notify_attendance_closed_parents()'),
      'EXECUTE'
    ), false
  ) AS authenticated_execute_denied,
  COALESCE((
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    WHERE c.oid = to_regclass('public.notifications')
  ), false) AS notification_rls_enabled,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'idx_notifications_event_unique'
  ) AS duplicate_prevention_index,
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'schoolnet_live_reminders_15m'
      AND active = true
      AND schedule = '* * * * *'
  ) AS schoolnet_live_cron_unchanged;

-- Vue agrégée : aucune donnée personnelle dans le résultat.
SELECT
  COUNT(*) AS total_attendance_alerts,
  COUNT(*) FILTER (
    WHERE n.action_url = '/app/parent/attendance'
  ) AS valid_parent_destinations,
  COUNT(*) FILTER (
    WHERE pl.parent_id IS NULL OR ar.id IS NULL
  ) AS invalid_parent_links_or_records
FROM public.notifications n
LEFT JOIN public.attendance_records ar
  ON ar.id = n.related_id
LEFT JOIN public.parent_links pl
  ON pl.parent_id = n.user_id AND pl.student_id = ar.student_id
WHERE n.event_key LIKE 'attendance:closed:%';

-- Le résultat attendu pour les doublons est toujours 0.
SELECT COUNT(*) AS duplicate_alert_groups
FROM (
  SELECT n.user_id, n.event_key, n.related_id
  FROM public.notifications n
  WHERE n.event_key LIKE 'attendance:closed:%'
  GROUP BY n.user_id, n.event_key, n.related_id
  HAVING COUNT(*) > 1
) duplicates;

-- Contrôles fonctionnels (comptes de test uniquement, après migration) :
-- 1. Préparer un appel avec un présent, un absent et un retard.
-- 2. Sauvegarder pendant la séance OPEN : aucune nouvelle alerte.
-- 3. Clôturer : uniquement les parents liés des absent/retard sont notifiés.
-- 4. Répéter les actions sans nouvelle clôture : aucun doublon.
-- 5. Vérifier la cloche et le filtre « Présences et retards » du parent.
-- 6. Cliquer sur Ouvrir -> /app/parent/attendance, accès enfant autorisé.
-- 7. Vérifier les mêmes éléments sur les comptes non liés et les 4 rôles.
