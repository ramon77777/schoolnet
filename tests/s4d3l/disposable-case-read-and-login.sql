-- SCHOOLNET S4-D.3l — LOCAL SUPABASE LAB ONLY (NOT A MIGRATION).
-- After S4-D.3k disposable-bulletin-workflow.sql and its fixture seed.
-- Enables own-profile login and READ-ONLY case/history inspection.
-- The writable actions remain S4-D.3k's PostgreSQL transactional RPC.
DO $preflight$
BEGIN
 IF to_regprocedure('auth.uid()') IS NULL
 OR to_regprocedure('public.schoolnet_bulletin_v2_prototype_transition(uuid,text,integer,text,text)') IS NULL
 OR to_regclass('schoolnet_private.school_bulletin_v2_events') IS NULL
 OR to_regclass('public.profiles') IS NULL
 OR (SELECT count(*) FROM public.schoolnet_schools) <> 2
 THEN RAISE EXCEPTION 'S4D3L_DISPOSABLE_LOCAL_ONLY_PREFLIGHT_FAILED'; END IF;
END $preflight$;

-- The earlier C3-C3 fixture intentionally denied all profile reads.
-- SCHOOLNET login needs ONLY the authenticated user's own profile.
GRANT SELECT (id,role,full_name) ON public.profiles TO authenticated;
CREATE POLICY s4d3l_profile_self_only
 ON public.profiles FOR SELECT TO authenticated
 USING (id = (SELECT auth.uid()));

CREATE FUNCTION public.schoolnet_bulletin_v2_prototype_case_for_student(
 p_school_id uuid,p_class_id uuid,p_period_id uuid,p_student_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $read_case$
DECLARE
 v_actor uuid := auth.uid();
 v_caps jsonb;
 v_case schoolnet_private.school_bulletin_v2_cases%ROWTYPE;
 v_events jsonb;
BEGIN
 IF v_actor IS NULL OR p_school_id IS NULL OR p_class_id IS NULL
    OR p_period_id IS NULL OR p_student_id IS NULL THEN
  RAISE EXCEPTION 'S4D3L_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM public.profiles p
   JOIN public.schoolnet_school_memberships m ON m.user_id=p.id
   JOIN public.schoolnet_schools s ON s.id=m.school_id
   WHERE p.id=v_actor AND p.role::text='school_admin'
     AND m.member_role='school_admin' AND m.school_id=p_school_id
     AND m.status='active' AND m.revoked_at IS NULL AND s.status='active'
 ) OR NOT EXISTS (
   SELECT 1 FROM public.classes c
   JOIN schoolnet_private.school_grading_periods gp
     ON gp.school_id=c.school_id AND gp.school_year_id=c.school_year_id
   WHERE c.id=p_class_id AND gp.id=p_period_id
     AND c.school_id=p_school_id
 ) THEN
   RAISE EXCEPTION 'S4D3L_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;

 SELECT COALESCE(jsonb_agg(DISTINCT g.capability ORDER BY g.capability),'[]'::jsonb)
 INTO v_caps FROM schoolnet_private.school_bulletin_v2_grants g
 WHERE g.school_id=p_school_id AND g.user_id=v_actor AND g.mandate_verified
  AND g.revoked_at IS NULL
  AND g.valid_from<=now() AND g.valid_until>now()
  AND g.capability IN ('submit','decide','authorize_publication');

 IF v_caps='[]'::jsonb THEN
  RAISE EXCEPTION 'S4D3L_CAPABILITY_REQUIRED' USING ERRCODE='42501';
 END IF;

 SELECT * INTO v_case FROM schoolnet_private.school_bulletin_v2_cases c
 WHERE c.school_id=p_school_id AND c.class_id=p_class_id
  AND c.period_id=p_period_id AND c.student_id=p_student_id;

 IF NOT FOUND THEN
  RETURN jsonb_build_object(
    'schoolId',p_school_id,'classId',p_class_id,
    'periodId',p_period_id,'studentId',p_student_id,
    'capabilities',v_caps,'case',NULL
  );
 END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'action', e.action, 'actorId', e.actor_id,
  'fromState',e.from_state,'toState',e.to_state,
  'version',e.to_version,'reason',e.reason,
  'createdAt',e.created_at
 ) ORDER BY e.created_at,e.id),'[]'::jsonb)
 INTO v_events FROM schoolnet_private.school_bulletin_v2_events e
 WHERE e.school_id=p_school_id AND e.case_id=v_case.id;

 RETURN jsonb_build_object(
  'schoolId',p_school_id,'classId',p_class_id,
  'periodId',p_period_id,'studentId',p_student_id,
  'capabilities',v_caps,
  'case',jsonb_build_object(
   'caseId',v_case.id,'state',v_case.state,
   'version',v_case.row_version,
   'requesterId',v_case.requester_id,
   'approverId',v_case.approver_id,
   'publicationAuthorizerId',v_case.publication_authorizer_id,
   'audit',v_events
  )
 );
END $read_case$;

REVOKE ALL ON FUNCTION
 public.schoolnet_bulletin_v2_prototype_case_for_student(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.schoolnet_bulletin_v2_prototype_case_for_student(uuid,uuid,uuid,uuid)
 TO authenticated;

SELECT 'S4D3L_DISPOSABLE_LAB_READ_ONLY_READY' AS verdict;
