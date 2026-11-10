-- SCHOOLNET | Controle non mutatif de la fondation multi-etablissements.
BEGIN TRANSACTION READ ONLY;
SELECT
 (SELECT count(*) FROM supabase_migrations.schema_migrations) AS total_migrations,
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version='20261110111827' AND name='schoolnet_schools_security_foundation') AS school_foundation_registered,
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version='20261110112106' AND name='school_admin_profile_role_check') AS profile_role_correction_registered,
 EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.profiles'::regclass
  AND c.conname='profiles_role_check' AND c.convalidated
  AND pg_get_constraintdef(c.oid) LIKE '%school_admin%') AS profile_check_allows_local_admin,
 to_regclass('public.schoolnet_schools') IS NOT NULL AS school_table_installed,
 to_regclass('public.schoolnet_school_memberships') IS NOT NULL AS memberships_installed,
 to_regclass('public.schoolnet_school_audit') IS NOT NULL AS audit_installed,
 to_regclass('public.schoolnet_school_admin_invitations') IS NOT NULL AS invitations_installed,
 to_regprocedure('public.schoolnet_admin_lookup_auth_email(text)') IS NOT NULL AS lookup_rpc_installed,
 to_regprocedure('public.schoolnet_admin_record_school_invitation(uuid,uuid)') IS NOT NULL AS record_rpc_installed,
 to_regprocedure('public.schoolnet_admin_mark_school_invitation_sent(uuid,uuid)') IS NOT NULL AS delivery_rpc_installed,
 EXISTS(SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
  WHERE t.typname='user_role' AND e.enumlabel='school_admin') AS school_admin_role_installed,
 (SELECT count(*) FROM public.profiles WHERE role::text='admin') AS global_admin_profiles,
 (SELECT count(*) FROM cron.job WHERE jobname ILIKE '%live%') AS live_cron_jobs;
SELECT tablename,policyname,cmd,roles,qual,with_check FROM pg_policies
 WHERE schemaname='public' AND table_name IN
 ('schoolnet_schools','schoolnet_school_memberships','schoolnet_school_audit','schoolnet_school_admin_invitations')
 ORDER BY tablename,policyname;
COMMIT;
