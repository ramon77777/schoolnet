-- SCHOOLNET | Lot 5.B.1 — Protection des observations administratives.
-- PREPARATION SEULEMENT : ne pas appliquer sans autorisation specifique.
--
-- Dans l'etat initial, anon/authenticated ont toutes les permissions
-- de table sur public.student_enrollments (y compris TRUNCATE/TRIGGER).
-- RLS isole les lignes mais n'isole PAS les colonnes. Les notes internes
-- sont donc lisibles directement depuis l'API pour un Parent/Apprenant
-- autorise a lire sa ligne.
--
-- Les RPC admin existantes sont SECURITY DEFINER et verifient is_admin().
-- L'administration conserve ainsi la gestion de notes via ces RPC.
-- Les ecrans Parent/Apprenant utilisent une projection explicite sans notes.
-- Ne pas utiliser SELECT * depuis le role authenticated sur cette table.

DO $schoolnet_enrollment_privileges_preflight$
BEGIN
  IF to_regclass('public.student_enrollments') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_class
       WHERE oid=to_regclass('public.student_enrollments')
         AND relrowsecurity
     )
     OR to_regprocedure('public.get_admin_student_enrollments(uuid,uuid,text,text)') IS NULL
     OR to_regprocedure('public.admin_upsert_student_enrollment_with_gender(uuid,uuid,date,text,text,text,text)') IS NULL
     OR to_regprocedure('public.admin_set_student_enrollment_status(uuid,text,text)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='public'
         AND tablename='student_enrollments'
         AND policyname='student_enrollments_student_parent_read'
     )
  THEN
    RAISE EXCEPTION 'SCHOOLNET Lot 5.B.1 : prerequisites RLS/RPC non conformes';
  END IF;
END
$schoolnet_enrollment_privileges_preflight$;

-- Supprimer les anciens droits non necessaires ; garder le service_role
-- et postgres intacts. Les CREATE/UPDATE/DELETE d'administration passent
-- deja par les RPC SECURITY DEFINER, pas par le client direct.
REVOKE ALL PRIVILEGES ON TABLE public.student_enrollments
  FROM PUBLIC, anon, authenticated;

-- Seules ces colonnes non internes sont consultables sous RLS.
-- Les colonnes notes, created_by et updated_by ne sont PAS accessibles
-- en direct au role authenticated.
GRANT SELECT (
  id,
  enrollment_number,
  student_id,
  school_year_id,
  class_id,
  status,
  enrolled_on,
  admission_type,
  previous_school,
  created_at,
  updated_at
) ON TABLE public.student_enrollments TO authenticated;

DO $schoolnet_enrollment_privileges_postcheck$
BEGIN
  IF pg_catalog.has_column_privilege(
       'authenticated', 'public.student_enrollments', 'notes', 'SELECT')
     OR pg_catalog.has_column_privilege(
       'authenticated', 'public.student_enrollments', 'created_by', 'SELECT')
     OR pg_catalog.has_column_privilege(
       'authenticated', 'public.student_enrollments', 'updated_by', 'SELECT')
     OR NOT pg_catalog.has_column_privilege(
       'authenticated', 'public.student_enrollments', 'enrollment_number', 'SELECT')
     OR NOT pg_catalog.has_column_privilege(
       'authenticated', 'public.student_enrollments', 'student_id', 'SELECT')
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.student_enrollments', 'TRUNCATE')
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.student_enrollments', 'UPDATE')
     OR pg_catalog.has_table_privilege(
       'anon', 'public.student_enrollments', 'SELECT')
  THEN
    RAISE EXCEPTION 'SCHOOLNET Lot 5.B.1 : droits insuffisamment restreints';
  END IF;
END
$schoolnet_enrollment_privileges_postcheck$;

-- Les donnees, l'historique, les numeros, les statuts et la RLS ne changent pas.
-- Migration independante des corrections : 20261109140104 reste en attente.
