-- S4-C.3-C.3.3 — SQL end-to-end on fake schools A/B, PostgreSQL 17.
-- BEGIN/ROLLBACK ensures no student or school fixture data persist.
BEGIN;
INSERT INTO public.schoolnet_schools(id,status) VALUES
 ('00000000-0000-4000-8000-000000000010','active'),
 ('00000000-0000-4000-8000-000000000011','active');
INSERT INTO public.school_years(id) VALUES
 ('00000000-0000-4000-8000-000000000020');
INSERT INTO public.classes(id,school_id,school_year_id,learning_context) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','school'),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','school');
INSERT INTO schoolnet_private.school_grading_periods(
 id,school_id,school_year_id,is_locked
) VALUES
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',false),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020',false),
 ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',true);
INSERT INTO public.academic_subjects(id,is_active,name,sort_order) VALUES
 ('00000000-0000-4000-8000-000000000050',true,'Mathématiques',1),
 ('00000000-0000-4000-8000-000000000051',true,'Français',2);
INSERT INTO public.profiles(id,role,full_name) VALUES
 ('00000000-0000-4000-8000-000000000001','school_admin','Admin A'),
 ('00000000-0000-4000-8000-000000000002','school_admin','Admin B'),
 ('00000000-0000-4000-8000-000000000003','school_admin','Admin A revoked'),
 ('00000000-0000-4000-8000-000000000004','teacher','Teacher A'),
 ('00000000-0000-4000-8000-000000000005','teacher','Teacher B'),
 ('00000000-0000-4000-8000-000000000006','teacher','Teacher revoked'),
 ('00000000-0000-4000-8000-000000000007','parent','Parent A'),
 ('00000000-0000-4000-8000-000000000070','student','Élève A1'),
 ('00000000-0000-4000-8000-000000000071','student','Élève A2'),
 ('00000000-0000-4000-8000-000000000072','student','Élève transfert'),
 ('00000000-0000-4000-8000-000000000073','student','Élève B1');
INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,status,revoked_at) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','school_admin','active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000002','school_admin','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000003','school_admin','revoked',now()),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000004','teacher','active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000005','teacher','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000006','teacher','revoked',now()),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000007','parent','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000070','student','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000071','student','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000072','student','active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000072','student','active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000073','student','active',NULL);
INSERT INTO public.schoolnet_school_student_class_assignments(
 school_id,school_year_id,class_id,student_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000070','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000071','active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000072','active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000072','active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000073','active',NULL);
INSERT INTO public.schoolnet_school_teacher_subject_assignments(
 id,school_id,school_year_id,class_id,subject_id,teacher_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000004','active',NULL),
 ('00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000004','active',NULL),
 ('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000005','active',NULL),
 ('00000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000006','revoked',now());
INSERT INTO public.courses(id,created_by,status) VALUES
 ('00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000004','active'),
 ('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000004','active'),
 ('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000005','active'),
 ('00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000006','active');
INSERT INTO schoolnet_private.school_course_links(
 id,course_id,school_id,school_year_id,class_id,subject_id,teacher_assignment_id,
 teacher_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-0000000000a0','00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000004','active',NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000004','active',NULL),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000005','active',NULL),
 ('00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000093','00000000-0000-4000-8000-000000000006','active',NULL);
INSERT INTO public.assessments(id,course_id,created_by,status,max_score) VALUES
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000004','published',20),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000004','published',20),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000005','published',20),
 ('00000000-0000-4000-8000-0000000000b3','00000000-0000-4000-8000-000000000083','00000000-0000-4000-8000-000000000006','published',20),
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000004','published',20);
INSERT INTO schoolnet_private.school_assessment_links(
 assessment_id,school_course_link_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-0000000000a0','active',NULL),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','active',NULL),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2','active',NULL),
 ('00000000-0000-4000-8000-0000000000b3','00000000-0000-4000-8000-0000000000a3','active',NULL),
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-0000000000a0','revoked',now());
INSERT INTO schoolnet_private.school_period_subject_coefficients(
 period_id,class_id,subject_id,coefficient
) VALUES
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050',2),
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000051',1),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000050',2);
INSERT INTO schoolnet_private.school_official_assessment_coefficients(
 assessment_id,period_id,coefficient,include_in_average
) VALUES
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-000000000040',1,true),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000040',1,true),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-000000000041',1,true),
 ('00000000-0000-4000-8000-0000000000b3','00000000-0000-4000-8000-000000000040',1,true),
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-000000000040',1,true);
INSERT INTO public.assessment_submissions(assessment_id,student_id,status,score,published_at) VALUES
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-000000000070','published',20,now()),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000070','published',10,now()),
 ('00000000-0000-4000-8000-0000000000b3','00000000-0000-4000-8000-000000000070','published',0,now()),
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-000000000070','published',0,now()),
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-000000000071','published',20,now()),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000071','graded',18,NULL),
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-000000000072','published',20,now()),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000072','published',20,now()),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-000000000073','published',17,now());

-- Test actual authenticated and anon roles (not a postgres-superuser caller).
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
 v_school_a uuid:='00000000-0000-4000-8000-000000000010';
 v_school_b uuid:='00000000-0000-4000-8000-000000000011';
 v_period_a uuid:='00000000-0000-4000-8000-000000000040';
 v_period_b uuid:='00000000-0000-4000-8000-000000000041';
 v_period_locked uuid:='00000000-0000-4000-8000-000000000042';
 v_class_a uuid:='00000000-0000-4000-8000-000000000030';
 v_class_b uuid:='00000000-0000-4000-8000-000000000031';
 v_math uuid:='00000000-0000-4000-8000-000000000050';
 v_fr uuid:='00000000-0000-4000-8000-000000000051';
 v_admin_a uuid:='00000000-0000-4000-8000-000000000001';
 v_admin_b uuid:='00000000-0000-4000-8000-000000000002';
 v_teacher uuid:='00000000-0000-4000-8000-000000000004';
 v_denied boolean;
 v_result jsonb;
 v_a1 jsonb;
 v_a2 jsonb;
 v_transfer jsonb;
 v_before int;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',v_admin_a::text,true);
 v_result:=public.schoolnet_school_official_curriculum(
  v_school_a,v_period_a,v_class_a,'set',ARRAY[v_math,v_fr]);
 IF v_result->>'status'<>'draft' OR jsonb_array_length(v_result->'subjects')<>2 THEN
  RAISE EXCEPTION 'CATALOG_SET_FAILED %',v_result; END IF;
 RAISE NOTICE 'C3C33_PASS_ADMIN_CATALOG_DRAFT';

 v_result:=public.schoolnet_school_official_curriculum(
  v_school_a,v_period_a,v_class_a,'approve',NULL);
 IF v_result->>'status'<>'approved' OR v_result->'approvedAt'='null'::jsonb
 THEN RAISE EXCEPTION 'CATALOG_APPROVAL_FAILED %',v_result; END IF;
 RAISE NOTICE 'C3C33_PASS_ADMIN_CATALOG_APPROVED';

 -- Grade integrity checked after RESET ROLE, never by the authenticated caller.
 v_result:=public.schoolnet_school_official_general_averages(
  v_school_a,v_period_a,v_class_a);
 IF v_result->>'studentCount'<>'3' OR v_result->>'expectedSubjects'<>'2'
  OR v_result->>'schoolAdminScoped'<>'true'
  OR v_result->>'previewOnly'<>'true'
 THEN RAISE EXCEPTION 'ADMIN_PREVIEW_BAD_COUNTS %',v_result; END IF;
 SELECT r INTO v_a1 FROM jsonb_array_elements(v_result->'students') r
 WHERE r->>'studentId'='00000000-0000-4000-8000-000000000070';
 SELECT r INTO v_a2 FROM jsonb_array_elements(v_result->'students') r
 WHERE r->>'studentId'='00000000-0000-4000-8000-000000000071';
 SELECT r INTO v_transfer FROM jsonb_array_elements(v_result->'students') r
 WHERE r->>'studentId'='00000000-0000-4000-8000-000000000072';
 IF (v_a1->>'averageOn20')::numeric<>16.67 OR v_a1->>'state'<>'ready'
 THEN RAISE EXCEPTION 'BAD_AVERAGE %. A1 %',v_result,v_a1; END IF;
 RAISE NOTICE 'C3C33_PASS_REAL_JOIN_TWO_SUBJECT_WEIGHTED_16_67';

 IF v_a2->'averageOn20'<>'null'::jsonb OR v_a2->>'state'<>'incomplete'
 THEN RAISE EXCEPTION 'UNPUBLISHED_SCORE_LEAK %',v_a2; END IF;
 RAISE NOTICE 'C3C33_PASS_UNPUBLISHED_NOT_ZERO_AND_HIDDEN';

 IF v_transfer->'averageOn20'<>'null'::jsonb
   OR v_transfer->>'state'<>'incomplete'
 THEN RAISE EXCEPTION 'TRANSFER_SHOULD_BLOCK %',v_transfer; END IF;
 RAISE NOTICE 'C3C33_PASS_ACTIVE_DOUBLE_ENROLLMENT_BLOCKED';

 IF v_result::text LIKE '%Élève B1%' OR v_result::text LIKE '%"score"%' OR
   v_result::text LIKE '%"maxScore"%' OR v_result::text LIKE '%feedback%' OR
   v_result::text LIKE '%subjects%' THEN
   RAISE EXCEPTION 'PII_OR_RAW_NOTE_LEAK'; END IF;
 RAISE NOTICE 'C3C33_PASS_MINIMAL_PROJECTION_NO_OTHER_SCHOOL_OR_RAW_NOTES';
 -- Source-grade row count is verified by the fixture harness with its own role.

 -- B-school admin cannot read A. A-school admin cannot read B.
 PERFORM set_config('request.jwt.claim.sub',v_admin_b::text,true);
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_general_averages(v_school_a,v_period_a,v_class_a);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'ADMIN_B_READ_A_ALLOWED'; END IF;
 RAISE NOTICE 'C3C33_PASS_ADMIN_B_DENIED_A';
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(v_school_a,v_period_a,v_class_a,'set',ARRAY[v_math]);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'ADMIN_B_WRITE_A_ALLOWED'; END IF;
 RAISE NOTICE 'C3C33_PASS_ADMIN_B_DENIED_A_WRITE';

 -- Admin B's own school can set/read/approve its own catalog.
 v_result:=public.schoolnet_school_official_curriculum(v_school_b,v_period_b,v_class_b,'set',ARRAY[v_math]);
 v_result:=public.schoolnet_school_official_curriculum(v_school_b,v_period_b,v_class_b,'approve',NULL);
 v_result:=public.schoolnet_school_official_general_averages(v_school_b,v_period_b,v_class_b);
 IF v_result->>'studentCount'<>'2' OR v_result::text LIKE '%Élève A1%'
    OR v_result::text LIKE '%Élève A2%'
 THEN RAISE EXCEPTION 'B_SCOPE_FAILURE %',v_result; END IF;
 RAISE NOTICE 'C3C33_PASS_ADMIN_B_OWN_SCHOOL_ONLY';

 PERFORM set_config('request.jwt.claim.sub',v_admin_a::text,true);
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_general_averages(v_school_b,v_period_b,v_class_b);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'ADMIN_A_READ_B_ALLOWED'; END IF;
 RAISE NOTICE 'C3C33_PASS_ADMIN_A_DENIED_B';

 -- class ID and period ID must belong to the SAME school/year.
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_general_averages(v_school_a,v_period_a,v_class_b);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'FORGED_CLASS_ALLOWED'; END IF;
 RAISE NOTICE 'C3C33_PASS_FOREIGN_CLASS_PERIOD_IDOR_REJECTED';

 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_curriculum(
   v_school_a,v_period_locked,v_class_a,'set',ARRAY[v_math]);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'LOCKED_PERIOD_EDIT_ALLOWED'; END IF;
 RAISE NOTICE 'C3C33_PASS_LOCKED_PERIOD_CONFIG_DENIED';

 -- Editing the expected subject list revokes any prior approval.
 v_result:=public.schoolnet_school_official_curriculum(
   v_school_a,v_period_a,v_class_a,'set',ARRAY[v_math]);
 IF v_result->>'status'<>'draft' THEN RAISE EXCEPTION 'APPROVAL_NOT_INVALIDATED'; END IF;
 v_result:=public.schoolnet_school_official_general_averages(v_school_a,v_period_a,v_class_a);
 IF v_result->>'state'<>'not_configured'
  OR v_result->>'studentCount'<>'0' THEN
  RAISE EXCEPTION 'UNAPPROVED_CATALOG_EXPOSED %',v_result; END IF;
 RAISE NOTICE 'C3C33_PASS_DRAFT_CATALOG_HIDES_AVERAGES';

 v_result:=public.schoolnet_school_official_curriculum(
  v_school_a,v_period_a,v_class_a,'approve',NULL);
 v_result:=public.schoolnet_school_official_general_averages(
  v_school_a,v_period_a,v_class_a);
 SELECT r INTO v_a1 FROM jsonb_array_elements(v_result->'students') r
 WHERE r->>'studentId'='00000000-0000-4000-8000-000000000070';
 IF (v_a1->>'averageOn20')::numeric<>20
 THEN RAISE EXCEPTION 'REAPPROVAL_RECALCULATION_FAILED %',v_a1; END IF;
 RAISE NOTICE 'C3C33_PASS_REAPPROVAL_CHANGES_SUBJECT_DENOMINATOR';

 -- User role in profiles and membership must BOTH authorize the school.
 FOR v_teacher IN SELECT user_id FROM public.schoolnet_school_memberships
 WHERE school_id=v_school_a AND user_id IN(
  '00000000-0000-4000-8000-000000000003'::uuid,
  '00000000-0000-4000-8000-000000000004'::uuid,
  '00000000-0000-4000-8000-000000000007'::uuid,
  '00000000-0000-4000-8000-000000000070'::uuid
 ) LOOP
  PERFORM set_config('request.jwt.claim.sub',v_teacher::text,true);
  v_denied:=false;
  BEGIN
   PERFORM public.schoolnet_school_official_general_averages(v_school_a,v_period_a,v_class_a);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
  IF NOT v_denied THEN
   RAISE EXCEPTION 'UNAUTHORIZED_USER_COULD_READ %',v_teacher; END IF;
  v_denied:=false;
  BEGIN
   PERFORM public.schoolnet_school_official_curriculum(v_school_a,v_period_a,v_class_a,'read',NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNAUTHORIZED_CATALOG_READ %',v_teacher; END IF;
 END LOOP;
 RAISE NOTICE 'C3C33_PASS_REVOKED_TEACHER_PARENT_STUDENT_ALL_DENIED';

 -- Attempt direct helper access as teacher (private schema still not exposed).
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
 v_denied:=false;
 BEGIN
  PERFORM schoolnet_private.school_official_general_averages(v_school_a,v_period_a,v_class_a);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'PRIVATE_HELPER_BYPASSED_AUTH'; END IF;
 RAISE NOTICE 'C3C33_PASS_PRIVATE_HELPER_DIRECT_CALL_REJECTED';

 IF has_function_privilege('anon',
   'public.schoolnet_school_official_general_averages(uuid,uuid,uuid)','EXECUTE')
  OR has_function_privilege('anon',
   'public.schoolnet_school_official_curriculum(uuid,uuid,uuid,text,uuid[])','EXECUTE')
  OR has_function_privilege('authenticated',
   'schoolnet_private.c3c3_require_school_admin(uuid)','EXECUTE')
  OR has_table_privilege('authenticated',
   'schoolnet_private.school_official_curricula','SELECT')
 THEN RAISE EXCEPTION 'FUNCTION_OR_TABLE_GRANT_TOO_BROAD'; END IF;
 RAISE NOTICE 'C3C33_PASS_ANON_NO_EXECUTE_NO_DIRECT_TABLE_GRANTS';

 -- No user session (auth.uid() is NULL) must be denied even with authenticated
 -- Postgres role. This covers anonymous authenticated-role sessions.
 PERFORM set_config('request.jwt.claim.sub','',true);
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_school_official_general_averages(v_school_a,v_period_a,v_class_a);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'NULL_AUTH_UID_BYPASSED_CHECK'; END IF;
 RAISE NOTICE 'C3C33_PASS_NO_AUTH_UID_DENIED';

END $test$;
RESET ROLE;
DO $admin_fixture_integrity$
BEGIN
 IF (SELECT count(*) FROM public.assessment_submissions)<>9 THEN
  RAISE EXCEPTION 'PREVIEW_CHANGED_GRADES';
 END IF;
 RAISE NOTICE 'C3C33_PASS_PREVIEW_READ_ONLY';
END $admin_fixture_integrity$;
ROLLBACK;
SELECT CASE WHEN NOT EXISTS(
 SELECT 1 FROM schoolnet_private.school_official_curricula
) AND NOT EXISTS(
 SELECT 1 FROM public.assessment_submissions
) THEN 'C3C33_ISOLATED_ROLLBACK_OK'
ELSE 'C3C33_ROLLBACK_FAILED' END AS verdict;
