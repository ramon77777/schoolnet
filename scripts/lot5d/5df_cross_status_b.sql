-- 5D-F session B: full legacy status RPC must lock year before row FOR UPDATE.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT public.admin_set_student_enrollment_status(
 (SELECT id FROM public.student_enrollments
  WHERE student_id='11111111-1111-4111-8111-111111111111'
   AND school_year_id='20252025-2025-4025-8025-202520252025'),
 'draft','Stale-year attempted write'
);
COMMIT;
