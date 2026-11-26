-- C3-C.3.5.2 fixture: all ten profile IDs originate from REAL local GoTrue.
-- Invoked only by the localhost integration runner via psql -v key=auth-user-id.
-- Every identifier and every score is fictitious; do NOT use with hosted DB.
BEGIN;
DO $local$
BEGIN
 IF to_regclass('schoolnet_private.school_official_curricula') IS NULL
  OR to_regprocedure('auth.uid()') IS NULL
  OR (SELECT count(*) FROM public.schoolnet_schools)<>0
 THEN RAISE EXCEPTION 'C3C352_SEED_ONLY_PRISTINE_LOCAL_DB'; END IF;
END $local$;

INSERT INTO public.schoolnet_schools(id,status) VALUES
 ('00000000-0000-4000-8000-000000000010','active'),
 ('00000000-0000-4000-8000-000000000011','active');
INSERT INTO public.school_years(id) VALUES ('00000000-0000-4000-8000-000000000020');
INSERT INTO public.classes(id,school_id,school_year_id,learning_context) VALUES
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','school'),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','school');
INSERT INTO schoolnet_private.school_grading_periods(id,school_id,school_year_id,is_locked) VALUES
 ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',false),
 ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020',false),
 ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020',true);
INSERT INTO public.academic_subjects(id,is_active,name,sort_order) VALUES
 ('00000000-0000-4000-8000-000000000050',true,'Mathématiques fictives',1),
 ('00000000-0000-4000-8000-000000000051',true,'Français fictif',2);

INSERT INTO public.profiles(id,role,full_name) VALUES
 (:'admin_a'::uuid,'school_admin','Admin A fictif'),
 (:'admin_b'::uuid,'school_admin','Admin B fictif'),
 (:'teacher_a'::uuid,'teacher','Enseignant A fictif'),
 (:'teacher_b'::uuid,'teacher','Enseignant B fictif'),
 (:'parent_a'::uuid,'parent','Parent fictif'),
 (:'student_a1'::uuid,'student','Élève fictif A1'),
 (:'student_a2'::uuid,'student','Élève fictif A2'),
 (:'student_a3'::uuid,'student','Élève fictif A3'),
 (:'student_b1'::uuid,'student','Élève fictif B1'),
 (:'student_transfer'::uuid,'student','Élève fictif en transfert');

INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,status,revoked_at) VALUES
 ('00000000-0000-4000-8000-000000000010',:'admin_a'::uuid,'school_admin','active',NULL),
 ('00000000-0000-4000-8000-000000000011',:'admin_b'::uuid,'school_admin','active',NULL),
 ('00000000-0000-4000-8000-000000000010',:'teacher_a'::uuid,'teacher','active',NULL),
 ('00000000-0000-4000-8000-000000000011',:'teacher_b'::uuid,'teacher','active',NULL),
 ('00000000-0000-4000-8000-000000000010',:'parent_a'::uuid,'parent','active',NULL),
 ('00000000-0000-4000-8000-000000000010',:'student_a1'::uuid,'student','active',NULL),
 ('00000000-0000-4000-8000-000000000010',:'student_a2'::uuid,'student','active',NULL),
 ('00000000-0000-4000-8000-000000000010',:'student_a3'::uuid,'student','active',NULL),
 ('00000000-0000-4000-8000-000000000011',:'student_b1'::uuid,'student','active',NULL),
 ('00000000-0000-4000-8000-000000000010',:'student_transfer'::uuid,'student','active',NULL),
 ('00000000-0000-4000-8000-000000000011',:'student_transfer'::uuid,'student','active',NULL);

INSERT INTO public.schoolnet_school_student_class_assignments(
 school_id,school_year_id,class_id,student_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030',:'student_a1'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030',:'student_a2'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030',:'student_a3'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030',:'student_transfer'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031',:'student_b1'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031',:'student_transfer'::uuid,'active',NULL);

INSERT INTO public.schoolnet_school_teacher_subject_assignments(
 id,school_id,school_year_id,class_id,subject_id,teacher_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050',:'teacher_a'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000051',:'teacher_a'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000050',:'teacher_b'::uuid,'active',NULL);
INSERT INTO public.courses(id,created_by,status) VALUES
 ('00000000-0000-4000-8000-000000000080',:'teacher_a'::uuid,'active'),
 ('00000000-0000-4000-8000-000000000081',:'teacher_a'::uuid,'active'),
 ('00000000-0000-4000-8000-000000000082',:'teacher_b'::uuid,'active');

INSERT INTO schoolnet_private.school_course_links(
 id,course_id,school_id,school_year_id,class_id,subject_id,teacher_assignment_id,
 teacher_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-0000000000a0','00000000-0000-4000-8000-000000000080','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000090',:'teacher_a'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000091',:'teacher_a'::uuid,'active',NULL),
 ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000092',:'teacher_b'::uuid,'active',NULL);

INSERT INTO public.assessments(id,course_id,created_by,status,max_score) VALUES
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-000000000080',:'teacher_a'::uuid,'published',20),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000081',:'teacher_a'::uuid,'published',10),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-000000000082',:'teacher_b'::uuid,'published',20),
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-000000000080',:'teacher_a'::uuid,'published',20);
INSERT INTO schoolnet_private.school_assessment_links(
 assessment_id,school_course_link_id,status,revoked_at
) VALUES
 ('00000000-0000-4000-8000-0000000000b0','00000000-0000-4000-8000-0000000000a0','active',NULL),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a1','active',NULL),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2','active',NULL),
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-0000000000a0','active',NULL);
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
 ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-000000000040',1,false);
INSERT INTO public.assessment_submissions(assessment_id,student_id,status,score,published_at) VALUES
 ('00000000-0000-4000-8000-0000000000b0',:'student_a1'::uuid,'published',20,now()),
 ('00000000-0000-4000-8000-0000000000b1',:'student_a1'::uuid,'published',5,now()),
 ('00000000-0000-4000-8000-0000000000b4',:'student_a1'::uuid,'published',0,now()),
 ('00000000-0000-4000-8000-0000000000b0',:'student_a2'::uuid,'published',18,now()),
 ('00000000-0000-4000-8000-0000000000b1',:'student_a2'::uuid,'graded',8,NULL),
 ('00000000-0000-4000-8000-0000000000b0',:'student_a3'::uuid,'published',0,now()),
 ('00000000-0000-4000-8000-0000000000b1',:'student_a3'::uuid,'published',0,now()),
 ('00000000-0000-4000-8000-0000000000b0',:'student_transfer'::uuid,'published',10,now()),
 ('00000000-0000-4000-8000-0000000000b1',:'student_transfer'::uuid,'published',10,now()),
 ('00000000-0000-4000-8000-0000000000b2',:'student_transfer'::uuid,'published',20,now()),
 ('00000000-0000-4000-8000-0000000000b2',:'student_b1'::uuid,'published',17,now());
COMMIT;
SELECT 'C3C352_REAL_AUTH_FIXTURE_READY' AS verdict;
