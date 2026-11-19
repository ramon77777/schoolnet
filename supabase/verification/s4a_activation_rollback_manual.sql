-- SCHOOLNET S4-A - ROLLBACK CIBLE, JAMAIS AUTOMATIQUE EN PRODUCTION.
-- Executer UNIQUEMENT dans une TRANSACTION (apply_migration avec approbation,
-- ou psql -1 sur runner local CI). Ne jamais lancer instruction par instruction.
-- Avant rollback : revenir au frontend qui n'utilise PAS cette nouvelle RPC.
-- Les objets du socle S3-C, les tables et les donnees sont inchanges.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15000ms';
DO $s4a_rollback_guard$
DECLARE
 v_pub oid := to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)');
 v_priv oid := to_regprocedure('schoolnet_private.local_school_pedagogy_overview(uuid)');
 v_guard oid := to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)');
BEGIN
 IF v_pub IS NULL OR v_priv IS NULL OR v_guard IS NULL THEN
   RAISE EXCEPTION 'S4A_ROLLBACK_BLOCKED: paire de fonctions ou garde attendue absente.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_pub
   AND prosecdef=false AND pg_get_function_result(oid)='jsonb'
   AND position('schoolnet_private.local_school_pedagogy_overview' in prosrc)>0)
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=v_priv
   AND prosecdef=true AND pg_get_function_result(oid)='jsonb'
   AND position('schoolnet_private.assert_s3c_access(p_school_id, false)' in prosrc)>0)
  OR (SELECT proowner FROM pg_proc WHERE oid=v_priv)
     IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid=v_guard)
 THEN RAISE EXCEPTION 'S4A_ROLLBACK_BLOCKED: implementation changee, revue obligatoire.'; END IF;
END;
$s4a_rollback_guard$;
-- L'ordre est indispensable : facade avant fonction privee.
-- RESTRICT refuse les dependances nouvelles plutot que de les supprimer.
DROP FUNCTION public.schoolnet_school_pedagogy_overview(uuid) RESTRICT;
DROP FUNCTION schoolnet_private.local_school_pedagogy_overview(uuid) RESTRICT;
DO $s4a_verify_drop$
BEGIN
 IF to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)') IS NOT NULL
   OR to_regprocedure('schoolnet_private.local_school_pedagogy_overview(uuid)') IS NOT NULL
   OR to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') IS NULL
 THEN RAISE EXCEPTION 'S4A_ROLLBACK_BLOCKED: suppression incomplete ou S3-C absent.'; END IF;
END;
$s4a_verify_drop$;
-- Le NOTIFY ne publie rien sur Vercel ; il invalide le cache PostgREST.
NOTIFY pgrst, 'reload schema';
SELECT 'S4A_ROLLBACK_PASS' AS resultat;
