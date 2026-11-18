-- SCHOOLNET 5D-E | sandbox cross-RPC postcheck and history invariants.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $legacy_cross_checks$
DECLARE
  src uuid:='20252025-2025-4025-8025-202520252025';
  dst uuid:='20262026-2026-4026-8026-202620262026';
  student_a uuid:='11111111-1111-4111-8111-111111111111';
  student_b uuid:='22222222-2222-4222-8222-222222222222';
  old_class uuid:='c0250000-0000-4000-8000-000000000025';
  new_class uuid:='c0260000-0000-4000-8000-000000000026';
  source_enrollment_id uuid;
  blocked boolean;
  result_json jsonb;
BEGIN
  IF (SELECT count(*) FROM public.school_years WHERE is_current)<>1
   OR NOT (SELECT is_current FROM public.school_years WHERE id=dst)
   OR (SELECT count(*) FROM public.school_year_rollover_runs)<>1
   OR (SELECT count(*) FROM public.school_year_rollover_audit)<>1
   OR (SELECT count(*) FROM public.student_enrollments WHERE school_year_id=dst)<>1
   OR EXISTS (SELECT 1 FROM public.student_enrollments
              WHERE student_id=student_b AND school_year_id=dst)
   OR (SELECT count(*) FROM public.class_students)<>2
   OR (SELECT count(*) FROM public.student_enrollment_events)<>3
  THEN RAISE EXCEPTION 'E-CROSS 01: concurrent write changed committed rollover'; END IF;
  RAISE NOTICE 'E-CROSS 01: old RPC could not create stale enrollment while rollover held locks';

  -- The 5D-E SANDBOX ONLY triggers must freeze closed-year dossiers.
  SELECT e.id INTO source_enrollment_id FROM public.student_enrollments e
    WHERE e.student_id=student_a AND e.school_year_id=src;
  blocked:=false;
  BEGIN
    UPDATE public.student_enrollments SET status='draft' WHERE id=source_enrollment_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 02: historical dossier update allowed'; END IF;
  blocked:=false;
  BEGIN
    DELETE FROM public.class_students
      WHERE student_id=student_a AND class_id=old_class;
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 03: historical class link deletion allowed'; END IF;
  blocked:=false;
  BEGIN
    INSERT INTO public.class_students(class_id,student_id)
      VALUES(old_class,student_b);
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 04: closed-year new class link allowed'; END IF;

  blocked:=false;
  BEGIN
    PERFORM public.admin_upsert_student_enrollment(student_a,old_class);
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 05: legacy upsert changed closed year'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.admin_set_student_enrollment_status(source_enrollment_id,'draft',NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 06: legacy status changed closed year'; END IF;
  blocked:=false;
  BEGIN
    PERFORM public.admin_set_student_enrollment_status(source_enrollment_id,'active',NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 07: status reactivated noncurrent year'; END IF;
  blocked:=false;
  BEGIN
    INSERT INTO public.student_enrollments(student_id,school_year_id,class_id,status)
    VALUES (student_b,src,old_class,'completed');
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'E-CROSS 08: new enrollment inserted into closed year'; END IF;
  RAISE NOTICE 'E-CROSS 02-08: after rollover source dossier, links and RPC writes denied';

  -- New registrations in the CURRENT TARGET year still work and are active.
  result_json:=public.admin_upsert_student_enrollment(student_b,new_class);
  IF result_json->>'status'<>'active'
   OR (SELECT status::text FROM public.student_enrollments
       WHERE student_id=student_b AND school_year_id=dst)<>'active'
   OR (SELECT class_name FROM public.profiles WHERE id=student_b)<>'6e B'
   OR (SELECT count(*) FROM public.class_students)<>3
   OR (SELECT count(*) FROM public.student_enrollment_events)<>4
  THEN RAISE EXCEPTION 'E-CROSS 09: post-rollover current-year upsert failed'; END IF;
  result_json:=public.admin_upsert_student_enrollment_with_gender(
    student_b,new_class,current_date,'continuing',NULL,NULL,'female');
  IF result_json->>'status'<>'active'
   OR (SELECT count(*) FROM public.student_enrollments
        WHERE student_id=student_b AND school_year_id=dst)<>1
   OR (SELECT count(*) FROM public.student_enrollment_events)<>4
  THEN RAISE EXCEPTION 'E-CROSS 10: gender wrapper created duplicate'; END IF;
  RAISE NOTICE 'E-CROSS 09/10: after rollover new active enrollment and wrapper OK';

  -- Parent link, published bulletins, archive document and old class link intact.
  IF (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='parents')
       IS DISTINCT FROM
       (SELECT md5(string_agg(parent_id::text||student_id::text,','
               ORDER BY parent_id::text)) FROM public.parent_links)
   OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='bulletins')
       IS DISTINCT FROM
       (SELECT md5(string_agg(id::text||student_id::text||class_id::text||
               school_year_id::text||status,',' ORDER BY id::text))
        FROM public.report_cards)
   OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='documents')
       IS DISTINCT FROM
       (SELECT md5(string_agg(id::text||enrollment_id::text||object_key,','
               ORDER BY id::text)) FROM public.student_enrollment_documents)
   OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='legacy_class')
       IS DISTINCT FROM
       (SELECT md5(string_agg(class_id::text||student_id::text,','
               ORDER BY class_id::text))
        FROM public.class_students WHERE class_id=old_class)
   OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='parent_child_ids')
       IS DISTINCT FROM
       (SELECT md5(child_ids::text) FROM public.profiles
        WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  THEN RAISE EXCEPTION 'E-CROSS 11: family link, bulletin, document or historical class changed'; END IF;
  RAISE NOTICE 'E-CROSS 11: parent, report card, school proof and old class unchanged';
END;
$legacy_cross_checks$;
ROLLBACK;
\echo 'PASS - 5D-E: 11 sandbox cross-RPC / archive assertions; final verification rolled back'
