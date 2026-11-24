-- SCHOOLNET S4-C.3-A.1 - PROPOSITION SQL UNIQUEMENT.
-- NE PAS installer sur Supabase principal sans GO distinct et sauvegarde verifiee.
-- Preserves all pre-existing period codes, V1 results, grants, and RLS.
DO $pre$
BEGIN
 IF to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regprocedure('schoolnet_private.school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date)') IS NULL
 OR to_regprocedure('public.schoolnet_school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date)') IS NULL
 THEN RAISE EXCEPTION 'S4C3A1_PREFLIGHT_FAILED'; END IF;
 IF position('S4C3A1_KIND_EXHAUSTED' IN pg_get_functiondef(to_regprocedure('schoolnet_private.school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date)')))>0
 THEN RAISE EXCEPTION 'S4C3A1_ALREADY_INSTALLED'; END IF;
END $pre$;

CREATE OR REPLACE FUNCTION schoolnet_private.school_upsert_grading_period(
 p_school_id uuid,p_period_id uuid,p_school_year_id uuid,
 p_code text,p_name text,p_starts_on date,p_ends_on date)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $write$
DECLARE v_start date;v_end date;v_old schoolnet_private.school_grading_periods%ROWTYPE;
        v_id uuid;v_code text;v_name text;v_kind text;v_next numeric;
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
 -- Keep the existing school FOR UPDATE lock before allocating a number.
 v_name:=btrim(COALESCE(p_name,''), E' \t\n\r');
 IF length(v_name) NOT BETWEEN 2 AND 90
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
 IF p_period_id IS NULL THEN
   -- AUTO:T/S/P is rejected by the old SQL's code regex. Fail closed while
   -- any GitHub/Vercel Preview uses a new client before the new SQL is installed.
   -- Legacy T1/S1/P01 hints remain compatible; their number is ignored.
   v_kind:=upper(btrim(COALESCE(p_code,'')));
   IF v_kind ~ '^AUTO:[TSP]$' THEN
     v_kind:=right(v_kind,1);
   ELSIF v_kind ~ '^(T[0-9]*|S[0-9]*|P[0-9]*)$' THEN
     v_kind:=left(v_kind,1);
   ELSE
     RAISE EXCEPTION 'S4C3A1_INVALID_KIND' USING ERRCODE='23514';
   END IF;
   -- PostgreSQL is authoritative; the school-row lock serializes writers.
   SELECT coalesce(max(substring(p.code FROM 2)::numeric),0)+1
     INTO v_next
   FROM schoolnet_private.school_grading_periods p
   WHERE p.school_id=p_school_id AND p.school_year_id=p_school_year_id
     AND p.code ~ ('^'||v_kind||'[0-9]+$');
   IF (v_kind='T' AND v_next>3)
     OR (v_kind='S' AND v_next>2)
     OR (v_kind='P' AND v_next>9999)
   THEN RAISE EXCEPTION 'S4C3A1_KIND_EXHAUSTED' USING ERRCODE='23514'; END IF;
   v_code:=v_kind||CASE WHEN v_kind='P' THEN lpad(v_next::text,2,'0')
                        ELSE v_next::text END;
 ELSE
   -- Never mutate the code of an existing period, whatever p_code provides.
   v_code:=v_old.code;
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

DO $post$
BEGIN
 IF position('S4C3A1_KIND_EXHAUSTED' IN pg_get_functiondef(to_regprocedure('schoolnet_private.school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date)')))=0
 THEN RAISE EXCEPTION 'S4C3A1_POSTFLIGHT_FAILED'; END IF;
 RAISE NOTICE 'S4C3A1_AUTOCODE_INSTALLED';
END $post$;
