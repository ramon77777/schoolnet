-- SCHOOLNET V2 / S4-C.3-B.2 — PROPOSITION SQL, BRANCHE DEV SEULEMENT.
-- NEVER run on the production/main Supabase project without a distinct GO.
-- Teacher-specific, server-side, READ-ONLY preview of OFFICIAL V2 subject averages.
-- No writes to assessment_submissions, V1 averages, bulletins, or grades.
-- No class/general averages from other teachers or subjects are disclosed.

DO $preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.school_grading_configuration(uuid)') IS NULL
 OR to_regprocedure('public.get_my_role()') IS NULL
 OR to_regclass('schoolnet_private.school_official_assessment_coefficients') IS NULL
 OR to_regclass('schoolnet_private.school_period_subject_coefficients') IS NULL
 OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
 OR to_regclass('public.assessment_submissions') IS NULL
 OR to_regprocedure('schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4C3B2_PREFLIGHT_FAILED'; END IF;
END $preflight$;

CREATE FUNCTION schoolnet_private.teacher_official_subject_averages(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,p_subject_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $average$
DECLARE
 v_uid uuid:=auth.uid();
 v_school_year_id uuid;
 v_subject_coefficient numeric;
 v_students jsonb:='[]'::jsonb;
 v_student_count integer:=0;
 v_assessment_count integer:=0;
BEGIN
 -- Authenticated TEACHER only, verified from a non-user-editable source.
 -- Parameters never include an arbitrary user ID; all teacher checks use auth.uid().
 IF v_uid IS NULL OR p_school_id IS NULL OR p_period_id IS NULL
  OR p_class_id IS NULL OR p_subject_id IS NULL
  OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4C3B2_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 -- Verify that the selected period, class, subject, school, teacher and local
 -- school membership are simultaneously CURRENT and consistent.
 SELECT period.school_year_id, coefficient.coefficient
 INTO v_school_year_id,v_subject_coefficient
 FROM schoolnet_private.school_grading_periods period
 JOIN public.schoolnet_schools school
   ON school.id=period.school_id AND school.status='active'
 JOIN public.classes cls
   ON cls.id=p_class_id AND cls.school_id=school.id
   AND cls.school_year_id=period.school_year_id
   AND cls.learning_context='school'
 JOIN public.academic_subjects subject
   ON subject.id=p_subject_id AND subject.is_active
 JOIN public.schoolnet_school_teacher_subject_assignments assignment
   ON assignment.school_id=school.id AND assignment.class_id=cls.id
   AND assignment.school_year_id=period.school_year_id
   AND assignment.subject_id=subject.id AND assignment.teacher_id=v_uid
   AND assignment.status='active' AND assignment.revoked_at IS NULL
 JOIN public.schoolnet_school_memberships teacher_membership
   ON teacher_membership.school_id=school.id
   AND teacher_membership.user_id=v_uid
   AND teacher_membership.member_role='teacher'
   AND teacher_membership.status='active'
   AND teacher_membership.revoked_at IS NULL
 LEFT JOIN schoolnet_private.school_period_subject_coefficients coefficient
   ON coefficient.period_id=period.id
   AND coefficient.class_id=cls.id AND coefficient.subject_id=subject.id
 WHERE period.id=p_period_id AND period.school_id=p_school_id
 LIMIT 1;
 IF v_school_year_id IS NULL THEN
  RAISE EXCEPTION 'S4C3B2_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 -- Bound work before processing potentially large data.
 SELECT count(*) INTO v_student_count
 FROM public.schoolnet_school_student_class_assignments enrollment
 JOIN public.schoolnet_school_memberships membership
   ON membership.school_id=enrollment.school_id
   AND membership.user_id=enrollment.student_id
   AND membership.member_role='student' AND membership.status='active'
   AND membership.revoked_at IS NULL
 JOIN public.profiles student
   ON student.id=enrollment.student_id AND student.role::text='student'
 WHERE enrollment.school_id=p_school_id AND enrollment.school_year_id=v_school_year_id
   AND enrollment.class_id=p_class_id AND enrollment.status='active'
   AND enrollment.revoked_at IS NULL;
 IF v_student_count>250 THEN
  RAISE EXCEPTION 'S4C3B2_TOO_MANY_STUDENTS' USING ERRCODE='54000';
 END IF;

 -- A strictly official and explicitly-included evaluation is in scope only
 -- when its course/assessment/teacher links remain active and OWNED by caller.
 SELECT count(*) INTO v_assessment_count
 FROM (
  SELECT DISTINCT assessment.id
  FROM schoolnet_private.school_official_assessment_coefficients setting
  JOIN public.assessments assessment
    ON assessment.id=setting.assessment_id
     AND assessment.status::text IN ('published','closed')
     AND assessment.created_by=v_uid
  JOIN schoolnet_private.school_assessment_links assessment_link
    ON assessment_link.assessment_id=assessment.id
     AND assessment_link.status='active' AND assessment_link.revoked_at IS NULL
  JOIN schoolnet_private.school_course_links course_link
    ON course_link.id=assessment_link.school_course_link_id
     AND course_link.course_id=assessment.course_id
     AND course_link.school_id=p_school_id
     AND course_link.school_year_id=v_school_year_id
     AND course_link.class_id=p_class_id
     AND course_link.subject_id=p_subject_id
     AND course_link.teacher_id=v_uid
     AND course_link.status='active' AND course_link.revoked_at IS NULL
  JOIN public.courses course
    ON course.id=course_link.course_id AND course.created_by=v_uid
     AND course.status::text='active'
  JOIN public.schoolnet_school_teacher_subject_assignments teacher_assignment
    ON teacher_assignment.id=course_link.teacher_assignment_id
     AND teacher_assignment.school_id=p_school_id
     AND teacher_assignment.school_year_id=v_school_year_id
     AND teacher_assignment.class_id=p_class_id
     AND teacher_assignment.subject_id=p_subject_id
     AND teacher_assignment.teacher_id=v_uid
     AND teacher_assignment.status='active' AND teacher_assignment.revoked_at IS NULL
  WHERE setting.period_id=p_period_id AND setting.include_in_average IS TRUE
 ) eligible;
 IF v_assessment_count>200 THEN
  RAISE EXCEPTION 'S4C3B2_TOO_MANY_ASSESSMENTS' USING ERRCODE='54000';
 END IF;

 WITH student_roster AS (
  SELECT enrollment.student_id,
    COALESCE(NULLIF(btrim(student.full_name),''),'Élève') AS student_name
  FROM public.schoolnet_school_student_class_assignments enrollment
  JOIN public.schoolnet_school_memberships membership
    ON membership.school_id=enrollment.school_id
     AND membership.user_id=enrollment.student_id
     AND membership.member_role='student' AND membership.status='active'
     AND membership.revoked_at IS NULL
  JOIN public.profiles student
    ON student.id=enrollment.student_id AND student.role::text='student'
  WHERE enrollment.school_id=p_school_id AND enrollment.school_year_id=v_school_year_id
    AND enrollment.class_id=p_class_id AND enrollment.status='active'
    AND enrollment.revoked_at IS NULL
 ), eligible_assessments AS (
  SELECT DISTINCT assessment.id AS assessment_id,assessment.max_score,
    setting.coefficient
  FROM schoolnet_private.school_official_assessment_coefficients setting
  JOIN public.assessments assessment
    ON assessment.id=setting.assessment_id
     AND assessment.status::text IN ('published','closed')
     AND assessment.created_by=v_uid
  JOIN schoolnet_private.school_assessment_links assessment_link
    ON assessment_link.assessment_id=assessment.id
     AND assessment_link.status='active' AND assessment_link.revoked_at IS NULL
  JOIN schoolnet_private.school_course_links course_link
    ON course_link.id=assessment_link.school_course_link_id
     AND course_link.course_id=assessment.course_id
     AND course_link.school_id=p_school_id
     AND course_link.school_year_id=v_school_year_id
     AND course_link.class_id=p_class_id
     AND course_link.subject_id=p_subject_id
     AND course_link.teacher_id=v_uid
     AND course_link.status='active' AND course_link.revoked_at IS NULL
  JOIN public.courses course
    ON course.id=course_link.course_id AND course.created_by=v_uid
     AND course.status::text='active'
  JOIN public.schoolnet_school_teacher_subject_assignments teacher_assignment
    ON teacher_assignment.id=course_link.teacher_assignment_id
     AND teacher_assignment.school_id=p_school_id
     AND teacher_assignment.school_year_id=v_school_year_id
     AND teacher_assignment.class_id=p_class_id
     AND teacher_assignment.subject_id=p_subject_id
     AND teacher_assignment.teacher_id=v_uid
     AND teacher_assignment.status='active' AND teacher_assignment.revoked_at IS NULL
  WHERE setting.period_id=p_period_id AND setting.include_in_average IS TRUE
 ), submissions AS (
  SELECT roster.student_id,roster.student_name,eligible.assessment_id,
    eligible.coefficient,
    CASE WHEN submission.status::text='published'
      AND submission.published_at IS NOT NULL
      AND submission.score IS NOT NULL
      AND eligible.max_score IS NOT NULL AND eligible.max_score>0
      AND submission.score>=0 AND submission.score<=eligible.max_score
      THEN (submission.score*20 / eligible.max_score)
      ELSE NULL END AS published_score_on_20
  FROM student_roster roster
  CROSS JOIN eligible_assessments eligible
  LEFT JOIN public.assessment_submissions submission
    ON submission.assessment_id=eligible.assessment_id
     AND submission.student_id=roster.student_id
 ), totals AS (
  SELECT roster.student_id,roster.student_name,
   count(submission.assessment_id)::integer AS included_assessments,
   count(submission.published_score_on_20)::integer AS published_assessments,
   sum(submission.published_score_on_20*submission.coefficient)
      AS weighted_score,
   sum(submission.coefficient) FILTER (
    WHERE submission.published_score_on_20 IS NOT NULL
   ) AS published_coefficients
  FROM student_roster roster
  LEFT JOIN submissions submission ON submission.student_id=roster.student_id
  GROUP BY roster.student_id,roster.student_name
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'studentId',totals.student_id,
   'studentName',totals.student_name,
   'includedAssessments',totals.included_assessments,
   'publishedAssessments',totals.published_assessments,
   'state',CASE
     WHEN v_subject_coefficient IS NULL OR totals.included_assessments=0
       THEN 'not_configured'
     WHEN totals.included_assessments=totals.published_assessments
       AND totals.published_coefficients>0 THEN 'ready'
     ELSE 'incomplete' END,
   'averageOn20',CASE
     WHEN v_subject_coefficient IS NOT NULL
       AND totals.included_assessments>0
       AND totals.included_assessments=totals.published_assessments
       AND totals.published_coefficients>0
     THEN round(totals.weighted_score/totals.published_coefficients,2)
     ELSE NULL END
 ) ORDER BY totals.student_name,totals.student_id),'[]'::jsonb)
 INTO v_students
 FROM totals;

 RETURN jsonb_build_object(
   'schoolId',p_school_id,
   'schoolYearId',v_school_year_id,
   'periodId',p_period_id,
   'classId',p_class_id,
   'subjectId',p_subject_id,
   'subjectCoefficient',v_subject_coefficient,
   'teacherScoped',true,
   'previewOnly',true,
   'students',v_students
 );
END $average$;

-- Invoker facade is the ONLY entry point allowed to clients.
CREATE FUNCTION public.schoolnet_teacher_official_subject_averages(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,p_subject_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $rpc$
 SELECT schoolnet_private.teacher_official_subject_averages(
   p_school_id,p_period_id,p_class_id,p_subject_id
 );
$rpc$;

REVOKE ALL ON FUNCTION schoolnet_private.teacher_official_subject_averages(
 uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.teacher_official_subject_averages(
 uuid,uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_teacher_official_subject_averages(
 uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_teacher_official_subject_averages(
 uuid,uuid,uuid,uuid) TO authenticated;

DO $postflight$
BEGIN
 IF has_function_privilege(
   'anon','public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_table_privilege('authenticated','schoolnet_private.school_grading_periods','SELECT')
 OR has_table_privilege('authenticated',
   'schoolnet_private.school_official_assessment_coefficients','SELECT')
 OR pg_get_functiondef(
   'schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)'::regprocedure
   ) NOT LIKE '%auth.uid()%'
 THEN RAISE EXCEPTION 'S4C3B2_POSTFLIGHT_FAILED'; END IF;
END $postflight$;
SELECT 'S4C3B2_PROPOSAL_ONLY_NOT_PRODUCTION' AS result;
