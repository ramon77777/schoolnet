-- SCHOOLNET V2 S4-D.2c.4 -- read-only server-sourced export labels.
-- SQL CANDIDATE ONLY; NEVER deploy to the primary SCHOOLNET Supabase.
-- Real GoTrue JWT, role + active school membership, context + assignment.
-- No student ID, individual grade, raw assessment or PDF is returned.
-- For the Windows test, only the TS contract is run; SQL runs on disposable CI.
DO $preflight$
DECLARE v_col text;
BEGIN
 IF to_regprocedure('public.get_my_role()') IS NULL
 OR to_regclass('public.schoolnet_schools') IS NULL
 OR to_regclass('public.school_years') IS NULL
 OR to_regclass('public.classes') IS NULL
 OR to_regclass('public.academic_subjects') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR to_regclass('public.schoolnet_school_memberships') IS NULL
 OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
 OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
 OR to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('schoolnet_private.school_period_subject_coefficients') IS NULL
 OR to_regclass('schoolnet_private.school_official_curricula') IS NULL
 OR to_regprocedure('public.schoolnet_official_export_preview(uuid,uuid,uuid,text,uuid,text,text)') IS NULL
 OR to_regprocedure('public.schoolnet_official_export_labels(uuid,uuid,uuid,text,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.school_official_export_labels(uuid,uuid,uuid,text,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4D2C4_MISSING_DEPENDENCY_OR_ALREADY_INSTALLED'; END IF;
 -- The minimal CI fixture lacks several display-name columns. The fixture
 -- overlay adds them ONLY on disposable localhost and never to production.
 FOREACH v_col IN ARRAY ARRAY[
   'public.schoolnet_schools:name',
   'public.school_years:name',
   'public.classes:name',
   'schoolnet_private.school_grading_periods:name',
   'public.academic_subjects:name'
 ] LOOP
   IF NOT EXISTS (
     SELECT 1 FROM pg_catalog.pg_attribute a
     WHERE a.attrelid=to_regclass(split_part(v_col,':',1))
     AND a.attname=split_part(v_col,':',2)
     AND NOT a.attisdropped
   ) THEN RAISE EXCEPTION 'S4D2C4_NAME_COLUMN_MISSING_%',v_col; END IF;
 END LOOP;
END $preflight$;

CREATE FUNCTION schoolnet_private.school_official_export_labels(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_kind text,p_subject_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $labels$
DECLARE
 v_uid uuid:=auth.uid();
 v_role text;
 v_year uuid;
 v_school_name text;
 v_year_name text;
 v_class_name text;
 v_period_name text;
 v_subject_name text:=NULL;
 v_roster_count integer;
 v_roster_distinct integer;
BEGIN
 IF v_uid IS NULL OR p_school_id IS NULL OR p_period_id IS NULL
 OR p_class_id IS NULL OR p_kind IS NULL
 OR p_kind NOT IN ('class_general','subject_period')
 OR (p_kind='subject_period' AND p_subject_id IS NULL)
 OR (p_kind='class_general' AND p_subject_id IS NOT NULL)
 THEN RAISE EXCEPTION 'S4D2C4_SCOPE_DENIED' USING ERRCODE='42501'; END IF;

 -- Authenticated is not sufficient. Recheck the live profile role and
 -- nonrevoked school membership on every call, not a user-editable claim.
 v_role:=public.get_my_role()::text;
 IF v_role NOT IN ('school_admin','teacher')
 OR NOT EXISTS (
   SELECT 1 FROM public.schoolnet_school_memberships m
   JOIN public.profiles profile ON profile.id=m.user_id
    AND profile.role::text=v_role
   WHERE m.school_id=p_school_id AND m.user_id=v_uid
   AND m.member_role=v_role AND m.status='active' AND m.revoked_at IS NULL
 ) THEN RAISE EXCEPTION 'S4D2C4_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 SELECT period.school_year_id,school.name,school_year.name,cls.name,period.name
 INTO v_year,v_school_name,v_year_name,v_class_name,v_period_name
 FROM public.schoolnet_schools school
 JOIN schoolnet_private.school_grading_periods period
  ON period.school_id=school.id AND period.id=p_period_id
 JOIN public.school_years school_year ON school_year.id=period.school_year_id
 JOIN public.classes cls ON cls.id=p_class_id
  AND cls.school_id=school.id AND cls.school_year_id=school_year.id
  AND cls.learning_context='school'
 WHERE school.id=p_school_id AND school.status='active';
 IF v_year IS NULL THEN
   RAISE EXCEPTION 'S4D2C4_SCHOOL_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;

 IF v_role='school_admin' AND p_kind='class_general' THEN
   IF NOT EXISTS (
     SELECT 1 FROM schoolnet_private.school_official_curricula curriculum
     WHERE curriculum.school_id=p_school_id
      AND curriculum.school_year_id=v_year AND curriculum.class_id=p_class_id
      AND curriculum.period_id=p_period_id AND curriculum.status='approved'
   ) THEN RAISE EXCEPTION 'S4D2C4_APPROVAL_PENDING' USING ERRCODE='42501'; END IF;
 ELSIF v_role='teacher' AND p_kind='subject_period' THEN
   SELECT subject.name INTO v_subject_name
   FROM public.academic_subjects subject
   JOIN public.schoolnet_school_teacher_subject_assignments assignment
    ON assignment.subject_id=subject.id AND assignment.school_id=p_school_id
     AND assignment.school_year_id=v_year AND assignment.class_id=p_class_id
     AND assignment.teacher_id=v_uid
     AND assignment.status='active' AND assignment.revoked_at IS NULL
   JOIN schoolnet_private.school_period_subject_coefficients setting
    ON setting.subject_id=subject.id AND setting.class_id=p_class_id
     AND setting.period_id=p_period_id AND setting.coefficient>0
   WHERE subject.id=p_subject_id AND subject.is_active
   LIMIT 1;
   IF v_subject_name IS NULL THEN
     RAISE EXCEPTION 'S4D2C4_SUBJECT_ASSIGNMENT_DENIED' USING ERRCODE='42501';
   END IF;
 ELSE
   RAISE EXCEPTION 'S4D2C4_EXPORT_KIND_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;

 -- Do not invent or silently trim important display metadata.
 IF v_school_name IS NULL OR v_year_name IS NULL OR v_class_name IS NULL
 OR v_period_name IS NULL
 OR char_length(v_school_name) NOT BETWEEN 1 AND 75
 OR char_length(v_year_name) NOT BETWEEN 1 AND 40
 OR char_length(v_class_name) NOT BETWEEN 1 AND 40
 OR char_length(v_period_name) NOT BETWEEN 1 AND 55
 OR btrim(v_school_name) IS DISTINCT FROM v_school_name
 OR btrim(v_year_name) IS DISTINCT FROM v_year_name
 OR btrim(v_class_name) IS DISTINCT FROM v_class_name
 OR btrim(v_period_name) IS DISTINCT FROM v_period_name
 OR v_school_name ~ '[[:cntrl:]]'
 OR v_year_name ~ '[[:cntrl:]]'
 OR v_class_name ~ '[[:cntrl:]]'
 OR v_period_name ~ '[[:cntrl:]]'
 OR (p_kind='subject_period' AND
      (char_length(v_subject_name) NOT BETWEEN 1 AND 50
       OR btrim(v_subject_name) IS DISTINCT FROM v_subject_name
       OR v_subject_name ~ '[[:cntrl:]]'))
 THEN RAISE EXCEPTION 'S4D2C4_INVALID_REFERENCE_NAME' USING ERRCODE='42501'; END IF;

 -- Count ONLY active student affiliations in the requested class and school,
 -- using the same conditions as the unchanged grade-calculation RPC.
 -- This aggregate is metadata only; student names, UUIDs and grades do not leak.
 SELECT count(*)::integer,count(DISTINCT assignment.student_id)::integer
 INTO v_roster_count,v_roster_distinct
 FROM public.schoolnet_school_student_class_assignments assignment
 JOIN public.schoolnet_school_memberships membership
  ON membership.school_id=assignment.school_id
   AND membership.user_id=assignment.student_id
   AND membership.member_role='student' AND membership.status='active'
   AND membership.revoked_at IS NULL
 JOIN public.profiles profile ON profile.id=assignment.student_id
   AND profile.role::text='student'
 WHERE assignment.school_id=p_school_id AND assignment.school_year_id=v_year
   AND assignment.class_id=p_class_id AND assignment.status='active'
   AND assignment.revoked_at IS NULL;
 IF v_roster_count NOT BETWEEN 1 AND 250
 OR v_roster_count IS DISTINCT FROM v_roster_distinct
 THEN RAISE EXCEPTION 'S4D2C4_INVALID_ROSTER_COUNT' USING ERRCODE='42501'; END IF;

 RETURN jsonb_build_object(
  'source','schoolnet_v2_db_scoped_labels_v1',
  'previewOnly',true,
  'kind',p_kind,
  'roleScope',v_role,
  'schoolId',p_school_id,
  'schoolYearId',v_year,
  'classId',p_class_id,
  'periodId',p_period_id,
  'subjectId',p_subject_id,
  'schoolName',v_school_name,
  'schoolYear',v_year_name,
  'className',v_class_name,
  'periodName',v_period_name,
  'subjectName',v_subject_name,
  'activeRosterCount',v_roster_count
 );
END $labels$;

-- Exposed PostgREST facade; authorization is checked INSIDE the private function.
CREATE FUNCTION public.schoolnet_official_export_labels(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_kind text,p_subject_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $facade$
 SELECT schoolnet_private.school_official_export_labels(
  p_school_id,p_period_id,p_class_id,p_kind,p_subject_id
 );
$facade$;

REVOKE ALL ON FUNCTION schoolnet_private.school_official_export_labels(
 uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_official_export_labels(
 uuid,uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.school_official_export_labels(
 uuid,uuid,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_official_export_labels(
 uuid,uuid,uuid,text,uuid) TO authenticated;

DO $postflight$
BEGIN
 IF has_function_privilege('anon',
  'public.schoolnet_official_export_labels(uuid,uuid,uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'S4D2C4_INSECURE_FUNCTION_GRANT'; END IF;
END $postflight$;
SELECT 'S4D2C4_CANDIDATE_DISPOSABLE_ONLY' AS verdict;
