-- SCHOOLNET S4-C.3-B.6.2 / PROPOSAL ONLY / 2026-11-25
-- NEVER APPLY ON THE PRINCIPAL DATABASE WITHOUT A SEPARATE EXPLICIT GO.
-- V1 grade and score tables, existing school_admin APIs and periods are untouched.
-- PostgreSQL SECURITY DEFINER helpers live ONLY in the private schema.
-- All public facades are SECURITY INVOKER, EXECUTE granted solely authenticated.
DO $preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)') IS NULL
 OR to_regprocedure('public.get_my_role()') IS NULL
 OR to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('schoolnet_private.school_official_assessment_coefficients') IS NULL
 OR to_regprocedure('public.schoolnet_teacher_official_averages_catalog()') IS NULL
 OR to_regclass('schoolnet_private.school_teacher_coefficient_delegations') IS NOT NULL
 OR to_regclass('schoolnet_private.school_teacher_coefficient_events') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_coefficient_settings(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_set_assessment_coefficient(uuid,uuid,uuid,numeric,boolean)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_school_teacher_coefficient_delegations(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_school_set_teacher_coefficient_delegation(uuid,uuid,boolean)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4C3B6_PREFLIGHT_FAILED' USING ERRCODE='55000'; END IF;
END $preflight$;

CREATE TABLE schoolnet_private.school_teacher_coefficient_delegations(
 teacher_assignment_id uuid PRIMARY KEY
  REFERENCES public.schoolnet_school_teacher_subject_assignments(id) ON DELETE RESTRICT,
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
 can_edit_subject_coefficient boolean NOT NULL DEFAULT false,
 changed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX s4c3b6_delegations_school ON schoolnet_private.school_teacher_coefficient_delegations(school_id);

CREATE TABLE schoolnet_private.school_teacher_coefficient_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('teacher_assessment_coefficient','teacher_subject_coefficient','school_subject_delegation')),
 assignment_id uuid REFERENCES public.schoolnet_school_teacher_subject_assignments(id) ON DELETE RESTRICT,
 period_id uuid REFERENCES schoolnet_private.school_grading_periods(id) ON DELETE RESTRICT,
 assessment_id uuid REFERENCES public.assessments(id) ON DELETE RESTRICT,
 class_id uuid REFERENCES public.classes(id) ON DELETE RESTRICT,
 subject_id uuid REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
 previous_value jsonb,
 current_value jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX s4c3b6_events_school ON schoolnet_private.school_teacher_coefficient_events(school_id,changed_at DESC);
CREATE INDEX s4c3b6_events_actor ON schoolnet_private.school_teacher_coefficient_events(actor_id,changed_at DESC);
ALTER TABLE schoolnet_private.school_teacher_coefficient_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_teacher_coefficient_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_private.school_teacher_coefficient_delegations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON schoolnet_private.school_teacher_coefficient_events FROM PUBLIC,anon,authenticated;
-- No table policies: all access is via authenticated, scoped RPCs.

CREATE FUNCTION schoolnet_private.teacher_coefficient_settings(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE
 v_uid uuid:=auth.uid();
 v_assignments jsonb;v_periods jsonb;v_settings jsonb;v_assessments jsonb;v_history jsonb;
BEGIN
 IF v_uid IS NULL OR p_school_id IS NULL
 OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 OR NOT EXISTS(SELECT 1 FROM public.schoolnet_schools s WHERE s.id=p_school_id AND s.status='active')
 OR NOT EXISTS(
  SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments ta
  JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
   AND m.user_id=ta.teacher_id AND m.member_role='teacher'
   AND m.status='active' AND m.revoked_at IS NULL
  JOIN public.classes cl ON cl.id=ta.class_id AND cl.school_id=ta.school_id
   AND cl.school_year_id=ta.school_year_id AND cl.learning_context='school'
  JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
  WHERE ta.school_id=p_school_id AND ta.teacher_id=v_uid AND ta.status='active'
   AND ta.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'S4C3B6_TEACHER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'assignmentId',ta.id,'classId',cl.id,'className',cl.name,
  'schoolYearId',sy.id,'schoolYearName',sy.name,
  'subjectId',sub.id,'subjectName',sub.name,
  'canEditSubjectCoefficient',COALESCE(d.can_edit_subject_coefficient,false))
  ORDER BY cl.name,sub.name,ta.id),'[]'::jsonb) INTO v_assignments
 FROM public.schoolnet_school_teacher_subject_assignments ta
 JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
  AND m.user_id=v_uid AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
 JOIN public.classes cl ON cl.id=ta.class_id AND cl.school_id=ta.school_id
  AND cl.school_year_id=ta.school_year_id AND cl.learning_context='school'
 JOIN public.school_years sy ON sy.id=ta.school_year_id
 JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
 LEFT JOIN schoolnet_private.school_teacher_coefficient_delegations d
  ON d.teacher_assignment_id=ta.id AND d.school_id=ta.school_id
 WHERE ta.school_id=p_school_id AND ta.teacher_id=v_uid
  AND ta.status='active' AND ta.revoked_at IS NULL;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',p.id,'schoolYearId',p.school_year_id,'code',p.code,'name',p.name,
  'startsOn',p.starts_on,'endsOn',p.ends_on,'isLocked',p.is_locked)
  ORDER BY p.starts_on,p.id),'[]'::jsonb) INTO v_periods
 FROM schoolnet_private.school_grading_periods p
 WHERE p.school_id=p_school_id AND EXISTS (
  SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments ta
  JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
   AND m.user_id=v_uid AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
  WHERE ta.school_id=p_school_id AND ta.teacher_id=v_uid
   AND ta.school_year_id=p.school_year_id AND ta.status='active' AND ta.revoked_at IS NULL);

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'periodId',p.id,'classId',sc.class_id,'subjectId',sc.subject_id,
  'coefficient',sc.coefficient)
  ORDER BY p.starts_on,sc.class_id,sc.subject_id),'[]'::jsonb) INTO v_settings
 FROM schoolnet_private.school_period_subject_coefficients sc
 JOIN schoolnet_private.school_grading_periods p
  ON p.id=sc.period_id AND p.school_id=p_school_id
 WHERE EXISTS(
  SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments ta
  JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
   AND m.user_id=v_uid AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
  WHERE ta.school_id=p_school_id AND ta.teacher_id=v_uid AND ta.status='active'
   AND ta.revoked_at IS NULL AND ta.school_year_id=p.school_year_id
   AND ta.class_id=sc.class_id AND ta.subject_id=sc.subject_id);

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'assessmentId',a.id,'title',a.title,'classId',l.class_id,
  'schoolYearId',l.school_year_id,'subjectId',l.subject_id,
  'periodId',ac.period_id,'coefficient',ac.coefficient,
  'includeInAverage',COALESCE(ac.include_in_average,false))
  ORDER BY a.title,a.id),'[]'::jsonb) INTO v_assessments
 FROM schoolnet_private.school_assessment_links al
 JOIN schoolnet_private.school_course_links l
  ON l.id=al.school_course_link_id AND l.school_id=p_school_id
  AND l.teacher_id=v_uid AND l.status='active' AND l.revoked_at IS NULL
 JOIN public.assessments a ON a.id=al.assessment_id
  AND a.course_id=l.course_id AND a.created_by=v_uid
 JOIN public.courses co ON co.id=l.course_id AND co.created_by=v_uid
  AND co.status::text='active'
 JOIN public.schoolnet_school_teacher_subject_assignments ta
  ON ta.id=l.teacher_assignment_id AND ta.school_id=l.school_id
  AND ta.class_id=l.class_id AND ta.school_year_id=l.school_year_id
  AND ta.subject_id=l.subject_id AND ta.teacher_id=v_uid
  AND ta.status='active' AND ta.revoked_at IS NULL
 JOIN public.schoolnet_school_memberships m ON m.school_id=l.school_id
  AND m.user_id=v_uid AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
 JOIN public.classes cl ON cl.id=l.class_id AND cl.school_id=l.school_id
  AND cl.school_year_id=l.school_year_id AND cl.learning_context='school'
 JOIN public.academic_subjects sub ON sub.id=l.subject_id AND sub.is_active
 LEFT JOIN schoolnet_private.school_official_assessment_coefficients ac ON ac.assessment_id=a.id
 WHERE al.status='active' AND al.revoked_at IS NULL;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'action',hist.action,'at',hist.changed_at,'periodId',hist.period_id,
  'assessmentId',hist.assessment_id,'classId',hist.class_id,
  'subjectId',hist.subject_id,'previousValue',hist.previous_value,
  'currentValue',hist.current_value)
  ORDER BY hist.changed_at DESC,hist.id DESC),'[]'::jsonb) INTO v_history
 FROM (SELECT * FROM schoolnet_private.school_teacher_coefficient_events
  WHERE school_id=p_school_id AND actor_id=v_uid
  ORDER BY changed_at DESC,id DESC LIMIT 30) hist;

 IF jsonb_array_length(v_assignments)>200 OR jsonb_array_length(v_periods)>200
 OR jsonb_array_length(v_settings)>3000 OR jsonb_array_length(v_assessments)>300
 THEN RAISE EXCEPTION 'S4C3B6_TOO_MANY_RECORDS' USING ERRCODE='54000'; END IF;
 RETURN jsonb_build_object('schoolId',p_school_id,'assignments',v_assignments,
  'periods',v_periods,'subjectSettings',v_settings,'assessments',v_assessments,
  'history',v_history);
END $body$;

CREATE FUNCTION schoolnet_private.teacher_set_assessment_coefficient(
 p_school_id uuid,p_period_id uuid,p_assessment_id uuid,
 p_coefficient numeric,p_include_in_average boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE
 v_uid uuid:=auth.uid();v_year uuid;v_assignment uuid;
 v_old schoolnet_private.school_official_assessment_coefficients%ROWTYPE;
 v_old_school uuid;v_old_locked boolean;v_prev jsonb;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4C3B6_TEACHER_DENIED' USING ERRCODE='42501'; END IF;
 IF p_coefficient IS NULL OR p_coefficient<0.25 OR p_coefficient>20
 OR p_coefficient<>round(p_coefficient,2) OR p_include_in_average IS NULL
 THEN RAISE EXCEPTION 'S4C3B6_BAD_COEFFICIENT' USING ERRCODE='23514'; END IF;
 SELECT p.school_year_id INTO v_year FROM schoolnet_private.school_grading_periods p
 JOIN public.schoolnet_schools s ON s.id=p.school_id AND s.status='active'
 WHERE p.id=p_period_id AND p.school_id=p_school_id AND NOT p.is_locked
 FOR UPDATE OF p;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3B6_PERIOD_LOCKED_OR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT ta.id INTO v_assignment FROM schoolnet_private.school_assessment_links al
 JOIN schoolnet_private.school_course_links l
  ON l.id=al.school_course_link_id AND l.school_id=p_school_id
  AND l.school_year_id=v_year AND l.teacher_id=v_uid
  AND l.status='active' AND l.revoked_at IS NULL
 JOIN public.assessments a ON a.id=al.assessment_id
  AND a.course_id=l.course_id AND a.created_by=v_uid
 JOIN public.courses co ON co.id=l.course_id AND co.created_by=v_uid
  AND co.status::text='active'
 JOIN public.schoolnet_school_teacher_subject_assignments ta
  ON ta.id=l.teacher_assignment_id AND ta.school_id=l.school_id
  AND ta.class_id=l.class_id AND ta.school_year_id=l.school_year_id
  AND ta.subject_id=l.subject_id AND ta.teacher_id=v_uid
  AND ta.status='active' AND ta.revoked_at IS NULL
 JOIN public.schoolnet_school_memberships m ON m.school_id=l.school_id
  AND m.user_id=v_uid AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
 JOIN public.classes cl ON cl.id=l.class_id AND cl.school_id=l.school_id
  AND cl.school_year_id=l.school_year_id AND cl.learning_context='school'
 JOIN public.academic_subjects sub ON sub.id=l.subject_id AND sub.is_active
 WHERE al.assessment_id=p_assessment_id AND al.status='active' AND al.revoked_at IS NULL
 FOR SHARE OF ta,m,l,al;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3B6_ASSESSMENT_NOT_MINE' USING ERRCODE='42501'; END IF;
 SELECT old.* INTO v_old
 FROM schoolnet_private.school_official_assessment_coefficients old
 WHERE old.assessment_id=p_assessment_id FOR UPDATE;
 IF FOUND THEN
  SELECT p.school_id,p.is_locked INTO v_old_school,v_old_locked
  FROM schoolnet_private.school_grading_periods p WHERE p.id=v_old.period_id FOR SHARE;
  IF v_old_school IS DISTINCT FROM p_school_id OR
   (v_old.period_id<>p_period_id AND v_old_locked)
  THEN RAISE EXCEPTION 'S4C3B6_PREVIOUS_PERIOD_LOCKED_OR_OTHER_SCHOOL' USING ERRCODE='42501'; END IF;
  v_prev:=jsonb_build_object('periodId',v_old.period_id,'coefficient',v_old.coefficient,
   'includeInAverage',v_old.include_in_average);
  IF v_old.period_id=p_period_id AND v_old.coefficient=p_coefficient
   AND v_old.include_in_average=p_include_in_average THEN RETURN true; END IF;
 END IF;
 INSERT INTO schoolnet_private.school_official_assessment_coefficients AS target(
  assessment_id,period_id,coefficient,include_in_average,updated_by)
 VALUES(p_assessment_id,p_period_id,p_coefficient,p_include_in_average,v_uid)
 ON CONFLICT (assessment_id) DO UPDATE SET
  period_id=EXCLUDED.period_id,coefficient=EXCLUDED.coefficient,
  include_in_average=EXCLUDED.include_in_average,updated_by=EXCLUDED.updated_by,
  updated_at=now();
 INSERT INTO schoolnet_private.school_teacher_coefficient_events(
  school_id,actor_id,action,assignment_id,period_id,assessment_id,
  previous_value,current_value)
 VALUES(p_school_id,v_uid,'teacher_assessment_coefficient',v_assignment,
  p_period_id,p_assessment_id,v_prev,
  jsonb_build_object('periodId',p_period_id,'coefficient',p_coefficient,
  'includeInAverage',p_include_in_average));
 RETURN true;
END $body$;

CREATE FUNCTION schoolnet_private.teacher_set_subject_coefficient(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,p_subject_id uuid,p_coefficient numeric)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE
 v_uid uuid:=auth.uid();v_year uuid;v_assignment uuid;v_old numeric;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4C3B6_TEACHER_DENIED' USING ERRCODE='42501'; END IF;
 IF p_coefficient IS NULL OR p_coefficient<0.25 OR p_coefficient>20
 OR p_coefficient<>round(p_coefficient,2)
 THEN RAISE EXCEPTION 'S4C3B6_BAD_COEFFICIENT' USING ERRCODE='23514'; END IF;
 SELECT p.school_year_id INTO v_year FROM schoolnet_private.school_grading_periods p
 JOIN public.schoolnet_schools s ON s.id=p.school_id AND s.status='active'
 WHERE p.id=p_period_id AND p.school_id=p_school_id AND NOT p.is_locked FOR UPDATE OF p;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3B6_PERIOD_LOCKED_OR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT ta.id INTO v_assignment FROM public.schoolnet_school_teacher_subject_assignments ta
 JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
  AND m.user_id=v_uid AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
 JOIN public.classes cl ON cl.id=ta.class_id AND cl.school_id=ta.school_id
  AND cl.school_year_id=ta.school_year_id AND cl.learning_context='school'
 JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
 JOIN schoolnet_private.school_teacher_coefficient_delegations d
  ON d.teacher_assignment_id=ta.id AND d.school_id=ta.school_id
  AND d.can_edit_subject_coefficient
 WHERE ta.school_id=p_school_id AND ta.teacher_id=v_uid AND ta.status='active'
  AND ta.revoked_at IS NULL AND ta.class_id=p_class_id AND ta.subject_id=p_subject_id
  AND ta.school_year_id=v_year FOR SHARE OF ta,m,d;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3B6_SUBJECT_DELEGATION_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT coefficient INTO v_old
 FROM schoolnet_private.school_period_subject_coefficients
 WHERE period_id=p_period_id AND class_id=p_class_id AND subject_id=p_subject_id FOR UPDATE;
 IF FOUND AND v_old=p_coefficient THEN RETURN true; END IF;
 INSERT INTO schoolnet_private.school_period_subject_coefficients AS target(
  period_id,class_id,subject_id,coefficient,updated_by)
 VALUES(p_period_id,p_class_id,p_subject_id,p_coefficient,v_uid)
 ON CONFLICT(period_id,class_id,subject_id) DO UPDATE SET
  coefficient=EXCLUDED.coefficient,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO schoolnet_private.school_teacher_coefficient_events(
  school_id,actor_id,action,assignment_id,period_id,class_id,subject_id,
  previous_value,current_value)
 VALUES(p_school_id,v_uid,'teacher_subject_coefficient',v_assignment,p_period_id,
  p_class_id,p_subject_id,CASE WHEN v_old IS NULL THEN NULL
   ELSE jsonb_build_object('coefficient',v_old) END,
  jsonb_build_object('coefficient',p_coefficient));
 RETURN true;
END $body$;

CREATE FUNCTION schoolnet_private.school_teacher_coefficient_delegations(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE v_rows jsonb;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,false);
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'assignmentId',ta.id,'teacherName',COALESCE(pr.full_name,'Enseignant'),
  'className',cl.name,'subjectName',sub.name,
  'schoolYearName',sy.name,
  'canEditSubjectCoefficient',COALESCE(d.can_edit_subject_coefficient,false))
  ORDER BY sy.name DESC,cl.name,sub.name,pr.full_name,ta.id),'[]'::jsonb)
 INTO v_rows
 FROM public.schoolnet_school_teacher_subject_assignments ta
 JOIN public.schoolnet_schools s ON s.id=ta.school_id AND s.status='active'
 JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
  AND m.user_id=ta.teacher_id AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
 JOIN public.classes cl ON cl.id=ta.class_id AND cl.school_id=ta.school_id
  AND cl.school_year_id=ta.school_year_id AND cl.learning_context='school'
 JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
 JOIN public.school_years sy ON sy.id=ta.school_year_id
 JOIN public.profiles pr ON pr.id=ta.teacher_id
 LEFT JOIN schoolnet_private.school_teacher_coefficient_delegations d
  ON d.teacher_assignment_id=ta.id AND d.school_id=ta.school_id
 WHERE ta.school_id=p_school_id AND ta.status='active' AND ta.revoked_at IS NULL;
 IF jsonb_array_length(v_rows)>600 THEN
  RAISE EXCEPTION 'S4C3B6_TOO_MANY_ASSIGNMENTS' USING ERRCODE='54000'; END IF;
 RETURN jsonb_build_object('schoolId',p_school_id,'assignments',v_rows);
END $body$;

CREATE FUNCTION schoolnet_private.school_set_teacher_coefficient_delegation(
 p_school_id uuid,p_teacher_assignment_id uuid,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $body$
DECLARE v_old boolean;v_found boolean;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
 IF p_enabled IS NULL THEN
  RAISE EXCEPTION 'S4C3B6_INVALID_DELEGATION' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments ta
  JOIN public.schoolnet_schools s ON s.id=ta.school_id AND s.status='active'
  JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
   AND m.user_id=ta.teacher_id AND m.member_role='teacher' AND m.status='active' AND m.revoked_at IS NULL
  JOIN public.classes cl ON cl.id=ta.class_id AND cl.school_id=ta.school_id
   AND cl.school_year_id=ta.school_year_id AND cl.learning_context='school'
  JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
  WHERE ta.id=p_teacher_assignment_id AND ta.school_id=p_school_id
   AND ta.status='active' AND ta.revoked_at IS NULL
 ) THEN RAISE EXCEPTION 'S4C3B6_BAD_TEACHER_ASSIGNMENT' USING ERRCODE='42501'; END IF;
 SELECT can_edit_subject_coefficient INTO v_old
 FROM schoolnet_private.school_teacher_coefficient_delegations
 WHERE teacher_assignment_id=p_teacher_assignment_id FOR UPDATE;
 v_found:=FOUND;
 IF v_found AND v_old=p_enabled THEN RETURN true; END IF;
 INSERT INTO schoolnet_private.school_teacher_coefficient_delegations AS d(
  teacher_assignment_id,school_id,can_edit_subject_coefficient,changed_by)
 VALUES(p_teacher_assignment_id,p_school_id,p_enabled,auth.uid())
 ON CONFLICT (teacher_assignment_id) DO UPDATE
 SET can_edit_subject_coefficient=EXCLUDED.can_edit_subject_coefficient,
  changed_by=EXCLUDED.changed_by,changed_at=now();
 INSERT INTO schoolnet_private.school_teacher_coefficient_events(
  school_id,actor_id,action,assignment_id,previous_value,current_value)
 VALUES(p_school_id,auth.uid(),'school_subject_delegation',p_teacher_assignment_id,
  CASE WHEN v_found THEN jsonb_build_object('enabled',v_old) ELSE NULL END,
  jsonb_build_object('enabled',p_enabled));
 RETURN true;
END $body$;

-- Public API: user identity is always auth.uid(), never a client-supplied teacher ID.
CREATE FUNCTION public.schoolnet_teacher_coefficient_settings(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.teacher_coefficient_settings(p_school_id); $rpc$;
CREATE FUNCTION public.schoolnet_teacher_set_assessment_coefficient(
 p_school_id uuid,p_period_id uuid,p_assessment_id uuid,
 p_coefficient numeric,p_include_in_average boolean)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.teacher_set_assessment_coefficient(
 p_school_id,p_period_id,p_assessment_id,p_coefficient,p_include_in_average); $rpc$;
CREATE FUNCTION public.schoolnet_teacher_set_subject_coefficient(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,p_subject_id uuid,p_coefficient numeric)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.teacher_set_subject_coefficient(
 p_school_id,p_period_id,p_class_id,p_subject_id,p_coefficient); $rpc$;
CREATE FUNCTION public.schoolnet_school_teacher_coefficient_delegations(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_teacher_coefficient_delegations(p_school_id); $rpc$;
CREATE FUNCTION public.schoolnet_school_set_teacher_coefficient_delegation(
 p_school_id uuid,p_teacher_assignment_id uuid,p_enabled boolean)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_set_teacher_coefficient_delegation(
 p_school_id,p_teacher_assignment_id,p_enabled); $rpc$;

DO $privileges$
DECLARE rec record;
BEGIN
 FOR rec IN SELECT p.oid::regprocedure AS signature
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='schoolnet_private' AND p.proname IN (
  'teacher_coefficient_settings','teacher_set_assessment_coefficient',
  'teacher_set_subject_coefficient','school_teacher_coefficient_delegations',
  'school_set_teacher_coefficient_delegation'))
 OR (n.nspname='public' AND p.proname IN (
  'schoolnet_teacher_coefficient_settings','schoolnet_teacher_set_assessment_coefficient',
  'schoolnet_teacher_set_subject_coefficient',
  'schoolnet_school_teacher_coefficient_delegations',
  'schoolnet_school_set_teacher_coefficient_delegation'))
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',rec.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',rec.signature);
 END LOOP;
END $privileges$;

DO $postflight$
BEGIN
 IF has_function_privilege('anon','public.schoolnet_teacher_coefficient_settings(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.schoolnet_teacher_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric)','EXECUTE')
 OR has_function_privilege('anon','public.schoolnet_school_set_teacher_coefficient_delegation(uuid,uuid,boolean)','EXECUTE')
 OR has_table_privilege('authenticated','schoolnet_private.school_teacher_coefficient_delegations','UPDATE')
 OR has_table_privilege('authenticated','schoolnet_private.school_teacher_coefficient_events','SELECT')
 THEN RAISE EXCEPTION 'S4C3B6_POSTFLIGHT_FAILED' USING ERRCODE='42501'; END IF;
END $postflight$;
SELECT 'S4C3B6_PROPOSAL_ONLY' AS result;
