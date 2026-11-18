-- Session B must WAIT at school_years SHARE lock before reading is_current.
-- Expected: lock timeout, 0 writes and non-stale status, on disposable PG17.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT public.admin_upsert_student_enrollment(
 '22222222-2222-4222-8222-222222222222',
 'c0260000-0000-4000-8000-000000000026',
 CURRENT_DATE,'new',NULL,'CROSS-RPC-FIXTURE'
);
COMMIT;
