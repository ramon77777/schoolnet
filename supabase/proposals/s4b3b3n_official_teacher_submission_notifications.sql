-- SCHOOLNET V2 S4-B.3-B.3-N - proposition NON INSTALLEE
-- L'enseignant recoit une notification uniquement lors de la remise initiale
-- de sa copie officielle, avec action_url V2 et dedoublonnage en base.
-- Pas de backfill automatique; aucune modification des copies/notes/V1.
DO $pre$
BEGIN
 IF to_regprocedure('schoolnet_private.notify_teacher_on_submission()') IS NULL
   OR to_regprocedure('public.schoolnet_teacher_official_copies(uuid)') IS NULL
   OR to_regprocedure('public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text)') IS NULL
   OR pg_get_functiondef('schoolnet_private.notify_teacher_on_submission()'::regprocedure)
      NOT LIKE '%les notifications de copies officielles attendent%'
 THEN RAISE EXCEPTION 'S4B3B3N_PREFLIGHT_FAILED'; END IF;
END $pre$;

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
  END IF;  -- S4-B.3-B.3-N : une remise scolaire officielle utilise le parcours V2.
  IF EXISTS (
    SELECT 1 FROM schoolnet_private.school_assessment_links al
    WHERE al.assessment_id=v_assessment_id
  ) THEN
    -- Les sujets avec depot de fichier restent hors B.2.
    IF TG_TABLE_NAME='assessment_submissions' THEN
      INSERT INTO public.notifications (
        user_id, title, body, type, is_read,
        event_key, related_id, action_url
      )
      SELECT DISTINCT
        cl.teacher_id,
        'Nouvelle copie officielle à corriger',
        pg_catalog.format(
          'Une copie de « %s » a été remise. Ouvrez les corrections officielles.',
          a.title
        ),
        'info'::public.notification_type,
        false,
        'school:assessment:submission:teacher',
        NEW.id,
        '/app/teacher/assessments/' || a.id::text || '/official-corrections'
      FROM schoolnet_private.school_assessment_links al
      JOIN schoolnet_private.school_course_links cl
        ON cl.id=al.school_course_link_id
        AND cl.status='active'
      JOIN public.assessments a
        ON a.id=al.assessment_id
        AND a.course_id=cl.course_id
        AND a.created_by=cl.teacher_id
        AND a.status::text IN ('published','closed')
        AND a.submission_mode IS DISTINCT FROM 'file_upload'
      JOIN public.courses co
        ON co.id=cl.course_id
        AND co.created_by=cl.teacher_id
        AND co.status='active'
      JOIN public.schoolnet_schools sch
        ON sch.id=cl.school_id
        AND sch.status='active'
      JOIN public.classes c
        ON c.id=cl.class_id
        AND c.school_id=cl.school_id
        AND c.school_year_id=cl.school_year_id
        AND c.learning_context='school'
      JOIN public.schoolnet_school_teacher_subject_assignments ta
        ON ta.id=cl.teacher_assignment_id
        AND ta.school_id=cl.school_id
        AND ta.class_id=cl.class_id
        AND ta.school_year_id=cl.school_year_id
        AND ta.teacher_id=cl.teacher_id
        AND ta.subject_id=cl.subject_id
        AND ta.status='active'
      JOIN public.schoolnet_school_memberships tm
        ON tm.school_id=cl.school_id
        AND tm.user_id=cl.teacher_id
        AND tm.member_role='teacher'
        AND tm.status='active'
      JOIN public.profiles teacher
        ON teacher.id=cl.teacher_id AND teacher.role::text='teacher'
      JOIN public.schoolnet_school_student_class_assignments sa
        ON sa.school_id=cl.school_id
        AND sa.class_id=cl.class_id
        AND sa.school_year_id=cl.school_year_id
        AND sa.student_id=NEW.student_id
        AND sa.status='active'
      JOIN public.schoolnet_school_memberships sm
        ON sm.school_id=cl.school_id
        AND sm.user_id=sa.student_id
        AND sm.member_role='student'
        AND sm.status='active'
      JOIN public.profiles student
        ON student.id=sa.student_id AND student.role::text='student'
      WHERE al.assessment_id=v_assessment_id AND al.status='active'
      ON CONFLICT DO NOTHING;
    END IF;
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
$function$;

DO $post$
BEGIN
 IF NOT (pg_get_functiondef('schoolnet_private.notify_teacher_on_submission()'::regprocedure)
   LIKE '%school:assessment:submission:teacher%')
 OR NOT (pg_get_functiondef('schoolnet_private.notify_teacher_on_submission()'::regprocedure)
   LIKE '%/official-corrections%')
 THEN RAISE EXCEPTION 'S4B3B3N_POSTFLIGHT_FAILED'; END IF;
END $post$;
SELECT 'S4B3B3N_SUBMISSION_NOTIFY_PASS' AS result;
