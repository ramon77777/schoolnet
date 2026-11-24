-- S4-C.3-A : guarded MANUAL rollback. Run only under a separate GO.
-- Never remove school configuration with actual rows. Order: public facades,
-- private functions, dependent configuration tables.
DO $guard$
BEGIN
 IF to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('schoolnet_private.school_period_subject_coefficients') IS NULL
 OR to_regclass('schoolnet_private.school_official_assessment_coefficients') IS NULL
 THEN RAISE EXCEPTION 'S4C3A_ROLLBACK_GUARD_FAILED'; END IF;
 IF EXISTS(SELECT 1 FROM schoolnet_private.school_grading_periods)
 OR EXISTS(SELECT 1 FROM schoolnet_private.school_period_subject_coefficients)
 OR EXISTS(SELECT 1 FROM schoolnet_private.school_official_assessment_coefficients)
 THEN RAISE EXCEPTION 'S4C3A_ROLLBACK_REFUSES_CONFIGURED_DATA'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_school_set_assessment_coefficient(uuid,uuid,uuid,numeric,boolean);
DROP FUNCTION public.schoolnet_school_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric);
DROP FUNCTION public.schoolnet_school_lock_grading_period(uuid,uuid);
DROP FUNCTION public.schoolnet_school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date);
DROP FUNCTION public.schoolnet_school_grading_configuration(uuid);
DROP FUNCTION schoolnet_private.school_set_assessment_coefficient(uuid,uuid,uuid,numeric,boolean);
DROP FUNCTION schoolnet_private.school_set_subject_coefficient(uuid,uuid,uuid,uuid,numeric);
DROP FUNCTION schoolnet_private.school_lock_grading_period(uuid,uuid);
DROP FUNCTION schoolnet_private.school_upsert_grading_period(uuid,uuid,uuid,text,text,date,date);
DROP FUNCTION schoolnet_private.school_grading_configuration(uuid);
DROP TABLE schoolnet_private.school_official_assessment_coefficients;
DROP TABLE schoolnet_private.school_period_subject_coefficients;
DROP TABLE schoolnet_private.school_grading_periods;
SELECT 'S4C3A_ROLLBACK_PASS' AS result;
