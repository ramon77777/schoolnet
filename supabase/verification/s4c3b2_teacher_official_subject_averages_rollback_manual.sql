-- SCHOOLNET C.3-B.2 — targeted guarded rollback, NOT for production without GO.
-- Drops only the two C.3-B.2 functions, never any data or C.3-A objects.
DO $guard$
BEGIN
 IF to_regprocedure(
 'public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 OR to_regprocedure(
 'schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 OR pg_get_functiondef(
 'schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)'::regprocedure
 ) NOT LIKE '%S4C3B2_ACCESS_DENIED%'
 THEN RAISE EXCEPTION 'S4C3B2_ROLLBACK_GUARD_FAILED'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid) RESTRICT;
DO $verify$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.school_grading_configuration(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4C3B2_ROLLBACK_INCOMPLETE'; END IF;
END $verify$;
SELECT 'S4C3B2_TARGETED_ROLLBACK_OK' AS result;
