-- SCHOOLNET | Lot 5.C - Verification en lecture seule avant/apres migration.
-- Aucun UPDATE / INSERT / DELETE / CREATE et aucune demande existante modifiee.
-- Avant activation : 29 migrations, table et RPC absentes.
-- Apres activation : 30 migrations, RLS active, grants Admin seulement.

SELECT
  (SELECT COUNT(*) FROM supabase_migrations.schema_migrations) AS migration_count,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109170500') AS lot5c_applied,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version='20261109140104') AS unrelated_assessment_security_applied,
  to_regclass('public.public_enrollment_request_resolutions') IS NOT NULL AS resolutions_table_exists,
  to_regprocedure('public.admin_finalize_public_enrollment_request(uuid,uuid,uuid,uuid,boolean,text)')
    IS NOT NULL AS finalize_rpc_exists,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid=to_regclass('public.public_enrollment_requests')
      AND tgname='trg_schoolnet_public_request_verified_status'
      AND tgenabled='O'
  ) AS processing_guard_enabled;

SELECT
  request_type, status, COUNT(*)::int AS requests
FROM public.public_enrollment_requests
GROUP BY request_type,status
ORDER BY request_type,status;

SELECT
  (SELECT COUNT(*)::int FROM public.student_enrollments) AS annual_enrollments,
  (SELECT COUNT(*)::int FROM public.parent_links) AS parent_links,
  (SELECT COUNT(*)::int FROM public.public_enrollment_request_events) AS request_status_events,
  pg_catalog.has_table_privilege('anon','public.parent_links','TRUNCATE') AS anon_can_truncate_parent_links,
  pg_catalog.has_table_privilege('authenticated','public.parent_links','TRUNCATE') AS authenticated_can_truncate_parent_links,
  pg_catalog.has_table_privilege('authenticated','public.parent_links','SELECT') AS authenticated_can_select_parent_links;

SELECT
  c.relname,
  c.relrowsecurity,
  (SELECT COUNT(*)::int FROM pg_catalog.pg_policies pol
    WHERE pol.schemaname='public' AND pol.tablename=c.relname) AS policies
FROM pg_catalog.pg_class c
WHERE c.oid=to_regclass('public.public_enrollment_request_resolutions');

SELECT
  pg_catalog.has_table_privilege(
    'anon',to_regclass('public.public_enrollment_request_resolutions'),'SELECT') AS anonymous_can_read_resolutions,
  pg_catalog.has_table_privilege(
    'authenticated',to_regclass('public.public_enrollment_request_resolutions'),'INSERT') AS authenticated_can_insert_resolutions,
  pg_catalog.has_table_privilege(
    'authenticated',to_regclass('public.public_enrollment_request_resolutions'),'SELECT') AS authenticated_has_select_grant,
  pg_catalog.has_function_privilege(
    'anon',to_regprocedure(
      'public.admin_finalize_public_enrollment_request(uuid,uuid,uuid,uuid,boolean,text)'
    ),'EXECUTE') AS anonymous_can_finalize,
  pg_catalog.has_function_privilege(
    'authenticated',to_regprocedure(
      'public.admin_finalize_public_enrollment_request(uuid,uuid,uuid,uuid,boolean,text)'
    ),'EXECUTE') AS authenticated_can_invoke_finalize;

-- Verification transactionnelle du comportement a realiser APRES autorisation,
-- avec des demandes FICTIVES et annulation de transaction. Attendus :
-- - Parent/Apprenant/Enseignant ne peuvent pas finaliser via la RPC
-- - Parent + apprenant verifies, lien absent : lien cree et profiles.child_ids aligne
-- - Demande inscription : inscription annuelle valide obligatoire et correspondant
-- - Demande acces parent : aucun dossier annuel exigible ni cree
-- - 2 appels identiques : meme resultat, aucune ligne/event/lien supplementaire
-- - 2ieme demande pour meme dossier annuel : refus par unicite
-- - Statut processed sans resolution : refus du trigger
-- - Un echec n'enregistre aucun lien partiel
-- - Demandes existantes et migrations non autorisees toujours intactes.
