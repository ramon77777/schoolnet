-- SCHOOLNET V2 / S4-D.3b -- PROPOSAL ONLY, NOT A MIGRATION.
-- Never run on Supabase principal without a separate written GO.
-- A private school-admin authorizer and the original C3-C3 numeric kernel are
-- MANDATORY. This RPC returns ONE student's already-computed subject averages.
-- No raw scores, assessment IDs, teacher notes, V1 grades, exports or writes.

DO $preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.c3c3_school_class_year(uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.compute_official_general_average_preview(jsonb,jsonb,boolean,text)') IS NULL
 OR to_regclass('schoolnet_private.school_official_curricula') IS NULL
 OR to_regclass('schoolnet_private.school_official_curriculum_subjects') IS NULL
 OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
 OR to_regclass('schoolnet_private.school_official_assessment_coefficients') IS NULL
 OR to_regprocedure('public.schoolnet_school_report_card_preview(uuid,uuid,uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.school_report_card_preview(uuid,uuid,uuid,uuid)') IS NOT NULL
 THEN
  RAISE EXCEPTION 'S4D3B_PREFLIGHT_FAILED';
 END IF;
END $preflight$;

CREATE FUNCTION schoolnet_private.school_report_card_preview(
 p_school_id uuid, p_period_id uuid, p_class_id uuid, p_student_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $report$
DECLARE
 v_year uuid;
 v_curriculum uuid;
 v_student_name text;
 v_roster_count integer;
 v_enrollment_state text := 'active';
 v_expected jsonb := '[]'::jsonb;
 v_eligible jsonb := '[]'::jsonb;
 v_evaluations jsonb := '[]'::jsonb;
 v_average jsonb;
 v_subjects jsonb := '[]'::jsonb;
 v_subject_count integer;
BEGIN
 -- Calls the existing private school-admin authorizer for EVERY invocation.
 -- It rechecks auth.uid(), role, active school membership, school status,
 -- period/year/class ownership before a student or grade is read.
 v_year := schoolnet_private.c3c3_school_class_year(
  p_school_id,p_period_id,p_class_id
 );
 IF p_student_id IS NULL THEN
  RAISE EXCEPTION 'S4D3B_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 -- Student must belong to the requested class, school and year through both
 -- current class assignment and active (not revoked) school membership.
 SELECT NULLIF(btrim(p.full_name),'') INTO v_student_name
 FROM public.schoolnet_school_student_class_assignments sa
 JOIN public.schoolnet_school_memberships sm
  ON sm.school_id=sa.school_id AND sm.user_id=sa.student_id
  AND sm.member_role='student' AND sm.status='active'
  AND sm.revoked_at IS NULL
 JOIN public.profiles p
  ON p.id=sa.student_id AND p.role::text='student'
 WHERE sa.student_id=p_student_id AND sa.school_id=p_school_id
  AND sa.school_year_id=v_year AND sa.class_id=p_class_id
  AND sa.status='active' AND sa.revoked_at IS NULL;
 IF v_student_name IS NULL THEN
  RAISE EXCEPTION 'S4D3B_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 SELECT count(*) INTO v_roster_count
 FROM public.schoolnet_school_student_class_assignments sa
 JOIN public.schoolnet_school_memberships sm
  ON sm.school_id=sa.school_id AND sm.user_id=sa.student_id
  AND sm.member_role='student' AND sm.status='active'
  AND sm.revoked_at IS NULL
 JOIN public.profiles p ON p.id=sa.student_id AND p.role::text='student'
 WHERE sa.school_id=p_school_id AND sa.school_year_id=v_year
  AND sa.class_id=p_class_id AND sa.status='active' AND sa.revoked_at IS NULL;
 IF v_roster_count>250 THEN
  RAISE EXCEPTION 'S4D3B_TOO_MANY_STUDENTS' USING ERRCODE='54000';
 END IF;

 SELECT ca.id INTO v_curriculum
 FROM schoolnet_private.school_official_curricula ca
 WHERE ca.school_id=p_school_id AND ca.school_year_id=v_year
  AND ca.class_id=p_class_id AND ca.period_id=p_period_id
  AND ca.status='approved';
 IF v_curriculum IS NULL THEN
  RAISE EXCEPTION 'S4D3B_CURRICULUM_NOT_APPROVED' USING ERRCODE='42501';
 END IF;

 SELECT count(*) INTO v_subject_count
 FROM schoolnet_private.school_official_curriculum_subjects
 WHERE curriculum_id=v_curriculum;
 IF v_subject_count<1 OR v_subject_count>60 THEN
  RAISE EXCEPTION 'S4D3B_INVALID_CURRICULUM' USING ERRCODE='22023';
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'subjectId',cs.subject_id::text,
  'coefficient',coef.coefficient,
  'participation','required'
 ) ORDER BY subj.sort_order,subj.name,cs.subject_id),'[]'::jsonb)
 INTO v_expected
 FROM schoolnet_private.school_official_curriculum_subjects cs
 JOIN public.academic_subjects subj
  ON subj.id=cs.subject_id AND subj.is_active
 LEFT JOIN schoolnet_private.school_period_subject_coefficients coef
  ON coef.period_id=p_period_id AND coef.class_id=p_class_id
  AND coef.subject_id=cs.subject_id
 WHERE cs.curriculum_id=v_curriculum;
 IF jsonb_array_length(v_expected)<>v_subject_count THEN
  RAISE EXCEPTION 'S4D3B_INACTIVE_EXPECTED_SUBJECT' USING ERRCODE='42501';
 END IF;

 -- Exactly the same eligible school links/teachers/assessments as C3-C3.
 -- DISTINCT prevents double-counting an assessment in concurrent teaching.
 WITH eligible AS (
  SELECT DISTINCT a.id AS assessment_id,cl.subject_id,
   setting.coefficient,a.max_score
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
  'assessment_id',e.assessment_id,
  'subject_id',e.subject_id,
  'coefficient',e.coefficient,
  'max_score',e.max_score
 ) ORDER BY e.assessment_id),'[]'::jsonb)
 INTO v_eligible FROM eligible e;
 IF jsonb_array_length(v_eligible)>500 THEN
  RAISE EXCEPTION 'S4D3B_TOO_MANY_ASSESSMENTS' USING ERRCODE='54000';
 END IF;

 -- Ambiguous simultaneous class assignments are not considered completed.
 IF (SELECT count(*)
  FROM public.schoolnet_school_student_class_assignments sa
  WHERE sa.student_id=p_student_id AND sa.school_year_id=v_year
   AND sa.status='active' AND sa.revoked_at IS NULL)<>1
 THEN v_enrollment_state:='transfer_review'; END IF;

 -- Internal raw notes are never returned to the public API.
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'assessmentId',e.assessment_id::text,
   'subjectId',e.subject_id::text,'coefficient',e.coefficient,
   'includeInAverage',true,
   'status',CASE WHEN sub.status::text='published'
       AND sub.published_at IS NOT NULL AND sub.score IS NOT NULL
       AND e.max_score>0 AND sub.score>=0 AND sub.score<=e.max_score
       THEN 'published' ELSE 'unpublished' END,
   'score',CASE WHEN sub.status::text='published'
       AND sub.published_at IS NOT NULL AND sub.score IS NOT NULL
       AND e.max_score>0 AND sub.score>=0 AND sub.score<=e.max_score
       THEN sub.score ELSE NULL END,
   'maxScore',CASE WHEN e.max_score>0 THEN e.max_score ELSE NULL END,
   'publishedAt',CASE WHEN sub.status::text='published'
       AND sub.published_at IS NOT NULL AND sub.score IS NOT NULL
       AND e.max_score>0 AND sub.score>=0 AND sub.score<=e.max_score
       THEN sub.published_at::text ELSE NULL END
 ) ORDER BY e.assessment_id),'[]'::jsonb)
 INTO v_evaluations
 FROM jsonb_to_recordset(v_eligible) AS e(
  assessment_id uuid,subject_id uuid,coefficient numeric,max_score numeric
 )
 LEFT JOIN public.assessment_submissions sub
  ON sub.assessment_id=e.assessment_id AND sub.student_id=p_student_id;

 -- One and only one official numeric kernel for subject and general averages.
 v_average := schoolnet_private.compute_official_general_average_preview(
  v_expected,v_evaluations,true,v_enrollment_state
 );
 SELECT COALESCE(jsonb_agg(
  element.value || jsonb_build_object('subjectName',subj.name)
  ORDER BY element.ordinality),'[]'::jsonb)
 INTO v_subjects
 FROM jsonb_array_elements(v_average->'subjects')
  WITH ORDINALITY AS element(value,ordinality)
 JOIN public.academic_subjects subj
  ON subj.id=(element.value->>'subjectId')::uuid AND subj.is_active;
 IF jsonb_array_length(v_subjects)<>v_subject_count THEN
  RAISE EXCEPTION 'S4D3B_SUBJECT_INTEGRITY_FAILURE' USING ERRCODE='22023';
 END IF;

 RETURN jsonb_build_object(
  'projection','schoolnet_v2_report_card_provisional_v1',
  'schoolId',p_school_id,'schoolYearId',v_year,
  'classId',p_class_id,'periodId',p_period_id,
  'studentId',p_student_id,'studentName',v_student_name,
  'schoolAdminScoped',true,'previewOnly',true,
  'documentState','provisional',
  'state',v_average->>'state',
  'averageOn20',v_average->'averageOn20',
  'expectedSubjects',v_average->'expectedSubjects',
  'readySubjects',v_average->'readySubjects',
  'subjects',v_subjects
 );
END $report$;

-- Exposed function is INVOKER, private function reauthorizes every read.
CREATE FUNCTION public.schoolnet_school_report_card_preview(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,p_student_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $wrapper$
 SELECT schoolnet_private.school_report_card_preview(
  p_school_id,p_period_id,p_class_id,p_student_id
 );
$wrapper$;

REVOKE ALL ON FUNCTION schoolnet_private.school_report_card_preview(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_report_card_preview(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
-- Private schema not exposed through PostgREST, and its helper still checks
-- role + auth.uid() + active membership if invoked directly.
GRANT EXECUTE ON FUNCTION schoolnet_private.school_report_card_preview(uuid,uuid,uuid,uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_report_card_preview(uuid,uuid,uuid,uuid)
 TO authenticated;

SELECT 'S4D3B_REPORT_CARD_PROPOSAL_NOT_INSTALLED' AS verdict;
