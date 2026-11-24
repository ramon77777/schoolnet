-- C3-A A/B SQL acceptance - Supabase LOCAL JETABLE ONLY.
-- All fictitious data is wrapped in one transaction and ROLLBACK.
BEGIN;
SET LOCAL statement_timeout='45s';
INSERT INTO public.profiles(id,role,full_name) VALUES
 ('10000000-0000-4000-8000-000000000001','school_admin','Admin A'),
 ('10000000-0000-4000-8000-000000000002','school_admin','Admin B'),
 ('10000000-0000-4000-8000-000000000003','teacher','Teacher A'),
 ('10000000-0000-4000-8000-000000000004','teacher','Teacher B');
INSERT INTO public.schoolnet_schools(id,code,name,status) VALUES
 ('20000000-0000-4000-8000-000000000001','QA-A','Ecole A','active'),
 ('20000000-0000-4000-8000-000000000002','QA-B','Ecole B','active');
INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,status) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','school_admin','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','school_admin','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','teacher','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','teacher','active');
INSERT INTO public.levels(id,name) VALUES (1,'6e');
INSERT INTO public.school_years(id,name) VALUES
 ('30000000-0000-4000-8000-000000000001','2026-2027');
INSERT INTO public.academic_subjects(id,name,code,is_active,sort_order) VALUES
 ('40000000-0000-4000-8000-000000000001','Mathematiques','MATH',true,1);
INSERT INTO public.classes(id,school_id,level_id,school_year_id,school_year,name,learning_context) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e A','school'),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e B','school');
INSERT INTO public.schoolnet_school_teacher_subject_assignments
(id,school_id,class_id,school_year_id,teacher_id,subject_id,assigned_by) VALUES
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
INSERT INTO public.courses(id,title,created_by,class_id,level_id,status) VALUES
 ('70000000-0000-4000-8000-000000000001','Mathematiques A','10000000-0000-4000-8000-000000000003',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000002','Mathematiques B','10000000-0000-4000-8000-000000000004',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000003','Libre V1','10000000-0000-4000-8000-000000000003',NULL,1,'active');
INSERT INTO schoolnet_private.school_course_links(
 course_id,school_id,class_id,school_year_id,teacher_assignment_id,teacher_id,subject_id,linked_by
) VALUES
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003'),
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');
INSERT INTO public.assessments(id,course_id,type,status,title,created_by) VALUES
 ('a0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','quiz','published','Quiz A','10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','quiz','published','Quiz B','10000000-0000-4000-8000-000000000004'),
 ('a0000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003','quiz','published','Quiz libre V1','10000000-0000-4000-8000-000000000003');
INSERT INTO schoolnet_private.school_assessment_links(assessment_id,school_course_link_id,linked_by)
SELECT a.id,l.id,a.created_by FROM public.assessments a
JOIN schoolnet_private.school_course_links l ON l.course_id=a.course_id
WHERE a.id IN ('a0000000-0000-4000-8000-000000000001'::uuid,
               'a0000000-0000-4000-8000-000000000002'::uuid);

-- Explicitly simulate a valid session and origin for ONLY the disposable database.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
DO $school_a$
DECLARE
 a_school uuid:='20000000-0000-4000-8000-000000000001';
 b_school uuid:='20000000-0000-4000-8000-000000000002';
 year_id uuid:='30000000-0000-4000-8000-000000000001';
 class_a uuid:='50000000-0000-4000-8000-000000000001';
 class_b uuid:='50000000-0000-4000-8000-000000000002';
 sub uuid:='40000000-0000-4000-8000-000000000001';
 quiz_a uuid:='a0000000-0000-4000-8000-000000000001';
 quiz_b uuid:='a0000000-0000-4000-8000-000000000002';
 quiz_v1 uuid:='a0000000-0000-4000-8000-000000000003';
 p1 uuid;p2 uuid;v jsonb;
BEGIN
 v:=public.schoolnet_school_grading_configuration(a_school);
 IF v->>'schoolId'<>a_school::text OR jsonb_array_length(v->'years')<>1
 OR jsonb_array_length(v->'subjects')<>1
 OR jsonb_array_length(v->'assessments')<>1
 OR jsonb_array_length(v->'periods')<>0
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'assessments') x
    WHERE x ?| ARRAY['score','studentId','studentName','feedback','answers'])
 THEN RAISE EXCEPTION 'C3A_BAD_READ_A'; END IF;
 RAISE NOTICE 'C3A_PASS_READ_A';

 BEGIN
  PERFORM public.schoolnet_school_grading_configuration(b_school);
  RAISE EXCEPTION 'C3A_FOREIGN_SCHOOL_VISIBLE';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_FOREIGN_READ_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_school_upsert_grading_period(b_school,NULL,year_id,
   'T1','Foreign',DATE '2026-09-01',DATE '2026-12-20');
  RAISE EXCEPTION 'C3A_FOREIGN_SCHOOL_WRITABLE';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_FOREIGN_WRITE_DENIED'; END;

 p1:=public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   't1',E'\t Trimestre 1 \t',DATE '2026-09-01',DATE '2026-12-20');
 p2:=public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'T1','Trimestre 2',DATE '2026-12-21',DATE '2027-03-20');
 IF p1 IS NULL OR p1=p2 THEN RAISE EXCEPTION 'C3A_CREATE_FAILED'; END IF;
 v:=public.schoolnet_school_grading_configuration(a_school);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'periods') row
    WHERE row->>'id'=p1::text AND row->>'code'='T1' AND row->>'name'='Trimestre 1')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'periods') row
    WHERE row->>'id'=p2::text AND row->>'code'='T2')
 THEN RAISE EXCEPTION 'C3A1_CODE_NOT_SERVER_ALLOCATED_OR_NAME_NOT_TRIMMED'; END IF;
 RAISE NOTICE 'C3A1_PASS_AUTO_SEQUENCE_AND_TRIM';
 RAISE NOTICE 'C3A_PASS_PERIODS_A';
 BEGIN
  PERFORM public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'T3','Overlap',DATE '2026-12-20',DATE '2027-02-20');
  RAISE EXCEPTION 'C3A_OVERLAP_ALLOWED';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C3A_PASS_OVERLAP_DENIED'; END;

 PERFORM public.schoolnet_school_set_subject_coefficient(a_school,p1,class_a,sub,2);
 PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,p1,quiz_a,1,true);
 v:=public.schoolnet_school_grading_configuration(a_school);
 IF jsonb_array_length(v->'subjectSettings')<>1
 OR (v->'subjectSettings'->0->>'coefficient')::numeric<>2
 OR jsonb_array_length(v->'periods')<>2
 OR (v->'assessments'->0->>'periodId')<>p1::text
 OR (v->'assessments'->0->>'includeInAverage')::boolean IS NOT TRUE
 THEN RAISE EXCEPTION 'C3A_READ_AFTER_WRITE'; END IF;
 RAISE NOTICE 'C3A_PASS_COEFFICIENTS_A';
 PERFORM public.schoolnet_school_upsert_grading_period(a_school,p2,year_id,
   'S9',E'  Trimestre 2 \t',DATE '2026-12-21',DATE '2027-03-20');
 v:=public.schoolnet_school_grading_configuration(a_school);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'periods') row
    WHERE row->>'id'=p2::text AND row->>'code'='T2' AND row->>'name'='Trimestre 2')
 THEN RAISE EXCEPTION 'C3A1_CODE_CHANGED_ON_EDIT'; END IF;
 RAISE NOTICE 'C3A1_PASS_CODE_IMMUTABLE';

 BEGIN
  PERFORM public.schoolnet_school_set_subject_coefficient(a_school,p1,class_b,sub,1);
  RAISE EXCEPTION 'C3A_FOREIGN_CLASS_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_FOREIGN_CLASS_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,p1,quiz_b,1,true);
  RAISE EXCEPTION 'C3A_FOREIGN_ASSESSMENT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_FOREIGN_ASSESSMENT_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,p1,quiz_v1,1,true);
  RAISE EXCEPTION 'C3A_V1_ASSESSMENT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_V1_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_school_set_subject_coefficient(a_school,p1,class_a,sub,0);
  RAISE EXCEPTION 'C3A_ZERO_COEFF_ALLOWED';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C3A_PASS_ZERO_COEFF_DENIED'; END;

 PERFORM public.schoolnet_school_lock_grading_period(a_school,p1);
 BEGIN
  PERFORM public.schoolnet_school_set_subject_coefficient(a_school,p1,class_a,sub,3);
  RAISE EXCEPTION 'C3A_LOCKED_SETTING_EDIT';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_LOCKED_SETTING_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_school_upsert_grading_period(a_school,p1,year_id,
   'T1','Trimestre modifie',DATE '2026-09-01',DATE '2026-12-20');
  RAISE EXCEPTION 'C3A_LOCKED_PERIOD_EDIT';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_LOCKED_PERIOD_DENIED'; END;
 BEGIN
  PERFORM public.schoolnet_school_set_assessment_coefficient(a_school,p2,quiz_a,1,true);
  RAISE EXCEPTION 'C3A_LOCKED_PERIOD_MOVE';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_LOCKED_MOVE_DENIED'; END;
 RAISE NOTICE 'C3A_PASS_LOCKED_PERIOD';
 p1:=public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'S','Premier semestre',DATE '2027-03-21',DATE '2027-04-20');
 p2:=public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'P','Période personnalisée',DATE '2027-04-21',DATE '2027-05-20');
 v:=public.schoolnet_school_grading_configuration(a_school);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'periods') row
    WHERE row->>'id'=p1::text AND row->>'code'='S1')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'periods') row
    WHERE row->>'id'=p2::text AND row->>'code'='P01')
 THEN RAISE EXCEPTION 'C3A1_BAD_KIND_PREFIX'; END IF;
 p1:=public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'T','Troisième trimestre',DATE '2027-05-21',DATE '2027-06-20');
 v:=public.schoolnet_school_grading_configuration(a_school);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'periods') row
    WHERE row->>'id'=p1::text AND row->>'code'='T3')
 THEN RAISE EXCEPTION 'C3A1_THIRD_TRIMESTER_NOT_SEQUENTIAL'; END IF;
 RAISE NOTICE 'C3A1_PASS_TYPES_TRIMESTER_SEMESTER_CUSTOM';
 BEGIN
  PERFORM public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'T','Trimestre quatre',DATE '2027-06-21',DATE '2027-07-01');
  RAISE EXCEPTION 'C3A1_TRIMESTER_LIMIT_BYPASSED';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C3A1_PASS_TRIMESTER_LIMIT'; END;
 BEGIN
  PERFORM public.schoolnet_school_upsert_grading_period(a_school,NULL,year_id,
   'X7','Code non autorise',DATE '2027-06-21',DATE '2027-07-01');
  RAISE EXCEPTION 'C3A1_FREE_CODE_ALLOWED';
 EXCEPTION WHEN check_violation THEN RAISE NOTICE 'C3A1_PASS_FREE_CODE_DENIED'; END;
END $school_a$;
RESET ROLE;

-- Same code in school B is valid; neither school can read the other's rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $school_b$
DECLARE v jsonb; p uuid;
BEGIN
 p:=public.schoolnet_school_upsert_grading_period(
 '20000000-0000-4000-8000-000000000002',NULL,
 '30000000-0000-4000-8000-000000000001','T1','Trimestre B',
 DATE '2026-09-01',DATE '2026-12-20');
 v:=public.schoolnet_school_grading_configuration('20000000-0000-4000-8000-000000000002');
 IF jsonb_array_length(v->'periods')<>1 OR v->'periods'->0->>'id'<>p::text
 OR jsonb_array_length(v->'assessments')<>1
 THEN RAISE EXCEPTION 'C3A_BAD_READ_B'; END IF;
 RAISE NOTICE 'C3A_PASS_SCHOOL_B_SAME_CODE';
END $school_b$;
RESET ROLE;

-- Teacher can't read Admin configuration, and revoked membership loses access.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $teacher$
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_grading_configuration('20000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3A_TEACHER_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_TEACHER_DENIED'; END;
END $teacher$;
RESET ROLE;

UPDATE public.schoolnet_school_memberships SET status='revoked'
 WHERE school_id='20000000-0000-4000-8000-000000000001'
 AND user_id='10000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $revoked$
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_grading_configuration('20000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3A_REVOKED_ADMIN_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_REVOKED_ADMIN_DENIED'; END;
END $revoked$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_grading_configuration('20000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'C3A_ANON_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'C3A_PASS_ANON_DENIED'; END;
END $anon$;
RESET ROLE;
ROLLBACK;
SELECT 'S4C3A_TENANT_FIXTURE_ROLLED_BACK' AS result;
