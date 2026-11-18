-- Authorization checks run AFTER concurrency against disposable PG17 only.
-- Local GRANTs intentionally mimic existing public.school_years grants and RLS.
-- Never use this script on actual Supabase. Never modify real accounts.
\set ON_ERROR_STOP on
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT SELECT,UPDATE ON public.school_years TO authenticated;
ALTER TABLE public.school_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_year_admin ON public.school_years
 FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $student_checks$
DECLARE
  n integer;
  denied boolean:=false;
BEGIN
  SELECT count(*) INTO n FROM public.school_year_rollover_audit;
  IF n<>0 THEN RAISE EXCEPTION 'AUTH QA 01: student can see audit history'; END IF;
  BEGIN
    PERFORM schoolnet_private.finalize_lot5d_legacy_year(
       '20252025-2025-4025-8025-202520252025',
       '20262026-2026-4026-8026-202620262026',
       '2026-2027','11111111-1111-4111-8111-111111111111',
       '10000000-0000-4000-8000-000000000091');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH QA 02: student can invoke finalizer'; END IF;
  RAISE NOTICE 'AUTH QA 01/02 : student RLS and private function are denied';
END;
$student_checks$;
ROLLBACK;
RESET ROLE;

SET ROLE authenticated;
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $admin_checks$
DECLARE
  n integer;
  denied boolean:=false;
BEGIN
  SELECT count(*) INTO n FROM public.school_year_rollover_audit;
  IF n<>1 THEN RAISE EXCEPTION 'AUTH QA 03: verified admin cannot read audit'; END IF;
  BEGIN
    UPDATE public.school_years SET is_current=false WHERE is_current;
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN
    RAISE EXCEPTION 'AUTH QA 04: admin can change the active year directly';
  END IF;
  RAISE NOTICE 'AUTH QA 03/04 : admin can read audit but cannot switch year';
END;
$admin_checks$;
ROLLBACK;
RESET ROLE;

SET ROLE anon;
BEGIN;
DO $anon_checks$
DECLARE
  denied boolean:=false;
BEGIN
  BEGIN
    PERFORM schoolnet_private.finalize_lot5d_legacy_year(
       '20252025-2025-4025-8025-202520252025',
       '20262026-2026-4026-8026-202620262026',
       '2026-2027','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       '10000000-0000-4000-8000-000000000091');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'AUTH QA 05: anon can invoke finalizer'; END IF;
  RAISE NOTICE 'AUTH QA 05 : anon private function denied';
END;
$anon_checks$;
ROLLBACK;
RESET ROLE;
\echo 'PASS - LOT5D: SQL roles, RLS policy, private finalizer and admin direct-year guard.'
