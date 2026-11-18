-- SCHOOLNET Lot 5.C — READ-ONLY pre-install readiness report
-- Exact target: Supabase "schoolnet_2.0" (project ref: anttmbhaphkhmkoqsofd)
-- Select the correct project in Dashboard before execution.
-- SAFE TO RUN: SELECT only; no schema change, no user identifiers or secrets.
-- Re-run immediately BEFORE the separately authorized install transaction.
BEGIN TRANSACTION READ ONLY;

-- A row of boolean gates. ALL values must be TRUE before installation.
SELECT
 to_regclass('public.profiles') IS NOT NULL AS profiles_present,
 to_regclass('public.parent_links') IS NOT NULL AS family_links_present,
 to_regclass('public.public_enrollment_requests') IS NOT NULL AS applications_present,
 to_regclass('public.schoolnet_student_no_email_requests') IS NOT NULL AS student_registry_present,
 to_regclass('public.schoolnet_family_invitation_records') IS NOT NULL AS invitations_present,
 to_regnamespace('schoolnet_student_private') IS NOT NULL AS private_schema_present,
 to_regprocedure('public.schoolnet_no_email_activate_after_password(uuid,text,text)') IS NOT NULL AS existing_activation_rpc_present,
 to_regprocedure('schoolnet_student_private.guard_no_email_record()') IS NOT NULL AS registry_protection_present,
 to_regprocedure('schoolnet_student_private.guard_no_email_parent_links()') IS NOT NULL AS link_protection_present,
 to_regprocedure('schoolnet_student_private.guard_no_email_child_ids()') IS NOT NULL AS profile_protection_present,
 EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public.parent_links')
   AND conname='parent_links_unique' AND contype='u') AS unique_parent_student_present,
 to_regclass('public.schoolnet_sibling_parent_approvals') IS NULL AS sibling_table_not_installed,
 to_regprocedure('schoolnet_student_private.guard_sibling_parent_approval()') IS NULL AS sibling_guard_not_installed,
 to_regprocedure('schoolnet_student_private.link_verified_no_email_family_after_activation()') IS NULL AS family_autolink_not_installed,
 NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
   WHERE tgname IN ('schoolnet_sibling_approval_guard',
                    'schoolnet_student_no_email_autolink_family_after_activation')) AS no_conflicting_triggers;

-- Aggregate-only baseline: record these numbers in the private release log.
SELECT
 (SELECT count(*) FROM public.profiles) AS profiles_count,
 (SELECT count(*) FROM public.parent_links) AS family_links_count,
 (SELECT count(*) FROM public.public_enrollment_requests) AS application_count,
 (SELECT count(*) FROM public.schoolnet_family_invitation_records) AS invitation_count,
 (SELECT count(*) FROM public.schoolnet_student_no_email_requests) AS student_registry_count,
 (SELECT count(*) FROM public.schoolnet_student_no_email_requests WHERE status='enabled') AS already_enabled,
 (SELECT count(*) FROM public.schoolnet_student_no_email_requests WHERE status='sent_declared') AS waiting_activation,
 (SELECT count(*) FROM public.schoolnet_student_no_email_requests WHERE status='requires_review') AS manual_review;

-- Any result > 0 blocks installation pending a data-integrity review.
SELECT
 count(*) FILTER(WHERE s.student_auth_user_id IS NULL OR s.activated_at IS NULL
   OR l.student_id IS NULL OR parent.id IS NULL OR child.id IS NULL
   OR parent.role::text<>'parent' OR child.role::text<>'student'
   OR NOT (s.student_auth_user_id=ANY(
     COALESCE(parent.child_ids,ARRAY[]::uuid[])
   ))) AS already_enabled_but_unlinked,
 count(*) FILTER(WHERE EXISTS (
   SELECT 1 FROM public.parent_links AS different
   WHERE different.student_id=s.student_auth_user_id
     AND different.parent_id<>s.parent_id
 )) AS enabled_conflicting_parent_links
FROM public.schoolnet_student_no_email_requests AS s
LEFT JOIN public.parent_links AS l
 ON l.parent_id=s.parent_id AND l.student_id=s.student_auth_user_id
LEFT JOIN public.profiles AS parent ON parent.id=s.parent_id
LEFT JOIN public.profiles AS child ON child.id=s.student_auth_user_id
WHERE s.status='enabled';

-- Existing API permissions: neither anonymous nor signed-in users may call
-- the privileged activation RPC; the server role must remain permitted.
SELECT
 NOT pg_catalog.has_function_privilege('anon',
  'public.schoolnet_no_email_activate_after_password(uuid,text,text)','EXECUTE')
  AS anonymous_cannot_activate,
 NOT pg_catalog.has_function_privilege('authenticated',
  'public.schoolnet_no_email_activate_after_password(uuid,text,text)','EXECUTE')
  AS signed_in_cannot_activate,
 pg_catalog.has_function_privilege('service_role',
  'public.schoolnet_no_email_activate_after_password(uuid,text,text)','EXECUTE')
  AS server_can_activate;

COMMIT;
