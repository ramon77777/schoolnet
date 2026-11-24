-- SCHOOLNET C.1 : familles A/B fictives, base PostgreSQL LOCALE JETABLE.
-- N'executer aucun scenario de cet ensemble sur un projet Supabase heberge.
BEGIN;
SET LOCAL statement_timeout='60s';
\ir family-seed.sql

-- Helpers de test invoker : les requetes de lecture s'executent sous le role
-- authenticated des scenarios ; ces fonctions et toutes les donnees seront annulees.
CREATE FUNCTION public.ci_c1_expect_hidden(probe text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $f$
DECLARE d jsonb; v jsonb;
BEGIN
 v:=public.schoolnet_parent_official_results();
 IF jsonb_array_length(v->'results')<>0 THEN
  RAISE EXCEPTION 'C1_FAIL_RESULT_STILL_VISIBLE_%',probe;
 END IF;
 d:=public.schoolnet_parent_official_result(
  '10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001');
 IF d IS DISTINCT FROM '{"found":false}'::jsonb THEN
  RAISE EXCEPTION 'C1_FAIL_DETAIL_STILL_VISIBLE_%',probe;
 END IF;
END $f$;

CREATE FUNCTION public.ci_c1_expect_legacy_safe(probe text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $f$
DECLARE d jsonb;
BEGIN
 IF (SELECT count(*) FROM public.get_parent_child_assessment_submissions(
      '10000000-0000-4000-8000-000000000005'))<>1
 OR NOT EXISTS(SELECT 1 FROM public.get_parent_child_assessment_submissions(
      '10000000-0000-4000-8000-000000000005') s
      WHERE s.assessment_id='a0000000-0000-4000-8000-000000000005'::uuid AND s.score=12)
 OR (SELECT count(*) FROM public.get_parent_child_homework_submissions(
      '10000000-0000-4000-8000-000000000005'))<>1
 OR NOT EXISTS(SELECT 1 FROM public.get_parent_child_homework_submissions(
      '10000000-0000-4000-8000-000000000005') s
      WHERE s.homework_id='a0000000-0000-4000-8000-000000000005'::uuid AND s.score=12)
 THEN RAISE EXCEPTION 'C1_FAIL_LEGACY_CATALOG_%',probe; END IF;
 d:=public.get_parent_child_assessment_detail(
   'a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005');
 IF COALESCE((d->>'found')::boolean,true) THEN
  RAISE EXCEPTION 'C1_FAIL_LEGACY_OFFICIAL_DETAIL_%',probe;
 END IF;
 d:=public.get_parent_child_assessment_detail(
   'a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005');
 IF d->>'found' IS DISTINCT FROM 'true' OR (d#>>'{submission,score}')::numeric<>12
 OR d#>>'{submission,feedback}' IS DISTINCT FROM 'Resultat libre conserve.'
 OR jsonb_array_length(d->'questions')<>1
 THEN RAISE EXCEPTION 'C1_FAIL_LEGACY_RESULT_CHANGED_%',probe; END IF;
END $f$;

-- Hash des donnees metier avant les lectures. Les scenarios de changement
-- de contexte utilisent des savepoints et sont annules individuellement.
CREATE TEMP TABLE c1_baseline AS SELECT jsonb_build_object(
 'copies',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.assessment_submissions t),
 'devoirs',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.homework_submissions t),
 'notifications',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.notifications t),
 'liens',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.parent_links t),
 'inscriptions',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.course_id,t.student_id),'[]'::jsonb)::text) FROM public.course_enrollments t)
) AS state;

-- Parent A : uniquement son enfant, note publiee et appreciation globale.
SET LOCAL ROLE authenticated;
DO $parent_a$
DECLARE v jsonb;d jsonb;r jsonb; keys text[]; denied boolean:=false;
BEGIN
 v:=public.schoolnet_parent_official_results();
 IF jsonb_array_length(v->'children')<>1 OR jsonb_array_length(v->'results')<>1
  OR v#>>'{children,0,childId}' IS DISTINCT FROM '10000000-0000-4000-8000-000000000005'
  OR v#>>'{children,0,fullName}' IS DISTINCT FROM 'Eleve A'
 THEN RAISE EXCEPTION 'C1_FAIL_PARENT_A_CATALOG'; END IF;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(v) k;
 IF keys<>ARRAY['children','results']::text[] THEN RAISE EXCEPTION 'C1_FAIL_CATALOG_EXTRA_KEYS'; END IF;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(v->'children'->0) k;
 IF keys<>ARRAY['childId','fullName']::text[] THEN RAISE EXCEPTION 'C1_FAIL_CHILD_EXTRA_KEYS'; END IF;
 r:=v->'results'->0;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(r) k;
 IF keys<>ARRAY['assessmentId','childId','childName','classId','className','courseId','courseTitle','maxScore','publishedAt','schoolId','schoolName','schoolYear','score','subjectName','title','type']::text[]
 OR (r->>'score')::numeric<>20 OR (r->>'maxScore')::numeric<>20
 OR r->>'assessmentId' IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'
 OR r->>'schoolId' IS DISTINCT FROM '20000000-0000-4000-8000-000000000001'
 OR r->>'classId' IS DISTINCT FROM '50000000-0000-4000-8000-000000000001'
 OR r->>'schoolYear' IS DISTINCT FROM '2026-2027'
 OR r->>'childName' IS DISTINCT FROM 'Eleve A'
 OR r->>'publishedAt' IS NULL
 THEN RAISE EXCEPTION 'C1_FAIL_PARENT_A_ROW_MINIMIZATION'; END IF;
 d:=public.schoolnet_parent_official_result(
  '10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001');
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(d) k;
 IF keys<>ARRAY['feedback','found','result']::text[]
 OR d->>'found' IS DISTINCT FROM 'true' OR d->'result' IS DISTINCT FROM r
 OR d->>'feedback' IS DISTINCT FROM 'Tres bonne demarche.'
 THEN RAISE EXCEPTION 'C1_FAIL_PARENT_A_DETAIL'; END IF;
 -- Les parents ne lisent pas les tables officielles ni le helper interne.
 IF EXISTS(SELECT 1 FROM public.assessment_submissions WHERE assessment_id='a0000000-0000-4000-8000-000000000001')
 OR EXISTS(SELECT 1 FROM public.submission_answers WHERE submission_id='e1000000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'C1_FAIL_DIRECT_TABLE_READ'; END IF;
 BEGIN
  PERFORM schoolnet_private.parent_official_result_rows(NULL,NULL);
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'C1_FAIL_INTERNAL_HELPER_EXECUTABLE'; END IF;
 PERFORM public.ci_c1_expect_legacy_safe('active');
 RAISE NOTICE 'C1_PASS_PARENT_A_PUBLISHED_ONLY_AND_MINIMIZED';
END $parent_a$;
RESET ROLE;

-- Aucun enregistrement course_enrollments ne doit etre necessaire au parcours officiel.
SAVEPOINT c1_no_v1;
DELETE FROM public.course_enrollments WHERE student_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
DO $no_v1$
BEGIN
 IF jsonb_array_length(public.schoolnet_parent_official_results()->'results')<>1
 THEN RAISE EXCEPTION 'C1_FAIL_OFFICIAL_REQUIRES_V1_ENROLLMENT'; END IF;
END $no_v1$;
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_no_v1;

-- Un lien V1 synthetique vers le cours officiel ne doit pas contourner la barriere.
SAVEPOINT c1_v1_overlap;
INSERT INTO public.course_enrollments(course_id,student_id)
VALUES('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_legacy_safe('overlap');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_v1_overlap;

-- Parent B et faux identifiants : aucun acces au dossier A.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000009',true);
DO $parent_b$
DECLARE v jsonb;d jsonb;pair uuid[];
BEGIN
 v:=public.schoolnet_parent_official_results();
 IF jsonb_array_length(v->'children')<>1 OR jsonb_array_length(v->'results')<>1
 OR v#>>'{results,0,childId}' IS DISTINCT FROM '10000000-0000-4000-8000-000000000006'
 OR v#>>'{results,0,schoolId}' IS DISTINCT FROM '20000000-0000-4000-8000-000000000002'
 OR (v#>>'{results,0,score}')::numeric<>15
 THEN RAISE EXCEPTION 'C1_FAIL_PARENT_B_ISOLATION'; END IF;
 FOREACH pair SLICE 1 IN ARRAY ARRAY[
  ARRAY['10000000-0000-4000-8000-000000000005'::uuid,'a0000000-0000-4000-8000-000000000001'::uuid],
  ARRAY['10000000-0000-4000-8000-000000000006'::uuid,'a0000000-0000-4000-8000-000000000001'::uuid],
  ARRAY['10000000-0000-4000-8000-000000000099'::uuid,'a0000000-0000-4000-8000-000000000001'::uuid],
  ARRAY['10000000-0000-4000-8000-000000000006'::uuid,'a0000000-0000-4000-8000-000000000099'::uuid],
  ARRAY[NULL::uuid,'a0000000-0000-4000-8000-000000000004'::uuid]
 ] LOOP
  d:=public.schoolnet_parent_official_result(pair[1],pair[2]);
  IF d IS DISTINCT FROM '{"found":false}'::jsonb THEN RAISE EXCEPTION 'C1_FAIL_FORGED_PARAMETER'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.get_parent_child_assessment_submissions('10000000-0000-4000-8000-000000000005'))
 OR EXISTS(SELECT 1 FROM public.get_parent_child_homework_submissions('10000000-0000-4000-8000-000000000005'))
 THEN RAISE EXCEPTION 'C1_FAIL_V1_UNLINKED_CHILD'; END IF;
 d:=public.get_parent_child_assessment_detail('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006');
 IF COALESCE((d->>'found')::boolean,true) THEN RAISE EXCEPTION 'C1_FAIL_V1_FOREIGN_ENROLLMENT'; END IF;
 RAISE NOTICE 'C1_PASS_PARENT_B_AND_FORGED_IDS_DENIED';
END $parent_b$;

-- Une fratrie multi-ecoles conserve deux resultats distincts et aucun droit global d'ecole.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',true);
DO $siblings$
DECLARE v jsonb;
BEGIN
 v:=public.schoolnet_parent_official_results();
 IF jsonb_array_length(v->'children')<>2 OR jsonb_array_length(v->'results')<>2
 OR (SELECT count(DISTINCT item->>'childId') FROM jsonb_array_elements(v->'results') item)<>2
 OR (SELECT count(DISTINCT item->>'schoolId') FROM jsonb_array_elements(v->'results') item)<>2
 THEN RAISE EXCEPTION 'C1_FAIL_SIBLINGS_MULTI_SCHOOL'; END IF;
END $siblings$;

-- Le cache child_ids seul n'accorde aucun droit.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
DO $cache_only$
DECLARE v jsonb;denied boolean:=false;
BEGIN
 v:=public.schoolnet_parent_official_results();
 IF v IS DISTINCT FROM '{"children":[],"results":[]}'::jsonb
 THEN RAISE EXCEPTION 'C1_FAIL_CHILD_IDS_AUTHORITY'; END IF;
 IF public.schoolnet_parent_official_result('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001')
 IS DISTINCT FROM '{"found":false}'::jsonb THEN RAISE EXCEPTION 'C1_FAIL_CACHE_ONLY_DETAIL'; END IF;
 BEGIN
  INSERT INTO public.parent_links(parent_id,student_id)
  VALUES('10000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000005');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'C1_FAIL_SELF_ASSIGNED_CHILD'; END IF;
END $cache_only$;

-- Chaque role non parent et l'absence d'identite sont refuses, meme avec EXECUTE.
DO $roles$
DECLARE uid text;denied boolean;
BEGIN
 FOREACH uid IN ARRAY ARRAY['','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005'] LOOP
  PERFORM set_config('request.jwt.claim.sub',uid,true);
  denied:=false;
  BEGIN PERFORM public.schoolnet_parent_official_results();
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'C1_FAIL_ROLE_LIST_%',uid; END IF;
  denied:=false;
  BEGIN PERFORM public.schoolnet_parent_official_result('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'C1_FAIL_ROLE_DETAIL_%',uid; END IF;
 END LOOP;
END $roles$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000008',true);

-- family_link_removed: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
DELETE FROM public.parent_links WHERE parent_id='10000000-0000-4000-8000-000000000008' AND student_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('family_link_removed');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- child_role_changed: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.profiles SET role='teacher' WHERE id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('child_role_changed');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- school_suspended: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.schoolnet_schools SET status='suspended' WHERE id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('school_suspended');
SELECT public.ci_c1_expect_legacy_safe('school_suspended');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- course_archived: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.courses SET status='archived' WHERE id='70000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('course_archived');
SELECT public.ci_c1_expect_legacy_safe('course_archived');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- course_teacher_changed: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.courses SET created_by='10000000-0000-4000-8000-000000000004' WHERE id='70000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('course_teacher_changed');
SELECT public.ci_c1_expect_legacy_safe('course_teacher_changed');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- course_wrong_class: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.courses SET class_id='50000000-0000-4000-8000-000000000002' WHERE id='70000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('course_wrong_class');
SELECT public.ci_c1_expect_legacy_safe('course_wrong_class');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- course_wrong_level: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
INSERT INTO public.levels(id,name) VALUES(2,'5e'); UPDATE public.courses SET level_id=2 WHERE id='70000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('course_wrong_level');
SELECT public.ci_c1_expect_legacy_safe('course_wrong_level');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- class_wrong_school: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.classes SET school_id='20000000-0000-4000-8000-000000000002' WHERE id='50000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('class_wrong_school');
SELECT public.ci_c1_expect_legacy_safe('class_wrong_school');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- class_wrong_year: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
INSERT INTO public.school_years(id,name) VALUES('30000000-0000-4000-8000-000000000002','2027-2028'); UPDATE public.classes SET school_year_id='30000000-0000-4000-8000-000000000002' WHERE id='50000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('class_wrong_year');
SELECT public.ci_c1_expect_legacy_safe('class_wrong_year');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- class_not_school: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.classes SET learning_context='legacy_unclassified' WHERE id='50000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('class_not_school');
SELECT public.ci_c1_expect_legacy_safe('class_not_school');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- subject_inactive: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.academic_subjects SET is_active=false WHERE id='40000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('subject_inactive');
SELECT public.ci_c1_expect_legacy_safe('subject_inactive');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- conflicting_subject: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
INSERT INTO public.academic_subjects(id,name,code,is_active) VALUES('40000000-0000-4000-8000-000000000002','Sciences','SCI',true); INSERT INTO public.course_subjects(course_id,subject_id) VALUES('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('conflicting_subject');
SELECT public.ci_c1_expect_legacy_safe('conflicting_subject');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- student_membership_revoked: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.schoolnet_school_memberships SET status='revoked' WHERE user_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('student_membership_revoked');
SELECT public.ci_c1_expect_legacy_safe('student_membership_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- student_membership_wrong_role: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.schoolnet_school_memberships SET member_role='teacher' WHERE user_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('student_membership_wrong_role');
SELECT public.ci_c1_expect_legacy_safe('student_membership_wrong_role');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- teacher_membership_revoked: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.schoolnet_school_memberships SET status='revoked' WHERE user_id='10000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('teacher_membership_revoked');
SELECT public.ci_c1_expect_legacy_safe('teacher_membership_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- teacher_role_changed: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.profiles SET role='parent' WHERE id='10000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('teacher_role_changed');
SELECT public.ci_c1_expect_legacy_safe('teacher_role_changed');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- student_assignment_revoked: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.schoolnet_school_student_class_assignments SET status='revoked',revoked_at=now() WHERE student_id='10000000-0000-4000-8000-000000000005';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('student_assignment_revoked');
SELECT public.ci_c1_expect_legacy_safe('student_assignment_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- teacher_assignment_revoked: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.schoolnet_school_teacher_subject_assignments SET status='revoked',revoked_at=now() WHERE teacher_id='10000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('teacher_assignment_revoked');
SELECT public.ci_c1_expect_legacy_safe('teacher_assignment_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- course_link_revoked: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE schoolnet_private.school_course_links SET status='revoked',revoked_at=now(),revoked_by='10000000-0000-4000-8000-000000000003' WHERE course_id='70000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('course_link_revoked');
SELECT public.ci_c1_expect_legacy_safe('course_link_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- assessment_link_revoked: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE schoolnet_private.school_assessment_links SET status='revoked',revoked_at=now(),revoked_by='10000000-0000-4000-8000-000000000003' WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('assessment_link_revoked');
SELECT public.ci_c1_expect_legacy_safe('assessment_link_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- assessment_wrong_teacher: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET created_by='10000000-0000-4000-8000-000000000004' WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('assessment_wrong_teacher');
SELECT public.ci_c1_expect_legacy_safe('assessment_wrong_teacher');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- assessment_wrong_section: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET section_id='80000000-0000-4000-8000-000000000003' WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('assessment_wrong_section');
SELECT public.ci_c1_expect_legacy_safe('assessment_wrong_section');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- assessment_draft: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET status='draft' WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('assessment_draft');
SELECT public.ci_c1_expect_legacy_safe('assessment_draft');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- assessment_closed: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET status='closed' WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('assessment_closed');
SELECT public.ci_c1_expect_legacy_safe('assessment_closed');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- private_in_progress_with_residual_score_and_date: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET status='in_progress' WHERE assessment_id='a0000000-0000-4000-8000-000000000001'; UPDATE public.homework_submissions SET status='in_progress' WHERE homework_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('private_in_progress_with_residual_score_and_date');
SELECT public.ci_c1_expect_legacy_safe('private_in_progress_with_residual_score_and_date');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- private_submitted_with_residual_score_and_date: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET status='submitted' WHERE assessment_id='a0000000-0000-4000-8000-000000000001'; UPDATE public.homework_submissions SET status='submitted' WHERE homework_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('private_submitted_with_residual_score_and_date');
SELECT public.ci_c1_expect_legacy_safe('private_submitted_with_residual_score_and_date');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- private_graded_with_residual_score_and_date: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET status='graded' WHERE assessment_id='a0000000-0000-4000-8000-000000000001'; UPDATE public.homework_submissions SET status='graded' WHERE homework_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('private_graded_with_residual_score_and_date');
SELECT public.ci_c1_expect_legacy_safe('private_graded_with_residual_score_and_date');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- missing_publication_date: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET published_at=NULL WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('missing_publication_date');
SELECT public.ci_c1_expect_legacy_safe('missing_publication_date');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- infinite_publication_date: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET published_at='infinity'::timestamptz WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('infinite_publication_date');
SELECT public.ci_c1_expect_legacy_safe('infinite_publication_date');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- missing_score: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET score=NULL WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('missing_score');
SELECT public.ci_c1_expect_legacy_safe('missing_score');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- negative_score: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET score=-1 WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('negative_score');
SELECT public.ci_c1_expect_legacy_safe('negative_score');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- score_above_maximum: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET score=21 WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('score_above_maximum');
SELECT public.ci_c1_expect_legacy_safe('score_above_maximum');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- score_nan: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET score='NaN'::numeric WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('score_nan');
SELECT public.ci_c1_expect_legacy_safe('score_nan');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- score_infinite: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessment_submissions SET score='Infinity'::numeric WHERE assessment_id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('score_infinite');
SELECT public.ci_c1_expect_legacy_safe('score_infinite');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- missing_max: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET max_score=NULL WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('missing_max');
SELECT public.ci_c1_expect_legacy_safe('missing_max');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- max_zero: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET max_score=0 WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('max_zero');
SELECT public.ci_c1_expect_legacy_safe('max_zero');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- max_negative: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET max_score=-1 WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('max_negative');
SELECT public.ci_c1_expect_legacy_safe('max_negative');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- max_nan: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET max_score='NaN'::numeric WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('max_nan');
SELECT public.ci_c1_expect_legacy_safe('max_nan');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- max_infinite: relecture serveur sous le role parent authentifie.
SAVEPOINT c1_probe;
UPDATE public.assessments SET max_score='Infinity'::numeric WHERE id='a0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.ci_c1_expect_hidden('max_infinite');
SELECT public.ci_c1_expect_legacy_safe('max_infinite');
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_probe;

-- Un parent dont le role change perd aussi le droit, meme si parent_links demeure.
SAVEPOINT c1_parent_role;
UPDATE public.profiles SET role='teacher' WHERE id='10000000-0000-4000-8000-000000000008';
SET LOCAL ROLE authenticated;
DO $changed_parent$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.schoolnet_parent_official_results();
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'C1_FAIL_PARENT_ROLE_REVOKED'; END IF;
END $changed_parent$;
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_parent_role;

-- Zero est une note valide ; l'absence d'appreciation est explicite, non inventee.
SAVEPOINT c1_zero;
UPDATE public.assessment_submissions SET score=0,feedback=NULL
 WHERE id='e1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $zero$
DECLARE d jsonb;
BEGIN
 d:=public.schoolnet_parent_official_result('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001');
 IF d->>'found' IS DISTINCT FROM 'true' OR (d#>>'{result,score}')::numeric<>0
 OR d->'feedback' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'C1_FAIL_ZERO_SCORE'; END IF;
END $zero$;
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_zero;

-- Un ancien feedback trop long garde le resultat dans la liste, mais le detail
-- doit signaler explicitement le contrat invalide sans tronquer le commentaire.
SAVEPOINT c1_feedback_too_long;
UPDATE public.assessment_submissions SET feedback=repeat('x',4001)
 WHERE id='e1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $feedback_too_long$
DECLARE v jsonb; refused boolean:=false;
BEGIN
 v:=public.schoolnet_parent_official_results();
 IF jsonb_array_length(v->'results')<>1
 OR v#>>'{results,0,assessmentId}' IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'
 OR (v#>>'{results,0,score}')::numeric<>20
 THEN RAISE EXCEPTION 'C1_FAIL_LONG_FEEDBACK_HIDES_LIST_RESULT'; END IF;
 BEGIN
  PERFORM public.schoolnet_parent_official_result('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN SQLSTATE '22023' THEN
  IF SQLERRM<>'S4B3C1_INVALID_PUBLISHED_FEEDBACK' THEN RAISE; END IF;
  refused:=true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'C1_FAIL_LONG_FEEDBACK_DETAIL_ACCEPTED'; END IF;
END $feedback_too_long$;
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_feedback_too_long;

-- La limite compte les points de code Unicode : 4000 emojis sont conserves.
SAVEPOINT c1_feedback_unicode;
UPDATE public.assessment_submissions SET feedback=repeat(chr(128578),4000)
 WHERE id='e1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $feedback_unicode$
DECLARE d jsonb;
BEGIN
 d:=public.schoolnet_parent_official_result('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001');
 IF d->>'found' IS DISTINCT FROM 'true'
 OR d->>'feedback' IS DISTINCT FROM repeat(chr(128578),4000)
 OR char_length(d->>'feedback')<>4000
 THEN RAISE EXCEPTION 'C1_FAIL_UNICODE_FEEDBACK_BOUNDARY'; END IF;
END $feedback_unicode$;
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_feedback_unicode;

-- V1 conserve son masquage des notes non publiees et ses details historiques.
SAVEPOINT c1_legacy_private;
UPDATE public.assessment_submissions SET status='graded'
 WHERE id='e1000000-0000-4000-8000-000000000003';
UPDATE public.homework_submissions SET status='graded'
 WHERE id='e2000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
DO $v1_private$
DECLARE d jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.get_parent_child_assessment_submissions('10000000-0000-4000-8000-000000000005') WHERE score IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.get_parent_child_homework_submissions('10000000-0000-4000-8000-000000000005') WHERE score IS NOT NULL)
 THEN RAISE EXCEPTION 'C1_FAIL_LEGACY_PRIVATE_GRADE'; END IF;
 d:=public.get_parent_child_assessment_detail('a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000005');
 IF d->>'found' IS DISTINCT FROM 'true' OR d#>'{submission,score}' IS DISTINCT FROM 'null'::jsonb
 OR d#>'{submission,feedback}' IS DISTINCT FROM 'null'::jsonb OR d->'questions' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'C1_FAIL_LEGACY_PRIVATE_DETAIL'; END IF;
END $v1_private$;
RESET ROLE;
ROLLBACK TO SAVEPOINT c1_legacy_private;

-- Controle explicite des droits SQL anonymes et de la conservation des barriers B.0.
DO $permissions$
DECLARE signature text; api regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'public.schoolnet_parent_official_results()',
  'public.schoolnet_parent_official_result(uuid,uuid)',
  'schoolnet_private.parent_official_results()',
  'schoolnet_private.parent_official_result(uuid,uuid)'
 ] LOOP
  api:=signature::regprocedure;
  IF has_function_privilege('anon',api,'EXECUTE')
   OR NOT has_function_privilege('authenticated',api,'EXECUTE')
  THEN RAISE EXCEPTION 'C1_FAIL_API_PERMISSIONS_%',signature; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','schoolnet_private.parent_official_result_rows(uuid,uuid)','EXECUTE')
 OR has_function_privilege('service_role','schoolnet_private.parent_official_result_rows(uuid,uuid)','EXECUTE')
 OR (SELECT count(*) FROM pg_policies WHERE policyname LIKE 's4b3b0_%' AND permissive='RESTRICTIVE')<>8
 THEN RAISE EXCEPTION 'C1_FAIL_INTERNAL_OR_B0_PERMISSIONS'; END IF;
 IF EXISTS(SELECT 1 FROM public.schoolnet_school_memberships
  WHERE member_role='parent') THEN RAISE EXCEPTION 'C1_FAIL_TEST_REQUIRES_PARENT_MEMBERSHIP'; END IF;
END $permissions$;

DO $no_writes$
DECLARE current_state jsonb;
BEGIN
 current_state:=jsonb_build_object(
  'copies',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.assessment_submissions t),
  'devoirs',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.homework_submissions t),
  'notifications',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.notifications t),
  'liens',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text) FROM public.parent_links t),
  'inscriptions',(SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.course_id,t.student_id),'[]'::jsonb)::text) FROM public.course_enrollments t)
 );
 IF current_state IS DISTINCT FROM (SELECT state FROM c1_baseline)
 THEN RAISE EXCEPTION 'C1_FAIL_READS_CHANGED_DATA'; END IF;
END $no_writes$;
SELECT 'S4B3C1_PARENT_RESULTS_A_B_PASS' AS result;
ROLLBACK;
