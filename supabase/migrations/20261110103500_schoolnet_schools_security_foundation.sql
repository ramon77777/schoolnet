-- SCHOOLNET 2.0 | Multi-etablissements, fondation securisee (phase 1)
-- PREPAREE SEULEMENT: ne pas appliquer a schoolnet_2.0 sans accord explicite.
-- Chaque compte conserve son identite Supabase Auth; "admin" reste le super-admin global.
-- Les administrateurs d'etablissement utilisent un role DIFFERENT: school_admin.
-- Aucune classe/dossier historique n'est rattachee automatiquement a une ecole.
-- Les droits sur les modules metiers existants NE sont PAS accordes ici.

DO $preflight$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regprocedure('public.is_admin()') IS NULL
     OR to_regnamespace('schoolnet_private') IS NULL
     OR to_regclass('public.schoolnet_schools') IS NOT NULL
     OR to_regclass('public.schoolnet_school_memberships') IS NOT NULL
     OR to_regclass('public.schoolnet_school_audit') IS NOT NULL
  THEN
    RAISE EXCEPTION 'SCHOOLNET multi-etablissements : prerequis manquants ou deja installes.';
  END IF;
END;
$preflight$;

-- Nouveau role applicatif, sans l'assimiler a 'admin' et sans modifier is_admin().
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'school_admin';

CREATE TABLE public.schoolnet_schools (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  contact_email text,
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','suspended')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT schoolnet_school_code_format CHECK (code ~ '^[A-Z0-9-]{3,24}$'),
  CONSTRAINT schoolnet_school_name_length CHECK (
    pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 3 AND 160
  ),
  CONSTRAINT schoolnet_school_email_length CHECK (
    contact_email IS NULL OR pg_catalog.char_length(contact_email)<=254
  )
);

CREATE TABLE public.schoolnet_school_memberships (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  member_role text NOT NULL
    CHECK(member_role IN ('school_admin','teacher','student','parent')),
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','revoked')),
  assigned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  revoked_at timestamptz,
  CONSTRAINT schoolnet_school_membership_unique UNIQUE(school_id,user_id),
  CONSTRAINT schoolnet_school_membership_revocation_consistent CHECK (
     (status='active' AND revoked_at IS NULL)
     OR (status='revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX schoolnet_school_memberships_by_user
 ON public.schoolnet_school_memberships(user_id,school_id)
 WHERE status='active';
CREATE INDEX schoolnet_school_memberships_by_school_role
 ON public.schoolnet_school_memberships(school_id,member_role)
 WHERE status='active';

CREATE TABLE public.schoolnet_school_audit (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN (
    'school_created','school_admin_assigned','school_admin_reactivated'
  )),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX schoolnet_school_audit_by_school
 ON public.schoolnet_school_audit(school_id,created_at DESC);

ALTER TABLE public.schoolnet_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_school_audit ENABLE ROW LEVEL SECURITY;

-- Lecture seule des nouvelles donnees pour les comptes connectes.
-- AUCUNE ecriture directe (y compris service de l'interface) via anon/authenticated.
REVOKE ALL ON public.schoolnet_schools FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.schoolnet_school_memberships FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.schoolnet_school_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.schoolnet_schools TO authenticated;
GRANT SELECT ON public.schoolnet_school_memberships TO authenticated;
GRANT SELECT ON public.schoolnet_school_audit TO authenticated;

CREATE FUNCTION schoolnet_private.is_active_school_member(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $member$
  SELECT COALESCE(
    EXISTS(
      SELECT 1 FROM public.schoolnet_school_memberships m
      JOIN public.schoolnet_schools s ON s.id=m.school_id
      WHERE m.user_id=auth.uid()
        AND m.school_id=p_school_id
        AND m.status='active' AND s.status='active'
    ),false
  );
$member$;

CREATE FUNCTION schoolnet_private.is_school_admin_for(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $school_admin$
  SELECT COALESCE(
    EXISTS(
      SELECT 1 FROM public.schoolnet_school_memberships m
      JOIN public.schoolnet_schools s ON s.id=m.school_id
      JOIN public.profiles p ON p.id=m.user_id
      WHERE m.user_id=auth.uid()
        AND m.school_id=p_school_id
        AND m.member_role='school_admin'
        AND m.status='active' AND s.status='active'
        AND p.role::text='school_admin'
    ),false
  );
$school_admin$;

REVOKE ALL ON FUNCTION schoolnet_private.is_active_school_member(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.is_school_admin_for(uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA schoolnet_private TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.is_active_school_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.is_school_admin_for(uuid) TO authenticated;

CREATE POLICY schoolnet_schools_select
ON public.schoolnet_schools FOR SELECT TO authenticated
USING (public.is_admin() OR schoolnet_private.is_active_school_member(id));

CREATE POLICY schoolnet_school_memberships_select
ON public.schoolnet_school_memberships FOR SELECT TO authenticated
USING (
  public.is_admin() OR user_id=(SELECT auth.uid())
  OR schoolnet_private.is_school_admin_for(school_id)
);

CREATE POLICY schoolnet_school_audit_select
ON public.schoolnet_school_audit FOR SELECT TO authenticated
USING (public.is_admin() OR schoolnet_private.is_school_admin_for(school_id));

-- Defence en profondeur: un membre ne peut pas etre promu localement sous
-- un role incompatible avec son role applicatif central.
CREATE FUNCTION schoolnet_private.validate_school_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $validate$
DECLARE v_role text;
BEGIN
  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id=NEW.user_id;
  IF v_role IS NULL OR v_role<>NEW.member_role THEN
    RAISE EXCEPTION 'Le role dans l etablissement doit correspondre au role du compte.';
  END IF;
  RETURN NEW;
END;
$validate$;
REVOKE ALL ON FUNCTION schoolnet_private.validate_school_membership()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_schoolnet_school_membership_role
BEFORE INSERT OR UPDATE OF user_id,member_role ON public.schoolnet_school_memberships
FOR EACH ROW EXECUTE FUNCTION schoolnet_private.validate_school_membership();

-- Global "admin" existant = super administrateur SCHOOLNET.
-- Le RPC reste en mode invoker, sans elevation de privilege.
CREATE FUNCTION public.schoolnet_is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $super$
  SELECT COALESCE(public.is_admin(),false);
$super$;
REVOKE ALL ON FUNCTION public.schoolnet_is_super_admin()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_is_super_admin() TO authenticated;

CREATE FUNCTION public.schoolnet_admin_create_school(
  p_name text,
  p_code text,
  p_contact_email text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $create_school$
DECLARE v_id uuid; v_name text; v_code text; v_email text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Action reservee au Super Administrateur SCHOOLNET.'
      USING ERRCODE='42501';
  END IF;
  v_name:=pg_catalog.btrim(COALESCE(p_name,''));
  v_code:=pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code,'')));
  v_email:=NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_contact_email,''))),'');
  IF pg_catalog.char_length(v_name) NOT BETWEEN 3 AND 160
     OR v_code !~ '^[A-Z0-9-]{3,24}$'
     OR (v_email IS NOT NULL AND (
         pg_catalog.char_length(v_email)>254
         OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     ))
  THEN RAISE EXCEPTION 'Nom, code ou email de l etablissement invalide.'; END IF;
  INSERT INTO public.schoolnet_schools(name,code,contact_email,created_by)
  VALUES(v_name,v_code,v_email,auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.schoolnet_school_audit(school_id,action,actor_id)
  VALUES(v_id,'school_created',auth.uid());
  RETURN v_id;
END;
$create_school$;
REVOKE ALL ON FUNCTION public.schoolnet_admin_create_school(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_admin_create_school(text,text,text) TO authenticated;

CREATE FUNCTION public.schoolnet_admin_assign_school_admin(
  p_school_id uuid,
  p_user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog
AS $assign$
DECLARE v_old public.schoolnet_school_memberships%ROWTYPE;
        v_school public.schoolnet_schools%ROWTYPE;
        v_role text;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Action reservee au Super Administrateur SCHOOLNET.'
      USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_school FROM public.schoolnet_schools
   WHERE id=p_school_id AND status='active' FOR UPDATE;
  IF v_school.id IS NULL THEN
    RAISE EXCEPTION 'Etablissement absent ou suspendu.';
  END IF;
  SELECT p.role::text INTO v_role FROM public.profiles p WHERE p.id=p_user_id;
  IF v_role IS DISTINCT FROM 'school_admin' THEN
    RAISE EXCEPTION 'Le compte choisi doit posseder le role school_admin.';
  END IF;

  SELECT * INTO v_old FROM public.schoolnet_school_memberships
   WHERE school_id=p_school_id AND user_id=p_user_id FOR UPDATE;
  IF v_old.id IS NOT NULL AND v_old.member_role<>'school_admin' THEN
    RAISE EXCEPTION 'Appartenance existante incompatible avec ce role.';
  END IF;
  IF v_old.id IS NOT NULL AND v_old.status='active' THEN
    RETURN pg_catalog.jsonb_build_object(
      'school_id',p_school_id,'user_id',p_user_id,'already_assigned',true
    );
  END IF;
  IF v_old.id IS NULL THEN
    INSERT INTO public.schoolnet_school_memberships
      (school_id,user_id,member_role,assigned_by,status)
    VALUES(p_school_id,p_user_id,'school_admin',auth.uid(),'active');
    INSERT INTO public.schoolnet_school_audit
      (school_id,action,actor_id,target_user_id)
    VALUES(p_school_id,'school_admin_assigned',auth.uid(),p_user_id);
  ELSE
    UPDATE public.schoolnet_school_memberships
    SET status='active',revoked_at=NULL,assigned_by=auth.uid(),assigned_at=pg_catalog.now()
    WHERE id=v_old.id;
    INSERT INTO public.schoolnet_school_audit
      (school_id,action,actor_id,target_user_id)
    VALUES(p_school_id,'school_admin_reactivated',auth.uid(),p_user_id);
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'school_id',p_school_id,'user_id',p_user_id,'already_assigned',false
  );
END;
$assign$;
REVOKE ALL ON FUNCTION public.schoolnet_admin_assign_school_admin(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_admin_assign_school_admin(uuid,uuid) TO authenticated;

-- Pas d'acces transversal accorde aux anciens modules: cette migration
-- ne modifie ni leurs policies, ni leurs fonctions, ni leurs donnees.
DO $postcheck$
BEGIN
  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('public.schoolnet_schools'::regclass),
      ('public.schoolnet_school_memberships'::regclass),
      ('public.schoolnet_school_audit'::regclass)
    ) t(rel)
    JOIN pg_catalog.pg_class c ON c.oid=t.rel
    WHERE NOT c.relrowsecurity
  )
  OR pg_catalog.has_table_privilege('anon','public.schoolnet_schools','SELECT')
  OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_school_memberships','INSERT')
  OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_schools','UPDATE')
  OR pg_catalog.has_function_privilege(
    'anon','public.schoolnet_admin_assign_school_admin(uuid,uuid)','EXECUTE')
  OR NOT pg_catalog.has_function_privilege(
    'authenticated','public.schoolnet_admin_create_school(text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'SCHOOLNET multi-etablissements: controles RLS/GRANT non conformes.'; END IF;
END;
$postcheck$;
