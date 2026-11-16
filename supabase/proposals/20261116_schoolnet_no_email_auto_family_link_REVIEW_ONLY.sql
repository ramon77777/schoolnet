-- SCHOOLNET / Lot 5.C-B.2 - REVIEW ONLY. Not executed in production.
-- Target: supabase project anttmbhaphkhmkoqsofd.
-- Triggered ONLY after the Auth-verified first sign-in changes
-- schoolnet_student_no_email_requests: sent_declared -> enabled.
-- Atomic: if parent identity/link checks fail, activation UPDATE is rolled back.
-- No annual school enrollment is created and no existing family is rewritten.
--
-- Prerequisites: existing private schema, no-email guards, parent_links unique key.
-- Activation of this proposal requires a separate migration/deployment review.
BEGIN;

CREATE OR REPLACE FUNCTION schoolnet_student_private.link_verified_no_email_family_after_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $schoolnet_autolink$
DECLARE
  v_relation text;
  v_count integer;
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.status IS DISTINCT FROM 'sent_declared'
     OR NEW.status IS DISTINCT FROM 'enabled' THEN
    RETURN NEW;
  END IF;

  IF NEW.request_id IS NULL OR NEW.parent_id IS NULL
     OR NEW.student_auth_user_id IS NULL OR NEW.activated_at IS NULL
     OR NEW.sent_at IS NULL OR NEW.parent_id=NEW.student_auth_user_id THEN
    RAISE EXCEPTION 'SCHOOLNET_AUTOLINK_INVALID_RESERVATION' USING ERRCODE='23514';
  END IF;

  -- Parent identity and activated invitation are validated from immutable,
  -- server-controlled records, never user_metadata or browser assertions.
  SELECT r.guardian_relationship INTO v_relation
  FROM public.public_enrollment_requests AS r
  JOIN public.schoolnet_family_invitation_records AS f
    ON f.request_id=r.id
   AND f.recipient='parent'
   AND f.user_id=NEW.parent_id
   AND f.status='activated'
  JOIN public.profiles AS parent ON parent.id=NEW.parent_id
   AND parent.role::text='parent'
  JOIN public.profiles AS student ON student.id=NEW.student_auth_user_id
   AND student.role::text='student'
  JOIN auth.users AS parent_auth ON parent_auth.id=NEW.parent_id
  JOIN auth.users AS student_auth ON student_auth.id=NEW.student_auth_user_id
  WHERE r.id=NEW.request_id
    AND r.request_type='student_enrollment'
    AND r.status<>'rejected'
    AND r.student_email IS NULL
    AND r.guardian_email IS NOT NULL
    AND pg_catalog.lower(pg_catalog.btrim(r.guardian_email))
        =pg_catalog.lower(pg_catalog.btrim(parent_auth.email))
    AND pg_catalog.lower(pg_catalog.btrim(f.email))
        =pg_catalog.lower(pg_catalog.btrim(parent_auth.email))
    AND parent_auth.email_confirmed_at IS NOT NULL
    AND student_auth.email_confirmed_at IS NOT NULL
    AND student_auth.email=NEW.technical_email
    AND parent_auth.raw_app_meta_data->>'schoolnet_family_invitation'='true'
    AND student_auth.raw_app_meta_data->>'schoolnet_no_email_student'='true'
  FOR UPDATE OF r,parent,student;

  IF NOT FOUND OR v_relation NOT IN ('father','mother','guardian') THEN
    RAISE EXCEPTION 'SCHOOLNET_AUTOLINK_PARENT_NOT_VERIFIED' USING ERRCODE='23514';
  END IF;

  -- Reject any preexisting relationship with a different parent.
  IF EXISTS(
    SELECT 1 FROM public.parent_links l
    WHERE l.student_id=NEW.student_auth_user_id AND l.parent_id<>NEW.parent_id
  ) OR EXISTS(
    SELECT 1 FROM public.profiles p
    WHERE p.role::text='parent' AND p.id<>NEW.parent_id
      AND NEW.student_auth_user_id=ANY(COALESCE(p.child_ids,ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_AUTOLINK_FAMILY_CONFLICT' USING ERRCODE='23514';
  END IF;

  -- Both records are written within the same transaction that activates the
  -- student; guard triggers on these tables continue to enforce role/status.
  INSERT INTO public.parent_links(parent_id,student_id,relation_type)
  VALUES (NEW.parent_id,NEW.student_auth_user_id,v_relation)
  ON CONFLICT(parent_id,student_id) DO NOTHING;

  UPDATE public.profiles p
  SET child_ids=pg_catalog.array_append(COALESCE(p.child_ids,ARRAY[]::uuid[]),
                                         NEW.student_auth_user_id)
  WHERE p.id=NEW.parent_id AND p.role::text='parent'
    AND NOT NEW.student_auth_user_id=ANY(COALESCE(p.child_ids,ARRAY[]::uuid[]));

  SELECT count(*) INTO v_count FROM public.parent_links l
  WHERE l.parent_id=NEW.parent_id AND l.student_id=NEW.student_auth_user_id;
  IF v_count<>1 OR NOT EXISTS(
    SELECT 1 FROM public.profiles p WHERE p.id=NEW.parent_id
      AND NEW.student_auth_user_id=ANY(COALESCE(p.child_ids,ARRAY[]::uuid[]))
  ) THEN
    RAISE EXCEPTION 'SCHOOLNET_AUTOLINK_INCOMPLETE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$schoolnet_autolink$;

REVOKE ALL ON FUNCTION schoolnet_student_private.link_verified_no_email_family_after_activation()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS schoolnet_student_no_email_autolink_family_after_activation
  ON public.schoolnet_student_no_email_requests;

CREATE TRIGGER schoolnet_student_no_email_autolink_family_after_activation
AFTER UPDATE OF status ON public.schoolnet_student_no_email_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status='enabled')
EXECUTE FUNCTION schoolnet_student_private.link_verified_no_email_family_after_activation();

COMMIT;
