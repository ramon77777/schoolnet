-- SCHOOLNET V2 / S4-B.3-A — PROPOSITION POUR CI ISOLEE.
-- Ne PAS executer sur Supabase principal sans autorisation distincte.
-- Opt-in explicite d'une evaluation existante vers son cours officiel.
-- PAS d'inscription, de remise, de correction ni de note dans cette etape.

DO $preflight$
BEGIN
 IF to_regclass('schoolnet_private.school_assessment_links') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_school_assessment_context(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_link_school_assessment(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_unlink_school_assessment(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_course_assessments(uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.teacher_course_class_summary(uuid)') IS NULL
 OR to_regprocedure('public.get_my_role()') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 OR to_regclass('public.assessments') IS NULL
 OR to_regclass('public.course_sections') IS NULL
 OR to_regclass('public.course_enrollments') IS NULL
 OR to_regclass('public.student_progress') IS NULL
 THEN RAISE EXCEPTION 'S4B3A_PREFLIGHT_FAILED'; END IF;
END;
$preflight$;

CREATE TABLE schoolnet_private.school_assessment_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL UNIQUE REFERENCES public.assessments(id) ON DELETE CASCADE,
 school_course_link_id uuid NOT NULL
   REFERENCES schoolnet_private.school_course_links(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 linked_at timestamptz NOT NULL DEFAULT now(),
 linked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 revoked_at timestamptz,
 revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 CONSTRAINT schoolnet_s4b3a_revoke_consistency CHECK (
   (status='active' AND revoked_at IS NULL AND revoked_by IS NULL)
   OR
   (status='revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
 )
);
CREATE INDEX schoolnet_s4b3a_course_link_idx
 ON schoolnet_private.school_assessment_links(school_course_link_id,status);
ALTER TABLE schoolnet_private.school_assessment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_private.school_assessment_links
 FROM PUBLIC,anon,authenticated;
-- Aucune policy = pas de lecture/ecriture directe par un client.

-- L'enseignant seul consulte le statut de rattachement de son evaluation.
-- Les controles tenant et classe passent par S4-B.2-R.
CREATE FUNCTION schoolnet_private.teacher_school_assessment_context(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $teacher_context$
DECLARE
 v_uid uuid:=auth.uid();
 v_course uuid;
 v_title text;
 v_status text;
 v_official boolean:=false;
 v_linked boolean:=false;
 v_school_name text;
 v_class_name text;
 v_subject_name text;
BEGIN
 IF v_uid IS NULL OR p_assessment_id IS NULL
   OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4B3A: compte enseignant requis.' USING ERRCODE='42501'; END IF;

 SELECT a.course_id,a.title,a.status::text
 INTO v_course,v_title,v_status
 FROM public.assessments a
 JOIN public.courses c ON c.id=a.course_id AND c.created_by=v_uid
 WHERE a.id=p_assessment_id AND a.created_by=v_uid;
 IF v_course IS NULL THEN
   RAISE EXCEPTION 'S4B3A: evaluation non autorisee.' USING ERRCODE='42501';
 END IF;

 v_official:=COALESCE(
   (schoolnet_private.teacher_course_class_summary(v_course)->>'isOfficial')::boolean,
   false
 );
 IF v_official THEN
   SELECT s.name,cl.name,sub.name
   INTO v_school_name,v_class_name,v_subject_name
   FROM schoolnet_private.school_course_links l
   JOIN public.schoolnet_schools s ON s.id=l.school_id AND s.status='active'
   JOIN public.classes cl ON cl.id=l.class_id
    AND cl.school_id=l.school_id AND cl.school_year_id=l.school_year_id
   JOIN public.academic_subjects sub ON sub.id=l.subject_id AND sub.is_active
   WHERE l.course_id=v_course AND l.teacher_id=v_uid AND l.status='active';
 END IF;

 SELECT EXISTS(
   SELECT 1 FROM schoolnet_private.school_assessment_links al
   JOIN schoolnet_private.school_course_links l
     ON l.id=al.school_course_link_id
   WHERE al.assessment_id=p_assessment_id AND al.status='active'
     AND l.course_id=v_course AND l.teacher_id=v_uid AND l.status='active'
 ) INTO v_linked;

 RETURN jsonb_build_object(
   'assessmentId',p_assessment_id,'courseId',v_course,
   'title',v_title,'status',v_status,
   'eligible',v_official,'linked',v_linked,
   'schoolName',v_school_name,'className',v_class_name,
   'subjectName',v_subject_name
 );
END;
$teacher_context$;

CREATE FUNCTION public.schoolnet_teacher_school_assessment_context(p_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_context$
 SELECT schoolnet_private.teacher_school_assessment_context(p_assessment_id);
$facade_context$;

-- Les ecritures sur le referentiel scolaire sont reservees au domaine
-- officiel et exigent TOUJOURS les droits enseignant et son cours affecte.
CREATE FUNCTION schoolnet_private.teacher_link_school_assessment(p_assessment_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog
AS $teacher_link$
DECLARE
 v_uid uuid:=auth.uid();
 v_course uuid;
 v_section uuid;
 v_link uuid;
 v_result uuid;
 v_headers text;
BEGIN
 IF v_uid IS NULL OR p_assessment_id IS NULL
   OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4B3A: compte enseignant requis.' USING ERRCODE='42501'; END IF;
 v_headers:=NULLIF(current_setting('request.headers',true),'');
 IF v_headers IS NULL OR (v_headers::jsonb->>'origin')
   IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
 THEN RAISE EXCEPTION 'S4B3A: ecriture reservee au site officiel.'
   USING ERRCODE='42501'; END IF;

 SELECT a.course_id,a.section_id INTO v_course,v_section
 FROM public.assessments a
 JOIN public.courses c
   ON c.id=a.course_id AND c.created_by=v_uid AND c.status='active'
 WHERE a.id=p_assessment_id AND a.created_by=v_uid
   AND a.status::text IN ('draft','published');
 IF v_course IS NULL THEN RAISE EXCEPTION 'S4B3A: evaluation non autorisee.'
  USING ERRCODE='42501'; END IF;
 IF v_section IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.course_sections sec
   WHERE sec.id=v_section AND sec.course_id=v_course
 ) THEN RAISE EXCEPTION 'S4B3A: chapitre incoherent.' USING ERRCODE='23514'; END IF;

 IF COALESCE(
   (schoolnet_private.teacher_course_class_summary(v_course)->>'isOfficial')::boolean,
   false
 ) IS NOT TRUE
 THEN RAISE EXCEPTION 'S4B3A: affectation scolaire inactive.'
   USING ERRCODE='42501'; END IF;

 -- Eviter toute conversion implicite d'un cours deja partage en V1.
 IF EXISTS (SELECT 1 FROM public.course_enrollments WHERE course_id=v_course)
 OR EXISTS (SELECT 1 FROM public.student_progress WHERE course_id=v_course)
 THEN RAISE EXCEPTION 'S4B3A: cours V1 partage incompatible.'
   USING ERRCODE='23514'; END IF;

 SELECT l.id INTO v_link
 FROM schoolnet_private.school_course_links l
 WHERE l.course_id=v_course AND l.teacher_id=v_uid AND l.status='active';
 IF v_link IS NULL THEN RAISE EXCEPTION 'S4B3A: cours officiel introuvable.'
   USING ERRCODE='42501'; END IF;

 INSERT INTO schoolnet_private.school_assessment_links AS al (
   assessment_id,school_course_link_id,linked_by
 ) VALUES (p_assessment_id,v_link,v_uid)
 ON CONFLICT(assessment_id) DO UPDATE
   SET status='active',revoked_at=NULL,revoked_by=NULL
   WHERE al.school_course_link_id=EXCLUDED.school_course_link_id
 RETURNING id INTO v_result;

 IF v_result IS NULL THEN
  RAISE EXCEPTION 'S4B3A: evaluation deja affectee a un autre cours.'
   USING ERRCODE='23505'; END IF;
 RETURN true;
END;
$teacher_link$;

CREATE FUNCTION public.schoolnet_teacher_link_school_assessment(p_assessment_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_link$
 SELECT schoolnet_private.teacher_link_school_assessment(p_assessment_id);
$facade_link$;

CREATE FUNCTION schoolnet_private.teacher_unlink_school_assessment(p_assessment_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog
AS $teacher_unlink$
DECLARE
 v_uid uuid:=auth.uid();
 v_headers text;
 v_count integer;
BEGIN
 IF v_uid IS NULL OR p_assessment_id IS NULL
   OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4B3A: compte enseignant requis.' USING ERRCODE='42501'; END IF;
 v_headers:=NULLIF(current_setting('request.headers',true),'');
 IF v_headers IS NULL OR (v_headers::jsonb->>'origin')
   IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
 THEN RAISE EXCEPTION 'S4B3A: ecriture reservee au site officiel.'
   USING ERRCODE='42501'; END IF;

 IF NOT EXISTS(
   SELECT 1 FROM public.assessments a
   JOIN public.courses co ON co.id=a.course_id AND co.created_by=v_uid
   WHERE a.id=p_assessment_id AND a.created_by=v_uid
 ) THEN RAISE EXCEPTION 'S4B3A: evaluation non autorisee.'
   USING ERRCODE='42501'; END IF;

 UPDATE schoolnet_private.school_assessment_links al
 SET status='revoked',revoked_at=now(),revoked_by=v_uid
 FROM schoolnet_private.school_course_links l
 WHERE al.assessment_id=p_assessment_id
   AND al.school_course_link_id=l.id
   AND l.teacher_id=v_uid
   AND al.status='active';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END;
$teacher_unlink$;

CREATE FUNCTION public.schoolnet_teacher_unlink_school_assessment(p_assessment_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_unlink$
 SELECT schoolnet_private.teacher_unlink_school_assessment(p_assessment_id);
$facade_unlink$;

-- Etape A : METADONNEES uniquement des evaluations publiees ET validees
-- explicitement. Aucune consigne detaillee, question, note ou soumission.
CREATE FUNCTION schoolnet_private.student_school_course_assessments(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $student_catalog$
DECLARE v_items jsonb;
BEGIN
 IF p_course_id IS NULL
   OR NOT schoolnet_private.student_school_course_access(p_course_id)
 THEN RAISE EXCEPTION 'S4B3A: cours non autorise.'
   USING ERRCODE='42501'; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'assessmentId',a.id,'title',a.title,'type',a.type::text,
   'dueAt',a.due_at
 ) ORDER BY a.due_at NULLS LAST,a.created_at,a.id),'[]'::jsonb)
 INTO v_items
 FROM schoolnet_private.school_assessment_links al
 JOIN public.assessments a ON a.id=al.assessment_id
 JOIN schoolnet_private.school_course_links l
   ON l.id=al.school_course_link_id
 JOIN public.courses co ON co.id=l.course_id AND co.status='active'
 WHERE al.status='active'
   AND l.status='active' AND l.course_id=p_course_id
   AND a.course_id=p_course_id AND a.status::text='published'
   AND a.created_by=l.teacher_id
   AND (a.section_id IS NULL OR EXISTS(
      SELECT 1 FROM public.course_sections sec
      WHERE sec.id=a.section_id AND sec.course_id=a.course_id
   ));
 RETURN jsonb_build_object('courseId',p_course_id,'assessments',v_items);
END;
$student_catalog$;

CREATE FUNCTION public.schoolnet_student_school_course_assessments(p_course_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_student$
 SELECT schoolnet_private.student_school_course_assessments(p_course_id);
$facade_student$;

REVOKE ALL ON FUNCTION
 schoolnet_private.teacher_school_assessment_context(uuid),
 public.schoolnet_teacher_school_assessment_context(uuid),
 schoolnet_private.teacher_link_school_assessment(uuid),
 public.schoolnet_teacher_link_school_assessment(uuid),
 schoolnet_private.teacher_unlink_school_assessment(uuid),
 public.schoolnet_teacher_unlink_school_assessment(uuid),
 schoolnet_private.student_school_course_assessments(uuid),
 public.schoolnet_student_school_course_assessments(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 schoolnet_private.teacher_school_assessment_context(uuid),
 public.schoolnet_teacher_school_assessment_context(uuid),
 schoolnet_private.teacher_link_school_assessment(uuid),
 public.schoolnet_teacher_link_school_assessment(uuid),
 schoolnet_private.teacher_unlink_school_assessment(uuid),
 public.schoolnet_teacher_unlink_school_assessment(uuid),
 schoolnet_private.student_school_course_assessments(uuid),
 public.schoolnet_student_school_course_assessments(uuid)
TO authenticated;

DO $postflight$
DECLARE f record; c integer:=0;
BEGIN
 FOR f IN
  SELECT n.nspname,p.oid,p.prosecdef,p.provolatile,
    p.proconfig @> ARRAY['search_path=pg_catalog']::text[] AS safe_path
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname IN (
    'schoolnet_teacher_school_assessment_context',
    'schoolnet_teacher_link_school_assessment',
    'schoolnet_teacher_unlink_school_assessment',
    'schoolnet_student_school_course_assessments'))
   OR (n.nspname='schoolnet_private' AND p.proname IN (
    'teacher_school_assessment_context','teacher_link_school_assessment',
    'teacher_unlink_school_assessment','student_school_course_assessments'))
 LOOP
  c:=c+1;
  IF (f.nspname='public' AND f.prosecdef)
   OR (f.nspname='schoolnet_private' AND NOT f.prosecdef)
   OR NOT f.safe_path
   OR has_function_privilege('anon',f.oid,'EXECUTE')
   OR NOT has_function_privilege('authenticated',f.oid,'EXECUTE')
  THEN RAISE EXCEPTION 'S4B3A_PRIVILEGES_INCORRECTS'; END IF;
 END LOOP;
 IF c<>8 THEN RAISE EXCEPTION 'S4B3A_EXPECTED_EIGHT_FUNCTIONS'; END IF;
 IF has_table_privilege('authenticated','schoolnet_private.school_assessment_links','SELECT')
  OR has_table_privilege('anon','schoolnet_private.school_assessment_links','SELECT')
  OR NOT (SELECT relrowsecurity FROM pg_class
    WHERE oid='schoolnet_private.school_assessment_links'::regclass)
 THEN RAISE EXCEPTION 'S4B3A_PRIVATE_TABLE_EXPOSED'; END IF;
END;
$postflight$;
