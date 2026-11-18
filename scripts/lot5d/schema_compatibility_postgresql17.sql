-- Verify the synthetic class/year guards audited from production; no real data.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.classes(id,level_id,name,school_year,school_year_id)
VALUES ('c0253333-3333-4333-8333-333333333333',6,'6e C','2025-2026',
        '20252025-2025-4025-8025-202520252025');

DO $class_qa$
DECLARE
  blocked_same_year boolean:=false;
  blocked_nonstudent boolean:=false;
BEGIN
  IF pg_catalog.to_regprocedure('public.ensure_student_single_class_per_school_year()') IS NULL
     OR pg_catalog.to_regprocedure('public.validate_class_student_role()') IS NULL
     OR (SELECT count(*) FROM pg_catalog.pg_trigger
       WHERE tgrelid='public.class_students'::regclass
         AND tgname IN('trg_class_students_single_class_per_year','trg_validate_class_student_role')
         AND tgenabled='O')<>2
  THEN RAISE EXCEPTION 'SCHEMA QA 01: class_student guards absent'; END IF;
  BEGIN
    INSERT INTO public.class_students(class_id,student_id)
    VALUES('c0253333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%deja affecte a une autre classe%' THEN
      blocked_same_year:=true;
    ELSE RAISE; END IF;
  END;
  IF NOT blocked_same_year THEN RAISE EXCEPTION 'SCHEMA QA 02: two same-year classes allowed'; END IF;
  BEGIN
    INSERT INTO public.class_students(class_id,student_id)
    VALUES('c0253333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Seul un apprenant%' OR SQLERRM LIKE '%must reference a student%'
    THEN blocked_nonstudent:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked_nonstudent THEN RAISE EXCEPTION 'SCHEMA QA 03: admin incorrectly attached as student'; END IF;
  IF (SELECT count(*) FROM public.class_students)<>1
  THEN RAISE EXCEPTION 'SCHEMA QA 04: original history altered'; END IF;
  RAISE NOTICE 'SCHEMA QA 01-04: triggers, no double-class, role, historical link OK';
END;
$class_qa$;
ROLLBACK;
\echo 'PASS - SCHEMA COMPATIBILITY (synthetic): one class per year, student role, historical link'
