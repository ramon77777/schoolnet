-- C.2 : rollback manuel cible; aucun resultat ni table ne sont effaces.
DO $guard$
BEGIN
 IF to_regprocedure('public.schoolnet_school_assessment_supervision(uuid)') IS NULL
 OR to_regprocedure('schoolnet_private.school_assessment_supervision(uuid)') IS NULL
 OR pg_get_functiondef('schoolnet_private.school_assessment_supervision(uuid)'::regprocedure)
    NOT LIKE '%S4B3C2_TOO_MANY_ASSESSMENTS%'
 THEN RAISE EXCEPTION 'S4B3C2_ROLLBACK_GUARD_FAILED'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_school_assessment_supervision(uuid);
DROP FUNCTION schoolnet_private.school_assessment_supervision(uuid);
SELECT 'S4B3C2_ROLLBACK_PASS' AS result;
