-- SCHOOLNET 5D-G: post-close archive immutable even from direct Admin SQL.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
DO $g5d_post$
DECLARE
 old_enroll uuid;
 target_enroll uuid;
 old_doc uuid;
 denied boolean;
BEGIN
  IF (SELECT count(*) FROM public.school_year_rollover_runs)<>1
    OR (SELECT count(*) FROM public.student_enrollment_documents)<>1
  THEN RAISE EXCEPTION 'G-POST 01: missing rollover or source document'; END IF;
  SELECT enrollment_id,id INTO old_enroll,old_doc
  FROM public.student_enrollment_documents
  WHERE original_filename='preuve-ancienne.pdf';
  SELECT target_enrollment_id INTO target_enroll
  FROM public.school_year_rollover_audit WHERE source_enrollment_id=old_enroll;
  IF target_enroll IS NULL OR old_doc IS NULL
  THEN RAISE EXCEPTION 'G-POST 01: source/target chain missing'; END IF;
  RAISE NOTICE 'G-POST 01: archived document still references same enrollment';

  denied:=false;
  BEGIN DELETE FROM public.student_enrollment_documents WHERE id=old_doc;
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'G-POST 02: source document delete allowed'; END IF;
  RAISE NOTICE 'G-POST 02: source document delete forbidden';

  denied:=false;
  BEGIN
    INSERT INTO public.student_enrollment_documents(
      enrollment_id,document_type,original_filename,storage_path,mime_type,size_bytes,uploaded_by)
    VALUES(old_enroll,'other','archive-interdite.pdf',old_enroll::text||'/archive-interdite.pdf',
      'application/pdf',900,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'G-POST 03: new closed-year doc allowed'; END IF;
  RAISE NOTICE 'G-POST 03: closed-year new upload metadata denied';

  INSERT INTO public.student_enrollment_documents(
    enrollment_id,document_type,original_filename,storage_path,mime_type,size_bytes,uploaded_by)
  VALUES(target_enroll,'other','annee-active.pdf',target_enroll::text||'/annee-active.pdf',
    'application/pdf',1100,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  IF (SELECT count(*) FROM public.student_enrollment_documents)<>2
  THEN RAISE EXCEPTION 'G-POST 04: current target upload denied'; END IF;
  RAISE NOTICE 'G-POST 04: current-year document allowed';

  denied:=false;
  BEGIN
    UPDATE public.school_years SET is_current=true
    WHERE id='20252025-2025-4025-8025-202520252025';
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'G-POST 05: direct year reactivation allowed'; END IF;
  RAISE NOTICE 'G-POST 05: direct calendar activation denied';

  denied:=false;
  BEGIN
    DELETE FROM public.class_students WHERE class_id='c0250000-0000-4000-8000-000000000025';
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'G-POST 06: historical class deletion allowed'; END IF;
  RAISE NOTICE 'G-POST 06: closed-year class frozen';

  IF (SELECT count(*) FROM public.student_enrollment_documents
      WHERE enrollment_id=old_enroll)<>1
     OR (SELECT count(*) FROM public.school_year_rollover_audit)<>1
  THEN RAISE EXCEPTION 'G-POST 07: historical data/audit changed'; END IF;
  RAISE NOTICE 'G-POST 07: source document and audit retained';
END;
$g5d_post$;
RESET ROLE;
DO $g5d_final_status$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.student_enrollments e
   JOIN public.school_year_rollover_runs r ON r.source_year_id=e.school_year_id
   WHERE e.status='completed'
 ) THEN RAISE EXCEPTION 'G-POST 07B: old enrollment not completed'; END IF;
 RAISE NOTICE 'G-POST 07B: old enrollment status completed';
END;
$g5d_final_status$;
-- UPDATE has no authenticated grant in real schema, but SQL trigger still
-- protects privileged SQL clients. Superuser bypasses RLS but not triggers.
DO $g5d_pg$
DECLARE
 source_document uuid;
 blocked boolean;
BEGIN
 SELECT d.id INTO source_document FROM public.student_enrollment_documents d
 JOIN public.student_enrollments e ON e.id=d.enrollment_id
 WHERE e.school_year_id='20252025-2025-4025-8025-202520252025';
 blocked:=false;
 BEGIN
   UPDATE public.student_enrollment_documents
   SET original_filename='new_name.pdf' WHERE id=source_document;
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'G-POST 08: privileged archived update allowed'; END IF;
 RAISE NOTICE 'G-POST 08: no archived update even privileged';
END;
$g5d_pg$;
ROLLBACK;
\echo 'PASS - 5D-G: 8 postfinalization archive, RLS and business assertions; ROLLBACK'
