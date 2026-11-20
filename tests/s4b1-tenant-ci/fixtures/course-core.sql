-- SCHOOLNET S4-B.1: dependances V1 minimales en Supabase local CI uniquement.
-- Les tables historiques reelles du projet principal ne sont jamais modifiees.
CREATE TYPE public.course_status AS ENUM ('active','archived');
CREATE TABLE public.courses (
 id uuid PRIMARY KEY,
 title text NOT NULL,
 description text,
 level_id bigint REFERENCES public.levels(id),
 class_id uuid REFERENCES public.classes(id),
 status public.course_status NOT NULL,
 join_code text,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.course_enrollments (
 course_id uuid NOT NULL REFERENCES public.courses(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,student_id)
);
CREATE TABLE public.course_teachers (
 course_id uuid NOT NULL REFERENCES public.courses(id),
 teacher_id uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz DEFAULT now(),
 PRIMARY KEY(course_id,teacher_id)
);
CREATE TABLE public.student_progress (
 course_id uuid NOT NULL REFERENCES public.courses(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 progress_percent numeric DEFAULT 0,
 PRIMARY KEY(course_id,student_id)
);
CREATE TABLE public.course_subjects (
 course_id uuid NOT NULL REFERENCES public.courses(id),
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id),
 PRIMARY KEY(course_id,subject_id)
);
