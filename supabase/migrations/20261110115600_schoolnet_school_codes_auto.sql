-- SCHOOLNET 2.0 | Codes ecoles generes exclusivement par PostgreSQL
-- Exemples : SCH-000001, SCH-000002... (6 chiffres, uniques et permanents).
-- Le code historique de tout etablissement existant est conserve tel quel.
-- L'ancien parametre p_code de la RPC est conserve pour retrocompatibilite,
-- mais sa valeur est systematiquement ignoree.

DO $preflight$
BEGIN
  IF to_regclass('public.schoolnet_schools') IS NULL
    OR to_regnamespace('schoolnet_private') IS NULL
    OR to_regprocedure('public.schoolnet_admin_create_school(text,text,text)') IS NULL
    OR to_regclass('schoolnet_private.school_code_seq') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Prerequis de generation des codes SCHOOLNET non conformes.';
  END IF;
END;
$preflight$;

-- Securite de concurrence : nextval distribue un numero different a chaque
-- appel, meme si deux Super Administrateurs creent des ecoles simultanement.
-- Une sequence peut sauter un numero apres rollback (normal, pas un doublon).
CREATE SEQUENCE schoolnet_private.school_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 999999
  CACHE 1
  NO CYCLE;

REVOKE ALL ON SEQUENCE schoolnet_private.school_code_seq FROM PUBLIC, anon, authenticated;

-- Si des codes SCH-xxxxxx avaient deja ete enregistres manuellement,
-- commencer apres leur numero le plus eleve pour eviter une collision.
DO $initialize$
DECLARE v_max bigint;
BEGIN
  SELECT MAX(pg_catalog.substring(s.code FROM 5)::bigint)
    INTO v_max
  FROM public.schoolnet_schools s
  WHERE s.code ~ '^SCH-[0-9]{6}$';
  IF COALESCE(v_max, 0) > 0 THEN
    PERFORM pg_catalog.setval(
      'schoolnet_private.school_code_seq'::pg_catalog.regclass,
      v_max,
      TRUE
    );
  END IF;
END;
$initialize$;

-- Signature et type de retour IDENTIQUES, aucun appel frontend ancien casse.
-- p_code n'a plus aucun effet : le serveur controle l'unicite.
CREATE OR REPLACE FUNCTION public.schoolnet_admin_create_school(
  p_name text,
  p_code text,
  p_contact_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $create$
DECLARE
  v_id uuid;
  v_name text;
  v_code text;
  v_email text;
  v_number bigint;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Action reservee au Super Administrateur SCHOOLNET.'
      USING ERRCODE='42501';
  END IF;

  v_name := pg_catalog.btrim(COALESCE(p_name, ''));
  v_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p_contact_email, ''))), '');

  IF pg_catalog.char_length(v_name) NOT BETWEEN 3 AND 160
     OR (v_email IS NOT NULL AND (
       pg_catalog.char_length(v_email) > 254
       OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     ))
  THEN
    RAISE EXCEPTION 'Nom ou e-mail de l etablissement invalide.';
  END IF;

  v_number := pg_catalog.nextval(
    'schoolnet_private.school_code_seq'::pg_catalog.regclass
  );
  v_code := 'SCH-' || pg_catalog.lpad(v_number::text, 6, '0');

  INSERT INTO public.schoolnet_schools (name, code, contact_email, created_by)
  VALUES (v_name, v_code, v_email, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.schoolnet_school_audit (school_id, action, actor_id)
  VALUES (v_id, 'school_created', auth.uid());

  RETURN v_id;
END;
$create$;

REVOKE ALL ON FUNCTION public.schoolnet_admin_create_school(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_admin_create_school(text,text,text)
  TO authenticated;

DO $verify$
BEGIN
  IF to_regclass('schoolnet_private.school_code_seq') IS NULL
    OR pg_catalog.has_sequence_privilege(
      'authenticated', 'schoolnet_private.school_code_seq', 'USAGE'
    )
    OR pg_catalog.has_function_privilege(
      'anon', 'public.schoolnet_admin_create_school(text,text,text)', 'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'authenticated', 'public.schoolnet_admin_create_school(text,text,text)', 'EXECUTE'
    )
    OR pg_catalog.position(
      'schoolnet_private.school_code_seq' IN
      pg_catalog.pg_get_functiondef(
        'public.schoolnet_admin_create_school(text,text,text)'::pg_catalog.regprocedure
      )
    ) = 0
  THEN
    RAISE EXCEPTION 'Generation automatique SCHOOLNET non conforme.';
  END IF;
END;
$verify$;
