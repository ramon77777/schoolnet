-- SCHOOLNET V2 S4-B.1 — PROPOSITION POUR SANDBOX UNIQUEMENT.
-- Ne pas appliquer sur Supabase principal avant autorisation explicite.
-- Rattachement VOLONTAIRE du createur enseignant d'un cours V1
-- a UNE affectation officielle S3-C, sans changer courses ni RLS V1.
-- L'appartenance au nouveau catalogue N'ACCORDE AUCUN acces aux ressources
-- ou inscriptions : ce volet sera traite en S4-B.2 avec une recette dediee.
DO $preflight_b1$
BEGIN
 IF to_regclass('schoolnet_private.school_course_links') IS NOT NULL
   OR to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)') IS NULL
   OR to_regprocedure('public.get_my_role()') IS NULL
   OR to_regclass('public.courses') IS NULL
   OR to_regclass('public.course_enrollments') IS NULL
   OR to_regclass('public.course_teachers') IS NULL
   OR to_regclass('public.student_progress') IS NULL
   OR to_regclass('public.course_subjects') IS NULL
   OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
 THEN
   RAISE EXCEPTION 'S4-B.1: preconditions S3-C/V1 absentes ou pont deja installe.';
 END IF;
END;
$preflight_b1$;

CREATE TABLE schoolnet_private.school_course_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_id uuid NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
 class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
 school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
 teacher_assignment_id uuid NOT NULL
  REFERENCES public.schoolnet_school_teacher_subject_assignments(id) ON DELETE RESTRICT,
 teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 linked_at timestamptz NOT NULL DEFAULT now(),
 linked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 revoked_at timestamptz,
 revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 CONSTRAINT schoolnet_s4b1_revoke_consistency CHECK (
  (status='active' AND revoked_at IS NULL AND revoked_by IS NULL)
  OR (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
 )
);
CREATE INDEX schoolnet_s4b1_course_school_idx
  ON schoolnet_private.school_course_links(school_id,status,class_id);
CREATE INDEX schoolnet_s4b1_course_teacher_idx
  ON schoolnet_private.school_course_links(teacher_id,status);

-- Defense en profondeur, prive meme si le schema venait a etre expose.
ALTER TABLE schoolnet_private.school_course_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_private.school_course_links
  FROM PUBLIC,anon,authenticated;
-- Aucune policy, aucun acces table direct aux clients.

-- Retourne uniquement les affectations officielles propres au professeur
-- et ses propres cours explicitement rattaches.
CREATE FUNCTION schoolnet_private.teacher_school_course_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $ctx$
DECLARE v_uid uuid:=auth.uid();v_result jsonb;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4-B.1: enseignant authentifie requis.' USING ERRCODE='42501'; END IF;

 SELECT jsonb_build_object(
 'assignments',COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'assignmentId',a.id,'schoolId',a.school_id,'schoolName',s.name,
     'classId',c.id,'className',c.name,'schoolYear',c.school_year,
     'subjectName',subject.name
   ) ORDER BY s.name,c.name,subject.name,a.id)
   FROM public.schoolnet_school_teacher_subject_assignments a
   JOIN public.schoolnet_schools s ON s.id=a.school_id AND s.status='active'
   JOIN public.classes c ON c.id=a.class_id AND c.school_id=a.school_id
     AND c.school_year_id=a.school_year_id AND c.learning_context='school'
   JOIN public.academic_subjects subject ON subject.id=a.subject_id AND subject.is_active
   JOIN public.schoolnet_school_memberships m
     ON m.school_id=a.school_id AND m.user_id=v_uid
     AND m.member_role='teacher' AND m.status='active'
   WHERE a.teacher_id=v_uid AND a.status='active'
 ),'[]'::jsonb),
 'links',COALESCE((
   SELECT jsonb_agg(jsonb_build_object(
     'courseId',c.id,'courseTitle',c.title,
     'schoolId',l.school_id,'schoolName',s.name,
     'classId',sc.id,'className',sc.name,'schoolYear',sc.school_year,
     'subjectName',sub.name,'assignmentId',l.teacher_assignment_id
   ) ORDER BY s.name,sc.name,c.title,c.id)
   FROM schoolnet_private.school_course_links l
   JOIN public.courses c ON c.id=l.course_id
   JOIN public.schoolnet_schools s ON s.id=l.school_id AND s.status='active'
   JOIN public.classes sc ON sc.id=l.class_id AND sc.school_id=l.school_id
     AND sc.school_year_id=l.school_year_id AND sc.learning_context='school'
   JOIN public.academic_subjects sub ON sub.id=l.subject_id
   JOIN public.schoolnet_school_teacher_subject_assignments a
     ON a.id=l.teacher_assignment_id AND a.status='active'
     AND a.school_id=l.school_id AND a.teacher_id=v_uid
     AND a.class_id=l.class_id AND a.subject_id=l.subject_id
   JOIN public.schoolnet_school_memberships m
     ON m.school_id=l.school_id AND m.user_id=v_uid
     AND m.member_role='teacher' AND m.status='active'
   WHERE l.teacher_id=v_uid AND l.status='active'
 ),'[]'::jsonb)) INTO v_result;

 RETURN v_result;
END;
$ctx$;

CREATE FUNCTION public.schoolnet_teacher_school_course_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_ctx$
 SELECT schoolnet_private.teacher_school_course_context();
$facade_ctx$;

-- Controle production : un Origin ne confere jamais de droits a lui seul.
-- Le role, l'identite, le createur, l'affectation et la classe sont
-- revalides a chaque appel, en plus de l'Origin exact.
CREATE FUNCTION schoolnet_private.teacher_link_school_course(
 p_course_id uuid,p_assignment_id uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog
AS $link$
DECLARE
 v_uid uuid:=auth.uid();
 v_headers text;
 v_school uuid;v_class uuid;v_year uuid;v_subject uuid;v_level bigint;
 v_link uuid;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
   OR p_course_id IS NULL OR p_assignment_id IS NULL
 THEN RAISE EXCEPTION 'S4-B.1: enseignant authentifie requis.' USING ERRCODE='42501'; END IF;

 v_headers:=NULLIF(current_setting('request.headers',true),'');
 IF v_headers IS NULL OR (v_headers::jsonb->>'origin')
   IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
 THEN RAISE EXCEPTION 'S4-B.1: ecriture interdite hors site officiel.'
   USING ERRCODE='42501'; END IF;

 SELECT a.school_id,a.class_id,a.school_year_id,a.subject_id,c.level_id
 INTO v_school,v_class,v_year,v_subject,v_level
 FROM public.schoolnet_school_teacher_subject_assignments a
 JOIN public.schoolnet_schools s ON s.id=a.school_id AND s.status='active'
 JOIN public.classes c ON c.id=a.class_id AND c.school_id=a.school_id
   AND c.school_year_id=a.school_year_id AND c.learning_context='school'
 JOIN public.academic_subjects sub ON sub.id=a.subject_id AND sub.is_active
 JOIN public.schoolnet_school_memberships m
   ON m.school_id=a.school_id AND m.user_id=v_uid
   AND m.member_role='teacher' AND m.status='active'
 WHERE a.id=p_assignment_id AND a.teacher_id=v_uid AND a.status='active';
 IF v_school IS NULL THEN
  RAISE EXCEPTION 'S4-B.1: affectation ou affiliation inactive/non autorisee.'
  USING ERRCODE='42501'; END IF;

 IF NOT EXISTS(
   SELECT 1 FROM public.courses c
   WHERE c.id=p_course_id AND c.created_by=v_uid AND c.status='active'
     AND (c.class_id IS NULL OR c.class_id=v_class)
     AND (c.level_id IS NULL OR c.level_id=v_level)
 ) THEN
   RAISE EXCEPTION 'S4-B.1: cours propre, actif et compatible requis.'
   USING ERRCODE='42501'; END IF;

 -- Aucun eleve V1, progression ou co-enseignant exterieur ne doit
 -- etre transporte implicitement dans un contexte officiel.
 IF EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=p_course_id)
 OR EXISTS(SELECT 1 FROM public.student_progress sp WHERE sp.course_id=p_course_id)
 OR EXISTS(SELECT 1 FROM public.course_teachers ct
             WHERE ct.course_id=p_course_id AND ct.teacher_id<>v_uid)
 OR EXISTS(SELECT 1 FROM public.course_subjects cs
             WHERE cs.course_id=p_course_id AND cs.subject_id<>v_subject)
 THEN
   RAISE EXCEPTION 'S4-B.1: cours libre deja partage ou matiere incompatible.'
   USING ERRCODE='23514'; END IF;

 INSERT INTO schoolnet_private.school_course_links AS l (
   course_id,school_id,class_id,school_year_id,teacher_assignment_id,
   teacher_id,subject_id,linked_by
 ) VALUES (
   p_course_id,v_school,v_class,v_year,p_assignment_id,v_uid,v_subject,v_uid
 )
 ON CONFLICT (course_id) DO UPDATE
   SET status='active',revoked_at=NULL,revoked_by=NULL
   WHERE l.school_id=EXCLUDED.school_id
     AND l.class_id=EXCLUDED.class_id
     AND l.school_year_id=EXCLUDED.school_year_id
     AND l.teacher_id=EXCLUDED.teacher_id
     AND l.subject_id=EXCLUDED.subject_id
     AND l.teacher_assignment_id=EXCLUDED.teacher_assignment_id
 RETURNING id INTO v_link;

 IF v_link IS NULL THEN
  RAISE EXCEPTION 'S4-B.1: cours deja rattache a une autre affectation.'
  USING ERRCODE='23505'; END IF;
 RETURN v_link;
END;
$link$;

CREATE FUNCTION public.schoolnet_teacher_link_school_course(
 p_course_id uuid,p_assignment_id uuid)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_link$
 SELECT schoolnet_private.teacher_link_school_course(p_course_id,p_assignment_id);
$facade_link$;

-- Retrait possible uniquement pour le createur enseignant ; l'historique
-- minimal reste en table privee, aucun cours V1 n'est efface ou modifie.
CREATE FUNCTION schoolnet_private.teacher_unlink_school_course(p_course_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog
AS $unlink$
DECLARE v_uid uuid:=auth.uid();v_headers text;v_id uuid;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
   OR p_course_id IS NULL
 THEN RAISE EXCEPTION 'S4-B.1: enseignant authentifie requis.'
   USING ERRCODE='42501'; END IF;
 v_headers:=NULLIF(current_setting('request.headers',true),'');
 IF v_headers IS NULL OR (v_headers::jsonb->>'origin')
   IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
 THEN RAISE EXCEPTION 'S4-B.1: ecriture interdite hors site officiel.'
   USING ERRCODE='42501'; END IF;

 UPDATE schoolnet_private.school_course_links l
 SET status='revoked',revoked_at=now(),revoked_by=v_uid
 WHERE l.course_id=p_course_id AND l.teacher_id=v_uid AND l.status='active'
 RETURNING id INTO v_id;
 RETURN v_id IS NOT NULL;
END;
$unlink$;

CREATE FUNCTION public.schoolnet_teacher_unlink_school_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_unlink$
 SELECT schoolnet_private.teacher_unlink_school_course(p_course_id);
$facade_unlink$;

-- Catalogue admin local : seulement les cours effectivement relies a
-- son ecole et affectation ACTIVE. Jamais de noms/identifiants d'eleves.
CREATE FUNCTION schoolnet_private.school_course_catalog(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $catalog$
DECLARE v_items jsonb;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,false);
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'courseId',co.id,'courseTitle',co.title,
   'classId',cl.id,'className',cl.name,'schoolYear',cl.school_year,
   'subjectName',sub.name,'teacherName',p.full_name
 ) ORDER BY cl.name,co.title,co.id),'[]'::jsonb)
 INTO v_items
 FROM schoolnet_private.school_course_links l
 JOIN public.courses co ON co.id=l.course_id AND co.status='active'
 JOIN public.classes cl ON cl.id=l.class_id
  AND cl.school_id=l.school_id AND cl.school_year_id=l.school_year_id
  AND cl.learning_context='school'
 JOIN public.schoolnet_schools s ON s.id=l.school_id AND s.status='active'
 JOIN public.schoolnet_school_teacher_subject_assignments a
  ON a.id=l.teacher_assignment_id AND a.status='active'
  AND a.school_id=l.school_id AND a.class_id=l.class_id
  AND a.teacher_id=l.teacher_id AND a.subject_id=l.subject_id
 JOIN public.schoolnet_school_memberships m
  ON m.school_id=l.school_id AND m.user_id=l.teacher_id
  AND m.member_role='teacher' AND m.status='active'
 JOIN public.academic_subjects sub ON sub.id=l.subject_id AND sub.is_active
 JOIN public.profiles p ON p.id=l.teacher_id AND p.role::text='teacher'
 WHERE l.school_id=p_school_id AND l.status='active';
 RETURN jsonb_build_object('schoolId',p_school_id,'courses',v_items);
END;
$catalog$;

CREATE FUNCTION public.schoolnet_school_course_catalog(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_catalog$
 SELECT schoolnet_private.school_course_catalog(p_school_id);
$facade_catalog$;

-- Restriction explicite sur LES HUIT fonctions, facade publiques invoker.
REVOKE ALL ON FUNCTION
 schoolnet_private.teacher_school_course_context(),
 schoolnet_private.teacher_link_school_course(uuid,uuid),
 schoolnet_private.teacher_unlink_school_course(uuid),
 schoolnet_private.school_course_catalog(uuid),
 public.schoolnet_teacher_school_course_context(),
 public.schoolnet_teacher_link_school_course(uuid,uuid),
 public.schoolnet_teacher_unlink_school_course(uuid),
 public.schoolnet_school_course_catalog(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 schoolnet_private.teacher_school_course_context(),
 schoolnet_private.teacher_link_school_course(uuid,uuid),
 schoolnet_private.teacher_unlink_school_course(uuid),
 schoolnet_private.school_course_catalog(uuid),
 public.schoolnet_teacher_school_course_context(),
 public.schoolnet_teacher_link_school_course(uuid,uuid),
 public.schoolnet_teacher_unlink_school_course(uuid),
 public.schoolnet_school_course_catalog(uuid)
 TO authenticated;

DO $verify_b1$
DECLARE r record;
BEGIN
 FOR r IN
   SELECT p.oid,p.prosecdef,n.nspname
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='public' AND p.proname IN (
    'schoolnet_teacher_school_course_context','schoolnet_teacher_link_school_course',
    'schoolnet_teacher_unlink_school_course','schoolnet_school_course_catalog'))
   OR (n.nspname='schoolnet_private' AND p.proname IN (
    'teacher_school_course_context','teacher_link_school_course',
    'teacher_unlink_school_course','school_course_catalog'))
 LOOP
  IF has_function_privilege('anon',r.oid,'EXECUTE')
   OR NOT has_function_privilege('authenticated',r.oid,'EXECUTE')
   OR (r.nspname='public' AND r.prosecdef)
   OR (r.nspname='schoolnet_private' AND NOT r.prosecdef)
  THEN RAISE EXCEPTION 'S4-B.1: privilege ou definer incoherent.'; END IF;
 END LOOP;
 IF has_table_privilege('authenticated',
   'schoolnet_private.school_course_links','SELECT')
   OR has_table_privilege('anon','schoolnet_private.school_course_links','SELECT')
   OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=
     'schoolnet_private.school_course_links'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'S4-B.1: table privee non protegee.'; END IF;
END;
$verify_b1$;
