-- SCHOOLNET S4-B.3-B.0 : ROLLBACK MANUEL NON EXÉCUTÉ
-- Les sept fonctions d'origine sont préservées ici sous leur définition exacte
-- lue en production avant développement. Rétablit les droits historiques
-- sans effacer aucun rendu, réponse ou note.
-- À n'exécuter que sous autorisation distincte et après revue.

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

-- Restaurer les grants historiques réels seulement lorsqu'ils existaient.
-- La fonction de recalcul était exécutable par ces trois rôles avant B.0.
REVOKE EXECUTE ON FUNCTION mark_homework_submission_as_graded(uuid,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mark_homework_submission_as_graded(uuid,numeric,text,text) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION mark_homework_submission_as_graded(uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mark_homework_submission_as_graded(uuid,numeric,text) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION mark_submission_as_graded_v2(uuid,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mark_submission_as_graded_v2(uuid,text,numeric,text) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION mark_submission_as_graded(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mark_submission_as_graded(uuid,text) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION publish_assessment_submission(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION publish_assessment_submission(uuid) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION publish_homework_submission(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION publish_homework_submission(uuid) TO anon,authenticated,service_role;
REVOKE EXECUTE ON FUNCTION recalculate_submission_score(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION recalculate_submission_score(uuid) TO anon,authenticated,service_role;

DROP TRIGGER IF EXISTS trg_s4b3b0_protect_assessment_submissions ON public.assessment_submissions;
DROP TRIGGER IF EXISTS trg_s4b3b0_protect_homework_submissions ON public.homework_submissions;
DROP FUNCTION IF EXISTS schoolnet_private.s4b3b0_protect_student_submission();
DROP POLICY IF EXISTS s4b3b0_assessment_catalog_guard ON public.assessments;
DROP POLICY IF EXISTS s4b3b0_questions_guard ON public.quiz_questions;
DROP POLICY IF EXISTS s4b3b0_correct_choices_guard ON public.quiz_choices;
DROP POLICY IF EXISTS s4b3b0_online_submissions_guard ON public.assessment_submissions;
DROP POLICY IF EXISTS s4b3b0_homework_submissions_guard ON public.homework_submissions;
DROP POLICY IF EXISTS s4b3b0_legacy_submissions_guard ON public.submissions;
DROP POLICY IF EXISTS s4b3b0_submission_answers_guard ON public.submission_answers;
DROP POLICY IF EXISTS s4b3b0_question_grades_guard ON public.submission_question_grades;
DROP FUNCTION IF EXISTS schoolnet_private.s4b3b0_is_official_submission(uuid);
DROP FUNCTION IF EXISTS schoolnet_private.s4b3b0_is_official_question(uuid);
DROP FUNCTION IF EXISTS schoolnet_private.s4b3b0_is_official_assessment(uuid);
DO $verify$
BEGIN
 IF to_regprocedure('schoolnet_private.s4b3b0_is_official_assessment(uuid)') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND policyname LIKE 's4b3b0_%')
 THEN RAISE EXCEPTION 'S4B3B0_ROLLBACK_FAILED'; END IF;
END $verify$;
SELECT 'S4B3B0_SECURITY_ROLLBACK_PASS' AS result;
