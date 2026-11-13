-- SCHOOLNET Lot 5.C-B.2 / B2D2 -- SANDBOX ONLY onqlsvphmrqhelislpry.
-- Server-only provisioning: the caller must verify the Auth account and school permission.
-- NEVER expose service_role to a browser or call from a public client.

CREATE FUNCTION public.schoolnet_student_sandbox_provision(
 p_auth_user_id uuid, p_code_hmac text, p_family_phone text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $schoolnet_sandbox_provision$
BEGIN
 IF p_auth_user_id IS NULL
 OR p_code_hmac IS NULL OR p_code_hmac !~ '^[0-9a-f]{64}$'
 OR p_family_phone IS NULL OR p_family_phone !~ '^[+][1-9][0-9]{7,14}$'
 THEN RAISE EXCEPTION 'Invalid server identity parameters' USING ERRCODE='22023'; END IF;
 INSERT INTO schoolnet_student_private.identities
 (student_auth_user_id,schoolnet_code_hmac,family_phone_e164)
 VALUES(p_auth_user_id,p_code_hmac,p_family_phone);
 RETURN TRUE;
END;
$schoolnet_sandbox_provision$;

REVOKE ALL ON FUNCTION public.schoolnet_student_sandbox_provision(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_sandbox_provision(uuid,text,text)
 TO service_role;

CREATE FUNCTION public.schoolnet_student_sandbox_activate(
 p_auth_user_id uuid,p_code_hmac text,p_family_phone text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $schoolnet_sandbox_activate$
DECLARE changed integer;
BEGIN
 IF p_auth_user_id IS NULL OR p_code_hmac IS NULL OR p_family_phone IS NULL
 THEN RAISE EXCEPTION 'Invalid identity activation parameters' USING ERRCODE='22023'; END IF;
 UPDATE schoolnet_student_private.identities AS i
 SET login_status='enabled',activated_at=pg_catalog.now()
 WHERE i.student_auth_user_id=p_auth_user_id
 AND i.schoolnet_code_hmac=p_code_hmac
 AND i.family_phone_e164=p_family_phone
 AND i.login_status='pending'
 AND i.activated_at IS NULL AND i.revoked_at IS NULL;
 GET DIAGNOSTICS changed = ROW_COUNT;
 RETURN changed=1;
END;
$schoolnet_sandbox_activate$;

REVOKE ALL ON FUNCTION public.schoolnet_student_sandbox_activate(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_sandbox_activate(uuid,text,text)
 TO service_role;

CREATE FUNCTION public.schoolnet_student_sandbox_revoke(p_auth_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $schoolnet_sandbox_revoke$
DECLARE changed integer;
BEGIN
 IF p_auth_user_id IS NULL THEN
 RAISE EXCEPTION 'Invalid revoke parameters' USING ERRCODE='22023'; END IF;
 UPDATE schoolnet_student_private.identities AS i
 SET login_status='revoked',revoked_at=pg_catalog.now()
 WHERE i.student_auth_user_id=p_auth_user_id
 AND i.login_status IN ('pending','enabled','suspended')
 AND i.revoked_at IS NULL;
 GET DIAGNOSTICS changed = ROW_COUNT;
 RETURN changed=1;
END;
$schoolnet_sandbox_revoke$;

REVOKE ALL ON FUNCTION public.schoolnet_student_sandbox_revoke(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_sandbox_revoke(uuid)
 TO service_role;
