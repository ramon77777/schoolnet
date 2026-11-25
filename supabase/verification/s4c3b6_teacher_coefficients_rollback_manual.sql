-- S4-C.3-B.6.2 - TARGETED MANUAL ROLLBACK (LOCAL TEST ONLY).
-- Execute ONLY in disposable PostgreSQL or with a separate production rollback GO.
-- Never alter existing C3-A tables or teacher averages.
BEGIN;
DROP FUNCTION IF EXISTS public.schoolnet_teacher_coefficient_settings(uuid);
DROP FUNCTION IF EXISTS public.schoolnet_teacher_set_assessment_coefficient(uuid,uuid,uuid,numeric,boolean);
DROP FUNCTION IF EXISTS public.schoolnet_teacher_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric);
DROP FUNCTION IF EXISTS public.schoolnet_school_teacher_coefficient_delegations(uuid);
DROP FUNCTION IF EXISTS public.schoolnet_school_set_teacher_coefficient_delegation(uuid,uuid,boolean);
DROP FUNCTION IF EXISTS schoolnet_private.teacher_coefficient_settings(uuid);
DROP FUNCTION IF EXISTS schoolnet_private.teacher_set_assessment_coefficient(uuid,uuid,uuid,numeric,boolean);
DROP FUNCTION IF EXISTS schoolnet_private.teacher_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric);
DROP FUNCTION IF EXISTS schoolnet_private.school_teacher_coefficient_delegations(uuid);
DROP FUNCTION IF EXISTS schoolnet_private.school_set_teacher_coefficient_delegation(uuid,uuid,boolean);
DROP TABLE IF EXISTS schoolnet_private.school_teacher_coefficient_events;
DROP TABLE IF EXISTS schoolnet_private.school_teacher_coefficient_delegations;
DO $assert$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_coefficient_settings(uuid)') IS NOT NULL
 OR to_regclass('schoolnet_private.school_teacher_coefficient_events') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4C3B6_ROLLBACK_FAILED'; END IF;
 RAISE NOTICE 'S4C3B6_TARGETED_ROLLBACK_OK';
END $assert$;
COMMIT;
