-- SCHOOLNET Lot 5D-H: fake Storage objects to test RLS, NOT Supabase Storage API.
-- Only disposable schoolnet_lot5d_ci PostgreSQL 17. NOT a real Storage dump.
\set ON_ERROR_STOP on
DO $lot5dh_fixture_guard$
BEGIN
 IF pg_catalog.current_database()<>'schoolnet_lot5d_ci'
  OR pg_catalog.current_setting('server_version_num')::integer<170000
 THEN RAISE EXCEPTION '5D-H: disposable PG17 required'; END IF;
END;
$lot5dh_fixture_guard$;
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO authenticated;
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 bucket_id text NOT NULL,
 name text NOT NULL,
 UNIQUE(bucket_id,name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
-- Deliberately SIMPLIFIED: real policies include an EXISTS enrollment
-- subquery whose SELECT privileges must be tested with an isolated Auth and
-- Storage API before release. Here we isolate the Storage DELETE invariant.
CREATE POLICY schoolnet_enrollment_docs_storage_admin_select
 ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='student-enrollment-documents' AND public.is_admin());
CREATE POLICY schoolnet_enrollment_docs_storage_admin_insert
 ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='student-enrollment-documents' AND public.is_admin());
CREATE POLICY schoolnet_enrollment_docs_storage_admin_delete
 ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id='student-enrollment-documents' AND public.is_admin());
\echo 'H: temporary Storage RLS fixture loaded (not Storage API)'
