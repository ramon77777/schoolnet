-- SCHOOLNET S4-B.3-N : base synthetique A/B, chaque transaction est annulee.
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


-- Empoisonnement volontaire de class_students V1 : l'eleve B y est associe
-- a la classe de l'ecole A, mais S4-B.3-N ne doit JAMAIS lui envoyer un avis A.
UPDATE public.courses SET class_id='50000000-0000-4000-8000-000000000001'
WHERE id='70000000-0000-4000-8000-000000000001';
INSERT INTO public.class_students(class_id,student_id) VALUES
('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006');

DO $baseline$
BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE
     related_id='a0000000-0000-4000-8000-000000000005'::uuid
     AND event_key='assessment_published')<>1
 OR (SELECT count(*) FROM public.notifications WHERE
     related_id IN (
       'a0000000-0000-4000-8000-000000000001'::uuid,
       'a0000000-0000-4000-8000-000000000004'::uuid
     ))<>0
 THEN RAISE EXCEPTION 'S4B3N_FAIL_LEGACY_V1_OR_UNLINKED_INITIAL'; END IF;
 RAISE NOTICE 'S4B3N_PASS_V1_LEGACY_AND_OFFICIAL_NOT_AUTO_NOTIFIED';
END;
$baseline$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.headers','{"origin":"https://schoolnet-snowy.vercel.app"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000001');
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000001');
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000002');
RESET ROLE;

DO $published_then_link$
BEGIN
 IF (SELECT COUNT(*) FROM public.notifications WHERE
   user_id='10000000-0000-4000-8000-000000000005'::uuid
   AND event_key='assessment_published'
   AND related_id='a0000000-0000-4000-8000-000000000001'::uuid
   AND action_url='/app/student/school-courses/70000000-0000-4000-8000-000000000001')<>1
 OR (SELECT COUNT(*) FROM public.notifications WHERE
   user_id='10000000-0000-4000-8000-000000000006'::uuid
   AND related_id='a0000000-0000-4000-8000-000000000001'::uuid)<>0
 OR (SELECT COUNT(*) FROM public.notifications WHERE
   related_id='a0000000-0000-4000-8000-000000000002'::uuid)<>0
 THEN RAISE EXCEPTION 'S4B3N_FAIL_LINK_AFTER_PUBLISH_OR_ISOLATION'; END IF;
 RAISE NOTICE 'S4B3N_PASS_LINK_AFTER_PUBLISH_AND_DUPLICATES';
END;$published_then_link$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
SET LOCAL ROLE authenticated;
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000004');
RESET ROLE;
DO $school_b$
BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE
   related_id='a0000000-0000-4000-8000-000000000004'::uuid
   AND user_id='10000000-0000-4000-8000-000000000006'::uuid)<>1
 OR (SELECT count(*) FROM public.notifications WHERE
   related_id='a0000000-0000-4000-8000-000000000004'::uuid
   AND user_id='10000000-0000-4000-8000-000000000005'::uuid)<>0
 THEN RAISE EXCEPTION 'S4B3N_FAIL_SCHOOL_B_ISOLATION'; END IF;
 RAISE NOTICE 'S4B3N_PASS_SCHOOL_A_B_DISJOINT';
END;$school_b$;

-- Brouillon lie puis publie. UPDATE inchange et re-publication sont deduples.
UPDATE public.assessments SET status='published'
 WHERE id='a0000000-0000-4000-8000-000000000002';
UPDATE public.assessments SET status='published'
 WHERE id='a0000000-0000-4000-8000-000000000002';

DO $draft_then_publish$
BEGIN
 IF (SELECT COUNT(*) FROM public.notifications WHERE
   related_id='a0000000-0000-4000-8000-000000000002'::uuid
   AND event_key='assessment_published')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_DRAFT_THEN_PUBLISH'; END IF;
 RAISE NOTICE 'S4B3N_PASS_DRAFT_THEN_PUBLISH_AND_IDEMPOTENCE';
END;$draft_then_publish$;

UPDATE public.assessments SET status='draft'
 WHERE id='a0000000-0000-4000-8000-000000000002';
UPDATE public.assessments SET status='draft'
 WHERE id='a0000000-0000-4000-8000-000000000002';
UPDATE public.assessments SET status='published'
 WHERE id='a0000000-0000-4000-8000-000000000002';

DO $withdraw$
BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE
  related_id='a0000000-0000-4000-8000-000000000002'::uuid
  AND event_key='assessment_withdrawn')<>1
 OR (SELECT count(*) FROM public.notifications WHERE
  related_id='a0000000-0000-4000-8000-000000000002'::uuid
  AND event_key='assessment_published')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_UNPUBLISH_REPUBLISH_DEDUP'; END IF;
 RAISE NOTICE 'S4B3N_PASS_UNPUBLISH_REPUBLISH_DEDUP';
END;$withdraw$;

-- Lien revoque : notification de retrait uniquement aux anciens
-- destinataires toujours autorises, sans notification de publication repetee.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SET LOCAL ROLE authenticated;
SELECT public.schoolnet_teacher_unlink_school_assessment('a0000000-0000-4000-8000-000000000001');
RESET ROLE;
DO $unlink_notice$
BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE
   related_id='a0000000-0000-4000-8000-000000000001'::uuid
   AND event_key='assessment_withdrawn')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_UNLINK_NOTICE'; END IF;
 RAISE NOTICE 'S4B3N_PASS_UNLINK_NOTICE';
END;$unlink_notice$;

-- Revocation de membership et absence d'effet sur les autres eleves.
UPDATE public.schoolnet_school_memberships SET status='revoked'
WHERE school_id='20000000-0000-4000-8000-000000000001'::uuid
 AND user_id='10000000-0000-4000-8000-000000000005'::uuid;
SET LOCAL ROLE authenticated;
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000003');
RESET ROLE;
DO $membership_revoked$
BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications
 WHERE related_id='a0000000-0000-4000-8000-000000000003'::uuid)
 THEN RAISE EXCEPTION 'S4B3N_FAIL_REVOKED_STUDENT_NOTIFIED'; END IF;
 RAISE NOTICE 'S4B3N_PASS_REVOKED_STUDENT_SILENT';
END;$membership_revoked$;
UPDATE public.schoolnet_school_memberships SET status='active'
WHERE school_id='20000000-0000-4000-8000-000000000001'::uuid
 AND user_id='10000000-0000-4000-8000-000000000005'::uuid;
UPDATE public.assessments SET status='draft'
 WHERE id='a0000000-0000-4000-8000-000000000003';
UPDATE public.assessments SET status='published'
 WHERE id='a0000000-0000-4000-8000-000000000003';

DO $reactivated$
BEGIN
 IF (SELECT count(*) FROM public.notifications
  WHERE related_id='a0000000-0000-4000-8000-000000000003'::uuid
  AND event_key='assessment_published')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_REAUTHENTICATED_STUDENT'; END IF;
 RAISE NOTICE 'S4B3N_PASS_MEMBERSHIP_RESTORED';
END;$reactivated$;

-- Affectation de classe inactive : nouvelle evaluation publiee mais
-- ni inscrite ni partagee, puis rattachee a un eleve revoque = 0 alerte.
INSERT INTO public.assessments(id,course_id,type,status,title,created_by) VALUES
 ('a0000000-0000-4000-8000-000000000006','70000000-0000-4000-8000-000000000001',
 'quiz','draft','Quiz eleve revoque','10000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000006');
RESET ROLE;
UPDATE public.schoolnet_school_student_class_assignments SET status='revoked',revoked_at=pg_catalog.now()
WHERE school_id='20000000-0000-4000-8000-000000000001'::uuid
 AND student_id='10000000-0000-4000-8000-000000000005'::uuid;
UPDATE public.assessments SET status='published'
WHERE id='a0000000-0000-4000-8000-000000000006';
DO $assignment_revoked$
BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications
 WHERE related_id='a0000000-0000-4000-8000-000000000006'::uuid)
 THEN RAISE EXCEPTION 'S4B3N_FAIL_REVOKED_CLASS_ASSIGNEE'; END IF;
 RAISE NOTICE 'S4B3N_PASS_REVOKED_CLASS_ASSIGNEE';
END;$assignment_revoked$;
UPDATE public.schoolnet_school_student_class_assignments SET status='active',revoked_at=NULL
WHERE school_id='20000000-0000-4000-8000-000000000001'::uuid
 AND student_id='10000000-0000-4000-8000-000000000005'::uuid;

-- Desactivation de l'affectation enseignant : aucun avis.
INSERT INTO public.assessments(id,course_id,type,status,title,created_by) VALUES
 ('a0000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000001',
 'exam','draft','Examen affectation suspendue','10000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000007');
RESET ROLE;
UPDATE public.schoolnet_school_teacher_subject_assignments SET status='revoked',revoked_at=pg_catalog.now()
WHERE id='60000000-0000-4000-8000-000000000001'::uuid;
UPDATE public.assessments SET status='published'
WHERE id='a0000000-0000-4000-8000-000000000007';
DO $teacher_revoked$
BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications
 WHERE related_id='a0000000-0000-4000-8000-000000000007'::uuid)
 THEN RAISE EXCEPTION 'S4B3N_FAIL_REVOKED_TEACHER_ASSIGNMENT'; END IF;
 RAISE NOTICE 'S4B3N_PASS_REVOKED_TEACHER_ASSIGNMENT';
END;$teacher_revoked$;
UPDATE public.schoolnet_school_teacher_subject_assignments SET status='active',revoked_at=NULL
WHERE id='60000000-0000-4000-8000-000000000001'::uuid;

-- Ecole suspendue : aucune information scolaire vers d'autres comptes.
INSERT INTO public.assessments(id,course_id,type,status,title,created_by) VALUES
 ('a0000000-0000-4000-8000-000000000008','70000000-0000-4000-8000-000000000001',
 'quiz','draft','Quiz ecole suspendue','10000000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT public.schoolnet_teacher_link_school_assessment('a0000000-0000-4000-8000-000000000008');
RESET ROLE;
UPDATE public.schoolnet_schools SET status='suspended'
WHERE id='20000000-0000-4000-8000-000000000001'::uuid;
UPDATE public.assessments SET status='published'
WHERE id='a0000000-0000-4000-8000-000000000008';
DO $school_suspended$
BEGIN
 IF EXISTS(SELECT 1 FROM public.notifications
 WHERE related_id='a0000000-0000-4000-8000-000000000008'::uuid)
 THEN RAISE EXCEPTION 'S4B3N_FAIL_SUSPENDED_SCHOOL_NOTIFIED'; END IF;
 RAISE NOTICE 'S4B3N_PASS_SUSPENDED_SCHOOL_SILENT';
END;$school_suspended$;

-- Aucune execution RPC directe depuis l'API authentifiee / anonyme.
DO $privileges$
BEGIN
 IF has_function_privilege('anon',
    'schoolnet_private.emit_official_assessment_notification(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
    'schoolnet_private.emit_official_assessment_notification(uuid,text)','EXECUTE')
 OR has_function_privilege('anon',
    'schoolnet_private.notify_official_assessment_link_change()','EXECUTE')
 OR has_function_privilege('authenticated',
    'schoolnet_private.notify_official_assessment_link_change()','EXECUTE')
 THEN RAISE EXCEPTION 'S4B3N_FAIL_PRIVILEGES'; END IF;
 RAISE NOTICE 'S4B3N_PASS_PRIVILEGES';
END;$privileges$;

-- La RLS de notification reste strictement personnelle.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
SET LOCAL ROLE authenticated;
DO $rls$
BEGIN
 IF EXISTS(
   SELECT 1 FROM public.notifications
   WHERE user_id='10000000-0000-4000-8000-000000000005'::uuid
 ) THEN RAISE EXCEPTION 'S4B3N_FAIL_RLS_STUDENT_B_SEES_A'; END IF;
 RAISE NOTICE 'S4B3N_PASS_RLS_STUDENT_B';
END;$rls$;
RESET ROLE;

DO $unchanged$
BEGIN
 IF (SELECT COUNT(*) FROM public.course_enrollments)<>1
 OR (SELECT COUNT(*) FROM public.student_progress)<>1
 OR (SELECT COUNT(*) FROM public.courses)<>3
 OR (SELECT COUNT(*) FROM public.assessments)<>8
 OR (SELECT COUNT(*) FROM schoolnet_private.school_assessment_links)<>7
 OR (SELECT COUNT(*) FROM public.notifications
    WHERE related_id='a0000000-0000-4000-8000-000000000005'::uuid
    AND event_key='assessment_published'
    AND action_url='/app/student/assessments/a0000000-0000-4000-8000-000000000005')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_V1_CHANGED'; END IF;
 RAISE NOTICE 'S4B3N_PASS_V1_UNCHANGED';
END;$unchanged$;
-- Permissions V1 durcies sur une base locale uniquement :
-- le trigger continue de fonctionner alors qu'EXECUTE direct est retire.
DO $s4b3n_hardening$
BEGIN
 IF has_function_privilege('anon','public.notify_assessment_published()','EXECUTE')
    OR has_function_privilege('authenticated','public.notify_assessment_published()','EXECUTE')
    OR NOT has_function_privilege('service_role','public.notify_assessment_published()','EXECUTE')
    OR (SELECT count(*) FROM pg_catalog.pg_trigger t
        WHERE t.tgname='trg_notify_assessment_published' AND t.tgenabled='O')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_LEGACY_ACL_HARDENING'; END IF;
 RAISE NOTICE 'S4B3N_PASS_LEGACY_ACL_HARDENING';
END;$s4b3n_hardening$;

-- Non-regression d'une publication V1 effectuee reellement par le role
-- authenticated APRES retrait de son droit EXECUTE sur la fonction trigger.
INSERT INTO public.assessments(id,course_id,type,status,title,created_by) VALUES
 ('a0000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000003',
  'quiz','draft','Quiz libre V1 apres durcissement','10000000-0000-4000-8000-000000000003');
GRANT SELECT,UPDATE(status) ON TABLE public.assessments TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
UPDATE public.assessments SET status='published'
WHERE id='a0000000-0000-4000-8000-000000000009'::uuid;
RESET ROLE;
DO $legacy_trigger_still_fires$
BEGIN
 IF (SELECT count(*) FROM public.notifications
     WHERE user_id='10000000-0000-4000-8000-000000000005'::uuid
       AND related_id='a0000000-0000-4000-8000-000000000009'::uuid
       AND event_key='assessment_published'
       AND action_url='/app/student/assessments/a0000000-0000-4000-8000-000000000009')<>1
 THEN RAISE EXCEPTION 'S4B3N_FAIL_LEGACY_TRIGGER_AFTER_REVOKE'; END IF;
 RAISE NOTICE 'S4B3N_PASS_LEGACY_TRIGGER_AFTER_REVOKE';
END;$legacy_trigger_still_fires$;

SELECT 'S4B3N_TENANT_A_B_PASS' AS result;
ROLLBACK;
