-- SCHOOLNET 5D-F: full-RPC archive and new-year test after 2-session race.
-- Test operations execute in a transaction that is ALWAYS rolled back.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $f_post$
DECLARE
  sid_old uuid:='11111111-1111-4111-8111-111111111111';
  sid_new uuid:='22222222-2222-4222-8222-222222222222';
  src uuid:='20252025-2025-4025-8025-202520252025';
  dst uuid:='20262026-2026-4026-8026-202620262026';
  old_class uuid:='c0250000-0000-4000-8000-000000000025';
  new_class uuid:='c0260000-0000-4000-8000-000000000026';
  eid_old uuid;
  eid_new uuid;
  v jsonb;
  denied boolean;
BEGIN
  IF (SELECT count(*) FROM public.school_year_rollover_runs)<>1
     OR (SELECT count(*) FROM public.student_enrollments WHERE school_year_id=dst)<>1
     OR NOT (SELECT is_current FROM public.school_years WHERE id=dst)
     OR (SELECT count(*) FROM public.student_enrollment_events)<>3
  THEN RAISE EXCEPTION 'F-POST 01: concurrent RPC changed rollover'; END IF;
  RAISE NOTICE 'F-POST 01: no stale concurrent mutation';

  SELECT id INTO eid_old FROM public.student_enrollments
    WHERE student_id=sid_old AND school_year_id=src;
  denied:=false;
  BEGIN PERFORM public.admin_assign_student_to_class(sid_old,old_class);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'F-POST 02: assign changed closed year'; END IF;
  RAISE NOTICE 'F-POST 02: historic assignment blocked';

  denied:=false;
  BEGIN PERFORM public.admin_remove_student_from_class(sid_old,old_class);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'F-POST 03: remove deleted old class'; END IF;
  RAISE NOTICE 'F-POST 03: historic class removal blocked';

  denied:=false;
  BEGIN PERFORM public.admin_upsert_student_enrollment_with_gender(sid_old,old_class,
    current_date,'continuing',NULL,NULL,'female');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied OR (SELECT gender FROM public.profiles WHERE id=sid_old) IS NOT NULL
  THEN RAISE EXCEPTION 'F-POST 04: closed-year gender wrapper partly committed'; END IF;
  RAISE NOTICE 'F-POST 04: rejected wrapper does not change profile';

  denied:=false;
  BEGIN PERFORM public.admin_set_student_enrollment_status(eid_old,'draft','closed year');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'F-POST 05: archived status mutable'; END IF;
  RAISE NOTICE 'F-POST 05: status mutation denied by archive guard';

  denied:=false;
  BEGIN PERFORM public.admin_set_student_enrollment_status(eid_old,'active',NULL);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE NOT IN ('P0001','42501') THEN RAISE; END IF;
    denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'F-POST 06: historic student reactivated'; END IF;
  RAISE NOTICE 'F-POST 06: old-year reactivation denied';

  v:=public.admin_assign_student_to_class(sid_new,new_class);
  SELECT id INTO eid_new FROM public.student_enrollments
  WHERE student_id=sid_new AND school_year_id=dst;
  IF eid_new IS NULL OR v->>'status'<>'active'
     OR v->>'enrollment_id'<>eid_new::text
     OR (SELECT class_name FROM public.profiles WHERE id=sid_new)<>'6e B'
  THEN RAISE EXCEPTION 'F-POST 07: new current year assignment failed'; END IF;
  RAISE NOTICE 'F-POST 07: current target-year assignment allowed';

  v:=public.admin_set_student_enrollment_status(eid_new,'draft','new year note');
  IF v->>'status'<>'draft'
     OR EXISTS(SELECT 1 FROM public.class_students WHERE class_id=new_class AND student_id=sid_new)
  THEN RAISE EXCEPTION 'F-POST 08: target draft failed'; END IF;
  RAISE NOTICE 'F-POST 08: new-year draft removes class';

  v:=public.admin_set_student_enrollment_status(eid_new,'active',NULL);
  IF v->>'status'<>'active'
     OR (SELECT notes FROM public.student_enrollments WHERE id=eid_new)<>'new year note'
     OR (SELECT class_name FROM public.profiles WHERE id=sid_new)<>'6e B'
  THEN RAISE EXCEPTION 'F-POST 09: target reactivation failed'; END IF;
  RAISE NOTICE 'F-POST 09: target reactivation preserves note';

  v:=public.admin_remove_student_from_class(sid_new,new_class);
  IF v->>'status'<>'withdrawn'
     OR (SELECT status::text FROM public.student_enrollments WHERE id=eid_new)<>'withdrawn'
  THEN RAISE EXCEPTION 'F-POST 10: new-year removal failed'; END IF;
  RAISE NOTICE 'F-POST 10: target removal allowed';

  v:=public.admin_assign_student_to_class(sid_new,new_class);
  IF v->>'enrollment_id'<>eid_new::text OR v->>'status'<>'active'
     OR (SELECT count(*) FROM public.student_enrollments WHERE student_id=sid_new AND school_year_id=dst)<>1
  THEN RAISE EXCEPTION 'F-POST 11: reassignment duplicated dossier'; END IF;
  RAISE NOTICE 'F-POST 11: target reassignment reuses dossier';

  v:=public.admin_upsert_student_enrollment_with_gender(sid_new,new_class,current_date,
    'continuing',NULL,'new year note','female');
  IF v->>'gender'<>'female'
     OR (SELECT gender FROM public.profiles WHERE id=sid_new)<>'female'
  THEN RAISE EXCEPTION 'F-POST 12: gender wrapper failed in target'; END IF;
  RAISE NOTICE 'F-POST 12: gender wrapper preserves target functionality';

  IF (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='parents')
     IS DISTINCT FROM
     (SELECT md5(string_agg(parent_id::text||student_id::text,',' ORDER BY parent_id::text))
      FROM public.parent_links)
    OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='bulletins')
     IS DISTINCT FROM
     (SELECT md5(string_agg(id::text||student_id::text||class_id::text||
        school_year_id::text||status,',' ORDER BY id::text)) FROM public.report_cards)
    OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='documents')
     IS DISTINCT FROM
     (SELECT md5(string_agg(id::text||enrollment_id::text||object_key,',' ORDER BY id::text))
      FROM public.student_enrollment_documents)
    OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='legacy_class')
     IS DISTINCT FROM
     (SELECT md5(string_agg(class_id::text||student_id::text,',' ORDER BY class_id::text))
      FROM public.class_students WHERE class_id=old_class)
    OR (SELECT digest FROM public.fixture_5de_history_snapshot WHERE kind='parent_child_ids')
     IS DISTINCT FROM
     (SELECT md5(child_ids::text) FROM public.profiles
      WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  THEN RAISE EXCEPTION 'F-POST 13: old archives and family links changed'; END IF;
  RAISE NOTICE 'F-POST 13: family, bulletin, documents and history intact';
END;
$f_post$;
ROLLBACK;
\echo 'PASS - 5D-F: 13 full-RPC regressions after concurrent finalization; ROLLBACK'
