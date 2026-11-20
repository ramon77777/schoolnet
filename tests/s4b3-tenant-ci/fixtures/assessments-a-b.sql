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

-- AUCUNE evaluation ne doit etre visible sans opt-in.
SET LOCAL ROLE authenticated;
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $before_link$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001');
 IF v->>'courseId'<>'70000000-0000-4000-8000-000000000001'
 OR jsonb_array_length(v->'assessments')<>0
 THEN RAISE EXCEPTION 'S4B3A_FAIL_AUTO_IMPORT'; END IF;
 RAISE NOTICE 'S4B3A_PASS_EMPTY_BEFORE_OPT_IN';
END;$before_link$;

-- Enseignant A : contexte, opt-in, evaluation libre refusee,
-- absence de lecture et d'ecriture sur l'ecole B.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $teacher_a$
DECLARE v jsonb;denied boolean:=false;
BEGIN
 v:=public.schoolnet_teacher_school_assessment_context('a0000000-0000-4000-8000-000000000001');
 IF v->>'eligible'<>'true' OR v->>'linked'<>'false'
  OR v->>'schoolName'<>'Ecole A'
  OR (SELECT count(*) FROM jsonb_object_keys(v))<>9
 THEN RAISE EXCEPTION 'S4B3A_FAIL_TEACHER_A_CONTEXT'; END IF;

 IF NOT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000001')
 OR NOT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000001')
 OR NOT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000002')
 THEN RAISE EXCEPTION 'S4B3A_FAIL_TEACHER_A_LINK'; END IF;
 v:=public.schoolnet_teacher_school_assessment_context('a0000000-0000-4000-8000-000000000001');
 IF v->>'linked'<>'true' THEN RAISE EXCEPTION 'S4B3A_FAIL_LINK_NOT_VISIBLE'; END IF;

 BEGIN PERFORM public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000004');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_TEACHER_A_LINKED_B'; END IF;

 v:=public.schoolnet_teacher_school_assessment_context('a0000000-0000-4000-8000-000000000005');
 IF v->>'eligible'<>'false' OR v->>'linked'<>'false'
 THEN RAISE EXCEPTION 'S4B3A_FAIL_FREE_V1_CONTEXT'; END IF;
 denied:=false;
 BEGIN PERFORM public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000005');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_FREE_V1_LINK'; END IF;
 RAISE NOTICE 'S4B3A_PASS_TEACHER_A';
END;$teacher_a$;

-- Origine de Preview interdite pour les ecritures.
SELECT set_config('request.headers','{"origin":"https://schoolnet-preview.vercel.app"}',true);
DO $preview_deny$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.schoolnet_teacher_unlink_school_assessment('a0000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_PREVIEW_WRITE'; END IF;
 RAISE NOTICE 'S4B3A_PASS_PREVIEW_WRITE_DENIED';
END;$preview_deny$;
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
DO $teacher_b$
DECLARE denied boolean:=false;
BEGIN
 IF NOT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000004')
 THEN RAISE EXCEPTION 'S4B3A_FAIL_TEACHER_B_LINK'; END IF;
 BEGIN PERFORM public.schoolnet_teacher_school_assessment_context('a0000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_TEACHER_B_CONTEXT_A'; END IF;
 RAISE NOTICE 'S4B3A_PASS_TEACHER_B';
END;$teacher_b$;

-- Eleve A : uniquement son Quiz A publie et approuve.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student_a$
DECLARE v jsonb;denied boolean:=false;
BEGIN
 v:=public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001');
 IF jsonb_array_length(v->'assessments')<>1
 OR v->'assessments'->0->>'title'<>'Quiz A publie'
 OR v::text LIKE '%Devoir A brouillon%'
 OR v::text LIKE '%historique non lie%'
 OR v::text LIKE '%Quiz B publie%'
 OR v::text LIKE '%Quiz libre V1%'
 OR v::text LIKE '%points%'
 OR v::text LIKE '%score%'
 OR v::text LIKE '%student_id%'
 THEN RAISE EXCEPTION 'S4B3A_FAIL_STUDENT_A_CATALOG'; END IF;
 BEGIN PERFORM public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_STUDENT_A_CROSS_SCHOOL'; END IF;
 denied:=false;
 BEGIN PERFORM public.schoolnet_teacher_school_assessment_context('a0000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_STUDENT_CALL_TEACHER'; END IF;
 RAISE NOTICE 'S4B3A_PASS_STUDENT_A';
END;$student_a$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000002');
 IF jsonb_array_length(v->'assessments')<>1
 OR v->'assessments'->0->>'title'<>'Quiz B publie'
 OR v::text LIKE '%Quiz A publie%'
 THEN RAISE EXCEPTION 'S4B3A_FAIL_STUDENT_B'; END IF;
 RAISE NOTICE 'S4B3A_PASS_STUDENT_B';
END;$student_b$;

-- Revocation du lien d'evaluation : elle disparait chez l'eleve.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $unlink$
BEGIN
 IF NOT public.schoolnet_teacher_unlink_school_assessment('a0000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'S4B3A_FAIL_UNLINK'; END IF;
 IF public.schoolnet_teacher_unlink_school_assessment('a0000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'S4B3A_FAIL_UNLINK_IDEMPOTENCE'; END IF;
 RAISE NOTICE 'S4B3A_PASS_UNLINK';
END;$unlink$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $after_unlink$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001')->'assessments')<>0
 THEN RAISE EXCEPTION 'S4B3A_FAIL_STUDENT_AFTER_UNLINK'; END IF;
 RAISE NOTICE 'S4B3A_PASS_UNLINK_HIDDEN';
END;$after_unlink$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000001');

-- Suspension ou changement de statut = restriction immediate.
RESET ROLE;
UPDATE public.assessments SET status='closed'
WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
-- En lecture etudiant, une evaluation cloturee reste invisible.
-- La clause WHERE du DO precedent est introduite ci-dessous.

DO $after_closed$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001')->'assessments')<>0
 THEN RAISE EXCEPTION 'S4B3A_FAIL_CLOSED_VISIBLE'; END IF;
 RAISE NOTICE 'S4B3A_PASS_CLOSED_HIDDEN';
END;$after_closed$;
RESET ROLE;
UPDATE public.assessments SET status='published'
WHERE id='a0000000-0000-4000-8000-000000000001';

-- Revocation de l'affectation de l'eleve.
UPDATE public.schoolnet_school_memberships SET status='revoked'
WHERE school_id='20000000-0000-4000-8000-000000000001'
 AND user_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $revoked_student$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_REVOKED_STUDENT_ACCESS'; END IF;
 RAISE NOTICE 'S4B3A_PASS_REVOKED_STUDENT';
END;$revoked_student$;
RESET ROLE;
UPDATE public.schoolnet_school_memberships SET status='active'
WHERE school_id='20000000-0000-4000-8000-000000000001'
 AND user_id='10000000-0000-4000-8000-000000000005';

-- Roles externes au parcours scolaire sont refuses.
SET LOCAL ROLE authenticated;
DO $other_roles$
DECLARE uid uuid;denied boolean;
BEGIN
 FOREACH uid IN ARRAY ARRAY[
 '10000000-0000-4000-8000-000000000007'::uuid,
 '10000000-0000-4000-8000-000000000008'::uuid,
 '10000000-0000-4000-8000-000000000001'::uuid,
 '10000000-0000-4000-8000-000000000003'::uuid
 ] LOOP
  PERFORM set_config('request.jwt.claim.sub',uid::text,true);
  denied:=false;
  BEGIN PERFORM public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_OTHER_ROLE'; END IF;
 END LOOP;
 RAISE NOTICE 'S4B3A_PASS_OTHER_ROLES_DENIED';
END;$other_roles$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.schoolnet_student_school_course_assessments('70000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B3A_FAIL_ANON'; END IF;
 RAISE NOTICE 'S4B3A_PASS_ANON';
END;$anon$;
RESET ROLE;

-- Aucune inscription ni progression V1 de plus; les notes n'existent pas ici.
DO $unchanged$
BEGIN
 IF (SELECT COUNT(*) FROM public.course_enrollments)<>1
 OR (SELECT COUNT(*) FROM public.student_progress)<>1
 OR (SELECT COUNT(*) FROM public.courses)<>3
 OR (SELECT COUNT(*) FROM public.assessments)<>5
 OR (SELECT COUNT(*) FROM schoolnet_private.school_assessment_links)<>3
 THEN RAISE EXCEPTION 'S4B3A_FAIL_LEGACY_CHANGED'; END IF;
 RAISE NOTICE 'S4B3A_PASS_V1_UNCHANGED';
END;$unchanged$;
SELECT 'S4B3A_TENANT_A_B_PASS' AS result;
ROLLBACK;
