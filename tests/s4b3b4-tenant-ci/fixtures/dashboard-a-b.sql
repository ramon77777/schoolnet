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


-- B.3 : rendre les dates des echantillons compatibles avec une CI future.
ALTER TABLE public.assessments ADD COLUMN exam_window_minutes integer;
UPDATE public.assessments SET due_at=clock_timestamp()+interval '7 days',
    max_score=20,submission_mode='online'
WHERE id IN ('a0000000-0000-4000-8000-000000000001'::uuid,
             'a0000000-0000-4000-8000-000000000004'::uuid);

-- Tentative A et soumission : le brouillon reste prive.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student_a$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001','start');
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001','submit',
  jsonb_build_array(
   jsonb_build_object('questionId','b0000000-0000-4000-8000-000000000001','choiceId','d0000000-0000-4000-8000-000000000002','answerText',null),
   jsonb_build_object('questionId','b0000000-0000-4000-8000-000000000002','choiceId',null,'answerText','4')
  ),null);
 IF v->>'status'<>'submitted' THEN RAISE EXCEPTION 'B3_FAIL_STUDENT_A_SUBMIT'; END IF;
 v:=public.schoolnet_student_official_published_result(
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001');
 IF v IS NOT NULL THEN RAISE EXCEPTION 'B3_FAIL_EARLY_RESULT_BEFORE_GRADE'; END IF;
 RAISE NOTICE 'B3_PASS_STUDENT_RESULT_HIDDEN_BEFORE_GRADE';
END $student_a$;
RESET ROLE;

-- Tentative B in_progress : aucun contenu de reponse aux enseignants avant remise.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000004','start');
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000004','save',
  jsonb_build_array(jsonb_build_object(
   'questionId','b0000000-0000-4000-8000-000000000003',
   'choiceId','d0000000-0000-4000-8000-000000000003')),null);
 IF v->>'status'<>'in_progress' THEN RAISE EXCEPTION 'B3_FAIL_STUDENT_B_IN_PROGRESS'; END IF;
END $student_b$;
RESET ROLE;

-- Enseignant B ne peut pas consulter ou noter la classe A.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
DO $teacher_b$
DECLARE v jsonb;denied boolean:=false;
BEGIN
 BEGIN
  v:=public.schoolnet_teacher_official_copies('a0000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_TENANT_CROSS_READ'; END IF;
 denied:=false;
 BEGIN
  v:=public.schoolnet_teacher_official_grade(
   'a0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001'::uuid,
   'grade',20,'Interdit');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_TENANT_CROSS_GRADE'; END IF;
 v:=public.schoolnet_teacher_official_copies('a0000000-0000-4000-8000-000000000004');
 IF v->>'classSize'<>'1' OR v #>> '{counts,inProgress}'<>'1'
  OR jsonb_array_length(v->'copies')<>1
  OR jsonb_array_length(v #> '{copies,0,answers}')<>0
 THEN RAISE EXCEPTION 'B3_FAIL_IN_PROGRESS_ANSWERS_LEAK'; END IF;
 RAISE NOTICE 'B3_PASS_TEACHER_B_TENANT_AND_DRAFT_PRIVACY';
END $teacher_b$;
RESET ROLE;

-- Les parents et les eleves ne peuvent pas utiliser la RPC enseignant.
SET LOCAL ROLE authenticated;
DO $foreign_roles$
DECLARE userid uuid; denied boolean;
BEGIN
 FOREACH userid IN ARRAY ARRAY[
  '10000000-0000-4000-8000-000000000005'::uuid,
  '10000000-0000-4000-8000-000000000008'::uuid
 ] LOOP
  PERFORM set_config('request.jwt.claim.sub',userid::text,true);
  denied:=false;
  BEGIN
   PERFORM public.schoolnet_teacher_official_copies(
    'a0000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_ROLE_BYPASS'; END IF;
 END LOOP;
 RAISE NOTICE 'B3_PASS_ROLE_ISOLATION';
END $foreign_roles$;
RESET ROLE;

-- Enseignant A : copie seule, correction sur 20, puis publication.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $teacher_a$
DECLARE v jsonb; s uuid; denied boolean;
BEGIN
 v:=public.schoolnet_teacher_official_copies('a0000000-0000-4000-8000-000000000001');
 IF v->>'classSize'<>'1' OR v #>> '{counts,submitted}'<>'1'
  OR v->>'maxScore'<>'20'
  OR jsonb_array_length(v->'copies')<>1
  OR jsonb_array_length(v->'questions')<>2
  OR jsonb_array_length(v #> '{copies,0,answers}')<>2
  OR v #>> '{questions,0,choices,1,isCorrect}'<>'true'
 THEN RAISE EXCEPTION 'B3_FAIL_TEACHER_A_LIST'; END IF;
 s:=(v #>> '{copies,0,id}')::uuid;
 IF (SELECT count(*) FROM public.notifications n
     WHERE n.user_id='10000000-0000-4000-8000-000000000003'::uuid
       AND n.event_key='school:assessment:submission:teacher'
       AND n.related_id=s
       AND n.action_url='/app/teacher/assessments/a0000000-0000-4000-8000-000000000001/official-corrections')<>1
 THEN RAISE EXCEPTION 'B3N_FAIL_OFFICIAL_TEACHER_SUBMISSION_NOTIFICATION'; END IF;
 IF (SELECT count(*) FROM public.notifications n
     WHERE n.user_id='10000000-0000-4000-8000-000000000004'::uuid
       AND n.event_key='school:assessment:submission:teacher')<>0
 THEN RAISE EXCEPTION 'B3N_FAIL_CROSS_SCHOOL_NOTIFICATION_LEAK'; END IF;
 RAISE NOTICE 'B3N_PASS_TEACHER_NOTIFIED_ONCE_A_B_SAFE';
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_official_grade(
   'a0000000-0000-4000-8000-000000000001',s,'publish');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_PUBLISH_BEFORE_GRADE'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_official_grade(
   'a0000000-0000-4000-8000-000000000001',s,'grade',21,'Trop');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_GRADE_OVER_MAX'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_official_grade(
   'a0000000-0000-4000-8000-000000000001',s,'grade',17.123,'Trop de decimales');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_GRADE_PRECISION'; END IF;
 v:=public.schoolnet_teacher_official_grade(
  'a0000000-0000-4000-8000-000000000001',s,'grade',17,'Bonne demarche');
 IF v->>'status'<>'graded' OR v->>'score'<>'17'
  OR v->>'publishedAt' IS NOT NULL THEN
  RAISE EXCEPTION 'B3_FAIL_MANUAL_GRADE'; END IF;
 IF EXISTS(SELECT 1 FROM public.notifications WHERE related_id=s
  AND event_key IN ('school:assessment:result:published','correction_published'))
 THEN RAISE EXCEPTION 'B3_FAIL_EARLY_RESULT_NOTIFICATION'; END IF;
 RAISE NOTICE 'B3_PASS_MANUAL_GRADE_STILL_PRIVATE';
END $teacher_a$;
RESET ROLE;

-- L'eleve A ne doit PAS voir sa note meme apres la correction non publiee.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student_unpublished$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_student_official_published_result(
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001');
 IF v IS NOT NULL THEN RAISE EXCEPTION 'B3_FAIL_GRADE_LEAK_BEFORE_PUBLISH'; END IF;
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001','read');
 IF v->>'status'<>'graded' OR (v ? 'score')
 THEN RAISE EXCEPTION 'B3_FAIL_B2_READ_GRADE_LEAK'; END IF;
 RAISE NOTICE 'B3_PASS_GRADE_CONFIDENTIAL_UNTIL_PUBLISH';
END $student_unpublished$;
RESET ROLE;

-- Validation finale par enseignant, effet 1 fois et route V2 correcte.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $publish$
DECLARE v jsonb;s uuid;denied boolean:=false;
BEGIN
 v:=public.schoolnet_teacher_official_copies(
   'a0000000-0000-4000-8000-000000000001');
 s:=(v #>> '{copies,0,id}')::uuid;
 v:=public.schoolnet_teacher_official_grade(
  'a0000000-0000-4000-8000-000000000001',s,'publish');
 IF v->>'status'<>'published' OR (v->>'publishedAt') IS NULL
 THEN RAISE EXCEPTION 'B3_FAIL_PUBLISH'; END IF;
 BEGIN
  PERFORM public.schoolnet_teacher_official_grade(
   'a0000000-0000-4000-8000-000000000001',s,'publish');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_DOUBLE_PUBLISH'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_official_grade(
   'a0000000-0000-4000-8000-000000000001',s,'grade',19,'Retouche interdite');
 EXCEPTION WHEN SQLSTATE '22023' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_EDIT_PUBLISHED'; END IF;
 RAISE NOTICE 'B3_PASS_PUBLISH_IMMUTABLE';
END $publish$;
RESET ROLE;

-- Etudiant A : resultat disponible APRES publication, aucune fuite B.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $result$
DECLARE v jsonb; denied boolean:=false;
BEGIN
 v:=public.schoolnet_student_official_published_result(
  '70000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001');
 IF v->>'score'<>'17' OR v->>'maxScore'<>'20'
  OR v->>'feedback'<>'Bonne demarche' OR (v->>'publishedAt') IS NULL
 THEN RAISE EXCEPTION 'B3_FAIL_STUDENT_PUBLISHED_RESULT'; END IF;
 RAISE NOTICE 'B3_PASS_STUDENT_SEES_ONLY_PUBLISHED';
END $result$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b_no_result$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_student_official_published_result(
   '70000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B3_FAIL_OTHER_STUDENT_SEES_A'; END IF;
 RAISE NOTICE 'B3_PASS_CROSS_SCHOOL_STUDENT_RESULT_DENIED';
END $student_b_no_result$;
RESET ROLE;

-- Verification privilegiee, toujours dans la transaction jetable.
DO $db_assert$
DECLARE s uuid;
BEGIN
 SELECT id INTO s FROM public.assessment_submissions WHERE
 assessment_id='a0000000-0000-4000-8000-000000000001'::uuid;
 IF (SELECT COUNT(*) FROM public.assessment_submissions
      WHERE assessment_id='a0000000-0000-4000-8000-000000000001'::uuid)<>1
 OR (SELECT count(*) FROM public.notifications
     WHERE related_id=s AND event_key='school:assessment:result:published')<>1
 OR EXISTS(SELECT 1 FROM public.notifications
     WHERE related_id=s AND event_key='correction_published')
 OR NOT EXISTS(SELECT 1 FROM public.notifications
     WHERE related_id=s AND action_url=
      '/app/student/school-courses/70000000-0000-4000-8000-000000000001/assessments/a0000000-0000-4000-8000-000000000001/take')
 THEN RAISE EXCEPTION 'B3_FAIL_NOTIFICATION_OR_COPY_COUNT'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE policyname LIKE 's4b3b0_%'
   AND permissive='RESTRICTIVE')<>8 THEN RAISE EXCEPTION 'B3_FAIL_RLS_B0'; END IF;
 RAISE NOTICE 'B3_PASS_OFFICIAL_NOTIFICATION_ONCE';
END $db_assert$;
SELECT 'S4B3B3_OFFICIAL_TEACHER_A_B_PASS' AS result;

-- B.4 : la synthese officielle est strictement limitee aux donnees de l'eleve.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student_b4_a$
DECLARE d jsonb;
BEGIN
 d:=public.schoolnet_student_official_dashboard();
 IF jsonb_array_length(d->'courses')<>1
 OR (d #>> '{courses,0,courseId}')<>'70000000-0000-4000-8000-000000000001'
 OR jsonb_array_length(d->'assessments')<>1
 OR (d #>> '{assessments,0,status}')<>'published'
 OR (d #>> '{assessments,0,score}')<>'17'
 OR (d #>> '{assessments,0,maxScore}')<>'20'
 OR (d #>> '{assessments,0,courseId}')<>'70000000-0000-4000-8000-000000000001'
 OR (d #> '{assessments,0}') ? 'feedback'
 THEN RAISE EXCEPTION 'B4_FAIL_STUDENT_A_SUMMARY'; END IF;
 RAISE NOTICE 'B4_PASS_STUDENT_A_PUBLISHED_SCORE';
END $student_b4_a$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b4_b$
DECLARE d jsonb;
BEGIN
 d:=public.schoolnet_student_official_dashboard();
 IF jsonb_array_length(d->'courses')<>1
 OR (d #>> '{courses,0,courseId}')<>'70000000-0000-4000-8000-000000000002'
 OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(d->'assessments') AS a(item)
  WHERE a.item->>'assessmentId'='a0000000-0000-4000-8000-000000000001'
 )
 THEN RAISE EXCEPTION 'B4_FAIL_STUDENT_B_ISOLATION'; END IF;
 RAISE NOTICE 'B4_PASS_STUDENT_B_ISOLATED';
END $student_b4_b$;
RESET ROLE;
ROLLBACK;
