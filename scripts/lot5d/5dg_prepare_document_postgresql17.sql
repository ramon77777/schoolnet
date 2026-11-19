-- SCHOOLNET 5D-G: one fictional source-year document + explicit decision.
-- Commit only inside disposable PostgreSQL 17 CI job.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO public.student_enrollment_documents(
 enrollment_id,document_type,original_filename,storage_path,mime_type,size_bytes,uploaded_by
)
SELECT e.id,'birth_certificate','preuve-ancienne.pdf',e.id::text||'/preuve-ancienne.pdf',
 'application/pdf',1024,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
FROM public.student_enrollments e
WHERE e.student_id='11111111-1111-4111-8111-111111111111'
  AND e.school_year_id='20252025-2025-4025-8025-202520252025';
SELECT schoolnet_private.save_lot5d_legacy_decision(
 '20252025-2025-4025-8025-202520252025',
 '20262026-2026-4026-8026-202620262026',
 '11111111-1111-4111-8111-111111111111',
 'repeat','c0260000-0000-4000-8000-000000000026',
 'fiction test G only',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
COMMIT;
\echo '5D-G: fictional dossier and decision committed to disposable PG17'
