-- S4-D.2b DISPOSABLE INTEGRATION FIXTURE ONLY.
-- The unchanged C.3-B.2 teacher RPC has a preflight dependency on
-- schoolnet_private.school_grading_configuration(uuid), defined in C.3-A.
-- C.3-A cannot be applied to the minimal HTTP fixture because the fixture
-- already pre-creates its synthetic grading tables.
-- This stub ONLY satisfies to_regprocedure() in the C.3-B.2 SQL preflight.
-- It MUST NOT be called, shipped as a migration, or installed in production.
DO $pre$
BEGIN
 IF to_regprocedure('schoolnet_private.school_grading_configuration(uuid)') IS NOT NULL
 OR to_regprocedure('schoolnet_private.teacher_official_subject_averages(uuid,uuid,uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4D2B_STUB_DISPOSABLE_SCHEMA_ONLY'; END IF;
END $pre$;

CREATE FUNCTION schoolnet_private.school_grading_configuration(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $stub$
BEGIN
 RAISE EXCEPTION 'S4D2B_UNEXPECTED_FIXTURE_CONFIGURATION_CALL'
  USING ERRCODE='42501';
END $stub$;
REVOKE ALL ON FUNCTION schoolnet_private.school_grading_configuration(uuid)
 FROM PUBLIC,anon,authenticated;
SELECT 'S4D2B_CONFIG_PREREQUISITE_STUB_CREATED_ONLY_FOR_TESTS' AS verdict;
