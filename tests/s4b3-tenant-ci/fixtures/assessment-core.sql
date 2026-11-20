-- S4-B.3-A / CI JETABLE uniquement : sous-ensemble V1 des evaluations.
CREATE TYPE public.assessment_type AS ENUM ('quiz','assignment','exam');
CREATE TYPE public.assessment_status AS ENUM ('draft','published','closed');
CREATE TABLE public.assessments (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL REFERENCES public.courses(id),
 section_id uuid REFERENCES public.course_sections(id),
 type public.assessment_type NOT NULL,
 status public.assessment_status NOT NULL DEFAULT 'draft',
 title text NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
