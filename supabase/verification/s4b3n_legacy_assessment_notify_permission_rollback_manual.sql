-- SCHOOLNET V2 / S4-B.3-N — ROLLBACK MANUEL DES SEULS GRANTS.
-- NON EXECUTE en production. Autorisation distincte obligatoire.
-- Restaure les autorisations DIRECTES relevees avant le durcissement:
-- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Ne modifie aucun trigger, corps de fonction, inscription ou notification.
DO $rollback_preflight$
DECLARE v_oid oid := to_regprocedure('public.notify_assessment_published()');
BEGIN
 IF v_oid IS NULL
  OR has_function_privilege('anon',v_oid,'EXECUTE')
  OR has_function_privilege('authenticated',v_oid,'EXECUTE')
  OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
  OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_oid),'S4B3N_ROUTING_OFFICIEL')=0
 THEN RAISE EXCEPTION 'S4B3N_PERMISSIONS_ROLLBACK_PREFLIGHT_FAILED'; END IF;
END;
$rollback_preflight$;

GRANT EXECUTE ON FUNCTION public.notify_assessment_published()
 TO anon, authenticated;

DO $rollback_postflight$
DECLARE v_oid oid := to_regprocedure('public.notify_assessment_published()');
BEGIN
 IF NOT has_function_privilege('anon',v_oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
  OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
  OR (SELECT count(*) FROM pg_catalog.pg_trigger t
      WHERE t.tgfoid=v_oid AND t.tgname='trg_notify_assessment_published'
        AND t.tgenabled='O')<>1
 THEN RAISE EXCEPTION 'S4B3N_PERMISSIONS_ROLLBACK_FAILED'; END IF;
END;
$rollback_postflight$;
SELECT 'S4B3N_PERMISSIONS_ROLLBACK_PASS' AS result;
