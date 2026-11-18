-- SCHOOLNET 2.0 | LOT 5D-E | PROPOSITION SQL COMPLEMENTAIRE.
-- SANDBOX_ONLY: jamais en Supabase principal, jamais dans supabase/migrations.
-- NE PAS placer dans supabase/migrations/ ni executer sur la production.
-- Ne constitue PAS une migration autonome. A fusionner, apres revue, dans
-- UNE migration canonique consolidee de 5D-A+B+D+E.
-- Schema/roles reutilises depuis la fixture PostgreSQL 17 uniquement.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';

DO $lot5de_preflight$
BEGIN
  IF to_regnamespace('schoolnet_private') IS NULL
   OR to_regclass('public.school_year_rollover_runs') IS NULL
   OR to_regclass('public.student_enrollments') IS NULL
   OR to_regclass('public.classes') IS NULL
   OR to_regclass('public.class_students') IS NULL
   OR to_regclass('public.school_years') IS NULL
   OR EXISTS (
     SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgname IN ('trg_lot5de_freeze_closed_year_enrollment',
                      'trg_lot5de_freeze_closed_year_class_link')
       AND NOT tgisinternal
   )
  THEN
    RAISE EXCEPTION '5D-E: incompatible schema or guards already installed.'
      USING ERRCODE='55000';
  END IF;
END;
$lot5de_preflight$;

-- Conserver intacts les dossiers d'annees SOURCE ayant deja un run 5D.
-- Le finaliseur 5D-A+B cloture la source AVANT d'inserer le journal
-- school_year_rollover_runs. Ce garde ne bloque donc pas la finalisation.
-- Les nouveaux dossiers sur l'annee cible ACTIVE restent autorises.
CREATE FUNCTION schoolnet_private.guard_lot5de_closed_enrollment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $guard_enrollment$
DECLARE
  closed_year uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT r.source_year_id INTO closed_year
    FROM public.school_year_rollover_runs r
    WHERE r.source_year_id=OLD.school_year_id;
    IF closed_year IS NOT NULL THEN
      RAISE EXCEPTION '5D-E: closed annual enrollment is immutable.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT r.source_year_id INTO closed_year
    FROM public.school_year_rollover_runs r
    WHERE r.source_year_id=NEW.school_year_id;
    IF closed_year IS NOT NULL THEN
      RAISE EXCEPTION '5D-E: cannot create or move into a closed school year.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard_enrollment$;

CREATE TRIGGER trg_lot5de_freeze_closed_year_enrollment
BEFORE INSERT OR UPDATE OR DELETE ON public.student_enrollments
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_lot5de_closed_enrollment();

-- Les liens historiques classes/eleves d'une annee cloturee sont conserves.
-- Le lien ANNEE CIBLE peut toujours etre ajoute par la migration.
CREATE FUNCTION schoolnet_private.guard_lot5de_closed_class_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $guard_class_link$
DECLARE
  class_id uuid;
  is_frozen boolean;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    class_id:=OLD.class_id;
    SELECT EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.school_year_rollover_runs r
        ON (c.school_year_id=r.source_year_id OR
            (c.school_year_id IS NULL AND EXISTS (
               SELECT 1 FROM public.school_years y
               WHERE y.id=r.source_year_id AND y.name=c.school_year)))
      WHERE c.id=class_id
    ) INTO is_frozen;
    IF is_frozen THEN
      RAISE EXCEPTION '5D-E: historical class association is immutable.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    class_id:=NEW.class_id;
    SELECT EXISTS (
      SELECT 1 FROM public.classes c
      JOIN public.school_year_rollover_runs r
        ON (c.school_year_id=r.source_year_id OR
            (c.school_year_id IS NULL AND EXISTS (
               SELECT 1 FROM public.school_years y
               WHERE y.id=r.source_year_id AND y.name=c.school_year)))
      WHERE c.id=class_id
    ) INTO is_frozen;
    IF is_frozen THEN
      RAISE EXCEPTION '5D-E: no new or moved association in closed year.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard_class_link$;

CREATE TRIGGER trg_lot5de_freeze_closed_year_class_link
BEFORE INSERT OR UPDATE OR DELETE ON public.class_students
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_lot5de_closed_class_link();

REVOKE ALL ON FUNCTION schoolnet_private.guard_lot5de_closed_enrollment(),
 schoolnet_private.guard_lot5de_closed_class_link()
FROM PUBLIC, anon, authenticated, service_role;

DO $lot5de_postcheck$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgname IN ('trg_lot5de_freeze_closed_year_enrollment',
                       'trg_lot5de_freeze_closed_year_class_link')
        AND tgenabled='O' AND NOT tgisinternal)<>2
  OR pg_catalog.has_function_privilege('authenticated',
     'schoolnet_private.guard_lot5de_closed_enrollment()'::regprocedure,'EXECUTE')
  OR pg_catalog.has_function_privilege('service_role',
     'schoolnet_private.guard_lot5de_closed_class_link()'::regprocedure,'EXECUTE')
  THEN
    RAISE EXCEPTION '5D-E: guard install or privileges inconsistent.'
      USING ERRCODE='42501';
  END IF;
END;
$lot5de_postcheck$;
COMMIT;
-- NEVER RUN THIS SQL on the real SCHOOLNET project.
