-- SCHOOLNET S2-B | Recette transactionnelle non persistante
-- Executer : BEGIN; <SQL S2-A>; <SQL S2-B>; <CE TEST>; ROLLBACK;
-- Ne JAMAIS utiliser COMMIT pour ces fixtures de test.

DO $setup$
DECLARE v_local uuid;v_school_a uuid;v_school_b uuid;
DECLARE v_teacher uuid;v_student uuid;v_parent uuid;v_admin uuid;
BEGIN
 SELECT m.user_id,m.school_id INTO v_local,v_school_a
 FROM public.schoolnet_school_memberships m
 JOIN public.schoolnet_schools s ON s.id=m.school_id
 WHERE m.status='active' AND m.member_role='school_admin' AND s.status='active'
 LIMIT 1;

 SELECT id INTO v_school_b FROM public.schoolnet_schools
 WHERE id<>v_school_a AND status='active' LIMIT 1;

 SELECT id INTO v_teacher FROM public.profiles WHERE role='teacher' LIMIT 1;
 SELECT id INTO v_student FROM public.profiles WHERE role='student' LIMIT 1;
 SELECT id INTO v_parent FROM public.profiles WHERE role='parent' LIMIT 1;
 SELECT id INTO v_admin FROM public.profiles WHERE role='admin' LIMIT 1;

 IF v_local IS NULL OR v_school_a IS NULL OR v_school_b IS NULL
    OR v_teacher IS NULL OR v_student IS NULL OR v_parent IS NULL
    OR v_admin IS NULL
 THEN RAISE EXCEPTION 'Acteurs QA manquants : annulation du test.'; END IF;

 PERFORM set_config('qa.b.school_a',v_school_a::text,true);
 PERFORM set_config('qa.b.school_b',v_school_b::text,true);
 PERFORM set_config('qa.b.local',v_local::text,true);
 PERFORM set_config('qa.b.teacher',v_teacher::text,true);
 PERFORM set_config('qa.b.student',v_student::text,true);
 PERFORM set_config('qa.b.parent',v_parent::text,true);
 PERFORM set_config('qa.b.admin',v_admin::text,true);
 PERFORM set_config('qa.b.classes_before',
   (SELECT count(*)::text FROM public.classes),true);
 PERFORM set_config('qa.b.audit_before',
   (SELECT count(*)::text FROM public.schoolnet_school_audit),true);
 PERFORM set_config('request.jwt.claim.sub',v_local::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
END;
$setup$;

SET LOCAL ROLE authenticated;

DO $check_local$
DECLARE
 v_a uuid:=current_setting('qa.b.school_a')::uuid;
 v_b uuid:=current_setting('qa.b.school_b')::uuid;
 v_catalog jsonb;
 v_level bigint;
 v_year uuid;
 v_class uuid;
 v_other_school_blocked boolean:=false;
 v_other_catalog_blocked boolean:=false;
 v_duplicate_blocked boolean:=false;
 v_invalid_level_blocked boolean:=false;
 v_invalid_year_blocked boolean:=false;
BEGIN
 IF public.get_my_role()::text <> 'school_admin' THEN
   RAISE EXCEPTION 'Mauvais role pour test local.';
 END IF;

 v_catalog:=public.schoolnet_school_class_catalog(v_a);
 IF v_catalog->>'school_id'<>v_a::text
    OR jsonb_array_length(v_catalog->'levels')<1
    OR jsonb_array_length(v_catalog->'school_years')<1
 THEN
   RAISE EXCEPTION 'Catalogue non autorise ou referentiels vides.';
 END IF;

 v_level:=(v_catalog->'levels'->0->>'id')::bigint;
 v_year:=(v_catalog->'school_years'->0->>'id')::uuid;

 v_class:=public.schoolnet_school_create_class(
   v_a,v_level,v_year,'5e A QA S2B'
 );
 PERFORM set_config('qa.b.new_class_id',v_class::text,true);

 IF NOT EXISTS(
   SELECT 1 FROM public.classes c
   WHERE c.id=v_class AND c.school_id=v_a
     AND c.learning_context='school'
     AND c.name='5e A QA S2B'
 ) OR EXISTS (
   SELECT 1 FROM public.classes c
   WHERE c.learning_context='legacy_unclassified'
 )
 THEN
   RAISE EXCEPTION 'Classe de test non creee ou donnees legacy modifiees.';
 END IF;

 BEGIN
   PERFORM public.schoolnet_school_class_catalog(v_b);
 EXCEPTION WHEN insufficient_privilege THEN v_other_catalog_blocked:=true;
 END;

 BEGIN
   PERFORM public.schoolnet_school_create_class(v_b,v_level,v_year,'QA B non autorisee');
 EXCEPTION WHEN insufficient_privilege THEN v_other_school_blocked:=true;
 END;

 BEGIN
   PERFORM public.schoolnet_school_create_class(v_a,v_level,v_year,'5e A QA S2B');
 EXCEPTION WHEN unique_violation THEN v_duplicate_blocked:=true;
 END;

 BEGIN
   PERFORM public.schoolnet_school_create_class(v_a,-987654321,v_year,'QA niveau invalide');
 EXCEPTION WHEN invalid_parameter_value THEN v_invalid_level_blocked:=true;
 END;

 BEGIN
   PERFORM public.schoolnet_school_create_class(
     v_a,v_level,'00000000-0000-0000-0000-000000000000'::uuid,'QA annee invalide'
   );
 EXCEPTION WHEN invalid_parameter_value THEN v_invalid_year_blocked:=true;
 END;

 IF NOT(v_other_catalog_blocked AND v_other_school_blocked
    AND v_duplicate_blocked AND v_invalid_level_blocked
    AND v_invalid_year_blocked)
 THEN
   RAISE EXCEPTION 'Permissions/validation S2-B: catalogue B %, creation B %, doublon %, niveau %, annee %',
    v_other_catalog_blocked,v_other_school_blocked,v_duplicate_blocked,
    v_invalid_level_blocked,v_invalid_year_blocked;
 END IF;
END;
$check_local$;

RESET ROLE;

DO $audit_assert$
BEGIN
 IF (SELECT count(*) FROM public.schoolnet_school_audit)
    <> current_setting('qa.b.audit_before')::integer + 1
 OR NOT EXISTS (
   SELECT 1 FROM public.schoolnet_school_audit
   WHERE school_id=current_setting('qa.b.school_a')::uuid
     AND action='school_class_created'
     AND actor_id=current_setting('qa.b.local')::uuid
 )
 THEN
    RAISE EXCEPTION 'Creation non journalisee correctement.';
 END IF;
END;
$audit_assert$;

-- Les comptes historiques, super admin compris, ne disposent pas de ce RPC
-- propre aux administrateurs locaux (leurs actions centrales restent separees).
DO $change_actor$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.b.teacher'),true);
END;$change_actor$;

SET LOCAL ROLE authenticated;
DO $denied_teacher$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_school_class_catalog(current_setting('qa.b.school_a')::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Enseignant a acces au catalogue local.';END IF;
END;$denied_teacher$;
RESET ROLE;

DO $change_actor$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.b.student'),true);
END;$change_actor$;
SET LOCAL ROLE authenticated;
DO $denied_student$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_school_create_class(
     current_setting('qa.b.school_a')::uuid,1,
     '00000000-0000-0000-0000-000000000000'::uuid,
     'QA Etudiant'
   );
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Apprenant autorise a creer une classe.';END IF;
END;$denied_student$;
RESET ROLE;

DO $change_actor$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.b.parent'),true);
END;$change_actor$;
SET LOCAL ROLE authenticated;
DO $denied_parent$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_school_class_catalog(current_setting('qa.b.school_a')::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Parent autorise a lire le catalogue local.';END IF;
END;$denied_parent$;
RESET ROLE;

DO $change_actor$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.b.admin'),true);
END;$change_actor$;
SET LOCAL ROLE authenticated;
DO $denied_super_admin$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_school_class_catalog(current_setting('qa.b.school_a')::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'RPC local non limite au school_admin.';END IF;
END;$denied_super_admin$;
RESET ROLE;

-- Une affiliation revoquee doit supprimer IMMEDIATEMENT la lecture et les
-- droits RPC. Ces changements sont annulés à la fin de cette transaction.
UPDATE public.schoolnet_school_memberships
SET status='revoked', revoked_at=now()
WHERE school_id=current_setting('qa.b.school_a')::uuid
  AND user_id=current_setting('qa.b.local')::uuid;

DO $change_actor$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.b.local'),true);
END;$change_actor$;
SET LOCAL ROLE authenticated;
DO $check_revoked$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_school_class_catalog(current_setting('qa.b.school_a')::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked OR EXISTS(
   SELECT 1 FROM public.classes
   WHERE id=current_setting('qa.b.new_class_id')::uuid
 ) THEN
   RAISE EXCEPTION 'Affiliation revoquee conserve les droits de lecture.';
 END IF;
END;$check_revoked$;
RESET ROLE;

UPDATE public.schoolnet_school_memberships
SET status='active', revoked_at=NULL
WHERE school_id=current_setting('qa.b.school_a')::uuid
  AND user_id=current_setting('qa.b.local')::uuid;

-- Une ecole suspendue doit refuser son catalogue ET l'insertion.
UPDATE public.schoolnet_schools SET status='suspended'
WHERE id=current_setting('qa.b.school_a')::uuid;

SET LOCAL ROLE authenticated;
DO $check_suspended$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
   PERFORM public.schoolnet_school_class_catalog(current_setting('qa.b.school_a')::uuid);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
 END;
 IF NOT blocked OR EXISTS(
   SELECT 1 FROM public.classes
   WHERE id=current_setting('qa.b.new_class_id')::uuid
 ) THEN
   RAISE EXCEPTION 'Ecole suspendue conserve les droits de lecture.';
 END IF;
END;$check_suspended$;
RESET ROLE;

UPDATE public.schoolnet_schools SET status='active'
WHERE id=current_setting('qa.b.school_a')::uuid;

DO $final$
BEGIN
 IF (SELECT count(*) FROM public.classes)
   <> current_setting('qa.b.classes_before')::integer+1
 THEN RAISE EXCEPTION 'Modification inattendue du jeu de classes.';END IF;
END;$final$;

SELECT 'S2_B_RPC_AUTHZ_CROSS_SCHOOL_DUPLICATE_AUDIT_FIVE_ROLES_PASSED_ROLLBACK_REQUIRED' AS result;
