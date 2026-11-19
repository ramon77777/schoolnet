-- SCHOOLNET 2.0 | Lot 5D-A | PROPOSITION A RELIRE / REVIEW ONLY
-- NE PAS EXECUTER sur le Supabase principal sans une AUTORISATION SEPAREE.
-- NE PAS placer ce fichier dans supabase/migrations/ ni lancer db push.
-- Le correctif de refus direct doit etre RECONCILIE avec la future migration
-- 5D complete avant toute installation; ne pas empiler les deux au hasard.
--
-- Objet: refuser tout UPDATE de school_years.is_current quand il existe
-- des dossiers historiques ou un contexte officiel S2-A/S3-C.
-- AUCUNE suppression et AUCUNE modification de dossier dans cette proposition.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30000ms';

DO $schoolnet_5da_preflight$
BEGIN
  IF to_regclass('public.school_years') IS NULL
    OR to_regclass('public.student_enrollments') IS NULL
    OR to_regclass('public.class_students') IS NULL
    OR to_regclass('public.class_teachers') IS NULL
    OR to_regclass('public.classes') IS NULL
    OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
    OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
    OR to_regprocedure('public.admin_set_current_school_year(uuid)') IS NULL
    OR to_regnamespace('schoolnet_private') IS NULL
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid='public.school_years'::regclass
        AND t.tgname='trg_schoolnet_lot5da_block_direct_year_switch'
        AND NOT t.tgisinternal
    )
  THEN
    RAISE EXCEPTION '5D-A : schema inattendu ou garde deja present. Arret sans migration.';
  END IF;
END;
$schoolnet_5da_preflight$;

-- Fonction privee de REFUS uniquement, y compris pour une RPC legacy
-- SECURITY DEFINER et pour une tentative UPDATE directe autorisee par RLS.
-- La lecture privilegiee des donnees evite un faux negatif RLS.
CREATE FUNCTION schoolnet_private.guard_lot5da_direct_year_switch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet_5da_guard$
BEGIN
  IF OLD.is_current IS NOT DISTINCT FROM NEW.is_current THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.student_enrollments)
    OR EXISTS (SELECT 1 FROM public.class_students)
    OR EXISTS (SELECT 1 FROM public.class_teachers)
    OR EXISTS (SELECT 1 FROM public.schoolnet_school_student_class_assignments)
    OR EXISTS (SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments)
    OR EXISTS (SELECT 1 FROM public.classes WHERE school_id IS NOT NULL)
  THEN
    RAISE EXCEPTION
      '5D-A : passage d annee direct interdit en presence de dossiers ou affectations; utilisez le parcours controle.'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$schoolnet_5da_guard$;

REVOKE ALL ON FUNCTION schoolnet_private.guard_lot5da_direct_year_switch()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_schoolnet_lot5da_block_direct_year_switch
BEFORE UPDATE OF is_current ON public.school_years
FOR EACH ROW
WHEN (OLD.is_current IS DISTINCT FROM NEW.is_current)
EXECUTE FUNCTION schoolnet_private.guard_lot5da_direct_year_switch();

DO $schoolnet_5da_postcheck$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid='public.school_years'::regclass
      AND t.tgname='trg_schoolnet_lot5da_block_direct_year_switch'
      AND t.tgenabled='O'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'schoolnet_private.guard_lot5da_direct_year_switch()'::regprocedure,
    'EXECUTE'
  )
  THEN
    RAISE EXCEPTION '5D-A : postcontrole securite du garde non conforme.';
  END IF;
END;
$schoolnet_5da_postcheck$;

COMMIT;

-- IMPORTANT : non-execute. La bascule annuelle finale devra remplacer
-- ce verrou temporaire par un verrou transactionnel AUTORISE PAR LE SERVEUR,
-- compatible avec les droits tenant S2/S3 et les archives existantes.
