-- SCHOOLNET / Lot 5.D : controle non mutatif avant et apres activation.
-- Toujours executer en lecture seule. Aucun dossier ni annee n'est modifie.
BEGIN TRANSACTION READ ONLY;

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS total_migrations,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version='20261110090000') AS lot_5d_installed,
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
          WHERE version='20261109140104') AS unrelated_assessment_security_installed,
  to_regclass('public.school_year_rollover_decisions') IS NOT NULL AS decisions_table_exists,
  to_regclass('public.school_year_rollover_runs') IS NOT NULL AS rollover_history_exists,
  to_regprocedure('public.admin_save_school_year_rollover_decision(uuid,uuid,uuid,text,uuid,text)')
    IS NOT NULL AS save_decision_rpc_exists,
  to_regprocedure('public.admin_finalize_school_year_rollover(uuid,uuid,text)')
    IS NOT NULL AS finalize_rpc_exists,
  (SELECT count(*) FROM public.school_years WHERE is_current) AS current_year_count,
  (SELECT count(*) FROM public.student_enrollments) AS enrollment_count,
  (SELECT count(*) FROM public.student_enrollment_events) AS enrollment_event_count,
  (SELECT count(*) FROM public.class_students) AS class_assignment_count,
  (SELECT count(*) FROM cron.job WHERE jobname ILIKE '%live%') AS live_cron_count;

SELECT
  sy.name AS year_name,
  sy.is_current,
  count(DISTINCT c.id) AS classes,
  count(DISTINCT e.id) AS enrollment_count,
  count(DISTINCT e.id) FILTER (WHERE e.status::text='active') AS active_count,
  count(DISTINCT e.id) FILTER (WHERE e.status::text='draft') AS draft_count,
  count(DISTINCT e.id) FILTER (WHERE e.status::text='completed') AS completed_count
FROM public.school_years sy
LEFT JOIN public.classes c ON c.school_year_id=sy.id
  OR (c.school_year_id IS NULL AND c.school_year=sy.name)
LEFT JOIN public.student_enrollments e ON e.school_year_id=sy.id
GROUP BY sy.id,sy.name,sy.is_current
ORDER BY sy.name;

SELECT
  c.relname,
  c.relrowsecurity,
  (SELECT COUNT(*) FROM pg_catalog.pg_policies p
   WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('school_year_rollover_decisions','school_year_rollover_runs');

COMMIT;
