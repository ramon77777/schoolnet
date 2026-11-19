-- SCHOOLNET Lot 5D-K — ONLY FOR supabase start in an EMPTY, EPHEMERAL
-- local test project on 127.0.0.1:54322. NEVER run on a hosted project.
-- The fixture is deliberately minimal; it does NOT replace the 43
-- installed migrations, RPCs, policies, or hooks in SCHOOLNET production.
\set ON_ERROR_STOP on
DO $k_guard$
DECLARE local_addr inet;
BEGIN
  local_addr := inet_server_addr();
  IF current_database() <> 'postgres'
     OR local_addr IS NULL
     OR local_addr NOT IN ('127.0.0.1'::inet, '::1'::inet)
     OR current_setting('server_version_num')::integer < 150000
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relname='profiles')
  THEN
    RAISE EXCEPTION '5D-K: only an empty loopback Supabase local stack!'
      USING ERRCODE='42501';
  END IF;
END;
$k_guard$;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('parent','student','teacher','admin')),
 full_name text
);
CREATE TABLE public.parent_links (
 parent_id uuid NOT NULL REFERENCES public.profiles(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 PRIMARY KEY(parent_id,student_id)
);
CREATE TABLE public.school_years (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE,
 is_current boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX k_one_current_year
 ON public.school_years(is_current) WHERE is_current;
CREATE TABLE public.classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 school_year_id uuid NOT NULL REFERENCES public.school_years(id)
);
CREATE TABLE public.student_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 status text NOT NULL CHECK (status IN ('draft','active','completed','withdrawn')),
 UNIQUE (student_id,school_year_id)
);
CREATE TABLE public.student_enrollment_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id),
 storage_path text NOT NULL UNIQUE,
 size_bytes integer NOT NULL CHECK (size_bytes>0),
 uploaded_by uuid NOT NULL REFERENCES public.profiles(id)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollment_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY k_profile_self ON public.profiles
 FOR SELECT TO authenticated USING (id=(SELECT auth.uid()));
CREATE POLICY k_parent_own_links ON public.parent_links
 FOR SELECT TO authenticated USING (parent_id=(SELECT auth.uid()));
CREATE POLICY k_calendar_read ON public.school_years
 FOR SELECT TO authenticated USING (true);
CREATE POLICY k_class_read ON public.classes
 FOR SELECT TO authenticated USING (true);
-- The existing principal RLS has a policy but no table SELECT grant.
-- We reproduce that important difference explicitly and DO NOT
-- grant student_enrollments to the browser user.
CREATE POLICY k_parent_annual_rls ON public.student_enrollments
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.parent_links l
           WHERE l.parent_id=(SELECT auth.uid())
             AND l.student_id=student_id)
 );
CREATE POLICY k_admin_docs_read ON public.student_enrollment_documents
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p
           WHERE p.id=(SELECT auth.uid()) AND p.role='admin')
 );
GRANT SELECT ON public.profiles, public.parent_links,
 public.school_years, public.classes, public.student_enrollment_documents
 TO authenticated;
REVOKE ALL ON public.student_enrollments FROM anon,authenticated;
REVOKE ALL ON public.student_enrollment_documents FROM anon;
REVOKE ALL ON public.profiles, public.parent_links FROM anon;

-- Private document source bucket: authenticated Admin may insert and
-- download. Authenticated user deletion is DENIED, including Admin.
-- Retention bucket has NO policy for authenticated whatsoever.
CREATE POLICY k_storage_source_read ON storage.objects
 FOR SELECT TO authenticated
 USING (
  bucket_id='schoolnet-k-source'
  AND EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id=(SELECT auth.uid()) AND p.role='admin')
 );
CREATE POLICY k_storage_source_insert ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (
  bucket_id='schoolnet-k-source'
  AND EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id=(SELECT auth.uid()) AND p.role='admin')
 );
CREATE POLICY k_storage_source_delete_deny ON storage.objects
 FOR DELETE TO authenticated USING (false);

-- Assert the principal-important no-direct-grant contract.
DO $k_after$
BEGIN
 IF has_table_privilege('authenticated','public.student_enrollments','SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_class
            WHERE oid='public.student_enrollments'::regclass)
    OR EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='k_storage_source_delete_deny'
                 AND qual<>'false')
 THEN RAISE EXCEPTION '5D-K: isolated RLS policy assertion failed';
 END IF;
END;
$k_after$;
\echo '5D-K: isolated real PostgREST/Auth/Storage SQL fixture installed'
