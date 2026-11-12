-- SCHOOLNET B.5.1 : TEST TRANSACTIONNEL SUR SANDBOX UNIQUEMENT.
-- Target : onqlsvphmrqhelislpry ; interdit : anttmbhaphkhmkoqsofd.
-- Execution apres installation B.5.1. ROLLBACK final OBLIGATOIRE.
BEGIN;

DO $guard$
BEGIN
 IF to_regclass('public.profiles') IS NOT NULL
    OR to_regclass('schoolnet_auth_observation.token_issue_events') IS NULL
    OR (SELECT count(*) FROM auth.users) <> 2 THEN
    RAISE EXCEPTION 'B5.1 test: mauvais environnement';
 END IF;
 IF (SELECT count(*) FROM schoolnet_auth_observation.token_issue_events) <> 0 THEN
    RAISE EXCEPTION 'B5.1 test: journal non vide avant recette';
 END IF;
 IF has_schema_privilege('anon','schoolnet_auth_observation','USAGE')
    OR has_schema_privilege('authenticated','schoolnet_auth_observation','USAGE')
    OR has_schema_privilege('service_role','schoolnet_auth_observation','USAGE')
    OR has_table_privilege('anon','schoolnet_auth_observation.token_issue_events','INSERT')
    OR has_table_privilege('authenticated','schoolnet_auth_observation.token_issue_events','SELECT')
    OR has_table_privilege('service_role','schoolnet_auth_observation.token_issue_events','SELECT')
    OR has_function_privilege('anon','schoolnet_auth_observation.observe_access_token(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','schoolnet_auth_observation.observe_access_token(jsonb)','EXECUTE')
    OR has_function_privilege('service_role','schoolnet_auth_observation.observe_access_token(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'B5.1 test: fuite de privilege vers role utilisateur';
 END IF;
 IF NOT has_schema_privilege('supabase_auth_admin','schoolnet_auth_observation','USAGE')
    OR NOT has_table_privilege('supabase_auth_admin','schoolnet_auth_observation.token_issue_events','INSERT')
    OR NOT has_function_privilege('supabase_auth_admin','schoolnet_auth_observation.observe_access_token(jsonb)','EXECUTE')
    OR has_table_privilege('supabase_auth_admin','schoolnet_auth_observation.token_issue_events','SELECT')
    OR NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='schoolnet_auth_observation'
        AND tablename='token_issue_events'
        AND policyname='b51_auth_admin_insert_observation'
        AND cmd='INSERT'
        AND 'supabase_auth_admin'=ANY(roles)
    )
 THEN
    RAISE EXCEPTION 'B5.1 test: privileges auth admin incorrects';
 END IF;
END;
$guard$;

-- Le connecteur SQL ne permet pas SET ROLE supabase_auth_admin (42501).
-- On controle donc les GRANT, la RLS et la policy dans pg_catalog et
-- on simule la fonction en tant que postgres DANS UNE TRANSACTION ANNULEE.
-- Ne PAS attribuer supabase_auth_admin a postgres pour contourner le refus.
-- Le test effectif de l'invocation par Supabase Auth reste a effectuer
-- apres configuration du hook via Authentication > Hooks et GO distinct.
DO $role$
DECLARE
  first_event jsonb;
  e jsonb;
  result_event jsonb;
  base_claims jsonb :=
    jsonb_build_object(
      'sub','b5100000-0000-4000-8000-000000000001',
      'session_id','b5100000-0000-4000-8000-000000000002',
      'app_metadata',jsonb_build_object('schoolnet_sandbox',true),
      'iss','sandbox-issuer-only-for-test', 'aud','authenticated',
      'role','authenticated','exp',1900000000,'iat',1899999000,
      'aal','aal1','is_anonymous',false,'email','synthetic@example.test',
      'phone',null
    );
BEGIN
  FOREACH e IN ARRAY ARRAY[
    jsonb_build_object('user_id','b5100000-0000-4000-8000-000000000001','claims',base_claims,'authentication_method','password'),
    jsonb_build_object('user_id','b5100000-0000-4000-8000-000000000001','claims',base_claims,'authentication_method','recovery'),
    jsonb_build_object('user_id','b5100000-0000-4000-8000-000000000001','claims',base_claims,'authentication_method','token_refresh')
  ] LOOP
    result_event := schoolnet_auth_observation.observe_access_token(e);
    IF result_event IS DISTINCT FROM e
      OR result_event->'claims' IS DISTINCT FROM e->'claims' THEN
      RAISE EXCEPTION 'B5.1: claims modifies pour method %', e->>'authentication_method';
    END IF;
  END LOOP;

  -- Appel repete : deduplication, claims inchanges.
  first_event := jsonb_build_object('user_id','b5100000-0000-4000-8000-000000000001','claims',base_claims,'authentication_method','password');
  IF schoolnet_auth_observation.observe_access_token(first_event) IS DISTINCT FROM first_event THEN
    RAISE EXCEPTION 'B5.1: duplication a modifie le token';
  END IF;

  -- Compte non marque sandbox : aucun evenement.
  e := jsonb_build_object(
    'user_id','b5100000-0000-4000-8000-000000000001',
    'claims',jsonb_set(base_claims,'{app_metadata}', '{"schoolnet_sandbox":false}'::jsonb),
    'authentication_method','password'
  );
  IF schoolnet_auth_observation.observe_access_token(e) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'B5.1: evenement hors sandbox modifie';
  END IF;

  -- Methode inconnue : pas de preuve et pass-through.
  e := first_event || '{"authentication_method":"unknown_method"}'::jsonb;
  IF schoolnet_auth_observation.observe_access_token(e) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'B5.1: methode inconnue modifiee';
  END IF;

  -- Identite non correlable : aucune panne Auth.
  e := first_event || '{"user_id":"not-a-uuid"}'::jsonb;
  IF schoolnet_auth_observation.observe_access_token(e) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'B5.1: faux id a provoque une erreur';
  END IF;

  -- Donnees invalides : aucun acces, aucun effet.
  e := '{"claims":{"app_metadata":{"schoolnet_sandbox":true}},"authentication_method":"password"}'::jsonb;
  IF schoolnet_auth_observation.observe_access_token(e) IS DISTINCT FROM e THEN
    RAISE EXCEPTION 'B5.1: claims invalides ont provoque une erreur';
  END IF;
  RAISE NOTICE 'B5.1: simulation owner, claims inchanges, modes et exclusions OK';
END;
$role$;

DO $owner$
DECLARE
 n bigint;
 first_id uuid;
BEGIN
  SELECT count(*) INTO n FROM schoolnet_auth_observation.token_issue_events;
  IF n <> 3 THEN
    RAISE EXCEPTION 'B5.1: 3 observations attendues, obtenu %', n;
  END IF;

  IF (SELECT count(*) FROM schoolnet_auth_observation.token_issue_events
       WHERE observation_state = 'token_pre_issue_unverified'
         AND source = 'supabase_custom_access_token_hook' AND synthetic_only) <> 3 THEN
    RAISE EXCEPTION 'B5.1: une observation a ete presentee comme preuve';
  END IF;

  SELECT event_id INTO first_id FROM schoolnet_auth_observation.token_issue_events LIMIT 1;
  BEGIN
    UPDATE schoolnet_auth_observation.token_issue_events
       SET authentication_method='password' WHERE event_id=first_id;
    RAISE EXCEPTION 'B5.1: UPDATE append-only accepte';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  BEGIN
    DELETE FROM schoolnet_auth_observation.token_issue_events WHERE event_id=first_id;
    RAISE EXCEPTION 'B5.1: DELETE append-only accepte';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;

  RAISE NOTICE 'B5.1: 3 candidats non verifies, aucun doublon, immutabilite OK; ROLLBACK';
END;
$owner$;

ROLLBACK;
