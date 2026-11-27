-- S4-D.3k CI-ONLY fictional school-level policy, memberships and mandates.
-- User IDs come from real LOCAL GoTrue; psql -v parameters validated as UUIDs.
DO $guard$
BEGIN
 IF to_regclass('schoolnet_private.school_bulletin_v2_cases') IS NULL
  OR (SELECT count(*) FROM schoolnet_private.school_bulletin_v2_grants) <> 0
  OR (SELECT count(*) FROM schoolnet_private.school_bulletin_v2_policy_versions) <> 0
  OR (SELECT count(*) FROM public.schoolnet_schools) <> 2
 THEN RAISE EXCEPTION 'S4D3K_FICTITIOUS_SEED_REFUSES_NONEMPTY_TARGET'; END IF;
END $guard$;
INSERT INTO public.profiles(id,role,full_name)
VALUES (:'approver_a'::uuid,'school_admin','Décideur A fictif');
INSERT INTO public.schoolnet_school_memberships(
 school_id,user_id,member_role,status,revoked_at)
VALUES ('00000000-0000-4000-8000-000000000010',:'approver_a'::uuid,
 'school_admin','active',NULL);

-- All approved "school policy" rows are disposable fictional approvals.
-- Real establishments have NOT approved their policies.
INSERT INTO schoolnet_private.school_bulletin_v2_policy_versions(
 school_id,school_year_id,class_id,period_id,revision,required_fields,status,approved_at
) VALUES
 ('00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000040',
  'fictitious-A-v1','[]'::jsonb,'approved',now()),
 ('00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000041',
  'fictitious-B-v1','[]'::jsonb,'approved',now());

INSERT INTO schoolnet_private.school_bulletin_v2_grants(
 school_id,user_id,capability,valid_from,valid_until,mandate_verified
) VALUES
 ('00000000-0000-4000-8000-000000000010',:'admin_a'::uuid,
  'submit',now()-interval '1 day',now()+interval '30 days',true),
 ('00000000-0000-4000-8000-000000000010',:'approver_a'::uuid,
  'decide',now()-interval '1 day',now()+interval '30 days',true),
 ('00000000-0000-4000-8000-000000000010',:'approver_a'::uuid,
  'authorize_publication',now()-interval '1 day',now()+interval '30 days',true),
 ('00000000-0000-4000-8000-000000000011',:'admin_b'::uuid,
  'submit',now()-interval '1 day',now()+interval '30 days',true);
SELECT 'S4D3K_DISPOSABLE_MANDATES_READY' AS verdict;