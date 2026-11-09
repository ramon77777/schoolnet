-- SCHOOLNET | Complement Lot 2 | Codes automatiques des salles physiques.
-- Prepare sur GitHub : ne pas appliquer a schoolnet_2.0 sans autorisation SQL.
--
-- Nouvelle salle : SAL-000001, SAL-000002, etc., attribue par PostgreSQL,
-- y compris si un client envoie volontairement une valeur dans rooms.code.
-- Mise a jour : le code devient immuable, meme en contournant le formulaire.
-- Les salles existantes (p. ex. LAB-01) conservent strictement leur code.
-- Un code attribue n'est jamais recycle (la sequence peut avoir des trous).
-- Les numeros sont globaux pour cette instance SCHOOLNET ; aucun changement
-- multi-etablissement n'est introduit par cette migration.

DO $schoolnet_preflight$
BEGIN
  IF to_regnamespace('schoolnet_private') IS NULL
     OR to_regclass('public.rooms') IS NULL
     OR to_regclass('schoolnet_private.room_code_seq') IS NOT NULL
     OR to_regprocedure('schoolnet_private.assign_room_code()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid = to_regclass('public.rooms')
         AND tgname = 'trg_rooms_assign_code'
         AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_indexes
       WHERE schemaname = 'public' AND tablename = 'rooms'
         AND indexname = 'rooms_code_unique_ci'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid = to_regclass('public.rooms') AND relrowsecurity
     )
  THEN
    RAISE EXCEPTION 'SCHOOLNET: schema de salles incompatible ou migration deja appliquee';
  END IF;

  -- Eviter un numero a 19 chiffres ou plus qui depasserait bigint.
  IF EXISTS (
    SELECT 1 FROM public.rooms
    WHERE btrim(code) ~* '^SAL-[0-9]{19,}$'
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET: numero SAL preexistant trop long pour initialiser la sequence';
  END IF;
END;
$schoolnet_preflight$;

CREATE SEQUENCE schoolnet_private.room_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- Le role connecte n'a pas besoin d'acceder directement a cette sequence.
REVOKE ALL ON SEQUENCE schoolnet_private.room_code_seq
FROM PUBLIC, anon, authenticated;

-- Reprendre apres les SAL-000123 deja attribues, le cas echeant.
-- Ne jamais modifier les codes historiques, y compris les codes manuels.
DO $schoolnet_seed$
DECLARE
  v_last bigint;
BEGIN
  SELECT COALESCE(MAX(
    substring(btrim(code) FROM '^[Ss][Aa][Ll]-([0-9]{6,18})$')::bigint
  ), 0)
  INTO v_last
  FROM public.rooms
  WHERE btrim(code) ~* '^SAL-[0-9]{6,18}$';

  IF v_last > 0 THEN
    PERFORM pg_catalog.setval(
      'schoolnet_private.room_code_seq'::regclass,
      v_last,
      true
    );
  END IF;
END;
$schoolnet_seed$;

CREATE FUNCTION schoolnet_private.assign_room_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $schoolnet_function$
DECLARE
  v_number bigint;
BEGIN
  IF TG_WHEN <> 'BEFORE'
    OR TG_TABLE_SCHEMA <> 'public'
    OR TG_TABLE_NAME <> 'rooms'
    OR TG_OP NOT IN ('INSERT', 'UPDATE')
  THEN
    RAISE EXCEPTION 'SCHOOLNET: utilisation incorrecte du declencheur de code';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_number := pg_catalog.nextval(
      'schoolnet_private.room_code_seq'::regclass
    );
    NEW.code := 'SAL-' || pg_catalog.lpad(
      v_number::text,
      GREATEST(6, pg_catalog.length(v_number::text)),
      '0'
    );
    RETURN NEW;
  END IF;

  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Le code d une salle est attribue automatiquement et ne peut pas etre modifie.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$schoolnet_function$;

-- Fonction interne : aucun appel RPC depuis le navigateur.
REVOKE ALL ON FUNCTION schoolnet_private.assign_room_code()
FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION schoolnet_private.assign_room_code()
IS 'SCHOOLNET : genere un code SAL unique a la creation et interdit sa modification.';

CREATE TRIGGER trg_rooms_assign_code
BEFORE INSERT OR UPDATE OF code ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION schoolnet_private.assign_room_code();

-- Ne change ni la politique RLS, ni l'index rooms_code_unique_ci,
-- ni les emplois du temps, ni les salles et codes deja enregistres.
