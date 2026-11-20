-- SCHOOLNET V2 - S4-B.3-B.0 - SÉCURITÉ PRÉALABLE (PROPOSITION CI).
-- NE PAS EXÉCUTER sur Supabase principal sans autorisation distincte.
-- Règle de compatibilité : les parcours V1 non officiellement rattachés restent
-- accessibles comme avant ; aucune inscription artificielle ni ligne de note
-- n'est créée. Les évaluations officielles restent non-exécutables (B.1/B.2).
-- Les RPC V1 de correction ne peuvent pas être détournées vers une copie V2.

DO $s4b3b0_preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.s4b3b0_is_official_assessment(uuid)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.s4b3b0_is_official_submission(uuid)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.s4b3b0_is_official_question(uuid)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.s4b3b0_protect_student_submission()') IS NOT NULL
    OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
    OR to_regprocedure('public.get_my_role()') IS NULL
    OR NOT has_schema_privilege('authenticated','schoolnet_private','USAGE')
    OR to_regprocedure('public.mark_submission_as_graded_v2(uuid,text,numeric,text)') IS NULL
    OR to_regprocedure('public.publish_assessment_submission(uuid)') IS NULL
    OR to_regprocedure('public.mark_submission_as_graded(uuid,text)') IS NULL
    OR to_regprocedure('public.publish_homework_submission(uuid)') IS NULL
    OR to_regprocedure('public.mark_homework_submission_as_graded(uuid,numeric,text)') IS NULL
    OR to_regprocedure('public.mark_homework_submission_as_graded(uuid,numeric,text,text)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='assessment_submissions' AND c.relrowsecurity
    )
 THEN RAISE EXCEPTION 'S4B3B0_PREFLIGHT_FAILED'; END IF;
END $s4b3b0_preflight$;

-- Classification irréversible à partir du moment où un opt-in a existé :
-- même un lien révoqué ne permet pas de réutiliser un endpoint V1 pour
-- modifier secrètement une copie ou lire les bonnes réponses.
-- Fonction dans le schéma NON exposé à l'API REST ; seul un booléen est rendu.
CREATE FUNCTION schoolnet_private.s4b3b0_is_official_assessment(p_assessment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $s4b3b0$
 SELECT COALESCE(
  auth.uid() IS NOT NULL AND p_assessment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM schoolnet_private.school_assessment_links al
    WHERE al.assessment_id=p_assessment_id
  ),false);
$s4b3b0$;
REVOKE ALL ON FUNCTION schoolnet_private.s4b3b0_is_official_assessment(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.s4b3b0_is_official_assessment(uuid)
 TO authenticated;

-- La lecture directe des quiz_choices ne doit jamais déduire le caractère
-- officiel d'une question via une sous-requête soumise aux RLS de l'élève.
-- Cette classification privée consulte les métadonnées sans dévoiler is_correct.
CREATE FUNCTION schoolnet_private.s4b3b0_is_official_question(p_question_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog AS $s4b3b0$
 SELECT COALESCE(
  auth.uid() IS NOT NULL AND p_question_id IS NOT NULL
  AND EXISTS(
   SELECT 1 FROM public.quiz_questions q
   JOIN schoolnet_private.school_assessment_links al ON al.assessment_id=q.assessment_id
   WHERE q.id=p_question_id
  ),false);
$s4b3b0$;
REVOKE ALL ON FUNCTION schoolnet_private.s4b3b0_is_official_question(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.s4b3b0_is_official_question(uuid)
 TO authenticated;

CREATE FUNCTION schoolnet_private.s4b3b0_is_official_submission(p_submission_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $s4b3b0$
 SELECT COALESCE(
  auth.uid() IS NOT NULL AND p_submission_id IS NOT NULL
  AND (
   EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    JOIN schoolnet_private.school_assessment_links al ON al.assessment_id=s.assessment_id
    WHERE s.id=p_submission_id
   )
   OR EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN schoolnet_private.school_assessment_links al ON al.assessment_id=s.assessment_id
    WHERE s.id=p_submission_id
   )
  ),false);
$s4b3b0$;
REVOKE ALL ON FUNCTION schoolnet_private.s4b3b0_is_official_submission(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.s4b3b0_is_official_submission(uuid)
 TO authenticated;

-- Policies restrictives : AND avec TOUTES les policies permissives V1.
-- Aucune élévation de privilèges ; pas de DROP de policy historique.
-- Les enseignants propriétaires conservent l'accès aux évaluations et
-- questions ; les COPIES officielles restent totalement privées jusqu'aux
-- RPC B.4, y compris face aux écritures directes de leur enseignant.
CREATE POLICY s4b3b0_assessment_catalog_guard
 ON public.assessments AS RESTRICTIVE FOR SELECT TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_assessment(id)
  OR public.can_manage_course(course_id)
 );
CREATE POLICY s4b3b0_questions_guard
 ON public.quiz_questions AS RESTRICTIVE FOR SELECT TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id)
  OR EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id=quiz_questions.assessment_id
      AND public.can_manage_course(a.course_id)
  )
 );
CREATE POLICY s4b3b0_correct_choices_guard
 ON public.quiz_choices AS RESTRICTIVE FOR SELECT TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_question(question_id)
  OR EXISTS (
    SELECT 1 FROM public.quiz_questions q
    JOIN public.assessments a ON a.id=q.assessment_id
    WHERE q.id=quiz_choices.question_id
      AND public.can_manage_course(a.course_id)
  )
 );

-- Une policy restrictive FOR ALL protège simultanément SELECT, INSERT,
-- UPDATE et DELETE, y compris lorsqu'une policy V1 permissive existe.
-- Les services futurs de remise officiels B.2 passeront par des RPC privés,
-- avec un contrôle préalable du droit scolaire et une écriture atomique.
CREATE POLICY s4b3b0_online_submissions_guard
 ON public.assessment_submissions AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id))
 WITH CHECK (NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id));
CREATE POLICY s4b3b0_homework_submissions_guard
 ON public.homework_submissions AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT schoolnet_private.s4b3b0_is_official_assessment(homework_id))
 WITH CHECK (NOT schoolnet_private.s4b3b0_is_official_assessment(homework_id));
CREATE POLICY s4b3b0_legacy_submissions_guard
 ON public.submissions AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id))
 WITH CHECK (NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id));
CREATE POLICY s4b3b0_submission_answers_guard
 ON public.submission_answers AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT schoolnet_private.s4b3b0_is_official_submission(submission_id))
 WITH CHECK (NOT schoolnet_private.s4b3b0_is_official_submission(submission_id));
CREATE POLICY s4b3b0_question_grades_guard
 ON public.submission_question_grades AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT schoolnet_private.s4b3b0_is_official_submission(submission_id))
 WITH CHECK (NOT schoolnet_private.s4b3b0_is_official_submission(submission_id));

-- V1 : une RLS "student_id = auth.uid()" n'empêche pas l'élève de s'auto-
-- noter en écrivant directement score/status. Contrôle BEFORE défensif
-- sans changer le format de soumission V1 (online ou fichier).
CREATE FUNCTION schoolnet_private.s4b3b0_protect_student_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog AS $s4b3b0$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 IF TG_WHEN <> 'BEFORE' OR TG_OP NOT IN ('INSERT','UPDATE')
    OR TG_TABLE_SCHEMA<>'public'
    OR TG_TABLE_NAME NOT IN ('assessment_submissions','homework_submissions')
 THEN RAISE EXCEPTION 'S4B3B0_UNEXPECTED_TRIGGER'; END IF;
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'student'
 THEN RETURN NEW; END IF;

 IF NEW.student_id IS DISTINCT FROM v_uid
  OR NEW.status::text NOT IN ('in_progress','submitted')
  OR NEW.score IS NOT NULL OR NEW.feedback IS NOT NULL
  OR NEW.graded_by IS NOT NULL OR NEW.graded_at IS NOT NULL
  OR NEW.published_at IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3B0_STUDENT_CANNOT_SET_GRADE' USING ERRCODE='42501'; END IF;

 IF TG_TABLE_NAME='assessment_submissions' THEN
  IF NEW.freeform_score IS NOT NULL OR NEW.freeform_feedback IS NOT NULL
  THEN RAISE EXCEPTION 'S4B3B0_STUDENT_CANNOT_SET_GRADE' USING ERRCODE='42501'; END IF;
 ELSE
  IF NEW.detailed_feedback IS NOT NULL
  THEN RAISE EXCEPTION 'S4B3B0_STUDENT_CANNOT_SET_GRADE' USING ERRCODE='42501'; END IF;
 END IF;

 IF TG_OP='UPDATE' THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR OLD.status::text IN ('graded','published')
    OR NEW.score IS DISTINCT FROM OLD.score
    OR NEW.feedback IS DISTINCT FROM OLD.feedback
    OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
    OR NEW.graded_at IS DISTINCT FROM OLD.graded_at
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
  THEN RAISE EXCEPTION 'S4B3B0_STUDENT_IMMUTABLE_GRADING' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='assessment_submissions' THEN
   IF NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
     OR NEW.freeform_score IS DISTINCT FROM OLD.freeform_score
     OR NEW.freeform_feedback IS DISTINCT FROM OLD.freeform_feedback
   THEN RAISE EXCEPTION 'S4B3B0_STUDENT_IMMUTABLE_GRADING' USING ERRCODE='42501'; END IF;
  ELSE
   IF NEW.homework_id IS DISTINCT FROM OLD.homework_id
     OR NEW.detailed_feedback IS DISTINCT FROM OLD.detailed_feedback
   THEN RAISE EXCEPTION 'S4B3B0_STUDENT_IMMUTABLE_GRADING' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$s4b3b0$;
REVOKE ALL ON FUNCTION schoolnet_private.s4b3b0_protect_student_submission()
 FROM PUBLIC,anon,authenticated;

CREATE TRIGGER trg_s4b3b0_protect_assessment_submissions
 BEFORE INSERT OR UPDATE ON public.assessment_submissions
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.s4b3b0_protect_student_submission();
CREATE TRIGGER trg_s4b3b0_protect_homework_submissions
 BEFORE INSERT OR UPDATE ON public.homework_submissions
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.s4b3b0_protect_student_submission();

-- Les correctifs des RPC historiques sont ajoutés ci-dessous à partir
-- des signatures constatées en production, et restent tous NON appliqués.
CREATE OR REPLACE FUNCTION public.mark_homework_submission_as_graded(p_submission_id uuid, p_score numeric, p_feedback text, p_detailed_feedback text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
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
        AND NOT schoolnet_private.s4b3b0_is_official_assessment(a.id)
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
 SET search_path TO 'pg_catalog'
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
        AND NOT schoolnet_private.s4b3b0_is_official_assessment(a.id)
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
 SET search_path TO 'pg_catalog'
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
    and a.created_by = auth.uid()
    AND NOT schoolnet_private.s4b3b0_is_official_assessment(a.id);

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
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_question_total numeric(10,2);
  v_freeform_score numeric(10,2);
  v_total numeric(10,2);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.assessment_submissions s
      JOIN public.assessments a ON a.id=s.assessment_id
    WHERE s.id=p_submission_id
      AND a.created_by=auth.uid()
      AND NOT schoolnet_private.s4b3b0_is_official_assessment(a.id)
  ) THEN
    RAISE EXCEPTION 'S4B3B0_GRADING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
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
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.assessment_submissions s
      JOIN public.assessments a ON a.id=s.assessment_id
    WHERE s.id=p_submission_id
      AND a.created_by=auth.uid()
      AND NOT schoolnet_private.s4b3b0_is_official_assessment(a.id)
  ) THEN
    RAISE EXCEPTION 'S4B3B0_GRADING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
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
 SET search_path TO 'pg_catalog'
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
        AND NOT schoolnet_private.s4b3b0_is_official_assessment(a.id)
    );

  if not found then
    raise exception 'Rendu introuvable ou non corrigé.';
  end if;
end;
$function$;

-- Les RPC historiques restent utilisables par les mêmes acteurs V1,
-- mais vérifient maintenant ownership et statut d'opt-in officiel.
REVOKE EXECUTE ON FUNCTION public.publish_assessment_submission(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.mark_submission_as_graded(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.mark_submission_as_graded_v2(uuid,text,numeric,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.mark_homework_submission_as_graded(uuid,numeric,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.mark_homework_submission_as_graded(uuid,numeric,text,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.publish_homework_submission(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.publish_assessment_submission(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_submission_as_graded(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_submission_as_graded_v2(uuid,text,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_homework_submission_as_graded(uuid,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mark_homework_submission_as_graded(uuid,numeric,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_homework_submission(uuid) TO authenticated,service_role;

-- Recalcul de note strictement réservé au trigger technique.
REVOKE EXECUTE ON FUNCTION public.recalculate_submission_score(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_submission_score(uuid) TO service_role;

DO $postflight$
BEGIN
 IF has_function_privilege('anon','public.publish_assessment_submission(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.mark_submission_as_graded(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.recalculate_submission_score(uuid)','EXECUTE')
 OR to_regprocedure('schoolnet_private.s4b3b0_is_official_question(uuid)') IS NULL
 OR (SELECT count(*) FROM pg_catalog.pg_policies
      WHERE schemaname='public' AND policyname LIKE 's4b3b0_%')<>8
 OR (SELECT count(*) FROM pg_catalog.pg_trigger
      WHERE tgname LIKE 'trg_s4b3b0_%' AND tgenabled='O')<>2
 THEN RAISE EXCEPTION 'S4B3B0_POSTFLIGHT_FAILED'; END IF;
END $postflight$;
SELECT 'S4B3B0_SECURITY_FOUNDATION_PASS' AS result;
