-- SCHOOLNET S4-B.2 : isolation A/B sur Supabase LOCAL JETABLE.
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

-- Connexion synthetique A : liste et chapitres autorises.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $student_a$
DECLARE v_catalog jsonb;v_detail jsonb;denied boolean:=false;
BEGIN
 v_catalog:=public.schoolnet_student_school_courses();
 IF jsonb_array_length(v_catalog->'courses')<>1
 OR v_catalog->'courses'->0->>'title'<>'Mathematiques A'
 OR v_catalog::text LIKE '%Mathematiques B%'
 OR v_catalog::text LIKE '%Cours libre V1%'
 OR v_catalog::text LIKE '%Eleve B%'
 THEN RAISE EXCEPTION 'S4B2_FAIL: catalogue A expose un cours non autorise'; END IF;
 v_detail:=public.schoolnet_student_school_course_detail('70000000-0000-4000-8000-000000000001');
 IF v_detail->>'title'<>'Mathematiques A'
 OR jsonb_array_length(v_detail->'sections')<>2
 OR jsonb_array_length(v_detail->'resources')<>2
 OR v_detail::text LIKE '%Document enseignant secret%'
 OR v_detail::text LIKE '%URL dangereuse%'
 OR v_detail::text LIKE '%Document B%'
 OR v_detail::text LIKE '%student_id%'
 THEN RAISE EXCEPTION 'S4B2_FAIL: chapitres ou ressources A divulguent des donnees'; END IF;
 BEGIN
  PERFORM public.schoolnet_student_school_course_detail('70000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: eleve A lit cours B'; END IF;
 denied:=false;
 BEGIN
  PERFORM public.schoolnet_student_school_course_detail('70000000-0000-4000-8000-000000000003');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: inscription libre ouvre les RPC scolaires'; END IF;
 RAISE NOTICE 'S4B2_PASS_STUDENT_A: cours et ressources limites a la classe';
END;
$student_a$;

-- Eleve B : autre ecole.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
DO $student_b$
DECLARE v_list jsonb;denied boolean:=false;
BEGIN
 v_list:=public.schoolnet_student_school_courses();
 IF jsonb_array_length(v_list->'courses')<>1
 OR v_list->'courses'->0->>'title'<>'Mathematiques B'
 THEN RAISE EXCEPTION 'S4B2_FAIL: liste eleve B'; END IF;
 BEGIN
  PERFORM public.schoolnet_student_school_course_detail('70000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: eleve B lit cours A'; END IF;
 RAISE NOTICE 'S4B2_PASS_STUDENT_B: aucun droit interecoles';
END;
$student_b$;

-- Eleve inscrit dans aucune ecole : ne voit aucun cours officiel.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
DO $unassigned$
DECLARE x jsonb;denied boolean:=false;
BEGIN
 x:=public.schoolnet_student_school_courses();
 IF jsonb_array_length(x->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B2_FAIL: eleve non affecte voit des cours'; END IF;
 BEGIN
  PERFORM public.schoolnet_student_school_course_detail('70000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: eleve non affecte lit un cours'; END IF;
 RAISE NOTICE 'S4B2_PASS_UNASSIGNED: liste vide et detail refuse';
END;
$unassigned$;

-- Roles NON eleves : prof, parent, admin refuses.
DO $other_roles$
DECLARE id uuid;denied boolean;
BEGIN
 FOREACH id IN ARRAY ARRAY[
  '10000000-0000-4000-8000-000000000003'::uuid,
  '10000000-0000-4000-8000-000000000008'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid
 ] LOOP
   PERFORM set_config('request.jwt.claim.sub',id::text,true);
   denied:=false;
   BEGIN PERFORM public.schoolnet_student_school_courses();
   EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
   IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: role non eleve voit cours'; END IF;
 END LOOP;
 RAISE NOTICE 'S4B2_PASS_OTHER_ROLES: refus prof, parent, admin';
END;
$other_roles$;
RESET ROLE;

-- Le cours A doit disparaitre APRES revocation de l'eleve.
UPDATE public.schoolnet_school_student_class_assignments
SET status='revoked',revoked_at=now()
WHERE student_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $rev_student$
DECLARE x jsonb;denied boolean:=false;
BEGIN
 x:=public.schoolnet_student_school_courses();
 IF jsonb_array_length(x->'courses')<>0 THEN RAISE EXCEPTION 'S4B2_FAIL: eleve revoque voit cours'; END IF;
 BEGIN PERFORM public.schoolnet_student_school_course_detail('70000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: detail eleve revoque'; END IF;
 RAISE NOTICE 'S4B2_PASS_REVOKED_STUDENT_ASSIGNMENT';
END;
$rev_student$;
RESET ROLE;

-- Reactivation puis revocation de l'appartenance ecole.
UPDATE public.schoolnet_school_student_class_assignments
SET status='active',revoked_at=NULL WHERE student_id='10000000-0000-4000-8000-000000000005';
UPDATE public.schoolnet_school_memberships
SET status='revoked'
WHERE user_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $rev_membership$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_courses()->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B2_FAIL: appartenance eleve revoquee'; END IF;
 RAISE NOTICE 'S4B2_PASS_REVOKED_MEMBERSHIP';
END;
$rev_membership$;
RESET ROLE;
UPDATE public.schoolnet_school_memberships SET status='active'
WHERE user_id='10000000-0000-4000-8000-000000000005';

-- Enseignant revoque => plus de cours dans l'ecole.
UPDATE public.schoolnet_school_teacher_subject_assignments
SET status='revoked',revoked_at=now()
WHERE teacher_id='10000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $rev_teacher$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_courses()->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B2_FAIL: affectation enseignant revoquee'; END IF;
 RAISE NOTICE 'S4B2_PASS_REVOKED_TEACHING_ASSIGNMENT';
END;
$rev_teacher$;
RESET ROLE;
UPDATE public.schoolnet_school_teacher_subject_assignments
SET status='active',revoked_at=NULL
WHERE teacher_id='10000000-0000-4000-8000-000000000003';

-- Lien cours revoque => eleve n'accede plus.
UPDATE schoolnet_private.school_course_links
SET status='revoked',revoked_at=now(),
 revoked_by='10000000-0000-4000-8000-000000000003'
WHERE course_id='70000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $rev_link$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_courses()->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B2_FAIL: lien revoque'; END IF;
 RAISE NOTICE 'S4B2_PASS_REVOKED_COURSE_LINK';
END;
$rev_link$;
RESET ROLE;
UPDATE schoolnet_private.school_course_links
SET status='active',revoked_at=NULL,revoked_by=NULL
WHERE course_id='70000000-0000-4000-8000-000000000001';

-- Ecole suspendue => aucun cours.
UPDATE public.schoolnet_schools SET status='suspended'
WHERE id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $school_suspended$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_courses()->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B2_FAIL: ecole suspendue'; END IF;
 RAISE NOTICE 'S4B2_PASS_SCHOOL_SUSPENDED';
END;
$school_suspended$;
RESET ROLE;
UPDATE public.schoolnet_schools SET status='active'
WHERE id='20000000-0000-4000-8000-000000000001';

-- Protection d'une matiere desactivee.
UPDATE public.academic_subjects SET is_active=false
WHERE id='40000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
DO $subject_inactive$
BEGIN
 IF jsonb_array_length(public.schoolnet_student_school_courses()->'courses')<>0 THEN
  RAISE EXCEPTION 'S4B2_FAIL: matiere inactive'; END IF;
 RAISE NOTICE 'S4B2_PASS_SUBJECT_INACTIVE';
END;
$subject_inactive$;
RESET ROLE;
UPDATE public.academic_subjects SET is_active=true
WHERE id='40000000-0000-4000-8000-000000000001';

-- Acces anonyme interdit, aucun abonnement V1 auto.
SET LOCAL ROLE anon;
DO $anon$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.schoolnet_student_school_courses();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'S4B2_FAIL: anonyme peut lire catalogue'; END IF;
 RAISE NOTICE 'S4B2_PASS_ANON';
END;
$anon$;
RESET ROLE;
DO $legacy$
BEGIN
 IF (SELECT count(*) FROM public.course_enrollments)<>1
 OR (SELECT count(*) FROM public.student_progress)<>1
 OR (SELECT count(*) FROM public.courses)<>3
 OR (SELECT count(*) FROM public.resources)<>5
 THEN RAISE EXCEPTION 'S4B2_FAIL: mutation V1 detectee'; END IF;
 RAISE NOTICE 'S4B2_PASS_V1_UNCHANGED';
END;
$legacy$;

SELECT 'S4B2_TENANT_A_B_PASS' AS result;
ROLLBACK;
