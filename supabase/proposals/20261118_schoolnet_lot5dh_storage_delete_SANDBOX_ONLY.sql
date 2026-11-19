-- SCHOOLNET LOT 5D-H | PROPOSITION STRICTE D'ARCHIVAGE STORAGE
-- SANDBOX_ONLY; NE PAS EXECUTER SUR SUPABASE PRINCIPAL, SQL Editor
-- ou supabase/migrations. Ceci N'EST PAS une migration installable.
-- Verifier le schema reel, politiques Storage, et tests API avant tout GO.
--
-- Cause: le navigateur supprimait le fichier dans Storage AVANT que
-- la suppression de student_enrollment_documents ne soit confirmee.
-- Decision provisoire: REFUSER toute suppression Storage dans ce bucket
-- par le role authenticated, pas seulement pour les annees cloturees.
-- Depots et lectures existants ne sont pas modifies par ce candidat.
-- Les suppressions futures exigent un backend prive, journal, reprise.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $lot5dh_guard$
DECLARE old_count integer;
BEGIN
  IF pg_catalog.current_database()<>'schoolnet_lot5d_ci'
     OR pg_catalog.current_setting('server_version_num')::int<170000
     OR pg_catalog.to_regclass('storage.objects') IS NULL
     OR pg_catalog.to_regclass('public.student_enrollment_documents') IS NULL
     OR pg_catalog.to_regclass('public.school_year_rollover_runs') IS NULL
  THEN RAISE EXCEPTION '5D-H: uniquement PostgreSQL 17 jetable.'
    USING ERRCODE='42501'; END IF;
  SELECT count(*) INTO old_count FROM pg_catalog.pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname='schoolnet_enrollment_docs_storage_admin_delete'
     AND cmd='DELETE' AND roles::text LIKE '%authenticated%'
     AND qual IS NOT NULL AND qual<>'false';
  IF old_count<>1 THEN
    RAISE EXCEPTION '5D-H: la politique Storage historique attendue est absente ou deja modifiee.'
      USING ERRCODE='55000'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='storage'
    AND tablename='objects' AND cmd IN ('DELETE','ALL')
    AND policyname<>'schoolnet_enrollment_docs_storage_admin_delete'
    AND (qual ILIKE '%student-enrollment-documents%' OR
         qual IS NULL OR qual='true')
  ) THEN
    RAISE EXCEPTION '5D-H: une autre politique Storage peut autoriser les suppressions.'
      USING ERRCODE='42501'; END IF;
END;
$lot5dh_guard$;

-- Maintient EXACTEMENT le nom de policy existant. On remplace sa permission
-- DELETE par un refus explicite, sans toucher aux autres buckets ou aux
-- policies SELECT et INSERT. Un role serveur privilegie peut outrepasser RLS:
-- la suppression doit alors se faire par un workflow prive et journalise.
DROP POLICY schoolnet_enrollment_docs_storage_admin_delete ON storage.objects;
CREATE POLICY schoolnet_enrollment_docs_storage_admin_delete
 ON storage.objects FOR DELETE TO authenticated USING (false);

DO $lot5dh_postcheck$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND policyname='schoolnet_enrollment_docs_storage_admin_delete'
     AND cmd='DELETE' AND qual='false'
 ) THEN RAISE EXCEPTION '5D-H: refusal policy not installed in fixture.'
   USING ERRCODE='42501'; END IF;
END;
$lot5dh_postcheck$;
COMMIT;
-- SANDBOX_ONLY. Non installable: valider Storage API, droits de service,
-- RPC reel, reprise des objets et cohérence metadonnees avant production.
