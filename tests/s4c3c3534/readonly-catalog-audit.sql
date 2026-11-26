-- SCHOOLNET V2 — S4-C.3-C.3.5.3.4
-- Lecture de catalogues uniquement. Ne lit aucune ligne d'eleve/notes.
-- Script de reference, NON execute par la CI et NON destine a appliquer des migrations.
-- Revoir les changements de colonnes, functions ou grants avant re-execution.

SELECT qualified_name,
       to_regclass(qualified_name) IS NOT NULL AS present
FROM (VALUES
 ('public.profiles'),
 ('public.schoolnet_schools'),
 ('public.school_years'),
 ('public.classes'),
 ('public.academic_subjects'),
 ('public.schoolnet_school_memberships'),
 ('public.schoolnet_school_teacher_subject_assignments'),
 ('public.schoolnet_school_student_class_assignments'),
 ('schoolnet_private.school_grading_periods'),
 ('schoolnet_private.school_period_subject_coefficients'),
 ('schoolnet_private.school_official_curricula'),
 ('schoolnet_private.school_official_curriculum_subjects'),
 ('schoolnet_private.school_export_preview_audit')
) AS objects(qualified_name)
ORDER BY qualified_name;

SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       a.attname AS column_name,
       format_type(a.atttypid,a.atttypmod) AS column_type
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname,c.relname,a.attname) IN (
 ('public','schoolnet_schools','name'),
 ('public','school_years','name'),
 ('public','classes','name'),
 ('schoolnet_private','school_grading_periods','name'),
 ('public','academic_subjects','name')
)
AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY schema_name,relation_name;

SELECT n.nspname AS schema_name,
       p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS function_arguments,
       pg_get_function_result(p.oid) AS return_type,
       p.prosecdef AS security_definer,
       array_to_string(p.proconfig,',') AS settings,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','schoolnet_private')
AND p.proname IN (
 'get_my_role',
 'schoolnet_teacher_official_subject_averages',
 'schoolnet_school_official_general_averages',
 'schoolnet_official_export_preview',
 'schoolnet_official_export_labels',
 'publish_assessment_submission',
 'mark_submission_as_graded',
 'recalculate_submission_score',
 'admin_set_current_school_year',
 'admin_save_school_year_rollover_decision',
 'admin_finalize_school_year_rollover'
)
ORDER BY schema_name,function_name;

SELECT 'school_year_rollover_decisions' AS object_name,
       to_regclass('public.school_year_rollover_decisions') IS NOT NULL AS present
UNION ALL SELECT 'school_year_rollover_runs',
       to_regclass('public.school_year_rollover_runs') IS NOT NULL
UNION ALL SELECT 'school_year_rollover_guard_trigger',
       EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
               WHERE tgrelid=to_regclass('public.school_years')
               AND tgname='trg_schoolnet_guard_school_year_rollover'
               AND NOT tgisinternal);
