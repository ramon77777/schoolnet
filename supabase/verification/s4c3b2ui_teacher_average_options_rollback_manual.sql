-- C.3-B.2-UI guarded rollback for disposable PostgreSQL QA ONLY.
-- No table drops, no student data, no change to C.3-A or B.2 average service.
DO $guard$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_average_options()') IS NULL
 OR to_regprocedure('schoolnet_private.teacher_official_average_options()') IS NULL
 OR pg_get_functiondef('schoolnet_private.teacher_official_average_options()'::regprocedure)
     NOT LIKE '%S4C3B2UI_ACCESS_DENIED%'
 THEN RAISE EXCEPTION 'S4C3B2UI_ROLLBACK_GUARD_FAILED'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_teacher_official_average_options() RESTRICT;
DROP FUNCTION schoolnet_private.teacher_official_average_options() RESTRICT;
DO $verify$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_average_options()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_average_options()') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4C3B2UI_ROLLBACK_INCOMPLETE'; END IF;
END $verify$;
SELECT 'S4C3B2UI_TARGETED_ROLLBACK_OK' AS result;
