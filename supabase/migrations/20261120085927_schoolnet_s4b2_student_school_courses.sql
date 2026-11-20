-- SCHOOLNET V2 — S4-B.2 : migration des fonctions de lecture scolaire eleve.
-- Migration production : 20261120085927 (autorisation explicite du 20/11/2026).
-- Corps SQL identique a la proposition recette A/B, seul l'en-tete change.
-- Aucun changement des tables ni des politiques RLS des cours libres V1.
-- Aucune inscription automatique (course_enrollments), aucune ecriture.
-- Installation sur Supabase principal explicitement autorisee et effectuee.
-- IMPORTANT : les URLs des fichiers V1 du bucket course-resources sont
-- publiques : ce RPC protege la DECOUVERTE, pas la confidentialite des
-- objets deja accessibles directement par leur URL publique.

DO $s4b2_preflight$
BEGIN
  IF to_regprocedure('public.schoolnet_student_school_courses()') IS NOT NULL
     OR to_regprocedure('public.schoolnet_student_school_course_detail(uuid)') IS NOT NULL
     OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NOT NULL
     OR to_regprocedure('schoolnet_private.student_school_courses()') IS NOT NULL
     OR to_regprocedure('schoolnet_private.student_school_course_detail(uuid)') IS NOT NULL
     OR to_regclass('schoolnet_private.school_course_links') IS NULL
     OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
     OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
     OR to_regclass('public.course_sections') IS NULL
     OR to_regclass('public.resources') IS NULL
     OR to_regclass('public.course_subjects') IS NULL
     OR to_regprocedure('public.get_my_role()') IS NULL
  THEN
    RAISE EXCEPTION 'S4-B.2: prerequis S3-C/S4-B.1 manquants ou RPC deja presentes.';
  END IF;
END;
$s4b2_preflight$;

-- Autorisation a usage INTERNE : identite depuis auth.uid(), jamais depuis
-- un UUID fourni par le navigateur ; roles et appartenances sont revérifies
-- sur CHAQUE lecture (revocation immediate, multi-ecoles).
CREATE FUNCTION schoolnet_private.student_school_course_access(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $student_access$
 SELECT COALESCE(
   auth.uid() IS NOT NULL
   AND public.get_my_role()::text='student'
   AND EXISTS (
     SELECT 1
     FROM schoolnet_private.school_course_links l
     JOIN public.courses co
       ON co.id=l.course_id AND co.status='active'
       AND co.created_by=l.teacher_id
     JOIN public.schoolnet_schools s
       ON s.id=l.school_id AND s.status='active'
     JOIN public.classes c
       ON c.id=l.class_id AND c.school_id=l.school_id
       AND c.school_year_id=l.school_year_id
       AND c.learning_context='school'
       AND (co.class_id IS NULL OR co.class_id=l.class_id)
       AND (co.level_id IS NULL OR co.level_id=c.level_id)
     JOIN public.profiles teacher_profile
       ON teacher_profile.id=l.teacher_id
       AND teacher_profile.role::text='teacher'
     JOIN public.schoolnet_school_teacher_subject_assignments a
       ON a.id=l.teacher_assignment_id
       AND a.school_id=l.school_id AND a.class_id=l.class_id
       AND a.school_year_id=l.school_year_id
       AND a.teacher_id=l.teacher_id AND a.subject_id=l.subject_id
       AND a.status='active'
     JOIN public.academic_subjects sub
       ON sub.id=l.subject_id AND sub.is_active=true
     JOIN public.schoolnet_school_memberships teacher_m
       ON teacher_m.school_id=l.school_id
       AND teacher_m.user_id=l.teacher_id
       AND teacher_m.member_role='teacher' AND teacher_m.status='active'
     JOIN public.schoolnet_school_memberships student_m
       ON student_m.school_id=l.school_id
       AND student_m.user_id=auth.uid()
       AND student_m.member_role='student' AND student_m.status='active'
     JOIN public.schoolnet_school_student_class_assignments student_a
       ON student_a.school_id=l.school_id
       AND student_a.class_id=l.class_id
       AND student_a.school_year_id=l.school_year_id
       AND student_a.student_id=auth.uid() AND student_a.status='active'
     WHERE l.course_id=p_course_id AND l.status='active'
       AND NOT EXISTS (
         SELECT 1 FROM public.course_subjects cs
         WHERE cs.course_id=l.course_id AND cs.subject_id<>l.subject_id
       )
   ),false);
$student_access$;

-- Catalogue scolaire de l'eleve, distinct de son catalogue V1.
CREATE FUNCTION schoolnet_private.student_school_courses()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $school_courses$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'student'
 THEN
   RAISE EXCEPTION 'S4-B.2: acces refuse.' USING ERRCODE='42501';
 END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'courseId',co.id,'title',co.title,'description',co.description,
   'schoolId',s.id,'schoolName',s.name,
   'classId',c.id,'className',c.name,
   'schoolYear',c.school_year,'subjectName',sub.name
 ) ORDER BY s.name,c.school_year,c.name,sub.name,co.title,co.id),'[]'::jsonb)
 INTO v_result
 FROM schoolnet_private.school_course_links l
 JOIN public.courses co ON co.id=l.course_id
 JOIN public.schoolnet_schools s ON s.id=l.school_id
 JOIN public.classes c ON c.id=l.class_id
 JOIN public.academic_subjects sub ON sub.id=l.subject_id
 WHERE schoolnet_private.student_school_course_access(l.course_id);

 RETURN jsonb_build_object('courses',v_result);
END;
$school_courses$;

CREATE FUNCTION public.schoolnet_student_school_courses()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_courses$
 SELECT schoolnet_private.student_school_courses();
$facade_courses$;

-- Detail du cours et ses ressources visibles aux apprenants de la classe.
-- AUCUN cours V1, inscription, progression, note, identite d'eleve,
-- evenement ou fichier prive n'est transporte implicitement.
CREATE FUNCTION schoolnet_private.student_school_course_detail(p_course_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $school_detail$
DECLARE v_detail jsonb;
BEGIN
 IF p_course_id IS NULL
   OR NOT schoolnet_private.student_school_course_access(p_course_id)
 THEN RAISE EXCEPTION 'S4-B.2: cours indisponible ou acces refuse.'
      USING ERRCODE='42501'; END IF;

 SELECT jsonb_build_object(
   'courseId',co.id,'title',co.title,'description',co.description,
   'schoolName',s.name,'className',c.name,
   'schoolYear',c.school_year,'subjectName',sub.name,
   'sections',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'id',sec.id,'title',sec.title,'orderIndex',sec.order_index
     ) ORDER BY sec.order_index,sec.id)
     FROM public.course_sections sec
     WHERE sec.course_id=co.id
   ),'[]'::jsonb),
   'resources',COALESCE((
     SELECT jsonb_agg(jsonb_build_object(
       'id',r.id,'sectionId',r.section_id,'title',r.title,
       'type',r.type::text,'url',r.url,
       'isDownloadable',r.is_downloadable
     ) ORDER BY r.created_at,r.id)
     FROM public.resources r
     WHERE r.course_id=co.id
       AND r.visibility='public_to_course'
       AND r.url ~* '^https://[^[:space:]]+$'
       AND (r.section_id IS NULL OR EXISTS(
         SELECT 1 FROM public.course_sections sec
         WHERE sec.id=r.section_id AND sec.course_id=co.id))
   ),'[]'::jsonb)
 ) INTO v_detail
 FROM schoolnet_private.school_course_links l
 JOIN public.courses co ON co.id=l.course_id AND co.status='active'
 JOIN public.schoolnet_schools s ON s.id=l.school_id AND s.status='active'
 JOIN public.classes c ON c.id=l.class_id
 JOIN public.academic_subjects sub ON sub.id=l.subject_id AND sub.is_active
 WHERE l.course_id=p_course_id AND l.status='active';
 IF v_detail IS NULL THEN
   RAISE EXCEPTION 'S4-B.2: cours indisponible ou acces refuse.'
     USING ERRCODE='42501'; END IF;
 RETURN v_detail;
END;
$school_detail$;

CREATE FUNCTION public.schoolnet_student_school_course_detail(p_course_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $facade_detail$
 SELECT schoolnet_private.student_school_course_detail(p_course_id);
$facade_detail$;

-- Aucun droit par defaut pour anon/PUBLIC ; fonctions privees jamais
-- exposees au Data API et aucune table V1 nouvellement exposee.
REVOKE ALL ON FUNCTION
 schoolnet_private.student_school_course_access(uuid),
 schoolnet_private.student_school_courses(),
 schoolnet_private.student_school_course_detail(uuid),
 public.schoolnet_student_school_courses(),
 public.schoolnet_student_school_course_detail(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 schoolnet_private.student_school_course_access(uuid),
 schoolnet_private.student_school_courses(),
 schoolnet_private.student_school_course_detail(uuid),
 public.schoolnet_student_school_courses(),
 public.schoolnet_student_school_course_detail(uuid)
 TO authenticated;

DO $s4b2_verify$
DECLARE r record;v_n int:=0;
BEGIN
 FOR r IN SELECT p.oid,p.prosecdef,n.nspname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE (n.nspname='public' AND p.proname IN (
    'schoolnet_student_school_courses','schoolnet_student_school_course_detail'))
   OR (n.nspname='schoolnet_private' AND p.proname IN (
    'student_school_course_access','student_school_courses','student_school_course_detail'))
 LOOP
  v_n:=v_n+1;
  IF has_function_privilege('anon',r.oid,'EXECUTE')
    OR NOT has_function_privilege('authenticated',r.oid,'EXECUTE')
    OR (r.nspname='public' AND r.prosecdef)
    OR (r.nspname='schoolnet_private' AND NOT r.prosecdef)
  THEN RAISE EXCEPTION 'S4-B.2: privileges ou securite incorrects.'; END IF;
 END LOOP;
 IF v_n<>5 THEN RAISE EXCEPTION 'S4-B.2: cinq fonctions attendues, % trouvees.',v_n; END IF;
END;
$s4b2_verify$;
