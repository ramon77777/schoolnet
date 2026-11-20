-- S4-B.3-A : retrait cible en environnement CI jetable.
-- Ne jamais appliquer sur Supabase principal sans procedure distincte.
DO $preflight$
BEGIN
 IF to_regclass('schoolnet_private.school_assessment_links') IS NULL
 OR to_regprocedure('public.schoolnet_student_school_course_assessments(uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B3A_ROLLBACK_PREFLIGHT_FAILED'; END IF;
END;$preflight$;
DROP FUNCTION public.schoolnet_teacher_school_assessment_context(uuid) RESTRICT;
DROP FUNCTION public.schoolnet_teacher_link_school_assessment(uuid) RESTRICT;
DROP FUNCTION public.schoolnet_teacher_unlink_school_assessment(uuid) RESTRICT;
DROP FUNCTION public.schoolnet_student_school_course_assessments(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_school_assessment_context(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_link_school_assessment(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.teacher_unlink_school_assessment(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.student_school_course_assessments(uuid) RESTRICT;
DROP TABLE schoolnet_private.school_assessment_links RESTRICT;
DO $check$
BEGIN
 IF to_regclass('schoolnet_private.school_assessment_links') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_link_school_assessment(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_course_assessments(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_courses()') IS NULL
 OR to_regprocedure('public.schoolnet_teacher_course_class_summary(uuid)') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 THEN RAISE EXCEPTION 'S4B3A_ROLLBACK_FAILED'; END IF;
END;$check$;
SELECT 'S4B3A_ROLLBACK_PASS' AS result;
