-- SCHOOLNET | Bloc 4.3.B | Alertes des travaux remis aux enseignants
-- Audit en lecture seule, avant et apres application de la migration.
-- La migration 20261109105000 ne doit pas etre appliquee sans accord explicite.

SELECT
  (SELECT COUNT(*) FROM supabase_migrations.schema_migrations)
    AS migration_count,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261109105000'
  ) AS teacher_alert_migration_applied,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'trg_notify_teacher_homework_submitted'
      AND tgrelid = to_regclass('public.homework_submissions')
      AND tgenabled = 'O'
  ) AS homework_trigger_active,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname = 'trg_notify_teacher_assessment_submitted'
      AND tgrelid = to_regclass('public.assessment_submissions')
      AND tgenabled = 'O'
  ) AS assessment_trigger_active,
  COALESCE((
    SELECT prosecdef
    FROM pg_catalog.pg_proc
    WHERE oid = to_regprocedure('schoolnet_private.notify_teacher_on_submission()')
  ), false) AS function_is_definer,
  COALESCE((
    SELECT 'search_path=pg_catalog' = ANY(proconfig)
    FROM pg_catalog.pg_proc
    WHERE oid = to_regprocedure('schoolnet_private.notify_teacher_on_submission()')
  ), false) AS search_path_fixed,
  NOT COALESCE(
    has_function_privilege(
      'anon',
      to_regprocedure('schoolnet_private.notify_teacher_on_submission()'),
      'EXECUTE'
    ), false
  ) AS anon_execute_denied,
  NOT COALESCE(
    has_function_privilege(
      'authenticated',
      to_regprocedure('schoolnet_private.notify_teacher_on_submission()'),
      'EXECUTE'
    ), false
  ) AS authenticated_execute_denied,
  COALESCE((
    SELECT relrowsecurity FROM pg_catalog.pg_class
    WHERE oid = to_regclass('public.notifications')
  ), false) AS notification_rls_active,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public' AND tablename = 'notifications'
      AND indexname = 'idx_notifications_event_unique'
  ) AS notification_unique_index,
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'schoolnet_live_reminders_15m'
      AND active AND schedule = '* * * * *'
  ) AS schoolnet_live_cron_active;

-- Statistiques sans donnees personnelles
SELECT
  COUNT(*) FILTER (WHERE event_key='submission:homework') AS homework_alerts,
  COUNT(*) FILTER (WHERE event_key='submission:assessment') AS online_assessment_alerts,
  COUNT(*) FILTER (WHERE action_url LIKE '/app/teacher/grading?assessmentId=%') AS valid_grading_routes,
  COUNT(*) FILTER (WHERE p.role::text <> 'teacher' OR p.id IS NULL) AS invalid_recipients,
  COUNT(*) FILTER (
    WHERE a.id IS NULL OR NOT (
      a.created_by = n.user_id
      OR EXISTS(
        SELECT 1 FROM public.course_teachers ct
        WHERE ct.course_id=a.course_id AND ct.teacher_id=n.user_id
      )
    )
  ) AS recipients_not_authorized_by_course
FROM public.notifications n
LEFT JOIN public.profiles p ON p.id=n.user_id
LEFT JOIN public.homework_submissions h ON h.id=n.related_id
LEFT JOIN public.assessment_submissions s ON s.id=n.related_id
LEFT JOIN public.assessments a ON a.id=COALESCE(h.homework_id,s.assessment_id)
WHERE n.event_key LIKE 'submission:%';

SELECT COUNT(*) AS duplicate_alert_groups
FROM (
  SELECT user_id,event_key,related_id
  FROM public.notifications
  WHERE event_key LIKE 'submission:%'
  GROUP BY 1,2,3
  HAVING COUNT(*) > 1
) x;

-- Recette :
-- 1. Une copie remise en brouillon/in_progress : aucune alerte.
-- 2. Premier rendu : une alerte aux enseignants responsables du cours.
-- 3. L'enseignant ouvre la notification -> Corrections, evaluation ciblee.
-- 4. Un enseignant d'un autre cours : aucune notification.
-- 5. Une nouvelle sauvegarde en statut submitted : pas de doublon.
-- 6. Une correction publiee continue de notifier eleve + parent lie.
-- 7. Cloche et filtre « Travaux remis » visibles au-dessus des bannières.
-- 8. Tester sur les 4 roles, desktop et mobile, apres lint/build.
