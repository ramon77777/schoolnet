-- SCHOOLNET 5D-I: secure review and freeze test, all artificial DML ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO public.student_enrollment_documents
 (enrollment_id,document_type,original_filename,storage_path,mime_type,size_bytes,uploaded_by)
SELECT e.id,'birth_certificate','document_fictif.pdf',
  e.id::text||'/document_fictif.pdf','application/pdf',2048,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
FROM public.student_enrollments e
WHERE e.student_id='11111111-1111-4111-8111-111111111111'
  AND e.school_year_id='20252025-2025-4025-8025-202520252025';
DO $i_test$
DECLARE
  v_doc uuid;
  op uuid:='10000000-0000-4000-8000-0000000000a9';
  x jsonb;
  denied boolean;
BEGIN
 SELECT id INTO v_doc FROM public.student_enrollment_documents
 WHERE original_filename='document_fictif.pdf';
 IF v_doc IS NULL THEN RAISE EXCEPTION 'I 01: no fixture document'; END IF;
 x:=schoolnet_private.request_document_deletion_review(
  op,v_doc,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Fichier fictif a verifier par l administration');
 IF x->>'status'<>'requested' OR (x->>'already_requested')::boolean<>false
 THEN RAISE EXCEPTION 'I 02: request was not opened'; END IF;
 RAISE NOTICE 'I 02: Admin opens a review after current-year check';

 x:=schoolnet_private.request_document_deletion_review(
  op,v_doc,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Fichier fictif a verifier par l administration');
 IF x->>'status'<>'requested' OR (x->>'already_requested')::boolean<>true
    OR (SELECT count(*) FROM schoolnet_private.document_deletion_reviews)<>1
    OR (SELECT count(*) FROM schoolnet_private.document_deletion_review_events)<>1
 THEN RAISE EXCEPTION 'I 03: retry is not idempotent'; END IF;
 RAISE NOTICE 'I 03: retry recorded only once';

 denied:=false;
 BEGIN
   PERFORM schoolnet_private.request_document_deletion_review(
     '10000000-0000-4000-8000-0000000000b9',v_doc,
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Second open review forbidden');
 EXCEPTION WHEN SQLSTATE '23505' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'I 04: duplicate review accepted'; END IF;
 RAISE NOTICE 'I 04: duplicate review rejected';

 denied:=false;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
   '11111111-1111-4111-8111-111111111111',true);
 BEGIN
   PERFORM schoolnet_private.request_document_deletion_review(
     '10000000-0000-4000-8000-0000000000c9',v_doc,
     '11111111-1111-4111-8111-111111111111','Student actor cannot begin delete');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 IF NOT denied THEN RAISE EXCEPTION 'I 05: non-Admin opened request'; END IF;
 RAISE NOTICE 'I 05: non-Admin blocked';

 denied:=false;
 BEGIN
   UPDATE public.school_years SET is_current=false
     WHERE id='20252025-2025-4025-8025-202520252025';
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'I 06: source year switched with pending review'; END IF;
 RAISE NOTICE 'I 06: source year switch blocked';

 IF (SELECT count(*) FROM public.student_enrollment_documents)<>1
    OR (SELECT count(*) FROM public.school_year_rollover_runs)<>0
    OR NOT (SELECT is_current FROM public.school_years
      WHERE id='20252025-2025-4025-8025-202520252025')
 THEN RAISE EXCEPTION 'I 07: file or year was changed'; END IF;
 RAISE NOTICE 'I 07: file and active year unchanged';

 IF pg_catalog.has_function_privilege('authenticated',
   'schoolnet_private.request_document_deletion_review(uuid,uuid,uuid,text)'::regprocedure,'EXECUTE')
 OR pg_catalog.has_table_privilege('authenticated',
    'schoolnet_private.document_deletion_reviews','SELECT')
 THEN RAISE EXCEPTION 'I 08: review visible to client'; END IF;
 RAISE NOTICE 'I 08: private function and audit not exposed';
END;
$i_test$;
ROLLBACK;
\echo 'PASS - Lot 5D-I: 8 review/idempotence/roles/rollover assertions, ROLLBACK'
