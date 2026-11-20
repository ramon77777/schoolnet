-- S4-B.3-B.1 : ROLLBACK MANUEL, NE PAS EXECUTER EN PRODUCTION SANS ACCORD.
-- Aucun rendu ni donnée ne sont modifies. Retour à la consultation calendrier B.3-A.
DO $preflight$
BEGIN
 IF to_regprocedure('public.schoolnet_student_school_assessment_preview(uuid,uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.student_school_assessment_preview(uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B3B1_ROLLBACK_NOT_INSTALLED'; END IF;
END $preflight$;

DROP FUNCTION public.schoolnet_student_school_assessment_preview(uuid,uuid);
DROP FUNCTION schoolnet_private.student_school_assessment_preview(uuid,uuid);

DO $postflight$
BEGIN
 IF to_regprocedure('public.schoolnet_student_school_assessment_preview(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.student_school_assessment_preview(uuid,uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_course_assessments(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4B3B1_ROLLBACK_FAILED'; END IF;
END $postflight$;
SELECT 'S4B3B1_PREVIEW_ROLLBACK_PASS' AS result;
