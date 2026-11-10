-- SCHOOLNET | Controle non mutatif de la fondation multi-etablissements.
BEGIN TRANSACTION READ ONLY;
SELECT
 (SELECT count(*) FROM supabase_migrations.schema_migrations) AS total_migrations,
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version='20261110103500') AS school_foundation_registered,
 to_regclass('public.schoolnet_schools') IS NOT NULL AS school_table_installed,
 to_regclass('public.schoolnet_school_memberships') IS NOT NULL AS memberships_installed,
 to_regclass('public.schoolnet_school_audit') IS NOT NULL AS audit_installed,
 EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
  WHERE t.typname='user_role' AND e.enumlabel='school_admin') AS school_admin_role_installed,
 (SELECT count(*) FROM public.profiles WHERE role::text='admin') AS global_admin_profiles,
 (SELECT count(*) FROM cron.job WHERE jobname ILIKE '%live%') AS live_cron_jobs;
SELECT table_name,policyname,cmd,roles,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND table_name IN
 ('schoolnet_schools','schoolnet_school_memberships','schoolnet_school_audit')
 ORDER BY table_name,policyname;
COMMIT;
