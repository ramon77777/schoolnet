-- SCHOOLNET 2.0 | S3-A - PROPOSITION SQL, NON INSTALLEE.
-- Gestion locale des enseignants DEJA inscrits dans Supabase Auth.
-- DEPENDANCES: S2-A/S2-B installees, schoolnet_private, profiles,
-- schoolnet_school_memberships et schoolnet_school_audit.
-- Aucune creation de compte Auth, aucun acces aux modules pedagogiques,
-- aucun rattachement aux classes, aucune modification des donnees legacy.
-- NE PAS copier ce fichier dans supabase/migrations avant accord distinct.
-- Recette reversible: BEGIN; <proposition>; <verification>; ROLLBACK.

DO $preflight_s3a$
DECLARE v_audit text;
BEGIN
  IF to_regclass('public.schoolnet_school_memberships') IS NULL
    OR to_regclass('public.schoolnet_school_audit') IS NULL
    OR to_regprocedure('schoolnet_private.is_school_admin_for(uuid)') IS NULL
    OR to_regprocedure('public.schoolnet_school_class_catalog(uuid)') IS NULL
    OR to_regprocedure('schoolnet_private.local_school_teacher_roster(uuid)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.local_school_teacher_attach(uuid,text)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.local_school_teacher_set_active(uuid,uuid,boolean)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_teacher_roster(uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_teacher_attach(uuid,text)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_teacher_set_active(uuid,uuid,boolean)') IS NOT NULL
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','INSERT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','UPDATE')
  THEN
    RAISE EXCEPTION 'Prerequis S3-A manquants ou API deja installee.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_audit
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.schoolnet_school_audit'::pg_catalog.regclass
    AND conname='schoolnet_school_audit_action_check';
  IF v_audit IS NULL
    OR pg_catalog.strpos(v_audit,'school_class_created')=0
    OR pg_catalog.strpos(v_audit,'school_teacher_linked')>0
  THEN
    RAISE EXCEPTION 'Le journal scolaire ne correspond pas au socle S2-B.';
  END IF;
END;
$preflight_s3a$;

-- Les actions historiques restent autorisees.
ALTER TABLE public.schoolnet_school_audit
  DROP CONSTRAINT schoolnet_school_audit_action_check;
ALTER TABLE public.schoolnet_school_audit
  ADD CONSTRAINT schoolnet_school_audit_action_check
  CHECK (action IN (
    'school_created',
    'school_admin_assigned',
    'school_admin_reactivated',
    'school_admin_invitation_prepared',
    'school_admin_invitation_sent_declared',
    'school_class_created',
    'school_teacher_linked',
    'school_teacher_revoked',
    'school_teacher_reactivated'
  ));

-- Repertoire strictement limite a l'ecole de l'administrateur local actif.
-- Les profils globaux et les e-mails des autres ecoles ne sont pas exposes.
CREATE FUNCTION schoolnet_private.local_school_teacher_roster(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $roster$
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Repertoire enseignant non autorise.'
      USING ERRCODE='42501';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'school_id',p_school_id,
    'teachers',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'membership_id',m.id,
          'user_id',m.user_id,
          'full_name',COALESCE(p.full_name,''),
          'email',COALESCE(u.email,''),
          'status',m.status,
          'assigned_at',m.assigned_at,
          'revoked_at',m.revoked_at
        )
        ORDER BY pg_catalog.lower(COALESCE(p.full_name,'')),m.id
      )
      FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text='teacher'
      JOIN auth.users u ON u.id=p.id
      WHERE m.school_id=p_school_id AND m.member_role='teacher'
    ),'[]'::jsonb)
  );
END;
$roster$;

-- Ne rattache QUE les comptes enseignants deja existants, avec e-mail verifie.
-- La recherche est une correspondance exacte; aucun annuaire global.
-- Une affiliation revoquee doit etre reactivee explicitement, pas recreatee.
CREATE FUNCTION schoolnet_private.local_school_teacher_attach(
  p_school_id uuid,p_email text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $attach$
DECLARE
  v_email text;
  v_teacher uuid;
  v_membership uuid;
  v_headers text;
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Rattachement enseignant non autorise.'
      USING ERRCODE='42501';
  END IF;

  -- Origin est un garde-fou complementaire, NON une authentification.
  -- Il est forgeable hors navigateur; identite et affiliation sont
  -- independamment verifies ci-dessus.
  v_headers:=NULLIF(pg_catalog.current_setting('request.headers',true),'');
  IF v_headers IS NULL
    OR (v_headers::jsonb ->> 'origin')
      IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
  THEN
    RAISE EXCEPTION 'Rattachement impossible depuis cet environnement.'
      USING ERRCODE='42501';
  END IF;

  v_email:=pg_catalog.lower(pg_catalog.btrim(COALESCE(p_email,'')));
  IF pg_catalog.char_length(v_email) NOT BETWEEN 5 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR v_email ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'Adresse enseignant invalide.'
      USING ERRCODE='22023';
  END IF;

  SELECT p.id INTO v_teacher
  FROM auth.users u
  JOIN public.profiles p ON p.id=u.id
  WHERE pg_catalog.lower(pg_catalog.btrim(u.email))=v_email
    AND p.role::text='teacher'
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
  LIMIT 1;

  IF v_teacher IS NULL THEN
    RAISE EXCEPTION 'Aucun compte enseignant verifie correspondant.'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.schoolnet_school_memberships
    WHERE school_id=p_school_id AND user_id=v_teacher
  ) THEN
    RAISE EXCEPTION 'Enseignant deja rattache ou a reactiver.'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.schoolnet_school_memberships
    (school_id,user_id,member_role,status,assigned_by)
  VALUES (p_school_id,v_teacher,'teacher','active',auth.uid())
  RETURNING id INTO v_membership;

  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (p_school_id,'school_teacher_linked',auth.uid(),v_teacher);

  RETURN v_membership;
END;
$attach$;

-- Une revocation ne desactive PAS le compte Auth, ni les classes legacy.
-- La reactivation recontrole le role teacher et le compte Auth confirme.
CREATE FUNCTION schoolnet_private.local_school_teacher_set_active(
  p_school_id uuid,p_membership_id uuid,p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $change$
DECLARE
  v_user uuid;
  v_status text;
  v_headers text;
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR p_membership_id IS NULL
    OR p_active IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Modification enseignant non autorisee.'
      USING ERRCODE='42501';
  END IF;

  v_headers:=NULLIF(pg_catalog.current_setting('request.headers',true),'');
  IF v_headers IS NULL
    OR (v_headers::jsonb ->> 'origin')
      IS DISTINCT FROM 'https://schoolnet-snowy.vercel.app'
  THEN
    RAISE EXCEPTION 'Modification impossible depuis cet environnement.'
      USING ERRCODE='42501';
  END IF;

  SELECT m.user_id,m.status INTO v_user,v_status
  FROM public.schoolnet_school_memberships m
  WHERE m.id=p_membership_id
    AND m.school_id=p_school_id
    AND m.member_role='teacher'
  FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Rattachement enseignant non autorise.'
      USING ERRCODE='42501';
  END IF;

  IF (v_status='active')=p_active THEN
    RAISE EXCEPTION 'Le statut enseignant est deja celui demande.'
      USING ERRCODE='22023';
  END IF;

  IF p_active THEN
    IF NOT EXISTS(
      SELECT 1
      FROM public.profiles p
      JOIN auth.users u ON u.id=p.id
      WHERE p.id=v_user AND p.role::text='teacher'
        AND u.email_confirmed_at IS NOT NULL
        AND u.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Compte enseignant non eligible a la reactivation.'
        USING ERRCODE='22023';
    END IF;

    UPDATE public.schoolnet_school_memberships
    SET status='active',revoked_at=NULL,
        assigned_by=auth.uid(),assigned_at=pg_catalog.now()
    WHERE id=p_membership_id;
  ELSE
    UPDATE public.schoolnet_school_memberships
    SET status='revoked',revoked_at=pg_catalog.now()
    WHERE id=p_membership_id;
  END IF;

  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (
    p_school_id,
    CASE WHEN p_active THEN 'school_teacher_reactivated'
         ELSE 'school_teacher_revoked' END,
    auth.uid(),v_user
  );
  RETURN p_membership_id;
END;
$change$;

-- Facades PostgREST SECURITY INVOKER. Le code privilege reste prive.
CREATE FUNCTION public.schoolnet_school_teacher_roster(p_school_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $public_roster$
  SELECT schoolnet_private.local_school_teacher_roster(p_school_id);
$public_roster$;

CREATE FUNCTION public.schoolnet_school_teacher_attach(
  p_school_id uuid,p_email text
)
RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $public_attach$
  SELECT schoolnet_private.local_school_teacher_attach(p_school_id,p_email);
$public_attach$;

CREATE FUNCTION public.schoolnet_school_teacher_set_active(
  p_school_id uuid,p_membership_id uuid,p_active boolean
)
RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $public_change$
  SELECT schoolnet_private.local_school_teacher_set_active(
    p_school_id,p_membership_id,p_active
  );
$public_change$;

REVOKE ALL ON FUNCTION schoolnet_private.local_school_teacher_roster(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_teacher_attach(uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_teacher_set_active(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_teacher_roster(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_teacher_attach(uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_teacher_set_active(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_teacher_roster(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_teacher_attach(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_teacher_set_active(uuid,uuid,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_teacher_roster(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_teacher_attach(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_teacher_set_active(uuid,uuid,boolean)
  TO authenticated;

DO $verify_s3a$
BEGIN
  IF pg_catalog.has_function_privilege(
    'anon','public.schoolnet_school_teacher_roster(uuid)','EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon','public.schoolnet_school_teacher_attach(uuid,text)','EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'anon','public.schoolnet_school_teacher_set_active(uuid,uuid,boolean)','EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_school_teacher_roster(uuid)','EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_school_teacher_attach(uuid,text)','EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_school_teacher_set_active(uuid,uuid,boolean)','EXECUTE'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
    WHERE oid IN (
      'public.schoolnet_school_teacher_roster(uuid)'::pg_catalog.regprocedure,
      'public.schoolnet_school_teacher_attach(uuid,text)'::pg_catalog.regprocedure,
      'public.schoolnet_school_teacher_set_active(uuid,uuid,boolean)'::pg_catalog.regprocedure
    ) AND prosecdef
  ) OR pg_catalog.has_table_privilege(
    'authenticated','public.schoolnet_school_memberships','INSERT'
  ) OR pg_catalog.has_table_privilege(
    'authenticated','public.schoolnet_school_memberships','UPDATE'
  ) THEN
    RAISE EXCEPTION 'Verification des permissions S3-A non conforme.';
  END IF;
END;
$verify_s3a$;
