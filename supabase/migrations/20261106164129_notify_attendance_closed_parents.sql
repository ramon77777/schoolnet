-- SCHOOLNET | Lot 4.3.A | Alertes parentales après clôture d'un appel
-- MIGRATION PREPAREE SUR GITHUB UNIQUEMENT.
-- Ne pas exécuter sur le projet Supabase de production avant recette et autorisation.
--
-- Règle : un enregistrement provisoire (open/draft) n'envoie aucune alerte.
-- Une transition effective de la séance vers closed notifie uniquement les
-- parents liés aux apprenants absents ou en retard.
--
-- Un événement unique par parent et ligne d'appel est protégé par l'index
-- existant idx_notifications_event_unique (user_id, event_key, related_id).

DO $preflight$
BEGIN
  IF to_regnamespace('schoolnet_private') IS NULL
    OR to_regclass('public.attendance_sessions') IS NULL
    OR to_regclass('public.attendance_records') IS NULL
    OR to_regclass('public.parent_links') IS NULL
    OR to_regclass('public.notifications') IS NULL
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.A : objets requis absents';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND indexname = 'idx_notifications_event_unique'
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.A : index anti-doublons requis absent';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION schoolnet_private.notify_attendance_closed_parents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Défense en profondeur : ce déclencheur est réservé à la clôture d'appel.
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME <> 'attendance_sessions'
     OR TG_OP <> 'UPDATE'
     OR NEW.status::text <> 'closed'
     OR OLD.status::text = 'closed'
  THEN
    RETURN NEW;
  END IF;

  -- parent_links est la source autoritative des liens parent-enfant,
  -- cohérente avec la fonction d'autorisation is_linked_parent_of().
  -- Pas d'accès ni de notification pour un parent non lié.
  INSERT INTO public.notifications (
    user_id, title, body, type, is_read, event_key, related_id, action_url
  )
  SELECT
    parent_profile.id,
    CASE ar.status::text
      WHEN 'absent' THEN 'Absence enregistrée'
      WHEN 'late' THEN 'Retard enregistré'
    END,
    CASE ar.status::text
      WHEN 'absent' THEN
        pg_catalog.format(
          'Une absence de %s a été enregistrée pour le cours du %s. Consultez les présences pour le détail.',
          COALESCE(NULLIF(pg_catalog.btrim(student_profile.full_name), ''), 'votre enfant'),
          COALESCE(pg_catalog.to_char(NEW.session_date, 'DD/MM/YYYY'), 'date non précisée')
        )
      WHEN 'late' THEN
        pg_catalog.format(
          'Un retard de %s a été enregistré pour le cours du %s. Consultez les présences pour le détail.',
          COALESCE(NULLIF(pg_catalog.btrim(student_profile.full_name), ''), 'votre enfant'),
          COALESCE(pg_catalog.to_char(NEW.session_date, 'DD/MM/YYYY'), 'date non précisée')
        )
    END,
    'warning'::public.notification_type,
    false,
    'attendance:closed:' || NEW.id::text,
    ar.id,
    '/app/parent/attendance'
  FROM public.attendance_records AS ar
  JOIN public.parent_links AS pl
    ON pl.student_id = ar.student_id
  JOIN public.profiles AS parent_profile
    ON parent_profile.id = pl.parent_id
   AND parent_profile.role::text = 'parent'
  JOIN public.profiles AS student_profile
    ON student_profile.id = ar.student_id
   AND student_profile.role::text = 'student'
  WHERE ar.session_id = NEW.id
    AND ar.status::text IN ('absent', 'late')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Fonction interne, non exposée en RPC public. Elle doit pouvoir insérer
-- dans notifications lors de la clôture effectuée par un enseignant :
-- l'exécution privilégiée est limitée au corps de cette fonction sans arguments.
REVOKE ALL ON FUNCTION schoolnet_private.notify_attendance_closed_parents()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION schoolnet_private.notify_attendance_closed_parents()
IS 'SCHOOLNET 4.3.A : avertir les parents liés, une seule fois par ligne d''appel lors de la clôture.';

DROP TRIGGER IF EXISTS trg_notify_attendance_closed_parents
  ON public.attendance_sessions;

CREATE TRIGGER trg_notify_attendance_closed_parents
AFTER UPDATE OF status ON public.attendance_sessions
FOR EACH ROW
WHEN (NEW.status = 'closed'::public.attendance_session_status
      AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION schoolnet_private.notify_attendance_closed_parents();

-- Ne crée aucune notification rétroactive.
-- Ne touche pas aux présences enregistrées, au Cron LIVE, ni aux anciennes migrations.
