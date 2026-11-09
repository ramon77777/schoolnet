-- SCHOOLNET | Lot 4.3.D | Audit des RPC et fonctions privilegiees
-- Lecture seule, avant/apres l'application autorisee des durcissements.
-- Ne change ni les privileges ni les fonctions en production.

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations)
    AS migrations_total,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109135338'
  ) AS chat_hardening_applied,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109140104'
  ) AS assessment_hardening_applied,
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='schoolnet_live_reminders_15m'
      AND active AND schedule='* * * * *'
  ) AS cron_live_active;

-- Résultats attendus après les deux migrations :
-- anon_execute=FALSE pour les six fonctions ;
-- authenticated_execute=TRUE pour les cinq RPC applicatives ;
-- authenticated_execute=FALSE pour la fonction technique de recalcul ;
-- security_definer=TRUE ; search_path=pg_catalog.
SELECT
  p.oid::regprocedure::text AS function_name,
  p.prosecdef AS security_definer,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    AS anon_execute,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    AS authenticated_execute,
  pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
    AS service_role_execute,
  'search_path=pg_catalog'=ANY(
    COALESCE(p.proconfig,ARRAY[]::text[])
  ) AS safe_search_path
FROM pg_catalog.pg_proc p
WHERE p.pronamespace='public'::regnamespace
  AND p.oid::regprocedure::text IN (
    'chat_is_member(uuid,uuid)',
    'chat_parent_is_linked_to_student(uuid,uuid)',
    'chat_teacher_teaches_student(uuid,uuid)',
    'publish_assessment_submission(uuid)',
    'mark_submission_as_graded(uuid,text)',
    'recalculate_submission_score(uuid)'
  )
ORDER BY function_name;

-- La correction existe toujours et son déclencheur reste actif.
SELECT
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname='trg_submission_question_grades_recalculate_score'
      AND tgenabled='O'
  ) AS score_recalculation_trigger_active,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname='trg_notify_assessment_correction_published'
      AND tgenabled='O'
  ) AS assessment_notification_trigger_active,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname='trg_notify_homework_correction_published'
      AND tgenabled='O'
  ) AS homework_notification_trigger_active;

-- Contrôler en plus via BEGIN ... ROLLBACK, sur comptes de test :
-- * anon : lecture de liens de conversation refusée ;
-- * authenticated : membre lit ses propres conversations, pas celles d'autrui ;
-- * Parent, Enseignant, Apprenant : contacts légitimes conservés ;
-- * Apprenant / Enseignant non propriétaire : publication de copie refusée ;
-- * Enseignant propriétaire : publication réussie dans la transaction-test ;
-- * aucun changement définitif de notes, aucun notification rétroactive.
