-- SCHOOLNET S4-A - CONTROLE AVANT INSTALLATION (LECTURE SEULE)
-- Aucune creation/modification; executer sur Supabase principal avant le GO.
-- Ne jamais transmettre d'ID, de nom d'eleve ou de contenu de table.
WITH dep AS (
 SELECT
  to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)') AS guard_oid,
  to_regprocedure('schoolnet_private.is_school_admin_for(uuid)') AS admin_oid,
  to_regprocedure('public.get_my_role()') AS role_oid,
  to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') AS catalog_oid,
  to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)') AS new_pub_oid,
  to_regprocedure('schoolnet_private.local_school_pedagogy_overview(uuid)') AS new_priv_oid,
  to_regclass('public.schoolnet_school_student_class_assignments') AS students_table,
  to_regclass('public.schoolnet_school_teacher_subject_assignments') AS teachers_table,
  to_regclass('public.schoolnet_school_assignment_events') AS events_table,
  to_regclass('public.classes') AS classes_table,
  to_regclass('public.schoolnet_school_memberships') AS memberships_table,
  to_regclass('public.levels') AS levels_table,
  to_regclass('public.academic_subjects') AS subjects_table,
  to_regclass('public.profiles') AS profiles_table
), check_flags AS (
 SELECT
  (new_pub_oid IS NULL AND new_priv_oid IS NULL) AS rpc_s4a_absente,
  (guard_oid IS NOT NULL AND admin_oid IS NOT NULL
   AND role_oid IS NOT NULL AND catalog_oid IS NOT NULL) AS dependances_rpc_presentes,
  (students_table IS NOT NULL AND teachers_table IS NOT NULL
   AND events_table IS NOT NULL AND classes_table IS NOT NULL
   AND memberships_table IS NOT NULL AND levels_table IS NOT NULL
   AND subjects_table IS NOT NULL AND profiles_table IS NOT NULL) AS tables_presentes,
  (EXISTS(SELECT 1 FROM pg_proc WHERE oid=guard_oid AND prosecdef)
   AND EXISTS(SELECT 1 FROM pg_proc WHERE oid=catalog_oid AND NOT prosecdef)
   AND has_function_privilege('authenticated', guard_oid, 'EXECUTE') IS TRUE
   AND has_function_privilege('authenticated', catalog_oid, 'EXECUTE') IS TRUE
   AND has_function_privilege('anon', catalog_oid, 'EXECUTE') IS FALSE) AS garde_s3c_conforme,
  (EXISTS(SELECT 1 FROM pg_class WHERE oid=students_table AND relrowsecurity)
   AND EXISTS(SELECT 1 FROM pg_class WHERE oid=teachers_table AND relrowsecurity)
   AND EXISTS(SELECT 1 FROM pg_class WHERE oid=events_table AND relrowsecurity)
   AND has_table_privilege('authenticated', students_table, 'SELECT') IS FALSE
   AND has_table_privilege('authenticated', teachers_table, 'SELECT') IS FALSE
   AND has_table_privilege('authenticated', events_table, 'SELECT') IS FALSE) AS tables_s3c_privees
 FROM dep
)
SELECT
 CASE WHEN rpc_s4a_absente AND dependances_rpc_presentes AND tables_presentes
   AND garde_s3c_conforme AND tables_s3c_privees
 THEN 'S4A_PRECHECK_PASS' ELSE 'S4A_PRECHECK_BLOCKED' END AS resultat,
 rpc_s4a_absente,dependances_rpc_presentes,tables_presentes,
 garde_s3c_conforme,tables_s3c_privees
FROM check_flags;
