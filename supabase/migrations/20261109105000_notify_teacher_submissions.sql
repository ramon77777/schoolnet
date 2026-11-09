-- SCHOOLNET | Bloc 4.3.B | Alerte aux enseignants lors d'un nouveau rendu
-- PREPARE SUR LA BRANCHE GITHUB UNIQUEMENT : ne pas appliquer en production
-- avant autorisation et verification transactionnelle.
--
-- Source : status = submitted, au premier INSERT ou lors du passage
-- in_progress -> submitted. Les sauvegardes successives en statut submitted
-- ne doivent pas multiplier les notifications.
-- Le createur de l'evaluation et les enseignants explicitement affectes au
-- cours sont destinataires ; les autres comptes ne le sont pas.
--
-- Compatible avec les deux workflows :
--   homework_submissions   -> devoir par fichier ;
--   assessment_submissions -> devoir en ligne, quiz ou examen.
-- La cle de dedoublonnage est (enseignant, evenement, submission.id),
-- protegee par idx_notifications_event_unique.

DO $schoolnet_preflight$
BEGIN
  IF to_regnamespace('schoolnet_private') IS NULL
    OR to_regclass('public.assessments') IS NULL
    OR to_regclass('public.course_teachers') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.homework_submissions') IS NULL
    OR to_regclass('public.assessment_submissions') IS NULL
    OR to_regclass('public.notifications') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'notifications'
        AND indexname = 'idx_notifications_event_unique'
    )
  THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.B: schema ou index anti-doublons manquant';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname IN (
      'trg_notify_teacher_homework_submitted',
      'trg_notify_teacher_assessment_submitted'
    )
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET 4.3.B: declencheurs deja presents, audit requis';
  END IF;
END;
$schoolnet_preflight$;

CREATE OR REPLACE FUNCTION schoolnet_private.notify_teacher_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet_function$
DECLARE
  v_assessment_id uuid;
  v_owner_id uuid;
  v_course_id uuid;
  v_assessment_type text;
  v_submission_mode text;
  v_assessment_title text;
  v_student_name text;
  v_notice_title text;
  v_event_key text;
BEGIN
  IF TG_WHEN <> 'AFTER'
    OR TG_TABLE_SCHEMA <> 'public'
    OR TG_TABLE_NAME NOT IN ('homework_submissions', 'assessment_submissions')
    OR TG_OP NOT IN ('INSERT', 'UPDATE')
    OR NEW.status::text <> 'submitted'
  THEN
    RETURN NEW;
  END IF;

  -- La soumission initiale est un evenement ; une sauvegarde repetee
  -- d'un travail deja submitted n'est pas une nouvelle notification.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text <> 'in_progress' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'homework_submissions' THEN
    v_assessment_id := NEW.homework_id;
  ELSE
    v_assessment_id := NEW.assessment_id;
  END IF;

  SELECT a.created_by, a.course_id, a.type::text,
         a.submission_mode, a.title
  INTO v_owner_id, v_course_id, v_assessment_type,
       v_submission_mode, v_assessment_title
  FROM public.assessments AS a
  WHERE a.id = v_assessment_id
    AND a.status::text IN ('published', 'closed');

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'homework_submissions' THEN
    IF v_assessment_type <> 'assignment'
       OR v_submission_mode <> 'file_upload'
    THEN
      RETURN NEW;
    END IF;
  ELSE
    -- Les copies en ligne sont dans assessment_submissions, et non dans
    -- homework_submissions (reserve aux devoirs avec fichier).
    IF v_submission_mode = 'file_upload' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(pg_catalog.btrim(p.full_name), ''), 'Un apprenant')
  INTO v_student_name
  FROM public.profiles AS p
  WHERE p.id = NEW.student_id
    AND p.role::text = 'student';

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_assessment_type = 'assignment' THEN
    v_notice_title := 'Nouveau devoir remis';
    v_event_key := 'submission:homework';
  ELSE
    v_notice_title := 'Nouvelle copie à corriger';
    v_event_key := 'submission:assessment';
  END IF;

  INSERT INTO public.notifications (
    user_id, title, body, type, is_read,
    event_key, related_id, action_url
  )
  SELECT
    recipient.id,
    v_notice_title,
    pg_catalog.format(
      '%s a remis le travail « %s ». Consultez les corrections.',
      v_student_name,
      v_assessment_title
    ),
    'info'::public.notification_type,
    false,
    v_event_key,
    NEW.id,
    '/app/teacher/grading?assessmentId=' || v_assessment_id::text
  FROM public.profiles AS recipient
  JOIN (
    SELECT v_owner_id AS teacher_id
    UNION
    SELECT ct.teacher_id
    FROM public.course_teachers AS ct
    WHERE ct.course_id = v_course_id
  ) AS responsible
    ON responsible.teacher_id = recipient.id
  WHERE recipient.role::text = 'teacher'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$schoolnet_function$;

-- Fonction appelee par les triggers ; jamais directement en RPC client.
REVOKE ALL ON FUNCTION schoolnet_private.notify_teacher_on_submission()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION schoolnet_private.notify_teacher_on_submission()
IS 'SCHOOLNET: notifie les enseignants responsables lors du premier rendu d une evaluation, avec protection anti-doublon.';

CREATE TRIGGER trg_notify_teacher_homework_submitted
AFTER INSERT OR UPDATE OF status ON public.homework_submissions
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.notify_teacher_on_submission();

CREATE TRIGGER trg_notify_teacher_assessment_submitted
AFTER INSERT OR UPDATE OF status ON public.assessment_submissions
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.notify_teacher_on_submission();

-- Pas d'alerte retroactive : seuls les prochains rendus seront notifies.
-- Aucune modification des politiques RLS, corrections, bulletins ou Cron LIVE.
