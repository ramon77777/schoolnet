-- SCHOOLNET 2.0 — S3-C (PROPOSITION SQL NON INSTALLEE)
-- Affectations officielles, separees des tables class_students, class_teachers,
-- student_enrollments, class_subject_settings, notes et bulletins legacy.
-- Fichier sous proposals/ UNIQUEMENT. Aucun db push ni migration sans accord.
-- Pour les essais : BEGIN; <proposition>; <recette>; ROLLBACK.
-- L'origine HTTP bloque les ecritures de Preview; elle n'est pas une identite
-- (forgeable hors navigateur). Les droits reels reposent sur auth.uid(),
-- role school_admin, et affiliation ACTIVE du responsable a l'etablissement.

DO $preflight_s3c$
DECLARE v_constraint text;
BEGIN
  IF to_regclass('public.schoolnet_school_student_class_assignments') IS NOT NULL
    OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NOT NULL
    OR to_regclass('public.schoolnet_school_assignment_events') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_assign_student(uuid,uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_set_student_assignment_active(uuid,uuid,boolean)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_assign_teacher_subject(uuid,uuid,uuid,uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_set_teacher_subject_assignment_active(uuid,uuid,boolean)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_student_roster(uuid)') IS NULL
    OR to_regprocedure('public.schoolnet_school_teacher_roster(uuid)') IS NULL
    OR to_regprocedure('public.schoolnet_school_class_catalog(uuid)') IS NULL
    OR to_regprocedure('schoolnet_private.is_school_admin_for(uuid)') IS NULL
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','INSERT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','UPDATE')
  THEN RAISE EXCEPTION 'S3-C : prerequis manquants, droits inattendus ou module deja present.';
  END IF;
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_constraint
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.schoolnet_school_audit'::pg_catalog.regclass
    AND conname='schoolnet_school_audit_action_check';
  IF v_constraint IS NULL
    OR pg_catalog.strpos(v_constraint,'school_student_reactivated')=0
    OR pg_catalog.strpos(v_constraint,'school_student_class_assigned')<>0
  THEN RAISE EXCEPTION 'S3-C : journal de securite S3-B inattendu.';
  END IF;
END;
$preflight_s3c$;

-- 1 classe ACTIVE par eleve/etablissement/annee.
-- Les annees identiques d'etablissements differents sont independantes.
CREATE TABLE public.schoolnet_school_student_class_assignments (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  revoked_at timestamptz,
  CONSTRAINT schoolnet_s3c_student_status_consistent CHECK (
    (status='active' AND revoked_at IS NULL) OR
    (status='revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT schoolnet_s3c_student_same_class_unique UNIQUE (class_id,student_id)
);
CREATE UNIQUE INDEX schoolnet_s3c_student_one_class_per_school_year
  ON public.schoolnet_school_student_class_assignments
  (school_id,school_year_id,student_id) WHERE status='active';
CREATE INDEX schoolnet_s3c_student_class_list
  ON public.schoolnet_school_student_class_assignments (school_id,class_id);

-- Affectation enseignant par couple (classe,matiere). Plusieurs enseignants
-- peuvent intervenir dans une meme matiere, pas de doublon exact.
CREATE TABLE public.schoolnet_school_teacher_subject_assignments (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject_id uuid NOT NULL REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  revoked_at timestamptz,
  CONSTRAINT schoolnet_s3c_teacher_status_consistent CHECK (
    (status='active' AND revoked_at IS NULL) OR
    (status='revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT schoolnet_s3c_teacher_subject_unique UNIQUE
    (class_id,teacher_id,subject_id)
);
CREATE INDEX schoolnet_s3c_teacher_class_list
  ON public.schoolnet_school_teacher_subject_assignments (school_id,class_id);

-- Journal immuable des mouvements : conserve chaque transition, meme apres
-- une reactivation ou un changement de classe. Ne stocke aucun email.
CREATE TABLE public.schoolnet_school_assignment_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
  assignment_kind text NOT NULL CHECK (assignment_kind IN ('student_class','teacher_subject')),
  assignment_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  school_year_id uuid NOT NULL REFERENCES public.school_years(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject_id uuid REFERENCES public.academic_subjects(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('assigned','revoked','reactivated')),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT schoolnet_s3c_events_subject_consistent CHECK (
    (assignment_kind='student_class' AND subject_id IS NULL) OR
    (assignment_kind='teacher_subject' AND subject_id IS NOT NULL)
  )
);
CREATE INDEX schoolnet_s3c_events_school_class_recent
  ON public.schoolnet_school_assignment_events (school_id,class_id,created_at DESC);

-- Defense en profondeur: aucune lecture / mutation directe via l'API REST.
-- Les lectures et ecritures passent uniquement par les RPC tenant-scoped.
ALTER TABLE public.schoolnet_school_student_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_school_teacher_subject_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_school_assignment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schoolnet_school_student_class_assignments FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.schoolnet_school_teacher_subject_assignments FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.schoolnet_school_assignment_events FROM PUBLIC,anon,authenticated;

-- Invariants supplementaires meme lors d'un insert privilegié :
-- classe officielle de l'ecole/annee, membre au bon role et actif.
-- La revocation est autorisee meme lorsque l'affiliation est suspendue.
CREATE FUNCTION schoolnet_private.validate_s3c_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $validate$
DECLARE v_user uuid;v_role text;
BEGIN
  IF TG_TABLE_NAME='schoolnet_school_student_class_assignments' THEN
    v_user:=NEW.student_id; v_role:='student';
    IF TG_OP='UPDATE' AND (
      NEW.school_id IS DISTINCT FROM OLD.school_id OR
      NEW.class_id IS DISTINCT FROM OLD.class_id OR
      NEW.school_year_id IS DISTINCT FROM OLD.school_year_id OR
      NEW.student_id IS DISTINCT FROM OLD.student_id
    ) THEN
      RAISE EXCEPTION 'S3-C : identite de l''affectation eleve immuable.' USING ERRCODE='22023';
    END IF;
  ELSIF TG_TABLE_NAME='schoolnet_school_teacher_subject_assignments' THEN
    v_user:=NEW.teacher_id;v_role:='teacher';
    IF TG_OP='UPDATE' AND (
      NEW.school_id IS DISTINCT FROM OLD.school_id OR
      NEW.class_id IS DISTINCT FROM OLD.class_id OR
      NEW.school_year_id IS DISTINCT FROM OLD.school_year_id OR
      NEW.teacher_id IS DISTINCT FROM OLD.teacher_id OR
      NEW.subject_id IS DISTINCT FROM OLD.subject_id
    ) THEN
      RAISE EXCEPTION 'S3-C : identite de l''affectation enseignant immuable.' USING ERRCODE='22023';
    END IF;
    IF (TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.status='active' AND OLD.status<>'active'))
      AND NOT EXISTS (
        SELECT 1 FROM public.academic_subjects
        WHERE id=NEW.subject_id AND is_active=true
      ) THEN
      RAISE EXCEPTION 'S3-C : matiere inactive.' USING ERRCODE='22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'S3-C : table d''affectation inconnue.' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.schoolnet_schools s ON s.id=c.school_id AND s.status='active'
    WHERE c.id=NEW.class_id AND c.school_id=NEW.school_id
      AND c.school_year_id=NEW.school_year_id AND c.learning_context='school'
  ) THEN
    RAISE EXCEPTION 'S3-C : classe officielle et annee incompatibles.'
      USING ERRCODE='22023';
  END IF;

  IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.status='active' AND OLD.status<>'active') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text=v_role
      WHERE m.school_id=NEW.school_id AND m.user_id=v_user
        AND m.member_role=v_role AND m.status='active'
    ) THEN
      RAISE EXCEPTION 'S3-C : affiliation de membre inactive ou non autorisee.'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$validate$;
CREATE TRIGGER trg_schoolnet_s3c_student_integrity
  BEFORE INSERT OR UPDATE ON public.schoolnet_school_student_class_assignments
  FOR EACH ROW EXECUTE FUNCTION schoolnet_private.validate_s3c_assignment();
CREATE TRIGGER trg_schoolnet_s3c_teacher_integrity
  BEFORE INSERT OR UPDATE ON public.schoolnet_school_teacher_subject_assignments
  FOR EACH ROW EXECUTE FUNCTION schoolnet_private.validate_s3c_assignment();

-- Verification commune de l'identite et de l'origine AVANT toute action.
CREATE FUNCTION schoolnet_private.assert_s3c_access(
  p_school_id uuid,p_write boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $guard$
DECLARE v_headers text;
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'S3-C : acces a cet etablissement non autorise.' USING ERRCODE='42501';
  END IF;

  IF p_write IS TRUE THEN
    -- Le domaine HTTP ne suffit jamais pour autoriser une operation.
    v_headers:=NULLIF(pg_catalog.current_setting('request.headers',true),'');
    IF v_headers IS NULL OR
      (v_headers::jsonb ->> 'origin')
        IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
    THEN
      RAISE EXCEPTION 'S3-C : mutation interdite depuis cet environnement.' USING ERRCODE='42501';
    END IF;
  END IF;
END;
$guard$;

-- Catalogue autorise : aucune lecture des tables legacy.
-- Noms uniquement des membres affilies de CET etablissement.
CREATE FUNCTION schoolnet_private.local_school_assignment_catalog(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $catalog$
BEGIN
  PERFORM schoolnet_private.assert_s3c_access(p_school_id,false);
  RETURN pg_catalog.jsonb_build_object(
    'school_id',p_school_id,
    'events',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',e.id,'class_id',e.class_id,'assignment_kind',e.assignment_kind,
          'action',e.action,'member_name',COALESCE(member.full_name,''),
          'subject_name',subject.name,'actor_name',COALESCE(actor.full_name,''),
          'created_at',e.created_at
        ) ORDER BY e.created_at DESC,e.id DESC
      )
      FROM (
        SELECT ev.id,ev.class_id,ev.assignment_kind,ev.action,
          ev.person_id,ev.subject_id,ev.actor_id,ev.created_at
        FROM public.schoolnet_school_assignment_events ev
        WHERE ev.school_id=p_school_id
        ORDER BY ev.created_at DESC,ev.id DESC LIMIT 100
      ) e
      LEFT JOIN public.profiles member ON member.id=e.person_id
      LEFT JOIN public.profiles actor ON actor.id=e.actor_id
      LEFT JOIN public.academic_subjects subject ON subject.id=e.subject_id
    ),'[]'::jsonb),
    'classes',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',c.id,'name',c.name,'school_year_id',c.school_year_id,
          'school_year',c.school_year,'level_name',l.name
        ) ORDER BY c.school_year DESC,c.name,c.id)
      FROM public.classes c JOIN public.levels l ON l.id=c.level_id
      WHERE c.school_id=p_school_id AND c.learning_context='school'
    ),'[]'::jsonb),
    'students',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',m.user_id,'full_name',COALESCE(p.full_name,''),'status',m.status)
        ORDER BY pg_catalog.lower(COALESCE(p.full_name,'')),m.user_id
      )
      FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text='student'
      WHERE m.school_id=p_school_id AND m.member_role='student' AND m.status='active'
    ),'[]'::jsonb),
    'teachers',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',m.user_id,'full_name',COALESCE(p.full_name,''),'status',m.status)
        ORDER BY pg_catalog.lower(COALESCE(p.full_name,'')),m.user_id
      )
      FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text='teacher'
      WHERE m.school_id=p_school_id AND m.member_role='teacher' AND m.status='active'
    ),'[]'::jsonb),
    'subjects',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',s.id,'name',s.name,'code',s.code)
        ORDER BY s.sort_order,s.name,s.id
      )
      FROM public.academic_subjects s WHERE s.is_active
    ),'[]'::jsonb),
    'student_assignments',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',a.id,'class_id',a.class_id,'school_year_id',a.school_year_id,
          'student_id',a.student_id,'student_name',COALESCE(p.full_name,''),
          'status',a.status,'effective_active',(a.status='active' AND m.id IS NOT NULL),
          'assigned_at',a.assigned_at,'revoked_at',a.revoked_at
        ) ORDER BY a.assigned_at DESC,a.id
      )
      FROM public.schoolnet_school_student_class_assignments a
      JOIN public.profiles p ON p.id=a.student_id
      LEFT JOIN public.schoolnet_school_memberships m ON
        m.school_id=a.school_id AND m.user_id=a.student_id
        AND m.member_role='student' AND m.status='active'
      WHERE a.school_id=p_school_id
    ),'[]'::jsonb),
    'teacher_assignments',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',a.id,'class_id',a.class_id,'school_year_id',a.school_year_id,
          'teacher_id',a.teacher_id,'teacher_name',COALESCE(p.full_name,''),
          'subject_id',a.subject_id,'subject_name',s.name,
          'status',a.status,
          'effective_active',(a.status='active' AND m.id IS NOT NULL AND s.is_active),
          'assigned_at',a.assigned_at,'revoked_at',a.revoked_at
        ) ORDER BY a.assigned_at DESC,a.id
      )
      FROM public.schoolnet_school_teacher_subject_assignments a
      JOIN public.profiles p ON p.id=a.teacher_id
      JOIN public.academic_subjects s ON s.id=a.subject_id
      LEFT JOIN public.schoolnet_school_memberships m ON
        m.school_id=a.school_id AND m.user_id=a.teacher_id
        AND m.member_role='teacher' AND m.status='active'
      WHERE a.school_id=p_school_id
    ),'[]'::jsonb)
  );
END;
$catalog$;

CREATE FUNCTION schoolnet_private.local_school_assign_student(
  p_school_id uuid,p_class_id uuid,p_student_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $assign_student$
DECLARE v_year uuid;v_id uuid;
BEGIN
  PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
  SELECT c.school_year_id INTO v_year
  FROM public.classes c
  WHERE c.id=p_class_id AND c.school_id=p_school_id
    AND c.learning_context='school';
  IF v_year IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'S3-C : classe officielle ou eleve invalide.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schoolnet_school_student_class_assignments a
    WHERE a.class_id=p_class_id AND a.student_id=p_student_id
  ) THEN RAISE EXCEPTION 'S3-C : affectation existante, reactiver si necessaire.'
    USING ERRCODE='23505'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.schoolnet_school_student_class_assignments a
    WHERE a.school_id=p_school_id AND a.school_year_id=v_year
      AND a.student_id=p_student_id AND a.status='active'
  ) THEN RAISE EXCEPTION 'S3-C : eleve deja affecte dans une autre classe pour cette annee.'
    USING ERRCODE='23505'; END IF;

  INSERT INTO public.schoolnet_school_student_class_assignments
    (school_id,class_id,school_year_id,student_id,assigned_by)
  VALUES (p_school_id,p_class_id,v_year,p_student_id,auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (p_school_id,'school_student_class_assigned',auth.uid(),p_student_id);
  INSERT INTO public.schoolnet_school_assignment_events
    (school_id,assignment_kind,assignment_id,class_id,school_year_id,
     person_id,subject_id,action,actor_id)
  VALUES (p_school_id,'student_class',v_id,p_class_id,v_year,p_student_id,
          NULL,'assigned',auth.uid());
  RETURN v_id;
END;
$assign_student$;

CREATE FUNCTION schoolnet_private.local_school_set_student_assignment_active(
  p_school_id uuid,p_assignment_id uuid,p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $student_status$
DECLARE v_current text;v_student uuid;v_year uuid;v_class uuid;
BEGIN
  PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
  IF p_assignment_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'S3-C : affectation ou statut invalide.' USING ERRCODE='22023';
  END IF;
  SELECT a.status,a.student_id,a.school_year_id,a.class_id
  INTO v_current,v_student,v_year,v_class
  FROM public.schoolnet_school_student_class_assignments a
  WHERE a.id=p_assignment_id AND a.school_id=p_school_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'S3-C : affectation absente ou hors etablissement.' USING ERRCODE='42501';
  END IF;
  IF (v_current='active')=p_active THEN
    RAISE EXCEPTION 'S3-C : ce statut est deja applique.' USING ERRCODE='22023';
  END IF;
  IF p_active AND EXISTS (
    SELECT 1 FROM public.schoolnet_school_student_class_assignments a
    WHERE a.school_id=p_school_id AND a.student_id=v_student AND a.school_year_id=v_year
      AND a.status='active' AND a.id<>p_assignment_id
  ) THEN
    RAISE EXCEPTION 'S3-C : eleve deja affecte ailleurs pour cette annee.' USING ERRCODE='23505';
  END IF;
  UPDATE public.schoolnet_school_student_class_assignments
  SET status=CASE WHEN p_active THEN 'active' ELSE 'revoked' END,
      revoked_at=CASE WHEN p_active THEN NULL ELSE pg_catalog.now() END,
      assigned_at=CASE WHEN p_active THEN pg_catalog.now() ELSE assigned_at END,
      assigned_by=CASE WHEN p_active THEN auth.uid() ELSE assigned_by END
  WHERE id=p_assignment_id;
  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (
    p_school_id,
    CASE WHEN p_active THEN 'school_student_class_reactivated'
         ELSE 'school_student_class_revoked' END,
    auth.uid(),v_student
  );
  INSERT INTO public.schoolnet_school_assignment_events
    (school_id,assignment_kind,assignment_id,class_id,school_year_id,
     person_id,subject_id,action,actor_id)
  VALUES (
    p_school_id,'student_class',p_assignment_id,v_class,v_year,v_student,
    NULL,CASE WHEN p_active THEN 'reactivated' ELSE 'revoked' END,auth.uid()
  );
  RETURN p_assignment_id;
END;
$student_status$;

CREATE FUNCTION schoolnet_private.local_school_assign_teacher_subject(
  p_school_id uuid,p_class_id uuid,p_teacher_id uuid,p_subject_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $assign_teacher$
DECLARE v_year uuid;v_id uuid;
BEGIN
  PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
  SELECT c.school_year_id INTO v_year FROM public.classes c
  WHERE c.id=p_class_id AND c.school_id=p_school_id AND c.learning_context='school';
  IF v_year IS NULL OR p_teacher_id IS NULL OR p_subject_id IS NULL THEN
    RAISE EXCEPTION 'S3-C : classe officielle, enseignant ou matiere invalide.'
      USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schoolnet_school_teacher_subject_assignments a
    WHERE a.class_id=p_class_id AND a.teacher_id=p_teacher_id AND a.subject_id=p_subject_id
  ) THEN
    RAISE EXCEPTION 'S3-C : meme affectation existante, reactiver si necessaire.'
      USING ERRCODE='23505';
  END IF;
  INSERT INTO public.schoolnet_school_teacher_subject_assignments
    (school_id,class_id,school_year_id,teacher_id,subject_id,assigned_by)
  VALUES (p_school_id,p_class_id,v_year,p_teacher_id,p_subject_id,auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (p_school_id,'school_teacher_subject_assigned',auth.uid(),p_teacher_id);
  INSERT INTO public.schoolnet_school_assignment_events
    (school_id,assignment_kind,assignment_id,class_id,school_year_id,
     person_id,subject_id,action,actor_id)
  VALUES (
    p_school_id,'teacher_subject',v_id,p_class_id,v_year,p_teacher_id,
    p_subject_id,'assigned',auth.uid()
  );
  RETURN v_id;
END;
$assign_teacher$;

CREATE FUNCTION schoolnet_private.local_school_set_teacher_subject_assignment_active(
  p_school_id uuid,p_assignment_id uuid,p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $teacher_status$
DECLARE v_current text;v_teacher uuid;v_class uuid;v_year uuid;v_subject uuid;
BEGIN
  PERFORM schoolnet_private.assert_s3c_access(p_school_id,true);
  IF p_assignment_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'S3-C : affectation ou statut invalide.' USING ERRCODE='22023';
  END IF;
  SELECT a.status,a.teacher_id,a.class_id,a.school_year_id,a.subject_id
  INTO v_current,v_teacher,v_class,v_year,v_subject
  FROM public.schoolnet_school_teacher_subject_assignments a
  WHERE a.id=p_assignment_id AND a.school_id=p_school_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'S3-C : affectation enseignant absente ou hors ecole.' USING ERRCODE='42501';
  END IF;
  IF (v_current='active')=p_active THEN
    RAISE EXCEPTION 'S3-C : ce statut est deja applique.' USING ERRCODE='22023';
  END IF;
  UPDATE public.schoolnet_school_teacher_subject_assignments
  SET status=CASE WHEN p_active THEN 'active' ELSE 'revoked' END,
      revoked_at=CASE WHEN p_active THEN NULL ELSE pg_catalog.now() END,
      assigned_at=CASE WHEN p_active THEN pg_catalog.now() ELSE assigned_at END,
      assigned_by=CASE WHEN p_active THEN auth.uid() ELSE assigned_by END
  WHERE id=p_assignment_id;
  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (
    p_school_id,
    CASE WHEN p_active THEN 'school_teacher_subject_reactivated'
         ELSE 'school_teacher_subject_revoked' END,
    auth.uid(),v_teacher
  );
  INSERT INTO public.schoolnet_school_assignment_events
    (school_id,assignment_kind,assignment_id,class_id,school_year_id,
     person_id,subject_id,action,actor_id)
  VALUES (
    p_school_id,'teacher_subject',p_assignment_id,v_class,v_year,v_teacher,
    v_subject,CASE WHEN p_active THEN 'reactivated' ELSE 'revoked' END,auth.uid()
  );
  RETURN p_assignment_id;
END;
$teacher_status$;

-- Conserver toutes les actions precedentes. Seules 6 nouvelles valeurs.
ALTER TABLE public.schoolnet_school_audit DROP CONSTRAINT schoolnet_school_audit_action_check;
ALTER TABLE public.schoolnet_school_audit ADD CONSTRAINT schoolnet_school_audit_action_check
CHECK (action IN (
  'school_created',
  'school_admin_assigned',
  'school_admin_reactivated',
  'school_admin_invitation_prepared',
  'school_admin_invitation_sent_declared',
  'school_class_created',
  'school_teacher_linked',
  'school_teacher_revoked',
  'school_teacher_reactivated',
  'school_student_linked',
  'school_student_revoked',
  'school_student_reactivated',
  'school_student_class_assigned',
  'school_student_class_revoked',
  'school_student_class_reactivated',
  'school_teacher_subject_assigned',
  'school_teacher_subject_revoked',
  'school_teacher_subject_reactivated'
));

-- Facades PostgREST SECURITY INVOKER dans public, code privilegie prive.
CREATE FUNCTION public.schoolnet_school_assignment_catalog(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $public_catalog$
  SELECT schoolnet_private.local_school_assignment_catalog(p_school_id);
$public_catalog$;
CREATE FUNCTION public.schoolnet_school_assign_student(
  p_school_id uuid,p_class_id uuid,p_student_id uuid
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $public_assign_student$
  SELECT schoolnet_private.local_school_assign_student(p_school_id,p_class_id,p_student_id);
$public_assign_student$;
CREATE FUNCTION public.schoolnet_school_set_student_assignment_active(
  p_school_id uuid,p_assignment_id uuid,p_active boolean
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $public_student_status$
  SELECT schoolnet_private.local_school_set_student_assignment_active(
    p_school_id,p_assignment_id,p_active);
$public_student_status$;
CREATE FUNCTION public.schoolnet_school_assign_teacher_subject(
  p_school_id uuid,p_class_id uuid,p_teacher_id uuid,p_subject_id uuid
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $public_assign_teacher$
  SELECT schoolnet_private.local_school_assign_teacher_subject(
    p_school_id,p_class_id,p_teacher_id,p_subject_id);
$public_assign_teacher$;
CREATE FUNCTION public.schoolnet_school_set_teacher_subject_assignment_active(
  p_school_id uuid,p_assignment_id uuid,p_active boolean
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $public_teacher_status$
  SELECT schoolnet_private.local_school_set_teacher_subject_assignment_active(
    p_school_id,p_assignment_id,p_active);
$public_teacher_status$;

REVOKE ALL ON FUNCTION schoolnet_private.validate_s3c_assignment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.assert_s3c_access(uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_assignment_catalog(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_assign_student(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_set_student_assignment_active(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_assign_teacher_subject(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_set_teacher_subject_assignment_active(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_assignment_catalog(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_assign_student(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_set_student_assignment_active(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_assign_teacher_subject(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_set_teacher_subject_assignment_active(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;

-- Authenticated ne recoit que le droit EXECUTE pour traverser les facades
-- et leurs helpers. Le helper de validation trigger ne s'appelle pas
-- depuis le client; aucune permission de table n'est accordee.
GRANT EXECUTE ON FUNCTION schoolnet_private.assert_s3c_access(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_assignment_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_assign_student(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_set_student_assignment_active(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_assign_teacher_subject(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_set_teacher_subject_assignment_active(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_assignment_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_assign_student(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_set_student_assignment_active(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_assign_teacher_subject(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_set_teacher_subject_assignment_active(uuid,uuid,boolean) TO authenticated;

DO $verify_s3c$
DECLARE v_public_functions integer;v_protected_tables integer;
BEGIN
  SELECT count(*) INTO v_public_functions FROM pg_catalog.pg_proc
  WHERE oid IN (
    'public.schoolnet_school_assignment_catalog(uuid)'::pg_catalog.regprocedure,
    'public.schoolnet_school_assign_student(uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'public.schoolnet_school_set_student_assignment_active(uuid,uuid,boolean)'::pg_catalog.regprocedure,
    'public.schoolnet_school_assign_teacher_subject(uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure,
    'public.schoolnet_school_set_teacher_subject_assignment_active(uuid,uuid,boolean)'::pg_catalog.regprocedure
  ) AND NOT prosecdef;
  SELECT count(*) INTO v_protected_tables FROM pg_catalog.pg_class
  WHERE oid IN (
    'public.schoolnet_school_student_class_assignments'::pg_catalog.regclass,
    'public.schoolnet_school_teacher_subject_assignments'::pg_catalog.regclass,
    'public.schoolnet_school_assignment_events'::pg_catalog.regclass
  ) AND relrowsecurity;
  IF v_public_functions<>5 OR v_protected_tables<>3
    OR pg_catalog.has_function_privilege('anon','public.schoolnet_school_assignment_catalog(uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon','public.schoolnet_school_assign_student(uuid,uuid,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon','public.schoolnet_school_set_student_assignment_active(uuid,uuid,boolean)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon','public.schoolnet_school_assign_teacher_subject(uuid,uuid,uuid,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon','public.schoolnet_school_set_teacher_subject_assignment_active(uuid,uuid,boolean)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated','public.schoolnet_school_assignment_catalog(uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated','public.schoolnet_school_assign_student(uuid,uuid,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated','public.schoolnet_school_set_student_assignment_active(uuid,uuid,boolean)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated','public.schoolnet_school_assign_teacher_subject(uuid,uuid,uuid,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('authenticated','public.schoolnet_school_set_teacher_subject_assignment_active(uuid,uuid,boolean)','EXECUTE')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_student_class_assignments','SELECT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_student_class_assignments','INSERT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_teacher_subject_assignments','SELECT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_teacher_subject_assignments','INSERT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_assignment_events','SELECT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_assignment_events','INSERT')
  THEN RAISE EXCEPTION 'S3-C : controle des privileges et RLS non conforme.';
  END IF;
END;
$verify_s3c$;
