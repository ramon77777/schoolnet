-- SCHOOLNET V2 / S4-B.3-B.3 : PROPOSITION NON APPLIQUEE SUR LA PRODUCTION.
-- Suivi, notation et publication officielles; preserves RLS B.0 et V1.
DO $pre$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_copies(uuid)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_student_official_published_result(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('schoolnet_private.teacher_school_assessment_context(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_assessment_preview(uuid,uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)') IS NULL
  OR to_regprocedure('public.notify_assessment_correction_published()') IS NULL
 THEN RAISE EXCEPTION 'S4B3B3_PREFLIGHT_FAILED'; END IF;
END $pre$;

CREATE FUNCTION schoolnet_private.teacher_official_grading_link(p_assessment_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $b3$
DECLARE
 v_uid uuid:=auth.uid();
 v_context jsonb;
 v_link uuid;
BEGIN
 IF v_uid IS NULL OR p_assessment_id IS NULL
  OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN RAISE EXCEPTION 'S4B3B3_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 v_context:=schoolnet_private.teacher_school_assessment_context(p_assessment_id);
 IF (v_context->>'eligible')::boolean IS DISTINCT FROM TRUE
  OR (v_context->>'linked')::boolean IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'S4B3B3_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT cl.id INTO v_link
 FROM schoolnet_private.school_assessment_links al
 JOIN schoolnet_private.school_course_links cl
   ON cl.id=al.school_course_link_id AND cl.status='active' AND cl.teacher_id=v_uid
 JOIN public.assessments a
   ON a.id=al.assessment_id AND a.course_id=cl.course_id
    AND a.created_by=v_uid AND a.status::text IN ('published','closed')
 JOIN public.courses co
   ON co.id=cl.course_id AND co.created_by=v_uid AND co.status='active'
 JOIN public.schoolnet_schools sch
   ON sch.id=cl.school_id AND sch.status='active'
 JOIN public.classes c
   ON c.id=cl.class_id AND c.school_id=cl.school_id
    AND c.school_year_id=cl.school_year_id AND c.learning_context='school'
 JOIN public.schoolnet_school_teacher_subject_assignments ta
   ON ta.id=cl.teacher_assignment_id AND ta.school_id=cl.school_id
    AND ta.class_id=cl.class_id AND ta.school_year_id=cl.school_year_id
    AND ta.teacher_id=v_uid AND ta.subject_id=cl.subject_id AND ta.status='active'
 JOIN public.schoolnet_school_memberships tm
   ON tm.school_id=cl.school_id AND tm.user_id=v_uid
    AND tm.member_role='teacher' AND tm.status='active'
 WHERE al.assessment_id=p_assessment_id AND al.status='active'
 ORDER BY cl.linked_at DESC LIMIT 1;
 IF v_link IS NULL THEN
  RAISE EXCEPTION 'S4B3B3_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN v_link;
END $b3$;

-- Vue de classe: in_progress visible mais reponses masquees;
-- questions/corrections reservees a l'enseignant habilite.
CREATE FUNCTION schoolnet_private.teacher_official_copies(p_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $b3$
DECLARE
 v_link schoolnet_private.school_course_links%ROWTYPE;
 v_a public.assessments%ROWTYPE;
 v_size integer;
 v_counts jsonb;
 v_copies jsonb;
 v_questions jsonb;
BEGIN
 SELECT * INTO v_link FROM schoolnet_private.school_course_links
  WHERE id=schoolnet_private.teacher_official_grading_link(p_assessment_id);
 SELECT * INTO v_a FROM public.assessments WHERE id=p_assessment_id;
 SELECT COUNT(DISTINCT sa.student_id) INTO v_size
 FROM public.schoolnet_school_student_class_assignments sa
 JOIN public.schoolnet_school_memberships sm ON sm.school_id=sa.school_id
  AND sm.user_id=sa.student_id AND sm.member_role='student' AND sm.status='active'
 JOIN public.profiles p ON p.id=sa.student_id AND p.role::text='student'
 WHERE sa.school_id=v_link.school_id AND sa.class_id=v_link.class_id
  AND sa.school_year_id=v_link.school_year_id AND sa.status='active';

 SELECT jsonb_build_object(
 'notStarted',GREATEST(v_size-count(*),0),
 'inProgress',count(*) FILTER(WHERE s.status::text='in_progress'),
 'submitted',count(*) FILTER(WHERE s.status::text='submitted'),
 'graded',count(*) FILTER(WHERE s.status::text='graded'),
 'published',count(*) FILTER(WHERE s.status::text='published')
 ) INTO v_counts FROM public.assessment_submissions s
 WHERE s.assessment_id=p_assessment_id AND EXISTS (
  SELECT 1 FROM public.schoolnet_school_student_class_assignments sa
  JOIN public.schoolnet_school_memberships sm
   ON sm.school_id=sa.school_id AND sm.user_id=sa.student_id
    AND sm.member_role='student' AND sm.status='active'
  WHERE sa.school_id=v_link.school_id AND sa.class_id=v_link.class_id
   AND sa.school_year_id=v_link.school_year_id
   AND sa.student_id=s.student_id AND sa.status='active'
 );

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',s.id,
  'studentName',COALESCE(NULLIF(pg_catalog.btrim(p.full_name),''),'Élève'),
  'status',s.status::text,'startedAt',s.started_at,
  'submittedAt',s.submitted_at,'gradedAt',s.graded_at,
  'publishedAt',s.published_at,
  'score',CASE WHEN s.status::text IN ('graded','published') THEN s.score ELSE NULL END,
  'feedback',CASE WHEN s.status::text IN ('graded','published') THEN s.feedback ELSE NULL END,
  'freeformAnswer',CASE WHEN s.status::text='in_progress' THEN NULL ELSE s.freeform_answer END,
  'answers',CASE WHEN s.status::text='in_progress' THEN '[]'::jsonb ELSE
   COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'questionId',sa.question_id,'choiceId',sa.choice_id,
     'answerText',sa.answer_text) ORDER BY q.order_index,q.id)
    FROM public.submission_answers sa JOIN public.quiz_questions q
     ON q.id=sa.question_id AND q.assessment_id=p_assessment_id
    WHERE sa.submission_id=s.id),'[]'::jsonb) END
 ) ORDER BY s.submitted_at DESC NULLS LAST,s.started_at DESC),'[]'::jsonb)
 INTO v_copies
 FROM (
  SELECT ss.* FROM public.assessment_submissions ss
  WHERE ss.assessment_id=p_assessment_id
   AND EXISTS (
    SELECT 1 FROM public.schoolnet_school_student_class_assignments sa
    JOIN public.schoolnet_school_memberships sm
     ON sm.school_id=sa.school_id AND sm.user_id=sa.student_id
      AND sm.member_role='student' AND sm.status='active'
    WHERE sa.school_id=v_link.school_id AND sa.class_id=v_link.class_id
      AND sa.school_year_id=v_link.school_year_id
      AND sa.student_id=ss.student_id AND sa.status='active'
   )
  ORDER BY ss.submitted_at DESC NULLS LAST,ss.started_at DESC LIMIT 250
 ) s JOIN public.profiles p ON p.id=s.student_id AND p.role::text='student';

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',q.id,'type',q.question_type::text,'prompt',q.prompt,
  'orderIndex',q.order_index,
  'choices',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',ch.id,'text',ch.choice_text,'isCorrect',ch.is_correct,
    'orderIndex',ch.order_index) ORDER BY ch.order_index,ch.id)
   FROM public.quiz_choices ch WHERE ch.question_id=q.id),'[]'::jsonb)
 ) ORDER BY q.order_index,q.id),'[]'::jsonb)
 INTO v_questions FROM public.quiz_questions q WHERE q.assessment_id=p_assessment_id;

 RETURN jsonb_build_object(
  'assessmentId',v_a.id,'courseId',v_a.course_id,'title',v_a.title,
  'maxScore',v_a.max_score,'classSize',v_size,'counts',v_counts,
  'questions',v_questions,'copies',v_copies
 );
END $b3$;

-- L'enseignant peut corriger une copie submitted, ou revoir une copie graded,
-- jamais une copie in_progress ni already published. Note manuelle sur le bareme.
CREATE FUNCTION schoolnet_private.teacher_official_grade(
 p_assessment_id uuid,p_submission_id uuid,p_action text,
 p_score numeric DEFAULT NULL,p_feedback text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog AS $b3$
DECLARE
 v_link schoolnet_private.school_course_links%ROWTYPE;
 v_a public.assessments%ROWTYPE;
 v_s public.assessment_submissions%ROWTYPE;
 v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_submission_id IS NULL OR p_action NOT IN ('grade','publish')
 THEN RAISE EXCEPTION 'S4B3B3_INVALID_ACTION' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_link FROM schoolnet_private.school_course_links
  WHERE id=schoolnet_private.teacher_official_grading_link(p_assessment_id);
 SELECT * INTO v_a FROM public.assessments WHERE id=p_assessment_id FOR SHARE;
 IF v_a.max_score IS NULL
 THEN RAISE EXCEPTION 'S4B3B3_MISSING_MAX_SCORE' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_s FROM public.assessment_submissions
  WHERE id=p_submission_id AND assessment_id=p_assessment_id FOR UPDATE;
 IF v_s.id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.schoolnet_school_student_class_assignments sa
  JOIN public.schoolnet_school_memberships sm ON sm.school_id=sa.school_id
   AND sm.user_id=sa.student_id AND sm.member_role='student' AND sm.status='active'
  JOIN public.profiles p ON p.id=sa.student_id AND p.role::text='student'
  WHERE sa.school_id=v_link.school_id AND sa.class_id=v_link.class_id
   AND sa.school_year_id=v_link.school_year_id AND sa.status='active'
   AND sa.student_id=v_s.student_id
 ) THEN RAISE EXCEPTION 'S4B3B3_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_action='grade' THEN
  IF v_s.status::text NOT IN ('submitted','graded')
   OR p_score IS NULL OR p_score<0 OR p_score>v_a.max_score
   OR p_score<>round(p_score,2)
   OR p_feedback IS NULL OR char_length(pg_catalog.btrim(p_feedback))=0
   OR char_length(p_feedback)>4000
  THEN RAISE EXCEPTION 'S4B3B3_INVALID_GRADE' USING ERRCODE='22023'; END IF;
  UPDATE public.assessment_submissions SET
   status='graded',score=p_score,feedback=pg_catalog.btrim(p_feedback),
   graded_by=auth.uid(),graded_at=v_now,published_at=NULL
   WHERE id=v_s.id;
 ELSE
  IF v_s.status::text<>'graded' OR v_s.score IS NULL
   OR v_s.graded_by IS NULL OR v_s.graded_at IS NULL
   OR p_score IS NOT NULL OR p_feedback IS NOT NULL
  THEN RAISE EXCEPTION 'S4B3B3_CANNOT_PUBLISH' USING ERRCODE='42501'; END IF;
  UPDATE public.assessment_submissions
  SET status='published',published_at=v_now WHERE id=v_s.id;
  INSERT INTO public.notifications(
    user_id,title,body,type,is_read,event_key,related_id,action_url
  ) VALUES (
    v_s.student_id,'Résultat officiel disponible',
    'Le résultat de « '||v_a.title||' » est disponible.',
    'success'::public.notification_type,false,
    'school:assessment:result:published',v_s.id,
    '/app/student/school-courses/'||v_a.course_id::text||
      '/assessments/'||v_a.id::text||'/take'
  ) ON CONFLICT DO NOTHING;
 END IF;
 SELECT * INTO v_s FROM public.assessment_submissions WHERE id=p_submission_id;
 RETURN jsonb_build_object(
  'submissionId',v_s.id,'status',v_s.status::text,
  'score',v_s.score,'maxScore',v_a.max_score,'feedback',v_s.feedback,
  'gradedAt',v_s.graded_at,'publishedAt',v_s.published_at
 );
END $b3$;

-- Eleve: resultat seulement pour sa propre copie deja published;
-- la fonction B.1 revalide l'affectation/etablissement a chaque lecture.
CREATE FUNCTION schoolnet_private.student_official_published_result(
 p_course_id uuid,p_assessment_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $b3$
DECLARE v_uid uuid:=auth.uid(); v_result jsonb;
BEGIN
 PERFORM schoolnet_private.student_school_assessment_preview(
 p_course_id,p_assessment_id);
 SELECT jsonb_build_object(
  'assessmentId',a.id,'submissionId',s.id,
  'score',s.score,'maxScore',a.max_score,
  'feedback',s.feedback,'gradedAt',s.graded_at,'publishedAt',s.published_at
 ) INTO v_result FROM public.assessment_submissions s
 JOIN public.assessments a ON a.id=s.assessment_id
 WHERE s.student_id=v_uid AND s.status::text='published'
  AND s.score IS NOT NULL AND s.published_at IS NOT NULL
  AND a.id=p_assessment_id AND a.course_id=p_course_id;
 RETURN v_result;
END $b3$;

-- Fonctions privees : EXECUTE uniquement pour la fonction protegee,
-- les roles anonymous n'ont AUCUN acces, et aucun bypass RLS public.
REVOKE ALL ON FUNCTION schoolnet_private.teacher_official_grading_link(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.teacher_official_copies(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.teacher_official_grade(uuid,uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.student_official_published_result(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.teacher_official_grading_link(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.teacher_official_copies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.teacher_official_grade(uuid,uuid,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.student_official_published_result(uuid,uuid) TO authenticated;

CREATE FUNCTION public.schoolnet_teacher_official_copies(p_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog AS $b3$
 SELECT schoolnet_private.teacher_official_copies(p_assessment_id);
$b3$;
CREATE FUNCTION public.schoolnet_teacher_official_grade(
 p_assessment_id uuid,p_submission_id uuid,p_action text,
 p_score numeric DEFAULT NULL,p_feedback text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog AS $b3$
 SELECT schoolnet_private.teacher_official_grade(
  p_assessment_id,p_submission_id,p_action,p_score,p_feedback);
$b3$;
CREATE FUNCTION public.schoolnet_student_official_published_result(
 p_course_id uuid,p_assessment_id uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog AS $b3$
 SELECT schoolnet_private.student_official_published_result(
  p_course_id,p_assessment_id);
$b3$;
REVOKE ALL ON FUNCTION public.schoolnet_teacher_official_copies(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_student_official_published_result(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_teacher_official_copies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_official_published_result(uuid,uuid) TO authenticated;

-- Le trigger V1 reste inchange pour les evaluations non officielles.

CREATE OR REPLACE FUNCTION public.notify_assessment_correction_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_assessment_title text;
  v_student_name text;
begin
  -- S4-B.3-B.3 : les corrections officielles envoient une notification
  -- vers le cours scolaire, jamais vers les routes historiques V1.
  IF EXISTS (SELECT 1 FROM schoolnet_private.school_assessment_links al
             WHERE al.assessment_id=NEW.assessment_id)
  THEN RETURN NEW; END IF;

  -- Seulement lorsque la correction devient publiée.
  if new.status::text <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.status::text = 'published' then
    return new;
  end if;


  select a.title
  into v_assessment_title
  from public.assessments a
  where a.id = new.assessment_id;


  select coalesce(
    nullif(trim(p.full_name), ''),
    'Élève'
  )
  into v_student_name
  from public.profiles p
  where p.id = new.student_id;


  -- ----------------------------------------------------------
  -- Notification de l'élève
  -- ----------------------------------------------------------

  insert into public.notifications (
    user_id,
    title,
    body,
    type,
    is_read,
    event_key,
    related_id,
    action_url
  )
  values (
    new.student_id,
    'Correction disponible',
    'La correction de "'
      || coalesce(v_assessment_title, 'votre évaluation')
      || '" est disponible.',
    'success',
    false,
    'correction_published',
    new.id,
    '/app/student/assessments/'
      || new.assessment_id::text
      || '/result'
  )
  on conflict do nothing;


  -- ----------------------------------------------------------
  -- Notification des parents liés à cet élève
  -- ----------------------------------------------------------

  insert into public.notifications (
    user_id,
    title,
    body,
    type,
    is_read,
    event_key,
    related_id,
    action_url
  )
  select
    parent.id,
    'Correction disponible',
    'La correction de "'
      || coalesce(v_assessment_title, 'une évaluation')
      || '" de '
      || coalesce(v_student_name, 'votre enfant')
      || ' est disponible.',
    'success',
    false,
    'correction_published',
    new.id,
    '/app/parent/results/'
      || new.assessment_id::text
      || '?childId='
      || new.student_id::text
  from public.profiles parent
  join public.parent_links pl
    on pl.parent_id = parent.id
   and pl.student_id = new.student_id
  where parent.role = 'parent'
  on conflict do nothing;


  return new;
end;
$function$;

DO $post$
BEGIN
 IF to_regprocedure('public.schoolnet_teacher_official_copies(uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text)') IS NULL
  OR to_regprocedure('public.schoolnet_student_official_published_result(uuid,uuid)') IS NULL
  OR has_function_privilege('anon','public.schoolnet_teacher_official_copies(uuid)','EXECUTE')
  OR has_function_privilege('anon','public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text)','EXECUTE')
  OR has_function_privilege('anon','public.schoolnet_student_official_published_result(uuid,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.schoolnet_teacher_official_copies(uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.schoolnet_student_official_published_result(uuid,uuid)','EXECUTE')
  OR (SELECT prosecdef FROM pg_proc WHERE oid='public.schoolnet_teacher_official_grade(uuid,uuid,text,numeric,text)'::regprocedure)
  OR NOT (SELECT prosecdef FROM pg_proc WHERE oid='schoolnet_private.teacher_official_grade(uuid,uuid,text,numeric,text)'::regprocedure)
 THEN RAISE EXCEPTION 'S4B3B3_POSTFLIGHT_FAILED'; END IF;
END $post$;
SELECT 'S4B3B3_OFFICIAL_TEACHER_GRADING_PASS' AS result;
