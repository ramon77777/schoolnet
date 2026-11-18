-- SCHOOLNET Lot 5D : SCHEMA SYNTHETIQUE PostgreSQL 17.
-- A utiliser EXCLUSIVEMENT sur la base ephemere schoolnet_lot5d_ci.
-- Representation minime du schema reel verifie le 18/11/2026; pas un dump.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA schoolnet_private;
CREATE TYPE public.user_role AS ENUM ('admin','teacher','student','parent','school_admin');
CREATE TYPE public.student_enrollment_status AS ENUM
  ('draft','active','withdrawn','completed','cancelled');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $uid$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$uid$;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY, role public.user_role NOT NULL, full_name text,
 class_name text, child_ids uuid[] DEFAULT '{}', updated_at timestamptz DEFAULT now()
);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path=pg_catalog AS $admin$
 SELECT EXISTS (SELECT 1 FROM public.profiles p
  WHERE p.id=auth.uid() AND p.role='admin'::public.user_role)
$admin$;
CREATE TABLE public.school_years (
 id uuid PRIMARY KEY, name text NOT NULL UNIQUE, starts_on date NOT NULL,
 ends_on date NOT NULL, is_current boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_on>starts_on)
);
CREATE UNIQUE INDEX idx_school_years_only_one_current
 ON public.school_years(is_current) WHERE is_current;
CREATE TABLE public.classes (
 id uuid PRIMARY KEY,level_id bigint NOT NULL,name text NOT NULL,
 school_year text NOT NULL,school_year_id uuid REFERENCES public.school_years(id),
 learning_context text NOT NULL DEFAULT 'legacy_unclassified',school_id uuid
);
CREATE TABLE public.class_students (
 class_id uuid NOT NULL REFERENCES public.classes(id),student_id uuid NOT NULL
 REFERENCES public.profiles(id),created_at timestamptz DEFAULT now(),
 PRIMARY KEY(class_id,student_id)
);
CREATE TABLE public.class_teachers (
 class_id uuid NOT NULL REFERENCES public.classes(id),teacher_id uuid NOT NULL
 REFERENCES public.profiles(id),PRIMARY KEY(class_id,teacher_id)
);
-- Real Supabase also enforces one legacy class per student/year via trigger.
-- Synthetic reimplementation of the audited public.ensure_student_single_class_per_school_year.
CREATE FUNCTION public.ensure_student_single_class_per_school_year()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $single$
DECLARE
  v_year text;
  v_role text;
  v_conflict boolean;
BEGIN
  SELECT c.school_year INTO v_year FROM public.classes c WHERE c.id=NEW.class_id;
  IF v_year IS NULL THEN RAISE EXCEPTION 'Classe introuvable.'; END IF;
  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id=NEW.student_id;
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'Seul un apprenant peut etre affecte a une classe.'; END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id=cs.class_id
    WHERE cs.student_id=NEW.student_id AND c.school_year=v_year
      AND cs.class_id<>NEW.class_id
      AND NOT (TG_OP='UPDATE' AND cs.class_id=OLD.class_id
               AND cs.student_id=OLD.student_id)
  ) INTO v_conflict;
  IF v_conflict THEN
    RAISE EXCEPTION 'Cet apprenant est deja affecte a une autre classe pour l annee scolaire %',v_year;
  END IF;
  RETURN NEW;
END;
$single$;
CREATE TRIGGER trg_class_students_single_class_per_year
 BEFORE INSERT OR UPDATE OF class_id,student_id ON public.class_students
 FOR EACH ROW EXECUTE FUNCTION public.ensure_student_single_class_per_school_year();
CREATE FUNCTION public.validate_class_student_role()
RETURNS trigger LANGUAGE plpgsql AS $v_role$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=NEW.student_id
                AND p.role='student'::public.user_role)
  THEN RAISE EXCEPTION 'class_students.student_id must reference a student'; END IF;
  RETURN NEW;
END;
$v_role$;
CREATE TRIGGER trg_validate_class_student_role
 BEFORE INSERT OR UPDATE ON public.class_students
 FOR EACH ROW EXECUTE FUNCTION public.validate_class_student_role();
CREATE SEQUENCE public.student_enrollment_number_seq;
CREATE TABLE public.student_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_number text NOT NULL UNIQUE,
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 status public.student_enrollment_status NOT NULL DEFAULT 'active',
 enrolled_on date NOT NULL DEFAULT current_date,
 admission_type text NOT NULL DEFAULT 'continuing',
 previous_school text, notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES public.profiles(id),
 updated_by uuid REFERENCES public.profiles(id),
 UNIQUE(student_id,school_year_id)
);
CREATE TABLE public.student_enrollment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id),
 event_type text NOT NULL,
 from_class_id uuid, to_class_id uuid,
 from_status public.student_enrollment_status,
 to_status public.student_enrollment_status,
 actor_id uuid,
 created_at timestamptz DEFAULT now()
);
-- Mimique du vrai trigger PREPARE: controle identite, annee, sequence.
CREATE FUNCTION public.fixture_prepare_enrollment() RETURNS trigger LANGUAGE plpgsql AS $prep$
DECLARE v_y public.school_years%ROWTYPE; v_c public.classes%ROWTYPE;
BEGIN
 SELECT * INTO v_y FROM public.school_years WHERE id=NEW.school_year_id;
 SELECT * INTO v_c FROM public.classes WHERE id=NEW.class_id;
 IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=NEW.student_id AND p.role='student')
 OR v_y.id IS NULL OR v_c.id IS NULL OR NOT
 (v_c.school_year_id=v_y.id OR (v_c.school_year_id IS NULL AND v_c.school_year=v_y.name))
 THEN RAISE EXCEPTION 'fixture: dossier ou classe invalide';END IF;
 IF NEW.enrollment_number IS NULL OR NEW.enrollment_number='' THEN
  NEW.enrollment_number:='INS-'||pg_catalog.substr(v_y.name,1,4)||'-'||
    pg_catalog.lpad(pg_catalog.nextval('public.student_enrollment_number_seq')::text,6,'0');
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$prep$;
CREATE TRIGGER trg_prepare_student_enrollment BEFORE INSERT OR UPDATE
 ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.fixture_prepare_enrollment();
CREATE FUNCTION public.fixture_log_event() RETURNS trigger LANGUAGE plpgsql AS $log$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO public.student_enrollment_events(enrollment_id,event_type,to_class_id,to_status,actor_id)
    VALUES(NEW.id,'created',NEW.class_id,NEW.status,auth.uid());
 ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO public.student_enrollment_events(
   enrollment_id,event_type,from_class_id,to_class_id,from_status,to_status,actor_id)
   VALUES(NEW.id,'status_changed',OLD.class_id,NEW.class_id,OLD.status,NEW.status,auth.uid());
 END IF;
 RETURN NEW;
END;
$log$;
CREATE TRIGGER trg_log_student_enrollment_event AFTER INSERT OR UPDATE
 ON public.student_enrollments FOR EACH ROW EXECUTE FUNCTION public.fixture_log_event();

CREATE TABLE public.schoolnet_school_student_class_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_year_id uuid NOT NULL,
 school_id uuid NOT NULL,class_id uuid NOT NULL,student_id uuid NOT NULL,
 status text DEFAULT 'active'
);
CREATE TABLE public.schoolnet_school_teacher_subject_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_year_id uuid NOT NULL,
 school_id uuid NOT NULL,class_id uuid NOT NULL,teacher_id uuid NOT NULL,
 subject_id uuid NOT NULL,status text DEFAULT 'active'
);
-- Simuler la RPC legacy qu'il faut neutraliser.
CREATE FUNCTION public.admin_set_current_school_year(p_school_year_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $old$
BEGIN
 UPDATE public.school_years SET is_current=false WHERE is_current;
 UPDATE public.school_years SET is_current=true WHERE id=p_school_year_id;
 RETURN jsonb_build_object('changed',true);
END;
$old$;
GRANT EXECUTE ON FUNCTION public.admin_set_current_school_year(uuid) TO authenticated;

INSERT INTO public.profiles(id,role,full_name,class_name) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin','Admin fictif',NULL),
 ('11111111-1111-4111-8111-111111111111','student','Eleve fictif 1','6e A'),
 ('22222222-2222-4222-8222-222222222222','student','Eleve fictif 2',NULL);
INSERT INTO public.school_years(id,name,starts_on,ends_on,is_current) VALUES
 ('20252025-2025-4025-8025-202520252025','2025-2026','2025-09-01','2026-07-31',true),
 ('20262026-2026-4026-8026-202620262026','2026-2027','2026-09-01','2027-07-31',false),
 ('20272027-2027-4027-8027-202720272027','2027-2028','2027-09-01','2028-07-31',false);
INSERT INTO public.classes(id,level_id,name,school_year,school_year_id) VALUES
 ('c0250000-0000-4000-8000-000000000025',6,'6e A','2025-2026',
  '20252025-2025-4025-8025-202520252025'),
 ('c0260000-0000-4000-8000-000000000026',6,'6e B','2026-2027',
  '20262026-2026-4026-8026-202620262026'),
 ('c0270000-0000-4000-8000-000000000027',7,'5e A','2026-2027',
  '20262026-2026-4026-8026-202620262026');
INSERT INTO public.student_enrollments(student_id,school_year_id,class_id,status) VALUES
 ('11111111-1111-4111-8111-111111111111','20252025-2025-4025-8025-202520252025',
  'c0250000-0000-4000-8000-000000000025','active');
INSERT INTO public.class_students(class_id,student_id) VALUES
 ('c0250000-0000-4000-8000-000000000025','11111111-1111-4111-8111-111111111111');
