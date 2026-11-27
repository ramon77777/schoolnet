-- SCHOOLNET V2 / S4-D.3k / DISPOSABLE SUPABASE ONLY.
-- NEVER apply this file to Supabase principal; NOT a migration.
-- This is the first executable BACKEND vertical slice:
-- case -> submission -> administrative decision -> publication authorization.
-- Final PDF emission is NOT implemented and publication_executed is DENIED.
-- Preconditions: C3-C3 kernel / RPC and S4-D.3b preview in LOCAL Supabase.

DO $preflight$
BEGIN
 IF to_regprocedure('auth.uid()') IS NULL
  OR to_regprocedure('schoolnet_private.school_report_card_preview(uuid,uuid,uuid,uuid)') IS NULL
  OR to_regclass('public.schoolnet_school_memberships') IS NULL
  OR to_regclass('schoolnet_private.school_bulletin_v2_cases') IS NOT NULL
 THEN
  RAISE EXCEPTION 'S4D3K_LOCAL_ONLY_PREFLIGHT_FAILED';
 END IF;
END $preflight$;

CREATE TABLE schoolnet_private.school_bulletin_v2_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id),
 revision text NOT NULL CHECK(length(revision) BETWEEN 1 AND 100),
 required_fields jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK(jsonb_typeof(required_fields)='array'),
 status text NOT NULL CHECK(status IN ('draft','approved','withdrawn')),
 approved_at timestamptz,
 UNIQUE(school_id,id),
 UNIQUE(school_id,school_year_id,class_id,period_id,revision),
 CHECK (status<>'approved' OR approved_at IS NOT NULL)
);
CREATE UNIQUE INDEX s4d3k_one_active_policy
 ON schoolnet_private.school_bulletin_v2_policy_versions
 (school_id,school_year_id,class_id,period_id) WHERE status='approved';

CREATE TABLE schoolnet_private.school_bulletin_v2_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 user_id uuid NOT NULL REFERENCES public.profiles(id),
 capability text NOT NULL CHECK (capability IN
  ('submit','decide','authorize_publication','execute_publication','withdraw')),
 valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,
 mandate_verified boolean NOT NULL DEFAULT false,
 revoked_at timestamptz,
 UNIQUE(school_id,id),
 CHECK(valid_from < valid_until)
);
CREATE INDEX s4d3k_active_grants ON schoolnet_private.school_bulletin_v2_grants
 (school_id,user_id,capability,valid_until);

CREATE TABLE schoolnet_private.school_bulletin_v2_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 policy_id uuid NOT NULL,
 source_projection jsonb NOT NULL,
 source_digest text NOT NULL CHECK(source_digest ~ '^[0-9a-f]{64}$'),
 captured_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 FOREIGN KEY(school_id,policy_id)
  REFERENCES schoolnet_private.school_bulletin_v2_policy_versions(school_id,id)
);
CREATE INDEX s4d3k_snapshot_scope ON schoolnet_private.school_bulletin_v2_snapshots
 (school_id,school_year_id,class_id,period_id,student_id);

CREATE TABLE schoolnet_private.school_bulletin_v2_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 school_year_id uuid NOT NULL REFERENCES public.school_years(id),
 class_id uuid NOT NULL REFERENCES public.classes(id),
 period_id uuid NOT NULL REFERENCES schoolnet_private.school_grading_periods(id),
 student_id uuid NOT NULL REFERENCES public.profiles(id),
 snapshot_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN
 ('draft','submitted','correction_requested','refused','approved',
 'authorized_for_publication','published','withdrawn')),
 requester_id uuid,
 approver_id uuid,
 publication_authorizer_id uuid,
 row_version integer NOT NULL DEFAULT 1 CHECK(row_version>0),
 open_key text NOT NULL CHECK(length(open_key) BETWEEN 8 AND 128),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,id),
 UNIQUE(school_id,school_year_id,class_id,period_id,student_id),
 FOREIGN KEY(school_id,snapshot_id)
  REFERENCES schoolnet_private.school_bulletin_v2_snapshots(school_id,id)
);
CREATE INDEX s4d3k_case_scope ON schoolnet_private.school_bulletin_v2_cases
 (school_id,school_year_id,class_id,period_id);

CREATE TABLE schoolnet_private.school_bulletin_v2_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 case_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES public.profiles(id),
 action text NOT NULL CHECK(action IN
 ('case_opened','review_submitted','correction_requested','approval_refused',
  'approval_granted','publication_authorized','publication_executed',
  'publication_revoked')),
 from_state text NOT NULL,
 to_state text NOT NULL,
 from_version integer NOT NULL CHECK(from_version>=0),
 to_version integer NOT NULL CHECK(to_version>0),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(case_id,idempotency_key),
 FOREIGN KEY(school_id,case_id)
  REFERENCES schoolnet_private.school_bulletin_v2_cases(school_id,id)
);
CREATE INDEX s4d3k_event_history ON schoolnet_private.school_bulletin_v2_events
 (school_id,case_id,created_at,id);

CREATE TABLE schoolnet_private.school_bulletin_v2_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 school_id uuid NOT NULL REFERENCES public.schoolnet_schools(id),
 case_id uuid NOT NULL,
 artifact_ref text NOT NULL,
 artifact_digest text NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 withdrawn_at timestamptz,
 FOREIGN KEY(school_id,case_id)
  REFERENCES schoolnet_private.school_bulletin_v2_cases(school_id,id),
 UNIQUE(school_id,case_id)
);

-- Defense in depth, including non-exposed schema.
ALTER TABLE schoolnet_private.school_bulletin_v2_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_bulletin_v2_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_bulletin_v2_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_bulletin_v2_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_bulletin_v2_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE schoolnet_private.school_bulletin_v2_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 schoolnet_private.school_bulletin_v2_policy_versions,
 schoolnet_private.school_bulletin_v2_grants,
 schoolnet_private.school_bulletin_v2_snapshots,
 schoolnet_private.school_bulletin_v2_cases,
 schoolnet_private.school_bulletin_v2_events,
 schoolnet_private.school_bulletin_v2_publications
 FROM PUBLIC, anon, authenticated;

-- Even the local postgres owner should not casually rewrite audit/snapshots.
CREATE FUNCTION schoolnet_private.s4d3k_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $guard$
BEGIN
 RAISE EXCEPTION 'S4D3K_IMMUTABLE_%',TG_TABLE_NAME USING ERRCODE='42501';
END $guard$;
REVOKE ALL ON FUNCTION schoolnet_private.s4d3k_immutable()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER s4d3k_snapshot_no_mutation
 BEFORE UPDATE OR DELETE ON schoolnet_private.school_bulletin_v2_snapshots
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.s4d3k_immutable();
CREATE TRIGGER s4d3k_events_no_mutation
 BEFORE UPDATE OR DELETE ON schoolnet_private.school_bulletin_v2_events
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.s4d3k_immutable();
CREATE TRIGGER s4d3k_policy_no_mutation
 BEFORE UPDATE OR DELETE ON schoolnet_private.school_bulletin_v2_policy_versions
 FOR EACH ROW EXECUTE FUNCTION schoolnet_private.s4d3k_immutable();

-- All policy/grant fixture creation is by local postgres only, NEVER JWT.

CREATE FUNCTION public.schoolnet_bulletin_v2_prototype_open_case(
 p_school_id uuid, p_period_id uuid, p_class_id uuid, p_student_id uuid,
 p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog
AS $open$
DECLARE
 v_actor uuid := auth.uid();
 v_projection jsonb;
 v_year uuid;
 v_policy schoolnet_private.school_bulletin_v2_policy_versions%ROWTYPE;
 v_case schoolnet_private.school_bulletin_v2_cases%ROWTYPE;
 v_snapshot_id uuid;
 v_digest text;
BEGIN
 IF v_actor IS NULL OR p_school_id IS NULL OR p_period_id IS NULL
  OR p_class_id IS NULL OR p_student_id IS NULL
  OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 128
 THEN
  RAISE EXCEPTION 'S4D3K_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN public.schoolnet_school_memberships m ON m.user_id=p.id
  JOIN public.schoolnet_schools s ON s.id=m.school_id
  WHERE p.id=v_actor AND p.role::text='school_admin'
   AND m.member_role='school_admin' AND m.school_id=p_school_id
   AND m.status='active' AND m.revoked_at IS NULL AND s.status='active'
 ) OR NOT EXISTS (
  SELECT 1 FROM schoolnet_private.school_bulletin_v2_grants g
  WHERE g.user_id=v_actor AND g.school_id=p_school_id
   AND g.capability='submit' AND g.mandate_verified
   AND g.revoked_at IS NULL AND g.valid_from<=now() AND g.valid_until>now()
 ) THEN
  RAISE EXCEPTION 'S4D3K_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 -- Private S4-D.3b kernel ALSO rechecks JWT, school, class, period and student.
 v_projection := schoolnet_private.school_report_card_preview(
  p_school_id,p_period_id,p_class_id,p_student_id);
 IF v_projection->>'projection'<>'schoolnet_v2_report_card_provisional_v1'
  OR v_projection->>'state'<>'ready'
  OR v_projection->'averageOn20' IS NULL
  OR v_projection->'averageOn20'='null'::jsonb
  OR COALESCE((v_projection->>'readySubjects')::integer,0)<1
  OR (v_projection->>'readySubjects') IS DISTINCT FROM
     (v_projection->>'expectedSubjects')
  OR v_projection->>'previewOnly'<>'true'
 THEN
  RAISE EXCEPTION 'S4D3K_INCOMPLETE_BULLETIN' USING ERRCODE='42501';
 END IF;
 v_year:=(v_projection->>'schoolYearId')::uuid;
 SELECT * INTO v_policy FROM schoolnet_private.school_bulletin_v2_policy_versions
 WHERE school_id=p_school_id AND school_year_id=v_year
  AND class_id=p_class_id AND period_id=p_period_id AND status='approved'
 FOR SHARE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'S4D3K_POLICY_NOT_APPROVED' USING ERRCODE='42501';
 END IF;
 -- For the disposable fixture, the school has explicitly approved a policy
 -- with no additional fields. Real schools must approve their applicable rules.
 IF v_policy.required_fields<>'[]'::jsonb THEN
  RAISE EXCEPTION 'S4D3K_MENTIONS_NOT_YET_IMPLEMENTED' USING ERRCODE='42501';
 END IF;
 v_digest:=encode(sha256(convert_to(v_projection::text,'UTF8')),'hex');

 -- Idempotent open case; no second snapshot or initial event for retries.
 SELECT * INTO v_case
 FROM schoolnet_private.school_bulletin_v2_cases
 WHERE school_id=p_school_id AND school_year_id=v_year
  AND class_id=p_class_id AND period_id=p_period_id AND student_id=p_student_id;
 IF FOUND THEN
  IF v_case.open_key<>p_idempotency_key THEN
   RAISE EXCEPTION 'S4D3K_CASE_EXISTS' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('caseId',v_case.id,'state',v_case.state,
    'version',v_case.row_version,'replayed',true);
 END IF;

 INSERT INTO schoolnet_private.school_bulletin_v2_snapshots(
  school_id,school_year_id,class_id,period_id,student_id,
  policy_id,source_projection,source_digest
 ) VALUES (p_school_id,v_year,p_class_id,p_period_id,p_student_id,
  v_policy.id,v_projection,v_digest)
 RETURNING id INTO v_snapshot_id;
 INSERT INTO schoolnet_private.school_bulletin_v2_cases(
  school_id,school_year_id,class_id,period_id,student_id,
  snapshot_id,open_key
 ) VALUES (p_school_id,v_year,p_class_id,p_period_id,p_student_id,
  v_snapshot_id,p_idempotency_key) RETURNING * INTO v_case;
 INSERT INTO schoolnet_private.school_bulletin_v2_events(
  school_id,case_id,actor_id,action,from_state,to_state,
  from_version,to_version,idempotency_key
 ) VALUES (p_school_id,v_case.id,v_actor,'case_opened','none','draft',
  0,1,p_idempotency_key);
 RETURN jsonb_build_object('caseId',v_case.id,'state','draft',
  'version',1,'replayed',false);
END $open$;

CREATE FUNCTION public.schoolnet_bulletin_v2_prototype_transition(
 p_case_id uuid, p_action text, p_expected_version integer,
 p_idempotency_key text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog
AS $transition$
DECLARE
 v_actor uuid := auth.uid();
 v_case schoolnet_private.school_bulletin_v2_cases%ROWTYPE;
 v_snapshot schoolnet_private.school_bulletin_v2_snapshots%ROWTYPE;
 v_old schoolnet_private.school_bulletin_v2_events%ROWTYPE;
 v_projection jsonb;
 v_next text;
 v_required_cap text;
 v_digest text;
BEGIN
 IF v_actor IS NULL OR p_case_id IS NULL OR p_action IS NULL
  OR p_expected_version IS NULL OR p_idempotency_key IS NULL
  OR length(p_idempotency_key) NOT BETWEEN 8 AND 128
 THEN RAISE EXCEPTION 'S4D3K_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_case FROM schoolnet_private.school_bulletin_v2_cases
 WHERE id=p_case_id FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'S4D3K_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.profiles p
  JOIN public.schoolnet_school_memberships m ON m.user_id=p.id
  JOIN public.schoolnet_schools s ON s.id=m.school_id
  WHERE p.id=v_actor AND p.role::text='school_admin'
   AND m.member_role='school_admin' AND m.school_id=v_case.school_id
   AND m.status='active' AND m.revoked_at IS NULL AND s.status='active'
 ) THEN RAISE EXCEPTION 'S4D3K_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 -- Legitimate identical HTTP retry returns prior result without ANY mutation.
 SELECT * INTO v_old FROM schoolnet_private.school_bulletin_v2_events
 WHERE case_id=p_case_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF v_old.actor_id<>v_actor OR v_old.action<>p_action
   OR v_old.from_version<>p_expected_version
  THEN RAISE EXCEPTION 'S4D3K_IDEMPOTENCY_CONFLICT' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('caseId',v_case.id,'state',v_old.to_state,
    'version',v_old.to_version,'replayed',true);
 END IF;

 IF v_case.row_version<>p_expected_version THEN
  RAISE EXCEPTION 'S4D3K_STALE_VERSION' USING ERRCODE='40001';
 END IF;

 CASE p_action
  WHEN 'review_submitted' THEN
   v_required_cap:='submit';
   IF v_case.state<>'draft' OR v_case.requester_id IS NOT NULL THEN
    RAISE EXCEPTION 'S4D3K_INVALID_TRANSITION' USING ERRCODE='42501'; END IF;
   v_next:='submitted';
  WHEN 'approval_granted' THEN
   v_required_cap:='decide';v_next:='approved';
  WHEN 'approval_refused' THEN
   v_required_cap:='decide';v_next:='refused';
  WHEN 'correction_requested' THEN
   v_required_cap:='decide';v_next:='correction_requested';
  WHEN 'publication_authorized' THEN
   v_required_cap:='authorize_publication';v_next:='authorized_for_publication';
  ELSE
   -- NO publication_executed without private storage and family access review.
   RAISE EXCEPTION 'S4D3K_ACTION_NOT_IMPLEMENTED' USING ERRCODE='42501';
 END CASE;
 IF p_action IN ('approval_granted','approval_refused','correction_requested')
  AND (v_case.state<>'submitted' OR v_case.requester_id IS NULL
       OR v_case.requester_id=v_actor)
 THEN RAISE EXCEPTION 'S4D3K_SEPARATION_OR_STATE' USING ERRCODE='42501'; END IF;
 IF p_action='publication_authorized'
  AND (v_case.state<>'approved' OR v_case.approver_id IS NULL)
 THEN RAISE EXCEPTION 'S4D3K_APPROVAL_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_action IN ('approval_refused','correction_requested')
  AND (p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 2000)
 THEN RAISE EXCEPTION 'S4D3K_REASON_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM schoolnet_private.school_bulletin_v2_grants g
  WHERE g.school_id=v_case.school_id AND g.user_id=v_actor
   AND g.capability=v_required_cap AND g.mandate_verified
   AND g.revoked_at IS NULL AND g.valid_from<=now() AND g.valid_until>now()
 ) THEN RAISE EXCEPTION 'S4D3K_CAPABILITY_REQUIRED' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_snapshot FROM schoolnet_private.school_bulletin_v2_snapshots
 WHERE school_id=v_case.school_id AND id=v_case.snapshot_id;
 IF NOT FOUND OR
  NOT EXISTS(
   SELECT 1 FROM schoolnet_private.school_bulletin_v2_policy_versions p
   WHERE p.id=v_snapshot.policy_id AND p.school_id=v_case.school_id
    AND p.status='approved' AND p.required_fields='[]'::jsonb
  ) THEN
  RAISE EXCEPTION 'S4D3K_POLICY_OR_SNAPSHOT_REVOKED' USING ERRCODE='42501';
 END IF;
 v_projection:=schoolnet_private.school_report_card_preview(
  v_case.school_id,v_case.period_id,v_case.class_id,v_case.student_id);
 v_digest:=encode(sha256(convert_to(v_projection::text,'UTF8')),'hex');
 IF v_snapshot.source_digest<>v_digest
  OR v_projection->>'state'<>'ready'
  OR v_projection->'averageOn20'='null'::jsonb
 THEN RAISE EXCEPTION 'S4D3K_OBSOLETE_SOURCE' USING ERRCODE='42501'; END IF;

 UPDATE schoolnet_private.school_bulletin_v2_cases
 SET state=v_next,row_version=row_version+1,updated_at=now(),
  requester_id=CASE WHEN p_action='review_submitted' THEN v_actor ELSE requester_id END,
  approver_id=CASE WHEN p_action='approval_granted' THEN v_actor ELSE approver_id END,
  publication_authorizer_id=CASE WHEN p_action='publication_authorized'
       THEN v_actor ELSE publication_authorizer_id END
 WHERE id=v_case.id;
 INSERT INTO schoolnet_private.school_bulletin_v2_events(
  school_id,case_id,actor_id,action,from_state,to_state,
  from_version,to_version,idempotency_key,reason
 ) VALUES (v_case.school_id,v_case.id,v_actor,p_action,
  v_case.state,v_next,v_case.row_version,v_case.row_version+1,
  p_idempotency_key,CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END);

 RETURN jsonb_build_object('caseId',v_case.id,'state',v_next,
  'version',v_case.row_version+1,'replayed',false);
END $transition$;

-- Public endpoints are callable by signed-in users, but re-authorize EVERY
-- request based on live DB membership + scoped explicit grant. Not by JWT metadata.
REVOKE ALL ON FUNCTION
 public.schoolnet_bulletin_v2_prototype_open_case(uuid,uuid,uuid,uuid,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION
 public.schoolnet_bulletin_v2_prototype_transition(uuid,text,integer,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.schoolnet_bulletin_v2_prototype_open_case(uuid,uuid,uuid,uuid,text)
 TO authenticated;
GRANT EXECUTE ON FUNCTION
 public.schoolnet_bulletin_v2_prototype_transition(uuid,text,integer,text,text)
 TO authenticated;
SELECT 'S4D3K_DISPOSABLE_BACKEND_READY' AS verdict;