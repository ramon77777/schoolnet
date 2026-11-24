-- Verification comportementale APRES retrait de l'API C.1, Postgres LOCAL seulement.
-- Le durcissement V1 doit rester en place apres ce retour arriere.
BEGIN;
SET LOCAL statement_timeout='45s';
\ir family-seed.sql

DO $removed$
BEGIN
 IF to_regprocedure('public.schoolnet_parent_official_results()') IS NOT NULL
 OR to_regprocedure('public.schoolnet_parent_official_result(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.parent_official_results()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.parent_official_result(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.parent_official_result_rows(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_LEFT_API'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE 's4b3b0_%' AND permissive='RESTRICTIVE')<>8
 THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_REMOVED_B0'; END IF;
END $removed$;

-- Meme une inscription V1 artificielle ne doit pas rouvrir l'acces officiel.
INSERT INTO public.course_enrollments(course_id,student_id)
VALUES('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $still_guarded$
DECLARE d jsonb;
BEGIN
 IF (SELECT count(*) FROM public.get_parent_child_assessment_submissions('10000000-0000-4000-8000-000000000005'))<>1
 OR NOT EXISTS(SELECT 1 FROM public.get_parent_child_assessment_submissions('10000000-0000-4000-8000-000000000005') s
  WHERE s.assessment_id='a0000000-0000-4000-8000-000000000005'::uuid AND s.score=12)
 OR (SELECT count(*) FROM public.get_parent_child_homework_submissions('10000000-0000-4000-8000-000000000005'))<>1
 THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_V1_LISTS'; END IF;
 d:=public.get_parent_child_assessment_detail('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005');
 IF COALESCE((d->>'found')::boolean,true) THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_LEAKS_OFFICIAL'; END IF;
 d:=public.get_parent_child_assessment_detail('a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005');
 IF d->>'found' IS DISTINCT FROM 'true' OR (d#>>'{submission,score}')::numeric<>12
 THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_BREAKS_V1'; END IF;
END $still_guarded$;
RESET ROLE;

UPDATE schoolnet_private.school_assessment_links
 SET status='revoked',revoked_at=now(),revoked_by='10000000-0000-4000-8000-000000000003'
 WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $revoked_stays_guarded$
DECLARE d jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.get_parent_child_assessment_submissions('10000000-0000-4000-8000-000000000005')
  WHERE assessment_id='a0000000-0000-4000-8000-000000000001'::uuid)
 OR EXISTS(SELECT 1 FROM public.get_parent_child_homework_submissions('10000000-0000-4000-8000-000000000005')
  WHERE homework_id='a0000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_REVOKED_LIST_LEAK'; END IF;
 d:=public.get_parent_child_assessment_detail('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005');
 IF COALESCE((d->>'found')::boolean,true) THEN RAISE EXCEPTION 'C1_FAIL_ROLLBACK_REVOKED_DETAIL_LEAK'; END IF;
END $revoked_stays_guarded$;
RESET ROLE;
SELECT 'S4B3C1_ROLLBACK_V1_GUARDS_PASS' AS result;
ROLLBACK;
