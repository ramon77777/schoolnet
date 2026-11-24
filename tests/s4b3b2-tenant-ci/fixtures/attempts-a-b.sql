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

-- B.2 : les echantillons restent ouverts pour les futures CI (pas de date fixe).
ALTER TABLE public.assessments ADD COLUMN exam_window_minutes integer;
UPDATE public.assessments
 SET due_at=clock_timestamp()+interval '7 days'
 WHERE id='a0000000-0000-4000-8000-000000000001'::uuid;
UPDATE public.assessments SET due_at=clock_timestamp()+interval '7 days'
 WHERE id='a0000000-0000-4000-8000-000000000004'::uuid;
INSERT INTO public.assessments(
 id,course_id,type,status,title,created_by,due_at,description,submission_mode
) VALUES(
 'a0000000-0000-4000-8000-000000000006',
 '70000000-0000-4000-8000-000000000001',
 'assignment','published','Devoir texte officiel',
 '10000000-0000-4000-8000-000000000003',
 clock_timestamp()+interval '7 days','Rédigez un paragraphe','online'
);
INSERT INTO schoolnet_private.school_assessment_links(
 assessment_id,school_course_link_id,linked_by
) SELECT
 'a0000000-0000-4000-8000-000000000006',l.id,
 '10000000-0000-4000-8000-000000000003'
 FROM schoolnet_private.school_course_links l
 WHERE l.course_id='70000000-0000-4000-8000-000000000001'::uuid;

-- Le service B.2 ne doit pas exposer la RPC a anon.
DO $acl$
BEGIN
 IF has_function_privilege('anon',
  'public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('anon',
  'schoolnet_private.student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 OR NOT has_function_privilege('authenticated',
  'public.schoolnet_student_school_assessment_attempt(uuid,uuid,text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'B2_FAIL_ACL'; END IF;
END $acl$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student_a$
DECLARE
 v_course uuid:='70000000-0000-4000-8000-000000000001';
 v_assessment uuid:='a0000000-0000-4000-8000-000000000001';
 v_question uuid:='b0000000-0000-4000-8000-000000000001';
 v_question2 uuid:='b0000000-0000-4000-8000-000000000002';
 v_good uuid:='d0000000-0000-4000-8000-000000000002';
 v_bad uuid:='d0000000-0000-4000-8000-000000000003';
 v jsonb;
 v_attempt uuid;
 v_answers jsonb;
 v_denied boolean;
BEGIN
 v:=public.schoolnet_student_school_assessment_attempt(
  v_course,v_assessment,'read');
 IF v->>'status'<>'not_started' OR jsonb_array_length(v->'answers')<>0
 OR (v ? 'score') OR (v ? 'studentId') OR (v ? 'isCorrect')
 THEN RAISE EXCEPTION 'B2_FAIL_READ_BEFORE_START'; END IF;

 v_denied:=false;
 BEGIN
   PERFORM public.schoolnet_student_school_assessment_attempt(
    v_course,v_assessment,'save','[]'::jsonb);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'B2_FAIL_SAVE_WITHOUT_START'; END IF;

 v:=public.schoolnet_student_school_assessment_attempt(v_course,v_assessment,'start');
 IF v->>'status'<>'in_progress' OR (v->>'startedAt') IS NULL
 OR (v->>'expiresAt') IS NULL OR (v->>'attemptId') IS NULL
 THEN RAISE EXCEPTION 'B2_FAIL_START'; END IF;
 v_attempt:=(v->>'attemptId')::uuid;
 IF (SELECT count(*) FROM public.s4b3b2_progress_probe)<>0
 THEN RAISE EXCEPTION 'B2_FAIL_OFFICIAL_CREATED_V1_PROGRESS'; END IF;
 v:=public.schoolnet_student_school_assessment_attempt(v_course,v_assessment,'start');
 IF (v->>'attemptId')::uuid<>v_attempt
 THEN RAISE EXCEPTION 'B2_FAIL_DUPLICATE_START'; END IF;

 v_answers:=jsonb_build_array(
  jsonb_build_object('questionId',v_question,'choiceId',v_good,'answerText',null),
  jsonb_build_object('questionId',v_question2,'choiceId',null,'answerText','Le résultat est 4.')
 );
 v:=public.schoolnet_student_school_assessment_attempt(
   v_course,v_assessment,'save',v_answers,NULL);
 IF v->>'status'<>'in_progress' OR jsonb_array_length(v->'answers')<>2
 OR (v ? 'grade') OR (v ? 'score')
 OR (v #> '{answers,0}') ? 'is_correct'
 THEN RAISE EXCEPTION 'B2_FAIL_SAVE_PAYLOAD'; END IF;

 -- Une mauvaise valeur doit faire ROLLBACK de l'appel, sans supprimer le brouillon.
 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_attempt(
   v_course,v_assessment,'save',
   jsonb_build_array(jsonb_build_object(
    'questionId',v_question,'choiceId',v_bad)),NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'B2_FAIL_FOREIGN_CHOICE_ALLOWED'; END IF;
 v:=public.schoolnet_student_school_assessment_attempt(v_course,v_assessment,'read');
 IF jsonb_array_length(v->'answers')<>2
 THEN RAISE EXCEPTION 'B2_FAIL_ROLLBACK_OF_REJECTED_SAVE'; END IF;

 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_attempt(
   v_course,v_assessment,'save',
   jsonb_build_array(jsonb_build_object(
    'questionId',v_question,'choiceId',v_good,'isCorrect',true)),NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'B2_FAIL_ANSWER_FORGERY'; END IF;

 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_attempt(
   v_course,v_assessment,'save',
   jsonb_build_array(
    jsonb_build_object('questionId',v_question,'choiceId',v_good),
    jsonb_build_object('questionId',v_question,'choiceId',v_good)),NULL);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'B2_FAIL_DUPLICATE_QUESTION_ALLOWED'; END IF;

 v:=public.schoolnet_student_school_assessment_attempt(
    v_course,v_assessment,'submit',v_answers,NULL);
 IF v->>'status'<>'submitted' OR (v->>'submittedAt') IS NULL
 THEN RAISE EXCEPTION 'B2_FAIL_SUBMIT'; END IF;
 IF (v ? 'score') OR (v ? 'isCorrect') OR
    jsonb_array_length(v->'answers')<>2 OR
    (v #> '{answers,0}') ? 'is_correct'
 THEN RAISE EXCEPTION 'B2_FAIL_GRADE_TAMPERING_OR_DUPLICATES'; END IF;
 -- Une nouvelle tentative de remise est idempotente sans re-notification.
 v:=public.schoolnet_student_school_assessment_attempt(
    v_course,v_assessment,'submit','[]'::jsonb,NULL);
 IF v->>'status'<>'submitted' OR jsonb_array_length(v->'answers')<>2
 THEN RAISE EXCEPTION 'B2_FAIL_IDEMPOTENT_SUBMIT'; END IF;

 v_denied:=false;
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_attempt(
   v_course,v_assessment,'save',v_answers,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'B2_FAIL_EDIT_AFTER_SUBMIT'; END IF;

 IF (SELECT count(*) FROM public.s4b3b2_progress_probe)<>0
 THEN RAISE EXCEPTION 'B2_FAIL_OFFICIAL_LEGACY_SIDE_EFFECTS'; END IF;
 RAISE NOTICE 'B2_PASS_STUDENT_A_ATOMIC_AND_IDEMPOTENT';
END $student_a$;
RESET ROLE;

-- Le modele texte d'un devoir en ligne ne cree pas de devoir fichier.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $assignment$
DECLARE
 v jsonb;
 v_course uuid:='70000000-0000-4000-8000-000000000001';
 v_task uuid:='a0000000-0000-4000-8000-000000000006';
BEGIN
 v:=public.schoolnet_student_school_assessment_attempt(v_course,v_task,'start');
 v:=public.schoolnet_student_school_assessment_attempt(
  v_course,v_task,'submit','[]'::jsonb,'Mon devoir en texte');
 IF v->>'status'<>'submitted' OR v->>'freeformAnswer'<>'Mon devoir en texte'
 THEN RAISE EXCEPTION 'B2_FAIL_ASSIGNMENT_TEXT_SUBMISSION'; END IF;
 IF EXISTS(SELECT 1 FROM public.homework_submissions WHERE homework_id=v_task)
 THEN RAISE EXCEPTION 'B2_FAIL_HOMEWORK_FILE_TABLE_WRITE'; END IF;
 RAISE NOTICE 'B2_PASS_ASSIGNMENT_TEXT_ONLY';
END $assignment$;
RESET ROLE;

-- Eleve B : voir sa propre classe B, jamais une copie de A, meme si
-- course_enrollments V1 contient artificiellement l'inscription A.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b$
DECLARE
 v jsonb;denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_attempt(
   '70000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001','read');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B2_FAIL_CROSS_TENANT_READ'; END IF;
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000004','start');
 IF v->>'status'<>'in_progress' THEN RAISE EXCEPTION 'B2_FAIL_STUDENT_B_START'; END IF;
 v:=public.schoolnet_student_school_assessment_attempt(
  '70000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000004','save',
  jsonb_build_array(jsonb_build_object(
   'questionId','b0000000-0000-4000-8000-000000000003',
   'choiceId','d0000000-0000-4000-8000-000000000003')),NULL);
 IF jsonb_array_length(v->'answers')<>1
 THEN RAISE EXCEPTION 'B2_FAIL_TRUE_FALSE_SAVE'; END IF;
 RAISE NOTICE 'B2_PASS_STUDENT_B_TENANT_ISOLATION';
END $student_b$;
RESET ROLE;

-- Echeance absolue : une copie deja commencee ne peut plus etre modifiee.
UPDATE public.assessments SET due_at=clock_timestamp()-interval '1 second'
 WHERE id='a0000000-0000-4000-8000-000000000004'::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $expired$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_student_school_assessment_attempt(
   '70000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000004','submit',
   jsonb_build_array(jsonb_build_object(
    'questionId','b0000000-0000-4000-8000-000000000003',
    'choiceId','d0000000-0000-4000-8000-000000000003')),NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'B2_FAIL_LATE_SUBMISSION'; END IF;
 RAISE NOTICE 'B2_PASS_SERVER_DEADLINE';
END $expired$;
RESET ROLE;

-- Acces inexistant pour enseignant et parent, sans exposer les copies.
SET LOCAL ROLE authenticated;
DO $roles$
DECLARE id_to_test uuid;denied boolean;
BEGIN
 FOREACH id_to_test IN ARRAY ARRAY[
  '10000000-0000-4000-8000-000000000003'::uuid,
  '10000000-0000-4000-8000-000000000008'::uuid,
  '10000000-0000-4000-8000-000000000007'::uuid
 ] LOOP
  PERFORM set_config('request.jwt.claim.sub',id_to_test::text,true);
  denied:=false;
  BEGIN
   PERFORM public.schoolnet_student_school_assessment_attempt(
    '70000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001','read');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'B2_FAIL_ROLE_BYPASS'; END IF;
 END LOOP;
 RAISE NOTICE 'B2_PASS_PARENT_TEACHER_UNASSIGNED_DENIED';
END $roles$;
RESET ROLE;

-- Parcours historique non officiel : les triggers restent fonctionnels.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $v1$
DECLARE v uuid;
BEGIN
 INSERT INTO public.assessment_submissions(assessment_id,student_id,status)
 VALUES('a0000000-0000-4000-8000-000000000005',auth.uid(),'in_progress')
 RETURNING id INTO v;
 IF (SELECT count(*) FROM public.s4b3b2_progress_probe)<>1
 THEN RAISE EXCEPTION 'B2_FAIL_LEGACY_V1_PROGRESS'; END IF;
 UPDATE public.assessment_submissions SET status='submitted',submitted_at=now()
 WHERE id=v;
 -- Lire la notification uniquement en tant qu'enseignant destinataire.
 PERFORM set_config('request.jwt.claim.sub',
   '10000000-0000-4000-8000-000000000003',true);
 IF NOT EXISTS(SELECT 1 FROM public.notifications n
  WHERE n.event_key='submission:assessment' AND n.related_id=v)
 THEN RAISE EXCEPTION 'B2_FAIL_LEGACY_V1_TEACHER_NOTIFICATION'; END IF;
 RAISE NOTICE 'B2_PASS_LEGACY_V1_UNCHANGED';
END $v1$;
RESET ROLE;

-- Les copies officielles restent invisibles aux SELECT directs (RLS B.0).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $rls$
BEGIN
 IF EXISTS(SELECT 1 FROM public.assessment_submissions s
           WHERE s.assessment_id='a0000000-0000-4000-8000-000000000001'::uuid)
 THEN RAISE EXCEPTION 'B2_FAIL_DIRECT_RLS_READ'; END IF;
 RAISE NOTICE 'B2_PASS_RLS_DIRECT_ACCESS_DENIED';
END $rls$;
RESET ROLE;

-- Controle privilegie CI uniquement : RLS direct continue d'etre ferme.
DO $post_counts$
DECLARE v_student uuid:='10000000-0000-4000-8000-000000000005';
 v_assessment uuid:='a0000000-0000-4000-8000-000000000001';
 v_attempt uuid;
BEGIN
 SELECT id INTO v_attempt FROM public.assessment_submissions
 WHERE assessment_id=v_assessment AND student_id=v_student;
 IF v_attempt IS NULL
 OR (SELECT count(*) FROM public.assessment_submissions
      WHERE assessment_id=v_assessment AND student_id=v_student)<>1
 OR (SELECT count(*) FROM public.submission_answers
      WHERE submission_id=v_attempt)<>2
 OR EXISTS(SELECT 1 FROM public.submission_answers
      WHERE submission_id=v_attempt AND is_correct IS NOT NULL)
 OR (SELECT score FROM public.assessment_submissions WHERE id=v_attempt) IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.notifications
      WHERE event_key='submission:assessment' AND related_id=v_attempt)
 THEN RAISE EXCEPTION 'B2_FAIL_OFFICIAL_COUNTS_GRADE_OR_NOTIFICATIONS'; END IF;
 RAISE NOTICE 'B2_PASS_NO_OFFICIAL_V1_SIDE_EFFECTS';
END $post_counts$;

SELECT 'S4B3B2_A_B_SECURE_ATTEMPTS_PASS' AS result;
ROLLBACK;
