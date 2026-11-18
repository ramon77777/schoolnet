-- Verify after A has committed and B has failed on the lock.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $verify$
DECLARE
  v_source uuid:='20252025-2025-4025-8025-202520252025';
  v_target uuid:='20262026-2026-4026-8026-202620262026';
  v_actor uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_repeat jsonb;
  v_denied boolean:=false;
BEGIN
  IF (SELECT count(*) FROM public.school_years WHERE is_current) <> 1
  OR NOT (SELECT is_current FROM public.school_years WHERE id=v_target)
  OR (SELECT count(*) FROM public.school_year_rollover_runs)<>1
  OR (SELECT count(*) FROM public.school_year_rollover_audit)<>1
  OR (SELECT count(*) FROM public.student_enrollments WHERE school_year_id=v_target)<>1
  OR (SELECT count(*) FROM public.class_students)<>2
  OR (SELECT count(*) FROM public.student_enrollment_events)<>3
  OR EXISTS (SELECT 1 FROM schoolnet_private.lot5d_year_switch_permits)
  THEN RAISE EXCEPTION 'CONCURRENCY FAIL: altered history or duplicate side effects'; END IF;
  v_repeat:=schoolnet_private.finalize_lot5d_legacy_year(
     v_source,v_target,'2026-2027',v_actor,
     '10000000-0000-4000-8000-000000000091');
  IF v_repeat->>'already_finalized'<>'true'
  THEN RAISE EXCEPTION 'CONCURRENCY FAIL: same operation not idempotent'; END IF;
  BEGIN
    PERFORM schoolnet_private.finalize_lot5d_legacy_year(
       v_source,v_target,'2026-2027',v_actor,
       '10000000-0000-4000-8000-000000000092');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%cle differente%' THEN v_denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied OR (SELECT count(*) FROM public.school_year_rollover_audit)<>1
  THEN RAISE EXCEPTION 'CONCURRENCY FAIL: operation-id bypass'; END IF;
  RAISE NOTICE 'LOT5D concurrency: one commit; one abort; replay idempotent; no duplicate.';
END;
$verify$;
ROLLBACK;
