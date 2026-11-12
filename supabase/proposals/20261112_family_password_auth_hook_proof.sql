-- SCHOOLNET / Lot 5.C-B.2: preuve de premiere connexion par mot de passe.
-- PROPOSITION NON APPLIQUEE PAR LA SEULE PUBLICATION GITHUB.
-- Cible future EXCLUSIVE apres recette: anttmbhaphkhmkoqsofd.
-- La fonction Auth Hook DOIT ensuite etre selectionnee manuellement dans
-- Authentication > Auth Hooks (aucune configuration Auth par ce SQL).
-- Ne jamais installer ce script dans schoolnet-auth-sandbox: schema distinct.

DO $preflight$
BEGIN
  IF to_regclass('public.schoolnet_family_invitation_records') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.public_enrollment_requests') IS NULL
     OR to_regnamespace('schoolnet_family_auth_proof') IS NOT NULL
  THEN
    RAISE EXCEPTION 'SCHOOLNET: schéma principal ou etat de migration inattendu.';
  END IF;
END;
$preflight$;

CREATE SCHEMA schoolnet_family_auth_proof AUTHORIZATION postgres;
COMMENT ON SCHEMA schoolnet_family_auth_proof IS
  'Observations Auth avant émission de JWT pour invitations SCHOOLNET; pas une preuve d activation seules.';

REVOKE ALL ON SCHEMA schoolnet_family_auth_proof
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT USAGE ON SCHEMA schoolnet_family_auth_proof TO supabase_auth_admin;

CREATE TABLE schoolnet_family_auth_proof.token_issue_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  authentication_method text NOT NULL CHECK
    (authentication_method IN ('password','recovery','token_refresh','invite','magiclink','otp')),
  state text NOT NULL DEFAULT 'token_pre_issue_unverified'
    CHECK (state = 'token_pre_issue_unverified'),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT schoolnet_family_token_issue_unique UNIQUE
    (user_id,session_id,authentication_method)
);
COMMENT ON TABLE schoolnet_family_auth_proof.token_issue_observations IS
  'Jetons non stockés. Une observation est pré-émission; valider ensuite auth.sessions avant toute activation.';

ALTER TABLE schoolnet_family_auth_proof.token_issue_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_family_auth_proof.token_issue_observations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_family_auth_proof.token_issue_observations
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT INSERT ON schoolnet_family_auth_proof.token_issue_observations TO supabase_auth_admin;

CREATE POLICY schoolnet_family_token_insert_auth
ON schoolnet_family_auth_proof.token_issue_observations
FOR INSERT TO supabase_auth_admin
WITH CHECK (
  state = 'token_pre_issue_unverified'
  AND authentication_method IN ('password','recovery','token_refresh','invite','magiclink','otp')
);

CREATE FUNCTION schoolnet_family_auth_proof.reject_token_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $reject$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SCHOOLNET: journal Auth append-only.';
END;
$reject$;

CREATE TRIGGER schoolnet_family_token_append_only_trg
BEFORE UPDATE OR DELETE
ON schoolnet_family_auth_proof.token_issue_observations
FOR EACH ROW EXECUTE FUNCTION schoolnet_family_auth_proof.reject_token_mutation();

REVOKE ALL ON FUNCTION schoolnet_family_auth_proof.reject_token_mutation()
  FROM PUBLIC, anon, authenticated, service_role, authenticator;

-- Auth Hook Free : retourne absolument chaque claim reçue SANS modification.
-- SECURITY INVOKER avec seul droit INSERT; pas d elevation de privilege.
CREATE FUNCTION schoolnet_family_auth_proof.observe_family_access_token(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $hook$
DECLARE
  auth_user_id uuid;
  auth_session_id uuid;
  auth_method text;
  violated_constraint text;
BEGIN
  IF event IS NULL OR pg_catalog.jsonb_typeof(event->'claims') IS DISTINCT FROM 'object'
     OR event->'claims'->'app_metadata'->>'schoolnet_family_invitation'
       IS DISTINCT FROM 'true'
  THEN
    RETURN event;
  END IF;

  auth_method := event->>'authentication_method';
  IF auth_method IS NULL OR auth_method NOT IN
    ('password','recovery','token_refresh','invite','magiclink','otp')
  THEN
    RETURN event;
  END IF;

  BEGIN
    auth_user_id := (event->>'user_id')::uuid;
    auth_session_id := (event->'claims'->>'session_id')::uuid;
    IF auth_user_id IS NULL OR auth_session_id IS NULL
       OR event->'claims'->>'sub' IS DISTINCT FROM auth_user_id::text
    THEN
      RETURN event;
    END IF;

    BEGIN
      INSERT INTO schoolnet_family_auth_proof.token_issue_observations
        (user_id,session_id,authentication_method)
      VALUES (auth_user_id,auth_session_id,auth_method);
    EXCEPTION WHEN unique_violation THEN
      -- Aucun ON CONFLICT: le rôle Auth ne reçoit aucun SELECT sur l'arbitre.
      GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
      IF violated_constraint IS DISTINCT FROM 'schoolnet_family_token_issue_unique' THEN
        RAISE;
      END IF;
    END;

  EXCEPTION WHEN OTHERS THEN
    -- Fail-open pour l'authentification. Ne jamais déduire une activation
    -- de l'absence d'erreur de la fonction Auth Hook.
    NULL;
  END;

  RETURN event;
END;
$hook$;

REVOKE ALL ON FUNCTION schoolnet_family_auth_proof.observe_family_access_token(jsonb)
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
GRANT EXECUTE ON FUNCTION schoolnet_family_auth_proof.observe_family_access_token(jsonb)
  TO supabase_auth_admin;

-- Fonction RPC consultable uniquement par le service-role côté Edge.
-- Elle ne retourne QUE bool; aucune donnée Auth/jeton accessible à un client.
-- Borne au compte, à la génération envoyée et à une session Auth persistée.
CREATE FUNCTION public.schoolnet_family_password_session_proof(
  p_user_id uuid,
  p_after timestamptz
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $verify$
  SELECT CASE WHEN p_user_id IS NULL OR p_after IS NULL
         OR p_after > pg_catalog.now()
         OR p_after < pg_catalog.now() - INTERVAL '90 days'
         THEN false
         ELSE EXISTS (
           SELECT 1
           FROM schoolnet_family_auth_proof.token_issue_observations o
           JOIN auth.sessions s ON s.id=o.session_id AND s.user_id=o.user_id
           JOIN auth.users u ON u.id=o.user_id
           WHERE o.user_id=p_user_id
             AND o.authentication_method='password'
             AND o.state='token_pre_issue_unverified'
             AND o.observed_at >= p_after
             AND s.created_at >= p_after
             AND u.email_confirmed_at IS NOT NULL
             AND u.encrypted_password IS NOT NULL
             AND u.encrypted_password <> ''
             AND u.raw_app_meta_data->>'schoolnet_family_invitation'='true'
         ) END
$verify$;

REVOKE ALL ON FUNCTION public.schoolnet_family_password_session_proof(uuid,timestamptz)
  FROM PUBLIC, anon, authenticated, authenticator, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.schoolnet_family_password_session_proof(uuid,timestamptz)
  TO service_role;

-- Pas de configuration des hooks Auth ici.
-- Ne jamais marquer activated sans sent_declared puis preuve SQL positive.
