-- SCHOOLNET 2.0 | Permettre le role local school_admin sur les profils
-- Correction ciblee: l'enum user_role contient le role, mais la contrainte
-- historique profiles_role_check acceptait seulement 4 valeurs.
-- Ne touche ni aux comptes existants, ni aux roles de connexion, ni aux RLS.
DO $preflight$
DECLARE v_def text;
BEGIN
  IF to_regclass('public.schoolnet_schools') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
       WHERE t.typname='user_role' AND e.enumlabel='school_admin'
     ) THEN
    RAISE EXCEPTION 'Installer la migration multi-etablissements d abord.';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
  WHERE conrelid='public.profiles'::regclass
    AND conname='profiles_role_check' AND contype='c';
  IF v_def IS NULL
     OR v_def NOT ILIKE '%student%'
     OR v_def NOT ILIKE '%teacher%'
     OR v_def NOT ILIKE '%parent%'
     OR v_def NOT ILIKE '%admin%' THEN
    RAISE EXCEPTION 'La contrainte profiles_role_check differente de l existant doit etre auditee.';
  END IF;
  IF v_def ILIKE '%school_admin%' THEN
    RAISE EXCEPTION 'La contrainte est deja compatible : migration inutile.';
  END IF;
END;
$preflight$;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles
 ADD CONSTRAINT profiles_role_check
 CHECK (
  role IN (
   'student'::public.user_role,
   'teacher'::public.user_role,
   'parent'::public.user_role,
   'admin'::public.user_role,
   'school_admin'::public.user_role
  )
 ) NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_role_check;

DO $verify$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid='public.profiles'::regclass
  AND c.conname='profiles_role_check' AND c.convalidated
  AND pg_get_constraintdef(c.oid) LIKE '%school_admin%'
 ) THEN RAISE EXCEPTION 'Validation du nouveau role school_admin incomplete.'; END IF;
END;
$verify$;
