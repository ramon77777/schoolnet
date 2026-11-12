-- SCHOOLNET — Lot 5.C-B.2 / B.5.1 — UNIQUEMENT SUR SANDBOX
-- Cible explicitement autorisee : onqlsvphmrqhelislpry (schoolnet-auth-sandbox).
-- INTERDIT sur le principal : anttmbhaphkhmkoqsofd.
-- Custom Access Token Hook : OBSERVATION UNIQUEMENT, pas d'activation.
-- L'installation SQL ne l'active PAS dans Authentication > Hooks.
-- Ne pas placer ce SQL dans supabase/migrations du produit principal.

DO $guard$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
     OR to_regclass('public.schoolnet_family_invitation_records') IS NOT NULL
     OR to_regnamespace('schoolnet_auth_sandbox') IS NULL
     OR to_regnamespace('schoolnet_auth_observation') IS NOT NULL
     OR (SELECT count(*) FROM auth.users) <> 2 THEN
    RAISE EXCEPTION 'SCHOOLNET B.5.1 : cible inattendue, abandon de la migration';
  END IF;
END;
$guard$;

CREATE SCHEMA schoolnet_auth_observation AUTHORIZATION postgres;
COMMENT ON SCHEMA schoolnet_auth_observation IS
  'SCHOOLNET B.5.1 sandbox : observation candidates seulement, jamais des preuves d activation.';

REVOKE ALL ON SCHEMA schoolnet_auth_observation
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA schoolnet_auth_observation TO supabase_auth_admin;

CREATE TABLE schoolnet_auth_observation.token_issue_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  authentication_method text NOT NULL
    CHECK (authentication_method IN
      ('password', 'recovery', 'token_refresh', 'magiclink', 'otp', 'invite')),
  source text NOT NULL DEFAULT 'supabase_custom_access_token_hook'
    CHECK (source = 'supabase_custom_access_token_hook'),
  observation_state text NOT NULL DEFAULT 'token_pre_issue_unverified'
    CHECK (observation_state = 'token_pre_issue_unverified'),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT b51_unique_user_session_method
    UNIQUE (user_id, session_id, authentication_method)
);
COMMENT ON TABLE schoolnet_auth_observation.token_issue_events IS
  'Observations de PRE-EMISSION des tokens Auth fictifs uniquement. '
  'Ne prouve ni connexion achevee, ni changement de mot de passe, ni activation.';

ALTER TABLE schoolnet_auth_observation.token_issue_events
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_auth_observation.token_issue_events
  FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_auth_observation.token_issue_events
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT INSERT ON TABLE schoolnet_auth_observation.token_issue_events
  TO supabase_auth_admin;

CREATE POLICY b51_auth_admin_insert_observation
ON schoolnet_auth_observation.token_issue_events
AS PERMISSIVE FOR INSERT TO supabase_auth_admin
WITH CHECK (
  synthetic_only
  AND source = 'supabase_custom_access_token_hook'
  AND observation_state = 'token_pre_issue_unverified'
);

CREATE FUNCTION schoolnet_auth_observation.reject_observation_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $guard$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'SCHOOLNET B.5.1 : journal d observation append-only';
END;
$guard$;

CREATE TRIGGER b51_observation_append_only
BEFORE UPDATE OR DELETE ON schoolnet_auth_observation.token_issue_events
FOR EACH ROW EXECUTE FUNCTION schoolnet_auth_observation.reject_observation_mutation();

-- Fonction destinee a etre selectionnee PLUS TARD dans Authentication > Hooks.
-- SECURITE : se contente de retourner exactement l'evenement recu.
-- Tout probleme de collecte est absorbe, jamais de succes Auth invente.
-- Aucune requete depuis le navigateur ; seuls les hooks Auth Supabase
-- utilisent normalement le role supabase_auth_admin.
CREATE FUNCTION schoolnet_auth_observation.observe_access_token(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $hook$
DECLARE
  method_name text;
  auth_user_id uuid;
  auth_session_id uuid;
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

    INSERT INTO schoolnet_auth_observation.token_issue_events
      (user_id, session_id, authentication_method)
    VALUES (auth_user_id, auth_session_id, method_name)
    ON CONFLICT ON CONSTRAINT b51_unique_user_session_method DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open pour la connexion : si observation indisponible, aucune
    -- observation enregistree mais le JWT original reste inchangé.
    -- Ne jamais utiliser cette table comme une preuve suffisante d'activation.
    NULL;
  END;

  RETURN event;
END;
$hook$;

REVOKE ALL ON FUNCTION schoolnet_auth_observation.observe_access_token(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION schoolnet_auth_observation.observe_access_token(jsonb)
  TO supabase_auth_admin;

REVOKE ALL ON FUNCTION schoolnet_auth_observation.reject_observation_mutation()
  FROM PUBLIC, anon, authenticated, service_role, authenticator;

-- Ne PAS installer de hook sur le projet principal.
-- La configuration Authentication > Hooks reste INCHANGEE par ce SQL.
-- Aucune activation metier (activated), aucune preuve definitive (verified).
