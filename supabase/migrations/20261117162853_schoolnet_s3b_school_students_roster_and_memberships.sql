-- SCHOOLNET 2.0 | S3-B - Migration canonique deja installee sur Supabase principal.
-- Historique Supabase version: 20261117162853 | 17 novembre 2026.
-- Identique a la proposition source deja appliquee le 17/11/2026.
-- Source: supabase/proposals/s3b_school_students_roster_and_memberships.sql
-- La commande de migration serveur a ajoute des SET LOCAL pour les delais.
-- Ne PAS reexecuter sur le projet principal et ne PAS lancer supabase db push.
-- Reutiliser uniquement pour reconstruire une nouvelle base via le pipeline controle.
-- S3-B ne cree aucune affiliation, classe, compte ou inscription historique.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60000ms';

DO $preflight_s3b$
DECLARE v_check text;
BEGIN
  IF to_regclass('public.schoolnet_school_memberships') IS NULL
    OR to_regclass('public.schoolnet_school_audit') IS NULL
    OR to_regclass('public.schoolnet_student_no_email_requests') IS NULL
    OR to_regprocedure('schoolnet_private.is_school_admin_for(uuid)') IS NULL
    OR to_regprocedure('public.schoolnet_school_teacher_roster(uuid)') IS NULL
    OR to_regprocedure('schoolnet_private.local_school_student_roster(uuid)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.local_school_student_attach(uuid,text)') IS NOT NULL
    OR to_regprocedure('schoolnet_private.local_school_student_set_active(uuid,uuid,boolean)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_student_roster(uuid)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_student_attach(uuid,text)') IS NOT NULL
    OR to_regprocedure('public.schoolnet_school_student_set_active(uuid,uuid,boolean)') IS NOT NULL
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','INSERT')
    OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','UPDATE')
  THEN RAISE EXCEPTION 'Prerequis S3-B manquants, API deja presente ou droits ecriture inattendus.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_check
    FROM pg_catalog.pg_constraint
   WHERE conrelid='public.schoolnet_school_audit'::pg_catalog.regclass
     AND conname='schoolnet_school_audit_action_check';
  IF v_check IS NULL
    OR pg_catalog.strpos(v_check,'school_teacher_reactivated')=0
    OR pg_catalog.strpos(v_check,'school_student_linked')>0
  THEN RAISE EXCEPTION 'Actions du journal SCHOOLNET incompatibles avec S3-A.';
  END IF;
END;
$preflight_s3b$;

-- Etendre UNIQUEMENT la liste des actions de journalisation.
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
    'school_teacher_reactivated',
    'school_student_linked',
    'school_student_revoked',
    'school_student_reactivated'
  ));

-- Le repertoire n'expose QUE les eleves rattaches a une ecole autorisee.
-- Pas d'annuaire global, pas de telephone, liens parents, notes ou dossiers.
-- L'adresse e-mail technique d'un compte sans-email n'est jamais retournee.
CREATE FUNCTION schoolnet_private.local_school_student_roster(
  p_school_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $roster$
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Repertoire eleves non autorise.'
      USING ERRCODE='42501';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'school_id',p_school_id,
    'students',COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'membership_id',m.id,
          'user_id',m.user_id,
          'full_name',COALESCE(p.full_name,''),
          'email',CASE WHEN EXISTS (
            SELECT 1 FROM public.schoolnet_student_no_email_requests r
              WHERE r.student_auth_user_id=m.user_id
          ) THEN NULL ELSE u.email END,
          'status',m.status,
          'assigned_at',m.assigned_at,
          'revoked_at',m.revoked_at
        )
        ORDER BY pg_catalog.lower(COALESCE(p.full_name,'')),m.id
      )
      FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text='student'
      JOIN auth.users u ON u.id=p.id
      WHERE m.school_id=p_school_id AND m.member_role='student'
    ),'[]'::jsonb)
  );
END;
$roster$;

-- Affiliation d'un compte eleve EXISTANT a e-mail PERSONNEL confirme.
-- La recherche exacte n'est pas un endpoint de recherche d'eleves.
-- Le parcours sans-email est exclu meme si son e-mail technique est connu.
CREATE FUNCTION schoolnet_private.local_school_student_attach(
  p_school_id uuid,
  p_email text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $attach$
DECLARE
  v_email text;
  v_student uuid;
  v_membership uuid;
  v_headers text;
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Rattachement eleve non autorise.'
      USING ERRCODE='42501';
  END IF;

  -- Protection supplementaire contre les ecritures accidentelles en Preview.
  -- Origin est forgeable hors navigateur; ce n'est jamais une autorisation.
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
  THEN RAISE EXCEPTION 'Adresse eleve invalide.' USING ERRCODE='22023';
  END IF;

  SELECT p.id INTO v_student
    FROM public.profiles p
    JOIN auth.users u ON u.id=p.id
   WHERE p.role::text='student'
     AND pg_catalog.lower(pg_catalog.btrim(u.email))=v_email
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL
     AND NOT COALESCE(u.is_anonymous,false)
     AND (u.banned_until IS NULL OR u.banned_until < pg_catalog.now())
     AND NOT EXISTS (
       SELECT 1 FROM public.schoolnet_student_no_email_requests r
       WHERE r.student_auth_user_id=p.id
     )
   LIMIT 1;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'Compte eleve non eligible au rattachement par e-mail.'
      USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schoolnet_school_memberships
     WHERE school_id=p_school_id AND user_id=v_student
  ) THEN
    RAISE EXCEPTION 'Eleve deja rattache ou a reactiver.'
      USING ERRCODE='23505';
  END IF;

  INSERT INTO public.schoolnet_school_memberships
    (school_id,user_id,member_role,status,assigned_by)
  VALUES (p_school_id,v_student,'student','active',auth.uid())
  RETURNING id INTO v_membership;

  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id,target_user_id)
  VALUES (p_school_id,'school_student_linked',auth.uid(),v_student);
  RETURN v_membership;
END;
$attach$;

-- Revocation locale uniquement : ne supprime PAS le compte, ses bulletins,
-- ses inscriptions historiques ou ses parents. Reactivation avec recontrole
-- du profil/Auth et du parcours de compte avec e-mail personnel seulement.
CREATE FUNCTION schoolnet_private.local_school_student_set_active(
  p_school_id uuid,
  p_membership_id uuid,
  p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $change$
DECLARE
  v_user uuid;
  v_status text;
  v_headers text;
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL OR p_membership_id IS NULL OR p_active IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Modification de rattachement eleve non autorisee.'
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
     AND m.member_role='student'
   FOR UPDATE;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Rattachement eleve non autorise.'
      USING ERRCODE='42501';
  END IF;

  IF (v_status='active')=p_active THEN
    RAISE EXCEPTION 'Le rattachement possede deja ce statut.'
      USING ERRCODE='22023';
  END IF;

  IF p_active THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN auth.users u ON u.id=p.id
       WHERE p.id=v_user AND p.role::text='student'
         AND u.email_confirmed_at IS NOT NULL
         AND u.deleted_at IS NULL
         AND NOT COALESCE(u.is_anonymous,false)
         AND (u.banned_until IS NULL OR u.banned_until < pg_catalog.now())
         AND NOT EXISTS (
           SELECT 1 FROM public.schoolnet_student_no_email_requests r
            WHERE r.student_auth_user_id=p.id
         )
    ) THEN
      RAISE EXCEPTION 'Compte eleve non eligible a la reactivation.'
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
    CASE WHEN p_active THEN 'school_student_reactivated'
         ELSE 'school_student_revoked' END,
    auth.uid(),v_user
  );

  RETURN p_membership_id;
END;
$change$;

-- Façades SECURITY INVOKER exposees via PostgREST.
-- Le travail privilegie reste dans le schema prive non expose.
CREATE FUNCTION public.schoolnet_school_student_roster(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $public_roster$
  SELECT schoolnet_private.local_school_student_roster(p_school_id);
$public_roster$;

CREATE FUNCTION public.schoolnet_school_student_attach(
  p_school_id uuid,p_email text
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER
SET search_path=pg_catalog
AS $public_attach$
  SELECT schoolnet_private.local_school_student_attach(p_school_id,p_email);
$public_attach$;

CREATE FUNCTION public.schoolnet_school_student_set_active(
  p_school_id uuid,p_membership_id uuid,p_active boolean
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER
SET search_path=pg_catalog
AS $public_change$
  SELECT schoolnet_private.local_school_student_set_active(
    p_school_id,p_membership_id,p_active
  );
$public_change$;

REVOKE ALL ON FUNCTION schoolnet_private.local_school_student_roster(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_student_attach(uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.local_school_student_set_active(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_student_roster(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_student_attach(uuid,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_student_set_active(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_student_roster(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_student_attach(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_student_set_active(uuid,uuid,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_student_roster(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_student_attach(uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_student_set_active(uuid,uuid,boolean)
  TO authenticated;

DO $verify_s3b$
BEGIN
  IF pg_catalog.has_function_privilege(
    'anon','public.schoolnet_school_student_roster(uuid)','EXECUTE')
  OR pg_catalog.has_function_privilege(
    'anon','public.schoolnet_school_student_attach(uuid,text)','EXECUTE')
  OR pg_catalog.has_function_privilege(
    'anon','public.schoolnet_school_student_set_active(uuid,uuid,boolean)','EXECUTE')
  OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_school_student_roster(uuid)','EXECUTE')
  OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_school_student_attach(uuid,text)','EXECUTE')
  OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_school_student_set_active(uuid,uuid,boolean)','EXECUTE')
  OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc
    WHERE oid IN (
      'public.schoolnet_school_student_roster(uuid)'::pg_catalog.regprocedure,
      'public.schoolnet_school_student_attach(uuid,text)'::pg_catalog.regprocedure,
      'public.schoolnet_school_student_set_active(uuid,uuid,boolean)'::pg_catalog.regprocedure
    ) AND prosecdef
  )
  OR pg_catalog.has_table_privilege(
    'authenticated','public.schoolnet_school_memberships','INSERT')
  OR pg_catalog.has_table_privilege(
    'authenticated','public.schoolnet_school_memberships','UPDATE')
  THEN RAISE EXCEPTION 'Verification S3-B non conforme.';
  END IF;
END;
$verify_s3b$;

COMMIT;
