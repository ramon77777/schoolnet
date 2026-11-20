-- SCHOOLNET S4-B.3-B.0 / POSTGRES JETABLE EXCLUSIVEMENT.
-- Fixture V1 minimale : autorisations et RPC historiquement permissives.
ALTER TABLE public.assessments ADD COLUMN max_score numeric;
ALTER TABLE public.assessments ADD COLUMN exam_file_max_score numeric;
ALTER TABLE public.assessments ADD COLUMN exam_content_mode text;
CREATE TYPE public.submission_status AS ENUM ('in_progress','submitted','graded','published');
CREATE TABLE public.assessment_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES public.assessments(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 status public.submission_status NOT NULL DEFAULT 'in_progress',
 score numeric,feedback text,started_at timestamptz DEFAULT now(),
 submitted_at timestamptz,graded_at timestamptz,
 graded_by uuid REFERENCES public.profiles(id),published_at timestamptz,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 freeform_answer text,freeform_score numeric,freeform_feedback text,
 UNIQUE(assessment_id,student_id)
);
CREATE TABLE public.homework_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 homework_id uuid NOT NULL REFERENCES public.assessments(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 file_url text,file_name text,note text,submitted_at timestamptz,
 status public.submission_status NOT NULL DEFAULT 'in_progress',
 score numeric,feedback text,graded_at timestamptz,
 graded_by uuid REFERENCES public.profiles(id),published_at timestamptz,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 detailed_feedback text, UNIQUE(homework_id,student_id)
);
CREATE TABLE public.submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES public.assessments(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 status public.submission_status NOT NULL DEFAULT 'in_progress',
 score numeric,feedback text,
 UNIQUE(assessment_id,student_id)
);
CREATE TABLE public.quiz_questions (
 id uuid PRIMARY KEY,assessment_id uuid NOT NULL REFERENCES public.assessments(id),
 question_type text NOT NULL DEFAULT 'mcq',prompt text NOT NULL,order_index integer NOT NULL
);
CREATE TABLE public.quiz_choices (
 id uuid PRIMARY KEY,question_id uuid NOT NULL REFERENCES public.quiz_questions(id),
 choice_text text NOT NULL,is_correct boolean NOT NULL DEFAULT false,order_index integer NOT NULL DEFAULT 0
);
CREATE TABLE public.submission_answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.assessment_submissions(id),
 question_id uuid NOT NULL REFERENCES public.quiz_questions(id),
 answer_text text,choice_id uuid REFERENCES public.quiz_choices(id),is_correct boolean,
 UNIQUE(submission_id,question_id)
);
CREATE TABLE public.submission_question_grades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.assessment_submissions(id),
 question_id uuid NOT NULL REFERENCES public.quiz_questions(id),
 points_awarded numeric,max_points numeric NOT NULL DEFAULT 0,
 feedback text,graded_by uuid REFERENCES public.profiles(id),
 UNIQUE(submission_id,question_id)
);
CREATE FUNCTION public.can_manage_course(course_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT COALESCE(public.is_admin() OR EXISTS (
  SELECT 1 FROM public.courses c WHERE c.id=course_uuid AND c.created_by=auth.uid()),false);
$f$;
CREATE FUNCTION public.can_access_course(course_uuid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT COALESCE(public.can_manage_course(course_uuid) OR EXISTS (
  SELECT 1 FROM public.course_enrollments ce WHERE ce.course_id=course_uuid
   AND ce.student_id=auth.uid()),false);
$f$;
CREATE FUNCTION public.is_assessment_owner(p_assessment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT COALESCE(EXISTS(SELECT 1 FROM public.assessments a
  WHERE a.id=p_assessment_id AND a.created_by=auth.uid()),false);
$f$;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_question_grades ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON
 public.assessments,public.quiz_questions,public.quiz_choices,
 public.assessment_submissions,public.homework_submissions,public.submissions,
 public.submission_answers,public.submission_question_grades TO authenticated;
CREATE POLICY ci_assessments_read ON public.assessments FOR SELECT TO authenticated
 USING(public.can_access_course(course_id));
CREATE POLICY ci_questions_read ON public.quiz_questions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.assessments a WHERE a.id=assessment_id
  AND public.can_access_course(a.course_id)));
CREATE POLICY ci_choices_read ON public.quiz_choices FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.quiz_questions q JOIN public.assessments a
  ON a.id=q.assessment_id WHERE q.id=question_id AND public.can_access_course(a.course_id)));
CREATE POLICY ci_student_assessment_all ON public.assessment_submissions FOR ALL TO authenticated
 USING(student_id=auth.uid()) WITH CHECK(student_id=auth.uid());
CREATE POLICY ci_teacher_assessment_read ON public.assessment_submissions FOR SELECT TO authenticated
 USING(public.is_assessment_owner(assessment_id));
CREATE POLICY ci_student_homework_all ON public.homework_submissions FOR ALL TO authenticated
 USING(student_id=auth.uid()) WITH CHECK(student_id=auth.uid());
CREATE POLICY ci_teacher_homework_read ON public.homework_submissions FOR SELECT TO authenticated
 USING(public.is_assessment_owner(homework_id));
CREATE POLICY ci_student_legacy_all ON public.submissions FOR ALL TO authenticated
 USING(student_id=auth.uid()) WITH CHECK(student_id=auth.uid());
CREATE POLICY ci_student_answers_all ON public.submission_answers FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.assessment_submissions s
 WHERE s.id=submission_id AND s.student_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_submissions s
 WHERE s.id=submission_id AND s.student_id=auth.uid()));
CREATE POLICY ci_teacher_answers_select ON public.submission_answers FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.assessment_submissions s WHERE s.id=submission_id
 AND public.is_assessment_owner(s.assessment_id)));
CREATE POLICY ci_teacher_grades_all ON public.submission_question_grades FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.assessment_submissions s WHERE s.id=submission_id
 AND public.is_assessment_owner(s.assessment_id)))
 WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_submissions s WHERE s.id=submission_id
 AND public.is_assessment_owner(s.assessment_id)));
-- RPC exactes d'origine, capturées en lecture seule depuis Supabase principal.
CREATE OR REPLACE FUNCTION public.mark_homework_submission_as_graded(p_submission_id uuid, p_score numeric, p_feedback text, p_detailed_feedback text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.homework_submissions hs
  set
    status = 'graded',
    score = p_score,
    feedback = p_feedback,
    detailed_feedback = p_detailed_feedback,
    graded_at = now(),
    graded_by = auth.uid(),
    updated_at = now()
  where hs.id = p_submission_id
    and exists (
      select 1
      from public.assessments a
      where a.id = hs.homework_id
        and a.created_by = auth.uid()
        and a.type = 'assignment'
    );

  if not found then
    raise exception 'Rendu introuvable ou non autorisé.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_homework_submission_as_graded(p_submission_id uuid, p_score numeric, p_feedback text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.homework_submissions hs
  set
    status = 'graded',
    score = p_score,
    feedback = p_feedback,
    graded_at = now(),
    graded_by = auth.uid(),
    updated_at = now()
  where hs.id = p_submission_id
    and exists (
      select 1
      from public.assessments a
      where a.id = hs.homework_id
        and a.created_by = auth.uid()
        and a.type = 'assignment'
    );

  if not found then
    raise exception 'Rendu introuvable ou non autorisé.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_submission_as_graded_v2(p_submission_id uuid, p_feedback text DEFAULT NULL::text, p_freeform_score numeric DEFAULT NULL::numeric, p_freeform_feedback text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_question_total numeric(10,2) := 0;
  v_file_score numeric(10,2) := 0;
  v_file_max numeric(10,2) := 0;
  v_assessment_max numeric(10,2) := 0;
  v_exam_content_mode text;
  v_total numeric(10,2) := 0;
  v_has_file_part boolean := false;
begin
  /*
   * Vérifie que la soumission existe
   * et que l'évaluation appartient bien à l'enseignant connecté.
   */
  select
    coalesce(a.max_score, 0),
    coalesce(a.exam_file_max_score, 0),
    a.exam_content_mode
  into
    v_assessment_max,
    v_file_max,
    v_exam_content_mode
  from public.assessment_submissions s
  join public.assessments a
    on a.id = s.assessment_id
  where s.id = p_submission_id
    and a.created_by = auth.uid();

  if not found then
    raise exception
      'Soumission introuvable ou non autorisée.';
  end if;

  v_has_file_part :=
    v_exam_content_mode in (
      'file_and_questions',
      'file_only'
    );

  /*
   * Total des questions SchoolNet.
   */
  select
    coalesce(sum(points_awarded), 0)
  into v_question_total
  from public.submission_question_grades
  where submission_id = p_submission_id;

  /*
   * Partie sujet fichier.
   */
  if v_has_file_part then
    v_file_score := coalesce(p_freeform_score, 0);

    if v_file_score < 0 then
      raise exception
        'La note du sujet fichier ne peut pas être négative.';
    end if;

    if v_file_score > v_file_max then
      raise exception
        'La note du sujet fichier (%) dépasse le maximum autorisé (%).',
        v_file_score,
        v_file_max;
    end if;
  else
    v_file_score := 0;
  end if;

  /*
   * Score global.
   */
  v_total := round(
    v_question_total + v_file_score,
    2
  );

  if v_assessment_max > 0
     and v_total > v_assessment_max then
    raise exception
      'Le score calculé (%) dépasse la note maximale de l''évaluation (%).',
      v_total,
      v_assessment_max;
  end if;

  /*
   * Enregistrement atomique de la correction.
   */
  update public.assessment_submissions
  set
    status = 'graded',
    score = v_total,
    feedback = p_feedback,
    freeform_score =
      case
        when v_has_file_part then v_file_score
        else null
      end,
    freeform_feedback =
      case
        when v_has_file_part
          then nullif(trim(p_freeform_feedback), '')
        else null
      end,
    graded_at = now(),
    graded_by = auth.uid()
  where id = p_submission_id;

  if not found then
    raise exception 'Soumission introuvable.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_submission_as_graded(p_submission_id uuid, p_feedback text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_question_total numeric(10,2);
  v_freeform_score numeric(10,2);
  v_total numeric(10,2);
begin
  -- 1. Total des questions créées dans SchoolNet
  select coalesce(sum(points_awarded), 0)
  into v_question_total
  from public.submission_question_grades
  where submission_id = p_submission_id;

  -- 2. Note attribuée aux réponses du sujet fichier
  select coalesce(freeform_score, 0)
  into v_freeform_score
  from public.assessment_submissions
  where id = p_submission_id;

  if not found then
    raise exception 'Soumission introuvable.';
  end if;

  -- 3. Note finale
  v_total :=
    coalesce(v_question_total, 0)
    +
    coalesce(v_freeform_score, 0);

  -- 4. Enregistrement de la correction
  update public.assessment_submissions
  set
    status = 'graded',
    score = v_total,
    feedback = p_feedback,
    graded_at = now(),
    graded_by = auth.uid()
  where id = p_submission_id;

  if not found then
    raise exception 'Soumission introuvable.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_assessment_submission(p_submission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.assessment_submissions
  set
    status = 'published',
    published_at = now()
  where id = p_submission_id
    and status = 'graded';

  if not found then
    raise exception 'Soumission introuvable ou non corrigée.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.publish_homework_submission(p_submission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.homework_submissions hs
  set
    status = 'published',
    published_at = now(),
    updated_at = now()
  where hs.id = p_submission_id
    and hs.status = 'graded'
    and exists (
      select 1
      from public.assessments a
      where a.id = hs.homework_id
        and a.created_by = auth.uid()
        and a.type = 'assignment'
    );

  if not found then
    raise exception 'Rendu introuvable ou non corrigé.';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_submission_score(p_submission_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_total numeric(8, 2);
begin
  select coalesce(round(sum(coalesce(points_awarded, 0))::numeric, 2), 0)
  into v_total
  from public.submission_question_grades
  where submission_id = p_submission_id;

  update public.submissions
  set score = v_total
  where id = p_submission_id;

  return v_total;
end;
$function$;

