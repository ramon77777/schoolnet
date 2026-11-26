-- SCHOOLNET S4-C.3-C.3.5.2 -- DISPOSABLE Supabase integration fixture ONLY.
-- This deliberately relies on the REAL local auth.uid() (GoTrue JWT), and
-- never redefines the auth schema, anon/authenticated roles or PostgREST.
-- It mirrors only the SCHOOLNET V2 relationships used by the unmodified
-- proposed official school-admin RPC. NOT a production migration.
DO $guard$
BEGIN
 IF to_regclass('public.schoolnet_schools') IS NOT NULL
 OR to_regclass('public.profiles') IS NOT NULL
 OR to_regclass('schoolnet_private.school_official_curricula') IS NOT NULL
 OR to_regprocedure('auth.uid()') IS NULL
 THEN RAISE EXCEPTION 'C3C352_REQUIRES_PRISTINE_LOCAL_SUPABASE'; END IF;
END $guard$;

CREATE SCHEMA schoolnet_private;
REVOKE ALL ON SCHEMA schoolnet_private FROM PUBLIC,anon,authenticated;
-- Existence of this schema does NOT expose it in the Supabase Data API.
GRANT USAGE ON SCHEMA schoolnet_private TO authenticated;

CREATE TABLE public.schoolnet_schools (
 id uuid PRIMARY KEY, status text NOT NULL CHECK (status IN ('active','suspended'))
);
CREATE TABLE public.school_years(id uuid PRIMARY KEY);
CREATE TABLE public.classes (
 id uuid PRIMARY KEY,
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 learning_context text NOT NULL
);
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK(role IN ('school_admin','teacher','parent','student')),
 full_name text
);
CREATE TABLE public.academic_subjects (
 id uuid PRIMARY KEY,is_active boolean NOT NULL,
 name text NOT NULL,sort_order integer NOT NULL DEFAULT 0
);
CREATE FUNCTION public.get_my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $role$
 SELECT role FROM public.profiles WHERE id=auth.uid();
$role$;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

CREATE TABLE schoolnet_private.school_grading_periods (
 id uuid PRIMARY KEY,
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 is_locked boolean NOT NULL DEFAULT false
);
CREATE TABLE public.schoolnet_school_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 member_role text NOT NULL,
 status text NOT NULL,
 revoked_at timestamptz,
 UNIQUE(school_id,user_id)
);
CREATE TABLE public.schoolnet_school_student_class_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL,revoked_at timestamptz,
 UNIQUE(class_id,student_id)
);
CREATE TABLE public.schoolnet_school_teacher_subject_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id),
 teacher_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL,revoked_at timestamptz
);
CREATE TABLE public.courses (
 id uuid PRIMARY KEY,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL
);
CREATE TABLE schoolnet_private.school_course_links (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL REFERENCES public.courses(id),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id),
 teacher_assignment_id uuid NOT NULL REFERENCES public.schoolnet_school_teacher_subject_assignments(id),
 teacher_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL,revoked_at timestamptz
);
CREATE TABLE public.assessments (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL REFERENCES public.courses(id),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL,
 max_score numeric
);
CREATE TABLE schoolnet_private.school_assessment_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES public.assessments(id),
 school_course_link_id uuid NOT NULL REFERENCES schoolnet_private.school_course_links(id),
 status text NOT NULL,revoked_at timestamptz
);
CREATE TABLE schoolnet_private.school_period_subject_coefficients (
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id),
 coefficient numeric NOT NULL CHECK(coefficient BETWEEN 0.25 AND 20),
 PRIMARY KEY(period_id,class_id,subject_id)
);
CREATE TABLE schoolnet_private.school_official_assessment_coefficients (
 assessment_id uuid PRIMARY KEY REFERENCES public.assessments(id),
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id),
 coefficient numeric NOT NULL CHECK(coefficient BETWEEN 0.25 AND 20),
 include_in_average boolean NOT NULL
);
CREATE TABLE public.assessment_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES public.assessments(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 status text NOT NULL,
 score numeric,published_at timestamptz,
 UNIQUE(assessment_id,student_id)
);

-- Harden public tables, even if Supabase local defaults would grant to client.
DO $lock$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
 'schoolnet_schools','school_years','classes','profiles','academic_subjects',
 'schoolnet_school_memberships','schoolnet_school_student_class_assignments',
 'schoolnet_school_teacher_subject_assignments','courses','assessments',
 'assessment_submissions'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $lock$;
ALTER TABLE schoolnet_private.school_grading_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_course_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_assessment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_period_subject_coefficients ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_official_assessment_coefficients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA schoolnet_private FROM PUBLIC,anon,authenticated;
SELECT 'C3C352_REAL_AUTH_SCHEMA_READY_LOCAL_ONLY' AS verdict;
