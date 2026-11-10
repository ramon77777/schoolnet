-- SCHOOLNET 2.0 — PROPOSITION, NE PAS APPLIQUER SANS VALIDATION SPECIFIQUE.
-- Phase 1 : interdire au role scolaire local (school_admin) la lecture des
-- donnees historiques communes non attribuees explicitement a une ecole.
-- Ne modifie ni schema, ni inscription, ni utilisateur, ni stockage.
-- Les 4 roles historiques conservent les droits de lecture existants.
-- A deployer seulement apres recette SQL rollback et validation explicite.

DO $schoolnet_read_fence$
DECLARE
  v_policy record;
  v_total integer;
  v_original_true integer;
  v_role_guard text :=
    'COALESCE((SELECT public.get_my_role())::text <> ''school_admin'', false)';
BEGIN
  IF to_regclass('public.schoolnet_schools') IS NULL
     OR to_regprocedure('public.get_my_role()') IS NULL
     OR NOT pg_catalog.has_function_privilege(
       'authenticated','public.get_my_role()','EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'Prerequis SCHOOLNET manquants. Ne pas appliquer.';
  END IF;

  SELECT COUNT(*),
    COUNT(*) FILTER (WHERE qual='true')
  INTO v_total,v_original_true
  FROM pg_policies
  WHERE schemaname='public'
    AND (tablename,policyname) IN (
      ('classes','classes_select_authenticated'),
      ('classes','classes_select_teacher_classes_for_owned_assessments'),
      ('school_years','school_years_select_authenticated'),
      ('grading_periods','grading_periods_read_authenticated'),
      ('rooms','rooms_select_authenticated'),
      ('class_subject_settings','class_subject_settings_read_authenticated'),
      ('course_subjects','course_subjects_read_authenticated'),
      ('assessment_average_settings','assessment_average_settings_read_authenticated')
    )
    AND cmd='SELECT'
    AND array_to_string(roles,',')='authenticated';

  IF v_total <> 8 OR v_original_true <> 7
  THEN
    RAISE EXCEPTION 'Politiques RLS modifiees depuis audit : % / % ; reexamen requis.',
      v_total,v_original_true;
  END IF;

  FOR v_policy IN
    SELECT p.tablename,p.policyname,p.qual
    FROM pg_policies p
    JOIN pg_catalog.pg_class c
      ON c.oid=pg_catalog.format('%I.%I','public',p.tablename)::pg_catalog.regclass
    WHERE p.schemaname='public'
      AND (p.tablename,p.policyname) IN (
        ('classes','classes_select_authenticated'),
        ('classes','classes_select_teacher_classes_for_owned_assessments'),
        ('school_years','school_years_select_authenticated'),
        ('grading_periods','grading_periods_read_authenticated'),
        ('rooms','rooms_select_authenticated'),
        ('class_subject_settings','class_subject_settings_read_authenticated'),
        ('course_subjects','course_subjects_read_authenticated'),
        ('assessment_average_settings','assessment_average_settings_read_authenticated')
      )
      AND c.relrowsecurity
    ORDER BY p.tablename,p.policyname
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER POLICY %I ON public.%I USING ((%s) AND (%s))',
      v_policy.policyname,v_policy.tablename,v_role_guard,v_policy.qual
    );
  END LOOP;

  IF (
    SELECT COUNT(*) FROM pg_policies
    WHERE schemaname='public'
      AND (tablename,policyname) IN (
        ('classes','classes_select_authenticated'),
        ('classes','classes_select_teacher_classes_for_owned_assessments'),
        ('school_years','school_years_select_authenticated'),
        ('grading_periods','grading_periods_read_authenticated'),
        ('rooms','rooms_select_authenticated'),
        ('class_subject_settings','class_subject_settings_read_authenticated'),
        ('course_subjects','course_subjects_read_authenticated'),
        ('assessment_average_settings','assessment_average_settings_read_authenticated')
      )
      AND qual LIKE '%school_admin%'
  ) <> 8
  THEN
    RAISE EXCEPTION 'Verification du filtre local school_admin incomplete.';
  END IF;
END;
$schoolnet_read_fence$;

-- Cette etape isole le school_admin des donnees LEGACY.
-- Elle ne cree PAS de classes d'ecole et ne resout PAS les acces d'autres
-- utilisateurs aux donnees des futures ecoles.
-- Lors de l'ouverture des modules : creer un rattachement d'etablissement
-- explicite et reecrire les policies RLS de l'ensemble de la chaine
-- classes -> cours -> inscriptions -> presences -> notes -> bulletins,
-- ainsi que les policies de STORAGE.
