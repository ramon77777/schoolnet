-- S4-C.3-C.3.5.3.2 -- COMPATIBILITY OVERLAY FOR DISPOSABLE LOCAL CI ONLY.
-- Must run AFTER official-averages-auth-schema.sql and BEFORE the two UNMODIFIED C3C3 SQL proposals.
-- This overlays the observed enum types and grants of SCHOOLNET V2 as of 2026-11-26.
-- A *minimal subset* of real RLS predicates is used; this is NOT a real production schema dump.
-- The CI connects via localhost 127.0.0.1:55422 and refuses non-local APIs in JS.
DO $only_local_fixture$
BEGIN
 IF to_regclass('public.profiles') IS NULL
 OR to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('schoolnet_private.school_official_curricula') IS NOT NULL
 OR to_regtype('public.user_role') IS NOT NULL
 OR to_regprocedure('auth.uid()') IS NULL
 THEN RAISE EXCEPTION 'C3C353_REQUIRES_UNMODIFIED_EPHEMERAL_BASE_SCHEMA'; END IF;
END $only_local_fixture$;

CREATE TYPE public.user_role AS ENUM ('admin','teacher','student','parent','school_admin');
CREATE TYPE public.assessment_status AS ENUM ('draft','published','closed');
CREATE TYPE public.submission_status AS ENUM ('in_progress','submitted','graded','published');
CREATE TYPE public.course_status AS ENUM ('active','archived');

DROP FUNCTION public.get_my_role();
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ALTER COLUMN role TYPE public.user_role USING role::public.user_role;
ALTER TABLE public.courses ALTER COLUMN status TYPE public.course_status USING status::public.course_status;
ALTER TABLE public.assessments ALTER COLUMN status TYPE public.assessment_status USING status::public.assessment_status;
ALTER TABLE public.assessment_submissions ALTER COLUMN status TYPE public.submission_status USING status::public.submission_status;

-- Mirror the observed *return type* and execution role; retain a SAFE fixed search_path.
CREATE FUNCTION public.get_my_role() RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $role$ SELECT role FROM public.profiles WHERE id=auth.uid(); $role$;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon,authenticated;

-- PostgreSQL GRANT and RLS are independent gates. The hosted system grants
-- SELECT on these three public tables, but RLS limits visible rows.
GRANT SELECT ON TABLE public.profiles TO anon,authenticated;
GRANT SELECT ON TABLE public.assessment_submissions TO anon,authenticated;
GRANT SELECT ON TABLE public.schoolnet_school_memberships TO authenticated;

-- Narrow synthetic test-only RLS subset; no claimed equivalence with every live policy.
-- Students may read only their own submissions; school admins obtain general
-- averages via the auth-checked RPC, not via raw submission reads.
CREATE POLICY c353_profiles_self_fixture ON public.profiles
 FOR SELECT TO authenticated USING (id=(SELECT auth.uid()));
CREATE POLICY c353_submissions_own_fixture ON public.assessment_submissions
 FOR SELECT TO authenticated USING (student_id=(SELECT auth.uid()));
CREATE POLICY c353_memberships_own_fixture ON public.schoolnet_school_memberships
 FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));

DO $verify_fixture$
BEGIN
 IF (SELECT a.atttypid FROM pg_catalog.pg_attribute a
     WHERE a.attrelid='public.profiles'::regclass AND a.attname='role')
     <> 'public.user_role'::regtype
 OR (SELECT a.atttypid FROM pg_catalog.pg_attribute a
     WHERE a.attrelid='public.assessment_submissions'::regclass AND a.attname='status')
     <> 'public.submission_status'::regtype
 OR NOT has_table_privilege('anon','public.assessment_submissions','SELECT')
 OR NOT has_table_privilege('authenticated','public.schoolnet_school_memberships','SELECT')
 OR has_table_privilege('authenticated','public.schoolnet_school_student_class_assignments','SELECT')
 THEN RAISE EXCEPTION 'C3C353_SCHEMA_PARITY_CONTRACT_FAILED'; END IF;
END $verify_fixture$;
SELECT 'C3C353_EPHEMERAL_COMPATIBILITY_TYPES_AND_GRANTS_READY' AS verdict;
