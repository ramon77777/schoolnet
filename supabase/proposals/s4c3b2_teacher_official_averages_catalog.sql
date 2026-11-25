-- SCHOOLNET V2 / S4-C.3-B.2 UI catalog - PROPOSAL ONLY, NEVER RUN ON PRIMARY WITHOUT GO.
-- Read-only teacher-scoped selector data. No student identities or grades.
DO $pre$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_averages_catalog()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_averages_catalog()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 OR to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
 THEN RAISE EXCEPTION 'S4C3B2_CATALOG_PREFLIGHT_FAILED'; END IF;
END $pre$;

CREATE FUNCTION schoolnet_private.teacher_official_averages_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $catalog$
DECLARE
 v_uid uuid:=auth.uid();
 v_rows jsonb;
 v_count integer;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4C3B2_CATALOG_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 WITH eligible AS (
  SELECT assignment.id AS assignment_id,
   school.id AS school_id,school.name AS school_name,
   cls.id AS class_id,cls.name AS class_name,
   year.id AS year_id,year.name AS year_name,
   subject.id AS subject_id,subject.name AS subject_name
  FROM public.schoolnet_school_teacher_subject_assignments assignment
  JOIN public.schoolnet_schools school
   ON school.id=assignment.school_id AND school.status='active'
  JOIN public.schoolnet_school_memberships membership
   ON membership.school_id=assignment.school_id
    AND membership.user_id=v_uid
    AND membership.member_role='teacher'
    AND membership.status='active' AND membership.revoked_at IS NULL
  JOIN public.classes cls
   ON cls.id=assignment.class_id
    AND cls.school_id=assignment.school_id
    AND cls.school_year_id=assignment.school_year_id
    AND cls.learning_context='school'
  JOIN public.school_years year ON year.id=assignment.school_year_id
  JOIN public.academic_subjects subject
   ON subject.id=assignment.subject_id AND subject.is_active
  WHERE assignment.teacher_id=v_uid
   AND assignment.status='active' AND assignment.revoked_at IS NULL
 )
 SELECT count(*) INTO v_count FROM eligible;
 IF v_count>200 THEN
  RAISE EXCEPTION 'S4C3B2_CATALOG_TOO_MANY_ASSIGNMENTS' USING ERRCODE='54000'; END IF;

 WITH eligible AS (
  SELECT assignment.id AS assignment_id,
   school.id AS school_id,school.name AS school_name,
   cls.id AS class_id,cls.name AS class_name,
   year.id AS year_id,year.name AS year_name,
   subject.id AS subject_id,subject.name AS subject_name
  FROM public.schoolnet_school_teacher_subject_assignments assignment
  JOIN public.schoolnet_schools school
   ON school.id=assignment.school_id AND school.status='active'
  JOIN public.schoolnet_school_memberships membership
   ON membership.school_id=assignment.school_id
    AND membership.user_id=v_uid
    AND membership.member_role='teacher'
    AND membership.status='active' AND membership.revoked_at IS NULL
  JOIN public.classes cls
   ON cls.id=assignment.class_id
    AND cls.school_id=assignment.school_id
    AND cls.school_year_id=assignment.school_year_id
    AND cls.learning_context='school'
  JOIN public.school_years year ON year.id=assignment.school_year_id
  JOIN public.academic_subjects subject
   ON subject.id=assignment.subject_id AND subject.is_active
  WHERE assignment.teacher_id=v_uid
   AND assignment.status='active' AND assignment.revoked_at IS NULL
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'assignmentId',eligible.assignment_id,
  'schoolId',eligible.school_id,'schoolName',eligible.school_name,
  'classId',eligible.class_id,'className',eligible.class_name,
  'schoolYearId',eligible.year_id,'schoolYearName',eligible.year_name,
  'subjectId',eligible.subject_id,'subjectName',eligible.subject_name,
  'periods',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',period.id,'code',period.code,'name',period.name,
      'startsOn',period.starts_on,'endsOn',period.ends_on,
      'isLocked',period.is_locked
    ) ORDER BY period.starts_on,period.id)
    FROM schoolnet_private.school_grading_periods period
    WHERE period.school_id=eligible.school_id
      AND period.school_year_id=eligible.year_id
   ),'[]'::jsonb)
  ) ORDER BY eligible.school_name,eligible.class_name,
   eligible.subject_name,eligible.assignment_id),'[]'::jsonb)
 INTO v_rows FROM eligible;
 RETURN jsonb_build_object('assignments',v_rows);
END $catalog$;

CREATE FUNCTION public.schoolnet_teacher_official_averages_catalog()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$
 SELECT schoolnet_private.teacher_official_averages_catalog();
$rpc$;

REVOKE ALL ON FUNCTION schoolnet_private.teacher_official_averages_catalog()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.teacher_official_averages_catalog()
 TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_teacher_official_averages_catalog()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_teacher_official_averages_catalog()
 TO authenticated;

DO $post$
BEGIN
 IF has_function_privilege('anon',
  'public.schoolnet_teacher_official_averages_catalog()','EXECUTE')
 OR has_table_privilege('authenticated',
  'schoolnet_private.school_grading_periods','SELECT')
 THEN RAISE EXCEPTION 'S4C3B2_CATALOG_POSTFLIGHT_FAILED'; END IF;
END $post$;
SELECT 'S4C3B2_CATALOG_PROPOSAL_ONLY' AS result;
