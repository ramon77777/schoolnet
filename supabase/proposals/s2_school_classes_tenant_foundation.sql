-- SCHOOLNET 2.0 | Lot S2-A - PROPOSITION NON APPLIQUEE
-- Ancrage multi-ecoles des classes officielles et conservation du legacy.
-- Test uniquement : BEGIN; <ce fichier>; <assertions SQL>; ROLLBACK;
-- ATTENTION : ne pas appliquer en production sans recette et accord explicite.
--
-- Perimetre : colonnes de contexte des classes, cle d'ecole, deux index
-- uniques historiques adaptes et un index unique par ecole, policies SELECT.
-- Aucun droit INSERT/UPDATE/DELETE pour school_admin dans cette phase A.
-- Les rattachements enseignants/eleves/cours sont interdits tant que les
-- autres tables n'ont pas des policies tenant-scoped adaptees.

DO $preflight$
DECLARE
 v_class_policy text;
 v_teacher_policy text;
BEGIN
 IF to_regclass('public.classes') IS NULL
    OR to_regclass('public.schoolnet_schools') IS NULL
    OR to_regprocedure('schoolnet_private.is_school_admin_for(uuid)') IS NULL
    OR EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='classes'
        AND column_name IN ('school_id','learning_context')
    )
    OR NOT EXISTS(
      SELECT 1 FROM pg_constraint
      WHERE conrelid='public.classes'::regclass
        AND conname='classes_unique_per_year' AND contype='u'
    )
    OR to_regclass('public.idx_classes_unique_name_school_year_id') IS NULL
    OR to_regclass('public.classes_school_unique_name_year_idx') IS NOT NULL
 THEN
   RAISE EXCEPTION 'Preconditions S2-A invalides : verifier le schema existant.';
 END IF;

 SELECT qual INTO v_class_policy
 FROM pg_policies WHERE schemaname='public' AND tablename='classes'
   AND policyname='classes_select_authenticated' AND cmd='SELECT';
 SELECT qual INTO v_teacher_policy
 FROM pg_policies WHERE schemaname='public' AND tablename='classes'
   AND policyname='classes_select_teacher_classes_for_owned_assessments'
   AND cmd='SELECT';

 IF v_class_policy IS NULL
    OR v_teacher_policy IS NULL
    OR position('school_admin' in v_class_policy)=0
    OR position('school_admin' in v_teacher_policy)=0
    OR (
      SELECT COUNT(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='classes'
    ) <> 3
 THEN
    RAISE EXCEPTION 'Les policies de lecture des classes ont change depuis l audit.';
 END IF;
END;
$preflight$;

ALTER TABLE public.classes
 ADD COLUMN learning_context text NOT NULL DEFAULT 'legacy_unclassified',
 ADD COLUMN school_id uuid;

ALTER TABLE public.classes
 ADD CONSTRAINT classes_school_id_fkey
 FOREIGN KEY (school_id) REFERENCES public.schoolnet_schools(id)
 ON DELETE RESTRICT;

ALTER TABLE public.classes
 ADD CONSTRAINT classes_learning_context_chk
 CHECK (
    learning_context IN ('legacy_unclassified','school','free_group')
    AND (
      (learning_context='school'
       AND school_id IS NOT NULL
       AND school_year_id IS NOT NULL)
      OR (learning_context<>'school' AND school_id IS NULL)
    )
 );

-- Les deux anciennes protections globales empechaient deux ecoles
-- de posseder "6e A" la meme annee.
-- On les remplace SANS reduire leur protection sur le legacy.
ALTER TABLE public.classes
 DROP CONSTRAINT classes_unique_per_year;

DROP INDEX public.idx_classes_unique_name_school_year_id;

CREATE UNIQUE INDEX classes_legacy_level_name_year_idx
 ON public.classes (level_id,name,school_year)
 WHERE learning_context='legacy_unclassified';

CREATE UNIQUE INDEX classes_legacy_name_year_id_idx
 ON public.classes (lower(name),school_year_id)
 WHERE learning_context='legacy_unclassified'
   AND school_year_id IS NOT NULL;

CREATE UNIQUE INDEX classes_school_unique_name_year_idx
 ON public.classes (school_id,lower(name),school_year_id)
 WHERE learning_context='school';

CREATE INDEX classes_school_filter_idx
 ON public.classes (school_id,school_year_id,level_id)
 WHERE learning_context='school';

-- Supprimer la lecture globale des NOUVELLES classes d'ecole
-- pour les enseignants/eleves/parents non encore relies
-- par les futurs modules S3-S4. Leur lecture historique reste identique.
ALTER POLICY classes_select_authenticated
 ON public.classes
 USING (
   (SELECT public.is_admin())
   OR (
     (SELECT public.get_my_role()) IN (
       'student'::public.user_role,
       'teacher'::public.user_role,
       'parent'::public.user_role
     )
     AND learning_context='legacy_unclassified'
   )
 );

-- Il existe une deuxieme policy SELECT pour les enseignants auteurs
-- d'evaluations : elle ne doit pas rouvrir les classes des autres ecoles.
DO $adjust_second_policy$
DECLARE
 v_qual text;
BEGIN
 SELECT qual INTO v_qual
 FROM pg_policies
 WHERE schemaname='public' AND tablename='classes'
   AND policyname='classes_select_teacher_classes_for_owned_assessments'
   AND cmd='SELECT';
 IF v_qual IS NULL OR position('school_admin' in v_qual)=0
 THEN
   RAISE EXCEPTION 'La policy des classes des enseignants a change.';
 END IF;
 EXECUTE pg_catalog.format(
   'ALTER POLICY classes_select_teacher_classes_for_owned_assessments ON public.classes USING ((learning_context = ''legacy_unclassified'') AND (%s))',
   v_qual
 );
END;
$adjust_second_policy$;

-- Seul un administrateur LOCAL actif voit les classes de SON ecole.
-- Ne confere PAS de droit d'insertion, modification ou suppression.
CREATE POLICY classes_select_school_admin_own_school
 ON public.classes
 FOR SELECT TO authenticated
 USING (
   learning_context='school'
   AND school_id IS NOT NULL
   AND schoolnet_private.is_school_admin_for(school_id)
 );

-- Verification des nouveaux garde-fous et des lignes historiques.
DO $verify$
BEGIN
 IF (SELECT COUNT(*) FROM public.classes
     WHERE learning_context<>'legacy_unclassified' OR school_id IS NOT NULL)<>0
    OR (SELECT COUNT(*) FROM pg_policies WHERE tablename='classes'
        AND schemaname='public')<>4
    OR to_regclass('public.classes_school_unique_name_year_idx') IS NULL
    OR to_regclass('public.classes_legacy_level_name_year_idx') IS NULL
    OR to_regclass('public.classes_legacy_name_year_id_idx') IS NULL
 THEN
   RAISE EXCEPTION 'Verification du socle classes S2-A incomplete.';
 END IF;
END;
$verify$;
