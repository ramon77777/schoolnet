-- SCHOOLNET / Lot 5.C-B.2 / Etape 2.C
-- SANDBOX UNIQUEMENT: onqlsvphmrqhelislpry.
-- Ne pas deployer sur le projet SCHOOLNET principal sans revue et migration separee.
-- Aucun compte Auth ne sera cree, modifie ou supprime par cette migration.
-- Aucune adresse e-mail ou mot de passe ne sera stocke dans cette table.
-- Le code scolaire en clair n'est JAMAIS stocke; seulement HMAC-SHA256 genere cote serveur.

CREATE SCHEMA schoolnet_student_private;
REVOKE ALL ON SCHEMA schoolnet_student_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA schoolnet_student_private TO service_role;

CREATE TABLE schoolnet_student_private.identities (
  student_auth_user_id UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  schoolnet_code_hmac TEXT NOT NULL,
  family_phone_e164 TEXT NOT NULL,
  login_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  CONSTRAINT schoolnet_student_code_hmac_unique UNIQUE (schoolnet_code_hmac),
  CONSTRAINT schoolnet_student_code_hmac_format_chk
    CHECK (schoolnet_code_hmac ~ '^[0-9a-f]{64}$'),
  CONSTRAINT schoolnet_student_family_phone_format_chk
    CHECK (family_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  CONSTRAINT schoolnet_student_login_status_chk
    CHECK (login_status IN ('pending', 'enabled', 'suspended', 'revoked')),
  CONSTRAINT schoolnet_student_login_status_dates_chk
    CHECK (
      (login_status = 'pending'
        AND activated_at IS NULL AND revoked_at IS NULL)
      OR (login_status IN ('enabled', 'suspended')
        AND activated_at IS NOT NULL AND revoked_at IS NULL)
      OR (login_status = 'revoked' AND revoked_at IS NOT NULL)
    ),
  CONSTRAINT schoolnet_student_timestamps_chk CHECK (updated_at >= created_at)
);

CREATE INDEX schoolnet_student_private_family_phone_idx
  ON schoolnet_student_private.identities (family_phone_e164);

-- Garde de coherence, executee sans elevation de privilege.
-- La preuve Auth et la revue administrative seront imposees par le backend
-- avant toute transition vers enabled. Cette migration ne les simule pas.
CREATE FUNCTION schoolnet_student_private.guard_identity_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $schoolnet_student_guard$
BEGIN
  IF ROW(NEW.student_auth_user_id, NEW.schoolnet_code_hmac, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.student_auth_user_id, OLD.schoolnet_code_hmac, OLD.created_at)
  THEN
    RAISE EXCEPTION 'L identite Auth, le code scolaire et la date de creation sont immuables'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.activated_at IS NOT NULL
     AND NEW.activated_at IS DISTINCT FROM OLD.activated_at
  THEN
    RAISE EXCEPTION 'La premiere activation ne peut pas etre remplacee'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.revoked_at IS NOT NULL
     AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
  THEN
    RAISE EXCEPTION 'La revocation est irreversible'
      USING ERRCODE = '23514';
  END IF;

  IF (OLD.login_status = 'pending'
        AND NEW.login_status NOT IN ('pending', 'enabled', 'revoked'))
     OR (OLD.login_status = 'enabled'
        AND NEW.login_status NOT IN ('enabled', 'suspended', 'revoked'))
     OR (OLD.login_status = 'suspended'
        AND NEW.login_status NOT IN ('suspended', 'enabled', 'revoked'))
     OR (OLD.login_status = 'revoked'
        AND NEW.login_status <> 'revoked')
  THEN
    RAISE EXCEPTION 'Transition de statut d identite non autorisee'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$schoolnet_student_guard$;

REVOKE ALL ON FUNCTION schoolnet_student_private.guard_identity_update()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION schoolnet_student_private.guard_identity_update()
  TO service_role;

CREATE TRIGGER schoolnet_student_private_guard_update
BEFORE UPDATE ON schoolnet_student_private.identities
FOR EACH ROW
EXECUTE FUNCTION schoolnet_student_private.guard_identity_update();

ALTER TABLE schoolnet_student_private.identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_student_private.identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_student_private.identities
  FROM PUBLIC, anon, authenticated, service_role;

-- Aucune autorisation DELETE. Les acces directs du navigateur sont interdits.
-- La future API devra avoir son propre controle applicatif et anti-brute-force.
GRANT SELECT, INSERT, UPDATE
  ON TABLE schoolnet_student_private.identities TO service_role;

COMMENT ON SCHEMA schoolnet_student_private IS
  'SCHOOLNET sandbox: identites d apprenants sans email, jamais exposees au navigateur.';
COMMENT ON TABLE schoolnet_student_private.identities IS
  'SANDBOX 2.C: correspondance Auth unique, HMAC du code unique, telephone familial partageable. Aucun compte ne sera ajoute ici sans etape serveur ulterieure.';
COMMENT ON COLUMN schoolnet_student_private.identities.schoolnet_code_hmac IS
  'HMAC-SHA256 hexadecimal du code SN-XXXX-XXXX-XXXX, calcule avec un secret serveur distinct de la base; jamais le code en clair.';
COMMENT ON COLUMN schoolnet_student_private.identities.family_phone_e164 IS
  'Telephone familial E.164; non utilise dans auth.users.phone de l apprenant.';
COMMENT ON COLUMN schoolnet_student_private.identities.login_status IS
  'pending par defaut: aucune activation Auth implicite; enabled exige une validation backend future.';
