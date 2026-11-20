-- SCHOOLNET V2 / S4-B.3-N — PROPOSITION DE DURCISSEMENT SQL, NON APPLIQUEE.
-- NE PAS installer sur Supabase principal sans autorisation distincte.
-- Objet: retirer uniquement EXECUTE direct sur la fonction de trigger
-- historique SECURITY DEFINER, sans modifier son corps, ses triggers,
-- ni les donnees/notifications ou les grants service_role et proprietaire.
--
-- Production (lecture seule du 20-11-2026) :
-- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- La restauration exacte des droits anon/authenticated est dans le rollback.

DO $s4b3n_revoke_preflight$
DECLARE
  v_oid oid := to_regprocedure('public.notify_assessment_published()');
  v_record record;
BEGIN
  IF v_oid IS NULL
    OR to_regprocedure('schoolnet_private.emit_official_assessment_notification(uuid,text)') IS NULL
    OR to_regclass('public.assessments') IS NULL
  THEN
    RAISE EXCEPTION 'S4B3N_PERMISSIONS_PREFLIGHT_OBJECTS_NOT_READY';
  END IF;

  SELECT p.prosecdef AS security_definer,
         p.prorettype::regtype::text AS return_type,
         p.proconfig @> ARRAY['search_path=pg_catalog']::text[] AS safe_path
    INTO v_record
  FROM pg_catalog.pg_proc p
  WHERE p.oid=v_oid;

  IF v_record.security_definer IS DISTINCT FROM TRUE
    OR v_record.return_type <> 'trigger'
    OR v_record.safe_path IS DISTINCT FROM TRUE
    OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_oid),'S4B3N_ROUTING_OFFICIEL')=0
    OR NOT has_function_privilege('anon',v_oid,'EXECUTE')
    OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.assessments'::regclass
        AND t.tgfoid=v_oid
        AND t.tgname='trg_notify_assessment_published'
        AND t.tgenabled='O'
    )
  THEN
    RAISE EXCEPTION 'S4B3N_PERMISSIONS_PREFLIGHT_LEGACY_DRIFT';
  END IF;
END;
$s4b3n_revoke_preflight$;

-- Une fonction RETURNS trigger est appelee par PostgreSQL comme trigger :
-- retirer EXECUTE direct n'arrete pas le declencheur deja installe.
-- La CI doit toutefois le prouver par de VRAIES publications V1 et V2.
REVOKE ALL ON FUNCTION public.notify_assessment_published()
 FROM PUBLIC, anon, authenticated;

DO $s4b3n_revoke_postflight$
DECLARE v_oid oid := to_regprocedure('public.notify_assessment_published()');
BEGIN
  IF v_oid IS NULL
    OR has_function_privilege('anon',v_oid,'EXECUTE')
    OR has_function_privilege('authenticated',v_oid,'EXECUTE')
    OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
    OR (SELECT count(*) FROM pg_catalog.pg_trigger t
        WHERE t.tgfoid=v_oid
          AND t.tgname='trg_notify_assessment_published'
          AND t.tgenabled='O')<>1
    OR pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_oid),'S4B3N_ROUTING_OFFICIEL')=0
  THEN
    RAISE EXCEPTION 'S4B3N_PERMISSIONS_POSTFLIGHT_FAILED';
  END IF;
END;
$s4b3n_revoke_postflight$;

SELECT 'S4B3N_PERMISSIONS_HARDENING_PASS' AS result;
