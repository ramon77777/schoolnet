-- S4-B.3-C.2 — installation autorisee sur schoolnet_2.0 le 2026-11-24.
-- Vue aggregee par evaluation, jamais de note, nom d'eleve, reponse ou appreciation.
DO $pre$
BEGIN
 IF to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)') IS NULL
 OR to_regprocedure('schoolnet_private.school_course_catalog(uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.school_assessment_supervision(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_school_assessment_supervision(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3C2_PREFLIGHT_FAILED'; END IF;
END $pre$;

CREATE FUNCTION schoolnet_private.school_assessment_supervision(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $c2$
DECLARE
 v_items jsonb;
 v_total integer;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,false);
 -- Les liens et affectations actifs constituent l'unique perimetre.
 -- Une copie ne compte qu'une fois, et seulement si le rattachement est valide.
 WITH valid_assessments AS MATERIALIZED (
 SELECT DISTINCT a.id,a.title,a.type::text AS assessment_type,
        a.status::text AS assessment_status,a.due_at,
        c.id AS course_id,c.title AS course_title,
        cl.id AS class_id,cl.name AS class_name,
        sy.id AS school_year_id,sy.name AS school_year_name,
        sub.id AS subject_id,sub.name AS subject_name,
        ta.teacher_id,pr.full_name AS teacher_name
 FROM schoolnet_private.school_assessment_links al
 JOIN schoolnet_private.school_course_links l
  ON l.id=al.school_course_link_id AND l.status='active'
  AND l.revoked_at IS NULL AND l.school_id=p_school_id
 JOIN public.assessments a
  ON a.id=al.assessment_id AND a.course_id=l.course_id
 JOIN public.courses c
  ON c.id=l.course_id AND c.status::text='active'
  AND c.created_by=l.teacher_id
 JOIN public.classes cl
  ON cl.id=l.class_id AND cl.school_id=l.school_id
  AND cl.school_year_id=l.school_year_id
  AND cl.learning_context='school'
 JOIN public.school_years sy ON sy.id=l.school_year_id
 JOIN public.schoolnet_school_teacher_subject_assignments ta
  ON ta.id=l.teacher_assignment_id AND ta.school_id=l.school_id
  AND ta.class_id=l.class_id AND ta.school_year_id=l.school_year_id
  AND ta.teacher_id=l.teacher_id AND ta.subject_id=l.subject_id
  AND ta.status='active' AND ta.revoked_at IS NULL
 JOIN public.schoolnet_school_memberships tm
  ON tm.school_id=l.school_id AND tm.user_id=l.teacher_id
  AND tm.member_role='teacher' AND tm.status='active'
 JOIN public.academic_subjects sub
  ON sub.id=l.subject_id AND sub.is_active
 JOIN public.profiles pr ON pr.id=l.teacher_id AND pr.role::text='teacher'
 JOIN public.schoolnet_schools school
  ON school.id=l.school_id AND school.status='active'
 WHERE al.status='active' AND al.revoked_at IS NULL
 ),
 copy_counts AS (
 SELECT va.id,
   count(s.id) FILTER(WHERE s.status::text='in_progress')::integer AS in_progress,
   count(s.id) FILTER(WHERE s.status::text='submitted')::integer AS submitted,
   count(s.id) FILTER(WHERE s.status::text='graded')::integer AS graded,
   count(s.id) FILTER(WHERE s.status::text='published')::integer AS published
 FROM valid_assessments va
 LEFT JOIN public.assessment_submissions s ON s.assessment_id=va.id
 -- Les copies comptees appartiennent a un eleve encore affecte et affilie.
  AND EXISTS(
    SELECT 1 FROM schoolnet_private.school_course_links l
    JOIN schoolnet_private.school_assessment_links al
      ON al.school_course_link_id=l.id AND al.assessment_id=va.id
      AND al.status='active' AND al.revoked_at IS NULL
    JOIN public.schoolnet_school_student_class_assignments sc
      ON sc.school_id=l.school_id AND sc.class_id=l.class_id
      AND sc.school_year_id=l.school_year_id AND sc.student_id=s.student_id
      AND sc.status='active' AND sc.revoked_at IS NULL
    JOIN public.schoolnet_school_memberships sm
      ON sm.school_id=l.school_id AND sm.user_id=s.student_id
      AND sm.member_role='student' AND sm.status='active'
    WHERE l.course_id=va.course_id AND l.status='active' AND l.revoked_at IS NULL
      AND l.school_id=p_school_id AND l.class_id=va.class_id
      AND l.school_year_id=va.school_year_id
  )
 GROUP BY va.id
 )
 SELECT count(*)::integer,COALESCE(jsonb_agg(jsonb_build_object(
   'assessmentId',va.id,'title',va.title,'type',va.assessment_type,
   'status',va.assessment_status,'dueAt',va.due_at,
   'courseId',va.course_id,'courseTitle',va.course_title,
   'classId',va.class_id,'className',va.class_name,
   'schoolYearId',va.school_year_id,'schoolYear',va.school_year_name,
   'subjectId',va.subject_id,'subjectName',va.subject_name,
   'teacherId',va.teacher_id,'teacherName',va.teacher_name,
   'inProgress',cc.in_progress,'submitted',cc.submitted,
   'graded',cc.graded,'published',cc.published
 ) ORDER BY va.class_name,va.title,va.id),'[]'::jsonb)
 INTO v_total,v_items
 FROM valid_assessments va
 JOIN copy_counts cc ON cc.id=va.id;

 -- Ne jamais presenter un total partiel comme exhaustif.
 IF v_total>300 THEN
  RAISE EXCEPTION 'S4B3C2_TOO_MANY_ASSESSMENTS' USING ERRCODE='54000';
 END IF;
 RETURN jsonb_build_object('schoolId',p_school_id,
    'assessmentCount',v_total,'assessments',v_items);
END;
$c2$;

CREATE FUNCTION public.schoolnet_school_assessment_supervision(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $rpc$
 SELECT schoolnet_private.school_assessment_supervision(p_school_id);
$rpc$;

REVOKE ALL ON FUNCTION schoolnet_private.school_assessment_supervision(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.school_assessment_supervision(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_assessment_supervision(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_assessment_supervision(uuid) TO authenticated;

DO $post$
BEGIN
 IF has_function_privilege('anon','public.schoolnet_school_assessment_supervision(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.schoolnet_school_assessment_supervision(uuid)','EXECUTE')
 OR pg_get_functiondef('schoolnet_private.school_assessment_supervision(uuid)'::regprocedure)
    NOT LIKE '%assert_s3c_access%'
 THEN RAISE EXCEPTION 'S4B3C2_POSTFLIGHT_FAILED'; END IF;
END $post$;
SELECT 'S4B3C2_SUPERVISION_PROPOSAL_PASS' AS result;
