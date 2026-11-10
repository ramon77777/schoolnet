-- SCHOOLNET | Assertions de recette de la proposition RLS phase 1.
-- Ce fichier ne doit pas etre execute seul : utiliser dans une
-- transaction BEGIN avec la proposition SQL, puis terminer ROLLBACK.
-- Exemple de concat :
-- BEGIN;
-- <contenu de supabase/proposals/school_admin_legacy_read_fence_phase1.sql>
-- <contenu de CE FICHIER>
-- ROLLBACK;
-- Ne pas utiliser COMMIT pour cette recette.

DO $setup$
DECLARE v_local uuid;v_admin uuid;v_teacher uuid;v_student uuid;v_parent uuid;
BEGIN
 SELECT user_id INTO v_local FROM public.schoolnet_school_memberships
  WHERE member_role='school_admin' AND status='active' LIMIT 1;
 SELECT id INTO v_admin FROM public.profiles WHERE role='admin' LIMIT 1;
 SELECT id INTO v_teacher FROM public.profiles WHERE role='teacher' LIMIT 1;
 SELECT id INTO v_student FROM public.profiles WHERE role='student' LIMIT 1;
 SELECT id INTO v_parent FROM public.profiles WHERE role='parent' LIMIT 1;
 IF v_local IS NULL OR v_admin IS NULL OR v_teacher IS NULL
  OR v_student IS NULL OR v_parent IS NULL THEN
  RAISE EXCEPTION 'Profils QA manquants : annuler.';
 END IF;
 PERFORM set_config('qa.school.local',v_local::text,true);
 PERFORM set_config('qa.school.global',v_admin::text,true);
 PERFORM set_config('qa.school.teacher',v_teacher::text,true);
 PERFORM set_config('qa.school.student',v_student::text,true);
 PERFORM set_config('qa.school.parent',v_parent::text,true);
 PERFORM set_config('request.jwt.claim.sub',v_local::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END;
$setup$;

SET LOCAL ROLE authenticated;
DO $local_qa$
BEGIN
 IF public.get_my_role()::text <> 'school_admin'
  OR (SELECT count(*) FROM public.schoolnet_schools) <> 1
  OR (SELECT count(*) FROM public.classes) <> 0
  OR (SELECT count(*) FROM public.school_years) <> 0
  OR (SELECT count(*) FROM public.grading_periods) <> 0
  OR (SELECT count(*) FROM public.rooms) <> 0
  OR (SELECT count(*) FROM public.class_subject_settings) <> 0
  OR (SELECT count(*) FROM public.course_subjects) <> 0
  OR (SELECT count(*) FROM public.assessment_average_settings) <> 0
 THEN RAISE EXCEPTION 'Fuite RLS de donnees legacy vers school_admin'; END IF;
END;$local_qa$;
RESET ROLE;

DO $use_teacher$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.school.teacher'),true);
END;$use_teacher$;
SET LOCAL ROLE authenticated;
DO $teacher_qa$
BEGIN
 IF public.get_my_role()::text <> 'teacher'
  OR (SELECT count(*) FROM public.classes) <> 2
  OR (SELECT count(*) FROM public.school_years) <> 3
  OR (SELECT count(*) FROM public.rooms) <> 2
 THEN RAISE EXCEPTION 'Regressions enseignants sur donnees existantes'; END IF;
END;$teacher_qa$;
RESET ROLE;

DO $use_student$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.school.student'),true);
END;$use_student$;
SET LOCAL ROLE authenticated;
DO $student_qa$
BEGIN
 IF public.get_my_role()::text <> 'student'
  OR (SELECT count(*) FROM public.classes) <> 2
  OR (SELECT count(*) FROM public.school_years) <> 3
 THEN RAISE EXCEPTION 'Regressions apprenants sur donnees existantes'; END IF;
END;$student_qa$;
RESET ROLE;

DO $use_parent$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.school.parent'),true);
END;$use_parent$;
SET LOCAL ROLE authenticated;
DO $parent_qa$
BEGIN
 IF public.get_my_role()::text <> 'parent'
  OR (SELECT count(*) FROM public.classes) <> 2
  OR (SELECT count(*) FROM public.school_years) <> 3
 THEN RAISE EXCEPTION 'Regressions parents sur donnees existantes'; END IF;
END;$parent_qa$;
RESET ROLE;

DO $use_admin$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.school.global'),true);
END;$use_admin$;
SET LOCAL ROLE authenticated;
DO $admin_qa$
BEGIN
 IF public.get_my_role()::text <> 'admin'
  OR (SELECT count(*) FROM public.classes) <> 2
  OR (SELECT count(*) FROM public.school_years) <> 3
 THEN RAISE EXCEPTION 'Regressions super-admin sur donnees existantes'; END IF;
END;$admin_qa$;
RESET ROLE;

-- IMPORTANT : effectuer ROLLBACK apres ce fichier.
SELECT 'QA_RLS_LOCAL_FENCE_FIVE_ROLES_OK_ROLLBACK_REQUIRED' AS result;
