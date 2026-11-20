-- SCHOOLNET S4-B.3-A : isolation A/B et opt-in d'evaluations sur Supabase LOCAL JETABLE.
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


-- Champs actuels V1 requis par le retour JSON B.1 (fixture minimale).
ALTER TABLE public.assessments ADD COLUMN description text;
ALTER TABLE public.assessments ADD COLUMN time_limit_minutes integer;
ALTER TABLE public.assessments ADD COLUMN submission_mode text;
ALTER TABLE public.assessments ADD COLUMN instruction_file_name text;
UPDATE public.assessments
 SET description='Lisez les questions sans enregistrer de reponse.',
     time_limit_minutes=15,max_score=20,submission_mode='online'
 WHERE id='a0000000-0000-4000-8000-000000000001'::uuid;

INSERT INTO schoolnet_private.school_assessment_links
(assessment_id,school_course_link_id,linked_by)
SELECT a.id,l.id,a.created_by
FROM public.assessments a JOIN schoolnet_private.school_course_links l
 ON l.course_id=a.course_id AND l.teacher_id=a.created_by
WHERE a.id IN (
 'a0000000-0000-4000-8000-000000000001'::uuid,
 'a0000000-0000-4000-8000-000000000002'::uuid,
 'a0000000-0000-4000-8000-000000000004'::uuid
);

INSERT INTO public.quiz_questions(id,assessment_id,question_type,prompt,order_index) VALUES
 ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','mcq','Combien font 2+2 ?',1),
 ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','short_text','Expliquez votre calcul.',2),
 ('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004','true_false','B : 3 est impair.',1),
 ('b0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000002','mcq','Brouillon secret',1),
 ('b0000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000005','mcq','V1 non rattache',1);
INSERT INTO public.quiz_choices(id,question_id,choice_text,is_correct,order_index) VALUES
 ('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','3',false,1),
 ('d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','4',true,2),
 ('d0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000003','Vrai',true,1),
 ('d0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000003','Faux',false,2),
 ('d0000000-0000-4000-8000-000000000005','b0000000-0000-4000-8000-000000000004','secret',true,1);

-- Injection d'une inscription V1 A pour l'eleve B : ne doit PAS ouvrir B.1.
INSERT INTO public.course_enrollments(course_id,student_id)
VALUES('70000000-0000-4000-8000-000000000001',
       '10000000-0000-4000-8000-000000000006');

DO $acl$
BEGIN
 IF has_function_privilege('anon','public.schoolnet_student_school_assessment_preview(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.schoolnet_student_school_assessment_preview(uuid,uuid)','EXECUTE')
 OR (SELECT prosecdef FROM pg_proc WHERE oid='public.schoolnet_student_school_assessment_preview(uuid,uuid)'::regprocedure)
 THEN RAISE EXCEPTION 'B1_FAIL_PUBLIC_RPC_ACL'; END IF;
END $acl$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student_a$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_student_school_assessment_preview(
  '70000000-0000-4000-8000-000000000001'::uuid,
  'a0000000-0000-4000-8000-000000000001'::uuid);
 IF v->>'title'<>'Quiz A publie' OR
  v->>'courseId'<>'70000000-0000-4000-8000-000000000001' OR
  v->>'assessmentId'<>'a0000000-0000-4000-8000-000000000001' OR
  v->>'description'<>'Lisez les questions sans enregistrer de reponse.' OR
  v->>'timeLimitMinutes'<>'15' OR
  v->>'maxScore'<>'20' OR
  jsonb_array_length(v->'questions')<>2 OR
  (SELECT count(*) FROM jsonb_object_keys(v))<>13 OR
  (v #>> '{questions,0,type}')<>'mcq' OR
  (v #>> '{questions,0,prompt}')<>'Combien font 2+2 ?' OR
  jsonb_array_length(v #> '{questions,0,choices}')<>2 OR
  (v #>> '{questions,0,choices,1,text}')<>'4' OR
  (v #>> '{questions,1,type}')<>'short_text' OR
  jsonb_array_length(v #> '{questions,1,choices}')<>0
 THEN RAISE EXCEPTION 'B1_FAIL_STUDENT_A_ALLOWED_PAYLOAD'; END IF;

 IF v ? 'score' OR v ? 'correction' OR v ? 'submission' OR
    v ? 'studentId' OR v ? 'instructionFileUrl' OR
    (v #> '{questions,0,choices,1}') ? 'isCorrect' OR
    (v #> '{questions,0,choices,1}') ? 'is_correct' OR
    (v #> '{questions,0}') ? 'answer' OR
    (SELECT count(*) FROM jsonb_object_keys(v #> '{questions,0}'))<>5 OR
    (SELECT count(*) FROM jsonb_object_keys(v #> '{questions,0,choices,1}'))<>3
 THEN RAISE EXCEPTION 'B1_FAIL_LEAK_ANSWER_OR_GRADE'; END IF;
 RAISE NOTICE 'B1_PASS_A_SAFE_QUESTIONS';
END $student_a$;

-- Refus du brouillon, cours V1, mauvais cours et evaluation historique non liee.
DO $student_a_denials$
DECLARE v_denied boolean;
 v_course uuid:='70000000-0000-4000-8000-000000000001'::uuid;
 v_assessment uuid;
BEGIN
 FOREACH v_assessment IN ARRAY ARRAY[
 'a0000000-0000-4000-8000-000000000002'::uuid,
 'a0000000-0000-4000-8000-000000000003'::uuid,
 'a0000000-0000-4000-8000-000000000004'::uuid,
 'a0000000-0000-4000-8000-000000000005'::uuid
 ] LOOP
  v_denied:=false;
  BEGIN
    PERFORM public.schoolnet_student_school_assessment_preview(v_course,v_assessment);
  EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'B1_FAIL_UNAUTHORIZED_ASSESSMENT %',v_assessment; END IF;
 END LOOP;

 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_preview(
   '70000000-0000-4000-8000-000000000003'::uuid,
   'a0000000-0000-4000-8000-000000000005'::uuid);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'B1_FAIL_V1_ENROLLMENT_BYPASS'; END IF;
 RAISE NOTICE 'B1_PASS_DRAFT_UNLINKED_AND_V1_DENIED';
END $student_a_denials$;

-- Eleve B : autorise pour SON cours, refuse pour celui de A malgré une inscription V1 artificielle.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b$
DECLARE v jsonb;denied boolean:=false;
BEGIN
 v:=public.schoolnet_student_school_assessment_preview(
  '70000000-0000-4000-8000-000000000002'::uuid,
  'a0000000-0000-4000-8000-000000000004'::uuid);
 IF v->>'title'<>'Quiz B publie' OR jsonb_array_length(v->'questions')<>1
 THEN RAISE EXCEPTION 'B1_FAIL_STUDENT_B_OWN_COURSE'; END IF;

 BEGIN
  PERFORM public.schoolnet_student_school_assessment_preview(
   '70000000-0000-4000-8000-000000000001'::uuid,
   'a0000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B1_FAIL_STUDENT_B_SEES_A'; END IF;
 RAISE NOTICE 'B1_PASS_B_OWN_COURSE_AND_CROSS_TENANT_DENIED';
END $student_b$;

-- Parent, enseignant, eleve sans ecole : aucun droit direct ni URL devinée.
DO $role_denials$
DECLARE v_id uuid;denied boolean;
BEGIN
 FOREACH v_id IN ARRAY ARRAY[
 '10000000-0000-4000-8000-000000000003'::uuid,
 '10000000-0000-4000-8000-000000000007'::uuid,
 '10000000-0000-4000-8000-000000000008'::uuid
 ] LOOP
  PERFORM set_config('request.jwt.claim.sub',v_id::text,true);
  denied:=false;
  BEGIN
   PERFORM public.schoolnet_student_school_assessment_preview(
    '70000000-0000-4000-8000-000000000001'::uuid,
    'a0000000-0000-4000-8000-000000000001'::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'B1_FAIL_ROLE_BYPASS %',v_id; END IF;
 END LOOP;
 RAISE NOTICE 'B1_PASS_TEACHER_PARENT_AND_UNASSIGNED_DENIED';
END $role_denials$;
RESET ROLE;

-- Apres depublication, puis revocation du lien, aucune previsualisation.
UPDATE public.assessments SET status='draft'
 WHERE id='a0000000-0000-4000-8000-000000000004'::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $unpublish$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_preview(
   '70000000-0000-4000-8000-000000000002'::uuid,
   'a0000000-0000-4000-8000-000000000004'::uuid);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B1_FAIL_UNPUBLISHED_VISIBLE'; END IF;
 RAISE NOTICE 'B1_PASS_UNPUBLISHED_DENIED';
END $unpublish$;
RESET ROLE;

UPDATE schoolnet_private.school_assessment_links
 SET status='revoked',revoked_at=now(),
 revoked_by='10000000-0000-4000-8000-000000000003'::uuid
 WHERE assessment_id='a0000000-0000-4000-8000-000000000001'::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $revoke$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_preview(
   '70000000-0000-4000-8000-000000000001'::uuid,
   'a0000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B1_FAIL_REVOKED_VISIBLE'; END IF;
 RAISE NOTICE 'B1_PASS_REVOKED_DENIED';
END $revoke$;
RESET ROLE;

-- Aucun envoi de copie, progression ou inscription créée par B.1.
DO $conservation$
BEGIN
 IF (SELECT count(*) FROM public.course_enrollments)<>2
 OR (SELECT count(*) FROM public.student_progress)<>1
 OR (SELECT count(*) FROM public.assessment_submissions)<>0
 OR (SELECT count(*) FROM public.homework_submissions)<>0
 THEN RAISE EXCEPTION 'B1_FAIL_UNEXPECTED_DATA_WRITE'; END IF;
 RAISE NOTICE 'B1_PASS_NO_SUBMISSION_OR_PROGRESS_WRITES';
END $conservation$;

SELECT 'S4B3B1_A_B_SAFE_PREVIEW_PASS' AS result;
ROLLBACK;
