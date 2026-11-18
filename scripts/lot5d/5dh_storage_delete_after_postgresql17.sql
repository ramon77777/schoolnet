-- SCHOOLNET 5D-H: fake Storage RLS after guard; all DML in ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
-- create fake object for actual old enrollment and new target.
INSERT INTO storage.objects(bucket_id,name)
SELECT 'student-enrollment-documents',d.storage_path
FROM public.student_enrollment_documents d;
INSERT INTO storage.objects(bucket_id,name)
SELECT 'student-enrollment-documents',
  e.id::text||'/current-year.pdf'
FROM public.student_enrollments e
WHERE e.school_year_id='20262026-2026-4026-8026-202620262026';
SET LOCAL ROLE authenticated;
DO $lot5dh_post$
DECLARE n integer;
DECLARE nold integer;
BEGIN
  SELECT count(*) INTO nold FROM storage.objects
   WHERE bucket_id='student-enrollment-documents';
  IF nold<>2 THEN RAISE EXCEPTION 'H-POST 01: SELECT affected by DELETE guard'; END IF;
  RAISE NOTICE 'H-POST 01: two objects remain readable by authorized Admin';

  DELETE FROM storage.objects WHERE bucket_id='student-enrollment-documents';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'H-POST 02: browser role deleted documents'; END IF;
  RAISE NOTICE 'H-POST 02: authenticated DELETE returns zero rows';

  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='student-enrollment-documents')<>2
  THEN RAISE EXCEPTION 'H-POST 03: old/current file objects lost'; END IF;
  RAISE NOTICE 'H-POST 03: both old and current year objects retained';

  INSERT INTO storage.objects(bucket_id,name)
  VALUES('student-enrollment-documents','test-current/new.pdf');
  IF (SELECT count(*) FROM storage.objects
    WHERE name='test-current/new.pdf')<>1
  THEN RAISE EXCEPTION 'H-POST 04: legitimate Storage insert blocked'; END IF;
  RAISE NOTICE 'H-POST 04: insertion policy untouched for Admin';

  IF (SELECT count(*) FROM public.student_enrollment_documents)<>1
  THEN RAISE EXCEPTION 'H-POST 05: metadata changes not expected'; END IF;
  RAISE NOTICE 'H-POST 05: archived metadata preserved';

  IF (SELECT count(*) FROM public.school_year_rollover_runs)<>1
  THEN RAISE EXCEPTION 'H-POST 06: no fake rollover record'; END IF;
  RAISE NOTICE 'H-POST 06: year finalization history preserved';
END;
$lot5dh_post$;
ROLLBACK;
\echo 'PASS - 5D-H: 6 fake Storage RLS and metadata assertions, rolled back'
