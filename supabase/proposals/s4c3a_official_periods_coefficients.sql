-- SCHOOLNET V2 / S4-C.3-A / G2 PROPOSAL ONLY (2026-11-24).
-- NOT A MIGRATION. Do not execute on SCHOOLNET principal without a distinct GO.
-- School-local periods / coefficients; V1 grading_periods and scores remain untouched.
-- Every client read/write is through an authenticated, school-admin-scoped RPC.

DO $pre$
BEGIN
  IF to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)') IS NULL
    OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
    OR to_regclass('schoolnet_private.school_course_links') IS NULL
    OR to_regclass('schoolnet_private.school_grading_periods') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_grading_configuration(uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_lock_grading_period(uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_set_assessment_coefficient(uuid,uuid,uuid,numeric,boolean)') IS NOT NULL
  THEN RAISE EXCEPTION 'S4C3A_PREFLIGHT_FAILED'; END IF;
END $pre$;

CREATE TABLE schoolnet_private.school_grading_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
 school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
 code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 90),
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 is_locked boolean NOT NULL DEFAULT false,
 locked_at timestamptz,
 locked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT s4c3a_period_dates CHECK (starts_on<=ends_on),
 CONSTRAINT s4c3a_period_lock CHECK (
   (NOT is_locked AND locked_at IS NULL AND locked_by IS NULL) OR
   (is_locked AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
 ),
 CONSTRAINT s4c3a_period_school_year_code UNIQUE (school_id,school_year_id,code)
);
CREATE INDEX s4c3a_school_period_year ON schoolnet_private.school_grading_periods(school_id,school_year_id);

CREATE TABLE schoolnet_private.school_period_subject_coefficients (
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id) ON DELETE RESTRICT,
 class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
 subject_id uuid NOT NULL REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
 coefficient numeric(6,2) NOT NULL CHECK (coefficient>=0.25 AND coefficient<=20),
 updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(period_id,class_id,subject_id)
);
CREATE TABLE schoolnet_private.school_official_assessment_coefficients (
 assessment_id uuid PRIMARY KEY REFERENCES public.assessments(id) ON DELETE RESTRICT,
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id) ON DELETE RESTRICT,
 coefficient numeric(6,2) NOT NULL CHECK(coefficient>=0.25 AND coefficient<=20),
 include_in_average boolean NOT NULL DEFAULT false,
 updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX s4c3a_assessment_period ON schoolnet_private.school_official_assessment_coefficients(period_id);

ALTER TABLE schoolnet_private.school_grading_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_period_subject_coefficients ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_official_assessment_coefficients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_private.school_grading_periods FROM PUBLIC,anon,authenticated;
REVOKE ALL ON schoolnet_private.school_period_subject_coefficients FROM PUBLIC,anon,authenticated;
REVOKE ALL ON schoolnet_private.school_official_assessment_coefficients FROM PUBLIC,anon,authenticated;
-- Intentional: no client RLS policies. Security-definer RPCs check JWT role and local affiliation.

CREATE FUNCTION schoolnet_private.school_grading_configuration(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $read$
DECLARE v_years jsonb; v_subjects jsonb; v_periods jsonb;
        v_subject_settings jsonb; v_assessments jsonb;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,false);
 IF NOT EXISTS (SELECT 1 FROM public.schoolnet_schools WHERE id=p_school_id AND status='active')
 THEN RAISE EXCEPTION 'S4C3A_SCHOOL_INACTIVE' USING ERRCODE='42501'; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',sy.id,'name',sy.name,'startsOn',sy.starts_on,'endsOn',sy.ends_on
 ) ORDER BY sy.starts_on DESC),'[]'::jsonb) INTO v_years
 FROM public.school_years sy
 WHERE EXISTS(SELECT 1 FROM public.classes cl
  WHERE cl.school_id=p_school_id AND cl.school_year_id=sy.id
    AND cl.learning_context='school');

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'classId',r.class_id,'className',r.class_name,
   'schoolYearId',r.school_year_id,'subjectId',r.subject_id,
   'subjectName',r.subject_name
 ) ORDER BY r.class_name,r.subject_name,r.class_id,r.subject_id),'[]'::jsonb)
 INTO v_subjects FROM (
   SELECT DISTINCT cl.id AS class_id,cl.name AS class_name,
     cl.school_year_id,sub.id AS subject_id,sub.name AS subject_name
   FROM public.schoolnet_school_teacher_subject_assignments ta
   JOIN public.classes cl ON cl.id=ta.class_id
     AND cl.school_id=ta.school_id AND cl.school_year_id=ta.school_year_id
     AND cl.learning_context='school'
   JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
   JOIN public.schoolnet_school_memberships m ON m.school_id=ta.school_id
     AND m.user_id=ta.teacher_id AND m.member_role='teacher' AND m.status='active'
   WHERE ta.school_id=p_school_id AND ta.status='active' AND ta.revoked_at IS NULL
 ) r;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',p.id,'schoolYearId',p.school_year_id,'code',p.code,'name',p.name,
   'startsOn',p.starts_on,'endsOn',p.ends_on,'isLocked',p.is_locked
 ) ORDER BY p.starts_on,p.id),'[]'::jsonb)
 INTO v_periods FROM schoolnet_private.school_grading_periods p
 WHERE p.school_id=p_school_id;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'periodId',p.id,'classId',s.class_id,'subjectId',s.subject_id,
   'coefficient',s.coefficient
 ) ORDER BY p.starts_on,s.class_id,s.subject_id),'[]'::jsonb)
 INTO v_subject_settings
 FROM schoolnet_private.school_period_subject_coefficients s
 JOIN schoolnet_private.school_grading_periods p
   ON p.id=s.period_id AND p.school_id=p_school_id
 WHERE EXISTS(
   SELECT 1 FROM public.classes cl
   JOIN public.schoolnet_school_teacher_subject_assignments ta
     ON ta.class_id=cl.id AND ta.school_id=p.school_id
     AND ta.school_year_id=p.school_year_id AND ta.subject_id=s.subject_id
     AND ta.status='active' AND ta.revoked_at IS NULL
   JOIN public.schoolnet_school_memberships tm
     ON tm.school_id=ta.school_id AND tm.user_id=ta.teacher_id
     AND tm.member_role='teacher' AND tm.status='active'
   JOIN public.academic_subjects sub ON sub.id=s.subject_id AND sub.is_active
   WHERE cl.id=s.class_id AND cl.school_id=p.school_id
     AND cl.school_year_id=p.school_year_id AND cl.learning_context='school'
 );

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'assessmentId',a.id,'title',a.title,'classId',l.class_id,
   'schoolYearId',l.school_year_id,'subjectId',l.subject_id,
   'periodId',ac.period_id,'coefficient',ac.coefficient,
   'includeInAverage',COALESCE(ac.include_in_average,false)
 ) ORDER BY a.title,a.id),'[]'::jsonb)
 INTO v_assessments
 FROM schoolnet_private.school_assessment_links al
 JOIN schoolnet_private.school_course_links l
   ON l.id=al.school_course_link_id AND l.school_id=p_school_id
   AND l.status='active' AND l.revoked_at IS NULL
 JOIN public.assessments a
   ON a.id=al.assessment_id AND a.course_id=l.course_id
   AND a.created_by=l.teacher_id
 JOIN public.courses co ON co.id=a.course_id AND co.status::text='active'
   AND co.created_by=l.teacher_id
 JOIN public.classes cl ON cl.id=l.class_id AND cl.school_id=l.school_id
   AND cl.school_year_id=l.school_year_id AND cl.learning_context='school'
 JOIN public.schoolnet_school_teacher_subject_assignments ta
   ON ta.id=l.teacher_assignment_id AND ta.school_id=l.school_id
   AND ta.class_id=l.class_id AND ta.school_year_id=l.school_year_id
   AND ta.teacher_id=l.teacher_id AND ta.subject_id=l.subject_id
   AND ta.status='active' AND ta.revoked_at IS NULL
 JOIN public.schoolnet_school_memberships tm
   ON tm.school_id=l.school_id AND tm.user_id=l.teacher_id
   AND tm.member_role='teacher' AND tm.status='active'
 LEFT JOIN schoolnet_private.school_official_assessment_coefficients ac
   ON ac.assessment_id=a.id
 WHERE al.status='active' AND al.revoked_at IS NULL;

 IF jsonb_array_length(v_years)>100 OR jsonb_array_length(v_subjects)>600
    OR jsonb_array_length(v_periods)>200 OR jsonb_array_length(v_assessments)>300
    OR jsonb_array_length(v_subject_settings)>3000
 THEN RAISE EXCEPTION 'S4C3A_TOO_MANY_ITEMS' USING ERRCODE='54000'; END IF;
 RETURN jsonb_build_object('schoolId',p_school_id,'years',v_years,
   'subjects',v_subjects,'periods',v_periods,
   'subjectSettings',v_subject_settings,'assessments',v_assessments);
END $read$;

CREATE FUNCTION schoolnet_private.school_upsert_grading_period(
 p_school_id uuid,p_period_id uuid,p_school_year_id uuid,
 p_code text,p_name text,p_starts_on date,p_ends_on date)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $write$
DECLARE v_start date;v_end date;v_old schoolnet_private.school_grading_periods%ROWTYPE;
        v_id uuid;v_code text;v_name text;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
 -- Serialise the school's period edits, including overlapping intervals.
 PERFORM 1 FROM public.schoolnet_schools s
  WHERE s.id=p_school_id AND s.status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3A_SCHOOL_INACTIVE' USING ERRCODE='42501'; END IF;
 SELECT sy.starts_on,sy.ends_on INTO v_start,v_end
 FROM public.school_years sy WHERE sy.id=p_school_year_id;
 IF v_start IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes cl
   WHERE cl.school_id=p_school_id AND cl.school_year_id=p_school_year_id
     AND cl.learning_context='school')
 THEN RAISE EXCEPTION 'S4C3A_YEAR_NOT_ASSIGNED' USING ERRCODE='23514'; END IF;
 v_code:=upper(btrim(COALESCE(p_code,'')));
 v_name:=btrim(COALESCE(p_name,''));
 IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'
   OR length(v_name) NOT BETWEEN 2 AND 90
   OR p_starts_on IS NULL OR p_ends_on IS NULL
   OR p_starts_on>p_ends_on OR p_starts_on<v_start OR p_ends_on>v_end
 THEN RAISE EXCEPTION 'S4C3A_INVALID_PERIOD' USING ERRCODE='23514'; END IF;
 IF p_period_id IS NOT NULL THEN
   SELECT * INTO v_old FROM schoolnet_private.school_grading_periods
   WHERE id=p_period_id FOR UPDATE;
   IF NOT FOUND OR v_old.school_id IS DISTINCT FROM p_school_id
     OR v_old.school_year_id IS DISTINCT FROM p_school_year_id
   THEN RAISE EXCEPTION 'S4C3A_PERIOD_OUTSIDE_SCHOOL' USING ERRCODE='42501'; END IF;
   IF v_old.is_locked THEN RAISE EXCEPTION 'S4C3A_PERIOD_LOCKED' USING ERRCODE='42501'; END IF;
   IF (v_old.starts_on,v_old.ends_on) IS DISTINCT FROM (p_starts_on,p_ends_on)
     AND (EXISTS(SELECT 1 FROM schoolnet_private.school_period_subject_coefficients
          WHERE period_id=p_period_id)
       OR EXISTS(SELECT 1 FROM schoolnet_private.school_official_assessment_coefficients
          WHERE period_id=p_period_id))
   THEN RAISE EXCEPTION 'S4C3A_DATES_ALREADY_CONFIGURED' USING ERRCODE='23514'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM schoolnet_private.school_grading_periods p
   WHERE p.school_id=p_school_id AND p.school_year_id=p_school_year_id
     AND (p_period_id IS NULL OR p.id<>p_period_id)
     AND daterange(p.starts_on,p.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]'))
 THEN RAISE EXCEPTION 'S4C3A_PERIOD_OVERLAP' USING ERRCODE='23514'; END IF;
 IF p_period_id IS NULL THEN
   INSERT INTO schoolnet_private.school_grading_periods(
     school_id,school_year_id,code,name,starts_on,ends_on,created_by,updated_by)
   VALUES(p_school_id,p_school_year_id,v_code,v_name,p_starts_on,p_ends_on,auth.uid(),auth.uid())
   RETURNING id INTO v_id;
 ELSE
   UPDATE schoolnet_private.school_grading_periods
   SET code=v_code,name=v_name,starts_on=p_starts_on,ends_on=p_ends_on,
     updated_by=auth.uid(),updated_at=now()
   WHERE id=p_period_id RETURNING id INTO v_id;
 END IF;
 RETURN v_id;
END $write$;

CREATE FUNCTION schoolnet_private.school_lock_grading_period(p_school_id uuid,p_period_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $lock$
DECLARE v_locked boolean;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
 SELECT is_locked INTO v_locked FROM schoolnet_private.school_grading_periods
 WHERE id=p_period_id AND school_id=p_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3A_PERIOD_OUTSIDE_SCHOOL' USING ERRCODE='42501'; END IF;
 IF NOT v_locked THEN
   UPDATE schoolnet_private.school_grading_periods
   SET is_locked=true,locked_at=now(),locked_by=auth.uid(),
       updated_at=now(),updated_by=auth.uid()
   WHERE id=p_period_id AND school_id=p_school_id;
 END IF;
 -- Unlock deliberately not exposed until an independently approved policy exists.
 RETURN true;
END $lock$;

CREATE FUNCTION schoolnet_private.school_set_subject_coefficient(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,
 p_subject_id uuid,p_coefficient numeric)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $subject$
DECLARE v_year uuid;v_locked boolean;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
 SELECT school_year_id,is_locked INTO v_year,v_locked
 FROM schoolnet_private.school_grading_periods
 WHERE id=p_period_id AND school_id=p_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3A_PERIOD_OUTSIDE_SCHOOL' USING ERRCODE='42501'; END IF;
 IF v_locked THEN RAISE EXCEPTION 'S4C3A_PERIOD_LOCKED' USING ERRCODE='42501'; END IF;
 IF p_coefficient IS NULL OR p_coefficient<0.25 OR p_coefficient>20
   OR p_coefficient<>round(p_coefficient,2)
 THEN RAISE EXCEPTION 'S4C3A_INVALID_COEFFICIENT' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM public.classes cl
   JOIN public.schoolnet_school_teacher_subject_assignments ta
     ON ta.class_id=cl.id AND ta.school_id=cl.school_id
     AND ta.school_year_id=cl.school_year_id
     AND ta.subject_id=p_subject_id AND ta.status='active' AND ta.revoked_at IS NULL
   JOIN public.schoolnet_school_memberships tm
     ON tm.school_id=ta.school_id AND tm.user_id=ta.teacher_id
     AND tm.member_role='teacher' AND tm.status='active'
   JOIN public.academic_subjects sub ON sub.id=ta.subject_id AND sub.is_active
   WHERE cl.id=p_class_id AND cl.school_id=p_school_id
     AND cl.school_year_id=v_year AND cl.learning_context='school'
 ) THEN RAISE EXCEPTION 'S4C3A_SUBJECT_OUTSIDE_SCHOOL' USING ERRCODE='42501'; END IF;
 INSERT INTO schoolnet_private.school_period_subject_coefficients AS s(
   period_id,class_id,subject_id,coefficient,updated_by)
 VALUES(p_period_id,p_class_id,p_subject_id,p_coefficient,auth.uid())
 ON CONFLICT(period_id,class_id,subject_id)
 DO UPDATE SET coefficient=EXCLUDED.coefficient,updated_by=EXCLUDED.updated_by,updated_at=now();
 RETURN true;
END $subject$;

CREATE FUNCTION schoolnet_private.school_set_assessment_coefficient(
 p_school_id uuid,p_period_id uuid,p_assessment_id uuid,
 p_coefficient numeric,p_include_in_average boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $assessment$
DECLARE v_year uuid;v_locked boolean;v_old_period uuid;v_old_locked boolean;v_old_school uuid;
BEGIN
 PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
 SELECT school_year_id,is_locked INTO v_year,v_locked
 FROM schoolnet_private.school_grading_periods
 WHERE id=p_period_id AND school_id=p_school_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4C3A_PERIOD_OUTSIDE_SCHOOL' USING ERRCODE='42501'; END IF;
 IF v_locked THEN RAISE EXCEPTION 'S4C3A_PERIOD_LOCKED' USING ERRCODE='42501'; END IF;
 IF p_coefficient IS NULL OR p_coefficient<0.25 OR p_coefficient>20
    OR p_coefficient<>round(p_coefficient,2) OR p_include_in_average IS NULL
 THEN RAISE EXCEPTION 'S4C3A_INVALID_COEFFICIENT' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM schoolnet_private.school_assessment_links al
   JOIN schoolnet_private.school_course_links l
     ON l.id=al.school_course_link_id AND l.school_id=p_school_id
     AND l.school_year_id=v_year AND l.status='active' AND l.revoked_at IS NULL
   JOIN public.assessments a ON a.id=al.assessment_id AND a.course_id=l.course_id
     AND a.created_by=l.teacher_id
   JOIN public.courses co ON co.id=a.course_id AND co.created_by=l.teacher_id
     AND co.status::text='active'
   JOIN public.classes cl ON cl.id=l.class_id AND cl.school_id=l.school_id
     AND cl.school_year_id=l.school_year_id AND cl.learning_context='school'
   JOIN public.schoolnet_school_teacher_subject_assignments ta
     ON ta.id=l.teacher_assignment_id AND ta.school_id=l.school_id
     AND ta.class_id=l.class_id AND ta.school_year_id=l.school_year_id
     AND ta.teacher_id=l.teacher_id AND ta.subject_id=l.subject_id
     AND ta.status='active' AND ta.revoked_at IS NULL
   JOIN public.schoolnet_school_memberships tm
     ON tm.school_id=l.school_id AND tm.user_id=l.teacher_id
     AND tm.member_role='teacher' AND tm.status='active'
   WHERE al.assessment_id=p_assessment_id AND al.status='active' AND al.revoked_at IS NULL
 ) THEN RAISE EXCEPTION 'S4C3A_ASSESSMENT_OUTSIDE_SCHOOL' USING ERRCODE='42501'; END IF;

 SELECT old.period_id,p.is_locked,p.school_id INTO v_old_period,v_old_locked,v_old_school
 FROM schoolnet_private.school_official_assessment_coefficients old
 JOIN schoolnet_private.school_grading_periods p ON p.id=old.period_id
 WHERE old.assessment_id=p_assessment_id FOR UPDATE OF old,p;
 IF FOUND AND v_old_school IS DISTINCT FROM p_school_id
 THEN RAISE EXCEPTION 'S4C3A_PREVIOUS_PERIOD_OTHER_SCHOOL' USING ERRCODE='42501'; END IF;
 IF FOUND AND v_old_period<>p_period_id AND v_old_locked
 THEN RAISE EXCEPTION 'S4C3A_PREVIOUS_PERIOD_LOCKED' USING ERRCODE='42501'; END IF;
 INSERT INTO schoolnet_private.school_official_assessment_coefficients AS a(
   assessment_id,period_id,coefficient,include_in_average,updated_by)
 VALUES(p_assessment_id,p_period_id,p_coefficient,p_include_in_average,auth.uid())
 ON CONFLICT(assessment_id)
 DO UPDATE SET period_id=EXCLUDED.period_id,coefficient=EXCLUDED.coefficient,
   include_in_average=EXCLUDED.include_in_average,updated_by=EXCLUDED.updated_by,updated_at=now();
 RETURN true;
END $assessment$;

-- Public facades: no direct tables and no client-supplied user identity.
CREATE FUNCTION public.schoolnet_school_grading_configuration(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_grading_configuration(p_school_id); $rpc$;
CREATE FUNCTION public.schoolnet_school_upsert_grading_period(
 p_school_id uuid,p_period_id uuid,p_school_year_id uuid,p_code text,
 p_name text,p_starts_on date,p_ends_on date)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_upsert_grading_period(
 p_school_id,p_period_id,p_school_year_id,p_code,p_name,p_starts_on,p_ends_on); $rpc$;
CREATE FUNCTION public.schoolnet_school_lock_grading_period(p_school_id uuid,p_period_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_lock_grading_period(p_school_id,p_period_id); $rpc$;
CREATE FUNCTION public.schoolnet_school_set_subject_coefficient(
 p_school_id uuid,p_period_id uuid,p_class_id uuid,p_subject_id uuid,p_coefficient numeric)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_set_subject_coefficient(
 p_school_id,p_period_id,p_class_id,p_subject_id,p_coefficient); $rpc$;
CREATE FUNCTION public.schoolnet_school_set_assessment_coefficient(
 p_school_id uuid,p_period_id uuid,p_assessment_id uuid,
 p_coefficient numeric,p_include_in_average boolean)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog
AS $rpc$ SELECT schoolnet_private.school_set_assessment_coefficient(
 p_school_id,p_period_id,p_assessment_id,p_coefficient,p_include_in_average); $rpc$;

DO $privileges$
DECLARE rec record;
BEGIN
 FOR rec IN SELECT p.oid::regprocedure AS signature
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='schoolnet_private' AND p.proname IN
   ('school_grading_configuration','school_upsert_grading_period','school_lock_grading_period',
    'school_set_subject_coefficient','school_set_assessment_coefficient'))
 OR (n.nspname='public' AND p.proname IN
   ('schoolnet_school_grading_configuration','schoolnet_school_upsert_grading_period',
    'schoolnet_school_lock_grading_period','schoolnet_school_set_subject_coefficient',
    'schoolnet_school_set_assessment_coefficient'))
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',rec.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',rec.signature);
 END LOOP;
END $privileges$;

DO $post$
BEGIN
 IF has_function_privilege('anon','public.schoolnet_school_grading_configuration(uuid)','EXECUTE')
 OR has_table_privilege('authenticated','schoolnet_private.school_grading_periods','SELECT')
 OR has_table_privilege('authenticated','schoolnet_private.school_period_subject_coefficients','INSERT')
 OR has_table_privilege('authenticated','schoolnet_private.school_official_assessment_coefficients','UPDATE')
 THEN RAISE EXCEPTION 'S4C3A_POSTFLIGHT_FAILED'; END IF;
END $post$;
SELECT 'S4C3A_G2_PROPOSAL_ONLY' AS result;
