-- C3-C.3.1/.2 disposable PostgreSQL 17 schema: ONLY fake objects.
-- Run against a fresh GH Actions service, never hosted SCHOOLNET.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA schoolnet_private;

CREATE TABLE public.schoolnet_schools (
 id uuid PRIMARY KEY, status text NOT NULL
);
CREATE TABLE public.school_years (
 id uuid PRIMARY KEY
);
CREATE TABLE public.classes (
 id uuid PRIMARY KEY,school_id uuid,school_year_id uuid,
 learning_context text
);
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY
);
CREATE TABLE public.academic_subjects (
 id uuid PRIMARY KEY,is_active boolean NOT NULL
);
CREATE TABLE schoolnet_private.school_grading_periods (
 id uuid PRIMARY KEY,school_id uuid,school_year_id uuid,is_locked boolean NOT NULL DEFAULT false
);
