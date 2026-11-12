-- SCHOOLNET | Bloc 4.3.B | Audit read-only des notifications scolaires
-- AUCUNE modification de la base. A executer avant et apres la migration
-- 20261109082000_notify_corrections_linked_parents.sql.
--
-- Avant la migration : corrections_use_parent_links = false.
-- Apres la migration : corrections_use_parent_links = true.
-- Les anciennes notifications restent dans l'historique (pas de retroactivite).

SELECT
 (SELECT COUNT(*) FROM supabase_migrations.schema_migrations)
    AS migrations_total,
 EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version = '20261109082000'
 ) AS correction_parent_link_migration_applied,
 (SELECT active FROM cron.job WHERE jobname = 'schoolnet_live_reminders_15m')
    AS live_cron_active,
 (SELECT relrowsecurity FROM pg_catalog.pg_class
    WHERE oid = to_regclass('public.notifications'))
    AS notifications_rls_active,
 EXISTS (
  SELECT 1 FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'notifications'
    AND indexname = 'idx_notifications_event_unique'
 ) AS notification_dedup_index_present,
 (SELECT COUNT(*) FROM pg_catalog.pg_trigger
   WHERE tgname IN (
     'trg_notify_assessment_published',
     'trg_notify_assessment_correction_published',
     'trg_notify_homework_correction_published'
   )
     AND tgenabled = 'O') AS education_triggers_enabled,
 COALESCE(
   position('join public.parent_links pl' in pg_catalog.pg_get_functiondef(
     to_regprocedure('public.notify_assessment_correction_published()')
   )) > 0,
   false
 ) AS assessment_corrections_use_parent_links,
 COALESCE(
   position('join public.parent_links pl' in pg_catalog.pg_get_functiondef(
     to_regprocedure('public.notify_homework_correction_published()')
   )) > 0,
   false
 ) AS homework_corrections_use_parent_links;

-- Statistiques agrégées uniquement (aucun nom, aucune note).
SELECT
  count(*) FILTER (WHERE event_key = 'assessment_published')
    AS publication_notifications,
  count(*) FILTER (WHERE event_key = 'correction_published')
    AS correction_notifications,
  count(*) FILTER (WHERE event_key = 'assessment_published'
                   AND action_url LIKE '/app/student/%')
    AS publication_student_routes,
  count(*) FILTER (WHERE event_key = 'correction_published'
                   AND action_url LIKE '/app/student/%')
    AS correction_student_routes,
  count(*) FILTER (WHERE event_key = 'correction_published'
                   AND action_url LIKE '/app/parent/results/%?childId=%')
    AS correction_parent_routes
FROM public.notifications;

-- Aucun doublon par destinataire, clé et enregistrement.
SELECT count(*) AS duplicate_notification_groups
FROM (
  SELECT user_id, event_key, related_id
  FROM public.notifications
  WHERE event_key IN ('assessment_published', 'correction_published')
    AND related_id IS NOT NULL
  GROUP BY user_id, event_key, related_id
  HAVING count(*) > 1
) duplicates;

-- Aucun parent non autorisé ne doit figurer parmi les notifications
-- de correction créées *après* la migration.
-- Une notification sans submission identifiée est classée comme anomalie
-- pour revue, sans divulguer les informations du parent ou de l'élève.
SELECT
 count(*) AS correction_parent_alerts,
 count(*) FILTER (
   WHERE (a.id IS NULL AND hs.id IS NULL)
      OR (a.id IS NOT NULL AND a.status::text <> 'published')
      OR (hs.id IS NOT NULL AND hs.status::text <> 'published')
      OR NOT EXISTS (
        SELECT 1 FROM public.parent_links link
        WHERE link.parent_id = n.user_id
          AND link.student_id IN (a.student_id, hs.student_id)
      )
 ) AS correction_parent_alerts_to_review
FROM public.notifications AS n
JOIN public.profiles AS parent
  ON parent.id = n.user_id
 AND parent.role::text = 'parent'
LEFT JOIN public.assessment_submissions a
  ON a.id = n.related_id
LEFT JOIN public.homework_submissions hs
  ON hs.id = n.related_id
WHERE n.event_key = 'correction_published';

-- Recette fonctionnelle sur comptes de test :
-- A. Publi­er un NOUVEAU devoir, quiz, examen -> un avis par élève inscrit.
-- B. Vérifier le filtre « Devoirs et évaluations » et le bouton Ouvrir.
-- C. Publier la correction d'une copie -> un avis élève + parents liés.
-- D. Vérifier le filtre « Résultats et corrections », la route Parent.
-- E. Aucun résultat en état 'graded' non publié n'est communiqué.
-- F. Un parent sans parent_links ne reçoit aucun avis de correction.
-- G. Sauvegarder sans transition de statut ne crée pas de doublon.
