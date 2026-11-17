-- SCHOOLNET S3-B | RECETTE REVERSIBLE | NE JAMAIS COMMIT
-- BEGIN; <proposition S3-B>; <CE FICHIER>; ROLLBACK;
-- Tests avec comptes existants, aucune creation durable d'utilisateur.
-- Ne jamais coller les identifiants/e-mails reels dans des rapports.

DO $setup_s3b$
DECLARE
  v_local uuid;
  v_a uuid;
  v_b uuid;
  v_student uuid;
  v_email text;
  v_teacher_email text;
  v_technical_email text;
BEGIN
  SELECT m.user_id,m.school_id INTO v_local,v_a
    FROM public.schoolnet_school_memberships m
    JOIN public.schoolnet_schools s ON s.id=m.school_id
   WHERE m.member_role='school_admin' AND m.status='active' AND s.status='active'
   LIMIT 1;
  SELECT id INTO v_b FROM public.schoolnet_schools
   WHERE id<>v_a AND status='active' LIMIT 1;
  SELECT p.id,u.email INTO v_student,v_email
    FROM public.profiles p
    JOIN auth.users u ON u.id=p.id
   WHERE p.role::text='student'
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL
     AND NOT COALESCE(u.is_anonymous,false)
     AND (u.banned_until IS NULL OR u.banned_until < pg_catalog.now())
     AND NOT EXISTS(
       SELECT 1 FROM public.schoolnet_student_no_email_requests r
        WHERE r.student_auth_user_id=p.id
     )
     AND NOT EXISTS(
       SELECT 1 FROM public.schoolnet_school_memberships m
        WHERE m.user_id=p.id AND m.school_id=v_a
     )
   LIMIT 1;
  SELECT u.email INTO v_teacher_email
    FROM public.profiles p JOIN auth.users u ON u.id=p.id
   WHERE p.role::text='teacher' AND u.email_confirmed_at IS NOT NULL
   LIMIT 1;
  SELECT r.technical_email INTO v_technical_email
    FROM public.schoolnet_student_no_email_requests r
    JOIN public.profiles p ON p.id=r.student_auth_user_id
   WHERE p.role::text='student'
   LIMIT 1;
  IF v_local IS NULL OR v_a IS NULL OR v_b IS NULL
    OR v_student IS NULL OR v_email IS NULL
    OR v_teacher_email IS NULL OR v_technical_email IS NULL
  THEN
    RAISE EXCEPTION 'S3-B : comptes fixtures insuffisants, tests non realises.';
  END IF;
  PERFORM pg_catalog.set_config('qa.s3b.admin',v_local::text,true);
  PERFORM pg_catalog.set_config('qa.s3b.school_a',v_a::text,true);
  PERFORM pg_catalog.set_config('qa.s3b.school_b',v_b::text,true);
  PERFORM pg_catalog.set_config('qa.s3b.student',v_student::text,true);
  PERFORM pg_catalog.set_config('qa.s3b.email',v_email,true);
  PERFORM pg_catalog.set_config('qa.s3b.teacher_email',v_teacher_email,true);
  PERFORM pg_catalog.set_config('qa.s3b.technical_email',v_technical_email,true);
  PERFORM pg_catalog.set_config('qa.s3b.memberships_before',
    (SELECT count(*)::text FROM public.schoolnet_school_memberships),true);
  PERFORM pg_catalog.set_config('qa.s3b.audit_before',
    (SELECT count(*)::text FROM public.schoolnet_school_audit),true);
  PERFORM pg_catalog.set_config('qa.s3b.class_students_before',
    (SELECT count(*)::text FROM public.class_students),true);
  PERFORM pg_catalog.set_config('qa.s3b.legacy_enrollments_before',
    (SELECT count(*)::text FROM public.student_enrollments),true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_local::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app"}',true);
END;
$setup_s3b$;

SET LOCAL ROLE authenticated;
DO $qa_student_s3b$
DECLARE
  v_a uuid:=current_setting('qa.s3b.school_a')::uuid;
  v_b uuid:=current_setting('qa.s3b.school_b')::uuid;
  v_student uuid:=current_setting('qa.s3b.student')::uuid;
  v_email text:=current_setting('qa.s3b.email');
  v_technical text:=current_setting('qa.s3b.technical_email');
  v_teacher_email text:=current_setting('qa.s3b.teacher_email');
  v_roster jsonb;v_member uuid;
  v_cross_read boolean:=false;v_cross_write boolean:=false;
  v_cross_toggle boolean:=false;v_duplicate boolean:=false;
  v_unknown boolean:=false;v_teacher boolean:=false;
  v_technical_blocked boolean:=false;
  v_preview boolean:=false;v_absent boolean:=false;v_spoof boolean:=false;
  v_role_blocked boolean:=false;
BEGIN
  v_roster:=public.schoolnet_school_student_roster(v_a);
  IF v_roster->>'school_id'<>v_a::text
     OR pg_catalog.jsonb_array_length(v_roster->'students')<>0
  THEN RAISE EXCEPTION 'S3-B repertoire initial incorrect.'; END IF;

  v_member:=public.schoolnet_school_student_attach(v_a,pg_catalog.upper(v_email));
  PERFORM pg_catalog.set_config('qa.s3b.member_a',v_member::text,true);

  v_roster:=public.schoolnet_school_student_roster(v_a);
  IF pg_catalog.jsonb_array_length(v_roster->'students')<>1
    OR v_roster->'students'->0->>'membership_id'<>v_member::text
    OR v_roster->'students'->0->>'user_id'<>v_student::text
    OR v_roster->'students'->0->>'status'<>'active'
  THEN RAISE EXCEPTION 'S3-B repertoire ne montre pas affiliation autorisee.'; END IF;

  BEGIN
    PERFORM public.schoolnet_school_student_roster(v_b);
  EXCEPTION WHEN insufficient_privilege THEN v_cross_read:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_student_attach(v_b,v_email);
  EXCEPTION WHEN insufficient_privilege THEN v_cross_write:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_student_set_active(v_b,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_cross_toggle:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_student_attach(v_a,v_email);
  EXCEPTION WHEN unique_violation THEN v_duplicate:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_student_attach(v_a,'unknown@invalid.example');
  EXCEPTION WHEN invalid_parameter_value THEN v_unknown:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_student_attach(v_a,v_teacher_email);
  EXCEPTION WHEN invalid_parameter_value THEN v_teacher:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_student_attach(v_a,v_technical);
  EXCEPTION WHEN invalid_parameter_value THEN v_technical_blocked:=true;
  END;

  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-s3b-preview.vercel.app"}',true);
  BEGIN
    PERFORM public.schoolnet_school_student_set_active(v_a,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_preview:=true;
  END;
  PERFORM pg_catalog.set_config('request.headers','',true);
  BEGIN
    PERFORM public.schoolnet_school_student_set_active(v_a,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_absent:=true;
  END;
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app.evil.example"}',true);
  BEGIN
    PERFORM public.schoolnet_school_student_set_active(v_a,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_spoof:=true;
  END;
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app"}',true);

  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_student::text,true);
  BEGIN
    PERFORM public.schoolnet_school_student_roster(v_a);
  EXCEPTION WHEN insufficient_privilege THEN v_role_blocked:=true;
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',
    current_setting('qa.s3b.admin'),true);

  IF NOT (
    v_cross_read AND v_cross_write AND v_cross_toggle
    AND v_duplicate AND v_unknown AND v_teacher AND v_technical_blocked
    AND v_preview AND v_absent AND v_spoof AND v_role_blocked
  ) THEN
    RAISE EXCEPTION 'S3-B protections A/B, role, doublons, email technique ou Preview incompletes.';
  END IF;

  PERFORM public.schoolnet_school_student_set_active(v_a,v_member,false);
  IF NOT EXISTS(
    SELECT 1 FROM public.schoolnet_school_memberships m
    WHERE m.id=v_member AND m.status='revoked' AND m.revoked_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'S3-B revocation impossible.'; END IF;
  PERFORM public.schoolnet_school_student_set_active(v_a,v_member,true);
  IF NOT EXISTS(
    SELECT 1 FROM public.schoolnet_school_memberships m
    WHERE m.id=v_member AND m.status='active' AND m.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'S3-B reactivation impossible.'; END IF;
END;
$qa_student_s3b$;
RESET ROLE;

-- Le MEME administrateur est temporairement autorise dans une deuxieme
-- ecole, pour verifier deux affiliations distinctes du MEME eleve.
INSERT INTO public.schoolnet_school_memberships
  (school_id,user_id,member_role,status,assigned_by)
VALUES (
  current_setting('qa.s3b.school_b')::uuid,
  current_setting('qa.s3b.admin')::uuid,
  'school_admin','active',
  current_setting('qa.s3b.admin')::uuid
);

SET LOCAL ROLE authenticated;
DO $qa_two_schools_s3b$
DECLARE
  v_a uuid:=current_setting('qa.s3b.school_a')::uuid;
  v_b uuid:=current_setting('qa.s3b.school_b')::uuid;
  v_member_a uuid:=current_setting('qa.s3b.member_a')::uuid;
  v_member_b uuid;v_a_roster jsonb;v_b_roster jsonb;
BEGIN
  v_member_b:=public.schoolnet_school_student_attach(
    v_b,current_setting('qa.s3b.email')
  );
  v_a_roster:=public.schoolnet_school_student_roster(v_a);
  v_b_roster:=public.schoolnet_school_student_roster(v_b);
  IF v_member_a=v_member_b
    OR pg_catalog.jsonb_array_length(v_a_roster->'students')<>1
    OR pg_catalog.jsonb_array_length(v_b_roster->'students')<>1
    OR v_a_roster->'students'->0->>'membership_id'<>v_member_a::text
    OR v_b_roster->'students'->0->>'membership_id'<>v_member_b::text
  THEN RAISE EXCEPTION 'S3-B multi-etablissements non isoles.'; END IF;

  PERFORM public.schoolnet_school_student_set_active(v_b,v_member_b,false);
  v_a_roster:=public.schoolnet_school_student_roster(v_a);
  v_b_roster:=public.schoolnet_school_student_roster(v_b);
  IF v_a_roster->'students'->0->>'status'<>'active'
    OR v_b_roster->'students'->0->>'status'<>'revoked'
  THEN RAISE EXCEPTION 'S3-B revocation B modifie ecole A.'; END IF;
END;
$qa_two_schools_s3b$;
RESET ROLE;

DO $qa_audit_s3b$
BEGIN
  IF (SELECT count(*) FROM public.schoolnet_school_memberships)
    <> current_setting('qa.s3b.memberships_before')::bigint+3
    OR (SELECT count(*) FROM public.schoolnet_school_audit)
    <> current_setting('qa.s3b.audit_before')::bigint+5
    OR (SELECT count(DISTINCT action) FROM public.schoolnet_school_audit
         WHERE school_id=current_setting('qa.s3b.school_a')::uuid
           AND actor_id=current_setting('qa.s3b.admin')::uuid
           AND target_user_id=current_setting('qa.s3b.student')::uuid
           AND action IN (
             'school_student_linked','school_student_revoked',
             'school_student_reactivated'
           ))<>3
    OR (SELECT count(*) FROM public.class_students)
    <> current_setting('qa.s3b.class_students_before')::bigint
    OR (SELECT count(*) FROM public.student_enrollments)
    <> current_setting('qa.s3b.legacy_enrollments_before')::bigint
  THEN RAISE EXCEPTION 'S3-B audit, historique ou effectifs non conformes.'; END IF;
END;
$qa_audit_s3b$;

-- L'administrateur revoque dans A doit perdre A, mais pas son acces B.
UPDATE public.schoolnet_school_memberships
   SET status='revoked',revoked_at=pg_catalog.now()
 WHERE school_id=current_setting('qa.s3b.school_a')::uuid
   AND user_id=current_setting('qa.s3b.admin')::uuid;
SET LOCAL ROLE authenticated;
DO $qa_revoked_s3b$
DECLARE v_denied boolean:=false;v_roster jsonb;
BEGIN
  BEGIN
    PERFORM public.schoolnet_school_student_roster(
      current_setting('qa.s3b.school_a')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
  END;
  v_roster:=public.schoolnet_school_student_roster(
    current_setting('qa.s3b.school_b')::uuid
  );
  IF NOT v_denied OR pg_catalog.jsonb_array_length(v_roster->'students')<>1
  THEN RAISE EXCEPTION 'S3-B revocation admin A ne retire pas les droits A.'; END IF;
END;
$qa_revoked_s3b$;
RESET ROLE;

SELECT 'S3B_EMAIL_STUDENT_CROSS_SCHOOL_ROSTER_REVOKE_AUDIT_NOEMAIL_ROLLBACK_PASS' AS result;
-- LE ROLLBACK FINAL RESTE OBLIGATOIRE DANS LA MEME TRANSACTION.
