-- SCHOOLNET | Bloc 4.3.C | Controles des notifications d'emploi du temps
-- LECTURE SEULE : avant et apres la migration 20261109114749.
-- Avant migration : 24 versions en production, fonction/trigger absents.
-- Apres migration : version enregistree, fonction/trigger actifs et securises.
-- Les creneaux existants ne doivent pas produire de notifications retroactives.

SELECT
  (SELECT COUNT(*) FROM supabase_migrations.schema_migrations) AS migrations_total,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109114749'
  ) AS migration_history_present,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid=to_regclass('public.timetable_slots')
      AND t.tgname='trg_notify_timetable_changes'
      AND t.tgenabled='O'
  ) AS timetable_trigger_active,
  COALESCE((
    SELECT p.prosecdef FROM pg_catalog.pg_proc p
    WHERE p.oid=to_regprocedure('schoolnet_private.notify_timetable_changes()')
  ), false) AS function_security_definer,
  COALESCE((
    SELECT 'search_path=pg_catalog'=ANY(p.proconfig)
    FROM pg_catalog.pg_proc p
    WHERE p.oid=to_regprocedure('schoolnet_private.notify_timetable_changes()')
  ), false) AS function_fixed_search_path,
  NOT COALESCE(
    has_function_privilege(
      'anon',
      to_regprocedure('schoolnet_private.notify_timetable_changes()'),
      'EXECUTE'
    ), false
  ) AS anon_execute_denied,
  NOT COALESCE(
    has_function_privilege(
      'authenticated',
      to_regprocedure('schoolnet_private.notify_timetable_changes()'),
      'EXECUTE'
    ), false
  ) AS authenticated_execute_denied,
  COALESCE((
    SELECT c.relrowsecurity FROM pg_catalog.pg_class c
    WHERE c.oid=to_regclass('public.notifications')
  ), false) AS notifications_rls_enabled,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public' AND tablename='notifications'
      AND indexname='idx_notifications_event_unique'
  ) AS notification_unique_index,
  EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='schoolnet_live_reminders_15m'
      AND active AND schedule='* * * * *'
  ) AS live_cron_unchanged;

-- Aggregations : aucune donnee scolaire individuelle divulguee.
SELECT
  COUNT(*) AS total_schedule_alerts,
  COUNT(*) FILTER (WHERE n.event_key LIKE 'timetable:updated:%') AS modified,
  COUNT(*) FILTER (WHERE n.event_key LIKE 'timetable:disabled:%') AS disabled,
  COUNT(*) FILTER (WHERE n.event_key LIKE 'timetable:reactivated:%') AS reactivated,
  COUNT(*) FILTER (WHERE n.event_key LIKE 'timetable:deleted:%') AS deleted,
  COUNT(*) FILTER (
    WHERE p.role::text='teacher'
      AND n.action_url='/app/teacher/timetable'
  ) AS teacher_routes_valid,
  COUNT(*) FILTER (
    WHERE p.role::text='student'
      AND n.action_url='/app/student/timetable'
  ) AS student_routes_valid,
  COUNT(*) FILTER (
    WHERE p.id IS NULL OR p.role::text NOT IN ('teacher','student')
      OR (
        p.role::text='teacher'
        AND n.action_url IS DISTINCT FROM '/app/teacher/timetable'
      )
      OR (
        p.role::text='student'
        AND n.action_url IS DISTINCT FROM '/app/student/timetable'
      )
  ) AS recipient_or_url_anomalies,
  COUNT(*) FILTER (WHERE n.related_id IS NULL) AS missing_related_id
FROM public.notifications n
LEFT JOIN public.profiles p ON p.id=n.user_id
WHERE n.event_key LIKE 'timetable:%';

-- Attendu : 0 groupes de doublons pour un meme evenement.
SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT user_id, event_key, related_id
  FROM public.notifications
  WHERE event_key LIKE 'timetable:%'
  GROUP BY user_id, event_key, related_id
  HAVING COUNT(*)>1
) duplicates;

-- Controle du perimetre (nombre de destinataires potentiels).
SELECT
  COUNT(*) AS current_active_slots,
  COALESCE(SUM(student_count),0) AS potential_student_recipients
FROM (
  SELECT ts.id,
         (
           SELECT COUNT(*)
           FROM public.class_students cs
           JOIN public.profiles p ON p.id=cs.student_id
           WHERE cs.class_id=ts.class_id AND p.role::text='student'
         ) AS student_count
  FROM public.timetable_slots ts
  JOIN public.school_years sy ON sy.id=ts.school_year_id
  WHERE sy.is_current AND ts.is_active
) current_slots;

-- Recette manuelle sur des comptes factices :
-- 1. UPDATE sans changement d'attribut metier / notes uniquement : 0 alerte.
-- 2. UPDATE horaire (actif, annee courante) : enseignant + eleves concernes,
--    un avis chacun, bon jour, lien vers l'emploi du temps.
-- 3. UPDATE salle : notification « Emploi du temps modifié ».
-- 4. Reaffectation enseignant / classe : anciens ET nouveaux affectes,
--    pas les autres professeurs/eleves; aucune fuite de classe non autorisee.
-- 5. Desactivation : avis « Creneau desactive » aux anciens affectes.
-- 6. Reactivation : avis « Creneau reactive » aux nouveaux affectes.
-- 7. DELETE sur un creneau actif : « Creneau supprime », URL generique valide
--    meme si la fiche du creneau n'existe plus.
-- 8. UPDATE d'un creneau inactif / d'une ancienne annee : 0 alerte.
-- 9. Deux modifications reelles successives : deux avis legitimes ;
--    chaque destinataire ne recoit qu'un avis par evenement.
-- 10. Centre de notifications : filtre « Emploi du temps » et cloche Realtime.
-- 11. Aucun changement de RLS, Cron LIVE, migrations deja presentes.
