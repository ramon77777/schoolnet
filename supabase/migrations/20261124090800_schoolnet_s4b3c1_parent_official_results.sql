-- SCHOOLNET V2 S4-B.3-C.1 - PROPOSITION NON INSTALLEE SUR LE PROJET PRINCIPAL.
-- Installation uniquement apres GO distinct, dans une transaction atomique.
-- CI : psql -v ON_ERROR_STOP=1 -1 -f ce_fichier ; aucune donnee metier modifiee.
-- Lecture parent des seuls resultats publies, controles familiaux et scolaires
-- reevalues a chaque appel. Les huit policies B.0 restent inchangees.
-- Contrat familial : parent_links fait autorite ; child_ids n'accorde aucun droit.
-- Aucun membership parent exige, aucun filtre sur l'annee scolaire courante.

DO $c1_prerequisites$
BEGIN
 IF current_user<>'postgres'
  OR to_regclass('public.parent_links') IS NULL
  OR to_regclass('public.profiles') IS NULL
  OR to_regclass('public.assessment_submissions') IS NULL
  OR to_regclass('schoolnet_private.school_assessment_links') IS NULL
  OR to_regclass('schoolnet_private.school_course_links') IS NULL
  OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
  OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
  OR to_regprocedure('public.get_my_role()') IS NULL
  OR to_regprocedure('public.parent_can_read_child(uuid)') IS NULL
  OR to_regprocedure('public.is_linked_parent_of(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_course_access(uuid)') IS NULL
  OR to_regprocedure('schoolnet_private.student_school_course_assessments(uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_student_official_published_result(uuid,uuid)') IS NULL
  OR to_regprocedure('public.schoolnet_student_official_dashboard()') IS NULL
  OR NOT has_schema_privilege('authenticated','schoolnet_private','USAGE')
  OR (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND policyname LIKE 's4b3b0_%'
    AND permissive='RESTRICTIVE')<>8
 THEN RAISE EXCEPTION 'S4B3C1_PREREQUISITES_FAILED'; END IF;
END $c1_prerequisites$;

DO $c1_new_absent$
BEGIN
 IF to_regprocedure('schoolnet_private.parent_official_result_rows(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_results()') IS NOT NULL
  OR to_regprocedure('schoolnet_private.parent_official_result(uuid,uuid)') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_results()') IS NOT NULL
  OR to_regprocedure('public.schoolnet_parent_official_result(uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'S4B3C1_NEW_FUNCTION_ALREADY_EXISTS'; END IF;
END $c1_new_absent$;

-- Garde de derive : definitions/ACL reelles capturees le 24 novembre 2026.
DO $c1_legacy_before$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b609cd47364424e5b28eaa0f692f0db3','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','7bb34d159b8090d0104a43e6ccba9829','s'),
  ('public.get_parent_child_homework_submissions(uuid)','c784095a394514bbab780ac2ba6c1b77','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_before$;

CREATE FUNCTION schoolnet_private.parent_official_result_rows(p_child_id uuid DEFAULT NULL, p_assessment_id uuid DEFAULT NULL)
RETURNS TABLE(result jsonb, feedback text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $c1_function_0$
DECLARE
 v_uid uuid := auth.uid();
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'parent'
 THEN RAISE EXCEPTION 'S4B3C1_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 -- Aucun changement de JWT : le parent reste l'appelant et parent_links
 -- autorise l'enfant cible avant les controles scolaires B.2/B.3-A.
 RETURN QUERY
 SELECT jsonb_build_object(
  'childId',child.id,
  'childName',COALESCE(NULLIF(btrim(child.full_name),''),'Apprenant SCHOOLNET'),
  'courseId',co.id,'assessmentId',a.id,
  'schoolId',sch.id,
  'schoolName',COALESCE(NULLIF(btrim(sch.name),''),'Etablissement'),
  'classId',cl.id,
  'className',COALESCE(NULLIF(btrim(cl.name),''),'Classe'),
  'schoolYear',COALESCE(NULLIF(btrim(cl.school_year),''),'Annee scolaire non renseignee'),
  'subjectName',COALESCE(NULLIF(btrim(subject.name),''),'Matiere'),
  'courseTitle',COALESCE(NULLIF(btrim(co.title),''),'Cours'),
  'title',COALESCE(NULLIF(btrim(a.title),''),'Evaluation'),
  'type',a.type::text,'maxScore',a.max_score,'score',submission.score,
  'publishedAt',submission.published_at
 ), submission.feedback::text
 FROM public.parent_links family
 JOIN public.profiles child
  ON child.id=family.student_id AND child.role::text='student'
 JOIN public.assessment_submissions submission
  ON submission.student_id=child.id
  AND submission.status::text='published'
  AND submission.published_at IS NOT NULL AND isfinite(submission.published_at)
  AND submission.score IS NOT NULL
  AND submission.score::text NOT IN ('NaN','Infinity','-Infinity')
 JOIN public.assessments a
  ON a.id=submission.assessment_id AND a.status::text='published'
  AND a.type::text IN ('quiz','assignment','exam')
  AND a.max_score IS NOT NULL AND a.max_score>0
  AND a.max_score::text NOT IN ('NaN','Infinity','-Infinity')
  AND submission.score>=0 AND submission.score<=a.max_score
 JOIN schoolnet_private.school_assessment_links assessment_link
  ON assessment_link.assessment_id=a.id AND assessment_link.status='active'
 JOIN schoolnet_private.school_course_links course_link
  ON course_link.id=assessment_link.school_course_link_id
  AND course_link.course_id=a.course_id AND course_link.status='active'
  AND a.created_by=course_link.teacher_id
 JOIN public.courses co
  ON co.id=course_link.course_id AND co.status='active'
  AND co.created_by=course_link.teacher_id
 JOIN public.schoolnet_schools sch
  ON sch.id=course_link.school_id AND sch.status='active'
 JOIN public.classes cl
  ON cl.id=course_link.class_id AND cl.school_id=course_link.school_id
  AND cl.school_year_id=course_link.school_year_id
  AND cl.learning_context='school'
  AND (co.class_id IS NULL OR co.class_id=course_link.class_id)
  AND (co.level_id IS NULL OR co.level_id=cl.level_id)
 JOIN public.profiles teacher_profile
  ON teacher_profile.id=course_link.teacher_id AND teacher_profile.role::text='teacher'
 JOIN public.schoolnet_school_teacher_subject_assignments teacher_assignment
  ON teacher_assignment.id=course_link.teacher_assignment_id
  AND teacher_assignment.school_id=course_link.school_id
  AND teacher_assignment.class_id=course_link.class_id
  AND teacher_assignment.school_year_id=course_link.school_year_id
  AND teacher_assignment.teacher_id=course_link.teacher_id
  AND teacher_assignment.subject_id=course_link.subject_id
  AND teacher_assignment.status='active'
 JOIN public.academic_subjects subject
  ON subject.id=course_link.subject_id AND subject.is_active=true
 JOIN public.schoolnet_school_memberships teacher_membership
  ON teacher_membership.school_id=course_link.school_id
  AND teacher_membership.user_id=course_link.teacher_id
  AND teacher_membership.member_role='teacher' AND teacher_membership.status='active'
 JOIN public.schoolnet_school_memberships child_membership
  ON child_membership.school_id=course_link.school_id
  AND child_membership.user_id=child.id
  AND child_membership.member_role='student' AND child_membership.status='active'
 JOIN public.schoolnet_school_student_class_assignments child_assignment
  ON child_assignment.school_id=course_link.school_id
  AND child_assignment.class_id=course_link.class_id
  AND child_assignment.school_year_id=course_link.school_year_id
  AND child_assignment.student_id=child.id AND child_assignment.status='active'
 WHERE family.parent_id=v_uid
  AND (p_child_id IS NULL OR child.id=p_child_id)
  AND (p_assessment_id IS NULL OR a.id=p_assessment_id)
  AND NOT EXISTS (
   SELECT 1 FROM public.course_subjects course_subject
   WHERE course_subject.course_id=course_link.course_id
    AND course_subject.subject_id<>course_link.subject_id
  )
  AND (a.section_id IS NULL OR EXISTS (
   SELECT 1 FROM public.course_sections section
   WHERE section.id=a.section_id AND section.course_id=a.course_id
  ))
 ORDER BY child.id,submission.published_at DESC,a.id
 LIMIT 5001;
 -- 5001 est une sentinelle : le catalogue refuse tout depassement de 5000.
 -- Aucun filtre is_current : l'annee est celle du contexte scolaire autorise.
END;
$c1_function_0$;

CREATE FUNCTION schoolnet_private.parent_official_results()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $c1_function_1$
DECLARE
 v_uid uuid := auth.uid();
 v_children jsonb;
 v_results jsonb;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'parent'
 THEN RAISE EXCEPTION 'S4B3C1_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

 SELECT COALESCE(jsonb_agg(
  jsonb_build_object('childId',linked.id,'fullName',linked.full_name)
  ORDER BY linked.full_name,linked.id
 ),'[]'::jsonb)
 INTO v_children
 FROM (
  SELECT DISTINCT child.id,
   COALESCE(NULLIF(btrim(child.full_name),''),'Apprenant SCHOOLNET') AS full_name
  FROM public.parent_links family
  JOIN public.profiles child ON child.id=family.student_id AND child.role::text='student'
  WHERE family.parent_id=v_uid
  ORDER BY child.id LIMIT 1001
 ) linked;
 IF jsonb_array_length(v_children)>1000
 THEN RAISE EXCEPTION 'S4B3C1_TOO_MANY_CHILDREN' USING ERRCODE='54000'; END IF;

 SELECT COALESCE(jsonb_agg(rows.result
  ORDER BY rows.result->>'childName',
   (rows.result->>'publishedAt')::timestamptz DESC,
   rows.result->>'childId',rows.result->>'assessmentId'
 ),'[]'::jsonb)
 INTO v_results
 FROM schoolnet_private.parent_official_result_rows(NULL,NULL) rows;
 IF jsonb_array_length(v_results)>5000
 THEN RAISE EXCEPTION 'S4B3C1_TOO_MANY_RESULTS' USING ERRCODE='54000'; END IF;

 RETURN jsonb_build_object('children',v_children,'results',v_results);
END;
$c1_function_1$;

CREATE FUNCTION schoolnet_private.parent_official_result(p_child_id uuid, p_assessment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $c1_function_2$
DECLARE
 v_uid uuid := auth.uid();
 v_result jsonb;
 v_feedback text;
BEGIN
 IF v_uid IS NULL OR public.get_my_role()::text IS DISTINCT FROM 'parent'
 THEN RAISE EXCEPTION 'S4B3C1_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_child_id IS NULL OR p_assessment_id IS NULL
 THEN RETURN jsonb_build_object('found',false); END IF;

 -- Le helper recontrole le lien familial ET scolaire a chaque lecture.
 -- Meme reponse pour UUID inconnu, enfant non lie et resultat non publie.
 SELECT rows.result,rows.feedback INTO v_result,v_feedback
 FROM schoolnet_private.parent_official_result_rows(p_child_id,p_assessment_id) rows;
 IF v_result IS NULL THEN RETURN jsonb_build_object('found',false); END IF;
 IF v_feedback IS NOT NULL AND char_length(v_feedback)>4000
 THEN RAISE EXCEPTION 'S4B3C1_INVALID_PUBLISHED_FEEDBACK' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('found',true,'result',v_result,'feedback',v_feedback);
END;
$c1_function_2$;

CREATE FUNCTION public.schoolnet_parent_official_results()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $c1_function_3$
 SELECT schoolnet_private.parent_official_results();
$c1_function_3$;

CREATE FUNCTION public.schoolnet_parent_official_result(p_child_id uuid, p_assessment_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog
AS $c1_function_4$
 SELECT schoolnet_private.parent_official_result(p_child_id,p_assessment_id);
$c1_function_4$;

REVOKE ALL ON FUNCTION schoolnet_private.parent_official_result_rows(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION schoolnet_private.parent_official_results() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION schoolnet_private.parent_official_results() TO authenticated;
REVOKE ALL ON FUNCTION schoolnet_private.parent_official_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION schoolnet_private.parent_official_result(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_parent_official_results() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_parent_official_results() TO authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_parent_official_result(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.schoolnet_parent_official_result(uuid,uuid) TO authenticated;


-- La definition capturee contient des corps CRLF : remplacement sur le texte
-- canonique pour les conserver a l'octet pres, sauf le filtre ci-dessous.
-- CREATE OR REPLACE preserve signatures, proprietaire et ACL historiques.
-- AUCUN filtre status sur school_assessment_links : actif OU revoque = officiel.
DO $c1_harden_legacy$
DECLARE expected record; original_definition text; hardened_definition text;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b609cd47364424e5b28eaa0f692f0db3','b89c4719c8b5b5fa427cf634328da45e','  where a.id = p_assessment_id','"  where a.id = p_assessment_id\r\n    and not exists (\r\n      select 1 from schoolnet_private.school_assessment_links official_link\r\n      where official_link.assessment_id = a.id\r\n    )"'::jsonb #>> '{}'),
  ('public.get_parent_child_assessment_submissions(uuid)','7bb34d159b8090d0104a43e6ccba9829','56a21d53edfc0dc8b5eb5addfe0e8a0c','  where s.student_id = p_child_id','"  where s.student_id = p_child_id\r\n    and not exists (\r\n      select 1 from schoolnet_private.school_assessment_links official_link\r\n      where official_link.assessment_id = s.assessment_id\r\n    )"'::jsonb #>> '{}'),
  ('public.get_parent_child_homework_submissions(uuid)','c784095a394514bbab780ac2ba6c1b77','deddc10f89c5f3d7623161440d7922e7','  where s.student_id = p_child_id','"  where s.student_id = p_child_id\r\n    and not exists (\r\n      select 1 from schoolnet_private.school_assessment_links official_link\r\n      where official_link.assessment_id = s.homework_id\r\n    )"'::jsonb #>> '{}')
 ) e(signature,original_md5,hardened_md5,old_fragment,new_fragment)
 LOOP
  original_definition:=pg_get_functiondef(to_regprocedure(expected.signature));
  IF md5(original_definition) IS DISTINCT FROM expected.original_md5
   OR (length(original_definition)-length(replace(original_definition,expected.old_fragment,'')))
      /length(expected.old_fragment)<>1
  THEN RAISE EXCEPTION 'S4B3C1_HARDENING_DRIFT: %',expected.signature; END IF;
  hardened_definition:=replace(original_definition,expected.old_fragment,expected.new_fragment);
  IF md5(hardened_definition) IS DISTINCT FROM expected.hardened_md5
  THEN RAISE EXCEPTION 'S4B3C1_HARDENING_PATCH_MISMATCH: %',expected.signature; END IF;
  EXECUTE hardened_definition;
 END LOOP;
END $c1_harden_legacy$;

DO $c1_legacy_after$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('public.get_parent_child_assessment_detail(uuid,uuid)','b89c4719c8b5b5fa427cf634328da45e','v'),
  ('public.get_parent_child_assessment_submissions(uuid)','56a21d53edfc0dc8b5eb5addfe0e8a0c','s'),
  ('public.get_parent_child_homework_submissions(uuid)','deddc10f89c5f3d7623161440d7922e7','s')
 ) e(signature,definition_md5,volatility)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_LEGACY_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosecdef,p.provolatile,p.proconfig,p.proacl,
   pg_get_userbyid(p.proowner) AS owner_name
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(pg_get_functiondef(function_oid)) IS DISTINCT FROM expected.definition_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM true
   OR actual.provolatile::text IS DISTINCT FROM expected.volatility
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
   OR actual.proacl::text IS DISTINCT FROM
    '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN RAISE EXCEPTION 'S4B3C1_LEGACY_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_legacy_after$;


DO $c1_new_contract$
DECLARE expected record; actual record; function_oid oid;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
  ('schoolnet_private.parent_official_result_rows(uuid,uuid)','3dab15b18217d38b217a6ef9001b44a7',true,false),
  ('schoolnet_private.parent_official_results()','011b328d2661f527ed4d2b44157a23fb',true,true),
  ('schoolnet_private.parent_official_result(uuid,uuid)','a33486cb017eada436f3729f7c7e939e',true,true),
  ('public.schoolnet_parent_official_results()','14287b22e8164c61042faa373d47f688',false,true),
  ('public.schoolnet_parent_official_result(uuid,uuid)','cb9de127953543d4b3bb3feeb5e299ad',false,true)
 ) e(signature,body_md5,security_definer,authenticated_execute)
 LOOP
  function_oid:=to_regprocedure(expected.signature);
  IF function_oid IS NULL THEN
   RAISE EXCEPTION 'S4B3C1_NEW_FUNCTION_MISSING: %',expected.signature;
  END IF;
  SELECT p.prosrc,p.prosecdef,p.provolatile,p.proconfig,
   pg_get_userbyid(p.proowner) AS owner_name,
   EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner)))
    WHERE grantee=0 AND privilege_type='EXECUTE') AS public_execute
  INTO actual FROM pg_proc p WHERE p.oid=function_oid;
  IF md5(actual.prosrc) IS DISTINCT FROM expected.body_md5
   OR actual.owner_name IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM expected.security_definer
   OR actual.provolatile IS DISTINCT FROM 's'::"char"
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
   OR actual.public_execute
   OR has_function_privilege('anon',function_oid,'EXECUTE')
   OR has_function_privilege('service_role',function_oid,'EXECUTE')
   OR has_function_privilege('authenticated',function_oid,'EXECUTE')
      IS DISTINCT FROM expected.authenticated_execute
  THEN RAISE EXCEPTION 'S4B3C1_NEW_DEFINITION_OR_ACL_DRIFT: %',expected.signature;
  END IF;
 END LOOP;
END $c1_new_contract$;

SELECT 'S4B3C1_PARENT_OFFICIAL_RESULTS_PASS' AS result;
