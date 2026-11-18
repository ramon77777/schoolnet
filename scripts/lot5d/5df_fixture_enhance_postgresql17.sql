-- SCHOOLNET LOT 5D-F | minimal additional columns for disposable PG17 fixture only.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF pg_catalog.current_database()<>'schoolnet_lot5d_ci'
    OR pg_catalog.current_setting('server_version_num')::int<170000
 THEN RAISE EXCEPTION '5D-F: fixture database required'; END IF;
END;
$guard$;
-- Matches the production profile gender column (verified read-only, type text).
ALTER TABLE public.profiles ADD COLUMN gender text;
\echo '5D-F fixture: profile.gender enabled ONLY in disposable database'
