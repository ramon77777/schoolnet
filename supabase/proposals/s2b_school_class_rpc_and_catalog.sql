-- SCHOOLNET 2.0 — Lot S2-B : PROPOSITION NON APPLIQUEE
-- Prerequis : proposition S2-A (classes.school_id, learning_context,
--             RLS et index classes_school_unique_name_year_idx).
-- NE PAS APPLIQUER SUR SUPABASE SANS AUTORISATION DISTINCTE.
-- Pour recette : BEGIN; <S2-A>; <ce fichier>; <tests S2-B>; ROLLBACK.
--
-- Aucun droit de modification directe sur public.classes n'est accorde
-- au role school_admin. Seule la fonction controlant explicitement
-- l'identite et l'appartenance a une ecole peut creer une classe.

DO $preflight_s2b$
DECLARE v_check text;
BEGIN
  IF to_regclass('public.classes') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='classes'
         AND column_name='school_id'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='classes'
         AND column_name='learning_context'
     )
     OR to_regclass('public.classes_school_unique_name_year_idx') IS NULL
     OR to_regprocedure('schoolnet_private.is_school_admin_for(uuid)') IS NULL
     OR to_regclass('public.schoolnet_school_audit') IS NULL
     OR to_regprocedure('public.schoolnet_school_class_catalog(uuid)') IS NOT NULL
     OR to_regprocedure('public.schoolnet_school_create_class(uuid,bigint,uuid,text)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Prerequis S2-B absents ou fonctions deja presentes.';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(oid) INTO v_check
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.schoolnet_school_audit'::pg_catalog.regclass
    AND conname='schoolnet_school_audit_action_check';

  IF v_check IS NULL
    OR pg_catalog.strpos(v_check,'school_admin_invitation_sent_declared')=0
    OR pg_catalog.strpos(v_check,'school_class_created')>0
  THEN
    RAISE EXCEPTION 'Le journal d audit scolaire a change ; revue requise.';
  END IF;
END;
$preflight_s2b$;

-- Conserver toutes les anciennes actions et ajouter UNIQUEMENT
-- un evenement auditable pour la creation d'une classe.
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
    'school_class_created'
  ));

-- Le role school_admin n'a pas de lecture directe de school_years
-- a cause de la protection legacy. Ce RPC retourne uniquement les
-- options publiques necessaires au formulaire, pour UNE ecole autorisee.
CREATE FUNCTION public.schoolnet_school_class_catalog(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $catalog$
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Acces non autorise aux classes de cet etablissement.'
      USING ERRCODE='42501';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'school_id', p_school_id,
    'levels', COALESCE(
      (SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', l.id,
          'name', l.name,
          'order_index', l.order_index
        )
        ORDER BY l.order_index, l.id
      ) FROM public.levels l), '[]'::jsonb),
    'school_years', COALESCE(
      (SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', y.id,
          'name', y.name,
          'starts_on', y.starts_on,
          'is_current', y.is_current
        )
        ORDER BY y.starts_on DESC, y.name DESC
      ) FROM public.school_years y), '[]'::jsonb)
  );
END;
$catalog$;

-- Creation atomique et journalisee d'une classe pour son ecole active.
-- L'ID d'ecole transmis depuis React n'est JAMAIS considere comme une
-- preuve d'autorisation. Aucun client n'insere directement dans classes.
CREATE FUNCTION public.schoolnet_school_create_class(
  p_school_id uuid,
  p_level_id bigint,
  p_school_year_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $create$
DECLARE
  v_name text;
  v_year text;
  v_class_id uuid;
BEGIN
  IF auth.uid() IS NULL
    OR (SELECT public.get_my_role())::text IS DISTINCT FROM 'school_admin'
    OR p_school_id IS NULL
    OR schoolnet_private.is_school_admin_for(p_school_id) IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'Creation reservee a l administrateur de cet etablissement.'
      USING ERRCODE='42501';
  END IF;

  IF p_name IS NULL
    OR p_name ~ '[[:cntrl:]]'
  THEN
    RAISE EXCEPTION 'Nom de classe invalide.'
      USING ERRCODE='22023';
  END IF;

  v_name := pg_catalog.regexp_replace(pg_catalog.btrim(p_name),'[[:space:]]+',' ','g');

  IF pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 100
    OR p_level_id IS NULL
    OR p_school_year_id IS NULL
  THEN
    RAISE EXCEPTION 'Nom, niveau ou annee scolaire invalide.'
      USING ERRCODE='22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.levels WHERE id=p_level_id) THEN
    RAISE EXCEPTION 'Niveau scolaire introuvable.'
      USING ERRCODE='22023';
  END IF;

  SELECT y.name INTO v_year
  FROM public.school_years y
  WHERE y.id=p_school_year_id;

  IF v_year IS NULL THEN
    RAISE EXCEPTION 'Annee scolaire introuvable.'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.classes
    (level_id,name,school_year,school_year_id,school_id,learning_context)
  VALUES
    (p_level_id,v_name,v_year,p_school_year_id,p_school_id,'school')
  RETURNING id INTO v_class_id;

  INSERT INTO public.schoolnet_school_audit
    (school_id,action,actor_id)
  VALUES
    (p_school_id,'school_class_created',auth.uid());

  RETURN v_class_id;
END;
$create$;

-- Supabase Data API: invocable seulement par des utilisateurs
-- authentifies, puis controle d'appartenance strict dans CHAQUE RPC.
REVOKE ALL ON FUNCTION public.schoolnet_school_class_catalog(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_create_class(uuid,bigint,uuid,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.schoolnet_school_class_catalog(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_create_class(uuid,bigint,uuid,text)
  TO authenticated;

DO $verify_s2b$
BEGIN
  IF pg_catalog.has_function_privilege(
      'anon','public.schoolnet_school_class_catalog(uuid)','EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'anon','public.schoolnet_school_create_class(uuid,bigint,uuid,text)','EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated','public.schoolnet_school_class_catalog(uuid)','EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated','public.schoolnet_school_create_class(uuid,bigint,uuid,text)','EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'authenticated','schoolnet_private.is_school_admin_for(uuid)','EXECUTE'
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='public.schoolnet_school_audit'::pg_catalog.regclass
      AND conname='schoolnet_school_audit_action_check'
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid),'school_class_created')>0
    )
  THEN
    RAISE EXCEPTION 'Verification des RPC S2-B non conforme.';
  END IF;
END;
$verify_s2b$;
