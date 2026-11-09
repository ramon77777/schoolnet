-- SCHOOLNET | Lot 5.B - controles lecture seule avant / apres activation.
-- Ce fichier ne cree, ne modifie et ne supprime aucune donnee.
-- Attendu avant application : migrations absentes, notes encore accessibles,
-- bucket prive absent. Attendu apres : notes protegees, bucket prive, RLS.

SELECT
  (SELECT count(*) FROM supabase_migrations.schema_migrations) AS migrations_applied,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109153406'
  ) AS 5b1_security_applied,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109153500'
  ) AS 5b2_documents_applied,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109140104'
  ) AS pending_grading_migration_applied,
  pg_catalog.has_column_privilege(
    'authenticated','public.student_enrollments','notes','SELECT'
  ) AS authenticated_can_read_admin_notes,
  pg_catalog.has_column_privilege(
    'authenticated','public.student_enrollments','enrollment_number','SELECT'
  ) AS authenticated_can_read_enrollment_number,
  pg_catalog.has_table_privilege(
    'anon','public.student_enrollments','TRUNCATE'
  ) AS anonymous_can_truncate_enrollments,
  pg_catalog.has_table_privilege(
    'authenticated','public.student_enrollments','UPDATE'
  ) AS authenticated_can_update_enrollments_directly;

SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id='student-enrollment-documents';

SELECT
  tablename,
  policyname,
  cmd,
  roles,
  left(coalesce(qual,''),300) AS using_expression,
  left(coalesce(with_check,''),300) AS with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename='student_enrollment_documents')
   OR (schemaname='storage' AND tablename='objects'
       AND policyname LIKE 'schoolnet_enrollment_docs_%')
ORDER BY tablename,policyname;

SELECT
  to_regclass('public.student_enrollment_documents') IS NOT NULL
    AS document_metadata_table_exists,
  CASE WHEN to_regclass('public.student_enrollment_documents') IS NOT NULL
    THEN (SELECT relrowsecurity FROM pg_catalog.pg_class
      WHERE oid=to_regclass('public.student_enrollment_documents'))
    ELSE false
  END AS document_metadata_rls_enabled,
  CASE WHEN to_regclass('public.student_enrollment_documents') IS NOT NULL
    THEN pg_catalog.has_table_privilege(
      'anon','public.student_enrollment_documents','SELECT')
    ELSE NULL
  END AS anonymous_can_read_documents_metadata,
  CASE WHEN to_regclass('public.student_enrollment_documents') IS NOT NULL
    THEN pg_catalog.has_table_privilege(
      'authenticated','public.student_enrollment_documents','SELECT')
    ELSE NULL
  END AS authenticated_has_metadata_select_grant;

-- En phase de recette, realiser aussi deux tests via authentification reelle :
-- 1) Parent/Apprenant : seul le dossier rattache reste lisible et
--    SELECT notes est refuse par PostgreSQL (pas seulement masque en React).
-- 2) Admin : CRUD du dossier existant via les RPC, depot d'un PDF fictif,
--    telechargement prive, suppression, refus cote Parent/Apprenant.
-- Aucun acte de naissance reel ni document sensible durant la recette.
