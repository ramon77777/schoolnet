-- S4-A - ISOLATION REELLE DES RPC S3-C dans une base Supabase CI jetable.
-- Comptes, etablissements et classes exclusivement synthetiques.
-- Utiliser psql -v ON_ERROR_STOP=1 ; toute assertion leve une exception.
BEGIN;
SET LOCAL statement_timeout = '30s';

INSERT INTO public.profiles(id,role,full_name) VALUES
 ('10000000-0000-4000-8000-000000000001','school_admin','Admin A'),
 ('10000000-0000-4000-8000-000000000002','school_admin','Admin B'),
 ('10000000-0000-4000-8000-000000000003','teacher','Enseignant A'),
 ('10000000-0000-4000-8000-000000000004','teacher','Enseignant B'),
 ('10000000-0000-4000-8000-000000000005','student','Eleve A'),
 ('10000000-0000-4000-8000-000000000006','student','Eleve B'),
 ('10000000-0000-4000-8000-000000000007','student','Non rattache');

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
INSERT INTO public.academic_subjects(id,name,code,is_active,sort_order)
VALUES ('40000000-0000-4000-8000-000000000001','Mathematiques','MATH',true,1);
INSERT INTO public.classes(id,school_id,level_id,school_year_id,school_year,name,learning_context) VALUES
 ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e A','school'),
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1,'30000000-0000-4000-8000-000000000001','2026-2027','6e B','school');

-- Creation de donnees fictives privilegiee seulement lors du setup :
-- les appels suivants passent ensuite sous ROLE authenticated ou anon.
INSERT INTO public.schoolnet_school_student_class_assignments
(school_id,class_id,school_year_id,student_id,assigned_by) VALUES
 ('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002');
INSERT INTO public.schoolnet_school_teacher_subject_assignments
(school_id,class_id,school_year_id,teacher_id,subject_id,assigned_by) VALUES
 ('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $qa_a$
DECLARE cat jsonb; summary jsonb; denied_summary boolean:=false; blocked boolean:=false; direct_blocked boolean:=false;
 preview_blocked boolean:=false;
BEGIN
 cat:=public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000001');
 IF cat->>'school_id'<>'20000000-0000-4000-8000-000000000001'
    OR jsonb_array_length(cat->'classes')<>1
    OR cat->'classes'->0->>'id'<>'50000000-0000-4000-8000-000000000001'
    OR jsonb_array_length(cat->'student_assignments')<>1
    OR cat->'student_assignments'->0->>'student_name'<>'Eleve A'
    OR jsonb_array_length(cat->'teacher_assignments')<>1
    OR cat->'teacher_assignments'->0->>'teacher_name'<>'Enseignant A'
 THEN RAISE EXCEPTION 'S4A : catalogue A invalide ou contamination par B'; END IF;

 BEGIN
   PERFORM public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : admin A accede a B'; END IF;
 BEGIN
   PERFORM public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied_summary:=true; END;
 IF NOT denied_summary THEN RAISE EXCEPTION 'S4A : synthese A accede a B'; END IF;

 BEGIN
   PERFORM count(*) FROM public.schoolnet_school_student_class_assignments;
 EXCEPTION WHEN SQLSTATE '42501' THEN direct_blocked:=true; END;
 IF NOT direct_blocked THEN RAISE EXCEPTION 'S4A : table privee accessible'; END IF;

 PERFORM set_config('request.headers','{"origin":"https://schoolnet-s4a-preview.vercel.app"}',true);
 BEGIN
   PERFORM public.schoolnet_school_assign_student(
    '20000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000005');
 EXCEPTION WHEN SQLSTATE '42501' THEN preview_blocked:=true; END;
 IF NOT preview_blocked THEN RAISE EXCEPTION 'S4A : ecriture autorisee depuis Preview'; END IF;

 -- Le JSON transmis au navigateur doit correspondre aux chiffres du
 -- catalogue S3-C tout en ne contenant AUCUN nom/person_id/evenement.
 summary:=public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000001');
 IF summary->>'schoolId'<>'20000000-0000-4000-8000-000000000001'
   OR (summary->>'classCount')::int<>1
   OR (summary->>'affiliatedStudentCount')::int<>1
   OR (summary->>'affiliatedTeacherCount')::int<>1
   OR (summary->>'assignedStudentCount')::int<>1
   OR (summary->>'assignedTeacherCount')::int<>1
   OR (summary->>'teachingAssignmentCount')::int<>1
   OR jsonb_array_length(summary->'classes')<>1
   OR summary->'classes'->0->>'id'<>'50000000-0000-4000-8000-000000000001'
   OR (summary->'classes'->0->>'studentsAssigned')::int<>1
   OR (summary->'classes'->0->>'teachersAssigned')::int<>1
   OR summary->'classes'->0->'subjects'<>'["Mathematiques"]'::jsonb
   OR (SELECT count(*) FROM jsonb_object_keys(summary))<>8
   OR (SELECT count(*) FROM jsonb_object_keys(summary->'classes'->0))<>7
   OR summary ? 'events' OR summary ? 'students' OR summary ? 'teachers'
   OR summary::text LIKE '%Eleve A%' OR summary::text LIKE '%Enseignant A%'
   OR summary::text LIKE '%10000000-0000-4000-8000-%'
 THEN RAISE EXCEPTION 'S4A : synthese A incorrecte ou informations nominatives exposees'; END IF;
 RAISE NOTICE 'PASS S4A A : catalogue A, B refuse, table privee, Preview refusee';
END;
$qa_a$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $qa_b$
DECLARE cat jsonb; summary jsonb; blocked boolean:=false; denied_summary boolean:=false;
BEGIN
 cat:=public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000002');
 IF cat->>'school_id'<>'20000000-0000-4000-8000-000000000002'
    OR jsonb_array_length(cat->'classes')<>1
    OR cat->'classes'->0->>'id'<>'50000000-0000-4000-8000-000000000002'
    OR cat->'student_assignments'->0->>'student_name'<>'Eleve B'
    OR cat->'teacher_assignments'->0->>'teacher_name'<>'Enseignant B'
 THEN RAISE EXCEPTION 'S4A : catalogue B invalide ou contamination par A'; END IF;
 BEGIN
   PERFORM public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : admin B accede a A'; END IF;
 BEGIN
   PERFORM public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied_summary:=true; END;
 IF NOT denied_summary THEN RAISE EXCEPTION 'S4A : synthese B accede a A'; END IF;
 summary:=public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000002');
 IF summary->>'schoolId'<>'20000000-0000-4000-8000-000000000002'
   OR (summary->>'classCount')::int<>1
   OR (summary->>'assignedStudentCount')::int<>1
   OR (summary->>'teachingAssignmentCount')::int<>1
   OR summary->'classes'->0->>'id'<>'50000000-0000-4000-8000-000000000002'
   OR summary::text LIKE '%Eleve B%' OR summary::text LIKE '%Enseignant B%'
   OR summary::text LIKE '%10000000-0000-4000-8000-%'
 THEN RAISE EXCEPTION 'S4A : synthese B incorrecte ou fuite identite'; END IF;
 RAISE NOTICE 'PASS S4A B : catalogue B, A refuse';
END;
$qa_b$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
DO $qa_role$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : role eleve autorise a administrer'; END IF;
 blocked:=false;
 BEGIN
   PERFORM public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : role eleve lit la synthese'; END IF;
 RAISE NOTICE 'PASS S4A : role incorrect refuse';
END;
$qa_role$;
RESET ROLE;

UPDATE public.schoolnet_school_memberships SET status='revoked'
WHERE school_id='20000000-0000-4000-8000-000000000002'
 AND user_id='10000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $qa_revoked$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : admin revoque encore actif'; END IF;
 blocked:=false;
 BEGIN
   PERFORM public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000002');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : admin revoque lit la synthese'; END IF;
 RAISE NOTICE 'PASS S4A : admin revoque refuse';
END;
$qa_revoked$;
RESET ROLE;

UPDATE public.schoolnet_schools SET status='suspended'
WHERE id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $qa_suspended$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : ecole suspendue accessible'; END IF;
 blocked:=false;
 BEGIN
   PERFORM public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : ecole suspendue lit la synthese'; END IF;
 RAISE NOTICE 'PASS S4A : ecole suspendue refusee';
END;
$qa_suspended$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $qa_anon$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.schoolnet_school_assignment_catalog('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : anonyme autorise'; END IF;
 blocked:=false;
 BEGIN
   PERFORM public.schoolnet_school_pedagogy_overview('20000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'S4A : anonyme lit la synthese'; END IF;
 RAISE NOTICE 'PASS S4A : appel anonyme refuse';
END;
$qa_anon$;
RESET ROLE;

SELECT 'S4A_TENANT_A_B_ISOLATION_PASS' AS result;
ROLLBACK;
