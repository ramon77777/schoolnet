-- S4-B.1 Recette d'isolation A/B et non-regression V1.
-- BASE SUPABASE LOCALE JETABLE UNIQUEMENT. Toutes les donnees inventees.
BEGIN;
SET LOCAL statement_timeout='30s';

INSERT INTO public.profiles(id,role,full_name) VALUES
 ('10000000-0000-4000-8000-000000000001','school_admin','Admin A'),
 ('10000000-0000-4000-8000-000000000002','school_admin','Admin B'),
 ('10000000-0000-4000-8000-000000000003','teacher','Enseignant A'),
 ('10000000-0000-4000-8000-000000000004','teacher','Enseignant B'),
 ('10000000-0000-4000-8000-000000000005','student','Eleve A'),
 ('10000000-0000-4000-8000-000000000006','student','Eleve B');

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
 ('40000000-0000-4000-8000-000000000001','Mathematiques','MATH',true,1),
 ('40000000-0000-4000-8000-000000000002','Francais','FRA',true,2);
INSERT INTO public.classes(id,school_id,level_id,school_year_id,school_year,name,learning_context) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e A','school'),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e B','school');

INSERT INTO public.schoolnet_school_teacher_subject_assignments
(id,school_id,class_id,school_year_id,teacher_id,subject_id,assigned_by) VALUES
 ('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
 ('60000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');

INSERT INTO public.courses(id,title,created_by,class_id,level_id,status) VALUES
 ('70000000-0000-4000-8000-000000000001','Cours A eligible','10000000-0000-4000-8000-000000000003',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000002','Cours B eligible','10000000-0000-4000-8000-000000000004',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000003','Cours A avec inscrits V1','10000000-0000-4000-8000-000000000003',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000004','Cours A mauvaise classe','10000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000002',1,'active'),
 ('70000000-0000-4000-8000-000000000005','Cours A coenseignant B','10000000-0000-4000-8000-000000000003',NULL,1,'active'),
 ('70000000-0000-4000-8000-000000000006','Cours A archive','10000000-0000-4000-8000-000000000003',NULL,1,'archived'),
 ('70000000-0000-4000-8000-000000000007','Cours A matiere incompatible','10000000-0000-4000-8000-000000000003',NULL,1,'active');

INSERT INTO public.course_enrollments(course_id,student_id) VALUES
 ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005');
INSERT INTO public.student_progress(course_id,student_id,progress_percent) VALUES
 ('70000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005',40);
INSERT INTO public.course_teachers(course_id,teacher_id) VALUES
 ('70000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000004');
INSERT INTO public.course_subjects(course_id,subject_id) VALUES
 ('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000007','40000000-0000-4000-8000-000000000002');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);

DO $teacher_a$
DECLARE ctx jsonb;link1 uuid;link2 uuid;denied boolean;
BEGIN
 ctx:=public.schoolnet_teacher_school_course_context();
 IF jsonb_array_length(ctx->'assignments')<>2
  OR jsonb_array_length(ctx->'links')<>0
  OR ctx::text LIKE '%Ecole B%'
 THEN RAISE EXCEPTION 'S4B1_FAIL: contexte enseignant A'; END IF;

 -- Une Preview ne peut jamais modifier l'affectation.
 PERFORM set_config('request.headers','{"origin":"https://schoolnet-preview.vercel.app"}',true);
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: ecriture Preview autorisee'; END IF;

 PERFORM set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
 link1:=public.schoolnet_teacher_link_school_course(
   '70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
 link2:=public.schoolnet_teacher_link_school_course(
   '70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
 IF link1 IS NULL OR link2 IS DISTINCT FROM link1
 THEN RAISE EXCEPTION 'S4B1_FAIL: rattachement non idempotent'; END IF;
 ctx:=public.schoolnet_teacher_school_course_context();
 IF jsonb_array_length(ctx->'links')<>1
  OR ctx->'links'->0->>'courseId'<>'70000000-0000-4000-8000-000000000001'
  OR ctx::text LIKE '%Cours B eligible%'
 THEN RAISE EXCEPTION 'S4B1_FAIL: fuite dans les liens prof A'; END IF;

 -- Vol de cours d'un autre professeur/ecole.
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: usurpation cours B'; END IF;

 -- Reaffectation frauduleuse a une autre matiere.
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003');
 EXCEPTION WHEN SQLSTATE '23505' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: reutilisation d un cours sur autre matiere'; END IF;

 -- Inscrits V1, classe B, coenseignant et archivage : refus.
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '23514' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: cours V1 avec inscrits accepte'; END IF;

 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: cours classe B accepte en A'; END IF;

 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000005','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '23514' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: coenseignant externe accepte'; END IF;

 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000006','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: cours archive accepte'; END IF;

 denied:=false;
 BEGIN
  PERFORM public.schoolnet_teacher_link_school_course(
    '70000000-0000-4000-8000-000000000007','60000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '23514' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: matiere incompatible acceptee'; END IF;
 RAISE NOTICE 'S4B1_PASS_TEACHER_A: opt-in, idempotence, cours V1 proteges, Preview refusee';
END;
$teacher_a$;

-- Le professeur B n'a aucune visibilite sur A.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
DO $teacher_b$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.schoolnet_teacher_school_course_context();
 IF jsonb_array_length(ctx->'assignments')<>1
 OR jsonb_array_length(ctx->'links')<>0
 OR ctx::text LIKE '%Ecole A%'
 THEN RAISE EXCEPTION 'S4B1_FAIL: fuite A vers professeur B'; END IF;
 RAISE NOTICE 'S4B1_PASS_TEACHER_B: isolation du contexte';
END;
$teacher_b$;

-- Admin A voit un seul cours de A, jamais l'autre ecole.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $admin_a$
DECLARE cat jsonb;denied boolean:=false;
BEGIN
 cat:=public.schoolnet_school_course_catalog('20000000-0000-4000-8000-000000000001');
 IF cat->>'schoolId'<>'20000000-0000-4000-8000-000000000001'
  OR jsonb_array_length(cat->'courses')<>1
  OR cat->'courses'->0->>'courseTitle'<>'Cours A eligible'
  OR cat::text LIKE '%Eleve A%' OR cat::text LIKE '%Cours B eligible%'
 THEN RAISE EXCEPTION 'S4B1_FAIL: mauvais catalogue A'; END IF;
 BEGIN
  PERFORM public.schoolnet_school_course_catalog('20000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: admin A lit ecole B'; END IF;
 RAISE NOTICE 'S4B1_PASS_ADMIN_A: catalogue local strict';
END;
$admin_a$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $admin_b$
DECLARE cat jsonb;denied boolean:=false;
BEGIN
 cat:=public.schoolnet_school_course_catalog('20000000-0000-4000-8000-000000000002');
 IF jsonb_array_length(cat->'courses')<>0
 THEN RAISE EXCEPTION 'S4B1_FAIL: contamination du catalogue B'; END IF;
 BEGIN
  PERFORM public.schoolnet_school_course_catalog('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: admin B lit ecole A'; END IF;
 RAISE NOTICE 'S4B1_PASS_ADMIN_B: aucun cours A en B';
END;
$admin_b$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $student$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.schoolnet_teacher_school_course_context();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: student lit liens enseignant'; END IF;
 denied:=false;
 BEGIN PERFORM public.schoolnet_school_course_catalog('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: student lit cours administratifs'; END IF;
 RAISE NOTICE 'S4B1_PASS_STUDENT: role refuse';
END;
$student$;
RESET ROLE;

-- Retrait du lien par son createur : aucun cours V1 supprime.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
DO $unlink$
DECLARE done boolean;ctx jsonb;
BEGIN
 done:=public.schoolnet_teacher_unlink_school_course('70000000-0000-4000-8000-000000000001');
 IF done IS NOT TRUE THEN RAISE EXCEPTION 'S4B1_FAIL: retrait impossible'; END IF;
 ctx:=public.schoolnet_teacher_school_course_context();
 IF jsonb_array_length(ctx->'links')<>0
 THEN RAISE EXCEPTION 'S4B1_FAIL: lien revoque toujours visible'; END IF;
 done:=public.schoolnet_teacher_unlink_school_course('70000000-0000-4000-8000-000000000001');
 IF done IS NOT FALSE THEN RAISE EXCEPTION 'S4B1_FAIL: retrait repete non idempotent'; END IF;
 PERFORM public.schoolnet_teacher_link_school_course(
  '70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001');
 RAISE NOTICE 'S4B1_PASS_UNLINK: reversible sans toucher a V1';
END;
$unlink$;

-- Interdiction de lire la table privee, meme a un role authentifie.
DO $direct$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM count(*) FROM schoolnet_private.school_course_links;
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: acces direct a la table privee'; END IF;
 RAISE NOTICE 'S4B1_PASS_TABLE: aucun SELECT direct';
END;
$direct$;
RESET ROLE;

-- Revocation d'une affectation : le catalogue du responsable exclut
-- immediatement le cours, sans supprimer de V1.
UPDATE public.schoolnet_school_teacher_subject_assignments
SET status='revoked',revoked_at=now()
WHERE id='60000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $revoked$
DECLARE cat jsonb;
BEGIN
 cat:=public.schoolnet_school_course_catalog('20000000-0000-4000-8000-000000000001');
 IF jsonb_array_length(cat->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B1_FAIL: affectation revoquee toujours exposee'; END IF;
 RAISE NOTICE 'S4B1_PASS_REVOKED: cours inactif apres revocation';
END;
$revoked$;
RESET ROLE;

-- Cours V1 jamais modifies par ce nouveau pont.
DO $legacy$
BEGIN
 IF (SELECT count(*) FROM public.courses)<>7
    OR (SELECT count(*) FROM public.course_enrollments)<>1
    OR (SELECT count(*) FROM public.student_progress)<>1
    OR (SELECT count(*) FROM schoolnet_private.school_course_links)<>1
 THEN RAISE EXCEPTION 'S4B1_FAIL: donnees V1 impactees'; END IF;
 RAISE NOTICE 'S4B1_PASS_V1: 7 cours, inscriptions et progression conserves';
END;
$legacy$;

SET LOCAL ROLE anon;
DO $anon$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_teacher_school_course_context();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B1_FAIL: appel anon permis'; END IF;
 RAISE NOTICE 'S4B1_PASS_ANON: rpc non executable';
END;
$anon$;
RESET ROLE;

SELECT 'S4B1_TENANT_A_B_PASS' AS result;
ROLLBACK;
