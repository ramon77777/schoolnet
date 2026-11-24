-- SCHOOLNET S4-B.3-C.1 - RETRAIT MANUEL DES NOUVELLES API UNIQUEMENT.
-- GO distinct requis pour une execution sur le projet principal.
-- Executer atomiquement : psql -v ON_ERROR_STOP=1 -1 -f ce_fichier.
-- IMPORTANT : garde le durcissement des TROIS RPC V1. Aucune donnee supprimee.
DO $c1_legacy_rollback_guard$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b89c4719c8b5b5fa427cf634328da45e','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','56a21d53edfc0dc8b5eb5addfe0e8a0c','s'),
  ('public.get_parent_child_homework_submissions(uuid)','deddc10f89c5f3d7623161440d7922e7','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_rollback_guard$;


DO $c1_new_contract$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('schoolnet_private.parent_official_result_rows(uuid,uuid)','3dab15b18217d38b217a6ef9001b44a7',true,false),
  ('schoolnet_private.parent_official_results()','011b328d2661f527ed4d2b44157a23fb',true,true),
  ('schoolnet_private.parent_official_result(uuid,uuid)','a33486cb017eada436f3729f7c7e939e',true,true),
  ('public.schoolnet_parent_official_results()','14287b22e8164c61042faa373d47f688',false,true),
  ('public.schoolnet_parent_official_result(uuid,uuid)','cb9de127953543d4b3bb3feeb5e299ad',false,true)
 ) e(signature,body_md5,security_definer,authenticated_execute)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_NEW_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosrc,p.prosecdef,p.provolatile,p.proconfig,
   pg_get_userbyid(p.proowner) AS owner_name,
   EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))
    WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(actual.prosrc) IS DISTINCT FROM expected.body_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM expected.security_definer
   OR actual.provolatile IS DISTINCT FROM 's'::"char"
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR actual.public_execute
   OR has_function_privilege('anon',function_oid,'EXECUTE')
   OR has_function_privilege('service_role',function_oid,'EXECUTE')
   OR has_function_privilege('authenticated',function_oid,'EXECUTE')
      IS DISTINCT FROM expected.authenticated_execute
  THEN RAISE EXCEPTION 'S4B3C1_NEW_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_new_contract$;

DROP FUNCTION public.schoolnet_parent_official_result(uuid,uuid);
DROP FUNCTION public.schoolnet_parent_official_results();
DROP FUNCTION schoolnet_private.parent_official_result(uuid,uuid);
DROP FUNCTION schoolnet_private.parent_official_results();
DROP FUNCTION schoolnet_private.parent_official_result_rows(uuid,uuid);

DO $c1_new_absent$
BEGIN
 IF to_regprocedure('schoolnet_private.parent_official_result_rows(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_results()') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_result(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_results()') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_result(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3C1_NEW_FUNCTION_ALREADY_EXISTS'; END IF;
END $c1_new_absent$;

DO $c1_legacy_still_hardened$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b89c4719c8b5b5fa427cf634328da45e','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','56a21d53edfc0dc8b5eb5addfe0e8a0c','s'),
  ('public.get_parent_child_homework_submissions(uuid)','deddc10f89c5f3d7623161440d7922e7','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_still_hardened$;

SELECT 'S4B3C1_PARENT_OFFICIAL_RESULTS_ROLLBACK_PASS' AS result;
