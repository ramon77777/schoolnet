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
-- Accès enseignant V1 conservé pour le PROPRIÉTAIRE du contenu ;
-- élève V2 : uniquement les futurs RPC contrôlés (B.1/B.2).
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
  NOT EXISTS (
    SELECT 1 FROM public.quiz_questions q
    WHERE q.id=quiz_choices.question_id
      AND schoolnet_private.s4b3b0_is_official_assessment(q.assessment_id)
  )
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
 USING (
  NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id)
  OR public.is_assessment_owner(assessment_id)
 )
 WITH CHECK (
  NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id)
  OR public.is_assessment_owner(assessment_id)
 );
CREATE POLICY s4b3b0_homework_submissions_guard
 ON public.homework_submissions AS RESTRICTIVE FOR ALL TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_assessment(homework_id)
  OR public.is_assessment_owner(homework_id)
 )
 WITH CHECK (
  NOT schoolnet_private.s4b3b0_is_official_assessment(homework_id)
  OR public.is_assessment_owner(homework_id)
 );
CREATE POLICY s4b3b0_legacy_submissions_guard
 ON public.submissions AS RESTRICTIVE FOR ALL TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id)
  OR public.is_assessment_owner(assessment_id)
 )
 WITH CHECK (
  NOT schoolnet_private.s4b3b0_is_official_assessment(assessment_id)
  OR public.is_assessment_owner(assessment_id)
 );
CREATE POLICY s4b3b0_submission_answers_guard
 ON public.submission_answers AS RESTRICTIVE FOR ALL TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_submission(submission_id)
  OR EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    WHERE s.id=submission_answers.submission_id AND public.is_assessment_owner(s.assessment_id)
  )
 )
 WITH CHECK (
  NOT schoolnet_private.s4b3b0_is_official_submission(submission_id)
  OR EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    WHERE s.id=submission_answers.submission_id AND public.is_assessment_owner(s.assessment_id)
  )
 );
CREATE POLICY s4b3b0_question_grades_guard
 ON public.submission_question_grades AS RESTRICTIVE FOR ALL TO authenticated
 USING (
  NOT schoolnet_private.s4b3b0_is_official_submission(submission_id)
  OR EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    WHERE s.id=submission_question_grades.submission_id AND public.is_assessment_owner(s.assessment_id)
  )
 )
 WITH CHECK (
  NOT schoolnet_private.s4b3b0_is_official_submission(submission_id)
  OR EXISTS (
    SELECT 1 FROM public.assessment_submissions s
    WHERE s.id=submission_question_grades.submission_id AND public.is_assessment_owner(s.assessment_id)
  )
 );

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
