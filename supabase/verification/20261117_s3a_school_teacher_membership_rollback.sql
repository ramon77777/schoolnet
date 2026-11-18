-- SCHOOLNET 2.0 S3-A - RECETTE NON PERSISTANTE, NE JAMAIS COMMIT.
-- BEGIN; <proposition SQL S3-A>; <CE FICHIER>; ROLLBACK;
-- Les profils enseignant et school_admin preexistants servent UNIQUEMENT
-- de fixtures dans la transaction; la base est restauree au ROLLBACK.
-- Exiger une ecole B distincte et des roles existants avant tout test.

DO $setup_s3a$
DECLARE v_local uuid;v_school_a uuid;v_school_b uuid;v_teacher uuid;v_email text;
BEGIN
  SELECT m.user_id,m.school_id INTO v_local,v_school_a
  FROM public.schoolnet_school_memberships m
  JOIN public.schoolnet_schools s ON s.id=m.school_id
  WHERE m.status='active' AND m.member_role='school_admin' AND s.status='active'
  LIMIT 1;
  SELECT id INTO v_school_b FROM public.schoolnet_schools
  WHERE status='active' AND id<>v_school_a LIMIT 1;
  SELECT p.id,u.email INTO v_teacher,v_email
  FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.role::text='teacher'
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND u.email IS NOT NULL
    AND NOT EXISTS(
      SELECT 1 FROM public.schoolnet_school_memberships m
      WHERE m.school_id=v_school_a AND m.user_id=p.id
    )
  LIMIT 1;
  IF v_local IS NULL OR v_school_a IS NULL OR v_school_b IS NULL
    OR v_teacher IS NULL OR v_email IS NULL
  THEN
    RAISE EXCEPTION 'Fixtures QA S3-A insuffisantes. Aucune modification validee.';
  END IF;
  PERFORM pg_catalog.set_config('qa.s3a.local',v_local::text,true);
  PERFORM pg_catalog.set_config('qa.s3a.school_a',v_school_a::text,true);
  PERFORM pg_catalog.set_config('qa.s3a.school_b',v_school_b::text,true);
  PERFORM pg_catalog.set_config('qa.s3a.teacher',v_teacher::text,true);
  PERFORM pg_catalog.set_config('qa.s3a.teacher_email',v_email,true);
  PERFORM pg_catalog.set_config('qa.s3a.before_memberships',
    (SELECT count(*)::text FROM public.schoolnet_school_memberships),true);
  PERFORM pg_catalog.set_config('qa.s3a.before_audit',
    (SELECT count(*)::text FROM public.schoolnet_school_audit),true);
  PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_local::text,true);
  PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app"}',true);
END;
$setup_s3a$;

SET LOCAL ROLE authenticated;
DO $qa_s3a$
DECLARE
  v_school uuid:=current_setting('qa.s3a.school_a')::uuid;
  v_other uuid:=current_setting('qa.s3a.school_b')::uuid;
  v_teacher uuid:=current_setting('qa.s3a.teacher')::uuid;
  v_email text:=current_setting('qa.s3a.teacher_email');
  v_roster jsonb;v_member uuid;
  v_other_blocked boolean:=false;
  v_other_write_blocked boolean:=false;
  v_duplicate_blocked boolean:=false;
  v_preview_blocked boolean:=false;
  v_missing_origin_blocked boolean:=false;
  v_fake_origin_blocked boolean:=false;
  v_bad_email_blocked boolean:=false;
  v_other_membership_blocked boolean:=false;
BEGIN
  v_roster:=public.schoolnet_school_teacher_roster(v_school);
  IF v_roster->>'school_id'<>v_school::text OR
    pg_catalog.jsonb_array_length(v_roster->'teachers')<>0
  THEN RAISE EXCEPTION 'Le repertoire initial est incorrect.'; END IF;

  v_member:=public.schoolnet_school_teacher_attach(v_school,UPPER(v_email));
  PERFORM pg_catalog.set_config('qa.s3a.new_membership',v_member::text,true);
  IF NOT EXISTS(
    SELECT 1 FROM public.schoolnet_school_memberships
    WHERE id=v_member AND school_id=v_school AND user_id=v_teacher
      AND member_role='teacher' AND status='active'
  ) THEN RAISE EXCEPTION 'Affiliation enseignant non creee.'; END IF;
  v_roster:=public.schoolnet_school_teacher_roster(v_school);
  IF pg_catalog.jsonb_array_length(v_roster->'teachers')<>1
    OR v_roster->'teachers'->0->>'membership_id'<>v_member::text
    OR v_roster->'teachers'->0->>'status'<>'active'
  THEN RAISE EXCEPTION 'Repertoire ne montre pas le professeur autorise.'; END IF;

  BEGIN
    PERFORM public.schoolnet_school_teacher_roster(v_other);
  EXCEPTION WHEN insufficient_privilege THEN v_other_blocked:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_teacher_attach(v_other,v_email);
  EXCEPTION WHEN insufficient_privilege THEN v_other_write_blocked:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_teacher_attach(v_school,v_email);
  EXCEPTION WHEN unique_violation THEN v_duplicate_blocked:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_teacher_attach(v_school,'inconnu@invalid.example');
  EXCEPTION WHEN invalid_parameter_value THEN v_bad_email_blocked:=true;
  END;
  BEGIN
    PERFORM public.schoolnet_school_teacher_set_active(v_other,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_other_membership_blocked:=true;
  END;

  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-s3a-preview.vercel.app"}',true);
  BEGIN
    PERFORM public.schoolnet_school_teacher_set_active(v_school,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_preview_blocked:=true;
  END;
  PERFORM pg_catalog.set_config('request.headers','',true);
  BEGIN
    PERFORM public.schoolnet_school_teacher_set_active(v_school,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_missing_origin_blocked:=true;
  END;
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app.evil.example"}',true);
  BEGIN
    PERFORM public.schoolnet_school_teacher_set_active(v_school,v_member,false);
  EXCEPTION WHEN insufficient_privilege THEN v_fake_origin_blocked:=true;
  END;
  PERFORM pg_catalog.set_config('request.headers',
    '{"origin":"https://schoolnet-snowy.vercel.app"}',true);

  IF NOT (v_other_blocked AND v_other_write_blocked AND v_duplicate_blocked
    AND v_bad_email_blocked AND v_preview_blocked AND v_missing_origin_blocked
    AND v_fake_origin_blocked AND v_other_membership_blocked)
  THEN RAISE EXCEPTION 'Garde-fous S3-A incomplets.'; END IF;

  PERFORM public.schoolnet_school_teacher_set_active(v_school,v_member,false);
  v_roster:=public.schoolnet_school_teacher_roster(v_school);
  IF v_roster->'teachers'->0->>'status'<>'revoked'
    OR EXISTS(SELECT 1 FROM public.schoolnet_school_memberships
      WHERE id=v_member AND (revoked_at IS NULL OR status<>'revoked'))
  THEN RAISE EXCEPTION 'Revocation non effective.'; END IF;

  PERFORM public.schoolnet_school_teacher_set_active(v_school,v_member,true);
  v_roster:=public.schoolnet_school_teacher_roster(v_school);
  IF v_roster->'teachers'->0->>'status'<>'active'
    OR EXISTS(SELECT 1 FROM public.schoolnet_school_memberships
      WHERE id=v_member AND (revoked_at IS NOT NULL OR status<>'active'))
  THEN RAISE EXCEPTION 'Reactivation non effective.'; END IF;
END;
$qa_s3a$;
RESET ROLE;

DO $qa_audit_s3a$
DECLARE
  v_school uuid:=current_setting('qa.s3a.school_a')::uuid;
  v_teacher uuid:=current_setting('qa.s3a.teacher')::uuid;
  v_local uuid:=current_setting('qa.s3a.local')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.schoolnet_school_audit)
      <> current_setting('qa.s3a.before_audit')::integer+3
    OR (SELECT count(*) FROM public.schoolnet_school_memberships)
      <> current_setting('qa.s3a.before_memberships')::integer+1
    OR (SELECT count(DISTINCT action) FROM public.schoolnet_school_audit
        WHERE school_id=v_school AND target_user_id=v_teacher
          AND actor_id=v_local AND action IN (
           'school_teacher_linked','school_teacher_revoked',
           'school_teacher_reactivated'
          ))<>3
  THEN RAISE EXCEPTION 'Audit ou cardinalite S3-A non conforme.'; END IF;
END;
$qa_audit_s3a$;

-- L'affiliation a l'ecole A est revoquee TEMPORAIREMENT pour verifier
-- que le school_admin perd immediatement la lecture et l'ecriture.
UPDATE public.schoolnet_school_memberships
SET status='revoked',revoked_at=now()
WHERE user_id=current_setting('qa.s3a.local')::uuid
  AND school_id=current_setting('qa.s3a.school_a')::uuid;
SET LOCAL ROLE authenticated;
DO $qa_revoked_s3a$
DECLARE blocked boolean:=false;
BEGIN
  BEGIN
    PERFORM public.schoolnet_school_teacher_roster(
      current_setting('qa.s3a.school_a')::uuid
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Administrateur revoque encore autorise.';
  END IF;
END;
$qa_revoked_s3a$;
RESET ROLE;

SELECT 'S3A_CROSS_SCHOOL_ATTACH_REVOKE_REACTIVATE_AUDIT_PREVIEW_ROLLBACK_PASS' AS result;
-- LE ROLLBACK FINAL DOIT ETRE LANCE DANS LA MEME TRANSACTION.
