-- S4-C.3-C.3.4 - isolated PostgreSQL 17 security audit.
-- Read-only RPC contract and adversarial tests with fake school data only.
-- This service dies after CI; no connection to Supabase principal.

-- Use a committed minimal fixture so the audited RPC can be executed inside
-- a TRUE READ ONLY transaction, without leaving permanent production data.
BEGIN;
INSERT INTO public.schoolnet_schools(id,status)
VALUES('11111111-1111-4111-8111-111111111110','active');
INSERT INTO public.school_years(id)
VALUES('11111111-1111-4111-8111-111111111120');
INSERT INTO public.classes(id,school_id,school_year_id,learning_context)
VALUES('11111111-1111-4111-8111-111111111130',
       '11111111-1111-4111-8111-111111111110',
       '11111111-1111-4111-8111-111111111120','school');
INSERT INTO schoolnet_private.school_grading_periods(
 id,school_id,school_year_id,is_locked
) VALUES('11111111-1111-4111-8111-111111111140',
         '11111111-1111-4111-8111-111111111110',
         '11111111-1111-4111-8111-111111111120',false);
INSERT INTO public.profiles(id,role,full_name)
VALUES('11111111-1111-4111-8111-111111111101','school_admin','Administrateur fictif');
INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,status,revoked_at)
VALUES('11111111-1111-4111-8111-111111111110',
       '11111111-1111-4111-8111-111111111101',
       'school_admin','active',NULL);
INSERT INTO public.academic_subjects(id,is_active,name,sort_order)
VALUES('11111111-1111-4111-8111-111111111150',true,'Mathématiques fictives',1),
      ('11111111-1111-4111-8111-111111111151',false,'Matière inactive',2);
INSERT INTO schoolnet_private.school_official_curricula(
 school_id,school_year_id,class_id,period_id
) VALUES('11111111-1111-4111-8111-111111111110',
         '11111111-1111-4111-8111-111111111120',
         '11111111-1111-4111-8111-111111111130',
         '11111111-1111-4111-8111-111111111140');
COMMIT;

-- This would fail with "cannot execute SELECT FOR UPDATE in a read-only
-- transaction" before the C.3-C.3.4 fix.
BEGIN READ ONLY;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111101',true);
DO $read_test$
DECLARE
 v_cur jsonb;
 v_preview jsonb;
BEGIN
 v_cur:=public.schoolnet_school_official_curriculum(
  '11111111-1111-4111-8111-111111111110',
  '11111111-1111-4111-8111-111111111140',
  '11111111-1111-4111-8111-111111111130','read',NULL);
 IF v_cur->>'status'<>'draft' OR v_cur->'subjects'<>'[]'::jsonb THEN
  RAISE EXCEPTION 'C3C34_READ_ONLY_CATALOG_ERROR %',v_cur; END IF;
 RAISE NOTICE 'C3C34_PASS_CATALOG_READ_ONLY_TRANSACTION';
 v_preview:=public.schoolnet_school_official_general_averages(
  '11111111-1111-4111-8111-111111111110',
  '11111111-1111-4111-8111-111111111140',
  '11111111-1111-4111-8111-111111111130');
 IF v_preview->>'state'<>'not_configured'
 OR v_preview->>'studentCount'<>'0' THEN
  RAISE EXCEPTION 'C3C34_READ_ONLY_PREVIEW_ERROR %',v_preview; END IF;
 RAISE NOTICE 'C3C34_PASS_PREVIEW_READ_ONLY_TRANSACTION';
END $read_test$;
ROLLBACK;

-- Adversarial catalog inputs cannot mutate the approved list.
BEGIN;
SET LOCAL ROLE authenticated;
DO $negative$
DECLARE
 v_school uuid:='11111111-1111-4111-8111-111111111110';
 v_period uuid:='11111111-1111-4111-8111-111111111140';
 v_class uuid:='11111111-1111-4111-8111-111111111130';
 v_math uuid:='11111111-1111-4111-8111-111111111150';
 v_inactive uuid:='11111111-1111-4111-8111-111111111151';
 v_unknown uuid:='11111111-1111-4111-8111-111111111152';
 v_denied boolean;
 v_cur jsonb;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111101',true);
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'approve',NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'EMPTY_CATALOG_APPROVAL_PERMITTED'; END IF;
 RAISE NOTICE 'C3C34_PASS_EMPTY_CATALOG_APPROVAL_REJECTED';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'set',ARRAY[v_math,v_math]);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'DUPLICATE_EXPECTED_SUBJECT_PERMITTED'; END IF;
 RAISE NOTICE 'C3C34_PASS_DUPLICATE_SUBJECT_REJECTED';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'set',ARRAY[v_unknown]);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'UNKNOWN_EXPECTED_SUBJECT_PERMITTED'; END IF;
 RAISE NOTICE 'C3C34_PASS_UNKNOWN_SUBJECT_REJECTED';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'set',ARRAY[v_inactive]);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'INACTIVE_EXPECTED_SUBJECT_PERMITTED'; END IF;
 RAISE NOTICE 'C3C34_PASS_INACTIVE_SUBJECT_REJECTED';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(
   v_school,v_period,v_class,'set',array_fill(v_math,ARRAY[61]));
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'OVERSIZED_CATALOG_PERMITTED'; END IF;
 RAISE NOTICE 'C3C34_PASS_OVERSIZED_CATALOG_REJECTED';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'read',ARRAY[v_math]);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'READ_ACCEPTED_MUTATION_ARGUMENT'; END IF;
 RAISE NOTICE 'C3C34_PASS_READ_FORBIDS_MUTATION_ARGUMENT';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'drop',NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'ARBITRARY_ACTION_PERMITTED'; END IF;
 RAISE NOTICE 'C3C34_PASS_UNKNOWN_ACTION_REJECTED';
 v_cur:=public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'set',ARRAY[v_math]);
 IF v_cur->>'status'<>'draft' OR jsonb_array_length(v_cur->'subjects')<>1
 THEN RAISE EXCEPTION 'VALID_SUBJECT_SET_FAILED %',v_cur; END IF;
 v_cur:=public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'approve',NULL);
 IF v_cur->>'status'<>'approved'
 THEN RAISE EXCEPTION 'VALID_APPROVAL_FAILED %',v_cur; END IF;
 v_cur:=public.schoolnet_school_official_curriculum(v_school,v_period,v_class,'set',ARRAY[v_math]);
 IF v_cur->>'status'<>'approved'
 THEN RAISE EXCEPTION 'IDEMPOTENT_UPDATE_REVOKED_VALID_APPROVAL %',v_cur; END IF;
 RAISE NOTICE 'C3C34_PASS_IDEMPOTENT_SUBJECT_SET';
END $negative$;
RESET ROLE;
ROLLBACK;

-- Simulate a membership revoked mid-session. A cached client role must not
-- bypass the database status check even if the auth.uid remains unchanged.
BEGIN;
UPDATE public.schoolnet_school_memberships
 SET status='revoked',revoked_at=now()
WHERE school_id='11111111-1111-4111-8111-111111111110'
 AND user_id='11111111-1111-4111-8111-111111111101';
SET LOCAL ROLE authenticated;
DO $revoke$
DECLARE v_denied boolean;
BEGIN
 PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111101',true);
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(
   '11111111-1111-4111-8111-111111111110',
   '11111111-1111-4111-8111-111111111140',
   '11111111-1111-4111-8111-111111111130','read',NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_ADMIN_READ_ALLOWED'; END IF;
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_general_averages(
   '11111111-1111-4111-8111-111111111110',
   '11111111-1111-4111-8111-111111111140',
   '11111111-1111-4111-8111-111111111130');
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_ADMIN_PREVIEW_ALLOWED'; END IF;
 RAISE NOTICE 'C3C34_PASS_REVOKED_ADMIN_SESSION_BLOCKED';
END $revoke$;
RESET ROLE;
ROLLBACK;

-- Exhaustive cleanup of our committed test fixture on the temporary CI DB.
BEGIN;
DELETE FROM schoolnet_private.school_official_curricula
 WHERE school_id='11111111-1111-4111-8111-111111111110';
DELETE FROM public.schoolnet_school_memberships
 WHERE school_id='11111111-1111-4111-8111-111111111110';
DELETE FROM schoolnet_private.school_grading_periods
 WHERE school_id='11111111-1111-4111-8111-111111111110';
DELETE FROM public.classes
 WHERE school_id='11111111-1111-4111-8111-111111111110';
DELETE FROM public.school_years
 WHERE id='11111111-1111-4111-8111-111111111120';
DELETE FROM public.schoolnet_schools
 WHERE id='11111111-1111-4111-8111-111111111110';
DELETE FROM public.academic_subjects
 WHERE id IN('11111111-1111-4111-8111-111111111150',
             '11111111-1111-4111-8111-111111111151');
DELETE FROM public.profiles
 WHERE id='11111111-1111-4111-8111-111111111101';
COMMIT;
SELECT CASE WHEN NOT EXISTS (
 SELECT 1 FROM schoolnet_private.school_official_curricula
 WHERE school_id='11111111-1111-4111-8111-111111111110'
) AND NOT EXISTS (
 SELECT 1 FROM public.schoolnet_schools
 WHERE id='11111111-1111-4111-8111-111111111110'
) THEN 'C3C34_PASS_TEMP_FIXTURE_CLEANUP'
 ELSE 'C3C34_TEMP_FIXTURE_CLEANUP_FAILED' END AS verdict;
