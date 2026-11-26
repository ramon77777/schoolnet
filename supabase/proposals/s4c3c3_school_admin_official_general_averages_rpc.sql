-- SCHOOLNET V2 / S4-C.3-C.3.3 - PROPOSAL ONLY, NOT A MIGRATION.
-- Depends on PR #41 school_official_curricula and pure numeric SQL kernel.
-- DO NOT INSTALL on Supabase principal without a separate user GO.
-- Public wrappers are SECURITY INVOKER; private authorizers are DEFINER with
-- fixed search_path. All privileged reads are scoped to auth.uid() + school.

DO $preflight$
BEGIN
 IF to_regclass('schoolnet_private.school_official_curricula') IS NULL
  OR to_regclass('schoolnet_private.school_official_curriculum_subjects') IS NULL
  OR to_regclass('public.schoolnet_school_memberships') IS NULL
  OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
  OR to_regclass('schoolnet_private.school_course_links') IS NULL
  OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
  OR to_regprocedure('schoolnet_private.compute_official_general_average_preview(jsonb,jsonb,boolean,text)') IS NULL
  OR to_regprocedure('schoolnet_private.school_official_general_averages(uuid,uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_school_official_general_averages(uuid,uuid,uuid)') IS NOT NULL
 THEN
  RAISE EXCEPTION 'C3C3_3_PREFLIGHT_FAILED';
 END IF;
END $preflight$;

-- Not exposed through PostgREST. Direct calls are safe as this helper validates
-- the real profile role, active school membership and school status on every call.
CREATE FUNCTION schoolnet_private.c3c3_require_school_admin(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $auth$
BEGIN
 IF auth.uid() IS NULL OR p_school_id IS NULL
  OR public.get_my_role()::text IS DISTINCT FROM 'school_admin'
  OR NOT EXISTS (
   SELECT 1 FROM public.schoolnet_school_memberships m
   JOIN public.schoolnet_schools s ON s.id=m.school_id AND s.status='active'
   JOIN public.profiles p ON p.id=m.user_id AND p.role::text='school_admin'
   WHERE m.school_id=p_school_id AND m.user_id=auth.uid()
     AND m.member_role='school_admin' AND m.status='active'
     AND m.revoked_at IS NULL
  )
 THEN RAISE EXCEPTION 'S4C3C3_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
END $auth$;

-- Verify the same school + year for both period and class. No arbitrary student
-- ID or teacher ID is an argument in any of the public wrappers.
CREATE FUNCTION schoolnet_private.c3c3_school_class_year(
 p_school_id uuid,p_period_id uuid,p_class_id uuid
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $scope$
DECLARE v_year uuid;
BEGIN
 PERFORM schoolnet_private.c3c3_require_school_admin(p_school_id);
 IF p_period_id IS NULL OR p_class_id IS NULL THEN
  RAISE EXCEPTION 'S4C3C3_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT gp.school_year_id INTO v_year
 FROM schoolnet_private.school_grading_periods gp
 JOIN public.classes c ON c.id=p_class_id AND c.school_id=gp.school_id
  AND c.school_year_id=gp.school_year_id AND c.learning_context='school'
 WHERE gp.id=p_period_id AND gp.school_id=p_school_id;
 IF v_year IS NULL THEN
  RAISE EXCEPTION 'S4C3C3_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 RETURN v_year;
END $scope$;

-- School_admin is the sole author of the class/period expected subject list.
-- Actions: read (no write), set (whole approved SUBJECT LIST replaced atomically),
-- approve (subject list becomes authoritative). Coefficients are independent.
CREATE FUNCTION schoolnet_private.school_official_curriculum_manage(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_action text,p_subject_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $manage$
DECLARE
 v_year uuid;
 v_curriculum uuid;
 v_locked boolean;
 v_status text;
 v_subjects jsonb:='[]'::jsonb;
 v_approved_at timestamptz;
 v_count integer;
BEGIN
 v_year:=schoolnet_private.c3c3_school_class_year(
  p_school_id,p_period_id,p_class_id
 );
 IF p_action IS NULL OR p_action NOT IN ('read','set','approve') THEN
  RAISE EXCEPTION 'S4C3C3_INVALID_ACTION' USING ERRCODE='22023';
 END IF;
 IF p_action='read' AND p_subject_ids IS NOT NULL THEN
  RAISE EXCEPTION 'S4C3C3_READ_ONLY_ARGS' USING ERRCODE='22023';
 END IF;
 SELECT is_locked INTO v_locked FROM schoolnet_private.school_grading_periods
 WHERE id=p_period_id AND school_id=p_school_id;
 IF p_action<>'read' AND v_locked THEN
  RAISE EXCEPTION 'S4C3C3_PERIOD_LOCKED' USING ERRCODE='42501';
 END IF;
 IF p_action='set' THEN
  IF p_subject_ids IS NULL OR cardinality(p_subject_ids)=0
    OR cardinality(p_subject_ids)>60 OR array_position(p_subject_ids,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT x) FROM unnest(p_subject_ids) x)
       <>cardinality(p_subject_ids)
    OR (SELECT count(*) FROM public.academic_subjects s
          WHERE s.id=ANY(p_subject_ids) AND s.is_active)
       <>cardinality(p_subject_ids)
  THEN
   RAISE EXCEPTION 'S4C3C3_INVALID_SUBJECT_SET' USING ERRCODE='22023';
  END IF;
 END IF;

 -- Prevent two concurrent users of the same school/period/class from
 -- silently overwriting each other's subject approval and configuration.
 IF p_action<>'read' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(
   p_school_id::text||':'||p_period_id::text||':'||p_class_id::text,0));
 END IF;
 IF p_action='set' THEN
  INSERT INTO schoolnet_private.school_official_curricula(
    school_id,school_year_id,class_id,period_id
  ) VALUES(p_school_id,v_year,p_class_id,p_period_id)
  ON CONFLICT(period_id,class_id) DO NOTHING;
 END IF;
 SELECT id,status,approved_at
 INTO v_curriculum,v_status,v_approved_at
 FROM schoolnet_private.school_official_curricula
 WHERE school_id=p_school_id AND school_year_id=v_year
  AND class_id=p_class_id AND period_id=p_period_id
 FOR UPDATE;
 IF p_action='approve' AND v_curriculum IS NULL THEN
  RAISE EXCEPTION 'S4C3C3_NO_CURRICULUM' USING ERRCODE='22023';
 END IF;
 IF p_action='set' THEN
  DELETE FROM schoolnet_private.school_official_curriculum_subjects cs
  WHERE cs.curriculum_id=v_curriculum AND NOT(cs.subject_id=ANY(p_subject_ids));
  INSERT INTO schoolnet_private.school_official_curriculum_subjects(
    curriculum_id,subject_id
  )
  SELECT v_curriculum,s.id FROM public.academic_subjects s
  WHERE s.id=ANY(p_subject_ids) AND s.is_active
   AND NOT EXISTS(
    SELECT 1 FROM schoolnet_private.school_official_curriculum_subjects cs
    WHERE cs.curriculum_id=v_curriculum AND cs.subject_id=s.id
   );
 ELSIF p_action='approve' THEN
  SELECT count(*) INTO v_count FROM schoolnet_private.school_official_curriculum_subjects cs
  JOIN public.academic_subjects s ON s.id=cs.subject_id AND s.is_active
  WHERE cs.curriculum_id=v_curriculum;
  IF v_count=0 OR v_count<>(
    SELECT count(*) FROM schoolnet_private.school_official_curriculum_subjects
    WHERE curriculum_id=v_curriculum
  ) THEN
   RAISE EXCEPTION 'S4C3C3_EMPTY_OR_INACTIVE_CURRICULUM' USING ERRCODE='22023';
  END IF;
  UPDATE schoolnet_private.school_official_curricula
   SET status='approved',approved_at=now(),approved_by=auth.uid()
  WHERE id=v_curriculum;
 END IF;

 SELECT ca.status,ca.approved_at INTO v_status,v_approved_at
 FROM schoolnet_private.school_official_curricula ca
 WHERE ca.id=v_curriculum;
 IF v_curriculum IS NOT NULL THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'subjectId',cs.subject_id,
    'subjectName',s.name,
    'coefficient',coef.coefficient
  ) ORDER BY s.sort_order,s.name,cs.subject_id),'[]'::jsonb)
  INTO v_subjects
  FROM schoolnet_private.school_official_curriculum_subjects cs
  JOIN public.academic_subjects s ON s.id=cs.subject_id
  LEFT JOIN schoolnet_private.school_period_subject_coefficients coef
   ON coef.period_id=p_period_id AND coef.class_id=p_class_id
     AND coef.subject_id=cs.subject_id
  WHERE cs.curriculum_id=v_curriculum;
 END IF;
 RETURN jsonb_build_object(
  'schoolId',p_school_id,'schoolYearId',v_year,
  'periodId',p_period_id,'classId',p_class_id,
  'status',COALESCE(v_status,'missing'),
  'approvedAt',v_approved_at,
  'subjects',v_subjects
 );
END $manage$;

-- Private, read-only, school-admin-only result collector. The pure SQL kernel
-- cannot receive any request-controlled school/user/approval/grade JSON:
-- roster, catalogue and eligible published assessments are assembled here.
CREATE FUNCTION schoolnet_private.school_official_general_averages(
 p_school_id uuid,p_period_id uuid,p_class_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $preview$
DECLARE
 v_year uuid;
 v_curriculum uuid;
 v_expected jsonb:='[]'::jsonb;
 v_eligible jsonb:='[]'::jsonb;
 v_students jsonb:='[]'::jsonb;
 v_evaluations jsonb;
 v_average jsonb;
 v_roster_count integer;
 v_student record;
 v_enrollment_state text;
 v_subject_count integer;
BEGIN
 v_year:=schoolnet_private.c3c3_school_class_year(
  p_school_id,p_period_id,p_class_id
 );

 SELECT ca.id INTO v_curriculum
 FROM schoolnet_private.school_official_curricula ca
 WHERE ca.school_id=p_school_id AND ca.school_year_id=v_year
   AND ca.class_id=p_class_id AND ca.period_id=p_period_id
   AND ca.status='approved';
 IF v_curriculum IS NULL THEN
  RETURN jsonb_build_object('schoolId',p_school_id,
   'schoolYearId',v_year,'classId',p_class_id,'periodId',p_period_id,
   'schoolAdminScoped',true,'previewOnly',true,
   'state','not_configured','expectedSubjects',0,'studentCount',0,
   'students','[]'::jsonb);
 END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'subjectId',cs.subject_id::text,
    'coefficient',coefficient.coefficient,
    'participation','required'
   ) ORDER BY cs.subject_id),'[]'::jsonb)
 INTO v_expected
 FROM schoolnet_private.school_official_curriculum_subjects cs
 JOIN public.academic_subjects subject
  ON subject.id=cs.subject_id AND subject.is_active
 LEFT JOIN schoolnet_private.school_period_subject_coefficients coefficient
  ON coefficient.period_id=p_period_id AND coefficient.class_id=p_class_id
    AND coefficient.subject_id=cs.subject_id
 WHERE cs.curriculum_id=v_curriculum;

 -- Deactivated expected subjects must never silently disappear.
 SELECT count(*) INTO v_subject_count
 FROM schoolnet_private.school_official_curriculum_subjects
 WHERE curriculum_id=v_curriculum;
 IF jsonb_array_length(v_expected)<>v_subject_count OR v_subject_count>60
  OR v_subject_count=0 THEN
  RETURN jsonb_build_object('schoolId',p_school_id,
   'schoolYearId',v_year,'classId',p_class_id,'periodId',p_period_id,
   'schoolAdminScoped',true,'previewOnly',true,
   'state','not_configured','expectedSubjects',v_subject_count,'studentCount',0,
   'students','[]'::jsonb);
 END IF;

 -- Active official links, teaching assignments AND memberships, a published
 -- or closed assessment and an explicit include flag are all required.
 -- Returns DISTINCT assessments so co-teaching or multiple active links cannot
 -- count the same evaluation twice. Scores are NOT fetched in this query.
 WITH eligible AS (
 SELECT DISTINCT a.id AS assessment_id,cl.subject_id,setting.coefficient,a.max_score
 FROM schoolnet_private.school_official_assessment_coefficients setting
 JOIN public.assessments a
  ON a.id=setting.assessment_id AND a.status::text IN ('published','closed')
 JOIN schoolnet_private.school_assessment_links al
  ON al.assessment_id=a.id AND al.status='active' AND al.revoked_at IS NULL
 JOIN schoolnet_private.school_course_links cl
  ON cl.id=al.school_course_link_id AND cl.course_id=a.course_id
   AND cl.school_id=p_school_id AND cl.school_year_id=v_year
   AND cl.class_id=p_class_id AND cl.status='active'
   AND cl.revoked_at IS NULL AND cl.teacher_id=a.created_by
 JOIN public.courses course
  ON course.id=cl.course_id AND course.created_by=cl.teacher_id
   AND course.status::text='active'
 JOIN public.schoolnet_school_teacher_subject_assignments ta
  ON ta.id=cl.teacher_assignment_id
   AND ta.school_id=cl.school_id AND ta.school_year_id=cl.school_year_id
   AND ta.class_id=cl.class_id AND ta.subject_id=cl.subject_id
   AND ta.teacher_id=cl.teacher_id
   AND ta.status='active' AND ta.revoked_at IS NULL
 JOIN public.schoolnet_school_memberships tm
  ON tm.school_id=p_school_id AND tm.user_id=cl.teacher_id
   AND tm.member_role='teacher' AND tm.status='active'
   AND tm.revoked_at IS NULL
 JOIN public.profiles teacher
  ON teacher.id=cl.teacher_id AND teacher.role::text='teacher'
 JOIN schoolnet_private.school_official_curriculum_subjects cs
  ON cs.curriculum_id=v_curriculum AND cs.subject_id=cl.subject_id
 WHERE setting.period_id=p_period_id AND setting.include_in_average=true
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'assessment_id',e.assessment_id,'subject_id',e.subject_id,
  'coefficient',e.coefficient,'max_score',e.max_score
 ) ORDER BY e.assessment_id),'[]'::jsonb)
 INTO v_eligible FROM eligible e;
 IF jsonb_array_length(v_eligible)>500 THEN
  RAISE EXCEPTION 'S4C3C3_TOO_MANY_ASSESSMENTS' USING ERRCODE='54000';
 END IF;

 SELECT count(*) INTO v_roster_count
 FROM public.schoolnet_school_student_class_assignments sa
 JOIN public.schoolnet_school_memberships sm
  ON sm.school_id=sa.school_id AND sm.user_id=sa.student_id
   AND sm.member_role='student' AND sm.status='active'
   AND sm.revoked_at IS NULL
 JOIN public.profiles p ON p.id=sa.student_id AND p.role::text='student'
 WHERE sa.school_id=p_school_id AND sa.school_year_id=v_year
   AND sa.class_id=p_class_id AND sa.status='active'
   AND sa.revoked_at IS NULL;
 IF v_roster_count>250 THEN
  RAISE EXCEPTION 'S4C3C3_TOO_MANY_STUDENTS' USING ERRCODE='54000';
 END IF;

 FOR v_student IN
  SELECT sa.student_id,p.full_name
  FROM public.schoolnet_school_student_class_assignments sa
  JOIN public.schoolnet_school_memberships sm
   ON sm.school_id=sa.school_id AND sm.user_id=sa.student_id
    AND sm.member_role='student' AND sm.status='active'
    AND sm.revoked_at IS NULL
  JOIN public.profiles p
   ON p.id=sa.student_id AND p.role::text='student'
  WHERE sa.school_id=p_school_id AND sa.school_year_id=v_year
    AND sa.class_id=p_class_id AND sa.status='active'
    AND sa.revoked_at IS NULL
  ORDER BY p.full_name,sa.student_id
 LOOP
  -- Active enrollments in two classes or two schools in this year require
  -- human transfer review; do not average away the ambiguous assignment.
  v_enrollment_state:='active';
  IF (
   SELECT count(*) FROM public.schoolnet_school_student_class_assignments sa
   WHERE sa.student_id=v_student.student_id AND sa.school_year_id=v_year
     AND sa.status='active' AND sa.revoked_at IS NULL
  )<>1 THEN v_enrollment_state:='transfer_review'; END IF;

  -- Construct INTERNAL notes from published submissions only. Unpublished,
  -- missing or invalid grades are NULL, not zero. No raw grades returned.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assessmentId',e.assessment_id::text,
    'subjectId',e.subject_id::text,'coefficient',e.coefficient,
    'includeInAverage',true,
    'status',CASE WHEN submission.status::text='published'
       AND submission.published_at IS NOT NULL
       AND submission.score IS NOT NULL AND e.max_score>0
       AND submission.score>=0 AND submission.score<=e.max_score
       THEN 'published' ELSE 'unpublished' END,
    'score',CASE WHEN submission.status::text='published'
       AND submission.published_at IS NOT NULL
       AND submission.score IS NOT NULL AND e.max_score>0
       AND submission.score>=0 AND submission.score<=e.max_score
       THEN submission.score ELSE NULL END,
    'maxScore',CASE WHEN e.max_score>0 THEN e.max_score ELSE NULL END,
    'publishedAt',CASE WHEN submission.status::text='published'
       AND submission.published_at IS NOT NULL
       AND submission.score IS NOT NULL AND e.max_score>0
       AND submission.score>=0 AND submission.score<=e.max_score
       THEN submission.published_at::text ELSE NULL END
   ) ORDER BY e.assessment_id),'[]'::jsonb)
  INTO v_evaluations
  FROM jsonb_to_recordset(v_eligible)
   AS e(assessment_id uuid,subject_id uuid,coefficient numeric,max_score numeric)
  LEFT JOIN public.assessment_submissions submission
   ON submission.assessment_id=e.assessment_id
    AND submission.student_id=v_student.student_id;

  v_average:=schoolnet_private.compute_official_general_average_preview(
    v_expected,v_evaluations,true,v_enrollment_state);
  v_students:=v_students||jsonb_build_array(jsonb_build_object(
    'studentId',v_student.student_id,
    'studentName',COALESCE(NULLIF(btrim(v_student.full_name),''),'Élève'),
    'state',v_average->>'state',
    'averageOn20',v_average->'averageOn20',
    'expectedSubjects',v_average->'expectedSubjects',
    'readySubjects',v_average->'readySubjects'
  ));
 END LOOP;
 RETURN jsonb_build_object(
  'schoolId',p_school_id,'schoolYearId',v_year,
  'classId',p_class_id,'periodId',p_period_id,
  'schoolAdminScoped',true,'previewOnly',true,
  'state','preview','expectedSubjects',v_subject_count,
  'studentCount',v_roster_count,'students',v_students
 );
END $preview$;

-- The public Data API exposes ONLY these SECURITY INVOKER forwarders. Both
-- private functions verify auth.uid() AND membership BEFORE touching notes.
CREATE FUNCTION public.schoolnet_school_official_curriculum(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_action text DEFAULT 'read',p_subject_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $wrapper$
 SELECT schoolnet_private.school_official_curriculum_manage(
  p_school_id,p_period_id,p_class_id,p_action,p_subject_ids
 );
$wrapper$;

CREATE FUNCTION public.schoolnet_school_official_general_averages(
 p_school_id uuid,p_period_id uuid,p_class_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $wrapper$
 SELECT schoolnet_private.school_official_general_averages(
  p_school_id,p_period_id,p_class_id
 );
$wrapper$;

REVOKE ALL ON FUNCTION schoolnet_private.c3c3_require_school_admin(uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.c3c3_school_class_year(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.school_official_curriculum_manage(uuid,uuid,uuid,text,uuid[])
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.school_official_general_averages(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_official_curriculum(uuid,uuid,uuid,text,uuid[])
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_official_general_averages(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- Existing SCHOOLNET model exposes private schema USAGE to authenticated,
-- while the schema itself is not part of the Data API "Exposed schemas".
-- The private helper is still safe against direct invocation due to its own
-- active affiliation + role checks.
GRANT EXECUTE ON FUNCTION schoolnet_private.school_official_curriculum_manage(uuid,uuid,uuid,text,uuid[])
 TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.school_official_general_averages(uuid,uuid,uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_official_curriculum(uuid,uuid,uuid,text,uuid[])
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_official_general_averages(uuid,uuid,uuid)
 TO authenticated;
SELECT 'C3C3_3_AUTHORIZER_DRAFT_ONLY' AS verdict;
