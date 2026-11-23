-- SCHOOLNET S4-B.3-B.3-N - retour arriere MANUEL.
-- Restaurer la fonction de notification B.2 sans modifier les donnees.
DO $guard$
BEGIN
 IF pg_get_functiondef('schoolnet_private.notify_teacher_on_submission()'::regprocedure)
 NOT LIKE '%school:assessment:submission:teacher%'
 THEN RAISE EXCEPTION 'S4B3B3N_NOT_INSTALLED'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION schoolnet_private.notify_teacher_on_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  END IF;  -- S4-B.3-B.2 : les notifications de copies officielles attendent le
  -- parcours de correction B.4, jamais de lien de correction V1 inaccessible.
  IF EXISTS (SELECT 1 FROM schoolnet_private.school_assessment_links al
             WHERE al.assessment_id=v_assessment_id) THEN
    RETURN NEW;
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
$function$
SELECT 'S4B3B3N_SUBMISSION_NOTIFY_ROLLBACK_PASS' AS result;
