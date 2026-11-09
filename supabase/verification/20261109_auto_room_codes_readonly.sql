-- SCHOOLNET | Codes automatiques des salles : audit en lecture seule.
-- Avant migration 20261109145700 : sequence et trigger absents.
-- Apres : sequence et trigger actifs, fonction interne protegee.
-- Cette verification ne cree et ne modifie aucune salle.

SELECT
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version='20261109145700'
  ) AS room_code_migration_applied,
  to_regclass('schoolnet_private.room_code_seq') IS NOT NULL AS code_sequence_exists,
  to_regprocedure('schoolnet_private.assign_room_code()') IS NOT NULL AS trigger_function_exists,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = to_regclass('public.rooms')
      AND tgname='trg_rooms_assign_code'
      AND tgenabled='O'
  ) AS code_trigger_enabled,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_indexes
    WHERE schemaname='public'
      AND tablename='rooms'
      AND indexname='rooms_code_unique_ci'
  ) AS unique_code_index_exists,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid=to_regclass('public.rooms')
      AND relrowsecurity
  ) AS room_rls_enabled;

SELECT
  COUNT(*) AS rooms_total,
  COUNT(*) FILTER(WHERE code IS NULL) AS rooms_without_code,
  COUNT(*) FILTER(WHERE code ~ '^SAL-[0-9]{6,}$') AS generated_codes,
  COUNT(*) FILTER(WHERE code IS NOT NULL AND code !~ '^SAL-[0-9]{6,}$') AS legacy_codes,
  COUNT(*) FILTER(WHERE code='LAB-01') AS existing_lab_01_preserved,
  COUNT(DISTINCT lower(btrim(code))) AS distinct_normalized_codes
FROM public.rooms;

SELECT
  CASE
    WHEN to_regprocedure('schoolnet_private.assign_room_code()') IS NOT NULL
    THEN NOT pg_catalog.has_function_privilege(
      'anon',
      to_regprocedure('schoolnet_private.assign_room_code()'),
      'EXECUTE'
    )
  END AS anonymous_function_execution_denied,
  CASE
    WHEN to_regprocedure('schoolnet_private.assign_room_code()') IS NOT NULL
    THEN NOT pg_catalog.has_function_privilege(
      'authenticated',
      to_regprocedure('schoolnet_private.assign_room_code()'),
      'EXECUTE'
    )
  END AS authenticated_function_execution_denied,
  CASE
    WHEN to_regclass('schoolnet_private.room_code_seq') IS NOT NULL
    THEN NOT pg_catalog.has_sequence_privilege(
      'authenticated',
      to_regclass('schoolnet_private.room_code_seq'),
      'USAGE'
    )
  END AS authenticated_sequence_usage_denied;

-- Recette fonctionnelle (sur donnees fictives uniquement, apres autorisation) :
-- (1) creer Salle labo 2 : SAL-000001, si aucun SAL anterieur ;
-- (2) creer une seconde salle : numero different, sans doublon ;
-- (3) modifier nom/capacite : meme code conserve ;
-- (4) tentative de modification manuelle du code : refusee ;
-- (5) code LAB-01 existant : conserve ;
-- (6) roles non administrateurs : aucune creation/modification possible ;
-- (7) salles actives visibles dans l'emploi du temps.
