-- SCHOOLNET 2.0 / Lot 5.C-B.2
-- BROUILLON DE MIGRATION : NE PAS EXECUTER DE MANIERE DURABLE.
-- Test autorise UNIQUEMENT via BEGIN; (SQL ci-dessous); ROLLBACK;
-- La migration definitive sera generee avec Supabase CLI APRES approbation.
-- Aucun appel a Auth admin ni envoi d'e-mail dans ce script.
--
-- Registre des preparations de comptes Parent / Apprenant. Jamais de liens,
-- tokens, mots de passe ou codes d'activation persistants dans cette table.

CREATE TABLE public.schoolnet_family_invitation_records (
  request_id UUID NOT NULL
    REFERENCES public.public_enrollment_requests(id) ON DELETE RESTRICT,
  recipient TEXT NOT NULL,
  expected_role TEXT NOT NULL,
  email TEXT NOT NULL,
  user_id UUID
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  verification_note TEXT NOT NULL,
  prepared_by UUID NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'preparing',
  generation_count INTEGER NOT NULL DEFAULT 0,
  first_prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_prepared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_declared_at TIMESTAMPTZ,
  sent_declared_by UUID
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_action_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recovery_note TEXT,
  last_error_code TEXT,

  CONSTRAINT schoolnet_family_invitation_records_pkey
    PRIMARY KEY (request_id, recipient),

  CONSTRAINT schoolnet_family_invitation_recipient_chk
    CHECK (recipient IN ('parent', 'student')),

  CONSTRAINT schoolnet_family_invitation_role_chk
    CHECK ((recipient = 'parent' AND expected_role = 'parent')
       OR (recipient = 'student' AND expected_role = 'student')),

  CONSTRAINT schoolnet_family_invitation_email_chk
    CHECK (
      email = lower(btrim(email))
      AND char_length(email) BETWEEN 5 AND 254
      AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),

  CONSTRAINT schoolnet_family_invitation_note_chk
    CHECK (char_length(btrim(verification_note)) BETWEEN 10 AND 1000),

  CONSTRAINT schoolnet_family_invitation_status_chk
    CHECK (status IN (
      'preparing', 'auth_created', 'profile_ready', 'renewing',
      'prepared', 'sent_declared', 'activated', 'requires_review'
    )),

  CONSTRAINT schoolnet_family_invitation_count_chk
    CHECK (generation_count BETWEEN 0 AND 5),

  CONSTRAINT schoolnet_family_invitation_prepared_chk
    CHECK (
      (status IN ('preparing', 'requires_review') OR user_id IS NOT NULL)
      AND (status NOT IN ('prepared', 'sent_declared', 'activated')
        OR (user_id IS NOT NULL AND generation_count >= 1))
    ),

  CONSTRAINT schoolnet_family_invitation_recovery_note_chk
    CHECK (recovery_note IS NULL
      OR char_length(btrim(recovery_note)) BETWEEN 10 AND 1000),

  CONSTRAINT schoolnet_family_invitation_error_code_chk
    CHECK (last_error_code IS NULL
      OR last_error_code ~ '^[A-Z0-9_]{3,72}$'),

  CONSTRAINT schoolnet_family_invitation_sent_chk
    CHECK (
      (sent_declared_at IS NULL AND sent_declared_by IS NULL)
      OR (sent_declared_at IS NOT NULL AND sent_declared_by IS NOT NULL)
    ),

  CONSTRAINT schoolnet_family_invitation_sent_status_chk
    CHECK (
      status <> 'sent_declared'
      OR sent_declared_at IS NOT NULL
    ),

  CONSTRAINT schoolnet_family_invitation_dates_chk
    CHECK (
      last_prepared_at >= first_prepared_at
      AND updated_at >= created_at
    )
);

-- L'unicite sur l'e-mail evite qu'une meme personne soit reservee
-- en parallele dans deux demandes differentes. Les comptes existants
-- doivent etre reutilises apres verification, jamais crees de nouveau.
CREATE UNIQUE INDEX schoolnet_family_invitation_email_uidx
  ON public.schoolnet_family_invitation_records (lower(email));

CREATE INDEX schoolnet_family_invitation_status_idx
  ON public.schoolnet_family_invitation_records (status, last_prepared_at DESC);

CREATE INDEX schoolnet_family_invitation_user_idx
  ON public.schoolnet_family_invitation_records (user_id)
  WHERE user_id IS NOT NULL;

-- Fonction trigger non privilegiee. Aucune RPC SECURITY DEFINER creee.
CREATE FUNCTION public.schoolnet_family_invitation_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $schoolnet_guard$
BEGIN
  IF ROW(NEW.request_id, NEW.recipient, NEW.expected_role, NEW.email, NEW.prepared_by, NEW.created_at, NEW.first_prepared_at)
    IS DISTINCT FROM
    ROW(OLD.request_id, OLD.recipient, OLD.expected_role, OLD.email, OLD.prepared_by, OLD.created_at, OLD.first_prepared_at)
  THEN
    RAISE EXCEPTION 'L''identite de la reservation est immuable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Le compte Auth lie ne peut pas etre remplace'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.generation_count < OLD.generation_count THEN
    RAISE EXCEPTION 'Le nombre de generations ne peut pas diminuer'
      USING ERRCODE = '23514';
  END IF;

  IF (
    (OLD.status = 'preparing'
      AND NEW.status NOT IN ('preparing', 'auth_created', 'requires_review'))
    OR
    (OLD.status = 'auth_created'
      AND NEW.status NOT IN ('auth_created', 'profile_ready', 'renewing', 'requires_review'))
    OR
    (OLD.status = 'profile_ready'
      AND NEW.status NOT IN ('profile_ready', 'prepared', 'renewing', 'requires_review'))
    OR
    (OLD.status = 'renewing'
      AND NEW.status NOT IN ('renewing', 'prepared', 'requires_review'))
    OR
    (OLD.status = 'prepared'
      AND NEW.status NOT IN ('prepared', 'renewing', 'sent_declared', 'activated', 'requires_review'))
    OR
    (OLD.status = 'sent_declared'
      AND NEW.status NOT IN ('sent_declared', 'renewing', 'activated', 'requires_review'))
    OR
    (OLD.status = 'activated'
      AND NEW.status <> 'activated')
    OR
    (OLD.status = 'requires_review'
      AND NEW.status NOT IN ('requires_review', 'renewing'))
    OR
    (OLD.status = 'requires_review'
      AND NEW.status = 'renewing'
      AND OLD.user_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Transition d''etat d''invitation non autorisee'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('auth_created', 'profile_ready', 'renewing')
    AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Un compte Auth connu est obligatoire pour cet etat'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$schoolnet_guard$;

REVOKE ALL ON FUNCTION public.schoolnet_family_invitation_guard_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_family_invitation_guard_update()
  TO service_role;

CREATE TRIGGER schoolnet_family_invitation_guard_update_trg
BEFORE UPDATE ON public.schoolnet_family_invitation_records
FOR EACH ROW
EXECUTE FUNCTION public.schoolnet_family_invitation_guard_update();

-- Historique append-only : jamais de lien, token ni mot de passe.
CREATE TABLE public.schoolnet_family_invitation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  recipient TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  user_id UUID,
  generation_count INTEGER NOT NULL,
  action_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  error_code TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schoolnet_family_events_registry_fk
    FOREIGN KEY (request_id, recipient)
    REFERENCES public.schoolnet_family_invitation_records(request_id, recipient)
    ON DELETE RESTRICT
);

CREATE INDEX schoolnet_family_events_request_idx
  ON public.schoolnet_family_invitation_events
  (request_id, recipient, happened_at DESC);

CREATE FUNCTION public.schoolnet_family_invitation_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $schoolnet_audit$
BEGIN
  INSERT INTO public.schoolnet_family_invitation_events (
    request_id, recipient, old_status, new_status, user_id,
    generation_count, action_by, error_code
  ) VALUES (
    NEW.request_id, NEW.recipient,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status, NEW.user_id, NEW.generation_count,
    NEW.last_action_by, NEW.last_error_code
  );
  RETURN NEW;
END;
$schoolnet_audit$;

REVOKE ALL ON FUNCTION public.schoolnet_family_invitation_audit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_family_invitation_audit()
  TO service_role;

CREATE TRIGGER schoolnet_family_invitation_audit_trg
AFTER INSERT OR UPDATE ON public.schoolnet_family_invitation_records
FOR EACH ROW
EXECUTE FUNCTION public.schoolnet_family_invitation_audit();

ALTER TABLE public.schoolnet_family_invitation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_family_invitation_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schoolnet_family_invitation_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT
  ON TABLE public.schoolnet_family_invitation_events TO service_role;

-- Table privee au niveau des droits SQL et RLS ; seules les Edge Functions
-- privilegiées y accederont, apres verification de l'identite Admin.
ALTER TABLE public.schoolnet_family_invitation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_family_invitation_records FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schoolnet_family_invitation_records
  FROM PUBLIC, anon, authenticated, service_role;

-- Supabase attribue des droits par defaut au service_role. Les retirer
-- explicitement avant de ne redonner que SELECT/INSERT/UPDATE evite DELETE.
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.schoolnet_family_invitation_records TO service_role;

-- Aucune politique SELECT/INSERT/UPDATE/DELETE pour anon/authenticated.
-- Pas de DELETE sur le registre ni sur les evenements.
-- Toute rectification exige une
-- procedure de reprise auditee, sans effacement automatique des traces.

COMMENT ON TABLE public.schoolnet_family_invitation_records IS
  'SCHOOLNET 5.C-B.2 : journal prive des preparations d invitations Parent et Apprenant (sans lien ni jeton).';

COMMENT ON COLUMN public.schoolnet_family_invitation_records.status IS
  'preparing=reserve ; auth_created=Auth lie ; profile_ready=profil pret ; renewing=lien en cours ; prepared=lien ponctuel pret ; sent_declared=envoi declare ; activated=connexion confirmee ; requires_review=interruption a examiner.';
