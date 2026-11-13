-- SCHOOLNET Lot 5.C-B.2 / Etape 2.D / SANDBOX ONLY
-- Target: onqlsvphmrqhelislpry. Never apply to SCHOOLNET main.
-- Anonymous/authenticated roles must never access these server-only RPCs.
-- No password, real email, raw IP or cleartext SCHOOLNET code is stored.

CREATE TABLE schoolnet_student_private.login_attempt_windows (
  scope TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT schoolnet_student_login_window_pk
    PRIMARY KEY (scope, subject_digest, window_started_at),
  CONSTRAINT schoolnet_student_window_scope_chk
    CHECK (scope IN ('global', 'ip', 'phone', 'code')),
  CONSTRAINT schoolnet_student_window_digest_chk
    CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT schoolnet_student_window_count_chk
    CHECK (attempt_count BETWEEN 1 AND 1000000)
);

ALTER TABLE schoolnet_student_private.login_attempt_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_student_private.login_attempt_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_student_private.login_attempt_windows
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE
  schoolnet_student_private.login_attempt_windows TO service_role;

CREATE TABLE schoolnet_student_private.login_audit_events (
  event_id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('rate_limited', 'denied', 'authenticated', 'server_error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE schoolnet_student_private.login_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_student_private.login_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schoolnet_student_private.login_audit_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE
  schoolnet_student_private.login_audit_events TO service_role;

-- All arguments here are server-provided: one normalized phone and 3
-- independent keyed-HMAC digests. No password is passed into SQL.
-- The global window is charged first, so repeated blocked requests cannot
-- create unlimited per-code/per-phone rows after the global cap is reached.
CREATE FUNCTION public.schoolnet_student_login_gate(
  p_phone_e164 TEXT,
  p_code_hmac TEXT,
  p_phone_bucket_hmac TEXT,
  p_ip_bucket_hmac TEXT
) RETURNS TABLE(rate_allowed BOOLEAN, student_auth_user_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $schoolnet_student_login_gate$
DECLARE
  v_window TIMESTAMPTZ :=
    pg_catalog.to_timestamp((
      floor(EXTRACT(EPOCH FROM pg_catalog.clock_timestamp()) / 900) * 900
    )::double precision);
  v_scope TEXT;
  v_digest TEXT;
  v_cap INTEGER;
  v_count INTEGER;
BEGIN
  IF p_phone_e164 IS NULL OR p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$'
    OR p_code_hmac IS NULL OR p_code_hmac !~ '^[0-9a-f]{64}$'
    OR p_phone_bucket_hmac IS NULL OR p_phone_bucket_hmac !~ '^[0-9a-f]{64}$'
    OR p_ip_bucket_hmac IS NULL OR p_ip_bucket_hmac !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid server authentication arguments'
      USING ERRCODE = '22023';
  END IF;

  -- Conservative SANDBOX limits per 15-minute window. Review WAF and
  -- real traffic thresholds before enabling in production.
  FOREACH v_scope IN ARRAY ARRAY['global','ip','phone','code'] LOOP
    CASE v_scope
      WHEN 'global' THEN
        v_digest := pg_catalog.repeat('0', 64);
        v_cap := 150;
      WHEN 'ip' THEN
        v_digest := p_ip_bucket_hmac;
        v_cap := 25;
      WHEN 'phone' THEN
        v_digest := p_phone_bucket_hmac;
        v_cap := 12;
      WHEN 'code' THEN
        v_digest := p_code_hmac;
        v_cap := 8;
    END CASE;

    INSERT INTO schoolnet_student_private.login_attempt_windows
      (scope, subject_digest, window_started_at, attempt_count,
       last_attempt_at)
    VALUES (v_scope, v_digest, v_window, 1, pg_catalog.now())
    ON CONFLICT (scope, subject_digest, window_started_at)
    DO UPDATE SET
      attempt_count = LEAST(
        schoolnet_student_private.login_attempt_windows.attempt_count + 1,
        1000000),
      last_attempt_at = pg_catalog.now()
    RETURNING attempt_count INTO v_count;

    IF v_count > v_cap THEN
      rate_allowed := FALSE;
      student_auth_user_id := NULL;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;

  rate_allowed := TRUE;
  SELECT identities.student_auth_user_id
    INTO student_auth_user_id
  FROM schoolnet_student_private.identities
  WHERE identities.schoolnet_code_hmac = p_code_hmac
    AND identities.family_phone_e164 = p_phone_e164
    AND identities.login_status = 'enabled'
    AND identities.activated_at IS NOT NULL
    AND identities.revoked_at IS NULL
  LIMIT 1;
  RETURN NEXT;
END;
$schoolnet_student_login_gate$;

REVOKE ALL ON FUNCTION public.schoolnet_student_login_gate(TEXT,TEXT,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.schoolnet_student_login_gate(TEXT,TEXT,TEXT,TEXT) TO service_role;

-- Final status recheck after Auth confirms the password; the Edge function
-- must also verify Auth user ID, app_metadata and the session.
CREATE FUNCTION public.schoolnet_student_login_enabled(
  p_student_auth_user_id UUID,
  p_phone_e164 TEXT,
  p_code_hmac TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $schoolnet_student_login_enabled$
  SELECT EXISTS(
    SELECT 1
    FROM schoolnet_student_private.identities AS i
    WHERE i.student_auth_user_id = p_student_auth_user_id
      AND i.family_phone_e164 = p_phone_e164
      AND i.schoolnet_code_hmac = p_code_hmac
      AND i.login_status = 'enabled'
      AND i.activated_at IS NOT NULL
      AND i.revoked_at IS NULL
  );
$schoolnet_student_login_enabled$;

REVOKE ALL ON FUNCTION public.schoolnet_student_login_enabled(UUID,TEXT,TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.schoolnet_student_login_enabled(UUID,TEXT,TEXT) TO service_role;

-- Audit without credential, school code, email, phone or IP.
CREATE FUNCTION public.schoolnet_student_login_audit(p_outcome TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $schoolnet_student_login_audit$
BEGIN
  IF p_outcome NOT IN ('rate_limited','denied','authenticated','server_error')
     OR p_outcome IS NULL THEN
    RAISE EXCEPTION 'Invalid login outcome' USING ERRCODE = '22023';
  END IF;
  INSERT INTO schoolnet_student_private.login_audit_events (outcome)
  VALUES (p_outcome);
END;
$schoolnet_student_login_audit$;

REVOKE ALL ON FUNCTION public.schoolnet_student_login_audit(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_student_login_audit(TEXT)
  TO service_role;

COMMENT ON FUNCTION public.schoolnet_student_login_gate(TEXT,TEXT,TEXT,TEXT)
  IS 'SANDBOX only: server-side atomic limiter plus private enabled identity lookup; do not expose to anon/authenticated.';
COMMENT ON TABLE schoolnet_student_private.login_attempt_windows
  IS 'SANDBOX only: keyed pseudonymous per-window counters, no raw IP/phone/code; cleanup policy to be added before production.';
COMMENT ON TABLE schoolnet_student_private.login_audit_events
  IS 'SANDBOX only: outcomes, timestamps, no credentials or personal identifiers.';
