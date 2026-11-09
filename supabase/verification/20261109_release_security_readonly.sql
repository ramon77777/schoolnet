-- SCHOOLNET | Lot 4.3.D | Vérifications sécurité avant mise en préproduction
-- Lecture seule ; ne crée/modifie ni données, politiques RLS ni permissions.
-- À exécuter dans Supabase SQL Editor sur schoolnet_2.0.
-- Les recommandations de sécurité sont des CONSTATS, pas une demande
-- de révocation globale des EXECUTE sur les fonctions existantes.

-- 1. Migration et continuité de SCHOOLNET LIVE
SELECT
  (SELECT COUNT(*) FROM supabase_migrations.schema_migrations) AS total_migrations,
  EXISTS(
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109114749'
  ) AS timetable_migration_applied,
  EXISTS(
    SELECT 1 FROM cron.job
    WHERE jobname='schoolnet_live_reminders_15m'
      AND active AND schedule='* * * * *'
  ) AS live_cron_active,
  EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=to_regclass('public.timetable_slots')
      AND tgname='trg_notify_timetable_changes'
      AND tgenabled='O'
  ) AS timetable_trigger_active;

-- 2. Toutes les tables publiques sont protégées par RLS
SELECT
  COUNT(*) AS public_tables,
  COUNT(*) FILTER (WHERE NOT cls.relrowsecurity) AS tables_without_rls
FROM pg_catalog.pg_tables tab
JOIN pg_catalog.pg_class cls
  ON cls.oid = pg_catalog.to_regclass(
    pg_catalog.format('%I.%I',tab.schemaname,tab.tablename)
  )
WHERE tab.schemaname='public';

-- 3. Les vues accessibles à l'application doivent respecter la RLS
SELECT
  COUNT(*) AS public_views,
  COUNT(*) FILTER (
    WHERE 'security_invoker=true'=ANY(
      COALESCE(cls.reloptions,ARRAY[]::text[])
    )
  ) AS security_invoker_views,
  COUNT(*) FILTER (
    WHERE 'security_invoker=true'<>ALL(
      COALESCE(cls.reloptions,ARRAY[]::text[])
    )
  ) AS views_needing_review
FROM pg_catalog.pg_class cls
WHERE cls.relnamespace='public'::regnamespace
  AND cls.relkind='v';

-- 4. Tables volontairement privées sans politique client
SELECT
  cls.relname AS private_table,
  cls.relrowsecurity AS rls_enabled,
  pg_catalog.has_table_privilege('anon',cls.oid,'SELECT') AS anon_can_read,
  pg_catalog.has_table_privilege('authenticated',cls.oid,'SELECT') AS signed_in_can_read,
  (
    SELECT COUNT(*) FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname='public' AND pol.tablename=cls.relname
  ) AS policy_count
FROM pg_catalog.pg_class cls
WHERE cls.oid IN (
  to_regclass('public.chat_message_hidden_for_users'),
  to_regclass('public.live_session_rooms')
)
ORDER BY cls.relname;

-- 5. Fonctions SECURITY DEFINER accessibles directement (à trier)
SELECT
  COUNT(*) AS privileged_public_functions,
  COUNT(*) FILTER (
    WHERE pg_catalog.has_function_privilege('anon',fn.oid,'EXECUTE')
  ) AS executable_by_anon,
  COUNT(*) FILTER (
    WHERE pg_catalog.has_function_privilege('authenticated',fn.oid,'EXECUTE')
  ) AS executable_by_authenticated,
  COUNT(*) FILTER (
    WHERE fn.prorettype='pg_catalog.trigger'::regtype
      AND pg_catalog.has_function_privilege('anon',fn.oid,'EXECUTE')
  ) AS trigger_functions_executable_by_anon
FROM pg_catalog.pg_proc fn
WHERE fn.pronamespace='public'::regnamespace
  AND fn.prosecdef;

-- 6. Cas particulièrement sensible : relations privées de messagerie
SELECT
  fn.oid::regprocedure::text AS signature,
  pg_catalog.has_function_privilege('anon',fn.oid,'EXECUTE') AS anon_execute,
  pg_catalog.has_function_privilege('authenticated',fn.oid,'EXECUTE') AS authenticated_execute
FROM pg_catalog.pg_proc fn
WHERE fn.pronamespace='public'::regnamespace
  AND fn.proname IN (
    'chat_is_member',
    'chat_parent_is_linked_to_student',
    'chat_teacher_teaches_student'
  )
ORDER BY fn.proname;

-- 7. Fonctions dont la recherche de schéma dépend encore du rôle/session
SELECT
  fn.oid::regprocedure::text AS signature,
  COALESCE(pg_catalog.array_to_string(fn.proconfig,','),'') AS configuration
FROM pg_catalog.pg_proc fn
WHERE fn.pronamespace='public'::regnamespace
  AND fn.proname IN (
    'validate_class_student_role',
    'validate_class_teacher_role',
    'validate_parent_link_roles',
    'validate_course_teacher_role',
    'validate_course_enrollment_role',
    'validate_course_creator_role',
    'validate_resource_creator_role',
    'validate_assessment_creator_role',
    'validate_submission_student_role',
    'set_submission_question_grades_updated_at',
    'prevent_invalid_submission_status_regression',
    'handle_new_user',
    'set_updated_at',
    'attendance_touch_updated_at'
  )
ORDER BY fn.proname;

-- 8. Isolation des préférences et des notifications : contrôles de politiques
SELECT tablename,policyname,cmd,roles
FROM pg_catalog.pg_policies
WHERE schemaname='public'
  AND tablename IN ('notifications','notification_preferences')
ORDER BY tablename,policyname;

-- 9. Index anti-doublons et événements scolaires
SELECT
  EXISTS(
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='notifications'
      AND indexname='idx_notifications_event_unique'
  ) AS unique_index_present,
  (
    SELECT COUNT(*) FROM public.notifications
    WHERE event_key LIKE 'timetable:%'
  ) AS timetable_notices,
  (
    SELECT COUNT(*) FROM public.notifications
    WHERE event_key LIKE 'submission:%'
  ) AS submission_notices,
  (
    SELECT COUNT(*) FROM public.notifications
    WHERE event_key='correction_published'
  ) AS correction_notices;

-- 10. Les événements dédupliqués n'ont pas de répétition par utilisateur
SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT user_id,event_key,related_id
  FROM public.notifications
  WHERE event_key IS NOT NULL AND related_id IS NOT NULL
  GROUP BY user_id,event_key,related_id
  HAVING COUNT(*)>1
) duplicates;

-- POUR LA RECETTE : réaliser séparément les tests RLS avec les rôles
-- authentifiés student, parent, teacher et admin, après configuration
-- du contexte JWT dans une transaction BEGIN READ ONLY ... ROLLBACK.
-- Éviter d'appliquer directement un REVOKE : les fonctions definer
-- peuvent être appelées par d'autres fonctions, triggers et politiques.
