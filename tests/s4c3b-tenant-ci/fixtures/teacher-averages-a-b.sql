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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $config_a$
DECLARE
 a_school uuid:='20000000-0000-4000-8000-000000000001';
 school_year uuid:='30000000-0000-4000-8000-000000000001';
 a_class uuid:='50000000-0000-4000-8000-000000000001';
 math uuid:='40000000-0000-4000-8000-000000000001';
 t1 uuid;t2 uuid;
BEGIN
 t1:=public.schoolnet_school_upsert_grading_period(
   a_school,NULL,school_year,'AUTO:T','T1',DATE '2026-09-15',DATE '2026-12-18');
 t2:=public.schoolnet_school_upsert_grading_period(
   a_school,NULL,school_year,'AUTO:T','T2',DATE '2027-01-04',DATE '2027-03-19');
 PERFORM public.schoolnet_school_set_subject_coefficient(a_school,t1,a_class,math,2);
 PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,t1,
   'a0000000-0000-4000-8000-000000000001',1,true);
 PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,t1,
   'a0000000-0000-4000-8000-000000000002',3,true);
 PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,t1,
   'a0000000-0000-4000-8000-000000000004',9,false);
 PERFORM set_config('ci.c3b2.t1a',t1::text,true);
 PERFORM set_config('ci.c3b2.t2a',t2::text,true);
 IF jsonb_array_length(public.schoolnet_school_grading_configuration(a_school)->'periods')<>2 THEN
  RAISE EXCEPTION 'C3B2_PERIODS_MISSING'; END IF;
END $config_a$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SET LOCAL ROLE authenticated;
DO $config_b$
DECLARE b_school uuid:='20000000-0000-4000-8000-000000000002';
 t1 uuid;
BEGIN
 t1:=public.schoolnet_school_upsert_grading_period(
  b_school,NULL,'30000000-0000-4000-8000-000000000001',
  'AUTO:T','T1',DATE '2026-09-15',DATE '2026-12-18');
 PERFORM public.schoolnet_school_set_subject_coefficient(
  b_school,t1,'50000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',1);
 PERFORM public.schoolnet_school_set_assessment_coefficient(b_school,t1,
   'a0000000-0000-4000-8000-000000000005',1,true);
 PERFORM set_config('ci.c3b2.t1b',t1::text,true);
END $config_b$;
RESET ROLE;

-- Teacher A sees ONLY A's authorized class/subject and PUBLISHED copies.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacher_a$
DECLARE
 a_school uuid:='20000000-0000-4000-8000-000000000001';
 b_school uuid:='20000000-0000-4000-8000-000000000002';
 cls uuid:='50000000-0000-4000-8000-000000000001';
 math uuid:='40000000-0000-4000-8000-000000000001';
 t1 uuid; t2 uuid;v jsonb; a1 jsonb;a2 jsonb;
BEGIN
 t1:=current_setting('ci.c3b2.t1a')::uuid;
 t2:=current_setting('ci.c3b2.t2a')::uuid;

 v:=public.schoolnet_teacher_official_subject_averages(a_school,t1,cls,math);
 IF (v->>'teacherScoped')::boolean IS NOT TRUE
   OR (v->>'previewOnly')::boolean IS NOT TRUE
   OR (v->>'subjectCoefficient')::numeric<>2
   OR jsonb_array_length(v->'students')<>2
   OR v ?| ARRAY['feedback','answers','publishedAt','generalAverage','rank']
 THEN RAISE EXCEPTION 'C3B2_WRONG_PROJECTION'; END IF;
 SELECT x INTO a1 FROM jsonb_array_elements(v->'students') x
  WHERE x->>'studentId'='10000000-0000-4000-8000-000000000005';
 SELECT x INTO a2 FROM jsonb_array_elements(v->'students') x
  WHERE x->>'studentId'='10000000-0000-4000-8000-000000000006';
 IF a1 IS NULL OR a1->>'state'<>'incomplete'
   OR a1->'averageOn20'<>'null'::jsonb
   OR (a1->>'includedAssessments')::int<>2
   OR (a1->>'publishedAssessments')::int<>1
   OR a2 IS NULL OR a2->>'state'<>'incomplete'
   OR a2->'averageOn20'<>'null'::jsonb
 THEN RAISE EXCEPTION 'C3B2_UNPUBLISHED_GRADE_LEAK'; END IF;
 RAISE NOTICE 'C3B2_PASS_TEACHER_READ_PUBLISHED_ONLY';

 v:=public.schoolnet_teacher_official_subject_averages(a_school,t2,cls,math);
 IF (v->>'subjectCoefficient') IS NOT NULL
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'students') x
   WHERE x->>'state'<>'not_configured' OR x->'averageOn20'<>'null'::jsonb)
 THEN RAISE EXCEPTION 'C3B2_T2_UNCONFIGURED_SHOULD_BE_NULL'; END IF;
 RAISE NOTICE 'C3B2_PASS_UNCONFIGURED_PERIOD';

 FOR v IN
  SELECT public.schoolnet_teacher_official_subject_averages(a_school,t1,cls,math)
 LOOP EXIT; END LOOP;
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(
   b_school,current_setting('ci.c3b2.t1b')::uuid,
   '50000000-0000-4000-8000-000000000002',math);
  RAISE EXCEPTION 'C3B2_FOREIGN_SCHOOL_VISIBLE';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_FOREIGN_SCHOOL_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(a_school,t1,cls,
    '40000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'C3B2_UNASSIGNED_SUBJECT_VISIBLE';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_UNASSIGNED_SUBJECT_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(a_school,
   current_setting('ci.c3b2.t1b')::uuid,cls,math);
  RAISE EXCEPTION 'C3B2_CROSS_PERIOD_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_CROSS_PERIOD_DENIED'; END;
END $teacher_a$;
RESET ROLE;

-- Mark an already-graded score published; test weighted values: (20*1 + 10*3) / 4 = 12.50.
UPDATE public.assessment_submissions SET status='published',published_at=now()
 WHERE assessment_id='a0000000-0000-4000-8000-000000000002'
 AND student_id='10000000-0000-4000-8000-000000000005';
-- Explicit 0/20 is valid ONLY after publication.
INSERT INTO public.assessment_submissions(
 assessment_id,student_id,status,score,published_at,graded_by)
 VALUES ('a0000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000006','published',0,now(),
 '10000000-0000-4000-8000-000000000003');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $weighted$
DECLARE t1 uuid;v jsonb; a1 jsonb; a2 jsonb;
BEGIN
 t1:=current_setting('ci.c3b2.t1a')::uuid;
 v:=public.schoolnet_teacher_official_subject_averages(
 '20000000-0000-4000-8000-000000000001',t1,
 '50000000-0000-4000-8000-000000000001',
 '40000000-0000-4000-8000-000000000001');
 SELECT x INTO a1 FROM jsonb_array_elements(v->'students') x
  WHERE x->>'studentId'='10000000-0000-4000-8000-000000000005';
 SELECT x INTO a2 FROM jsonb_array_elements(v->'students') x
  WHERE x->>'studentId'='10000000-0000-4000-8000-000000000006';
 IF a1->>'state'<>'ready' OR (a1->>'averageOn20')::numeric<>12.50
 OR a2->>'state'<>'ready' OR (a2->>'averageOn20')::numeric<>0
 THEN RAISE EXCEPTION 'C3B2_WRONG_WEIGHTED_AVERAGE'; END IF;
 IF v::text LIKE '%a0000000-0000-4000-8000-000000000003%'
 OR v::text LIKE '%Eleve B1%'
 OR v::text LIKE '%feedback%'
 THEN RAISE EXCEPTION 'C3B2_LEAKED_OFFICIAL_OR_V1'; END IF;
 RAISE NOTICE 'C3B2_PASS_WEIGHTED_12_50_ZERO_AND_V1_EXCLUDED';
END $weighted$;
RESET ROLE;

-- School_admin supervises settings but cannot obtain nominative scores in C3-B.2.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $admin_denied$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.c3b2.t1a')::uuid,
   '50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3B2_ADMIN_SAW_STUDENT_GRADES';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_ADMIN_NO_STUDENT_GRADES'; END;
END $admin_denied$;
RESET ROLE;

-- Even a teacher with school membership cannot read an unassigned subject.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000008',true);
SET LOCAL ROLE authenticated;
DO $unassigned$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.c3b2.t1a')::uuid,
   '50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3B2_UNASSIGNED_TEACHER_READ';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_TEACHER_WITHOUT_ASSIGNMENT_DENIED'; END;
END $unassigned$;
RESET ROLE;

-- Removing one student must immediately remove that student's identity/average.
UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()
 WHERE school_id='20000000-0000-4000-8000-000000000001'
 AND user_id='10000000-0000-4000-8000-000000000006';
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $student_revoked$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_teacher_official_subject_averages(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.c3b2.t1a')::uuid,
   '50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001');
 IF jsonb_array_length(v->'students')<>1
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'students') x
    WHERE x->>'studentId'='10000000-0000-4000-8000-000000000006')
 THEN RAISE EXCEPTION 'C3B2_REVOKED_STUDENT_VISIBLE'; END IF;
 RAISE NOTICE 'C3B2_PASS_REVOKED_STUDENT_HIDDEN';
END $student_revoked$;
RESET ROLE;

-- Revoking teacher membership must invalidate the preview immediately.
UPDATE public.schoolnet_school_memberships SET status='revoked',revoked_at=now()
 WHERE school_id='20000000-0000-4000-8000-000000000001'
 AND user_id='10000000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacher_revoked$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.c3b2.t1a')::uuid,
   '50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3B2_REVOKED_TEACHER_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_REVOKED_TEACHER_DENIED'; END;
END $teacher_revoked$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 BEGIN
  PERFORM public.schoolnet_teacher_official_subject_averages(
   '20000000-0000-4000-8000-000000000001',
   current_setting('ci.c3b2.t1a')::uuid,
   '50000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3B2_ANON_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3B2_PASS_ANON_DENIED'; END;
END $anon$;
RESET ROLE;
ROLLBACK;
SELECT 'S4C3B2_A_B_FIXTURE_ROLLED_BACK' AS result;
