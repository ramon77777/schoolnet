-- SCHOOLNET 5D-F: full-RPC regression BEFORE the year switch, all changes ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $f_pre$
DECLARE
  sid uuid:='22222222-2222-4222-8222-222222222222';
  src uuid:='20252025-2025-4025-8025-202520252025';
  dst uuid:='20262026-2026-4026-8026-202620262026';
  class_src uuid:='c0250000-0000-4000-8000-000000000025';
  class_dst uuid:='c0260000-0000-4000-8000-000000000026';
  eid uuid;
  receipt text;
  v jsonb;
  denied boolean;
BEGIN
  IF pg_catalog.current_database()<>'schoolnet_lot5d_ci' THEN
    RAISE EXCEPTION 'F-PRE: disposable fixture only'; END IF;

  v:=public.admin_upsert_student_enrollment(sid,class_src,'2025-09-12','transfer',
    'Previous School Synthetic','initial note');
  SELECT id,enrollment_number INTO eid,receipt
  FROM public.student_enrollments WHERE student_id=sid AND school_year_id=src;
  IF eid IS NULL OR receipt IS NULL OR v->>'status'<>'active'
     OR v->>'enrollment_number'<>receipt OR v->>'student_name'<>'Eleve fictif 2'
     OR (SELECT enrolled_on FROM public.student_enrollments WHERE id=eid)<>'2025-09-12'::date
  THEN RAISE EXCEPTION 'F-PRE 01: initial full RPC contract failed'; END IF;
  RAISE NOTICE 'F-PRE 01: enrollment number, identity and status';

  v:=public.admin_assign_student_to_class(sid,class_src);
  IF v->>'enrollment_id'<>eid::text OR v->>'status'<>'active'
     OR (SELECT admission_type FROM public.student_enrollments WHERE id=eid)<>'transfer'
     OR (SELECT notes FROM public.student_enrollments WHERE id=eid)<>'initial note'
  THEN RAISE EXCEPTION 'F-PRE 02: assign wrapper lost enrollment fields'; END IF;
  RAISE NOTICE 'F-PRE 02: assign wrapper preserves metadata';

  v:=public.admin_upsert_student_enrollment(sid,class_src,'2025-11-10','transfer',
    'Previous School Synthetic','updated note');
  IF v->>'enrollment_number'<>receipt
     OR (SELECT enrolled_on FROM public.student_enrollments WHERE id=eid)<>'2025-09-12'::date
     OR (SELECT count(*) FROM public.student_enrollments WHERE student_id=sid AND school_year_id=src)<>1
  THEN RAISE EXCEPTION 'F-PRE 03: upsert replaced enrollment identity/date'; END IF;
  RAISE NOTICE 'F-PRE 03: repeat upsert preserves number and date';

  v:=public.admin_upsert_student_enrollment_with_gender(sid,class_src,'2025-12-10',
    'transfer','Previous School Synthetic','updated note','male');
  IF v->>'gender'<>'male'
     OR (SELECT gender FROM public.profiles WHERE id=sid)<>'male'
  THEN RAISE EXCEPTION 'F-PRE 04: gender wrapper missing real profile effect'; END IF;
  RAISE NOTICE 'F-PRE 04: gender wrapper writes validated text';

  denied:=false;
  BEGIN
    PERFORM public.admin_upsert_student_enrollment_with_gender(sid,class_src,current_date,
      'transfer','Previous School Synthetic','updated note','invalid');
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied OR (SELECT gender FROM public.profiles WHERE id=sid)<>'male'
  THEN RAISE EXCEPTION 'F-PRE 05: invalid gender accepted'; END IF;
  RAISE NOTICE 'F-PRE 05: invalid gender denied';

  v:=public.admin_set_student_enrollment_status(eid,'draft','reviewed note');
  IF v->>'status'<>'draft'
     OR EXISTS(SELECT 1 FROM public.class_students WHERE class_id=class_src AND student_id=sid)
     OR (SELECT class_name FROM public.profiles WHERE id=sid) IS NOT NULL
  THEN RAISE EXCEPTION 'F-PRE 06: draft status sync failed'; END IF;
  RAISE NOTICE 'F-PRE 06: status draft removes current class';

  v:=public.admin_set_student_enrollment_status(eid,'active',NULL);
  IF v->>'status'<>'active'
     OR NOT EXISTS(SELECT 1 FROM public.class_students WHERE class_id=class_src AND student_id=sid)
     OR (SELECT notes FROM public.student_enrollments WHERE id=eid)<>'reviewed note'
     OR (SELECT enrolled_on FROM public.student_enrollments WHERE id=eid)<>'2025-09-12'::date
     OR (SELECT class_name FROM public.profiles WHERE id=sid)<>'6e A'
  THEN RAISE EXCEPTION 'F-PRE 07: reactivation lost note/date/class'; END IF;
  RAISE NOTICE 'F-PRE 07: reactivation preserves original date and note';

  v:=public.admin_remove_student_from_class(sid,class_src);
  IF v->>'removed'<>'true' OR v->>'status'<>'withdrawn'
     OR EXISTS(SELECT 1 FROM public.class_students WHERE class_id=class_src AND student_id=sid)
     OR (SELECT status::text FROM public.student_enrollments WHERE id=eid)<>'withdrawn'
     OR (SELECT class_name FROM public.profiles WHERE id=sid) IS NOT NULL
  THEN RAISE EXCEPTION 'F-PRE 08: remove legacy class failed'; END IF;
  RAISE NOTICE 'F-PRE 08: remove keeps dossier and marks withdrawn';

  v:=public.admin_assign_student_to_class(sid,class_src);
  IF v->>'enrollment_id'<>eid::text OR v->>'status'<>'active'
     OR (SELECT notes FROM public.student_enrollments WHERE id=eid)<>'reviewed note'
  THEN RAISE EXCEPTION 'F-PRE 09: reassignment lost dossier'; END IF;
  RAISE NOTICE 'F-PRE 09: reassignment reuses dossier';

  v:=public.admin_upsert_student_enrollment(sid,class_dst,'2026-09-12','new',NULL,'next year test');
  IF v->>'status'<>'completed'
     OR (SELECT class_name FROM public.profiles WHERE id=sid)<>'6e A'
     OR (SELECT status::text FROM public.student_enrollments
         WHERE student_id=sid AND school_year_id=dst)<>'completed'
  THEN RAISE EXCEPTION 'F-PRE 10: noncurrent year overwrote active profile'; END IF;
  RAISE NOTICE 'F-PRE 10: noncurrent registration does not overwrite current profile';

  denied:=false;
  BEGIN PERFORM public.admin_set_student_enrollment_status(eid,'invalid',NULL);
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'F-PRE 11: invalid status accepted'; END IF;
  RAISE NOTICE 'F-PRE 11: invalid status denied';

  PERFORM pg_catalog.set_config('request.jwt.claim.sub',sid::text,true);
  denied:=false;
  BEGIN PERFORM public.admin_remove_student_from_class(sid,class_src);
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
  IF NOT denied THEN RAISE EXCEPTION 'F-PRE 12: non-admin operation succeeded'; END IF;
  RAISE NOTICE 'F-PRE 12: student blocked from Admin RPC';
END;
$f_pre$;
ROLLBACK;
\echo 'PASS - 5D-F: 12 full-RPC regression assertions before finalization; ROLLBACK'
