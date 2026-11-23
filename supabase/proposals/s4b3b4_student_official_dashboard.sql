-- SCHOOLNET V2 S4-B.3-B.4 - PROPOSITION GitHub, NON INSTALLEE.
-- Resume read-only des cours et evaluations officiels autorises au seul eleve connecte.
-- Reutilise les catalogues B.2/B.3-A, sans aucune inscription fictive en V1.
-- Confidentialite stricte : pas de score avant la publication B.3.
DO $pre$
BEGIN
  IF to_regprocedure('schoolnet_private.student_school_courses()') IS NULL
    OR to_regprocedure('schoolnet_private.student_school_course_assessments(uuid)') IS NULL
    OR to_regprocedure('public.schoolnet_student_official_published_result(uuid,uuid)') IS NULL
    OR to_regclass('public.assessment_submissions') IS NULL
    OR to_regprocedure('public.get_my_role()') IS NULL
    OR to_regprocedure('schoolnet_private.student_official_dashboard()') IS NOT NULL
    OR to_regprocedure('public.schoolnet_student_official_dashboard()') IS NOT NULL
  THEN RAISE EXCEPTION 'S4B3B4_PREFLIGHT_FAILED'; END IF;
END $pre$;

CREATE FUNCTION schoolnet_private.student_official_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $dashboard$
DECLARE
  v_uid uuid:=auth.uid();
  v_catalog jsonb;
  v_assessments jsonb;
BEGIN
  IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'student'
  THEN RAISE EXCEPTION 'S4B3B4_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  -- Uniquement les cours deja autorises par les controles B.2 :
  -- affectations eleve/enseignant, classe, matiere, etablissement et annee actifs.
  v_catalog:=schoolnet_private.student_school_courses();

  -- La liste par cours B.3-A applique le rattachement explicite,
  -- la publication et le meme controle d'acces au cours.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assessmentId',a.id,
    'courseId',a.course_id,
    'title',a.title,
    'type',a.type::text,
    'dueAt',a.due_at,
    'maxScore',a.max_score,
    'status',COALESCE(s.status::text,'not_started'),
    'submittedAt',s.submitted_at,
    'score',CASE WHEN s.status::text='published'
                   AND s.published_at IS NOT NULL THEN s.score ELSE NULL END,
    'publishedAt',CASE WHEN s.status::text='published'
                   THEN s.published_at ELSE NULL END
  ) ORDER BY a.due_at NULLS LAST,a.id),'[]'::jsonb)
  INTO v_assessments
  FROM (
    SELECT DISTINCT ON (a.id)
      a.id,a.course_id,a.title,a.type,a.due_at,a.max_score
    FROM jsonb_array_elements(v_catalog->'courses') AS course(item)
    CROSS JOIN LATERAL jsonb_array_elements(
      (schoolnet_private.student_school_course_assessments(
        (course.item->>'courseId')::uuid
      ))->'assessments'
    ) AS catalog(item)
    JOIN public.assessments a
      ON a.id=(catalog.item->>'assessmentId')::uuid
      AND a.course_id=(course.item->>'courseId')::uuid
      AND a.status::text='published'
    ORDER BY a.id
  ) a
  LEFT JOIN public.assessment_submissions s
    ON s.assessment_id=a.id AND s.student_id=v_uid;

  RETURN jsonb_build_object(
    'courses',v_catalog->'courses',
    'assessments',v_assessments
  );
END;
$dashboard$;

CREATE FUNCTION public.schoolnet_student_official_dashboard()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade$
  SELECT schoolnet_private.student_official_dashboard();
$facade$;

REVOKE ALL ON FUNCTION schoolnet_private.student_official_dashboard()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.student_official_dashboard()
  TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_student_official_dashboard()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_official_dashboard()
  TO authenticated;

DO $post$
BEGIN
 IF NOT has_function_privilege('authenticated',
   'public.schoolnet_student_official_dashboard()','EXECUTE')
 OR has_function_privilege('anon',
   'public.schoolnet_student_official_dashboard()','EXECUTE')
 OR pg_get_functiondef('schoolnet_private.student_official_dashboard()'::regprocedure)
   NOT LIKE '%student_school_course_assessments%'
 OR pg_get_functiondef('schoolnet_private.student_official_dashboard()'::regprocedure)
   NOT LIKE '%s.student_id=v_uid%'
 THEN RAISE EXCEPTION 'S4B3B4_POSTFLIGHT_FAILED'; END IF;
END $post$;
SELECT 'S4B3B4_STUDENT_OFFICIAL_DASHBOARD_PASS' AS result;
