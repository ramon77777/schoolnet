-- S4-C.3-C.3.3 - extended DISPOSABLE fixture for a Postgres 17 CI service.
-- Run after the six-table minimal school schema, PR #41 proposal and before PR #42.
-- This is not production DDL, and contains NO real student data.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
ALTER TABLE public.profiles ADD COLUMN role text NOT NULL DEFAULT 'student';
ALTER TABLE public.profiles ADD COLUMN full_name text;
ALTER TABLE public.academic_subjects ADD COLUMN name text;
ALTER TABLE public.academic_subjects ADD COLUMN sort_order integer DEFAULT 0;
CREATE FUNCTION public.get_my_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$
 SELECT role FROM public.profiles WHERE id=auth.uid();
$$;
CREATE TABLE public.schoolnet_school_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 user_id uuid NOT NULL,
 member_role text NOT NULL,
 status text NOT NULL,
 revoked_at timestamptz,
 UNIQUE (school_id,user_id)
);
CREATE TABLE public.schoolnet_school_student_class_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 school_year_id uuid NOT NULL,
 class_id uuid NOT NULL,
 student_id uuid NOT NULL,
 status text NOT NULL,
 revoked_at timestamptz,
 UNIQUE (class_id,student_id)
);
CREATE TABLE public.schoolnet_school_teacher_subject_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL,
 school_year_id uuid NOT NULL,
 class_id uuid NOT NULL,
 subject_id uuid NOT NULL,
 teacher_id uuid NOT NULL,
 status text NOT NULL,
 revoked_at timestamptz
);
CREATE TABLE public.courses (
 id uuid PRIMARY KEY,
 created_by uuid NOT NULL,
 status text NOT NULL
);
CREATE TABLE schoolnet_private.school_course_links (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL REFERENCES public.courses(id),
 school_id uuid NOT NULL,
 school_year_id uuid NOT NULL,
 class_id uuid NOT NULL,
 subject_id uuid NOT NULL,
 teacher_assignment_id uuid NOT NULL,
 teacher_id uuid NOT NULL,
 status text NOT NULL,
 revoked_at timestamptz
);
CREATE TABLE public.assessments (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL,
 created_by uuid NOT NULL,
 status text NOT NULL,
 max_score numeric
);
CREATE TABLE schoolnet_private.school_assessment_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL,
 school_course_link_id uuid NOT NULL,
 status text NOT NULL,
 revoked_at timestamptz
);
CREATE TABLE schoolnet_private.school_period_subject_coefficients (
 period_id uuid NOT NULL,
 class_id uuid NOT NULL,
 subject_id uuid NOT NULL,
 coefficient numeric NOT NULL CHECK(coefficient BETWEEN 0.25 AND 20),
 PRIMARY KEY(period_id,class_id,subject_id)
);
CREATE TABLE schoolnet_private.school_official_assessment_coefficients (
 assessment_id uuid PRIMARY KEY,
 period_id uuid NOT NULL,
 coefficient numeric NOT NULL CHECK(coefficient BETWEEN 0.25 AND 20),
 include_in_average boolean NOT NULL
);
CREATE TABLE public.assessment_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL,
 student_id uuid NOT NULL,
 status text NOT NULL,
 score numeric,
 published_at timestamptz,
 UNIQUE(assessment_id,student_id)
);
GRANT USAGE ON SCHEMA schoolnet_private,auth,public TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
-- No table access is granted to clients; private SECURITY DEFINER helpers must
-- enforce auth.uid(), real profile roles and active school membership themselves.
