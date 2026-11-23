-- SCHOOLNET V2 / S4-B.3-B.2
-- PROPOSITION SQL UNIQUEMENT : NE PAS EXECUTER SUR SUPABASE PRINCIPAL SANS AUTORISATION.
-- Tentative et remise officielles en ligne : RPC atomique, aucune auto-notation.
-- Tous les droits classe/etablissement sont controles par le service B.1.
-- Les modes fichier et les corrections officielles sont hors de ce lot.

DO $s4b3b2_preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.student_school_assessment_preview(uuid,uuid)') IS NULL
 OR to_regprocedure('public.trigger_refresh_progress_from_assessment_submission()') IS NULL
 OR to_regprocedure('schoolnet_private.notify_teacher_on_submission()') IS NULL
 OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
 OR to_regclass('public.assessment_submissions') IS NULL
 OR to_regclass('public.submission_answers') IS NULL
 OR NOT has_schema_privilege('authenticated','schoolnet_private','USAGE')
 THEN RAISE EXCEPTION 'S4B3B2_PREFLIGHT_FAILED'; END IF;
END $s4b3b2_preflight$;

CREATE FUNCTION schoolnet_private.student_school_assessment_attempt(
 p_course_id uuid,p_assessment_id uuid,p_action text,
 p_answers jsonb DEFAULT '[]'::jsonb,p_freeform_answer text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $s4b3b2$
DECLARE
 v_uid uuid:=auth.uid();
 v_assessment public.assessments%ROWTYPE;
 v_submission public.assessment_submissions%ROWTYPE;
 v_now timestamptz;
 v_deadline timestamptz;
 v_limit int;
 v_answers jsonb:=COALESCE(p_answers,'[]'::jsonb);
 v_item jsonb;
 v_question public.quiz_questions%ROWTYPE;
 v_question_id uuid;
 v_choice_id uuid;
 v_text text;
 v_seen uuid[]:=ARRAY[]::uuid[];
 v_freeform text:=NULLIF(pg_catalog.btrim(p_freeform_answer),'');
 v_count int:=0;
 v_output jsonb;
BEGIN
 IF v_uid IS NULL OR p_course_id IS NULL OR p_assessment_id IS NULL
    OR p_action IS NULL OR p_action NOT IN ('read','start','save','submit')
    OR public.get_my_role()::text IS DISTINCT FROM 'student'
 THEN RAISE EXCEPTION 'S4B3B2_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 -- Ne jamais autoriser une copie via l'inscription V1 : la B.1 exige
 -- simultanement la publication, l'opt-in officiel et l'affectation de classe.
 PERFORM schoolnet_private.student_school_assessment_preview(
   p_course_id,p_assessment_id);

 SELECT * INTO v_assessment FROM public.assessments a
 WHERE a.id=p_assessment_id AND a.course_id=p_course_id
   AND a.status::text='published'
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4B3B2_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 -- Rattachement actif verrouille pendant la transaction de remise.
 PERFORM 1 FROM schoolnet_private.school_assessment_links al
 JOIN schoolnet_private.school_course_links cl ON cl.id=al.school_course_link_id
 WHERE al.assessment_id=p_assessment_id AND al.status='active'
   AND cl.course_id=p_course_id AND cl.status='active'
   AND cl.teacher_id=v_assessment.created_by
 FOR SHARE OF al,cl;
 IF NOT FOUND THEN RAISE EXCEPTION 'S4B3B2_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 -- Devoirs fichiers et examens avec fichiers necessitent un flux Storage
 -- controle distinct ; aucune URL privee n'est transmise ou acceptee ici.
 IF v_assessment.submission_mode='file_upload'
 OR (v_assessment.type::text='exam'
     AND v_assessment.exam_content_mode IN ('file_only','file_and_questions'))
 THEN RAISE EXCEPTION 'S4B3B2_FILE_MODE_NOT_READY' USING ERRCODE='42501'; END IF;

 IF jsonb_typeof(v_answers) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'S4B3B2_INVALID_PAYLOAD' USING ERRCODE='22023';
 END IF;
 IF p_action IN ('read','start')
   AND (v_answers<>'[]'::jsonb OR v_freeform IS NOT NULL)
 THEN RAISE EXCEPTION 'S4B3B2_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;

 SELECT * INTO v_submission FROM public.assessment_submissions s
 WHERE s.assessment_id=p_assessment_id AND s.student_id=v_uid FOR UPDATE;
 v_now:=clock_timestamp();

 IF p_action='start' AND v_submission.id IS NULL THEN
   IF v_assessment.due_at IS NOT NULL AND v_now>=v_assessment.due_at
   THEN RAISE EXCEPTION 'S4B3B2_TIME_EXPIRED' USING ERRCODE='42501'; END IF;
   INSERT INTO public.assessment_submissions(
     assessment_id,student_id,status,started_at,submitted_at,
     score,feedback,graded_by,graded_at,published_at,
     freeform_answer,freeform_score,freeform_feedback
   ) VALUES(
     p_assessment_id,v_uid,'in_progress',v_now,NULL,
     NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
   ) ON CONFLICT (assessment_id,student_id) DO NOTHING;
   SELECT * INTO v_submission FROM public.assessment_submissions s
    WHERE s.assessment_id=p_assessment_id AND s.student_id=v_uid FOR UPDATE;
   v_now:=clock_timestamp();
 END IF;
 IF p_action IN ('save','submit') AND v_submission.id IS NULL
 THEN RAISE EXCEPTION 'S4B3B2_START_REQUIRED' USING ERRCODE='42501'; END IF;

 v_limit:=COALESCE(v_assessment.time_limit_minutes,
   CASE WHEN v_assessment.type::text='exam'
    THEN v_assessment.exam_window_minutes END);
 v_deadline:=v_assessment.due_at;
 IF v_submission.id IS NOT NULL AND v_limit IS NOT NULL THEN
   v_deadline:=LEAST(v_deadline,
    v_submission.started_at+pg_catalog.make_interval(mins=>v_limit));
 END IF;

 IF p_action IN ('save','submit') THEN
   IF v_submission.status::text='submitted' AND p_action='submit' THEN
     NULL; -- Nouvelle requete equivalente, sans INSERT/UPDATE/notification.
   ELSIF v_submission.status::text<>'in_progress' THEN
     RAISE EXCEPTION 'S4B3B2_ALREADY_FINAL' USING ERRCODE='42501';
   ELSIF v_deadline IS NOT NULL AND v_now>=v_deadline THEN
     RAISE EXCEPTION 'S4B3B2_TIME_EXPIRED' USING ERRCODE='42501';
   ELSE
     IF jsonb_array_length(v_answers)>200
      OR (v_freeform IS NOT NULL AND char_length(v_freeform)>10000)
      OR (v_assessment.type::text='quiz' AND v_freeform IS NOT NULL)
     THEN RAISE EXCEPTION 'S4B3B2_INVALID_PAYLOAD' USING ERRCODE='22023'; END IF;

     FOR v_item IN SELECT value FROM jsonb_array_elements(v_answers)
     LOOP
       IF jsonb_typeof(v_item)<>'object'
        OR NOT (v_item ? 'questionId')
        OR jsonb_typeof(v_item->'questionId')<>'string'
        OR EXISTS (
          SELECT 1 FROM jsonb_object_keys(v_item) AS k(key)
          WHERE k.key NOT IN ('questionId','choiceId','answerText')
        )
       THEN RAISE EXCEPTION 'S4B3B2_INVALID_ANSWER' USING ERRCODE='22023'; END IF;
       v_question_id:=(v_item->>'questionId')::uuid;
       IF v_question_id=ANY(v_seen)
       THEN RAISE EXCEPTION 'S4B3B2_DUPLICATE_QUESTION' USING ERRCODE='22023'; END IF;
       v_seen:=array_append(v_seen,v_question_id);
       SELECT * INTO v_question FROM public.quiz_questions q
        WHERE q.id=v_question_id AND q.assessment_id=p_assessment_id;
       IF NOT FOUND THEN
         RAISE EXCEPTION 'S4B3B2_INVALID_QUESTION' USING ERRCODE='42501'; END IF;

       IF v_question.question_type::text IN ('mcq','true_false') THEN
         IF jsonb_typeof(v_item->'choiceId') IS DISTINCT FROM 'string'
          OR (v_item ? 'answerText'
             AND jsonb_typeof(v_item->'answerText') IS DISTINCT FROM 'null')
         THEN RAISE EXCEPTION 'S4B3B2_INVALID_CHOICE' USING ERRCODE='22023'; END IF;
         v_choice_id:=(v_item->>'choiceId')::uuid;
         IF NOT EXISTS (
           SELECT 1 FROM public.quiz_choices ch
           WHERE ch.id=v_choice_id AND ch.question_id=v_question_id
         ) THEN RAISE EXCEPTION 'S4B3B2_FOREIGN_CHOICE' USING ERRCODE='42501'; END IF;
         v_text:=NULL;
       ELSIF v_question.question_type::text='short_text' THEN
         IF (v_item ? 'choiceId' AND
              jsonb_typeof(v_item->'choiceId') IS DISTINCT FROM 'null')
           OR jsonb_typeof(v_item->'answerText') IS DISTINCT FROM 'string'
         THEN RAISE EXCEPTION 'S4B3B2_INVALID_TEXT' USING ERRCODE='22023'; END IF;
         v_text:=NULLIF(pg_catalog.btrim(v_item->>'answerText'),'');
         IF v_text IS NULL OR char_length(v_text)>10000
         THEN RAISE EXCEPTION 'S4B3B2_INVALID_TEXT' USING ERRCODE='22023'; END IF;
         v_choice_id:=NULL;
       ELSE
         RAISE EXCEPTION 'S4B3B2_UNSUPPORTED_QUESTION' USING ERRCODE='22023';
       END IF;
     END LOOP;

     v_count:=jsonb_array_length(v_answers);
     IF p_action='submit' AND v_count=0 AND v_freeform IS NULL
     THEN RAISE EXCEPTION 'S4B3B2_EMPTY_SUBMISSION' USING ERRCODE='22023'; END IF;

     -- Suppression/recreation sous le verrou de la copie, dans la MEME
     -- transaction SQL : aucune reponse partielle si erreur.
     DELETE FROM public.submission_answers sa WHERE sa.submission_id=v_submission.id;
     FOR v_item IN SELECT value FROM jsonb_array_elements(v_answers)
     LOOP
       INSERT INTO public.submission_answers(
         submission_id,question_id,choice_id,answer_text,is_correct
       ) VALUES (
         v_submission.id,(v_item->>'questionId')::uuid,
         NULLIF(v_item->>'choiceId','')::uuid,
         NULLIF(pg_catalog.btrim(v_item->>'answerText'),''),NULL
       );
     END LOOP;

     UPDATE public.assessment_submissions s
     SET freeform_answer=v_freeform,
       status=CASE WHEN p_action='submit' THEN 'submitted'::public.submission_status
                   ELSE 'in_progress'::public.submission_status END,
       submitted_at=CASE WHEN p_action='submit' THEN v_now ELSE NULL END
     WHERE s.id=v_submission.id;
     SELECT * INTO v_submission FROM public.assessment_submissions s
      WHERE s.id=v_submission.id;
   END IF;
 END IF;

 SELECT jsonb_build_object(
   'courseId',p_course_id,'assessmentId',p_assessment_id,
   'attemptId',v_submission.id,
   'status',CASE WHEN v_submission.id IS NULL
      THEN 'not_started' ELSE v_submission.status::text END,
   'startedAt',v_submission.started_at,'submittedAt',v_submission.submitted_at,
   'serverNow',clock_timestamp(),'dueAt',v_assessment.due_at,
   'expiresAt',v_deadline,'freeformAnswer',v_submission.freeform_answer,
   'answers',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'questionId',sa.question_id,'choiceId',sa.choice_id,
       'answerText',sa.answer_text
     ) ORDER BY q.order_index,q.id)
     FROM public.submission_answers sa
     JOIN public.quiz_questions q ON q.id=sa.question_id
     WHERE sa.submission_id=v_submission.id AND q.assessment_id=p_assessment_id
   ),'[]'::jsonb)
 ) INTO v_output;
 RETURN v_output;
END;
$s4b3b2$;
REVOKE ALL ON FUNCTION schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)
 TO authenticated;

CREATE FUNCTION public.schoolnet_student_school_assessment_attempt(
 p_course_id uuid,p_assessment_id uuid,p_action text,
 p_answers jsonb DEFAULT '[]'::jsonb,p_freeform_answer text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog AS $s4b3b2$
 SELECT schoolnet_private.student_school_assessment_attempt(
   p_course_id,p_assessment_id,p_action,p_answers,p_freeform_answer);
$s4b3b2$;
REVOKE ALL ON FUNCTION public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)
 TO authenticated;

-- Seules les deux fonctions historiques de progression/notification
-- changent, et uniquement pour EXCLURE l'evaluation officielle.

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
  end if;  -- S4-B.3-B.2 : ne jamais alimenter student_progress V1 pour un cours
  -- dont l'evaluation a ete officiellement rattachee, meme si elle est revoquee.
  IF EXISTS (SELECT 1 FROM schoolnet_private.school_assessment_links al
             WHERE al.assessment_id=v_assessment_id) THEN
    IF tg_op='DELETE' THEN RETURN old; END IF;
    RETURN new;
  END IF;

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
$function$

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

DO $s4b3b2_postflight$
BEGIN
 IF to_regprocedure('schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NULL
 OR to_regprocedure('public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NULL
 OR has_function_privilege('anon','public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('anon','schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated','schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR (SELECT prosecdef FROM pg_proc WHERE oid='public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)'::regprocedure)
 OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)'::regprocedure)
 THEN RAISE EXCEPTION 'S4B3B2_POSTFLIGHT_FAILED'; END IF;
END $s4b3b2_postflight$;
SELECT 'S4B3B2_OFFICIAL_ATTEMPTS_SQL_PASS' AS result;
