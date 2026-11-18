-- SCHOOLNET 5D-G: selected real column names, grants and RLS for isolated PG17.
-- Source: read-only pg_catalog and information_schema audit 18 Nov 2026.
-- Difference: uploaded_by references public.profiles here, auth.users in production.
-- This fixture is NOT a production schema clone.
\set ON_ERROR_STOP on
DO $5dg_base_guard$
BEGIN
 IF pg_catalog.current_database()<>'schoolnet_lot5d_ci'
    OR pg_catalog.current_setting('server_version_num')::int<170000
 THEN RAISE EXCEPTION '5D-G: disposable PG17 only'; END IF;
END;
$5dg_base_guard$;
CREATE TABLE public.student_enrollment_documents (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
 document_type text NOT NULL CHECK (document_type IN ('birth_certificate','previous_report',
   'transfer_certificate','identity_photo','other')),
 original_filename text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(original_filename)) BETWEEN 1 AND 255),
 storage_path text NOT NULL UNIQUE CHECK (
  pg_catalog.split_part(storage_path,'/',1)=enrollment_id::text AND
  pg_catalog.split_part(storage_path,'/',2)<>'' AND
  pg_catalog.split_part(storage_path,'/',3)=''),
 mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
 size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
 uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollment_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.school_years TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.class_students TO anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.student_enrollment_documents TO authenticated;
CREATE POLICY fixture_admin_school_years ON public.school_years
 FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY fixture_admin_class_students ON public.class_students
 FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY fixture_admin_documents ON public.student_enrollment_documents
 FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
\echo '5D-G: aligned core grants/RLS and document columns on fictitious PostgreSQL 17'
