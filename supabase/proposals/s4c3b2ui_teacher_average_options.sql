-- SCHOOLNET V2 — C.3-B.2-UI / TEACHER PICKER METADATA, PROPOSAL ONLY.
-- NEVER install on the main Supabase database without a separate authorization.
-- No scores, no student IDs and no school-admin configuration RPC.
-- Requires C.3-A and C.3-B.2 teacher official subject averages.
DO $preflight$
BEGIN
 IF to_regprocedure(
  'public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)'
 ) IS NULL
 OR to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
 OR to_regprocedure('public.get_my_role()') IS NULL
 OR to_regprocedure('public.schoolnet_teacher_official_average_options()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_average_options()') IS NOT NULL
 THEN RAISE EXCEPTION 'S4C3B2UI_PREFLIGHT_FAILED'; END IF;
END $preflight$;

-- Every authorized school/class/subject/year assignment for the current teacher,
-- plus its valid school-year periods. No grades or roster information.
CREATE FUNCTION schoolnet_private.teacher_official_average_options()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $options$
DECLARE
 v_uid uuid:=auth.uid();
 v_assignments jsonb:='[]'::jsonb;
 v_periods jsonb:='[]'::jsonb;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4C3B2UI_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'assignmentId',rows.assignment_id,
   'schoolId',rows.school_id,
   'schoolName',rows.school_name,
   'schoolYearId',rows.school_year_id,
   'schoolYearName',rows.school_year_name,
   'classId',rows.class_id,
   'className',rows.class_name,
   'subjectId',rows.subject_id,
   'subjectName',rows.subject_name
 ) ORDER BY rows.school_name,rows.school_year_name,rows.class_name,
   rows.subject_name,rows.assignment_id),'[]'::jsonb)
 INTO v_assignments
 FROM (
  SELECT DISTINCT
   assignment.id assignment_id,
   school.id school_id,school.name school_name,
   year.id school_year_id,year.name school_year_name,
   cls.id class_id,cls.name class_name,
   subject.id subject_id,subject.name subject_name
  FROM public.schoolnet_school_teacher_subject_assignments assignment
  JOIN public.schoolnet_schools school
    ON school.id=assignment.school_id AND school.status='active'
  JOIN public.schoolnet_school_memberships member
    ON member.school_id=school.id AND member.user_id=v_uid
    AND member.member_role='teacher'
    AND member.status='active' AND member.revoked_at IS NULL
  JOIN public.classes cls
    ON cls.id=assignment.class_id AND cls.school_id=assignment.school_id
    AND cls.school_year_id=assignment.school_year_id
    AND cls.learning_context='school'
  JOIN public.school_years year ON year.id=cls.school_year_id
  JOIN public.academic_subjects subject
    ON subject.id=assignment.subject_id AND subject.is_active
  WHERE assignment.teacher_id=v_uid
    AND assignment.status='active'
    AND assignment.revoked_at IS NULL
 ) rows;

 IF jsonb_array_length(v_assignments)>200
 THEN RAISE EXCEPTION 'S4C3B2UI_TOO_MANY_ASSIGNMENTS' USING ERRCODE='54000'; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',period.id,
   'schoolId',period.school_id,
   'schoolYearId',period.school_year_id,
   'code',period.code,
   'name',period.name,
   'startsOn',period.starts_on,
   'endsOn',period.ends_on,
   'isLocked',period.is_locked
 ) ORDER BY period.starts_on,period.code,period.id),'[]'::jsonb)
 INTO v_periods
 FROM schoolnet_private.school_grading_periods period
 JOIN public.schoolnet_schools school
   ON school.id=period.school_id AND school.status='active'
 WHERE EXISTS (
  SELECT 1
  FROM public.schoolnet_school_teacher_subject_assignments assignment
  JOIN public.schoolnet_school_memberships member
    ON member.school_id=assignment.school_id
    AND member.user_id=v_uid
    AND member.member_role='teacher'
    AND member.status='active' AND member.revoked_at IS NULL
  JOIN public.classes cls
    ON cls.id=assignment.class_id
    AND cls.school_id=assignment.school_id
    AND cls.school_year_id=assignment.school_year_id
    AND cls.learning_context='school'
  JOIN public.academic_subjects subject
    ON subject.id=assignment.subject_id AND subject.is_active
  WHERE assignment.teacher_id=v_uid
    AND assignment.school_id=period.school_id
    AND assignment.school_year_id=period.school_year_id
    AND assignment.status='active'
    AND assignment.revoked_at IS NULL
 );
 IF jsonb_array_length(v_periods)>250
 THEN RAISE EXCEPTION 'S4C3B2UI_TOO_MANY_PERIODS' USING ERRCODE='54000'; END IF;

 RETURN jsonb_build_object('teacherScoped',true,'assignments',v_assignments,
  'periods',v_periods);
END $options$;

CREATE FUNCTION public.schoolnet_teacher_official_average_options()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$
 SELECT schoolnet_private.teacher_official_average_options();
$rpc$;

REVOKE ALL ON FUNCTION schoolnet_private.teacher_official_average_options()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.teacher_official_average_options()
 TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_teacher_official_average_options()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_teacher_official_average_options()
 TO authenticated;

DO $postflight$
BEGIN
 IF has_function_privilege(
   'anon','public.schoolnet_teacher_official_average_options()','EXECUTE')
 OR has_function_privilege(
   'anon','schoolnet_private.teacher_official_average_options()','EXECUTE')
 OR has_table_privilege('authenticated','schoolnet_private.school_grading_periods','SELECT')
 OR pg_get_functiondef(
   'schoolnet_private.teacher_official_average_options()'::regprocedure
 ) NOT LIKE '%auth.uid()%'
 THEN RAISE EXCEPTION 'S4C3B2UI_POSTFLIGHT_FAILED'; END IF;
END $postflight$;
SELECT 'S4C3B2UI_PROPOSAL_NOT_INSTALLED' AS result;
