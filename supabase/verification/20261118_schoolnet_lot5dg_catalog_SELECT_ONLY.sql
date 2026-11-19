-- SCHOOLNET 5D-G | SELECT ONLY preflight. Never modifies schema or data.
-- Optional metadata-only inspection; no personal rows are requested.
-- Query source: actual Supabase Postgres catalog as of 18 Nov 2026.
SELECT c.relname AS object_name,c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
 AND c.relname IN ('school_years','student_enrollments','class_students',
                  'student_enrollment_documents','report_cards','parent_links')
ORDER BY c.relname;
SELECT c.relname AS object_name,t.tgname AS trigger_name,
       pg_catalog.pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal
 AND c.relname IN ('school_years','student_enrollments','class_students',
                   'student_enrollment_documents','report_cards')
ORDER BY c.relname,t.tgname;
SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public'
 AND tablename IN ('school_years','student_enrollments','class_students',
                   'student_enrollment_documents','report_cards')
ORDER BY tablename,policyname;
SELECT c.relname AS object_name,r.role_name,
       pg_catalog.has_table_privilege(r.role_name,c.oid,'SELECT') AS can_select,
       pg_catalog.has_table_privilege(r.role_name,c.oid,'INSERT') AS can_insert,
       pg_catalog.has_table_privilege(r.role_name,c.oid,'UPDATE') AS can_update,
       pg_catalog.has_table_privilege(r.role_name,c.oid,'DELETE') AS can_delete
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
CROSS JOIN (SELECT pg_catalog.unnest(ARRAY['anon','authenticated','service_role']) AS role_name) r
WHERE n.nspname='public' AND c.relname IN
 ('school_years','student_enrollments','class_students','student_enrollment_documents')
ORDER BY c.relname,r.role_name;
