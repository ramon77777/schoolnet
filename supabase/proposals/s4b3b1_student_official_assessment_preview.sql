-- SCHOOLNET V2 / S4-B.3-B.1 : APERCU EN LECTURE SEULE DES EVALUATIONS OFFICIELLES.
-- PROPOSITION UNIQUEMENT. NE PAS EXECUTER SUR SUPABASE PRINCIPAL SANS AUTORISATION.
-- Aucun flux de remise, correction, publication ou progression n'est ajoute.
-- Aucune reponse correcte, note, copie, URL de sujet ni identite eleve n'est exposee.
--
-- Deux couches : un RPC public SECURITY INVOKER pour le navigateur,
-- une fonction privee SECURITY DEFINER qui valide l'identite et l'affectation
-- scolaire officielle a CHAQUE consultation. Le schema prive n'est pas expose
-- par la Data API ; on ne cree pas de nouvelle policy V1 permissive.

DO $s4b3b1_preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.student_school_assessment_preview(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_assessment_preview(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NULL
 OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 OR to_regclass('public.assessments') IS NULL
 OR to_regclass('public.quiz_questions') IS NULL
 OR to_regclass('public.quiz_choices') IS NULL
 OR to_regprocedure('public.get_my_role()') IS NULL
 OR NOT has_schema_privilege('authenticated','schoolnet_private','USAGE')
 OR to_regprocedure('schoolnet_private.s4b3b0_is_official_assessment(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B3B1_PREFLIGHT_MISSING_DEPENDENCIES'; END IF;
END $s4b3b1_preflight$;

CREATE FUNCTION schoolnet_private.student_school_assessment_preview(
  p_course_id uuid,p_assessment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $s4b3b1$
DECLARE v_payload jsonb;
BEGIN
 IF p_course_id IS NULL OR p_assessment_id IS NULL
    OR auth.uid() IS NULL
    OR public.get_my_role()::text IS DISTINCT FROM 'student'
    OR NOT schoolnet_private.student_school_course_access(p_course_id)
 THEN
   RAISE EXCEPTION 'S4B3B1_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 SELECT jsonb_build_object(
    'courseId',a.course_id,
    'assessmentId',a.id,
    'title',a.title,
    'type',a.type::text,
    'description',a.description,
    'dueAt',a.due_at,
    'timeLimitMinutes',a.time_limit_minutes,
    'maxScore',a.max_score,
    'submissionMode',a.submission_mode,
    'examContentMode',a.exam_content_mode,
    'instructionFileName',a.instruction_file_name,
    'sectionTitle',sec.title,
    'questions',COALESCE((
       SELECT jsonb_agg(jsonb_build_object(
          'id',q.id,
          'type',q.question_type::text,
          'prompt',q.prompt,
          'orderIndex',q.order_index,
          'choices',COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'id',ch.id,'text',ch.choice_text,'orderIndex',ch.order_index
             ) ORDER BY ch.order_index,ch.id)
             FROM public.quiz_choices ch
             WHERE ch.question_id=q.id
          ),'[]'::jsonb)
       ) ORDER BY q.order_index,q.id)
       FROM public.quiz_questions q
       WHERE q.assessment_id=a.id
    ),'[]'::jsonb)
 ) INTO v_payload
 FROM public.assessments a
 JOIN schoolnet_private.school_assessment_links al
   ON al.assessment_id=a.id AND al.status='active'
 JOIN schoolnet_private.school_course_links l
   ON l.id=al.school_course_link_id
   AND l.course_id=a.course_id AND l.teacher_id=a.created_by
   AND l.status='active'
 JOIN public.courses co
   ON co.id=a.course_id AND co.status='active'
   AND co.created_by=l.teacher_id
 LEFT JOIN public.course_sections sec
   ON sec.id=a.section_id AND sec.course_id=a.course_id
 WHERE a.id=p_assessment_id AND a.course_id=p_course_id
   AND a.status::text='published'
   AND (a.section_id IS NULL OR sec.id IS NOT NULL)
   AND schoolnet_private.s4b3b0_is_official_assessment(a.id);

 IF v_payload IS NULL THEN
   RAISE EXCEPTION 'S4B3B1_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 -- La liste de sortie est volontairement explicite :
 -- jamais de SELECT *, ni is_correct, ni scores/corrections des soumissions.
 RETURN v_payload;
END;
$s4b3b1$;

REVOKE ALL ON FUNCTION schoolnet_private.student_school_assessment_preview(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.student_school_assessment_preview(uuid,uuid)
 TO authenticated;

CREATE FUNCTION public.schoolnet_student_school_assessment_preview(
 p_course_id uuid,p_assessment_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $s4b3b1$
 SELECT schoolnet_private.student_school_assessment_preview(p_course_id,p_assessment_id);
$s4b3b1$;

REVOKE ALL ON FUNCTION public.schoolnet_student_school_assessment_preview(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_school_assessment_preview(uuid,uuid)
 TO authenticated;

DO $s4b3b1_postflight$
DECLARE
 v_rpc oid:='public.schoolnet_student_school_assessment_preview(uuid,uuid)'::regprocedure;
 v_private oid:='schoolnet_private.student_school_assessment_preview(uuid,uuid)'::regprocedure;
BEGIN
 IF has_function_privilege('anon',v_rpc,'EXECUTE')
 OR NOT has_function_privilege('authenticated',v_rpc,'EXECUTE')
 OR has_function_privilege('anon',v_private,'EXECUTE')
 OR NOT has_function_privilege('authenticated',v_private,'EXECUTE')
 OR (SELECT prosecdef FROM pg_proc WHERE oid=v_rpc)
 OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_private)
 OR NOT (SELECT proconfig @> ARRAY['search_path=pg_catalog']::text[]
        FROM pg_proc WHERE oid=v_private)
 OR NOT (SELECT proconfig @> ARRAY['search_path=pg_catalog']::text[]
        FROM pg_proc WHERE oid=v_rpc)
 THEN RAISE EXCEPTION 'S4B3B1_POSTFLIGHT_FAILED'; END IF;
END $s4b3b1_postflight$;

SELECT 'S4B3B1_PREVIEW_SQL_PASS' AS result;
