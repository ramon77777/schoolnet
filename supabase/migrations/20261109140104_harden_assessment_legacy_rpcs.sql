-- SCHOOLNET | Lot 4.3.D | Securisation des anciennes RPC de corrections.
-- PREPARE SUR GITHUB UNIQUEMENT ; requiert autorisation avant application.
-- Aucun changement de donnees, de notes, de statuts ni de trigger.
--
-- Audit : publish_assessment_submission(uuid) et la RPC historique
-- mark_submission_as_graded(uuid,text) etaient SECURITY DEFINER sans
-- verification d'appartenance de l'evaluation ; un appel RPC pouvait modifier
-- la copie d'un autre enseignant si son UUID etait connu.
-- La version courante mark_submission_as_graded_v2() controle deja created_by.
-- recalculate_submission_score(uuid) est reservee aux triggers techniques.

DO $schoolnet_preflight$
BEGIN
  IF to_regprocedure('public.publish_assessment_submission(uuid)') IS NULL
    OR to_regprocedure('public.mark_submission_as_graded(uuid,text)') IS NULL
    OR to_regprocedure('public.recalculate_submission_score(uuid)') IS NULL
    OR to_regprocedure('public.mark_submission_as_graded_v2(uuid,text,numeric,text)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=to_regclass('public.submission_question_grades')
        AND t.tgname='trg_submission_question_grades_recalculate_score'
        AND t.tgenabled='O'
    )
  THEN RAISE EXCEPTION 'SCHOOLNET 4.3.D: schema de corrections inattendu';
  END IF;
END $schoolnet_preflight$;

-- La publication est reservee a l'enseignant qui a cree l'evaluation,
-- comme l'enregistrement via mark_submission_as_graded_v2().
CREATE OR REPLACE FUNCTION public.publish_assessment_submission(
  p_submission_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet$
BEGIN
  UPDATE public.assessment_submissions s
  SET
    status='published',
    published_at=pg_catalog.now()
  WHERE s.id=p_submission_id
    AND s.status::text='graded'
    AND EXISTS(
      SELECT 1 FROM public.assessments a
      WHERE a.id=s.assessment_id
        AND a.created_by=auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable ou non autorisee.';
  END IF;
END;
$schoolnet$;

-- Conserver la signature ancienne pour les clients existants, avec le
-- meme garde-fou que la version 2. Aucune augmentation de privileges.
CREATE OR REPLACE FUNCTION public.mark_submission_as_graded(
  p_submission_id uuid,
  p_feedback text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet$
DECLARE
  v_question_total numeric(10,2);
  v_freeform_score numeric(10,2);
  v_total numeric(10,2);
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM public.assessment_submissions s
    JOIN public.assessments a ON a.id=s.assessment_id
    WHERE s.id=p_submission_id
      AND a.created_by=auth.uid()
  ) THEN
    RAISE EXCEPTION 'Soumission introuvable ou non autorisee.';
  END IF;

  SELECT COALESCE(SUM(points_awarded),0)
  INTO v_question_total
  FROM public.submission_question_grades
  WHERE submission_id=p_submission_id;

  SELECT COALESCE(freeform_score,0)
  INTO v_freeform_score
  FROM public.assessment_submissions
  WHERE id=p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable.';
  END IF;

  v_total := COALESCE(v_question_total,0) + COALESCE(v_freeform_score,0);

  UPDATE public.assessment_submissions
  SET
    status='graded',
    score=v_total,
    feedback=p_feedback,
    graded_at=pg_catalog.now(),
    graded_by=auth.uid()
  WHERE id=p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable.';
  END IF;
END;
$schoolnet$;

REVOKE EXECUTE ON FUNCTION public.publish_assessment_submission(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_assessment_submission(uuid)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mark_submission_as_graded(uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_submission_as_graded(uuid,text)
  TO authenticated, service_role;

-- Appel uniquement par trg_recalculate_submission_score(), fonction trigger
-- SECURITY DEFINER. Les clients ne doivent pas recalculer les copies d'autrui.
REVOKE EXECUTE ON FUNCTION public.recalculate_submission_score(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_submission_score(uuid)
  TO service_role;

-- Pas de changement des 25 migrations deja installees ou des notifications.
