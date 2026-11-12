-- SCHOOLNET 5.C-B.2 / B.2 — SANDBOX UNIQUEMENT
-- Cible autorisee : onqlsvphmrqhelislpry (schoolnet-auth-sandbox).
-- NE JAMAIS executer sur le principal anttmbhaphkhmkoqsofd.
-- Deux tables PRIVEES pour simulations synthetiques : aucun auth.users,
-- aucun mot de passe / token / lien / email / evenement Auth reel.
-- Dans cette phase, aucune preuve n'est consideree comme "verifiee".

DO $guard$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL
    OR to_regclass('public.schoolnet_family_invitation_records') IS NOT NULL THEN
    RAISE EXCEPTION 'SCHOOLNET B2 - ARRET : schema principal detecte, sandbox requise';
  END IF;
  IF to_regnamespace('schoolnet_auth_sandbox') IS NOT NULL THEN
    RAISE EXCEPTION 'SCHOOLNET B2 - ARRET : schema sandbox deja present';
  END IF;
END;
$guard$;

CREATE SCHEMA schoolnet_auth_sandbox AUTHORIZATION postgres;
COMMENT ON SCHEMA schoolnet_auth_sandbox IS
  'SCHOOLNET B2 : schema prive reserve aux essais synthetiques. Ne contient aucune preuve Auth reelle.';

-- Aucune exposition du schema aux identites web / service_role.
REVOKE ALL ON SCHEMA schoolnet_auth_sandbox
  FROM PUBLIC, anon, authenticated, service_role, authenticator;

CREATE TABLE schoolnet_auth_sandbox.invitation_cases (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  recipient text NOT NULL CHECK (recipient IN ('parent', 'student')),
  generation_count integer NOT NULL CHECK (generation_count > 0),
  expected_auth_user_id uuid NOT NULL, -- UUID synthetique, PAS FK auth.users en B2
  case_status text NOT NULL DEFAULT 'prepared'
    CHECK (case_status IN ('prepared', 'sent_declared', 'requires_review')),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2_case_request_recipient_generation_uniq
    UNIQUE (request_id, recipient, generation_count),
  CONSTRAINT b2_case_identity_generation_uniq
    UNIQUE (case_id, generation_count, expected_auth_user_id)
);
COMMENT ON TABLE schoolnet_auth_sandbox.invitation_cases IS
  'Dossiers fictifs de B2 uniquement. Statut activated INTERDIT dans cette table.';

CREATE TABLE schoolnet_auth_sandbox.activation_evidence_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL,
  generation_count integer NOT NULL CHECK (generation_count > 0),
  expected_auth_user_id uuid NOT NULL,
  event_kind text NOT NULL
    CHECK (event_kind IN ('delivery_declared', 'password_changed', 'password_login')),
  source_kind text NOT NULL
    CHECK (source_kind IN (
      'synthetic_admin_declaration',
      'synthetic_password_change',
      'synthetic_password_login'
    )),
  source_event_ref text NOT NULL
    CHECK (source_event_ref ~ '^[A-Za-z0-9_-]{8,128}$'),
  occurred_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  synthetic_only boolean NOT NULL DEFAULT true CHECK (synthetic_only),
  proof_verified boolean NOT NULL DEFAULT false CHECK (NOT proof_verified),
  CONSTRAINT b2_event_source_kind_matches_event CHECK (
    (event_kind = 'delivery_declared' AND source_kind = 'synthetic_admin_declaration')
    OR (event_kind = 'password_changed' AND source_kind = 'synthetic_password_change')
    OR (event_kind = 'password_login' AND source_kind = 'synthetic_password_login')
  ),
  CONSTRAINT b2_event_clock_consistency CHECK (
    occurred_at <= observed_at + interval '2 minutes'
  ),
  CONSTRAINT b2_event_case_identity_fk FOREIGN KEY
    (case_id, generation_count, expected_auth_user_id)
    REFERENCES schoolnet_auth_sandbox.invitation_cases
      (case_id, generation_count, expected_auth_user_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT b2_event_source_unique UNIQUE (source_kind, source_event_ref),
  CONSTRAINT b2_event_case_kind_unique UNIQUE (case_id, generation_count, event_kind)
);
COMMENT ON TABLE schoolnet_auth_sandbox.activation_evidence_events IS
  'Journal append-only SYNTHETIQUE. proof_verified reste FALSE; aucune source Auth reelle.';

CREATE FUNCTION schoolnet_auth_sandbox.reject_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'SCHOOLNET B2 : journal de preuves append-only (UPDATE/DELETE interdits)';
END;
$fn$;

CREATE TRIGGER b2_evidence_append_only
BEFORE UPDATE OR DELETE
ON schoolnet_auth_sandbox.activation_evidence_events
FOR EACH ROW
EXECUTE FUNCTION schoolnet_auth_sandbox.reject_evidence_mutation();

-- Defense en profondeur : RLS forcee, aucune policy => refus pour roles
-- ordinaires meme si un GRANT accidental etait ajoute plus tard.
ALTER TABLE schoolnet_auth_sandbox.invitation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_auth_sandbox.invitation_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_auth_sandbox.activation_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_auth_sandbox.activation_evidence_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA schoolnet_auth_sandbox
  FROM PUBLIC, anon, authenticated, service_role, authenticator;
REVOKE ALL ON FUNCTION schoolnet_auth_sandbox.reject_evidence_mutation()
  FROM PUBLIC, anon, authenticated, service_role, authenticator;

-- Aucune GRANT, aucune policy de lecture, aucune fonction SECURITY DEFINER
-- et aucune fonction exposable dans public. Acces maintenance postgres seul.
