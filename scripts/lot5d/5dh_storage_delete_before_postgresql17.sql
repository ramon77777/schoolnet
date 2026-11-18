-- 5D-H: BEFORE installing new SQL candidate, old Storage DELETE grants
-- access to Admin in synthetic fixture. Rollback all DML tests.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO storage.objects(bucket_id,name)
VALUES('student-enrollment-documents','test-before/old.pdf');
SET LOCAL ROLE authenticated;
DO $lot5dh_pre$
DECLARE n integer;
BEGIN
 DELETE FROM storage.objects WHERE name='test-before/old.pdf';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'H-PRE 01: expected old client DELETE grant missing'; END IF;
 RAISE NOTICE 'H-PRE 01: old client policy permits synthetic direct delete';
END;
$lot5dh_pre$;
ROLLBACK;
\echo 'H: preguard previous policy verified in disposable fixture only'
