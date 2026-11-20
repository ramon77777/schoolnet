-- SCHOOLNET S4-A : fixture MINIMALE (CI local seulement).
-- Ne remplace jamais le schema historique, et ne doit jamais etre appliquee
-- au projet Supabase heberge. Seul le contrat requis par S3-C est reconstruit.
CREATE TYPE public.user_role AS ENUM ('admin','school_admin','teacher','student','parent');
CREATE SCHEMA schoolnet_private;
GRANT USAGE ON SCHEMA schoolnet_private TO authenticated;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY, role public.user_role NOT NULL, full_name text NOT NULL
);
CREATE FUNCTION public.get_my_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $f$
 SELECT role FROM public.profiles WHERE id=auth.uid();
$f$;
CREATE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $f$
 SELECT COALESCE((SELECT role='admin'::public.user_role
  FROM public.profiles WHERE id=auth.uid()),false);
$f$;

CREATE TABLE public.schoolnet_schools (
 id uuid PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL,
 status text NOT NULL CHECK(status IN ('active','suspended'))
);
CREATE TABLE public.schoolnet_school_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 member_role text NOT NULL CHECK(member_role IN('school_admin','teacher','student','parent')),
 status text NOT NULL CHECK(status IN('active','revoked')),
 UNIQUE(school_id,user_id)
);
ALTER TABLE public.schoolnet_school_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schoolnet_school_memberships FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.schoolnet_school_memberships TO authenticated;

CREATE TABLE public.schoolnet_school_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 action text NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 target_user_id uuid REFERENCES public.profiles(id),
 CONSTRAINT schoolnet_school_audit_action_check CHECK(action IN (
  'school_created','school_admin_assigned','school_admin_reactivated',
  'school_admin_invitation_prepared','school_admin_invitation_sent_declared',
  'school_class_created','school_teacher_linked','school_teacher_revoked',
  'school_teacher_reactivated','school_student_linked',
  'school_student_revoked','school_student_reactivated'
 ))
);
CREATE TABLE public.levels (id bigint PRIMARY KEY,name text NOT NULL);
CREATE TABLE public.school_years (id uuid PRIMARY KEY,name text NOT NULL);
CREATE TABLE public.classes (
 id uuid PRIMARY KEY,
 school_id uuid REFERENCES public.schoolnet_schools(id),
 level_id bigint NOT NULL REFERENCES public.levels(id),
 school_year_id uuid REFERENCES public.school_years(id),
 school_year text NOT NULL,name text NOT NULL,
 learning_context text NOT NULL CHECK(learning_context IN('school','legacy_unclassified'))
);
CREATE TABLE public.academic_subjects (
 id uuid PRIMARY KEY,name text NOT NULL,code text NOT NULL,
 is_active boolean NOT NULL,sort_order integer NOT NULL DEFAULT 0
);

-- Contrat de schoolnet_private.is_school_admin_for issu de la migration S2.
CREATE FUNCTION schoolnet_private.is_school_admin_for(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $school_admin$
 SELECT COALESCE(
   EXISTS(
     SELECT 1 FROM public.schoolnet_school_memberships m
     JOIN public.schoolnet_schools s ON s.id=m.school_id
     JOIN public.profiles p ON p.id=m.user_id
     WHERE m.user_id=auth.uid()
       AND m.school_id=p_school_id
       AND m.member_role='school_admin'
       AND m.status='active' AND s.status='active'
       AND p.role::text='school_admin'
   ),false
 );
$school_admin$;
REVOKE ALL ON FUNCTION schoolnet_private.is_school_admin_for(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.is_school_admin_for(uuid)
 TO authenticated;

-- Le preflight S3-C exige trois fonctions S2/S3.
-- Ces SIGNATURES sont des stubs CI; elles ne sont pas testées ici.
CREATE FUNCTION public.schoolnet_school_class_catalog(uuid)
RETURNS jsonb LANGUAGE sql AS $f$ SELECT '[]'::jsonb $f$;
CREATE FUNCTION public.schoolnet_school_teacher_roster(uuid)
RETURNS jsonb LANGUAGE sql AS $f$ SELECT '[]'::jsonb $f$;
CREATE FUNCTION public.schoolnet_school_student_roster(uuid)
RETURNS jsonb LANGUAGE sql AS $f$ SELECT '[]'::jsonb $f$;
