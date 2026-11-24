-- SCHOOLNET S4-B.3-B.4 - rollback MANUEL ET CIBLE, base principale uniquement apres autorisation.
-- Le rollback ne supprime aucune table ni donnee V1/V2.
DO $guard$
BEGIN
 IF to_regprocedure('schoolnet_private.student_official_dashboard()') IS NULL
 OR to_regprocedure('public.schoolnet_student_official_dashboard()') IS NULL
 OR pg_get_functiondef('schoolnet_private.student_official_dashboard()'::regprocedure)
    NOT LIKE '%S4B3B4_ACCESS_DENIED%'
 THEN RAISE EXCEPTION 'S4B3B4_ROLLBACK_GUARD_FAILED'; END IF;
END $guard$;
DROP FUNCTION public.schoolnet_student_official_dashboard();
DROP FUNCTION schoolnet_private.student_official_dashboard();
SELECT 'S4B3B4_STUDENT_OFFICIAL_DASHBOARD_ROLLBACK_PASS' AS result;
