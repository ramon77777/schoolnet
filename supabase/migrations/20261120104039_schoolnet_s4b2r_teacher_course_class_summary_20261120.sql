-- SCHOOLNET V2 S4-B.2-R — migration de lecture des effectifs enseignants.
-- Appliquee sur le Supabase principal le 20/11/2026 : version 20261120104039.
-- Corps SQL identique a la proposition approuvee et testee A/B.
-- Ne modifie aucune table, inscription V1, evaluation, ressource ou RLS.

DO $preflight$
BEGIN
 IF to_regprocedure('schoolnet_private.teacher_course_class_summary(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_course_class_summary(uuid)') IS NOT NULL
 OR to_regprocedure('public.schoolnet_teacher_school_course_context()') IS NULL
 OR to_regprocedure('public.schoolnet_student_school_courses()') IS NULL
 OR to_regclass('schoolnet_private.school_course_links') IS NULL
 OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
 OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
 OR to_regclass('public.schoolnet_school_memberships') IS NULL
 OR to_regclass('public.course_subjects') IS NULL
 OR to_regprocedure('public.get_my_role()') IS NULL
 THEN
  RAISE EXCEPTION 'S4B2-R: preflight incomplet ou fonctions deja installees.';
 END IF;
END;
$preflight$;

CREATE FUNCTION schoolnet_private.teacher_course_class_summary(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $teacher_summary$
DECLARE
 v_uid uuid := auth.uid();
 v_school uuid;
 v_class uuid;
 v_year uuid;
 v_students bigint := 0;
BEGIN
 IF v_uid IS NULL OR p_course_id IS NULL
    OR public.get_my_role()::text IS DISTINCT FROM 'teacher'
 THEN
  RAISE EXCEPTION 'S4B2-R: enseignant authentifie requis.' USING ERRCODE='42501';
 END IF;

 -- Toujours verifier que le cours appartient au vrai compte professeur.
 -- Un ID devine d'un autre cours n'autorise meme pas a obtenir un compteur.
 IF NOT EXISTS(
   SELECT 1 FROM public.courses co
   WHERE co.id=p_course_id AND co.created_by=v_uid
 ) THEN
  RAISE EXCEPTION 'S4B2-R: cours non autorise.' USING ERRCODE='42501';
 END IF;

 -- Le cours doit toujours respecter ses affectations : meme controles
 -- d'ecole, classe, annee, matiere, proprietaire et statut que S4-B.2.
 SELECT l.school_id,l.class_id,l.school_year_id
 INTO v_school,v_class,v_year
 FROM schoolnet_private.school_course_links l
 JOIN public.courses co ON co.id=l.course_id
   AND co.status='active' AND co.created_by=v_uid
 JOIN public.schoolnet_schools s ON s.id=l.school_id AND s.status='active'
 JOIN public.classes cl ON cl.id=l.class_id
   AND cl.school_id=l.school_id
   AND cl.school_year_id=l.school_year_id
   AND cl.learning_context='school'
   AND (co.class_id IS NULL OR co.class_id=l.class_id)
   AND (co.level_id IS NULL OR co.level_id=cl.level_id)
 JOIN public.schoolnet_school_teacher_subject_assignments a
   ON a.id=l.teacher_assignment_id
   AND a.school_id=l.school_id AND a.class_id=l.class_id
   AND a.school_year_id=l.school_year_id
   AND a.teacher_id=l.teacher_id AND a.subject_id=l.subject_id
   AND a.status='active'
 JOIN public.schoolnet_school_memberships tm
   ON tm.school_id=l.school_id AND tm.user_id=v_uid
   AND tm.member_role='teacher' AND tm.status='active'
 JOIN public.academic_subjects sub
   ON sub.id=l.subject_id AND sub.is_active=true
 WHERE l.course_id=p_course_id AND l.teacher_id=v_uid
   AND l.status='active'
   AND NOT EXISTS (
     SELECT 1 FROM public.course_subjects cs
     WHERE cs.course_id=l.course_id AND cs.subject_id<>l.subject_id
   );

 -- Un cours libre, un lien revoque ou une ecole suspendue ne donne jamais
 -- acces aux effectifs officiels. Il ne faut pas afficher zero comme
 -- un effectif officiel si aucun rattachement actif n'existe.
 IF v_school IS NULL THEN
  RETURN jsonb_build_object(
    'courseId',p_course_id,'isOfficial',false,'officialStudentCount',0
  );
 END IF;

 SELECT count(DISTINCT a.student_id) INTO v_students
 FROM public.schoolnet_school_student_class_assignments a
 JOIN public.schoolnet_school_memberships m
   ON m.school_id=v_school AND m.user_id=a.student_id
   AND m.member_role='student' AND m.status='active'
 JOIN public.profiles p ON p.id=a.student_id AND p.role::text='student'
 WHERE a.school_id=v_school
   AND a.class_id=v_class
   AND a.school_year_id=v_year
   AND a.status='active';

 RETURN jsonb_build_object(
   'courseId',p_course_id,'isOfficial',true,
   'officialStudentCount',v_students
 );
END;
$teacher_summary$;

CREATE FUNCTION public.schoolnet_teacher_course_class_summary(p_course_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $summary_facade$
 SELECT schoolnet_private.teacher_course_class_summary(p_course_id);
$summary_facade$;

REVOKE ALL ON FUNCTION
 schoolnet_private.teacher_course_class_summary(uuid),
 public.schoolnet_teacher_course_class_summary(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 schoolnet_private.teacher_course_class_summary(uuid),
 public.schoolnet_teacher_course_class_summary(uuid)
 TO authenticated;

DO $verify$
DECLARE r record;v_count integer:=0;
BEGIN
 FOR r IN
  SELECT n.nspname,p.oid,p.prosecdef,
   (SELECT cfg.setting FROM unnest(p.proconfig) cfg(setting)
     WHERE cfg.setting LIKE 'search_path=%' LIMIT 1) AS search_path_setting
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname='schoolnet_teacher_course_class_summary')
     OR (n.nspname='schoolnet_private' AND p.proname='teacher_course_class_summary')
 LOOP
  v_count:=v_count+1;
  IF has_function_privilege('anon',r.oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',r.oid,'EXECUTE')
     OR r.search_path_setting IS DISTINCT FROM 'search_path=pg_catalog'
     OR (r.nspname='public' AND r.prosecdef)
     OR (r.nspname='schoolnet_private' AND NOT r.prosecdef)
  THEN
   RAISE EXCEPTION 'S4B2-R: permissions ou protection incorrectes.';
  END IF;
 END LOOP;
 IF v_count<>2 THEN RAISE EXCEPTION 'S4B2-R: deux fonctions attendues.'; END IF;
END;
$verify$;
