-- SCHOOLNET Lot 5D-L | PRIVATE session authorization + atomic durable quota.
-- SQL CANDIDATE, SANDBOX_ONLY. NEVER execute on any hosted Supabase project.
-- Run only after 5D-K fixture in a disposable supabase-start Docker stack.
-- This is NOT a migration; no Supabase principal or hosted Auth mutations.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='20s';

DO $lot5dl_guard$
DECLARE host inet;
BEGIN
 host := pg_catalog.inet_server_addr();
 IF pg_catalog.current_database() <> 'postgres'
    OR pg_catalog.current_setting('application_name',true) <> 'schoolnet_5dl_local_ci'
    OR host IS NULL
    OR NOT (
      host <<= '127.0.0.0/8'::inet OR
      host <<= '10.0.0.0/8'::inet OR
      host <<= '172.16.0.0/12'::inet OR
      host <<= '192.168.0.0/16'::inet
    )
    OR pg_catalog.to_regclass('auth.sessions') IS NULL
    OR pg_catalog.to_regclass('public.parent_links') IS NULL
    OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='public' AND tablename='profiles'
         AND policyname='k_profile_self'
    )
    OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_policies
       WHERE schemaname='storage' AND tablename='objects'
         AND policyname='k_storage_source_delete_deny'
    )
    OR pg_catalog.to_regclass('schoolnet_private.parent_read_rate_windows') IS NOT NULL
 THEN RAISE EXCEPTION '5D-L: disposable Supabase 5D-K stack ONLY.'
   USING ERRCODE='42501'; END IF;
END;
$lot5dl_guard$;

CREATE SCHEMA IF NOT EXISTS schoolnet_private;
REVOKE ALL ON SCHEMA schoolnet_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA schoolnet_private TO service_role;

-- One durable row per actor (bounded growth). Unique index serializes
-- concurrent attempts across workers, processes and Edge instances.
CREATE TABLE schoolnet_private.parent_read_rate_windows (
 actor_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 window_started_at timestamptz NOT NULL,
 request_count integer NOT NULL CHECK (request_count BETWEEN 1 AND 12)
);
ALTER TABLE schoolnet_private.parent_read_rate_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_private.parent_read_rate_windows
 FROM PUBLIC,anon,authenticated,service_role;

-- The privileged reader remains PRIVATE, with a secure search_path and no
-- execute permission for browser roles. The public API entrypoint is
-- SECURITY INVOKER, executable ONLY with the server's service-role key.
CREATE FUNCTION schoolnet_private.check_parent_session_and_rate(
 p_actor_id uuid,p_session_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $lot5dl$
DECLARE
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_count integer;
BEGIN
 IF p_actor_id IS NULL OR p_session_id IS NULL THEN
   RETURN 'session_denied';
 END IF;
 -- A valid JWT/user is checked in Edge first; this independent DB check
 -- enforces session liveness even if the access token has not expired.
 IF NOT EXISTS (
   SELECT 1 FROM auth.sessions s
    WHERE s.id=p_session_id AND s.user_id=p_actor_id
      AND (s.not_after IS NULL OR s.not_after>v_now)
 ) THEN
   RETURN 'session_denied';
 END IF;
 -- Authorization is from profiles, NEVER from user_metadata/client JSON.
 IF NOT EXISTS (
   SELECT 1 FROM public.profiles p
    WHERE p.id=p_actor_id AND p.role::text='parent'
 ) THEN
   RETURN 'role_denied';
 END IF;

 INSERT INTO schoolnet_private.parent_read_rate_windows
  AS r(actor_id,window_started_at,request_count)
 VALUES (p_actor_id,v_now,1)
 ON CONFLICT(actor_id) DO UPDATE
 SET
  window_started_at=CASE
   WHEN r.window_started_at<=v_now-interval '60 seconds'
   THEN v_now ELSE r.window_started_at END,
  request_count=CASE
   WHEN r.window_started_at<=v_now-interval '60 seconds'
   THEN 1 ELSE r.request_count+1 END
 WHERE r.window_started_at<=v_now-interval '60 seconds'
       OR r.request_count<12
 RETURNING request_count INTO v_count;
 IF v_count IS NULL THEN RETURN 'rate_limited'; END IF;
 RETURN 'authorized';
END;
$lot5dl$;
REVOKE ALL ON FUNCTION
 schoolnet_private.check_parent_session_and_rate(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 schoolnet_private.check_parent_session_and_rate(uuid,uuid) TO service_role;

-- RPC is exposed in public only because service_role needs PostgREST;
-- SECURITY INVOKER has no elevated privileges. ALL public/anon/
-- authenticated execute privileges are explicitly revoked.
CREATE FUNCTION public.schoolnet_parent_read_gate(
 p_actor_id uuid,p_session_id uuid
) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog
AS $lot5dl_wrapper$
  SELECT schoolnet_private.check_parent_session_and_rate(
    p_actor_id,p_session_id
  );
$lot5dl_wrapper$;
REVOKE ALL ON FUNCTION public.schoolnet_parent_read_gate(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_parent_read_gate(uuid,uuid)
 TO service_role;

DO $lot5dl_post$
BEGIN
 IF pg_catalog.has_function_privilege('anon',
       'public.schoolnet_parent_read_gate(uuid,uuid)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',
       'public.schoolnet_parent_read_gate(uuid,uuid)'::regprocedure,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('service_role',
       'public.schoolnet_parent_read_gate(uuid,uuid)'::regprocedure,'EXECUTE')
    OR pg_catalog.has_table_privilege('authenticated',
       'schoolnet_private.parent_read_rate_windows','SELECT')
 THEN RAISE EXCEPTION '5D-L: postinstall grants are unsafe!'
      USING ERRCODE='42501'; END IF;
END;
$lot5dl_post$;
COMMIT;
-- Deployment must require separate explicit GO, migration review,
-- real role/session checks, rate-limit policy, and security advisers.
