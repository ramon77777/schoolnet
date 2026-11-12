-- SCHOOLNET 5.C-B.2 / B.5.2 — CORRECTION CIBLEE SANDBOX UNIQUEMENT
-- CIBLE : onqlsvphmrqhelislpry / schoolnet-auth-sandbox.
-- NE JAMAIS APPLIQUER AU PRINCIPAL : anttmbhaphkhmkoqsofd.
-- Correction uniquement du hook actif ; aucun GRANT, aucune RLS, aucun Auth user.

DO $guard$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     OR to_regclass('public.schoolnet_family_invitation_records') IS NOT NULL
     OR to_regclass('schoolnet_auth_observation.token_issue_events') IS NULL
     OR (SELECT count(*) FROM auth.users) <> 2
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='schoolnet_auth_observation'
         AND p.proname='observe_access_token'
         AND pg_get_functiondef(p.oid) LIKE '%ON CONFLICT ON CONSTRAINT b51_unique_user_session_method DO NOTHING%'
     ) THEN
    RAISE EXCEPTION 'SCHOOLNET B5.2 : environment ou version source inattendus';
  END IF;
  IF NOT has_function_privilege('supabase_auth_admin',
      'schoolnet_auth_observation.observe_access_token(jsonb)','EXECUTE')
     OR NOT has_table_privilege('supabase_auth_admin',
      'schoolnet_auth_observation.token_issue_events','INSERT')
     OR has_table_privilege('supabase_auth_admin',
      'schoolnet_auth_observation.token_issue_events','SELECT')
  THEN
    RAISE EXCEPTION 'SCHOOLNET B5.2 : privileges du hook inattendus';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION schoolnet_auth_observation.observe_access_token(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $hook$
DECLARE
  method_name text;
  auth_user_id uuid;
  auth_session_id uuid;
  violated_constraint text;
BEGIN
  IF event IS NULL OR jsonb_typeof(event->'claims') IS DISTINCT FROM 'object'
     OR event->'claims'->'app_metadata'->>'schoolnet_sandbox' IS DISTINCT FROM 'true'
  THEN
    RETURN event;
  END IF;

  method_name := event->>'authentication_method';
  IF method_name IS NULL OR method_name NOT IN
    ('password', 'recovery', 'token_refresh', 'magiclink', 'otp', 'invite') THEN
    RETURN event;
  END IF;

  -- Le role n'est autorise qu'a inserer un evenement de pre-emission.
  -- Aucune preuve n'est marquee verifiee ; aucun profil, lien ni Auth modifie.
  BEGIN
    auth_user_id := (event->>'user_id')::uuid;
    auth_session_id := (event->'claims'->>'session_id')::uuid;

    IF auth_user_id IS NULL OR auth_session_id IS NULL
       OR event->'claims'->>'sub' IS DISTINCT FROM auth_user_id::text
    THEN
      RETURN event;
    END IF;

    -- Insert-only : ON CONFLICT avec arbitre requiert des droits SELECT
    -- sur les colonnes de la contrainte ; supabase_auth_admin n'en a pas.
    -- Une exception d'unicite isolee conserve le refus de doublons
    -- sans elargir les droits de lecture du journal.
    BEGIN
      INSERT INTO schoolnet_auth_observation.token_issue_events
        (user_id, session_id, authentication_method)
      VALUES (auth_user_id, auth_session_id, method_name);
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
      IF violated_constraint IS DISTINCT FROM 'b51_unique_user_session_method' THEN
        RAISE;
      END IF;
    END;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open pour la connexion : si observation indisponible, aucune
    -- observation enregistree mais le JWT original reste inchangé.
    -- Ne jamais utiliser cette table comme une preuve suffisante d'activation.
    NULL;
  END;

  RETURN event;
END;
$hook$;

-- Aucun changement de grants, de RLS, de la table, de comptes
-- ou du statut de la fonction dans Authentication > Hooks.
