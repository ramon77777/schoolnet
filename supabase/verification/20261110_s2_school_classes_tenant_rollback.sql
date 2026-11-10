-- SCHOOLNET 2.0 | Lot S2-A : recette d'isolation des classes
-- Aucun changement permanent: executer apres le fichier de proposition
-- dans UNE transaction : BEGIN; <proposition>; <ce fichier>; ROLLBACK.
-- Les classes creees ici sont de simples fixtures SQL dans la transaction.

DO $setup$
DECLARE
 v_local uuid;
 v_admin uuid;
 v_teacher uuid;
 v_student uuid;
 v_parent uuid;
 v_school_a uuid;
 v_school_b uuid;
 v_class uuid;
 v_baseline integer;
BEGIN
 SELECT m.user_id,m.school_id INTO v_local,v_school_a
 FROM public.schoolnet_school_memberships m
 JOIN public.schoolnet_schools s ON s.id=m.school_id
 WHERE m.status='active' AND m.member_role='school_admin' AND s.status='active'
 LIMIT 1;

 SELECT id INTO v_admin FROM public.profiles WHERE role='admin' LIMIT 1;
 SELECT id INTO v_teacher FROM public.profiles WHERE role='teacher' LIMIT 1;
 SELECT id INTO v_student FROM public.profiles WHERE role='student' LIMIT 1;
 SELECT id INTO v_parent FROM public.profiles WHERE role='parent' LIMIT 1;
 SELECT id INTO v_school_b FROM public.schoolnet_schools
 WHERE status='active' AND id<>v_school_a LIMIT 1;
 SELECT id INTO v_class FROM public.classes
 WHERE learning_context='legacy_unclassified' AND school_year_id IS NOT NULL
 ORDER BY created_at LIMIT 1;
 SELECT count(*) INTO v_baseline FROM public.classes;

 IF v_local IS NULL OR v_admin IS NULL OR v_teacher IS NULL
    OR v_student IS NULL OR v_parent IS NULL
    OR v_school_a IS NULL OR v_school_b IS NULL OR v_class IS NULL
    OR v_baseline < 1
 THEN
   RAISE EXCEPTION 'Fixtures QA insuffisantes : aucun test lance.';
 END IF;

 PERFORM set_config('qa.s2.local',v_local::text,true);
 PERFORM set_config('qa.s2.admin',v_admin::text,true);
 PERFORM set_config('qa.s2.teacher',v_teacher::text,true);
 PERFORM set_config('qa.s2.student',v_student::text,true);
 PERFORM set_config('qa.s2.parent',v_parent::text,true);
 PERFORM set_config('qa.s2.school_a',v_school_a::text,true);
 PERFORM set_config('qa.s2.school_b',v_school_b::text,true);
 PERFORM set_config('qa.s2.legacy_id',v_class::text,true);
 PERFORM set_config('qa.s2.legacy_count',v_baseline::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
END;
$setup$;

-- Super Admin : creer deux classes OFFICIELLES ayant la meme denomination
-- et annee que la classe historique. Toutes seront annulees.
SET LOCAL ROLE authenticated;
DO $create$
DECLARE
 v_a uuid;
 v_b uuid;
 v_duplicate_blocked boolean:=false;
 v_legacy_duplicate_blocked boolean:=false;
 v_invalid_context_blocked boolean:=false;
BEGIN
 INSERT INTO public.classes
   (level_id,name,school_year,school_year_id,school_id,learning_context)
 SELECT level_id,name,school_year,school_year_id,
   current_setting('qa.s2.school_a')::uuid,'school'
 FROM public.classes WHERE id=current_setting('qa.s2.legacy_id')::uuid
 RETURNING id INTO v_a;

 INSERT INTO public.classes
   (level_id,name,school_year,school_year_id,school_id,learning_context)
 SELECT level_id,name,school_year,school_year_id,
   current_setting('qa.s2.school_b')::uuid,'school'
 FROM public.classes WHERE id=current_setting('qa.s2.legacy_id')::uuid
 RETURNING id INTO v_b;

 IF v_a IS NULL OR v_b IS NULL OR v_a=v_b THEN
   RAISE EXCEPTION 'Creation de deux classes par ecole impossible.';
 END IF;
 PERFORM set_config('qa.s2.class_a',v_a::text,true);
 PERFORM set_config('qa.s2.class_b',v_b::text,true);

 BEGIN
   INSERT INTO public.classes
     (level_id,name,school_year,school_year_id,school_id,learning_context)
   SELECT level_id,name,school_year,school_year_id,
     current_setting('qa.s2.school_a')::uuid,'school'
   FROM public.classes WHERE id=current_setting('qa.s2.legacy_id')::uuid;
 EXCEPTION WHEN unique_violation THEN v_duplicate_blocked:=true;
 END;

 BEGIN
   INSERT INTO public.classes
     (level_id,name,school_year,school_year_id,learning_context)
   SELECT level_id,name,school_year,school_year_id,'legacy_unclassified'
   FROM public.classes WHERE id=current_setting('qa.s2.legacy_id')::uuid;
 EXCEPTION WHEN unique_violation THEN v_legacy_duplicate_blocked:=true;
 END;

 BEGIN
   INSERT INTO public.classes
     (level_id,name,school_year,school_year_id,learning_context)
   SELECT level_id,'Classe QA Invalide',school_year,school_year_id,'school'
   FROM public.classes WHERE id=current_setting('qa.s2.legacy_id')::uuid;
 EXCEPTION WHEN check_violation THEN v_invalid_context_blocked:=true;
 END;

 IF NOT v_duplicate_blocked OR NOT v_legacy_duplicate_blocked
    OR NOT v_invalid_context_blocked
    OR (SELECT count(*) FROM public.classes WHERE learning_context='school')<>2
    OR (SELECT count(*) FROM public.classes
        WHERE learning_context='legacy_unclassified')
         <> current_setting('qa.s2.legacy_count')::integer
 THEN
   RAISE EXCEPTION 'Unicite ou coherence contextuelle incorrecte: % % %',
     v_duplicate_blocked,v_legacy_duplicate_blocked,v_invalid_context_blocked;
 END IF;
END;
$create$;
RESET ROLE;

-- School A : uniquement sa classe, aucune classe legacy et aucune classe B.
DO $as_local$
BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.s2.local'),true);
END;
$as_local$;
SET LOCAL ROLE authenticated;
DO $check_local$
DECLARE v_updated integer; v_deleted integer; v_insert_denied boolean:=false;
BEGIN
 IF public.get_my_role()::text<>'school_admin'
    OR (SELECT count(*) FROM public.classes)<>1
    OR NOT EXISTS(
       SELECT 1 FROM public.classes
       WHERE id=current_setting('qa.s2.class_a')::uuid
          AND learning_context='school'
          AND school_id=current_setting('qa.s2.school_a')::uuid
    )
    OR EXISTS(
       SELECT 1 FROM public.classes
       WHERE id=current_setting('qa.s2.class_b')::uuid
    )
    OR EXISTS(
       SELECT 1 FROM public.classes
       WHERE id=current_setting('qa.s2.legacy_id')::uuid
    )
 THEN RAISE EXCEPTION 'Un administrateur local voit une classe non autorisee.'; END IF;

 UPDATE public.classes SET name='Tentative de modification'
 WHERE id=current_setting('qa.s2.class_a')::uuid;
 GET DIAGNOSTICS v_updated = ROW_COUNT;

 DELETE FROM public.classes
 WHERE id=current_setting('qa.s2.class_a')::uuid;
 GET DIAGNOSTICS v_deleted = ROW_COUNT;

 BEGIN
   INSERT INTO public.classes
    (level_id,name,school_year,school_year_id,school_id,learning_context)
   SELECT level_id,'Classe QA Forcee',school_year,school_year_id,
     current_setting('qa.s2.school_a')::uuid,'school'
   FROM public.classes WHERE id=current_setting('qa.s2.class_a')::uuid;
 EXCEPTION WHEN insufficient_privilege THEN v_insert_denied:=true;
 END;

 IF v_updated<>0 OR v_deleted<>0 OR NOT v_insert_denied
 THEN RAISE EXCEPTION 'Ecriture directe autorisee par erreur: % % %',
   v_updated,v_deleted,v_insert_denied;END IF;
END;
$check_local$;
RESET ROLE;

-- Les quatre roles historiques gardent leurs classes legacy ;
-- ils ne voient PAS les classes OFFICIELLES nouvellement creees.
DO $as_teacher$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.s2.teacher'),true);
END;$as_teacher$;
SET LOCAL ROLE authenticated;
DO $check_teacher$
BEGIN
 IF (SELECT count(*) FROM public.classes)<>current_setting('qa.s2.legacy_count')::int
 OR EXISTS(SELECT 1 FROM public.classes WHERE learning_context='school')
 THEN RAISE EXCEPTION 'Fuite classes ecoles vers enseignant';END IF;
END;$check_teacher$;
RESET ROLE;

DO $as_student$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.s2.student'),true);
END;$as_student$;
SET LOCAL ROLE authenticated;
DO $check_student$
BEGIN
 IF (SELECT count(*) FROM public.classes)<>current_setting('qa.s2.legacy_count')::int
 OR EXISTS(SELECT 1 FROM public.classes WHERE learning_context='school')
 THEN RAISE EXCEPTION 'Fuite classes ecoles vers apprenant';END IF;
END;$check_student$;
RESET ROLE;

DO $as_parent$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.s2.parent'),true);
END;$as_parent$;
SET LOCAL ROLE authenticated;
DO $check_parent$
BEGIN
 IF (SELECT count(*) FROM public.classes)<>current_setting('qa.s2.legacy_count')::int
 OR EXISTS(SELECT 1 FROM public.classes WHERE learning_context='school')
 THEN RAISE EXCEPTION 'Fuite classes ecoles vers parent';END IF;
END;$check_parent$;
RESET ROLE;

DO $as_admin$ BEGIN
 PERFORM set_config('request.jwt.claim.sub',current_setting('qa.s2.admin'),true);
END;$as_admin$;
SET LOCAL ROLE authenticated;
DO $check_admin$
BEGIN
 IF (SELECT count(*) FROM public.classes)<>current_setting('qa.s2.legacy_count')::int+2
 OR (SELECT count(*) FROM public.classes WHERE learning_context='school')<>2
 THEN RAISE EXCEPTION 'Super Administrateur ne voit plus toutes les classes';END IF;
END;$check_admin$;
RESET ROLE;

SELECT 'S2_A_RLS_AND_CLASS_UNIQUENESS_FIVE_ROLES_PASSED_ROLLBACK_REQUIRED' AS result;
