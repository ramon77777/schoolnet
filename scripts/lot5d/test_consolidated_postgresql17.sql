-- TEST D'INTEGRATION SQL - POSTGRES 17 JETABLE UNIQUEMENT.
-- Requiert fixture_postgresql17.sql puis le candidat SQL de proposals.
-- Toutes les mutations de test sont sous ROLLBACK dans la base ephemere.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);

DO $lot5d_test_first$
DECLARE
  src uuid:='20252025-2025-4025-8025-202520252025';
  dst uuid:='20262026-2026-4026-8026-202620262026';
  student uuid:='11111111-1111-4111-8111-111111111111';
  admin_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  blocked boolean;
BEGIN
  IF (SELECT count(*) FROM public.school_years WHERE is_current)<>1 THEN
    RAISE EXCEPTION 'QA 01: calendrier initial incoherent'; END IF;
  IF pg_catalog.has_function_privilege('authenticated',
       'schoolnet_private.finalize_lot5d_legacy_year(uuid,uuid,text,uuid,uuid)'::regprocedure,'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
       'schoolnet_private.save_lot5d_legacy_decision(uuid,uuid,uuid,text,uuid,text,uuid)'::regprocedure,'EXECUTE')
     OR pg_catalog.has_function_privilege('service_role',
       'schoolnet_private.finalize_lot5d_legacy_year(uuid,uuid,text,uuid,uuid)'::regprocedure,'EXECUTE')
  THEN RAISE EXCEPTION 'QA 02: EXECUTE prive accessible au navigateur'; END IF;
  RAISE NOTICE '5D-SQL 01/02 : fixture et permissions fermees OK';

  blocked:=false;
  BEGIN UPDATE public.school_years SET is_current=false WHERE id=src;
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 03: modification directe autorisee'; END IF;
  blocked:=false;
  BEGIN PERFORM public.admin_set_current_school_year(dst);
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 04: ancienne RPC non neutralisee'; END IF;
  blocked:=false;
  BEGIN DELETE FROM public.school_years WHERE id=src;
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 05: suppression annee courante autorisee'; END IF;
  RAISE NOTICE '5D-SQL 03/04/05 : UPDATE, RPC legacy et DELETE bloques OK';

  blocked:=false;
  BEGIN
    PERFORM schoolnet_private.finalize_lot5d_legacy_year(src,dst,'2026-2027',admin_id,
       '10000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%decisions definitives%' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 06: decisions manquantes acceptees'; END IF;
  RAISE NOTICE '5D-SQL 06 : aucune bascule sans decision OK';

  PERFORM pg_catalog.set_config('request.jwt.claim.sub',
    '11111111-1111-4111-8111-111111111111',true);
  blocked:=false;
  BEGIN PERFORM schoolnet_private.save_lot5d_legacy_decision(
    src,dst,student,'repeat','c0260000-0000-4000-8000-000000000026',NULL,student);
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',admin_id::text,true);
  IF NOT blocked THEN RAISE EXCEPTION 'QA 07: role apprenant peut enregistrer'; END IF;

  blocked:=false;
  BEGIN PERFORM schoolnet_private.save_lot5d_legacy_decision(
    src,dst,student,'repeat','c0270000-0000-4000-8000-000000000027',NULL,admin_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%redoublement%' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 08: redoublement change de niveau'; END IF;
  RAISE NOTICE '5D-SQL 07/08 : roles et niveau proteges OK';

  blocked:=false;
  BEGIN
    INSERT INTO public.student_enrollments(student_id,school_year_id,class_id,status)
    VALUES('22222222-2222-4222-8222-222222222222',
      dst,'c0260000-0000-4000-8000-000000000026','active');
    PERFORM schoolnet_private.save_lot5d_legacy_decision(
      src,dst,student,'repeat','c0260000-0000-4000-8000-000000000026',NULL,admin_id);
    PERFORM schoolnet_private.finalize_lot5d_legacy_year(src,dst,'2026-2027',admin_id,
        '10000000-0000-4000-8000-000000000002');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%annee cible deja occupee%' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked OR EXISTS(SELECT 1 FROM public.student_enrollments WHERE school_year_id=dst)
  THEN RAISE EXCEPTION 'QA 09: cible active d un autre eleve non bloquee'; END IF;
  RAISE NOTICE '5D-SQL 09 : autre apprenant actif en cible = STOP OK';

  PERFORM schoolnet_private.save_lot5d_legacy_decision(
     src,dst,student,'repeat','c0260000-0000-4000-8000-000000000026',NULL,admin_id);
  blocked:=false;
  BEGIN
     INSERT INTO public.classes(id,level_id,name,school_year,school_year_id,learning_context,school_id)
       VALUES('c0990000-0000-4000-8000-000000000099',6,'Classe officielle',
              '2026-2027',dst,'school','99999999-9999-4999-8999-999999999999');
     PERFORM schoolnet_private.finalize_lot5d_legacy_year(src,dst,'2026-2027',admin_id,
       '10000000-0000-4000-8000-000000000003');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%officielles S3-C%' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 10: classe officielle non bloquee'; END IF;
  RAISE NOTICE '5D-SQL 10 : separation S3-C protegee OK';
END;
$lot5d_test_first$;

-- Injection d'echec APRES fermeture source + bascule: rollback atomique.
CREATE FUNCTION public.fixture_fail_rollover_audit() RETURNS trigger LANGUAGE plpgsql AS $fail$
BEGIN RAISE EXCEPTION 'fixture-injected-rollback'; END;
$fail$;
CREATE TRIGGER trg_fixture_fail_rollover_audit BEFORE INSERT ON public.school_year_rollover_audit
 FOR EACH ROW EXECUTE FUNCTION public.fixture_fail_rollover_audit();

DO $lot5d_test_rollback$
DECLARE
  src uuid:='20252025-2025-4025-8025-202520252025';
  dst uuid:='20262026-2026-4026-8026-202620262026';
  admin_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  blocked boolean:=false;
BEGIN
  BEGIN
    PERFORM schoolnet_private.finalize_lot5d_legacy_year(src,dst,'2026-2027',admin_id,
      '10000000-0000-4000-8000-000000000004');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%fixture-injected-rollback%' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked OR NOT (SELECT is_current FROM public.school_years WHERE id=src)
     OR (SELECT is_current FROM public.school_years WHERE id=dst)
     OR EXISTS(SELECT 1 FROM public.student_enrollments WHERE school_year_id=dst)
     OR EXISTS(SELECT 1 FROM public.school_year_rollover_runs)
     OR EXISTS(SELECT 1 FROM schoolnet_private.lot5d_year_switch_permits)
     OR (SELECT count(*) FROM public.student_enrollments
         WHERE school_year_id=src AND status='active')<>1
  THEN RAISE EXCEPTION 'QA 11: echec finalisateur sans rollback total'; END IF;
  RAISE NOTICE '5D-SQL 11 : rollback post-cloture/bascule integral OK';
END;
$lot5d_test_rollback$;
DROP TRIGGER trg_fixture_fail_rollover_audit ON public.school_year_rollover_audit;
DROP FUNCTION public.fixture_fail_rollover_audit();

DO $lot5d_test_success$
DECLARE
  src uuid:='20252025-2025-4025-8025-202520252025';
  dst uuid:='20262026-2026-4026-8026-202620262026';
  admin_id uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  op uuid:='10000000-0000-4000-8000-000000000005';
  result_json jsonb;
  before_events integer;
  blocked boolean:=false;
BEGIN
  before_events := (SELECT count(*) FROM public.student_enrollment_events);
  result_json := schoolnet_private.finalize_lot5d_legacy_year(
    src,dst,'2026-2027',admin_id,op);
  IF result_json->>'already_finalized'<>'false'
     OR (result_json->>'repeated')::integer<>1
     OR (SELECT count(*) FROM public.school_years WHERE is_current)<>1
     OR NOT (SELECT is_current FROM public.school_years WHERE id=dst)
     OR EXISTS(SELECT 1 FROM public.student_enrollments WHERE school_year_id=src AND status='active')
     OR (SELECT count(*) FROM public.student_enrollments
         WHERE school_year_id=src AND status='completed')<>1
     OR (SELECT count(*) FROM public.student_enrollments
         WHERE school_year_id=dst AND status='active')<>1
     OR (SELECT count(*) FROM public.school_year_rollover_audit)<>1
     OR (SELECT count(*) FROM public.school_year_rollover_runs)<>1
     OR (SELECT count(*) FROM public.class_students)<>2
     OR (SELECT class_name FROM public.profiles
         WHERE id='11111111-1111-4111-8111-111111111111')<>'6e B'
     OR (SELECT count(*) FROM public.student_enrollment_events)<>before_events+2
     OR EXISTS(SELECT 1 FROM schoolnet_private.lot5d_year_switch_permits)
  THEN RAISE EXCEPTION 'QA 12: finalisation transactionnelle non conforme'; END IF;
  RAISE NOTICE '5D-SQL 12 : bascule atomique, audit, anciens liens preserves OK';

  result_json := schoolnet_private.finalize_lot5d_legacy_year(
    src,dst,'2026-2027',admin_id,op);
  IF result_json->>'already_finalized'<>'true'
     OR (SELECT count(*) FROM public.school_year_rollover_audit)<>1
     OR (SELECT count(*) FROM public.student_enrollment_events)<>before_events+2
  THEN RAISE EXCEPTION 'QA 13: rejouement non idempotent'; END IF;
  blocked:=false;
  BEGIN PERFORM schoolnet_private.finalize_lot5d_legacy_year(
    src,dst,'2026-2027',admin_id,
    '10000000-0000-4000-8000-000000000099');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%cle differente%' THEN blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 14: cle operation differente acceptee'; END IF;
  RAISE NOTICE '5D-SQL 13/14 : replay sans doublon et cle differente rejetee OK';

  blocked:=false;
  BEGIN UPDATE public.school_year_rollover_audit SET decision='leave';
  EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'QA 15: journal modifiable'; END IF;
  RAISE NOTICE '5D-SQL 15 : journal append-only OK';
END;
$lot5d_test_success$;
ROLLBACK;
\echo 'SCHOOLNET 5D-A+B : 15 verifications SQL de fixture terminees, ROLLBACK effectue.'
