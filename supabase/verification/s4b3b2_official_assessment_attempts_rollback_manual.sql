-- SCHOOLNET V2 S4-B.3-B.2 : ROLLBACK MANUEL, JAMAIS AUTOMATIQUE.
-- NE PAS EXECUTER SUR SUPABASE PRINCIPAL SANS AUTORISATION DISTINCTE.
-- Restore strictement les fonctions historiques prealablement photographiees.
DO $rollback_guard$
BEGIN
 IF to_regprocedure('public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NULL
 OR to_regprocedure('schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NULL
 THEN RAISE EXCEPTION 'S4B3B2_NOT_INSTALLED'; END IF;
END $rollback_guard$;
DROP FUNCTION public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text);
DROP FUNCTION schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text);

CREATE OR REPLACE FUNCTION public.trigger_refresh_progress_from_assessment_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id uuid;
  v_assessment_id uuid;
  v_course_id uuid;
begin
  if tg_op = 'DELETE' then
    v_student_id := old.student_id;
    v_assessment_id := old.assessment_id;
  else
    v_student_id := new.student_id;
    v_assessment_id := new.assessment_id;
  end if;

  select a.course_id
  into v_course_id
  from public.assessments a
  where a.id = v_assessment_id;

  if v_course_id is not null then
    perform public.refresh_student_progress(
      v_student_id,
      v_course_id
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

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
$function$;

DO $rollback_post$
BEGIN
 IF to_regprocedure('public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3B2_ROLLBACK_FAILED'; END IF;
END $rollback_post$;
SELECT 'S4B3B2_ROLLBACK_PASS' AS result;
