-- SCHOOLNET — Lot 4.3.C | Alertes de changements d'emploi du temps
-- PREPARE SUR GITHUB UNIQUEMENT : ne pas appliquer avant autorisation.
--
-- Pas de notification a l'INSERT initial (preparation de l'emploi du temps).
-- Notification apres changement significatif d'un creneau hebdomadaire ACTIF
-- de l'annee scolaire courante, desactivation, reactivation ou suppression.
-- Les changements de notes, de updated_at et les sauvegardes sans effet
-- ne declenchent jamais d'alerte.
--
-- Destinataires : enseignants OLD/NEW et eleves des classes OLD/NEW,
-- d'apres les affectations et class_students (source de l'acces RLS).
-- Aucune alerte pour un membre non concerne ni pour les annees archivees.
-- Parents : non inclus dans cette premiere version (choix de perimetre).
--
-- Une cle d'evenement aleatoire par vrai changement autorise deux
-- modifications successives legitimes du meme creneau tout en conservant
-- la protection unique (user_id, event_key, related_id).

DO $schoolnet_preflight$
BEGIN
  IF to_regnamespace('schoolnet_private') IS NULL
    OR to_regclass('public.timetable_slots') IS NULL
    OR to_regclass('public.school_years') IS NULL
    OR to_regclass('public.class_students') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.notifications') IS NULL
    OR to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname='public'
        AND tablename='notifications'
        AND indexname='idx_notifications_event_unique'
    )
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.C : schema ou index requis absent';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=to_regclass('public.timetable_slots')
      AND tgname='trg_notify_timetable_changes'
      AND NOT tgisinternal
  )
  OR to_regprocedure('schoolnet_private.notify_timetable_changes()') IS NOT NULL
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.C : alerte deja presente, verifier avant migration';
  END IF;
END;
$schoolnet_preflight$;

CREATE FUNCTION schoolnet_private.notify_timetable_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet_function$
DECLARE
  v_slot_id uuid;
  v_old_class uuid;
  v_new_class uuid;
  v_old_teacher uuid;
  v_new_teacher uuid;
  v_old_visible boolean := false;
  v_new_visible boolean := false;
  v_kind text;
  v_key text;
  v_old_schedule text;
  v_new_schedule text;
  v_message text;
BEGIN
  IF TG_WHEN <> 'AFTER'
     OR TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME <> 'timetable_slots'
     OR TG_OP NOT IN ('UPDATE', 'DELETE')
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.C: usage de declencheur non autorise';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_slot_id := OLD.id;
    v_old_class := OLD.class_id;
    v_old_teacher := OLD.teacher_id;
    SELECT COALESCE(OLD.is_active AND sy.is_current, false)
    INTO v_old_visible
    FROM public.school_years sy
    WHERE sy.id = OLD.school_year_id;

    IF NOT COALESCE(v_old_visible, false) THEN
      RETURN OLD;
    END IF;
    v_kind := 'deleted';
    v_old_schedule := pg_catalog.format(
      '%s de %s à %s',
      (ARRAY['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[OLD.day_of_week],
      pg_catalog.to_char(OLD.starts_at, 'HH24:MI'),
      pg_catalog.to_char(OLD.ends_at, 'HH24:MI')
    );

  ELSE
    -- Les champs techniques et les notes ne sont pas des changements notifiables.
    IF (OLD.school_year_id, OLD.class_id, OLD.course_id, OLD.teacher_id,
        OLD.room_id, OLD.day_of_week, OLD.starts_at, OLD.ends_at, OLD.is_active)
       IS NOT DISTINCT FROM
       (NEW.school_year_id, NEW.class_id, NEW.course_id, NEW.teacher_id,
        NEW.room_id, NEW.day_of_week, NEW.starts_at, NEW.ends_at, NEW.is_active)
    THEN
      RETURN NEW;
    END IF;

    v_slot_id := NEW.id;
    v_old_class := OLD.class_id;
    v_old_teacher := OLD.teacher_id;
    v_new_class := NEW.class_id;
    v_new_teacher := NEW.teacher_id;

    SELECT COALESCE(OLD.is_active AND sy.is_current, false)
    INTO v_old_visible
    FROM public.school_years sy WHERE sy.id=OLD.school_year_id;

    SELECT COALESCE(NEW.is_active AND sy.is_current, false)
    INTO v_new_visible
    FROM public.school_years sy WHERE sy.id=NEW.school_year_id;

    v_old_visible := COALESCE(v_old_visible, false);
    v_new_visible := COALESCE(v_new_visible, false);
    -- Modification invisible : creneau inactif ou annee archivee.
    IF NOT v_old_visible AND NOT v_new_visible THEN
      RETURN NEW;
    END IF;

    IF v_old_visible AND NOT v_new_visible THEN
      v_kind := 'disabled';
    ELSIF NOT v_old_visible AND v_new_visible THEN
      v_kind := 'reactivated';
    ELSE
      v_kind := 'updated';
    END IF;

    v_old_schedule := pg_catalog.format(
      '%s de %s à %s',
      (ARRAY['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[OLD.day_of_week],
      pg_catalog.to_char(OLD.starts_at, 'HH24:MI'),
      pg_catalog.to_char(OLD.ends_at, 'HH24:MI')
    );
    v_new_schedule := pg_catalog.format(
      '%s de %s à %s',
      (ARRAY['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[NEW.day_of_week],
      pg_catalog.to_char(NEW.starts_at, 'HH24:MI'),
      pg_catalog.to_char(NEW.ends_at, 'HH24:MI')
    );
  END IF;

  IF v_kind = 'deleted' THEN
    v_message := pg_catalog.format(
      'Le créneau hebdomadaire du %s a été supprimé. Vérifiez votre emploi du temps.',
      v_old_schedule
    );
  ELSIF v_kind = 'disabled' THEN
    v_message := pg_catalog.format(
      'Le créneau hebdomadaire du %s a été désactivé. Vérifiez votre emploi du temps.',
      v_old_schedule
    );
  ELSIF v_kind = 'reactivated' THEN
    v_message := pg_catalog.format(
      'Le créneau hebdomadaire du %s est de nouveau actif. Vérifiez votre emploi du temps.',
      v_new_schedule
    );
  ELSIF (OLD.day_of_week, OLD.starts_at, OLD.ends_at)
    IS DISTINCT FROM (NEW.day_of_week, NEW.starts_at, NEW.ends_at) THEN
    v_message := pg_catalog.format(
      'Un créneau a changé : %s devient %s. Consultez votre emploi du temps.',
      v_old_schedule, v_new_schedule
    );
  ELSIF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
    v_message := 'La salle d’un créneau a changé. Consultez votre emploi du temps.';
  ELSIF OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN
    v_message := 'L’enseignant d’un créneau a changé. Consultez votre emploi du temps.';
  ELSIF OLD.course_id IS DISTINCT FROM NEW.course_id THEN
    v_message := 'Le cours associé à un créneau a changé. Consultez votre emploi du temps.';
  ELSE
    v_message := 'Un créneau hebdomadaire de votre emploi du temps a changé. Consultez les détails.';
  END IF;

  -- Identifiant par evenement effectif, partage par les destinataires.
  -- Deux modifications successives sont deux evenements differents.
  v_key := 'timetable:' || v_kind || ':' || pg_catalog.gen_random_uuid()::text;

  WITH recipient_membership AS (
    SELECT v_old_teacher AS user_id, true AS was_member, false AS now_member
    WHERE v_old_visible AND v_old_teacher IS NOT NULL
    UNION ALL
    SELECT v_new_teacher, false, true
    WHERE v_new_visible AND v_new_teacher IS NOT NULL
    UNION ALL
    SELECT cs.student_id, true, false
    FROM public.class_students cs
    WHERE v_old_visible AND cs.class_id = v_old_class
    UNION ALL
    SELECT cs.student_id, false, true
    FROM public.class_students cs
    WHERE v_new_visible AND cs.class_id = v_new_class
  ),
  affected AS (
    SELECT user_id,
           pg_catalog.bool_or(was_member) AS was_member,
           pg_catalog.bool_or(now_member) AS now_member
    FROM recipient_membership
    GROUP BY user_id
  )
  INSERT INTO public.notifications (
    user_id, title, body, type, is_read,
    event_key, related_id, action_url
  )
  SELECT
    p.id,
    CASE
      WHEN v_kind='deleted' THEN 'Créneau supprimé'
      WHEN v_kind='disabled' THEN 'Créneau désactivé'
      WHEN v_kind='reactivated' THEN 'Créneau réactivé'
      WHEN a.was_member AND NOT a.now_member THEN 'Créneau retiré'
      WHEN NOT a.was_member AND a.now_member THEN 'Nouveau créneau attribué'
      ELSE 'Emploi du temps modifié'
    END,
    CASE
      WHEN v_kind IN ('deleted','disabled','reactivated') THEN v_message
      WHEN a.was_member AND NOT a.now_member THEN
        'Un créneau n’est plus attribué à votre emploi du temps. Consultez la version à jour.'
      WHEN NOT a.was_member AND a.now_member THEN
        pg_catalog.format(
          'Un créneau hebdomadaire du %s vous a été attribué. Consultez votre emploi du temps.',
          v_new_schedule
        )
      ELSE v_message
    END,
    CASE
      WHEN v_kind IN ('deleted','disabled') THEN 'warning'::public.notification_type
      ELSE 'info'::public.notification_type
    END,
    false,
    v_key,
    v_slot_id,
    CASE
      WHEN p.role::text='teacher' THEN '/app/teacher/timetable'
      ELSE '/app/student/timetable'
    END
  FROM affected a
  JOIN public.profiles p ON p.id=a.user_id
  WHERE p.role::text IN ('student','teacher')
  ON CONFLICT DO NOTHING;

  IF TG_OP='DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$schoolnet_function$;

-- Fonction interne au schéma non exposé et non appelable en RPC client.
REVOKE ALL ON FUNCTION schoolnet_private.notify_timetable_changes()
FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION schoolnet_private.notify_timetable_changes()
IS 'SCHOOLNET 4.3.C: alertes hebdomadaires pour les changements reels du planning courant, old/new destinataires et anti-doublons.';

-- Ne genere aucune notification pour les creneaux deja presents.
CREATE TRIGGER trg_notify_timetable_changes
AFTER UPDATE OR DELETE ON public.timetable_slots
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.notify_timetable_changes();

-- Aucun SQL retrospectif, aucune modification RLS, Cron ou LIVE.
