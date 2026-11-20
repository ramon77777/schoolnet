-- SCHOOLNET S4-B.3-B.0 : sécurité des remises A/B sur Supabase LOCAL JETABLE.
-- Toutes les identites sont synthetiques. Aucun projet heberge.
BEGIN;
SET LOCAL statement_timeout='45s';

INSERT INTO public.profiles(id,role,full_name) VALUES
 ('10000000-0000-4000-8000-000000000001','school_admin','Admin A'),
 ('10000000-0000-4000-8000-000000000002','school_admin','Admin B'),
 ('10000000-0000-4000-8000-000000000003','teacher','Enseignant A'),
 ('10000000-0000-4000-8000-000000000004','teacher','Enseignant B'),
 ('10000000-0000-4000-8000-000000000005','student','Eleve A'),
 ('10000000-0000-4000-8000-000000000006','student','Eleve B'),
 ('10000000-0000-4000-8000-000000000007','student','Eleve sans ecole'),
 ('10000000-0000-4000-8000-000000000008','parent','Parent sans droit');

INSERT INTO public.schoolnet_schools(id,code,name,status) VALUES
 ('20000000-0000-4000-8000-000000000001','QA-A','Ecole A','active'),
 ('20000000-0000-4000-8000-000000000002','QA-B','Ecole B','active');
INSERT INTO public.schoolnet_school_memberships(school_id,user_id,member_role,status) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','school_admin','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','school_admin','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','teacher','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','teacher','active'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','student','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','student','active');
INSERT INTO public.levels(id,name) VALUES (1,'6e');
INSERT INTO public.school_years(id,name) VALUES ('30000000-0000-4000-8000-000000000001','2026-2027');
INSERT INTO public.academic_subjects(id,name,code,is_active,sort_order) VALUES
 ('40000000-0000-4000-8000-000000000001','Mathematiques','MATH',true,1);
INSERT INTO public.classes(id,school_id,level_id,school_year_id,school_year,name,learning_context) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e A','school'),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e B','school');
INSERT INTO public.schoolnet_school_teacher_subject_assignments
(id,school_id,class_id,school_year_id,teacher_id,subject_id,assigned_by) VALUES
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
INSERT INTO public.schoolnet_school_student_class_assignments
(id,school_id,class_id,school_year_id,student_id,assigned_by) VALUES
 ('61000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001'),
 ('61000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002');

INSERT INTO public.courses(id,title,created_by,class_id,level_id,status) VALUES
 ('70000000-0000-4000-8000-000000000001','Mathematiques A','10000000-0000-4000-8000-000000000003',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000002','Mathematiques B','10000000-0000-4000-8000-000000000004',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000003','Cours libre V1','10000000-0000-4000-8000-000000000003',NULL,1,'active');

INSERT INTO schoolnet_private.school_course_links(
 course_id,school_id,class_id,school_year_id,
 teacher_assignment_id,teacher_id,subject_id,linked_by
) VALUES
 ('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003'),
 ('70000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004');

INSERT INTO public.course_sections(id,course_id,title,order_index) VALUES
 ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','Nombres',1),
 ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','Fractions',2),
 ('80000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002','Geometrie B',1);
INSERT INTO public.resources(id,course_id,section_id,type,title,url,visibility,created_by) VALUES
 ('90000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','pdf','PDF A','https://example.org/a.pdf','public_to_course','10000000-0000-4000-8000-000000000003'),
 ('90000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',NULL,'link','Lien general','https://example.org/intro','public_to_course','10000000-0000-4000-8000-000000000003'),
 ('90000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','pdf','Document enseignant secret','https://example.org/private.pdf','teacher_only','10000000-0000-4000-8000-000000000003'),
 ('90000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000001',NULL,'link','URL dangereuse','javascript:alert(1)','public_to_course','10000000-0000-4000-8000-000000000003'),
 ('90000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003','pdf','Document B','https://example.org/b.pdf','public_to_course','10000000-0000-4000-8000-000000000004');
-- Une inscription V1 volontairement sur un cours LIBRE, non rattache.
INSERT INTO public.course_enrollments(course_id,student_id)
VALUES ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005');
INSERT INTO public.student_progress(course_id,student_id,progress_percent)
VALUES ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005',30);

-- Les evaluations preexistantes restent du domaine V1 tant que
-- l'enseignant n'a pas explicitement cree le lien scolaire.
INSERT INTO public.assessments(id,course_id,section_id,type,status,title,created_by,due_at) VALUES
 ('a0000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','quiz','published','Quiz A publie','10000000-0000-4000-8000-000000000003','2026-11-25T09:00:00Z'),
 ('a0000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',NULL,'assignment','draft','Devoir A brouillon','10000000-0000-4000-8000-000000000003',NULL),
 ('a0000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',NULL,'exam','published','Examen A historique non lie','10000000-0000-4000-8000-000000000003',NULL),
 ('a0000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002',NULL,'quiz','published','Quiz B publie','10000000-0000-4000-8000-000000000004',NULL),
 ('a0000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000003',NULL,'quiz','published','Quiz libre V1','10000000-0000-4000-8000-000000000003',NULL);


-- L'enseignant a volontairement lié une évaluation publiée à sa classe.
INSERT INTO schoolnet_private.school_assessment_links
(assessment_id,school_course_link_id,linked_by)
SELECT 'a0000000-0000-4000-8000-000000000001'::uuid,l.id,
'10000000-0000-4000-8000-000000000003'::uuid
FROM schoolnet_private.school_course_links l
WHERE l.course_id='70000000-0000-4000-8000-000000000001'::uuid;

INSERT INTO public.assessments(id,course_id,type,status,title,created_by) VALUES
 ('a0000000-0000-4000-8000-000000000006','70000000-0000-4000-8000-000000000001','assignment','published','Devoir officiel A','10000000-0000-4000-8000-000000000003'),
 ('a0000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000003','assignment','published','Devoir libre V1','10000000-0000-4000-8000-000000000003');
INSERT INTO schoolnet_private.school_assessment_links
(assessment_id,school_course_link_id,linked_by)
SELECT 'a0000000-0000-4000-8000-000000000006'::uuid,l.id,
'10000000-0000-4000-8000-000000000003'::uuid
FROM schoolnet_private.school_course_links l
WHERE l.course_id='70000000-0000-4000-8000-000000000001'::uuid;

INSERT INTO public.quiz_questions(id,assessment_id,prompt,order_index) VALUES
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Question A officielle',1),
 ('b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005','Question V1 libre',1);
INSERT INTO public.quiz_choices(id,question_id,choice_text,is_correct) VALUES
 ('b1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Réponse secrète A',true),
 ('b1000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000005','Réponse V1',true);

-- Empoisonnement volontaire des tables V1 (le passé ne doit pas ouvrir V2).
INSERT INTO public.course_enrollments(course_id,student_id) VALUES
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005'),
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006');
INSERT INTO public.assessment_submissions(id,assessment_id,student_id,status,score) VALUES
 ('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','graded',8);
INSERT INTO public.homework_submissions(id,homework_id,student_id,status,score) VALUES
 ('c1000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000005','graded',12);
INSERT INTO public.submission_answers(id,submission_id,question_id,answer_text) VALUES
 ('c2000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','Réponse élève A');

-- Student A : l'ancien cours libre est utilisable ; les cours officiels
-- A et B ne permettent aucune lecture ni écriture directe sensible.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.assessment_submissions
 (id,assessment_id,student_id,status,submitted_at,freeform_answer) VALUES
 ('c0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005',
 '10000000-0000-4000-8000-000000000005','submitted',now(),'56');
INSERT INTO public.homework_submissions
 (id,homework_id,student_id,status,file_url,note,submitted_at) VALUES
 ('c1000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000007',
 '10000000-0000-4000-8000-000000000005','submitted','https://example.org/legacy.pdf','Rendu V1',now());
DO $student_a$
DECLARE blocked boolean;
BEGIN
 IF (SELECT count(*) FROM public.assessments WHERE id='a0000000-0000-4000-8000-000000000001'::uuid)<>0
 OR (SELECT count(*) FROM public.quiz_choices WHERE question_id='b0000000-0000-4000-8000-000000000001'::uuid)<>0
 OR (SELECT count(*) FROM public.quiz_choices WHERE question_id='b0000000-0000-4000-8000-000000000005'::uuid)<>1
 OR (SELECT count(*) FROM public.assessment_submissions
     WHERE assessment_id='a0000000-0000-4000-8000-000000000001'::uuid)<>0
 THEN RAISE EXCEPTION 'B0_FAIL_STUDENT_OFFICIAL_RLS'; END IF;

 blocked:=false;
 BEGIN
  INSERT INTO public.assessment_submissions(assessment_id,student_id,status) VALUES
   ('a0000000-0000-4000-8000-000000000001'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,'submitted');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_OFFICIAL_ONLINE_INSERT'; END IF;
 blocked:=false;
 BEGIN
  INSERT INTO public.homework_submissions(homework_id,student_id,status) VALUES
   ('a0000000-0000-4000-8000-000000000006'::uuid,
    '10000000-0000-4000-8000-000000000005'::uuid,'submitted');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_OFFICIAL_HOMEWORK_INSERT'; END IF;
 blocked:=false;
 BEGIN
  UPDATE public.assessment_submissions SET score=20
   WHERE id='c0000000-0000-4000-8000-000000000005'::uuid;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_V1_STUDENT_FORGED_SCORE'; END IF;
 blocked:=false;
 BEGIN
  UPDATE public.homework_submissions SET status='published'
   WHERE id='c1000000-0000-4000-8000-000000000007'::uuid;
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_V1_STUDENT_FORGED_STATUS'; END IF;
 blocked:=false;
 BEGIN
  PERFORM public.publish_assessment_submission('c0000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_STUDENT_PUBLISH_FOREIGN'; END IF;
 blocked:=false;
 BEGIN
  PERFORM public.mark_submission_as_graded('c0000000-0000-4000-8000-000000000005'::uuid,NULL);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_STUDENT_GRADE_V1'; END IF;
 RAISE NOTICE 'B0_PASS_STUDENT_V1_AND_OFFICIAL_DENIED';
END;$student_a$;
RESET ROLE;

-- Student B : l'inscription V1 forcée à A ne révèle aucune bonne réponse.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
DO $student_b$
BEGIN
 IF EXISTS(SELECT 1 FROM public.quiz_choices
           WHERE question_id='b0000000-0000-4000-8000-000000000001'::uuid)
 OR EXISTS(SELECT 1 FROM public.assessment_submissions
           WHERE assessment_id='a0000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'B0_FAIL_TENANT_B_SEES_A'; END IF;
 RAISE NOTICE 'B0_PASS_TENANT_B_ISOLATED';
END;$student_b$;
RESET ROLE;

-- Teacher B : aucune correction possible d'une copie appartenant à A.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
DO $teacher_b$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.publish_assessment_submission('c0000000-0000-4000-8000-000000000005'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_FOREIGN_TEACHER_GRADE'; END IF;
 RAISE NOTICE 'B0_PASS_FOREIGN_TEACHER_DENIED';
END;$teacher_b$;
RESET ROLE;

-- Teacher A : V1 reste corrigible; les anciennes RPC ne publient PAS une
-- soumission officielle tant qu'une RPC B.4 dédiée n'est pas validée.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
DO $teacher_a$
DECLARE blocked boolean;
BEGIN
 IF (SELECT count(*) FROM public.quiz_choices
   WHERE question_id='b0000000-0000-4000-8000-000000000001'::uuid)<>1
 THEN RAISE EXCEPTION 'B0_FAIL_TEACHER_CANNOT_EDIT_OWN_CHOICES'; END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_submissions
    WHERE id='c0000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'B0_FAIL_OWNER_TEACHER_READS_OFFICIAL_COPY_V1'; END IF;
 blocked:=false;
 BEGIN
  INSERT INTO public.submission_question_grades(submission_id,question_id,points_awarded,max_points)
  VALUES ('c0000000-0000-4000-8000-000000000001'::uuid,
   'b0000000-0000-4000-8000-000000000001'::uuid,4,5);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_OWNER_TEACHER_MUTATES_OFFICIAL_COPY_V1'; END IF;
 RAISE NOTICE 'B0_PASS_OWNER_TEACHER_RESTRICTED_TO_OFFICIAL_RPC';

 blocked:=false;
 BEGIN
  PERFORM public.publish_assessment_submission('c0000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_OLD_RPC_PUBLISHED_OFFICIAL'; END IF;
 blocked:=false;
 BEGIN
  PERFORM public.mark_submission_as_graded_v2('c0000000-0000-4000-8000-000000000001'::uuid,
    'essai',0,NULL);
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE='P0001' AND SQLERRM ~* 'autor' THEN
    blocked:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_V2_GRADED_OFFICIAL_WITH_OLD_RPC'; END IF;
 blocked:=false;
 BEGIN
  PERFORM public.publish_homework_submission('c1000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE='P0001' AND SQLERRM ~* 'autor' THEN
    blocked:=true;
  ELSE RAISE; END IF;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'B0_FAIL_V1_RPC_PUBLISHED_OFFICIAL_HOMEWORK'; END IF;
 PERFORM public.mark_submission_as_graded('c0000000-0000-4000-8000-000000000005'::uuid,'Correction V1');
 PERFORM public.publish_assessment_submission('c0000000-0000-4000-8000-000000000005'::uuid);
 IF (SELECT status::text FROM public.assessment_submissions
  WHERE id='c0000000-0000-4000-8000-000000000005'::uuid)<>'published'
 THEN RAISE EXCEPTION 'B0_FAIL_V1_CORRECTION_REGRESSION'; END IF;
 RAISE NOTICE 'B0_PASS_TEACHER_V1_COMPATIBLE_AND_OFFICIAL_LOCKED';
END;$teacher_a$;
RESET ROLE;
-- Une révocation ultérieure ne rétablit PAS les anciennes voies V1.
UPDATE schoolnet_private.school_assessment_links
 SET status='revoked',revoked_at=now(),
 revoked_by='10000000-0000-4000-8000-000000000003'::uuid
 WHERE assessment_id='a0000000-0000-4000-8000-000000000001'::uuid;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
SET LOCAL ROLE authenticated;
DO $revoked$
BEGIN
 IF schoolnet_private.s4b3b0_is_official_assessment(
      'a0000000-0000-4000-8000-000000000001'::uuid) IS DISTINCT FROM true
 OR EXISTS(SELECT 1 FROM public.quiz_choices
      WHERE question_id='b0000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'B0_FAIL_REVOKED_LINK_LEAK'; END IF;
 RAISE NOTICE 'B0_PASS_REVOKED_LINK_STILL_PROTECTED';
END;$revoked$;
RESET ROLE;

DO $final$
BEGIN
 IF (SELECT count(*) FROM public.course_enrollments)<>3
 OR (SELECT count(*) FROM public.student_progress)<>1
 OR (SELECT count(*) FROM public.assessment_submissions)<>2
 OR (SELECT count(*) FROM public.homework_submissions)<>2
 OR has_function_privilege('authenticated','public.recalculate_submission_score(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'B0_FAIL_DATA_OR_RPC_ACL_DRIFT'; END IF;
 RAISE NOTICE 'B0_PASS_NO_FAKE_ENROLLMENT_OR_PROGRESS';
END;$final$;
SELECT 'S4B3B0_SECURITY_A_B_PASS' AS result;
ROLLBACK;
