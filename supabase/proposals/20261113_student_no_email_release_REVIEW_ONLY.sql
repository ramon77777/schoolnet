-- SCHOOLNET 5.C-B.2 / release proposal - NEVER AUTO DEPLOY.
-- REQUIRES a separate production change approval, backup, RLS audit and staging tests.
-- Production database: anttmbhaphkhmkoqsofd (NOT applied by this commit).
-- Works with existing public_enrollment_requests, schoolnet_family_invitation_records,
-- public_enrollment_request_resolutions and admin_finalize_public_enrollment_request.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- CRITICAL: previous self-update policy permits updates of role and child_ids.
-- RLS restricts the row, not the columns; protect both parent associations and roles.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, phone, avatar_url) ON TABLE public.profiles TO authenticated;
-- Existing SECURITY DEFINER RPCs update_my_personal_profile / set_my_profile_avatar
-- remain available. Other profile mutations continue via privileged admin paths.

CREATE SCHEMA IF NOT EXISTS schoolnet_student_private;
REVOKE ALL ON SCHEMA schoolnet_student_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA schoolnet_student_private TO service_role;

-- Stored in public solely for PostgREST's server-only table access; RLS forced.
CREATE TABLE public.schoolnet_student_no_email_requests (
  request_id UUID PRIMARY KEY REFERENCES public.public_enrollment_requests(id) ON DELETE RESTRICT,
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  student_auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  technical_email TEXT NOT NULL UNIQUE,
  family_phone_e164 TEXT NOT NULL CHECK (family_phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  student_code_hmac TEXT UNIQUE CHECK (student_code_hmac IS NULL OR student_code_hmac ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','auth_created','prepared','sent_declared','enabled','requires_review','revoked')),
  verification_note TEXT NOT NULL CHECK (length(btrim(verification_note)) BETWEEN 10 AND 1000),
  prepared_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  last_action_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sent_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_email_technical_alias_format_chk CHECK (
    technical_email = lower(btrim(technical_email))
    AND length(technical_email) BETWEEN 15 AND 254),
  CONSTRAINT no_email_complete_preparation_chk CHECK (
    status IN ('reserved','auth_created','requires_review')
    OR (student_auth_user_id IS NOT NULL AND student_code_hmac IS NOT NULL)),
  CONSTRAINT no_email_delivery_status_chk CHECK (
    status NOT IN ('sent_declared','enabled') OR sent_at IS NOT NULL),
  CONSTRAINT no_email_activation_status_chk CHECK (
    status <> 'enabled' OR activated_at IS NOT NULL)
);
CREATE INDEX schoolnet_student_no_email_parent_idx
 ON public.schoolnet_student_no_email_requests(parent_id);

CREATE FUNCTION schoolnet_student_private.guard_no_email_record()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $body$
BEGIN
 IF ROW(NEW.request_id,NEW.parent_id,NEW.technical_email,NEW.family_phone_e164,
        NEW.verification_note,NEW.prepared_by,NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.request_id,OLD.parent_id,OLD.technical_email,OLD.family_phone_e164,
        OLD.verification_note,OLD.prepared_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Immutable student identity reservation' USING ERRCODE='23514'; END IF;
 IF OLD.student_auth_user_id IS NOT NULL
    AND NEW.student_auth_user_id IS DISTINCT FROM OLD.student_auth_user_id
 THEN RAISE EXCEPTION 'Immutable Auth identity' USING ERRCODE='23514'; END IF;
 IF OLD.student_code_hmac IS NOT NULL
    AND NEW.student_code_hmac IS DISTINCT FROM OLD.student_code_hmac
 THEN RAISE EXCEPTION 'Immutable code digest; manual review required' USING ERRCODE='23514'; END IF;
 IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at
 THEN RAISE EXCEPTION 'Delivery record immutable' USING ERRCODE='23514'; END IF;
 IF OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at
 THEN RAISE EXCEPTION 'Activation timestamp immutable' USING ERRCODE='23514'; END IF;
 IF (OLD.status='reserved' AND NEW.status NOT IN ('reserved','auth_created','requires_review'))
 OR (OLD.status='auth_created' AND NEW.status NOT IN ('auth_created','prepared','requires_review'))
 OR (OLD.status='prepared' AND NEW.status NOT IN ('prepared','sent_declared','requires_review'))
 OR (OLD.status='sent_declared' AND NEW.status NOT IN ('sent_declared','enabled','requires_review'))
 OR (OLD.status='enabled' AND NEW.status NOT IN ('enabled','revoked'))
 OR (OLD.status='requires_review' AND NEW.status<>'requires_review')
 OR (OLD.status='revoked' AND NEW.status<>'revoked')
 THEN RAISE EXCEPTION 'Forbidden student invitation status transition' USING ERRCODE='23514'; END IF;
 NEW.updated_at=pg_catalog.now();
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION schoolnet_student_private.guard_no_email_record() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_student_private.guard_no_email_record() TO service_role;
CREATE TRIGGER schoolnet_student_no_email_record_guard
 BEFORE UPDATE ON public.schoolnet_student_no_email_requests
 FOR EACH ROW EXECUTE FUNCTION schoolnet_student_private.guard_no_email_record();

ALTER TABLE public.schoolnet_student_no_email_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_student_no_email_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schoolnet_student_no_email_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.schoolnet_student_no_email_requests TO service_role;

CREATE TABLE schoolnet_student_private.login_attempt_windows (
 scope TEXT NOT NULL CHECK (scope IN ('global','ip','phone','code')),
 subject_digest TEXT NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
 window_started_at TIMESTAMPTZ NOT NULL,
 attempt_count INTEGER NOT NULL CHECK (attempt_count BETWEEN 1 AND 1000000),
 last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,subject_digest,window_started_at)
);
ALTER TABLE schoolnet_student_private.login_attempt_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_student_private.login_attempt_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_student_private.login_attempt_windows FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON schoolnet_student_private.login_attempt_windows TO service_role;

CREATE TABLE schoolnet_student_private.login_audit (
 event_id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 outcome TEXT NOT NULL CHECK (outcome IN ('denied','rate_limited','authenticated','server_error')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE schoolnet_student_private.login_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_student_private.login_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON schoolnet_student_private.login_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT ON schoolnet_student_private.login_audit TO service_role;

-- Caller is a privileged server role only. Does not accept or store passwords.
CREATE FUNCTION public.schoolnet_no_email_login_gate(
 p_phone_e164 TEXT,p_code_hmac TEXT,p_phone_bucket_hmac TEXT,p_ip_bucket_hmac TEXT)
RETURNS TABLE(rate_allowed BOOLEAN, student_auth_user_id UUID)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $body$
DECLARE
 w TIMESTAMPTZ:=pg_catalog.to_timestamp((floor(extract(epoch from pg_catalog.clock_timestamp())/900)*900)::double precision);
 s TEXT; d TEXT; cap INTEGER; n INTEGER;
BEGIN
 IF p_phone_e164 IS NULL OR p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$'
 OR p_code_hmac IS NULL OR p_code_hmac !~ '^[0-9a-f]{64}$'
 OR p_phone_bucket_hmac IS NULL OR p_phone_bucket_hmac !~ '^[0-9a-f]{64}$'
 OR p_ip_bucket_hmac IS NULL OR p_ip_bucket_hmac !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'Invalid server login input' USING ERRCODE='22023'; END IF;
 FOREACH s IN ARRAY ARRAY['global','ip','phone','code'] LOOP
  CASE s
   WHEN 'global' THEN d:=repeat('0',64); cap:=150;
   WHEN 'ip' THEN d:=p_ip_bucket_hmac; cap:=25;
   WHEN 'phone' THEN d:=p_phone_bucket_hmac; cap:=12;
   WHEN 'code' THEN d:=p_code_hmac; cap:=8;
  END CASE;
  INSERT INTO schoolnet_student_private.login_attempt_windows
   (scope,subject_digest,window_started_at,attempt_count,last_attempt_at)
  VALUES (s,d,w,1,pg_catalog.now())
  ON CONFLICT(scope,subject_digest,window_started_at)
  DO UPDATE SET attempt_count=LEAST(
    schoolnet_student_private.login_attempt_windows.attempt_count+1,1000000),
    last_attempt_at=pg_catalog.now()
  RETURNING attempt_count INTO n;
  IF n>cap THEN rate_allowed:=false;student_auth_user_id:=NULL;RETURN NEXT;RETURN;END IF;
 END LOOP;
 rate_allowed:=true;
 SELECT i.student_auth_user_id INTO student_auth_user_id
 FROM public.schoolnet_student_no_email_requests i
 WHERE i.student_code_hmac=p_code_hmac AND i.family_phone_e164=p_phone_e164
  AND i.status IN ('sent_declared','enabled')
 LIMIT 1;
 RETURN NEXT;
END;
$body$;
REVOKE ALL ON FUNCTION public.schoolnet_no_email_login_gate(TEXT,TEXT,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_no_email_login_gate(TEXT,TEXT,TEXT,TEXT) TO service_role;

-- Invoked ONLY after Supabase Auth has verified the password and access token.
CREATE FUNCTION public.schoolnet_no_email_activate_after_password(
 p_user_id UUID,p_phone_e164 TEXT,p_code_hmac TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $body$
DECLARE changed INTEGER;
BEGIN
 UPDATE public.schoolnet_student_no_email_requests i
 SET status='enabled',activated_at=pg_catalog.now()
 WHERE i.student_auth_user_id=p_user_id AND i.family_phone_e164=p_phone_e164
  AND i.student_code_hmac=p_code_hmac AND i.status='sent_declared'
  AND i.sent_at IS NOT NULL AND i.activated_at IS NULL;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed=1;
END;
$body$;
REVOKE ALL ON FUNCTION public.schoolnet_no_email_activate_after_password(UUID,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_no_email_activate_after_password(UUID,TEXT,TEXT) TO service_role;

CREATE FUNCTION public.schoolnet_no_email_login_enabled(
 p_user_id UUID,p_phone_e164 TEXT,p_code_hmac TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog
AS $body$
 SELECT EXISTS(SELECT 1 FROM public.schoolnet_student_no_email_requests i
 WHERE i.student_auth_user_id=p_user_id AND i.family_phone_e164=p_phone_e164
 AND i.student_code_hmac=p_code_hmac AND i.status='enabled' AND i.activated_at IS NOT NULL);
$body$;
REVOKE ALL ON FUNCTION public.schoolnet_no_email_login_enabled(UUID,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_no_email_login_enabled(UUID,TEXT,TEXT) TO service_role;

CREATE FUNCTION public.schoolnet_no_email_login_audit(p_outcome TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $body$
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('denied','rate_limited','authenticated','server_error')
 THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
 INSERT INTO schoolnet_student_private.login_audit(outcome) VALUES(p_outcome);
END;
$body$;
REVOKE ALL ON FUNCTION public.schoolnet_no_email_login_audit(TEXT)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_no_email_login_audit(TEXT) TO service_role;

-- A session obtained from a recovery/invite link MUST NOT unlock school pages.
-- SECURITY DEFINER bypass is limited to one boolean tied to auth.uid().
CREATE FUNCTION public.schoolnet_no_email_my_session_enabled()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $body$
 SELECT EXISTS(SELECT 1 FROM public.schoolnet_student_no_email_requests i
  WHERE i.student_auth_user_id=(SELECT auth.uid())
   AND i.status='enabled' AND i.activated_at IS NOT NULL);
$body$;
REVOKE ALL ON FUNCTION public.schoolnet_no_email_my_session_enabled() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_no_email_my_session_enabled() TO authenticated;

-- Finalization writes parent_links and profiles.child_ids BEFORE the resolution;
-- protect all three paths. Existing non-no-email students are unaffected.
CREATE FUNCTION schoolnet_student_private.require_activated_before_parent_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.schoolnet_student_no_email_requests i
   WHERE (i.request_id=NEW.request_id OR i.student_auth_user_id=NEW.student_id)
     AND (
       i.status<>'enabled' OR i.activated_at IS NULL
       OR (i.request_id=NEW.request_id AND
          (i.student_auth_user_id IS DISTINCT FROM NEW.student_id
           OR i.parent_id IS DISTINCT FROM NEW.parent_id))
     )
 ) THEN
   RAISE EXCEPTION 'Student must complete password login before family finalization'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION schoolnet_student_private.require_activated_before_parent_link()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER schoolnet_student_no_email_resolution_guard
 BEFORE INSERT OR UPDATE ON public.public_enrollment_request_resolutions FOR EACH ROW
 EXECUTE FUNCTION schoolnet_student_private.require_activated_before_parent_link();

-- Independently protect direct admin writes to parent_links.
CREATE FUNCTION schoolnet_student_private.guard_no_email_parent_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.schoolnet_student_no_email_requests i
   WHERE i.student_auth_user_id=NEW.student_id
     AND (i.status<>'enabled' OR i.activated_at IS NULL)
 ) THEN
   RAISE EXCEPTION 'Unactivated no-email student cannot be linked'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION schoolnet_student_private.guard_no_email_parent_links()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER schoolnet_student_no_email_parent_links_guard
 BEFORE INSERT OR UPDATE ON public.parent_links FOR EACH ROW
 EXECUTE FUNCTION schoolnet_student_private.guard_no_email_parent_links();

-- Legacy features also read profiles.child_ids. Reject newly added pending IDs,
-- preserving existing parent relationships unchanged.
CREATE FUNCTION schoolnet_student_private.guard_no_email_child_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
BEGIN
 IF NEW.child_ids IS DISTINCT FROM OLD.child_ids
    AND EXISTS (
      SELECT 1 FROM public.schoolnet_student_no_email_requests i
      WHERE i.student_auth_user_id=ANY(COALESCE(NEW.child_ids, ARRAY[]::uuid[]))
        AND NOT (i.student_auth_user_id=ANY(COALESCE(OLD.child_ids, ARRAY[]::uuid[])))
        AND (i.status<>'enabled' OR i.activated_at IS NULL)
    )
 THEN
   RAISE EXCEPTION 'Unactivated no-email student cannot be added to child_ids'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$body$;
REVOKE ALL ON FUNCTION schoolnet_student_private.guard_no_email_child_ids()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER schoolnet_student_no_email_child_ids_guard
 BEFORE UPDATE OF child_ids ON public.profiles FOR EACH ROW
 EXECUTE FUNCTION schoolnet_student_private.guard_no_email_child_ids();

-- Check defense after DDL, without reading or changing family data.
DO $verify$
BEGIN
 IF has_column_privilege('authenticated','public.profiles','role','UPDATE')
 OR has_column_privilege('authenticated','public.profiles','child_ids','UPDATE')
 OR has_column_privilege('anon','public.profiles','role','UPDATE')
 OR has_column_privilege('anon','public.profiles','child_ids','UPDATE')
 OR NOT has_column_privilege('authenticated','public.profiles','full_name','UPDATE')
 OR NOT has_column_privilege('authenticated','public.profiles','phone','UPDATE')
 OR NOT has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE')
 OR has_table_privilege('anon','public.schoolnet_student_no_email_requests','SELECT')
 OR has_table_privilege('authenticated','public.schoolnet_student_no_email_requests','SELECT')
 OR has_function_privilege('anon','public.schoolnet_no_email_login_gate(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.schoolnet_no_email_login_gate(text,text,text,text)','EXECUTE')
 OR has_schema_privilege('anon','schoolnet_student_private','USAGE')
 OR has_schema_privilege('authenticated','schoolnet_student_private','USAGE')
 THEN RAISE EXCEPTION 'SECURITY_CHECK_FAILED'; END IF;
END;
$verify$;
COMMIT;