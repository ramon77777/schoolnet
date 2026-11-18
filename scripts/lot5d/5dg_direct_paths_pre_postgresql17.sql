-- SCHOOLNET 5D-G: pre-close authorized and unauthorized direct writes.
-- Everything inside this test is rolled back: no durable fixture mutation.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
DO $5dg_pre$
DECLARE
 source_doc uuid;
 source_enroll uuid;
 denied boolean;
 id_new uuid:='90909090-9090-4090-8090-909090909090';
 old_class uuid:='c0250000-0000-4000-8000-000000000025';
 student uuid:='11111111-1111-4111-8111-111111111111';
BEGIN
  IF NOT pg_catalog.has_table_privilege('authenticated','public.school_years','UPDATE')
    OR NOT pg_catalog.has_table_privilege('authenticated','public.class_students','DELETE')
    OR pg_catalog.has_table_privilege('authenticated','public.student_enrollments','INSERT')
    OR pg_catalog.has_table_privilege('authenticated','public.student_enrollment_documents','UPDATE')
  THEN RAISE EXCEPTION 'G-PRE 01: audited grant parity differs'; END IF;
  RAISE NOTICE 'G-PRE 01: privilege matrix matches audited relevant columns';

  denied:=false;
  BEGIN
    UPDATE public.school_years SET is_current=false WHERE is_current=true;
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'G-PRE 02: admin direct active-year write passed'; END IF;
  RAISE NOTICE 'G-PRE 02: direct calendar UPDATE blocked by candidate A+B';

  INSERT INTO public.school_years(id,name,starts_on,ends_on,is_current)
  VALUES(id_new,'2029-2030','2029-09-01','2030-07-31',false);
  DELETE FROM public.school_years WHERE id=id_new;
  RAISE NOTICE 'G-PRE 03: legitimate Admin create/delete inactive year preserved';

  DELETE FROM public.class_students WHERE student_id=student AND class_id=old_class;
  IF EXISTS(SELECT 1 FROM public.class_students WHERE student_id=student AND class_id=old_class)
  THEN RAISE EXCEPTION 'G-PRE 04: authorized preclose class removal failed'; END IF;
  INSERT INTO public.class_students(class_id,student_id) VALUES(old_class,student);
  RAISE NOTICE 'G-PRE 04: preclose legacy class link can be maintained';

  SELECT id INTO source_enroll FROM public.student_enrollments
  WHERE student_id=student AND school_year_id='20252025-2025-4025-8025-202520252025';
  INSERT INTO public.student_enrollment_documents(
    enrollment_id,document_type,original_filename,storage_path,mime_type,size_bytes,uploaded_by
  ) VALUES(
    source_enroll,'birth_certificate','fiche-avant.pdf',
    source_enroll::text||'/fiche-avant.pdf','application/pdf',1500,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) RETURNING id INTO source_doc;
  DELETE FROM public.student_enrollment_documents WHERE id=source_doc;
  RAISE NOTICE 'G-PRE 05: normal preclose document add/delete preserved';
END;
$5dg_pre$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $5dg_anon$
DECLARE visible_rows integer;
BEGIN
 SELECT count(*) INTO visible_rows FROM public.school_years;
 IF visible_rows<>0 THEN
  RAISE EXCEPTION 'G-PRE 06: anon sees RLS protected school calendar'; END IF;
 RAISE NOTICE 'G-PRE 06: anon table-level grants do not bypass authenticated-only RLS';
END;
$5dg_anon$;
RESET ROLE;
ROLLBACK;
\echo 'PASS - 5D-G: six preclose direct-privilege assertions rolled back'
