-- SCHOOLNET C.1 - POSTFLIGHT CIBLE, LECTURE SEULE.
-- Source approuvee : commit 289a8aa05be1d1d69fecbaea0e21f414983d322d.
-- Execute seulement APRES installation par l'operateur autorise.
-- Aucun sujet Auth reel utilise : claims vides et arguments NULL uniquement.
-- Le fingerprint B.0 final doit etre compare a la capture preinstallation.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';

DO $c1_legacy_after$
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
END $c1_legacy_after$;

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

-- Controle exact des beneficiaires des nouvelles ACL, sans privilege supplementaire.
DO $c1_postflight_new_acl$
DECLARE e record; p record; acl_count integer; unexpected_count integer;
BEGIN
 FOR e IN SELECT * FROM (VALUES
  ('schoolnet_private.parent_official_result_rows(uuid,uuid)',false),
  ('schoolnet_private.parent_official_results()',true),
  ('schoolnet_private.parent_official_result(uuid,uuid)',true),
  ('public.schoolnet_parent_official_results()',true),
  ('public.schoolnet_parent_official_result(uuid,uuid)',true)
 ) expected(signature,authenticated_execute)
 LOOP
  SELECT proowner,proacl INTO p FROM pg_proc WHERE oid=to_regprocedure(e.signature);
  SELECT count(*),count(*) FILTER (WHERE
   privilege_type<>'EXECUTE' OR is_grantable
   OR grantor<>p.proowner
   OR (grantee<>p.proowner AND
    (NOT e.authenticated_execute OR grantee<>'authenticated'::regrole::oid)))
  INTO acl_count,unexpected_count
  FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)));
  IF unexpected_count<>0
   OR acl_count<>(CASE WHEN e.authenticated_execute THEN 2 ELSE 1 END)
  THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_UNEXPECTED_ACL: %',e.signature; END IF;
 END LOOP;
END $c1_postflight_new_acl$;

DO $c1_postflight_b0$
DECLARE expected record; actual record;
BEGIN
 IF (SELECT count(*) FROM pg_policies
  WHERE schemaname='public' AND policyname LIKE 's4b3b0_%')<>8
 THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_B0_COUNT'; END IF;
 FOR expected IN SELECT * FROM (VALUES
  ('assessments','s4b3b0_assessment_catalog_guard','SELECT'),
  ('quiz_questions','s4b3b0_questions_guard','SELECT'),
  ('quiz_choices','s4b3b0_correct_choices_guard','SELECT'),
  ('assessment_submissions','s4b3b0_online_submissions_guard','ALL'),
  ('homework_submissions','s4b3b0_homework_submissions_guard','ALL'),
  ('submissions','s4b3b0_legacy_submissions_guard','ALL'),
  ('submission_answers','s4b3b0_submission_answers_guard','ALL'),
  ('submission_question_grades','s4b3b0_question_grades_guard','ALL')
 ) e(table_name,policy_name,command)
 LOOP
  SELECT policy.*,c.relrowsecurity INTO actual
  FROM pg_policies policy
  JOIN pg_namespace n ON n.nspname=policy.schemaname
  JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=policy.tablename
  WHERE policy.schemaname='public'
   AND policy.tablename=expected.table_name
   AND policy.policyname=expected.policy_name;
  IF NOT FOUND
   OR actual.permissive IS DISTINCT FROM 'RESTRICTIVE'
   OR actual.cmd IS DISTINCT FROM expected.command
   OR actual.roles::text[] IS DISTINCT FROM ARRAY['authenticated']::text[]
   OR actual.relrowsecurity IS DISTINCT FROM true
   OR actual.qual IS NULL
   OR (expected.command='ALL' AND actual.with_check IS NULL)
  THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_B0_POLICY: %',expected.policy_name; END IF;
 END LOOP;
END $c1_postflight_b0$;

-- Retirer tout contexte JWT pour les essais negatifs ; aucune impersonation.
SET LOCAL "request.jwt.claim.sub"='';
SET LOCAL "request.jwt.claims"='{}';
SET LOCAL ROLE authenticated;
DO $c1_postflight_no_subject$
DECLARE refused boolean;
BEGIN
 IF auth.uid() IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_UNEXPECTED_AUTH_SUBJECT'; END IF;
 refused:=false;
 BEGIN
  PERFORM public.schoolnet_parent_official_results();
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'S4B3C1_ACCESS_DENIED' THEN RAISE; END IF;
  refused:=true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_LIST_ACCEPTED_NO_SUBJECT'; END IF;
 refused:=false;
 BEGIN
  PERFORM public.schoolnet_parent_official_result(NULL,NULL);
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM<>'S4B3C1_ACCESS_DENIED' THEN RAISE; END IF;
  refused:=true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_DETAIL_ACCEPTED_NO_SUBJECT'; END IF;
END $c1_postflight_no_subject$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $c1_postflight_anon$
DECLARE refused boolean;
BEGIN
 refused:=false;
 BEGIN
  PERFORM public.schoolnet_parent_official_results();
 EXCEPTION WHEN insufficient_privilege THEN refused:=true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_ANON_LIST_ACCEPTED'; END IF;
 refused:=false;
 BEGIN
  PERFORM public.schoolnet_parent_official_result(NULL,NULL);
 EXCEPTION WHEN insufficient_privilege THEN refused:=true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'S4B3C1_POSTFLIGHT_ANON_DETAIL_ACCEPTED'; END IF;
END $c1_postflight_anon$;
RESET ROLE;

-- Une seule synthese finale ; seulement metadonnees, aucune note/famille reelle.
SELECT jsonb_build_object(
 'result','S4B3C1_POSTFLIGHT_READONLY_PASS',
 'transactionReadOnly',current_setting('transaction_read_only'),
 'noSubjectAndAnonDenied',true,
 'functions',(
  SELECT jsonb_agg(jsonb_build_object(
   'signature',e.signature,'bodyMd5',md5(p.prosrc),
   'definitionMd5',md5(pg_get_functiondef(p.oid)),
   'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
   'volatility',p.provolatile::text,'config',p.proconfig,'acl',p.proacl::text
  ) ORDER BY e.signature)
  FROM (VALUES
   ('schoolnet_private.parent_official_result_rows(uuid,uuid)'),
   ('schoolnet_private.parent_official_results()'),
   ('schoolnet_private.parent_official_result(uuid,uuid)'),
   ('public.schoolnet_parent_official_results()'),
   ('public.schoolnet_parent_official_result(uuid,uuid)'),
   ('public.get_parent_child_assessment_detail(uuid,uuid)'),
   ('public.get_parent_child_assessment_submissions(uuid)'),
   ('public.get_parent_child_homework_submissions(uuid)')
  ) e(signature)
  JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 ),
 'b0PolicyCount',8,
 'b0PolicyFingerprint',(
  SELECT md5(COALESCE(jsonb_agg(to_jsonb(p)
   ORDER BY schemaname,tablename,policyname)::text,'[]'))
  FROM pg_policies p
  WHERE schemaname='public' AND policyname LIKE 's4b3b0_%'
 )
) AS postflight;
ROLLBACK;
