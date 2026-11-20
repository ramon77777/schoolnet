-- SCHOOLNET S4-B.2 : rollback MANUEL des cinq RPC, aucune table a retirer.
-- NE PAS EXECUTER en production sans accord distinct et avant retour frontend.
-- Executer dans UNE transaction (psql -1 CI / migration approuvee).
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15000ms';
DO $preflight$
BEGIN
 IF to_regprocedure('public.schoolnet_student_school_courses()') IS NULL
  OR to_regprocedure('public.schoolnet_student_school_course_detail(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_courses()') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_course_detail(uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_school_course_catalog(uuid)') IS NULL
  OR to_regclass('schoolnet_private.school_course_links') IS NULL
 THEN RAISE EXCEPTION 'S4B2_ROLLBACK_BLOCKED: schema attendu absent'; END IF;
END;
$preflight$;
DROP FUNCTION public.schoolnet_student_school_course_detail(uuid) RESTRICT;
DROP FUNCTION public.schoolnet_student_school_courses() RESTRICT;
DROP FUNCTION schoolnet_private.student_school_course_detail(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.student_school_courses() RESTRICT;
DROP FUNCTION schoolnet_private.student_school_course_access(uuid) RESTRICT;
DO $verify$
BEGIN
 IF to_regprocedure('public.schoolnet_student_school_courses()') IS NOT NULL
 OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_school_course_catalog(uuid)') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 THEN RAISE EXCEPTION 'S4B2_ROLLBACK_FAILED: S4-B.1 absent ou RPC restante'; END IF;
END;
$verify$;
NOTIFY pgrst, 'reload schema';
SELECT 'S4B2_ROLLBACK_PASS' AS result;
