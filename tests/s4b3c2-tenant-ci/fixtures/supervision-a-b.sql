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


-- Verifications C2, exclusivement dans une transaction annulee.
INSERT INTO public.assessment_submissions(assessment_id,student_id,status)
VALUES
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','submitted'),
 ('a0000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000006','published');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $school_a$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_school_assessment_supervision('20000000-0000-4000-8000-000000000001');
 IF v->>'schoolId'<>'20000000-0000-4000-8000-000000000001'
 OR (v->>'assessmentCount')::integer<>2
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'assessments') a(x)
    WHERE a.x->>'courseId'='70000000-0000-4000-8000-000000000002')
 OR (SELECT sum((a.x->>'submitted')::integer) FROM jsonb_array_elements(v->'assessments') a(x))<>1
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'assessments') a(x)
    WHERE a.x ?| array['studentId','studentName','score','answers','feedback'])
 THEN RAISE EXCEPTION 'C2_FAIL_SCHOOL_A'; END IF;
 RAISE NOTICE 'C2_PASS_SCHOOL_A';
 BEGIN
  PERFORM public.schoolnet_school_assessment_supervision('20000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'C2_FAIL_FOREIGN_SCHOOL_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'C2_PASS_FOREIGN_SCHOOL_DENIED';
 END;
END $school_a$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $school_b$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_school_assessment_supervision('20000000-0000-4000-8000-000000000002');
 IF (v->>'assessmentCount')::integer<>1 OR
 (SELECT sum((a.x->>'published')::integer) FROM jsonb_array_elements(v->'assessments') a(x))<>1
 THEN RAISE EXCEPTION 'C2_FAIL_SCHOOL_B'; END IF;
 RAISE NOTICE 'C2_PASS_SCHOOL_B';
END $school_b$;
RESET ROLE;
UPDATE public.schoolnet_school_teacher_subject_assignments SET status='revoked'
 WHERE id='60000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $revocation$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_school_assessment_supervision('20000000-0000-4000-8000-000000000001');
 IF (v->>'assessmentCount')::integer<>0 THEN RAISE EXCEPTION 'C2_FAIL_REVOKED_ASSIGNMENT'; END IF;
 RAISE NOTICE 'C2_PASS_REVOKED_ASSIGNMENT';
END $revocation$;
RESET ROLE;
ROLLBACK;
