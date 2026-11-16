-- SCHOOLNET 5.C : second (or further) child for one existing Parent.
-- SANDBOX ACCEPTANCE, REVIEW ONLY; NOT a production migration.
-- This entire script is intentionally guarded by synthetic sandbox baseline:
-- remove this preflight ONLY after a separate production architecture review.
-- Does not create or send any new Parent invitation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='50s';
DO $guard$
BEGIN
 IF (SELECT count(*) FROM auth.users)<>19
 OR (SELECT count(*) FROM public.public_enrollment_requests)<>7
 OR (SELECT count(*) FROM public.parent_links)<>2
 OR NOT EXISTS(SELECT 1 FROM public.public_enrollment_requests
               WHERE reference='DEM-L5C-SBX-TEST01')
 OR to_regclass('public.schoolnet_sibling_parent_approvals') IS NOT NULL
 OR to_regprocedure('schoolnet_student_private.link_verified_no_email_family_after_activation()') IS NULL
 THEN RAISE EXCEPTION 'SCHOOLNET_SIBLING_SANDBOX_ONLY_PREFLIGHT_FAILED';
 END IF;
END $guard$;

CREATE TABLE public.schoolnet_sibling_parent_approvals (
 request_id uuid PRIMARY KEY
    REFERENCES public.public_enrollment_requests(id) ON DELETE RESTRICT,
 parent_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
 verified_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
 guardian_relationship text NOT NULL
    CHECK(guardian_relationship IN ('father','mother','guardian')),
 verification_note text NOT NULL
    CHECK(char_length(pg_catalog.btrim(verification_note)) BETWEEN 10 AND 1000),
 verified_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
 CONSTRAINT schoolnet_sibling_verified_at_not_future
   CHECK(verified_at<=pg_catalog.now())
);
CREATE INDEX schoolnet_sibling_parent_approvals_parent_idx
 ON public.schoolnet_sibling_parent_approvals(parent_id);
ALTER TABLE public.schoolnet_sibling_parent_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schoolnet_sibling_parent_approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.schoolnet_sibling_parent_approvals
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.schoolnet_sibling_parent_approvals TO service_role;

-- Admin proof can only be added after the Parent is genuinely activated and
-- has already one child linked. Any later mutation of a proof is forbidden.
CREATE FUNCTION schoolnet_student_private.guard_sibling_parent_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $proof$
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'SCHOOLNET_SIBLING_PROOF_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.public_enrollment_requests AS req
  JOIN public.profiles AS parent ON parent.id=NEW.parent_id
     AND parent.role::text='parent'
  JOIN public.profiles AS admin ON admin.id=NEW.verified_by
     AND admin.role::text='admin'
  JOIN auth.users AS parent_auth ON parent_auth.id=NEW.parent_id
  WHERE req.id=NEW.request_id AND req.request_type='student_enrollment'
    AND req.status<>'rejected' AND req.student_email IS NULL
    AND req.guardian_relationship=NEW.guardian_relationship
    AND req.guardian_email IS NOT NULL
    AND pg_catalog.lower(pg_catalog.btrim(req.guardian_email))
        =pg_catalog.lower(pg_catalog.btrim(parent_auth.email))
    AND parent_auth.email_confirmed_at IS NOT NULL
    AND parent_auth.raw_app_meta_data->>'schoolnet_family_invitation'='true'
    AND EXISTS (
     SELECT 1 FROM public.schoolnet_family_invitation_records AS inv
     JOIN public.public_enrollment_requests AS old_req
       ON old_req.id=inv.request_id AND old_req.status<>'rejected'
     WHERE inv.user_id=NEW.parent_id AND inv.recipient='parent'
       AND inv.expected_role='parent' AND inv.status='activated'
       AND pg_catalog.lower(pg_catalog.btrim(inv.email))
           =pg_catalog.lower(pg_catalog.btrim(parent_auth.email))
    )
    AND EXISTS (
     SELECT 1 FROM public.parent_links AS prior
     WHERE prior.parent_id=NEW.parent_id
    )
 ) THEN
  RAISE EXCEPTION 'SCHOOLNET_SIBLING_PARENT_APPROVAL_NOT_VERIFIED'
    USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$proof$;
REVOKE ALL ON FUNCTION schoolnet_student_private.guard_sibling_parent_approval()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER schoolnet_sibling_approval_guard
 BEFORE INSERT OR UPDATE OR DELETE ON public.schoolnet_sibling_parent_approvals
 FOR EACH ROW EXECUTE FUNCTION schoolnet_student_private.guard_sibling_parent_approval();

-- Alter just the private trigger function. The existing activation trigger
-- stays enabled and keeps same-request invitations supported for first child.
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
    AND (
      -- First child: per-request invitation already activated.
      EXISTS (
        SELECT 1 FROM public.schoolnet_family_invitation_records AS inv
        WHERE inv.request_id=NEW.request_id AND inv.recipient='parent'
          AND inv.expected_role='parent' AND inv.status='activated'
          AND inv.user_id=NEW.parent_id
          AND pg_catalog.lower(pg_catalog.btrim(inv.email))
              =pg_catalog.lower(pg_catalog.btrim(parent_auth.email))
      )
      OR
      -- Next child: separate, immutable Admin verification of THIS child's
      -- request + proof of an already active Parent invitation/account.
      (
        EXISTS (
          SELECT 1 FROM public.schoolnet_sibling_parent_approvals AS approval
          WHERE approval.request_id=NEW.request_id AND approval.parent_id=NEW.parent_id
            AND approval.guardian_relationship=r.guardian_relationship
        )
        AND EXISTS (
          SELECT 1 FROM public.schoolnet_family_invitation_records AS existing
          JOIN public.public_enrollment_requests AS old_request
             ON old_request.id=existing.request_id
            AND old_request.status<>'rejected'
          WHERE existing.recipient='parent' AND existing.expected_role='parent'
            AND existing.user_id=NEW.parent_id AND existing.status='activated'
            AND pg_catalog.lower(pg_catalog.btrim(existing.email))
                =pg_catalog.lower(pg_catalog.btrim(parent_auth.email))
        )
        AND EXISTS (
          SELECT 1 FROM public.parent_links AS prior_link
          WHERE prior_link.parent_id=NEW.parent_id
            AND prior_link.student_id<>NEW.student_auth_user_id
        )
      )
    )
    AND parent_auth.email_confirmed_at IS NOT NULL
    AND student_auth.email_confirmed_at IS NOT NULL
    AND student_auth.email=NEW.technical_email
    AND parent_auth.raw_app_meta_data->>'schoolnet_family_invitation'='true'
    AND student_auth.raw_app_meta_data->>'schoolnet_no_email_student'='true'
    AND student_auth.raw_app_meta_data->>'schoolnet_no_email_request_id'
        =NEW.request_id::text
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
 FROM PUBLIC,anon,authenticated,service_role;
DO $check$
BEGIN
 IF pg_catalog.has_table_privilege('anon','public.schoolnet_sibling_parent_approvals','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.schoolnet_sibling_parent_approvals','INSERT')
 OR NOT pg_catalog.has_table_privilege('service_role','public.schoolnet_sibling_parent_approvals','INSERT')
 OR (SELECT count(*) FROM public.schoolnet_sibling_parent_approvals)<>0
 THEN RAISE EXCEPTION 'SCHOOLNET_SIBLING_SANDBOX_POSTCHECK_FAILED';
 END IF;
END $check$;
COMMIT;
