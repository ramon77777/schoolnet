-- SCHOOLNET S4-B.3-C.1 - CONTROLE AVANT INSTALLATION, LECTURE SEULE.
-- Verifie les prerequis et les empreintes/ACL sans installer de fonction.
-- Un refus de derive impose une nouvelle revue ; ne pas retirer les gardes.
BEGIN TRANSACTION READ ONLY;

DO $c1_prerequisites$
BEGIN
 IF current_user<>'postgres'
  OR to_regclass('public.parent_links') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('public.assessment_submissions') IS NULL
  OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
  OR to_regclass('schoolnet_private.school_course_links') IS NULL
  OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
  OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
  OR to_regprocedure('public.get_my_role()') IS NULL
  OR to_regprocedure('public.parent_can_read_child(uuid)') IS NULL
  OR to_regprocedure('public.is_linked_parent_of(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_course_assessments(uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_student_official_published_result(uuid,uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_student_official_dashboard()') IS NULL
  OR NOT has_schema_privilege('authenticated','schoolnet_private','USAGE')
  OR (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND policyname LIKE 's4b3b0_%'
    AND permissive='RESTRICTIVE')<>8
 THEN RAISE EXCEPTION 'S4B3C1_PREREQUISITES_FAILED'; END IF;
END $c1_prerequisites$;

DO $c1_new_absent$
BEGIN
 IF to_regprocedure('schoolnet_private.parent_official_result_rows(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_results()') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_result(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_results()') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_result(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3C1_NEW_FUNCTION_ALREADY_EXISTS'; END IF;
END $c1_new_absent$;
DO $c1_legacy_readonly$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b609cd47364424e5b28eaa0f692f0db3','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','7bb34d159b8090d0104a43e6ccba9829','s'),
  ('public.get_parent_child_homework_submissions(uuid)','c784095a394514bbab780ac2ba6c1b77','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_readonly$;

SELECT 'S4B3C1_PREFLIGHT_READONLY_PASS' AS result;
ROLLBACK;
