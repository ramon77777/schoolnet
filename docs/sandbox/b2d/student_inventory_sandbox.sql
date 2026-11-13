-- SCHOOLNET 5.C-B.2 2.D2: sandbox-only inventory of synthetic identity records.
-- Never returns an Auth UUID, school code, phone, email or token.
CREATE FUNCTION public.schoolnet_student_sandbox_inventory()
RETURNS TABLE(identity_count bigint,pending_count bigint,enabled_count bigint,revoked_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $schoolnet_sandbox_inventory$
 SELECT count(*),
 count(*) FILTER(WHERE i.login_status='pending'),
 count(*) FILTER(WHERE i.login_status='enabled'),
 count(*) FILTER(WHERE i.login_status='revoked')
 FROM schoolnet_student_private.identities AS i;
$schoolnet_sandbox_inventory$;
REVOKE ALL ON FUNCTION public.schoolnet_student_sandbox_inventory()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_sandbox_inventory()
 TO service_role;
