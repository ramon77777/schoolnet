-- SCHOOLNET 2.0 | Lot 5D-A + 5D-B | CANDIDAT SQL DE RECETTE ISOLEE
-- NON APPROUVE POUR LA PRODUCTION / NE PAS INSTALLER SUR schoolnet_2.0.
-- NE PAS PLACER DANS supabase/migrations. NE PAS LANCER supabase db push.
-- Execution manuelle UNIQUEMENT dans PostgreSQL 17 jetable avec fixtures.
-- Il s'agit d'une proposition transactionnelle, pas d'un deploiement.
-- Prerequis: le schema existant selon audit Supabase du 18/11/2026.
-- Hypothese stricte v1: tout dossier cible existant (meme draft) bloque.
-- La passerelle Admin serveur n'est pas fournie dans ce lot; aucune RPC
-- d'ecriture n'est exposee au navigateur, a anon, authenticated, service_role.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $check_5d$
BEGIN
  IF pg_catalog.to_regnamespace('schoolnet_private') IS NULL
     OR pg_catalog.to_regprocedure('public.is_admin()') IS NULL
     OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
     OR pg_catalog.to_regprocedure('public.admin_set_current_school_year(uuid)') IS NULL
     OR pg_catalog.to_regclass('public.student_enrollments') IS NULL
     OR pg_catalog.to_regclass('public.student_enrollment_events') IS NULL
     OR pg_catalog.to_regclass('public.school_years') IS NULL
     OR pg_catalog.to_regclass('public.classes') IS NULL
     OR pg_catalog.to_regclass('public.profiles') IS NULL
     OR pg_catalog.to_regclass('public.class_students') IS NULL
     OR pg_catalog.to_regclass('public.class_teachers') IS NULL
     OR pg_catalog.to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
     OR pg_catalog.to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
     OR pg_catalog.to_regclass('public.school_year_rollover_decisions') IS NOT NULL
     OR pg_catalog.to_regclass('public.school_year_rollover_runs') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.admin_finalize_school_year_rollover(uuid,uuid,text)') IS NOT NULL
  THEN
    RAISE EXCEPTION '5D AB : mauvais schema ou migration de passage deja presente.' USING ERRCODE='55000';
  END IF;
END;
$check_5d$;

-- Preuve TEMPORAIRE de transaction; aucune autorisation via GUC utilisateur.
CREATE TABLE schoolnet_private.lot5d_year_switch_permits (
  tx_id bigint PRIMARY KEY,
  source_year_id uuid NOT NULL,
  target_year_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
REVOKE ALL ON TABLE schoolnet_private.lot5d_year_switch_permits FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE schoolnet_private.lot5d_year_switch_permits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.school_year_rollover_decisions (
  source_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  target_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('pending','re_enroll','repeat','leave')),
  target_class_id uuid REFERENCES public.classes(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR pg_catalog.char_length(note)<=1000),
  decided_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(source_year_id,target_year_id,student_id),
  CHECK (source_year_id <> target_year_id),
  CHECK (
    (decision IN ('re_enroll','repeat') AND target_class_id IS NOT NULL)
    OR (decision IN ('leave','pending') AND target_class_id IS NULL)
  )
);
CREATE TABLE public.school_year_rollover_runs (
  source_year_id uuid PRIMARY KEY REFERENCES public.school_years(id) ON DELETE RESTRICT,
  target_year_id uuid NOT NULL UNIQUE REFERENCES public.school_years(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL UNIQUE,
  finalized_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  finalized_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  source_students integer NOT NULL CHECK (source_students>=0),
  re_enrolled integer NOT NULL CHECK (re_enrolled>=0),
  repeated integer NOT NULL CHECK (repeated>=0),
  departed integer NOT NULL CHECK (departed>=0),
  CHECK (source_year_id<>target_year_id),
  CHECK (source_students=re_enrolled+repeated+departed)
);
CREATE TABLE public.school_year_rollover_audit (
  source_year_id uuid NOT NULL REFERENCES public.school_year_rollover_runs(source_year_id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_enrollment_id uuid NOT NULL REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
  target_enrollment_id uuid REFERENCES public.student_enrollments(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('re_enroll','repeat','leave')),
  source_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  target_class_id uuid REFERENCES public.classes(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  happened_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY(source_year_id,student_id)
);

ALTER TABLE public.school_year_rollover_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_year_rollover_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_year_rollover_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_year_rollover_decisions, public.school_year_rollover_runs,
 public.school_year_rollover_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.school_year_rollover_decisions,public.school_year_rollover_runs,
 public.school_year_rollover_audit TO authenticated;
CREATE POLICY lot5d_decisions_admin_read ON public.school_year_rollover_decisions
 FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY lot5d_runs_admin_read ON public.school_year_rollover_runs
 FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY lot5d_audit_admin_read ON public.school_year_rollover_audit
 FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- Le garde lit une preuve PRIVEE emise par le finaliseur dans la meme transaction.
CREATE FUNCTION schoolnet_private.guard_lot5d_year_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$
BEGIN
  IF OLD.is_current IS NOT DISTINCT FROM NEW.is_current THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM schoolnet_private.lot5d_year_switch_permits p
    WHERE p.tx_id=pg_catalog.txid_current()
      AND (
        (OLD.id=p.source_year_id AND OLD.is_current AND NOT NEW.is_current)
        OR (OLD.id=p.target_year_id AND NOT OLD.is_current AND NEW.is_current)
      )
  ) THEN
    RAISE EXCEPTION '5D AB : modification directe de l annee courante interdite.'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE TRIGGER trg_lot5d_year_switch_guard
 BEFORE UPDATE OF is_current ON public.school_years
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_lot5d_year_switch();

-- Bloquer aussi l'insertion arbitraire d'une annee courante et sa suppression.
CREATE FUNCTION schoolnet_private.guard_lot5d_year_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lifecycle$
BEGIN
  IF TG_OP='INSERT' AND NEW.is_current THEN
    RAISE EXCEPTION '5D AB : creation directe d annee active interdite.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' AND OLD.is_current THEN
    RAISE EXCEPTION '5D AB : suppression de l annee courante interdite.' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$lifecycle$;
CREATE TRIGGER trg_lot5d_year_insert_guard BEFORE INSERT ON public.school_years
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_lot5d_year_lifecycle();
CREATE TRIGGER trg_lot5d_year_delete_guard BEFORE DELETE ON public.school_years
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.guard_lot5d_year_lifecycle();

-- Neutralisation de l'ancienne RPC avec signature INCHANGEE.
CREATE OR REPLACE FUNCTION public.admin_set_current_school_year(p_school_year_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $legacy$
BEGIN
  RAISE EXCEPTION '5D AB : activation directe des annees interdite, finaliseur serveur requis.'
    USING ERRCODE='42501';
END;
$legacy$;
REVOKE ALL ON FUNCTION public.admin_set_current_school_year(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Les deux journaux finaux sont append-only, y compris pour la couche Admin.
CREATE FUNCTION schoolnet_private.reject_lot5d_immutable_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $immutable$
BEGIN
  RAISE EXCEPTION '5D AB : journal final immuable.' USING ERRCODE='42501';
END;
$immutable$;
CREATE TRIGGER trg_lot5d_runs_immutable BEFORE UPDATE OR DELETE ON public.school_year_rollover_runs
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.reject_lot5d_immutable_change();
CREATE TRIGGER trg_lot5d_audit_immutable BEFORE UPDATE OR DELETE ON public.school_year_rollover_audit
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.reject_lot5d_immutable_change();

-- Enregistrement de decision : callable par backend PostgreSQL approuve APRES un GO.
-- AUCUN GRANT EXECUTE n'est delivre aux roles clients ou service_role.
CREATE FUNCTION schoolnet_private.save_lot5d_legacy_decision(
  p_source uuid,p_target uuid,p_student uuid,p_decision text,p_target_class uuid,
  p_note text,p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $save$
DECLARE
  v_source public.school_years%ROWTYPE;
  v_target public.school_years%ROWTYPE;
  v_enrollment public.student_enrollments%ROWTYPE;
  v_class public.classes%ROWTYPE;
  v_origin public.classes%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid() OR NOT public.is_admin()
  THEN RAISE EXCEPTION '5D AB : administrateur verifie requis.' USING ERRCODE='42501'; END IF;
  IF p_source IS NULL OR p_target IS NULL OR p_source=p_target OR p_student IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('pending','re_enroll','repeat','leave')
     OR pg_catalog.char_length(COALESCE(p_note,''))>1000
  THEN RAISE EXCEPTION '5D AB : decision invalide.' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.set_config('lock_timeout','3s',true);
  LOCK TABLE public.school_years,public.classes,public.student_enrollments,
    public.school_year_rollover_decisions,public.school_year_rollover_runs
    IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_source FROM public.school_years WHERE id=p_source;
  SELECT * INTO v_target FROM public.school_years WHERE id=p_target;
  IF (SELECT count(*) FROM public.school_years WHERE is_current)<>1
     OR v_source.id IS NULL OR v_target.id IS NULL OR NOT v_source.is_current
     OR v_target.is_current OR v_target.starts_on<=v_source.starts_on
  THEN RAISE EXCEPTION '5D AB : calendrier source ou destination incoherent.'; END IF;
  IF EXISTS(SELECT 1 FROM public.school_year_rollover_runs WHERE source_year_id=p_source OR target_year_id=p_target)
  THEN RAISE EXCEPTION '5D AB : passage deja finalise.'; END IF;
  SELECT * INTO v_enrollment FROM public.student_enrollments
    WHERE student_id=p_student AND school_year_id=p_source
      AND status='active'::public.student_enrollment_status;
  SELECT * INTO v_origin FROM public.classes WHERE id=v_enrollment.class_id;
  IF v_enrollment.id IS NULL OR v_origin.id IS NULL OR v_origin.school_id IS NOT NULL
     OR v_origin.learning_context<>'legacy_unclassified'
     OR NOT (v_origin.school_year_id=p_source OR
         (v_origin.school_year_id IS NULL AND v_origin.school_year=v_source.name))
  THEN RAISE EXCEPTION '5D AB : dossier source non legacy ou absent.'; END IF;
  IF p_decision IN ('re_enroll','repeat') THEN
    SELECT * INTO v_class FROM public.classes WHERE id=p_target_class;
    IF v_class.id IS NULL OR v_class.school_id IS NOT NULL
       OR v_class.learning_context<>'legacy_unclassified'
       OR NOT (v_class.school_year_id=p_target OR
           (v_class.school_year_id IS NULL AND v_class.school_year=v_target.name))
    THEN RAISE EXCEPTION '5D AB : classe cible legacy incompatible.'; END IF;
    IF p_decision='repeat' AND v_class.level_id<>v_origin.level_id
    THEN RAISE EXCEPTION '5D AB : le redoublement doit conserver le niveau.'; END IF;
  ELSIF p_target_class IS NOT NULL THEN
    RAISE EXCEPTION '5D AB : pas de classe pour pending/leave.';
  END IF;
  INSERT INTO public.school_year_rollover_decisions AS d
    (source_year_id,target_year_id,student_id,source_enrollment_id,
     decision,target_class_id,note,decided_by)
  VALUES(p_source,p_target,p_student,v_enrollment.id,p_decision,p_target_class,
         NULLIF(pg_catalog.btrim(p_note),''),p_actor)
  ON CONFLICT(source_year_id,target_year_id,student_id)
  DO UPDATE SET decision=EXCLUDED.decision,target_class_id=EXCLUDED.target_class_id,
    note=EXCLUDED.note,decided_by=EXCLUDED.decided_by,decided_at=pg_catalog.now(),
    source_enrollment_id=EXCLUDED.source_enrollment_id;
  RETURN pg_catalog.jsonb_build_object('decision',p_decision,'student_id',p_student);
END;
$save$;

-- Operation atomique; REJETTE TOUS les dossiers deja presents dans la cible.
-- Les membres, enseignants, notes, bulletins, documents et liens familiaux ne
-- sont pas modifies. Les anciennes lignes class_students sont conservees.
CREATE FUNCTION schoolnet_private.finalize_lot5d_legacy_year(
  p_source uuid,p_target uuid,p_confirmation text,p_actor uuid,p_operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $finalize$
DECLARE
  v_source public.school_years%ROWTYPE;
  v_target public.school_years%ROWTYPE;
  v_run public.school_year_rollover_runs%ROWTYPE;
  v_total integer;
  v_ready integer;
  v_re integer;
  v_repeat integer;
  v_leave integer;
  v_created integer:=0;
  v_target_enrollment_id uuid;
  v_step record;
BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid() OR NOT public.is_admin()
  THEN RAISE EXCEPTION '5D AB : administrateur verifie requis.' USING ERRCODE='42501'; END IF;
  IF p_source IS NULL OR p_target IS NULL OR p_source=p_target OR p_operation_id IS NULL
  THEN RAISE EXCEPTION '5D AB : confirmation ou identifiant operation invalide.'; END IF;
  PERFORM pg_catalog.set_config('lock_timeout','3s',true);
  -- L'ordre fixe doit etre revu avec toutes les fonctions legacy avant GO.
  LOCK TABLE public.school_years,public.classes,public.student_enrollments,
     public.class_students,public.profiles,public.school_year_rollover_decisions,
     public.school_year_rollover_runs,public.school_year_rollover_audit,
     public.schoolnet_school_student_class_assignments,
     public.schoolnet_school_teacher_subject_assignments
     IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_source FROM public.school_years WHERE id=p_source;
  SELECT * INTO v_target FROM public.school_years WHERE id=p_target;
  IF v_source.id IS NULL OR v_target.id IS NULL
     OR pg_catalog.btrim(COALESCE(p_confirmation,''))<>v_target.name
  THEN RAISE EXCEPTION '5D AB : nom exact annee cible requis.'; END IF;
  SELECT * INTO v_run FROM public.school_year_rollover_runs WHERE source_year_id=p_source;
  IF v_run.source_year_id IS NOT NULL THEN
    IF v_run.target_year_id<>p_target OR v_run.operation_id<>p_operation_id
    THEN RAISE EXCEPTION '5D AB : cle differente ou annee deja finalisee.'; END IF;
    RETURN pg_catalog.jsonb_build_object(
      'source_year_id',p_source,'target_year_id',p_target,
      'source_students',v_run.source_students,'re_enrolled',v_run.re_enrolled,
      'repeated',v_run.repeated,'departed',v_run.departed,'already_finalized',true
    );
  END IF;
  IF (SELECT count(*) FROM public.school_years WHERE is_current)<>1
     OR NOT v_source.is_current OR v_target.is_current
     OR v_target.starts_on<=v_source.starts_on
     OR EXISTS(SELECT 1 FROM public.school_years y
               WHERE y.starts_on>v_source.starts_on AND y.starts_on<v_target.starts_on)
     OR EXISTS(SELECT 1 FROM public.school_year_rollover_runs WHERE target_year_id=p_target)
  THEN RAISE EXCEPTION '5D AB : annee suivante invalide ou passage concurrent.'; END IF;
  -- Cible meme avec brouillon/cancelled => arret, sans ecrasement.
  IF EXISTS(SELECT 1 FROM public.student_enrollments WHERE school_year_id=p_target)
     OR EXISTS(SELECT 1 FROM public.student_enrollments
               WHERE status='active'::public.student_enrollment_status
                 AND school_year_id<>p_source)
  THEN RAISE EXCEPTION '5D AB : annee cible deja occupee ou autre actif anachronique.'; END IF;
  -- Frontiere S3-C : aucun processus officiel implicite.
  IF EXISTS(SELECT 1 FROM public.classes c
            WHERE (c.school_year_id IN (p_source,p_target) OR
                c.school_year IN (v_source.name,v_target.name))
              AND (c.school_id IS NOT NULL OR c.learning_context='school'))
     OR EXISTS(SELECT 1 FROM public.schoolnet_school_student_class_assignments a
               WHERE a.school_year_id IN (p_source,p_target))
     OR EXISTS(SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments a
               WHERE a.school_year_id IN (p_source,p_target))
  THEN RAISE EXCEPTION '5D AB : classes et affectations officielles S3-C hors perimetre.'; END IF;
  -- Toute affectation legacy deja preparee en annee cible est suspecte.
  IF EXISTS(SELECT 1 FROM public.class_students cs JOIN public.classes c ON c.id=cs.class_id
            WHERE c.school_year_id=p_target OR
                (c.school_year_id IS NULL AND c.school_year=v_target.name))
  THEN RAISE EXCEPTION '5D AB : affectation legacy deja presente dans la cible.'; END IF;

  SELECT count(*) INTO v_total FROM public.student_enrollments
    WHERE school_year_id=p_source AND status='active'::public.student_enrollment_status;
  IF v_total=0 THEN RAISE EXCEPTION '5D AB : aucun dossier actif en source.'; END IF;
  SELECT count(*) INTO v_ready FROM public.school_year_rollover_decisions d
    JOIN public.student_enrollments e ON e.id=d.source_enrollment_id
      AND e.student_id=d.student_id AND e.school_year_id=d.source_year_id
      AND e.status='active'::public.student_enrollment_status
    WHERE d.source_year_id=p_source AND d.target_year_id=p_target
      AND d.decision IN ('re_enroll','repeat','leave');
  IF v_ready<>v_total
     OR (SELECT count(*) FROM public.school_year_rollover_decisions
         WHERE source_year_id=p_source AND target_year_id=p_target)<>v_total
     OR EXISTS (
       SELECT 1 FROM public.student_enrollments e
       LEFT JOIN public.school_year_rollover_decisions d
         ON d.source_enrollment_id=e.id AND d.student_id=e.student_id
         AND d.source_year_id=p_source AND d.target_year_id=p_target
       WHERE e.school_year_id=p_source
         AND e.status='active'::public.student_enrollment_status
         AND (d.student_id IS NULL OR d.decision='pending')
     )
  THEN RAISE EXCEPTION '5D AB : toutes les decisions definitives sont requises.'; END IF;

  -- Revalider profils, classes, notes et decision sous verrous.
  IF EXISTS (
    SELECT 1 FROM public.student_enrollments e
    JOIN public.school_year_rollover_decisions d
      ON d.source_enrollment_id=e.id AND d.student_id=e.student_id
      AND d.source_year_id=p_source AND d.target_year_id=p_target
    LEFT JOIN public.classes src ON src.id=e.class_id
    LEFT JOIN public.classes dst ON dst.id=d.target_class_id
    LEFT JOIN public.profiles p ON p.id=e.student_id
    WHERE e.school_year_id=p_source AND e.status='active'::public.student_enrollment_status
      AND (p.id IS NULL OR p.role<>'student'::public.user_role
         OR src.id IS NULL OR src.school_id IS NOT NULL
         OR src.learning_context<>'legacy_unclassified'
         OR NOT (src.school_year_id=p_source OR
            (src.school_year_id IS NULL AND src.school_year=v_source.name))
         OR (p.class_name IS NOT NULL AND p.class_name<>src.name)
         OR (d.decision IN ('re_enroll','repeat') AND
              (dst.id IS NULL OR dst.school_id IS NOT NULL
               OR dst.learning_context<>'legacy_unclassified'
               OR NOT (dst.school_year_id=p_target OR
                   (dst.school_year_id IS NULL AND dst.school_year=v_target.name))))
         OR (d.decision='repeat' AND dst.level_id IS DISTINCT FROM src.level_id)
         OR (d.decision='leave' AND d.target_class_id IS NOT NULL))
  ) THEN RAISE EXCEPTION '5D AB : donnees source/decision/tenant incoherentes.'; END IF;

  SELECT count(*) FILTER(WHERE decision='re_enroll'),
         count(*) FILTER(WHERE decision='repeat'),
         count(*) FILTER(WHERE decision='leave')
  INTO v_re,v_repeat,v_leave
  FROM public.school_year_rollover_decisions WHERE source_year_id=p_source AND target_year_id=p_target;

  INSERT INTO schoolnet_private.lot5d_year_switch_permits(tx_id,source_year_id,target_year_id)
    VALUES(pg_catalog.txid_current(),p_source,p_target);
  UPDATE public.student_enrollments SET status='completed'::public.student_enrollment_status,
    updated_by=p_actor
    WHERE school_year_id=p_source AND status='active'::public.student_enrollment_status;
  UPDATE public.school_years SET is_current=false WHERE id=p_source;
  UPDATE public.school_years SET is_current=true WHERE id=p_target;
  DELETE FROM schoolnet_private.lot5d_year_switch_permits WHERE tx_id=pg_catalog.txid_current();

  INSERT INTO public.school_year_rollover_runs(
    source_year_id,target_year_id,operation_id,finalized_by,source_students,
    re_enrolled,repeated,departed
  ) VALUES(p_source,p_target,p_operation_id,p_actor,v_total,v_re,v_repeat,v_leave);

  FOR v_step IN SELECT e.id AS enrollment_id,e.student_id,e.class_id AS source_class_id,
    d.decision,d.target_class_id,src.name AS source_class_name,dst.name AS target_class_name
    FROM public.student_enrollments e
    JOIN public.school_year_rollover_decisions d ON d.source_enrollment_id=e.id
       AND d.student_id=e.student_id AND d.source_year_id=p_source AND d.target_year_id=p_target
    JOIN public.classes src ON src.id=e.class_id
    LEFT JOIN public.classes dst ON dst.id=d.target_class_id
    WHERE e.school_year_id=p_source ORDER BY e.student_id
  LOOP
    v_target_enrollment_id := NULL;
    IF v_step.decision IN ('re_enroll','repeat') THEN
      INSERT INTO public.student_enrollments(
        student_id,school_year_id,class_id,status,enrolled_on,admission_type,created_by,updated_by
      ) VALUES (
        v_step.student_id,p_target,v_step.target_class_id,
        'active'::public.student_enrollment_status,v_target.starts_on,'continuing',p_actor,p_actor
      ) RETURNING id INTO v_target_enrollment_id;
      INSERT INTO public.class_students(class_id,student_id)
        VALUES(v_step.target_class_id,v_step.student_id);
      UPDATE public.profiles SET class_name=v_step.target_class_name
        WHERE id=v_step.student_id AND
          (class_name IS NULL OR class_name=v_step.source_class_name);
      IF NOT FOUND THEN RAISE EXCEPTION '5D AB : profil modifie concurremment.'; END IF;
      v_created:=v_created+1;
    ELSE
      UPDATE public.profiles SET class_name=NULL
        WHERE id=v_step.student_id AND
          (class_name IS NULL OR class_name=v_step.source_class_name);
      IF NOT FOUND THEN RAISE EXCEPTION '5D AB : depart sans profil coherent.'; END IF;
    END IF;
    INSERT INTO public.school_year_rollover_audit(
      source_year_id,student_id,source_enrollment_id,target_enrollment_id,decision,
      source_class_id,target_class_id,actor_id
    ) VALUES(p_source,v_step.student_id,v_step.enrollment_id,v_target_enrollment_id,
             v_step.decision,v_step.source_class_id,v_step.target_class_id,p_actor);
  END LOOP;

  IF v_created<>v_re+v_repeat
     OR (SELECT count(*) FROM public.school_years WHERE is_current)<>1
     OR NOT (SELECT is_current FROM public.school_years WHERE id=p_target)
     OR EXISTS(SELECT 1 FROM public.student_enrollments WHERE school_year_id=p_source
               AND status='active'::public.student_enrollment_status)
     OR (SELECT count(*) FROM public.student_enrollments WHERE school_year_id=p_target
               AND status='active'::public.student_enrollment_status)<>v_re+v_repeat
     OR (SELECT count(*) FROM public.school_year_rollover_audit WHERE source_year_id=p_source)<>v_total
     OR EXISTS(SELECT 1 FROM schoolnet_private.lot5d_year_switch_permits
               WHERE tx_id=pg_catalog.txid_current())
  THEN RAISE EXCEPTION '5D AB : verification transactionnelle finale refusee.'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'source_year_id',p_source,'target_year_id',p_target,'source_students',v_total,
    're_enrolled',v_re,'repeated',v_repeat,'departed',v_leave,'already_finalized',false
  );
END;
$finalize$;

REVOKE ALL ON FUNCTION schoolnet_private.guard_lot5d_year_switch(),
 schoolnet_private.guard_lot5d_year_lifecycle(),
 schoolnet_private.reject_lot5d_immutable_change(),
 schoolnet_private.save_lot5d_legacy_decision(uuid,uuid,uuid,text,uuid,text,uuid),
 schoolnet_private.finalize_lot5d_legacy_year(uuid,uuid,text,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
DO $postcheck_5d$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.school_years'::regclass
       AND t.tgname='trg_lot5d_year_switch_guard' AND t.tgenabled='O')
 OR pg_catalog.has_function_privilege('authenticated',
      'schoolnet_private.finalize_lot5d_legacy_year(uuid,uuid,text,uuid,uuid)'::regprocedure,'EXECUTE')
 OR pg_catalog.has_function_privilege('service_role',
      'schoolnet_private.finalize_lot5d_legacy_year(uuid,uuid,text,uuid,uuid)'::regprocedure,'EXECUTE')
 OR pg_catalog.has_table_privilege('anon','public.school_year_rollover_runs','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.school_year_rollover_runs','INSERT')
 THEN RAISE EXCEPTION '5D AB : postcontrole des permissions non conforme.'; END IF;
END;
$postcheck_5d$;
COMMIT;
-- Aucun GRANT d'ecriture. Ne jamais publier ce fichier comme migration.
