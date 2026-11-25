-- SCHOOLNET S4-C.3-B.2 - A/B permission and average tests, EPHEMERAL PG ONLY.
-- Fictitious users; all test rows in a transaction rolled back at the end.
BEGIN;
SET LOCAL statement_timeout='45s';
INSERT INTO public.profiles(id,role,full_name) VALUES
 ('10000000-0000-4000-8000-000000000001','school_admin','Admin A'),
 ('10000000-0000-4000-8000-000000000002','school_admin','Admin B'),
 ('10000000-0000-4000-8000-000000000003','teacher','Enseignant A'),
 ('10000000-0000-4000-8000-000000000004','teacher','Enseignant B'),
 ('10000000-0000-4000-8000-000000000005','student','Eleve A1'),
 ('10000000-0000-4000-8000-000000000006','student','Eleve A2'),
 ('10000000-0000-4000-8000-000000000007','student','Eleve B1'),
 ('10000000-0000-4000-8000-000000000008','teacher','Enseignant sans affectation');
INSERT INTO public.schoolnet_schools(id,code,name,status) VALUES
 ('20000000-0000-4000-8000-000000000001','QA-A','Ecole A','active'),
 ('20000000-0000-4000-8000-000000000002','QA-B','Ecole B','active');
INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,status) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','school_admin','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','school_admin','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','teacher','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','teacher','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','student','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','student','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007','student','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000008','teacher','active');
INSERT INTO public.levels(id,name) VALUES(1,'6e');
INSERT INTO public.school_years(id,name) VALUES
 ('30000000-0000-4000-8000-000000000001','2026-2027');
INSERT INTO public.academic_subjects(id,name,code,is_active,sort_order) VALUES
 ('40000000-0000-4000-8000-000000000001','Mathematiques','MATH',true,1),
 ('40000000-0000-4000-8000-000000000002','Histoire','HIST',true,2);
INSERT INTO public.classes(id,school_id,level_id,school_year_id,school_year,name,learning_context) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e A','school'),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e B','school');
INSERT INTO public.schoolnet_school_teacher_subject_assignments(
 id,school_id,class_id,school_year_id,teacher_id,subject_id,assigned_by) VALUES
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
INSERT INTO public.schoolnet_school_student_class_assignments(
 school_id,class_id,school_year_id,student_id,assigned_by) VALUES
 ('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002');
INSERT INTO public.courses(id,title,created_by,class_id,level_id,status) VALUES
 ('70000000-0000-4000-8000-000000000001','Math A','10000000-0000-4000-8000-000000000003',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000002','Math B','10000000-0000-4000-8000-000000000004',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000003','Cours libre V1','10000000-0000-4000-8000-000000000003',NULL,1,'active');
INSERT INTO schoolnet_private.school_course_links(
 course_id,school_id,class_id,school_year_id,teacher_assignment_id,teacher_id,subject_id,linked_by) VALUES
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003'),
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
INSERT INTO public.assessments(
 id,course_id,type,status,title,created_by,max_score) VALUES
 ('a0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','quiz','published','Math A Q1','10000000-0000-4000-8000-000000000003',20),
 ('a0000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','quiz','published','Math A Q2','10000000-0000-4000-8000-000000000003',10),
 ('a0000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003','quiz','published','Libre V1','10000000-0000-4000-8000-000000000003',20),
 ('a0000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001','quiz','published','Math A Exclu','10000000-0000-4000-8000-000000000003',20),
 ('a0000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000002','quiz','published','Math B Q1','10000000-0000-4000-8000-000000000004',20);
INSERT INTO schoolnet_private.school_assessment_links(assessment_id,school_course_link_id,linked_by)
SELECT a.id,l.id,a.created_by
FROM public.assessments a
JOIN schoolnet_private.school_course_links l ON l.course_id=a.course_id
WHERE a.id IN (
 'a0000000-0000-4000-8000-000000000001',
 'a0000000-0000-4000-8000-000000000002',
 'a0000000-0000-4000-8000-000000000004',
 'a0000000-0000-4000-8000-000000000005'
);
INSERT INTO public.assessment_submissions(
 assessment_id,student_id,status,score,published_at,graded_by) VALUES
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','published',20,now(),'10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','graded',5,NULL,'10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','published',0,now(),'10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','published',19,now(),'10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','published',0,now(),'10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000007','published',10,now(),'10000000-0000-4000-8000-000000000004');


-- Test only: all changes performed in a transaction that is ROLLED BACK.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $adminA$
DECLARE
  s uuid:='20000000-0000-4000-8000-000000000001';
  t uuid;
  cfg jsonb;
BEGIN
 t:=public.schoolnet_school_upsert_grading_period(s,NULL,
  '30000000-0000-4000-8000-000000000001','AUTO:T',
  'Premier trimestre',DATE '2026-09-15',DATE '2026-12-18');
 PERFORM set_config('ci.b6.t1a',t::text,true);
 cfg:=public.schoolnet_school_teacher_coefficient_delegations(s);
 IF jsonb_array_length(cfg->'assignments')<>1 OR
   (cfg->'assignments'->0->>'canEditSubjectCoefficient')::boolean IS NOT FALSE
 THEN RAISE EXCEPTION 'B6_ADMIN_CATALOG_INVALID'; END IF;
 RAISE NOTICE 'S4C3B6_PASS_ADMIN_INITIAL_NO_DELEGATION';
END $adminA$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $adminB$
DECLARE s uuid:='20000000-0000-4000-8000-000000000002'; t uuid;
BEGIN
 t:=public.schoolnet_school_upsert_grading_period(s,NULL,
  '30000000-0000-4000-8000-000000000001','AUTO:T',
  'Premier trimestre',DATE '2026-09-15',DATE '2026-12-18');
 PERFORM set_config('ci.b6.t1b',t::text,true);
 BEGIN
  PERFORM public.schoolnet_school_set_teacher_coefficient_delegation(
   '20000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000001',true);
  RAISE EXCEPTION 'B6_ADMIN_B_GRANTED_A';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_CROSS_ADMIN_DENIED';
END $adminB$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacherA$
DECLARE v jsonb;s uuid:='20000000-0000-4000-8000-000000000001';
 t uuid:=current_setting('ci.b6.t1a')::uuid;
BEGIN
 v:=public.schoolnet_teacher_coefficient_settings(s);
 IF jsonb_array_length(v->'assignments')<>1 OR
  jsonb_array_length(v->'periods')<>1 OR
  jsonb_array_length(v->'assessments')<>3 OR
  (v->'assignments'->0->>'canEditSubjectCoefficient')::boolean IS NOT FALSE OR
  v ?| ARRAY['score','students','studentNames','grades','submissions']
 THEN RAISE EXCEPTION 'B6_TEACHER_A_INCOMPLETE_OR_DATA_LEAK'; END IF;
 RAISE NOTICE 'S4C3B6_PASS_TEACHER_SCOPED_READ';
 BEGIN
  PERFORM public.schoolnet_teacher_coefficient_settings(
   '20000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'B6_TEACHER_A_READ_B';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.schoolnet_school_teacher_coefficient_delegations(s);
  RAISE EXCEPTION 'B6_TEACHER_A_ADMIN_CATALOG';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.schoolnet_teacher_set_subject_coefficient(
   s,t,'50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001',3);
  RAISE EXCEPTION 'B6_TEACHER_A_UNDELEGATED_SUBJECT';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_SUBJECT_REQUIRES_DELEGATION';
 BEGIN
  PERFORM public.schoolnet_teacher_set_assessment_coefficient(
   s,t,'a0000000-0000-4000-8000-000000000003',1,true);
  RAISE EXCEPTION 'B6_TEACHER_A_MODIFIED_V1';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.schoolnet_teacher_set_assessment_coefficient(
   s,t,'a0000000-0000-4000-8000-000000000005',1,true);
  RAISE EXCEPTION 'B6_TEACHER_A_MODIFIED_B';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.schoolnet_teacher_set_assessment_coefficient(
   s,t,'a0000000-0000-4000-8000-000000000001',0.001,true);
  RAISE EXCEPTION 'B6_TOO_SMALL_COEF_ALLOWED';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_V1_AND_FOREIGN_AND_INVALID_DENIED';
 PERFORM public.schoolnet_teacher_set_assessment_coefficient(
  s,t,'a0000000-0000-4000-8000-000000000001',3,true);
 v:=public.schoolnet_teacher_coefficient_settings(s);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'assessments') item
   WHERE item->>'assessmentId'='a0000000-0000-4000-8000-000000000001'
     AND (item->>'coefficient')::numeric=3) OR
   jsonb_array_length(v->'history')<>1
 THEN RAISE EXCEPTION 'B6_TEACHER_WRITE_AUDIT_MISSING'; END IF;
 RAISE NOTICE 'S4C3B6_PASS_OWN_ASSESSMENT_AUDITED';
END $teacherA$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $adminGrant$
DECLARE s uuid:='20000000-0000-4000-8000-000000000001';v jsonb;
BEGIN
 PERFORM public.schoolnet_school_set_teacher_coefficient_delegation(
  s,'60000000-0000-4000-8000-000000000001',true);
 v:=public.schoolnet_school_teacher_coefficient_delegations(s);
 IF (v->'assignments'->0->>'canEditSubjectCoefficient')::boolean IS NOT TRUE
 THEN RAISE EXCEPTION 'B6_ADMIN_GRANT_NOT_VISIBLE'; END IF;
 RAISE NOTICE 'S4C3B6_PASS_ADMIN_DELEGATION_GRANTED';
END $adminGrant$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacherDelegated$
DECLARE s uuid:='20000000-0000-4000-8000-000000000001';t uuid:=current_setting('ci.b6.t1a')::uuid;
 v jsonb;
BEGIN
 PERFORM public.schoolnet_teacher_set_subject_coefficient(
  s,t,'50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',4);
 v:=public.schoolnet_teacher_coefficient_settings(s);
 IF (v->'subjectSettings'->0->>'coefficient')::numeric<>4
 OR jsonb_array_length(v->'history')<>2
 THEN RAISE EXCEPTION 'B6_DELEGATED_SUBJECT_NOT_PERSISTED'; END IF;
 RAISE NOTICE 'S4C3B6_PASS_DELEGATED_SUBJECT_WRITE_AUDITED';
END $teacherDelegated$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $adminRevoke$
BEGIN
 PERFORM public.schoolnet_school_set_teacher_coefficient_delegation(
  '20000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',false);
 RAISE NOTICE 'S4C3B6_PASS_ADMIN_DELEGATION_REVOKED';
END $adminRevoke$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacherAfterRevoke$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_set_subject_coefficient(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.b6.t1a')::uuid,
   '50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001',5);
  RAISE EXCEPTION 'B6_REVOKED_STILL_EDITABLE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_IMMEDIATE_DELEGATION_REVOCATION';
END $teacherAfterRevoke$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $adminLock$
BEGIN
 PERFORM public.schoolnet_school_set_teacher_coefficient_delegation(
  '20000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',true);
 PERFORM public.schoolnet_school_lock_grading_period(
  '20000000-0000-4000-8000-000000000001',
  current_setting('ci.b6.t1a')::uuid);
END $adminLock$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacherLocked$
DECLARE s uuid:='20000000-0000-4000-8000-000000000001';t uuid:=current_setting('ci.b6.t1a')::uuid;
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_set_subject_coefficient(
    s,t,'50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',4);
  RAISE EXCEPTION 'B6_LOCKED_SUBJECT_WRITABLE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.schoolnet_teacher_set_assessment_coefficient(
    s,t,'a0000000-0000-4000-8000-000000000001',4,true);
  RAISE EXCEPTION 'B6_LOCKED_ASSESSMENT_WRITABLE';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_LOCKED_PERIOD_DENIED';
END $teacherLocked$;
RESET ROLE;
UPDATE public.schoolnet_school_memberships
 SET status='revoked',revoked_at=now()
 WHERE school_id='20000000-0000-4000-8000-000000000001'
 AND user_id='10000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacherRevoked$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_coefficient_settings(
    '20000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'B6_MEMBERSHIP_REVOKED_READ';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_MEMBERSHIP_REVOCATION';
END $teacherRevoked$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_coefficient_settings(
    '20000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'B6_ANON_READ_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.schoolnet_teacher_set_assessment_coefficient(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.b6.t1a')::uuid,
   'a0000000-0000-4000-8000-000000000001',1,true);
  RAISE EXCEPTION 'B6_ANON_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'S4C3B6_PASS_ANON_DENIED';
END $anon$;
RESET ROLE;
DO $audit_and_v1$
BEGIN
 IF (SELECT count(*) FROM schoolnet_private.school_teacher_coefficient_events
      WHERE school_id='20000000-0000-4000-8000-000000000001')<>5 THEN
  RAISE EXCEPTION 'B6_AUDIT_COUNT_WRONG'; END IF;
 IF (SELECT count(*) FROM public.assessment_submissions
     WHERE assessment_id='a0000000-0000-4000-8000-000000000001'
       AND score=20 AND status='published')<>1 THEN
  RAISE EXCEPTION 'B6_NOTE_MODIFIED'; END IF;
 IF (SELECT count(*) FROM schoolnet_private.school_official_assessment_coefficients
     WHERE assessment_id='a0000000-0000-4000-8000-000000000003')<>0 THEN
  RAISE EXCEPTION 'B6_V1_MODIFIED'; END IF;
 RAISE NOTICE 'S4C3B6_PASS_AUDIT_AND_V1_UNCHANGED';
END $audit_and_v1$;
ROLLBACK;
SELECT 'S4C3B6_A_B_FIXTURE_ROLLED_BACK' AS result;
