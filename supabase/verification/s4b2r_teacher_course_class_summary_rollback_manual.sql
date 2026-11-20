-- S4-B.2-R: rollback de la seule lecture agregée enseignant.
-- CI isolee ; ne pas executer dans le projet principal sans GO distinct.
SET LOCAL statement_timeout='15s';
SET LOCAL lock_timeout='3s';
DO $preflight$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_course_class_summary(uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.teacher_course_class_summary(uuid)') IS NULL
 OR to_regprocedure('public.schoolnet_student_school_courses()') IS NULL
 OR to_regprocedure('public.schoolnet_teacher_school_course_context()') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 THEN RAISE EXCEPTION 'S4B2R_ROLLBACK_BLOCKED: dependance absente'; END IF;
END;
$preflight$;
DROP FUNCTION public.schoolnet_teacher_course_class_summary(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_course_class_summary(uuid) RESTRICT;
DO $verify$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_course_class_summary(uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_course_class_summary(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_courses()') IS NULL
 OR to_regprocedure('public.schoolnet_teacher_school_course_context()') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 THEN RAISE EXCEPTION 'S4B2R_ROLLBACK_FAILED'; END IF;
END;
$verify$;
SELECT 'S4B2R_ROLLBACK_PASS' AS result;
