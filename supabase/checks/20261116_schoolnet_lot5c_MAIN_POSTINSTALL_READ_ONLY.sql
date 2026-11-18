-- SCHOOLNET Lot 5.C — read-only checks AFTER separately authorized install.
-- This file does not install, repair, delete, migrate or alter anything.
-- Do not run before installing the main proposal: new table must already exist.
-- Compare the aggregate counts against the preflight report.
BEGIN TRANSACTION READ ONLY;

-- All columns should be TRUE.
SELECT
 to_regclass('public.schoolnet_sibling_parent_approvals') IS NOT NULL AS approval_table_present,
 to_regprocedure('schoolnet_student_private.guard_sibling_parent_approval()') IS NOT NULL AS approval_guard_function_present,
 to_regprocedure('schoolnet_student_private.link_verified_no_email_family_after_activation()') IS NOT NULL AS autolink_function_present,
 EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
  WHERE tgname='schoolnet_sibling_approval_guard' AND tgenabled='O') AS approval_trigger_enabled,
 EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
  WHERE tgname='schoolnet_student_no_email_autolink_family_after_activation' AND tgenabled='O') AS autolink_trigger_enabled,
 EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname='schoolnet_sibling_parent_approvals'
    AND c.relrowsecurity AND c.relforcerowsecurity) AS approval_table_rls_forced,
 NOT pg_catalog.has_table_privilege('anon',
  'public.schoolnet_sibling_parent_approvals','SELECT') AS no_anon_approval_read,
 NOT pg_catalog.has_table_privilege('authenticated',
  'public.schoolnet_sibling_parent_approvals','SELECT') AS no_signed_approval_read,
 NOT pg_catalog.has_table_privilege('authenticated',
  'public.schoolnet_sibling_parent_approvals','INSERT') AS no_signed_approval_write,
 pg_catalog.has_table_privilege('service_role',
  'public.schoolnet_sibling_parent_approvals','SELECT') AS server_approval_read,
 pg_catalog.has_table_privilege('service_role',
  'public.schoolnet_sibling_parent_approvals','INSERT') AS server_approval_write,
 NOT pg_catalog.has_function_privilege('anon',
  'schoolnet_student_private.guard_sibling_parent_approval()','EXECUTE') AS no_anon_trigger_execute,
 NOT pg_catalog.has_function_privilege('authenticated',
  'schoolnet_student_private.link_verified_no_email_family_after_activation()','EXECUTE') AS no_signed_trigger_execute;

-- New private approval table must start empty immediately after install.
SELECT count(*) AS sibling_approvals_count
FROM public.schoolnet_sibling_parent_approvals;

-- This is not a backup. Verify the historical counts are unchanged:
SELECT
 (SELECT count(*) FROM public.profiles) AS profiles_count,
 (SELECT count(*) FROM public.parent_links) AS family_links_count,
 (SELECT count(*) FROM public.public_enrollment_requests) AS application_count,
 (SELECT count(*) FROM public.schoolnet_family_invitation_records) AS invitation_count,
 (SELECT count(*) FROM public.schoolnet_student_no_email_requests) AS student_registry_count,
 (SELECT count(*) FROM public.schoolnet_student_no_email_requests WHERE status='enabled') AS already_enabled;

-- Existing enabled students must still be associated with their existing Parent.
SELECT count(*) AS inconsistent_enabled_family_count
FROM public.schoolnet_student_no_email_requests s
LEFT JOIN public.parent_links l
 ON l.parent_id=s.parent_id AND l.student_id=s.student_auth_user_id
LEFT JOIN public.profiles p ON p.id=s.parent_id
WHERE s.status='enabled' AND
 (l.student_id IS NULL OR p.id IS NULL OR
  NOT (s.student_auth_user_id=ANY(COALESCE(p.child_ids,ARRAY[]::uuid[]))));

COMMIT;
