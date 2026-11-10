-- SCHOOLNET | Lot 5.D - Preparation des reinscriptions et bascule annuelle.
-- PREPARATION UNIQUEMENT : ne pas appliquer sur schoolnet_2.0 sans autorisation.
-- Reutilise school_years, student_enrollments, class_students et les RPC existantes.
-- Les choix de preparation ne creent aucun dossier et ne changent pas l'annee courante.
DO $schoolnet_5d_preflight$
BEGIN
  IF to_regclass('public.school_years') IS NULL
     OR to_regclass('public.student_enrollments') IS NULL
     OR to_regclass('public.student_enrollment_events') IS NULL
     OR to_regclass('public.class_students') IS NULL
     OR to_regclass('public.classes') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.school_year_rollover_decisions') IS NOT NULL
     OR to_regclass('public.school_year_rollover_runs') IS NOT NULL
     OR to_regprocedure('public.admin_upsert_student_enrollment(uuid,uuid,date,text,text,text)') IS NULL
     OR to_regprocedure('public.admin_set_current_school_year(uuid)') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL
  THEN
    RAISE EXCEPTION 'Lot 5.D : prerequis absents ou migration deja installee.';
  END IF;
END;
$schoolnet_5d_preflight$;

CREATE TABLE public.school_year_rollover_decisions (
  source_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  target_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('pending','re_enroll','repeat','leave')),
  target_class_id uuid REFERENCES public.classes(id) ON DELETE RESTRICT,
  note text,
  decided_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(source_year_id,target_year_id,student_id),
  CONSTRAINT schoolnet_5d_years_distinct CHECK (source_year_id<>target_year_id),
  CONSTRAINT schoolnet_5d_decision_target CHECK (
    (decision IN ('re_enroll','repeat') AND target_class_id IS NOT NULL)
    OR (decision IN ('leave','pending') AND target_class_id IS NULL)
  ),
  CONSTRAINT schoolnet_5d_note_length CHECK (note IS NULL OR pg_catalog.char_length(note)<=1000)
);

CREATE TABLE public.school_year_rollover_runs (
  source_year_id uuid PRIMARY KEY REFERENCES public.school_years(id) ON DELETE RESTRICT,
  target_year_id uuid NOT NULL UNIQUE REFERENCES public.school_years(id) ON DELETE RESTRICT,
  finalized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  finalized_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  source_students integer NOT NULL CHECK (source_students>=0),
  re_enrolled integer NOT NULL CHECK (re_enrolled>=0),
  repeated integer NOT NULL CHECK (repeated>=0),
  departed integer NOT NULL CHECK (departed>=0),
  CONSTRAINT schoolnet_5d_run_years_distinct CHECK (source_year_id<>target_year_id),
  CONSTRAINT schoolnet_5d_run_totals CHECK (source_students = re_enrolled + repeated + departed)
);

CREATE INDEX idx_schoolnet_rollover_target_class
 ON public.school_year_rollover_decisions(target_year_id,target_class_id)
 WHERE target_class_id IS NOT NULL;

ALTER TABLE public.school_year_rollover_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_year_rollover_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.school_year_rollover_decisions
 FROM PUBLIC,anon,authenticated;
REVOKE ALL PRIVILEGES ON public.school_year_rollover_runs
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_year_rollover_decisions TO authenticated;
GRANT SELECT ON public.school_year_rollover_runs TO authenticated;

CREATE POLICY schoolnet_5d_decisions_admin_read
 ON public.school_year_rollover_decisions
 FOR SELECT TO authenticated
 USING ((SELECT public.is_admin()));

CREATE POLICY schoolnet_5d_runs_admin_read
 ON public.school_year_rollover_runs
 FOR SELECT TO authenticated
 USING ((SELECT public.is_admin()));

-- Une decision est toujours verifiee par le serveur, jamais acceptee sur
-- la seule base d'un selecteur Frontend.
CREATE FUNCTION public.admin_save_school_year_rollover_decision(
  p_source_year_id uuid,
  p_target_year_id uuid,
  p_student_id uuid,
  p_decision text,
  p_target_class_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $schoolnet_5d_save$
DECLARE
  v_source public.school_years%ROWTYPE;
  v_target public.school_years%ROWTYPE;
  v_source_enrollment public.student_enrollments%ROWTYPE;
  v_class public.classes%ROWTYPE;
  v_source_level bigint;
  v_clean_note text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acces reserve a l administration.' USING ERRCODE='42501';
  END IF;
  IF p_source_year_id IS NULL OR p_target_year_id IS NULL OR p_student_id IS NULL
     OR p_source_year_id=p_target_year_id
     OR p_decision IS NULL OR p_decision NOT IN ('pending','re_enroll','repeat','leave')
  THEN
    RAISE EXCEPTION 'Choix de reinscription invalide.';
  END IF;
  v_clean_note := pg_catalog.nullif(pg_catalog.btrim(p_note),'');
  IF pg_catalog.char_length(COALESCE(v_clean_note,''))>1000 THEN
    RAISE EXCEPTION 'La note est limitee a 1000 caracteres.';
  END IF;

  LOCK TABLE public.school_years IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_source FROM public.school_years WHERE id=p_source_year_id;
  SELECT * INTO v_target FROM public.school_years WHERE id=p_target_year_id;
  IF v_source.id IS NULL OR v_target.id IS NULL OR NOT v_source.is_current
     OR v_target.is_current OR v_target.starts_on<=v_source.starts_on
  THEN
    RAISE EXCEPTION 'Choisissez une annee courante et une annee suivante non active.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_year_rollover_runs
             WHERE source_year_id=p_source_year_id OR target_year_id=p_target_year_id) THEN
    RAISE EXCEPTION 'Le passage d annee est deja finalise.';
  END IF;

  SELECT * INTO v_source_enrollment FROM public.student_enrollments
   WHERE student_id=p_student_id AND school_year_id=p_source_year_id
     AND status='active'::public.student_enrollment_status
   FOR UPDATE;
  IF v_source_enrollment.id IS NULL THEN
    RAISE EXCEPTION 'Cet apprenant ne possede pas d inscription active dans l annee source.';
  END IF;
  IF p_decision IN ('re_enroll','repeat') THEN
    IF p_target_class_id IS NULL THEN
      RAISE EXCEPTION 'Une classe cible est obligatoire.';
    END IF;
    SELECT * INTO v_class FROM public.classes WHERE id=p_target_class_id;
    IF v_class.id IS NULL OR NOT (
      v_class.school_year_id=p_target_year_id
      OR (v_class.school_year_id IS NULL AND v_class.school_year=v_target.name)
    ) THEN
      RAISE EXCEPTION 'La classe cible doit appartenir a l annee suivante.';
    END IF;
    IF p_decision='repeat' THEN
      SELECT level_id INTO v_source_level
        FROM public.classes WHERE id=v_source_enrollment.class_id;
      IF v_source_level IS DISTINCT FROM v_class.level_id THEN
        RAISE EXCEPTION 'Un redoublement doit conserver le niveau scolaire.';
      END IF;
    END IF;
  ELSIF p_target_class_id IS NOT NULL THEN
    RAISE EXCEPTION 'Une decision Depart ou En attente ne peut pas avoir de classe cible.';
  END IF;

  INSERT INTO public.school_year_rollover_decisions AS d
   (source_year_id,target_year_id,student_id,source_enrollment_id,decision,
    target_class_id,note,decided_by)
  VALUES (p_source_year_id,p_target_year_id,p_student_id,v_source_enrollment.id,
          p_decision,p_target_class_id,v_clean_note,auth.uid())
  ON CONFLICT(source_year_id,target_year_id,student_id)
  DO UPDATE SET
    source_enrollment_id=EXCLUDED.source_enrollment_id,
    decision=EXCLUDED.decision,
    target_class_id=EXCLUDED.target_class_id,
    note=EXCLUDED.note,
    decided_by=EXCLUDED.decided_by,
    decided_at=pg_catalog.now()
  WHERE d.source_enrollment_id IS DISTINCT FROM EXCLUDED.source_enrollment_id
     OR d.decision IS DISTINCT FROM EXCLUDED.decision
     OR d.target_class_id IS DISTINCT FROM EXCLUDED.target_class_id
     OR d.note IS DISTINCT FROM EXCLUDED.note;

  RETURN pg_catalog.jsonb_build_object(
    'source_year_id',p_source_year_id,'target_year_id',p_target_year_id,
    'student_id',p_student_id,'decision',p_decision,'target_class_id',p_target_class_id
  );
END;
$schoolnet_5d_save$;

REVOKE ALL ON FUNCTION public.admin_save_school_year_rollover_decision(
  uuid,uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_school_year_rollover_decision(
  uuid,uuid,uuid,text,uuid,text) TO authenticated;

-- Bloquer les bascules directes si des dossiers existent. La finalisation
-- du Lot 5.D est la seule voie geree pour fermer et recreer les dossiers.
CREATE FUNCTION schoolnet_private.guard_school_year_rollover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $schoolnet_5d_year_guard$
BEGIN
  IF OLD.is_current IS DISTINCT FROM NEW.is_current
     AND COALESCE(pg_catalog.current_setting('schoolnet.rollover_authorized',true),'')<>'yes'
     AND EXISTS (
       SELECT 1 FROM public.student_enrollments e
       WHERE e.school_year_id=OLD.id
     )
  THEN
    RAISE EXCEPTION 'Annee avec dossiers scolaires : utilisez le passage d annee controle (Lot 5.D).';
  END IF;
  RETURN NEW;
END;
$schoolnet_5d_year_guard$;
REVOKE ALL ON FUNCTION schoolnet_private.guard_school_year_rollover()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_schoolnet_guard_school_year_rollover
 BEFORE UPDATE OF is_current ON public.school_years
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_school_year_rollover();

-- Retenir le flux rapide uniquement pour le parametrage initial d'une annee
-- sans dossier existant. L'ancienne RPC ne cloturait aucune inscription.
CREATE OR REPLACE FUNCTION public.admin_set_current_school_year(
  p_school_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $schoolnet_5d_set_year$
DECLARE
  v_target public.school_years%ROWTYPE;
  v_current public.school_years%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acces reserve a l administration.' USING ERRCODE='42501';
  END IF;
  LOCK TABLE public.school_years IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_target FROM public.school_years WHERE id=p_school_year_id;
  SELECT * INTO v_current FROM public.school_years WHERE is_current FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'Annee scolaire introuvable.';END IF;
  IF v_target.is_current THEN
    RETURN pg_catalog.jsonb_build_object(
      'school_year_id',v_target.id,'school_year_name',v_target.name,
      'is_current',true,'changed',false
    );
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.student_enrollments e
    WHERE e.school_year_id IN (v_target.id,v_current.id)
  ) THEN
    RAISE EXCEPTION 'Des dossiers scolaires existent : utilisez le passage d annee controle (Lot 5.D).';
  END IF;
  UPDATE public.school_years SET is_current=false WHERE is_current;
  UPDATE public.school_years SET is_current=true WHERE id=p_school_year_id;
  RETURN pg_catalog.jsonb_build_object(
    'school_year_id',v_target.id,'school_year_name',v_target.name,
    'is_current',true,'changed',true
  );
END;
$schoolnet_5d_set_year$;
REVOKE ALL ON FUNCTION public.admin_set_current_school_year(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_current_school_year(uuid) TO authenticated;

-- Bascule unique : controles, cloture, activation et nouveaux dossiers dans
-- la meme transaction PostgreSQL. Une anomalie annule toute l'operation.
CREATE FUNCTION public.admin_finalize_school_year_rollover(
  p_source_year_id uuid,
  p_target_year_id uuid,
  p_confirm_year_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $schoolnet_5d_finalize$
DECLARE
  v_source public.school_years%ROWTYPE;
  v_target public.school_years%ROWTYPE;
  v_existing public.school_year_rollover_runs%ROWTYPE;
  v_decision public.school_year_rollover_decisions%ROWTYPE;
  v_target_enrollment public.student_enrollments%ROWTYPE;
  v_total integer;
  v_ready integer;
  v_re_enrolled integer;
  v_repeated integer;
  v_departed integer;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acces reserve a l administration.' USING ERRCODE='42501';
  END IF;
  IF p_source_year_id IS NULL OR p_target_year_id IS NULL
     OR p_source_year_id=p_target_year_id THEN
    RAISE EXCEPTION 'Annees scolaires invalides.';
  END IF;
  -- Empecher les modifications concurrentes aux annees, aux decisions et
  -- aux dossiers pendant la bascule.
  LOCK TABLE public.school_years IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.school_year_rollover_decisions IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.student_enrollments IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_target FROM public.school_years WHERE id=p_target_year_id;
  SELECT * INTO v_source FROM public.school_years WHERE id=p_source_year_id;
  IF v_target.id IS NULL OR v_source.id IS NULL
     OR pg_catalog.btrim(COALESCE(p_confirm_year_name,''))<>v_target.name
  THEN
    RAISE EXCEPTION 'Confirmation invalide : saisissez exactement le nom de l annee cible.';
  END IF;
  SELECT * INTO v_existing FROM public.school_year_rollover_runs
  WHERE source_year_id=p_source_year_id FOR UPDATE;
  IF v_existing.source_year_id IS NOT NULL THEN
    IF v_existing.target_year_id<>p_target_year_id THEN
      RAISE EXCEPTION 'Cette annee a deja ete cloturee vers une autre annee.';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'source_year_id',p_source_year_id,'target_year_id',p_target_year_id,
      'source_students',v_existing.source_students,
      're_enrolled',v_existing.re_enrolled,'repeated',v_existing.repeated,
      'departed',v_existing.departed,'already_finalized',true
    );
  END IF;
  IF (SELECT COUNT(*) FROM public.school_years WHERE is_current)<>1
     OR NOT v_source.is_current OR v_target.is_current
     OR v_target.starts_on<=v_source.starts_on THEN
    RAISE EXCEPTION 'Le passage d annee exige une annee source courante et une annee cible suivante.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_year_rollover_runs
             WHERE target_year_id=p_target_year_id) THEN
    RAISE EXCEPTION 'Cette annee cible a deja ete utilisee dans un autre passage.';
  END IF;
  SELECT COUNT(*) INTO v_total FROM public.student_enrollments
  WHERE school_year_id=p_source_year_id
    AND status='active'::public.student_enrollment_status;
  IF v_total=0 THEN
    RAISE EXCEPTION 'Aucun dossier actif a reinscrire pour l annee source.';
  END IF;
  SELECT COUNT(*) INTO v_ready
  FROM public.student_enrollments e
  JOIN public.school_year_rollover_decisions d
    ON d.source_enrollment_id=e.id
   AND d.source_year_id=p_source_year_id
   AND d.target_year_id=p_target_year_id
   AND d.student_id=e.student_id
   AND d.decision<>'pending'
  WHERE e.school_year_id=p_source_year_id
    AND e.status='active'::public.student_enrollment_status;
  IF v_ready<>v_total OR EXISTS (
    SELECT 1 FROM public.school_year_rollover_decisions d
    LEFT JOIN public.student_enrollments e ON e.id=d.source_enrollment_id
    WHERE d.source_year_id=p_source_year_id AND d.target_year_id=p_target_year_id
      AND (e.id IS NULL OR e.student_id<>d.student_id OR
           e.school_year_id<>p_source_year_id OR
           e.status<>'active'::public.student_enrollment_status)
  ) THEN
    RAISE EXCEPTION 'Tous les apprenants actifs doivent avoir une decision definitive et coherente.';
  END IF;
  -- Refuser les dossiers anachroniques (actifs/termines) dans la cible,
  -- y compris ceux d'autres apprenants non presentes dans les decisions.
  IF EXISTS (
    SELECT 1 FROM public.student_enrollments
    WHERE school_year_id=p_target_year_id AND status IN (
      'active'::public.student_enrollment_status,
      'completed'::public.student_enrollment_status
    )
  ) THEN
    RAISE EXCEPTION 'L annee cible contient un dossier actif ou termine : regularisez-le avant la bascule.';
  END IF;

  -- Verifier les decisions une derniere fois (modifications possibles
  -- des classes ou des dossiers depuis leur sauvegarde).
  FOR v_decision IN
    SELECT * FROM public.school_year_rollover_decisions
    WHERE source_year_id=p_source_year_id AND target_year_id=p_target_year_id
    ORDER BY student_id
  LOOP
    IF v_decision.decision IN ('re_enroll','repeat') THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id=v_decision.target_class_id
          AND (c.school_year_id=p_target_year_id OR
               (c.school_year_id IS NULL AND c.school_year=v_target.name))
      ) THEN RAISE EXCEPTION 'Une classe cible n appartient plus a l annee suivante.';END IF;
      IF v_decision.decision='repeat' AND (
        SELECT c.level_id FROM public.classes c
        WHERE c.id=v_decision.target_class_id
      ) IS DISTINCT FROM (
        SELECT c.level_id FROM public.student_enrollments e
        JOIN public.classes c ON c.id=e.class_id
        WHERE e.id=v_decision.source_enrollment_id
      ) THEN
        RAISE EXCEPTION 'Le choix de redoublement ne conserve pas le niveau.';
      END IF;
      SELECT * INTO v_target_enrollment FROM public.student_enrollments
      WHERE student_id=v_decision.student_id AND school_year_id=p_target_year_id
      FOR UPDATE;
      IF v_target_enrollment.id IS NOT NULL
         AND (v_target_enrollment.status<>'draft'::public.student_enrollment_status
              OR v_target_enrollment.class_id<>v_decision.target_class_id) THEN
        RAISE EXCEPTION 'Dossier cible preexistant incompatible avec la decision de reinscription.';
      END IF;
    ELSE
      IF EXISTS(SELECT 1 FROM public.student_enrollments e
        WHERE e.student_id=v_decision.student_id AND e.school_year_id=p_target_year_id
          AND e.status NOT IN ('withdrawn'::public.student_enrollment_status,
                               'cancelled'::public.student_enrollment_status))
      THEN
        RAISE EXCEPTION 'Depart choisi mais dossier non annule present dans l annee cible.';
      END IF;
    END IF;
  END LOOP;

  SELECT COUNT(*) FILTER (WHERE decision='re_enroll'),
         COUNT(*) FILTER (WHERE decision='repeat'),
         COUNT(*) FILTER (WHERE decision='leave')
  INTO v_re_enrolled,v_repeated,v_departed
  FROM public.school_year_rollover_decisions
  WHERE source_year_id=p_source_year_id AND target_year_id=p_target_year_id;

  -- Ne jamais supprimer les anciens dossiers ni leurs pieces et bulletins.
  UPDATE public.student_enrollments
  SET status='completed'::public.student_enrollment_status
  WHERE school_year_id=p_source_year_id
    AND status='active'::public.student_enrollment_status;

  -- Autorisation transactionnelle limitee aux deux changements d'annee.
  PERFORM pg_catalog.set_config('schoolnet.rollover_authorized','yes',true);
  UPDATE public.school_years SET is_current=false WHERE id=p_source_year_id;
  UPDATE public.school_years SET is_current=true WHERE id=p_target_year_id;
  PERFORM pg_catalog.set_config('schoolnet.rollover_authorized','',true);

  FOR v_decision IN
    SELECT * FROM public.school_year_rollover_decisions
    WHERE source_year_id=p_source_year_id AND target_year_id=p_target_year_id
    ORDER BY student_id
  LOOP
    IF v_decision.decision IN ('re_enroll','repeat') THEN
      -- La RPC d'inscription existante attribue une numero unique, garde
      -- l'historique et synchronise class_students et profiles.class_name.
      SELECT * INTO v_target_enrollment FROM public.student_enrollments
      WHERE student_id=v_decision.student_id AND school_year_id=p_target_year_id;
      PERFORM public.admin_upsert_student_enrollment(
        v_decision.student_id,v_decision.target_class_id,v_target.starts_on,
        'continuing',
        v_target_enrollment.previous_school,v_target_enrollment.notes
      );
    ELSE
      -- Un depart ne doit plus afficher la classe archivee comme courante.
      UPDATE public.profiles SET class_name=NULL WHERE id=v_decision.student_id;
    END IF;
  END LOOP;

  IF (SELECT COUNT(*) FROM public.school_years WHERE is_current)<>1
     OR NOT (SELECT is_current FROM public.school_years WHERE id=p_target_year_id)
     OR EXISTS (
       SELECT 1 FROM public.student_enrollments e
       WHERE e.school_year_id=p_source_year_id
         AND e.status='active'::public.student_enrollment_status
     )
     OR (
       SELECT COUNT(*) FROM public.student_enrollments e
       JOIN public.school_year_rollover_decisions d
         ON d.student_id=e.student_id AND d.target_year_id=e.school_year_id
       WHERE d.source_year_id=p_source_year_id
         AND d.target_year_id=p_target_year_id
         AND d.decision IN ('re_enroll','repeat')
         AND e.status='active'::public.student_enrollment_status
     ) <> v_re_enrolled+v_repeated
  THEN RAISE EXCEPTION 'Verification finale du passage d annee non conforme.';END IF;

  INSERT INTO public.school_year_rollover_runs
    (source_year_id,target_year_id,finalized_by,source_students,
     re_enrolled,repeated,departed)
  VALUES (p_source_year_id,p_target_year_id,auth.uid(),
          v_total,v_re_enrolled,v_repeated,v_departed);

  v_result:=pg_catalog.jsonb_build_object(
    'source_year_id',p_source_year_id,'target_year_id',p_target_year_id,
    'source_students',v_total,'re_enrolled',v_re_enrolled,
    'repeated',v_repeated,'departed',v_departed,'already_finalized',false
  );
  RETURN v_result;
END;
$schoolnet_5d_finalize$;

REVOKE ALL ON FUNCTION public.admin_finalize_school_year_rollover(
  uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_school_year_rollover(
  uuid,uuid,text) TO authenticated;

DO $schoolnet_5d_postcheck$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
         WHERE oid='public.school_year_rollover_decisions'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
         WHERE oid='public.school_year_rollover_runs'::regclass)
 OR pg_catalog.has_table_privilege('anon','public.school_year_rollover_decisions','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.school_year_rollover_decisions','INSERT')
 OR pg_catalog.has_function_privilege('anon',
    'public.admin_finalize_school_year_rollover(uuid,uuid,text)'::regprocedure,'EXECUTE')
 OR NOT pg_catalog.has_function_privilege('authenticated',
    'public.admin_finalize_school_year_rollover(uuid,uuid,text)'::regprocedure,'EXECUTE')
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgname='trg_schoolnet_guard_school_year_rollover' AND tgenabled='O')
 THEN RAISE EXCEPTION 'Lot 5.D : controle de securite non conforme.'; END IF;
END;
$schoolnet_5d_postcheck$;
