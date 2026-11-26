-- ONLY FOR DISPOSABLE CI SUPABASE, NOT A MIGRATION.
-- C.3-C.3.5.2 stripped presentation columns from its fixture; the real
-- C.3-A configuration RPC expects name on these school-year/class/period tables.
-- Add exact minimal label columns here, NEVER to production through this file.
DO $fixture$
BEGIN
 IF to_regclass('public.schoolnet_schools') IS NULL
 OR to_regclass('public.school_years') IS NULL
 OR to_regclass('public.classes') IS NULL
 OR to_regclass('schoolnet_private.school_grading_periods') IS NULL
 OR to_regclass('schoolnet_private.school_official_curricula') IS NOT NULL
 THEN RAISE EXCEPTION 'S4D2C4_FIXTURE_MUST_PRECEDE_C3C3_SQL'; END IF;
END $fixture$;
ALTER TABLE public.schoolnet_schools ADD COLUMN name text;
ALTER TABLE public.school_years ADD COLUMN name text;
ALTER TABLE public.classes ADD COLUMN name text;
ALTER TABLE schoolnet_private.school_grading_periods ADD COLUMN name text;
SELECT 'S4D2C4_DISPOSABLE_FIXTURE_LABEL_COLUMNS_ONLY' AS verdict;
