-- SCHOOLNET S4-A - CONTROLES APRES ACTIVATION (METADONNEES UNIQUEMENT)
-- Aucune lecture de donnees scolaires, aucune mutation.
-- En cas d'echec, ne pas publier le frontend S4-A.
DO $s4a_postcheck$
DECLARE
 v_pub oid := to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)');
 v_priv oid := to_regprocedure('schoolnet_private.local_school_pedagogy_overview(uuid)');
 v_guard oid := to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)');
BEGIN
 IF v_pub IS NULL OR v_priv IS NULL OR v_guard IS NULL THEN
   RAISE EXCEPTION 'S4A_POSTCHECK_BLOCKED: nouvelles fonctions ou garde S3-C absentes.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_pub
     AND prosecdef=false AND provolatile='s'
     AND pg_get_function_result(oid)='jsonb')
   OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_priv
     AND prosecdef=true AND provolatile='s'
     AND pg_get_function_result(oid)='jsonb')
   OR (SELECT proowner FROM pg_proc WHERE oid=v_priv)
       IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid=v_guard)
 THEN RAISE EXCEPTION 'S4A_POSTCHECK_BLOCKED: invoker/definer/owner/resultat incorrect.';
 END IF;
 IF has_function_privilege('anon',v_pub,'EXECUTE') IS NOT FALSE
   OR has_function_privilege('anon',v_priv,'EXECUTE') IS NOT FALSE
   OR has_function_privilege('authenticated',v_pub,'EXECUTE') IS NOT TRUE
   OR has_function_privilege('authenticated',v_priv,'EXECUTE') IS NOT TRUE
 THEN RAISE EXCEPTION 'S4A_POSTCHECK_BLOCKED: privilege RPC incorrect.'; END IF;
 IF (SELECT position('schoolnet_private.local_school_pedagogy_overview'
               in prosrc) FROM pg_proc WHERE oid=v_pub)=0
   OR (SELECT position('schoolnet_private.assert_s3c_access(p_school_id, false)'
               in prosrc) FROM pg_proc WHERE oid=v_priv)=0
   OR EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_priv
       AND prosrc ~* '(full_name|student_name|teacher_name|actor_name)')
 THEN RAISE EXCEPTION 'S4A_POSTCHECK_BLOCKED: facade/garde/confidentialite incoherentes.';
 END IF;
 IF to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') IS NULL
   OR NOT EXISTS(SELECT 1 FROM pg_class
       WHERE oid=to_regclass('public.schoolnet_school_student_class_assignments')
         AND relrowsecurity)
   OR NOT EXISTS(SELECT 1 FROM pg_class
       WHERE oid=to_regclass('public.schoolnet_school_teacher_subject_assignments')
         AND relrowsecurity)
   OR has_table_privilege('authenticated',
       to_regclass('public.schoolnet_school_student_class_assignments'),'SELECT') IS NOT FALSE
   OR has_table_privilege('authenticated',
       to_regclass('public.schoolnet_school_teacher_subject_assignments'),'SELECT') IS NOT FALSE
 THEN RAISE EXCEPTION 'S4A_POSTCHECK_BLOCKED: fondations S3-C modifiees.'; END IF;
END;
$s4a_postcheck$;
SELECT 'S4A_POSTCHECK_PASS' AS resultat;
