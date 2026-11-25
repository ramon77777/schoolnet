-- SCHOOLNET C3-B.2 teacher selector catalogue: guarded, targeted rollback.
-- Disposable PostgreSQL CI only until a later, explicit production authorization.
DO $guard$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_averages_catalog()') IS NULL
 OR to_regprocedure('schoolnet_private.teacher_official_averages_catalog()') IS NULL
 OR pg_get_functiondef(
  'schoolnet_private.teacher_official_averages_catalog()'::regprocedure
 ) NOT LIKE '%S4C3B2_CATALOG_ACCESS_DENIED%'
 THEN RAISE EXCEPTION 'S4C3B2_CATALOG_ROLLBACK_GUARD_FAILED'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_teacher_official_averages_catalog() RESTRICT;
DROP FUNCTION schoolnet_private.teacher_official_averages_catalog() RESTRICT;
DO $verify$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_averages_catalog()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_averages_catalog()') IS NOT NULL
 OR to_regprocedure(
   'schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4C3B2_CATALOG_ROLLBACK_INCOMPLETE'; END IF;
END $verify$;
SELECT 'S4C3B2_CATALOG_TARGETED_ROLLBACK_OK' AS result;
