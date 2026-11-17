-- SCHOOLNET S3-C | RECETTE TRANSACTIONNELLE, NE JAMAIS COMMIT
-- A executer UNIQUEMENT entre BEGIN; et ROLLBACK; avec la proposition S3-C.
-- Les fixtures utilisent des comptes existants; aucun id/e-mail n'est exporte.
-- Aucun cours, bulletin, lien familial, classe ou inscription legacy modifie.

DO $setup_s3c$
DECLARE
  v_admin uuid; v_a uuid; v_b uuid; v_student uuid;v_teacher uuid;
  v_level bigint;v_year uuid;v_year_name text;v_subject uuid;
  v_class_a1 uuid;v_class_a2 uuid;v_class_b uuid;
BEGIN
  SELECT m.user_id,m.school_id INTO v_admin,v_a
  FROM public.schoolnet_school_memberships m
  JOIN public.schoolnet_schools s ON s.id=m.school_id AND s.status='active'
  WHERE m.member_role='school_admin' AND m.status='active' LIMIT 1;
  SELECT id INTO v_b FROM public.schoolnet_schools WHERE status='active' AND id<>v_a LIMIT 1;
  SELECT id INTO v_student FROM public.profiles WHERE role::text='student' LIMIT 1;
  SELECT id INTO v_teacher FROM public.profiles WHERE role::text='teacher' LIMIT 1;
  SELECT id INTO v_level FROM public.levels ORDER BY order_index LIMIT 1;
  SELECT id,name INTO v_year,v_year_name FROM public.school_years ORDER BY starts_on DESC LIMIT 1;
  SELECT id INTO v_subject FROM public.academic_subjects WHERE is_active ORDER BY sort_order LIMIT 1;
  IF v_admin IS NULL OR v_a IS NULL OR v_b IS NULL OR v_student IS NULL
    OR v_teacher IS NULL OR v_level IS NULL OR v_year IS NULL OR v_subject IS NULL
  THEN RAISE EXCEPTION 'S3-C : fixtures non disponibles.'; END IF;
  PERFORM pg_catalog.set_config('qa.s3c.admin',v_admin::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.a',v_a::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.b',v_b::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.student',v_student::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.teacher',v_teacher::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.subject',v_subject::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.year',v_year::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.audit_before',(SELECT count(*)::text FROM public.schoolnet_school_audit),true);
  PERFORM pg_catalog.set_config('qa.s3c.events_before',(SELECT count(*)::text FROM public.schoolnet_school_assignment_events),true);
  PERFORM pg_catalog.set_config('qa.s3c.class_students_before',(SELECT count(*)::text FROM public.class_students),true);
  PERFORM pg_catalog.set_config('qa.s3c.class_teachers_before',(SELECT count(*)::text FROM public.class_teachers),true);
  PERFORM pg_catalog.set_config('qa.s3c.enrollments_before',(SELECT count(*)::text FROM public.student_enrollments),true);
  PERFORM pg_catalog.set_config('qa.s3c.classes_before',(SELECT count(*)::text FROM public.classes),true);
  PERFORM pg_catalog.set_config('qa.s3c.memberships_before',(SELECT count(*)::text FROM public.schoolnet_school_memberships),true);

  INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,assigned_by)
  VALUES (v_a,v_student,'student',v_admin),
         (v_a,v_teacher,'teacher',v_admin),
         (v_b,v_student,'student',v_admin),
         (v_b,v_teacher,'teacher',v_admin),
         (v_b,v_admin,'school_admin',v_admin);

  -- L'administration B ne devient ACTIVE qu'apres le test d'isolement.
  UPDATE public.schoolnet_school_memberships
  SET status='revoked',revoked_at=pg_catalog.now()
  WHERE school_id=v_b AND user_id=v_admin;

  INSERT INTO public.classes(school_id,level_id,name,school_year,school_year_id,learning_context)
  VALUES (v_a,v_level,'S3C QA A1',v_year_name,v_year,'school') RETURNING id INTO v_class_a1;
  INSERT INTO public.classes(school_id,level_id,name,school_year,school_year_id,learning_context)
  VALUES (v_a,v_level,'S3C QA A2',v_year_name,v_year,'school') RETURNING id INTO v_class_a2;
  INSERT INTO public.classes(school_id,level_id,name,school_year,school_year_id,learning_context)
  VALUES (v_b,v_level,'S3C QA B1',v_year_name,v_year,'school') RETURNING id INTO v_class_b;

  PERFORM pg_catalog.set_config('qa.s3c.class_a1',v_class_a1::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.class_a2',v_class_a2::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.class_b',v_class_b::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app"}',true);
END;
$setup_s3c$;

-- L'admin local A n'a PAS droit de lecture ni mutation dans B.
SET LOCAL ROLE authenticated;
DO $qa_s3c_cross_school$
DECLARE
  v_denied_read boolean:=false;
  v_denied_student boolean:=false;
  v_denied_teacher boolean:=false;
BEGIN
  BEGIN
    PERFORM public.schoolnet_school_assignment_catalog(current_setting('qa.s3c.b')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_denied_read:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_student(
      current_setting('qa.s3c.b')::uuid,
      current_setting('qa.s3c.class_b')::uuid,
      current_setting('qa.s3c.student')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied_student:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_teacher_subject(
      current_setting('qa.s3c.b')::uuid,
      current_setting('qa.s3c.class_b')::uuid,
      current_setting('qa.s3c.teacher')::uuid,
      current_setting('qa.s3c.subject')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied_teacher:=true; END;
  IF NOT (v_denied_read AND v_denied_student AND v_denied_teacher) THEN
    RAISE EXCEPTION 'S3-C : refus inter-etablissements insuffisant.';
  END IF;
END;
$qa_s3c_cross_school$;
RESET ROLE;

-- Autorisation temporaire du meme administrateur pour tester le multi-ecoles.
UPDATE public.schoolnet_school_memberships
SET status='active',revoked_at=NULL
WHERE user_id=current_setting('qa.s3c.admin')::uuid
  AND school_id=current_setting('qa.s3c.b')::uuid;

-- Access control des classes officielles et des membres du tenant A.
SET LOCAL ROLE authenticated;
DO $qa_s3c$
DECLARE
  v_a uuid:=current_setting('qa.s3c.a')::uuid;
  v_b uuid:=current_setting('qa.s3c.b')::uuid;
  v_s uuid:=current_setting('qa.s3c.student')::uuid;
  v_t uuid:=current_setting('qa.s3c.teacher')::uuid;
  v_subject uuid:=current_setting('qa.s3c.subject')::uuid;
  v_class_a1 uuid:=current_setting('qa.s3c.class_a1')::uuid;
  v_class_a2 uuid:=current_setting('qa.s3c.class_a2')::uuid;
  v_class_b uuid:=current_setting('qa.s3c.class_b')::uuid;
  v_sa1 uuid;v_sa2 uuid;v_ta1 uuid;v_sb uuid;v_tb uuid;
  v_cat jsonb;
  v_cross_read boolean:=false;v_cross_student boolean:=false;
  v_cross_teacher boolean:=false;v_wrong_class boolean:=false;
  v_wrong_student boolean:=false;v_wrong_teacher boolean:=false;
  v_same_class boolean:=false;v_same_year boolean:=false;
  v_reactivate_conflict boolean:=false;v_preview boolean:=false;
  v_no_origin boolean:=false;v_forged_origin boolean:=false;
  v_teacher_duplicate boolean:=false;
  v_teacher_role_denied boolean:=false;
  v_direct_table_denied boolean:=false;
BEGIN
  v_cat:=public.schoolnet_school_assignment_catalog(v_a);
  IF v_cat->>'school_id'<>v_a::text
    OR pg_catalog.jsonb_array_length(v_cat->'classes')<>2
    OR pg_catalog.jsonb_array_length(v_cat->'students')<>1
    OR pg_catalog.jsonb_array_length(v_cat->'teachers')<>1
    OR pg_catalog.jsonb_array_length(v_cat->'subjects')<1
    OR pg_catalog.jsonb_array_length(v_cat->'student_assignments')<>0
    OR pg_catalog.jsonb_array_length(v_cat->'events')<>0
  THEN RAISE EXCEPTION 'S3-C : catalogue initial incomplet.'; END IF;

  v_sa1:=public.schoolnet_school_assign_student(v_a,v_class_a1,v_s);
  v_ta1:=public.schoolnet_school_assign_teacher_subject(v_a,v_class_a1,v_t,v_subject);
  PERFORM pg_catalog.set_config('qa.s3c.sa1',v_sa1::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.ta1',v_ta1::text,true);

  v_cat:=public.schoolnet_school_assignment_catalog(v_a);
  IF pg_catalog.jsonb_array_length(v_cat->'student_assignments')<>1
    OR pg_catalog.jsonb_array_length(v_cat->'teacher_assignments')<>1
    OR v_cat->'student_assignments'->0->>'status'<>'active'
    OR (v_cat->'student_assignments'->0->>'effective_active')::boolean IS DISTINCT FROM true
    OR (v_cat->'teacher_assignments'->0->>'effective_active')::boolean IS DISTINCT FROM true
    OR pg_catalog.jsonb_array_length(v_cat->'events')<>2
  THEN RAISE EXCEPTION 'S3-C : affectations non visibles dans le catalogue.'; END IF;

  -- L'admin A ne peut voir/affecter B.
  -- Même utilisateur/annee peut avoir une affectation dans B, sous admin B.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',current_setting('qa.s3c.student'),true);
  BEGIN PERFORM public.schoolnet_school_assignment_catalog(v_a);
  EXCEPTION WHEN insufficient_privilege THEN v_teacher_role_denied:=true; END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',current_setting('qa.s3c.admin'),true);

  -- Pour la suite, l'admin est temporairement autorise dans B en fixture.
  -- On lui retire cette affiliation plus loin pour tester la perte de droit.
  v_cat:=public.schoolnet_school_assignment_catalog(v_b);
  IF pg_catalog.jsonb_array_length(v_cat->'classes')<>1
    OR pg_catalog.jsonb_array_length(v_cat->'student_assignments')<>0
  THEN RAISE EXCEPTION 'S3-C : ecole B catalogue errone.'; END IF;

  BEGIN
    PERFORM public.schoolnet_school_assign_student(v_a,v_class_b,v_s);
  EXCEPTION WHEN invalid_parameter_value THEN v_wrong_class:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_student(v_a,v_class_a1,v_t);
  EXCEPTION WHEN insufficient_privilege THEN v_wrong_student:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_teacher_subject(v_a,v_class_a1,v_s,v_subject);
  EXCEPTION WHEN insufficient_privilege THEN v_wrong_teacher:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_student(v_a,v_class_a1,v_s);
  EXCEPTION WHEN unique_violation THEN v_same_class:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_student(v_a,v_class_a2,v_s);
  EXCEPTION WHEN unique_violation THEN v_same_year:=true; END;
  BEGIN
    PERFORM public.schoolnet_school_assign_teacher_subject(v_a,v_class_a1,v_t,v_subject);
  EXCEPTION WHEN unique_violation THEN v_teacher_duplicate:=true; END;

  -- Aucun client authenticated ne peut lire directement les nouvelles tables.
  BEGIN
    PERFORM count(*) FROM public.schoolnet_school_student_class_assignments;
  EXCEPTION WHEN insufficient_privilege THEN v_direct_table_denied:=true; END;

  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-s3c-preview.vercel.app"}',true);
  BEGIN PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa1,false);
  EXCEPTION WHEN insufficient_privilege THEN v_preview:=true; END;
  PERFORM pg_catalog.set_config('request.headers','',true);
  BEGIN PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa1,false);
  EXCEPTION WHEN insufficient_privilege THEN v_no_origin:=true; END;
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app.evil.example"}',true);
  BEGIN PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa1,false);
  EXCEPTION WHEN insufficient_privilege THEN v_forged_origin:=true; END;
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app"}',true);

  IF NOT (v_teacher_role_denied AND v_wrong_class AND v_wrong_student
    AND v_wrong_teacher AND v_same_class AND v_same_year
    AND v_teacher_duplicate AND v_direct_table_denied AND v_preview
    AND v_no_origin AND v_forged_origin)
  THEN RAISE EXCEPTION 'S3-C : garde-fous incomplets.'; END IF;

  -- Transfert de classe en deux operations tracees, avec conflit en cas
  -- de reactivation simultanee dans la meme ecole/annee.
  PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa1,false);
  v_sa2:=public.schoolnet_school_assign_student(v_a,v_class_a2,v_s);
  BEGIN
    PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa1,true);
  EXCEPTION WHEN unique_violation THEN v_reactivate_conflict:=true; END;
  IF NOT v_reactivate_conflict THEN
    RAISE EXCEPTION 'S3-C : conflit reactivation eleve non bloque.';
  END IF;
  PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa2,false);
  PERFORM public.schoolnet_school_set_student_assignment_active(v_a,v_sa1,true);

  PERFORM public.schoolnet_school_set_teacher_subject_assignment_active(v_a,v_ta1,false);
  PERFORM public.schoolnet_school_set_teacher_subject_assignment_active(v_a,v_ta1,true);

  -- Un eleve dans deux ecoles avec la meme annee a 2 affectations isolees.
  v_sb:=public.schoolnet_school_assign_student(v_b,v_class_b,v_s);
  v_tb:=public.schoolnet_school_assign_teacher_subject(v_b,v_class_b,v_t,v_subject);
  v_cat:=public.schoolnet_school_assignment_catalog(v_a);
  IF pg_catalog.jsonb_array_length(v_cat->'student_assignments')<>2
    OR pg_catalog.jsonb_array_length(v_cat->'teacher_assignments')<>1
  THEN RAISE EXCEPTION 'S3-C : ecole B contaminateur du catalogue A.'; END IF;
  v_cat:=public.schoolnet_school_assignment_catalog(v_b);
  IF pg_catalog.jsonb_array_length(v_cat->'student_assignments')<>1
    OR pg_catalog.jsonb_array_length(v_cat->'teacher_assignments')<>1
  THEN RAISE EXCEPTION 'S3-C : catalogue B incoherent.'; END IF;

  PERFORM pg_catalog.set_config('qa.s3c.sb',v_sb::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.tb',v_tb::text,true);
  PERFORM pg_catalog.set_config('qa.s3c.sa2',v_sa2::text,true);
END;
$qa_s3c$;
RESET ROLE;

-- Revele la suspension effective par retrait d'affiliation, sans modifier
-- l'historique des affectations. Une reactivation sans affiliation est bloquee.
UPDATE public.schoolnet_school_memberships
SET status='revoked',revoked_at=pg_catalog.now()
WHERE school_id=current_setting('qa.s3c.a')::uuid
  AND user_id=current_setting('qa.s3c.student')::uuid;
SET LOCAL ROLE authenticated;
DO $qa_s3c_membership$
DECLARE
  v_cat jsonb;
  v_denied boolean:=false;
BEGIN
  v_cat:=public.schoolnet_school_assignment_catalog(current_setting('qa.s3c.a')::uuid);
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_cat->'student_assignments') a
    WHERE a->>'id'=current_setting('qa.s3c.sa1') AND (a->>'effective_active')::boolean=false
  ) THEN RAISE EXCEPTION 'S3-C : suspension membre non visible.'; END IF;
  PERFORM public.schoolnet_school_set_student_assignment_active(
    current_setting('qa.s3c.a')::uuid,current_setting('qa.s3c.sa1')::uuid,false
  );
  BEGIN
    PERFORM public.schoolnet_school_set_student_assignment_active(
      current_setting('qa.s3c.a')::uuid,current_setting('qa.s3c.sa1')::uuid,true
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'S3-C : reactivation sans affiliation acceptee.'; END IF;
END;
$qa_s3c_membership$;
RESET ROLE;

DO $qa_s3c_audit$
BEGIN
  IF (SELECT count(*) FROM public.schoolnet_school_audit)
     <> current_setting('qa.s3c.audit_before')::bigint+11
    OR (SELECT count(*) FROM public.schoolnet_school_assignment_events)
     <> current_setting('qa.s3c.events_before')::bigint+11
    OR (SELECT count(*) FROM public.class_students)
     <> current_setting('qa.s3c.class_students_before')::bigint
    OR (SELECT count(*) FROM public.class_teachers)
     <> current_setting('qa.s3c.class_teachers_before')::bigint
    OR (SELECT count(*) FROM public.student_enrollments)
     <> current_setting('qa.s3c.enrollments_before')::bigint
    OR (SELECT count(*) FROM public.classes)
     <> current_setting('qa.s3c.classes_before')::bigint+3
    OR (SELECT count(*) FROM public.schoolnet_school_memberships)
     <> current_setting('qa.s3c.memberships_before')::bigint+5
  THEN RAISE EXCEPTION 'S3-C : audit, donnees scolaires ou effectifs non conformes.'; END IF;
END;
$qa_s3c_audit$;

-- Revocation administrateur dans A : doit perdre A mais continuer a gerer B.
UPDATE public.schoolnet_school_memberships
SET status='revoked',revoked_at=pg_catalog.now()
WHERE school_id=current_setting('qa.s3c.a')::uuid
  AND user_id=current_setting('qa.s3c.admin')::uuid;
SET LOCAL ROLE authenticated;
DO $qa_s3c_revoked_admin$
DECLARE v_denied boolean:=false;v_b jsonb;
BEGIN
  BEGIN PERFORM public.schoolnet_school_assignment_catalog(current_setting('qa.s3c.a')::uuid);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  v_b:=public.schoolnet_school_assignment_catalog(current_setting('qa.s3c.b')::uuid);
  IF NOT v_denied OR pg_catalog.jsonb_array_length(v_b->'teacher_assignments')<>1 THEN
    RAISE EXCEPTION 'S3-C : revocation school_admin non appliquee.';
  END IF;
END;
$qa_s3c_revoked_admin$;
RESET ROLE;

SELECT 'S3C_ASSIGNMENTS_ROLES_TENANT_YEAR_SUBJECT_PREVIEW_HISTORY_ROLLBACK_PASS' AS result;
-- ROLLBACK obligatoire dans la MEME transaction.
