-- S4-B.2 : dependances V1 additionnelles (sandbox Supabase jetable).
-- Ne jamais charger dans le projet heberge.
CREATE TYPE public.resource_type AS ENUM ('pdf','video','link','file','word','powerpoint');
CREATE TYPE public.resource_visibility AS ENUM ('public_to_course','teacher_only');
CREATE TABLE public.course_sections (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
 title text NOT NULL,
 order_index integer NOT NULL CHECK(order_index>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.resources (
 id uuid PRIMARY KEY,
 course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
 section_id uuid REFERENCES public.course_sections(id),
 type public.resource_type NOT NULL,
 title text NOT NULL,
 url text NOT NULL,
 is_downloadable boolean NOT NULL DEFAULT true,
 visibility public.resource_visibility NOT NULL,
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
