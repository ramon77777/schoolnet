-- SCHOOLNET V2 / S4-A - PROPOSITION SQL, NON INSTALLEE EN PRODUCTION
-- Nouveau RPC de synthese anonymisee pour le tableau de bord local.
-- S3-C conserve son catalogue detaille et ses fonctions inchanges.
-- Installation future uniquement apres GO explicite et recette de migrations.
-- Le seul appel autorise pour le navigateur est la facade SECURITY INVOKER
-- public.schoolnet_school_pedagogy_overview(p_school_id).
-- Aucune identite/UUID d'eleve ou d'enseignant, aucun evenement d'audit,
-- aucun nom de personne n'est retourne a l'appelant.

DO $preflight_s4a$
BEGIN
  IF to_regprocedure('schoolnet_private.assert_s3c_access(uuid,boolean)') IS NULL
     OR to_regclass('public.schoolnet_school_student_class_assignments') IS NULL
     OR to_regclass('public.schoolnet_school_teacher_subject_assignments') IS NULL
     OR to_regprocedure('public.schoolnet_school_pedagogy_overview(uuid)') IS NOT NULL
     OR to_regprocedure('schoolnet_private.local_school_pedagogy_overview(uuid)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'S4-A : preconditions de securite absentes ou RPC deja installee.';
  END IF;
END;
$preflight_s4a$;

CREATE FUNCTION schoolnet_private.local_school_pedagogy_overview(p_school_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $summary_s4a$
DECLARE v_payload jsonb;
BEGIN
  -- Le garde-fou S3-C verifie authentification, role school_admin,
  -- ecole ACTIVE et appartenance locale ACTIVE sur chaque appel.
  PERFORM schoolnet_private.assert_s3c_access(p_school_id, false);

  WITH official_classes AS MATERIALIZED (
    SELECT c.id, c.name, c.school_year_id, c.school_year,
           l.name AS level_name
    FROM public.classes c
    JOIN public.levels l ON l.id=c.level_id
    WHERE c.school_id=p_school_id AND c.learning_context='school'
  ),
  -- Seules les affectations S3-C effectives et de la bonne annee sont retenues.
  effective_students AS MATERIALIZED (
    SELECT DISTINCT a.class_id, a.student_id
    FROM public.schoolnet_school_student_class_assignments a
    JOIN official_classes c ON c.id=a.class_id AND c.school_year_id=a.school_year_id
    JOIN public.schoolnet_school_memberships m
      ON m.school_id=a.school_id AND m.user_id=a.student_id
      AND m.member_role='student' AND m.status='active'
    WHERE a.school_id=p_school_id AND a.status='active'
  ),
  effective_teachers AS MATERIALIZED (
    SELECT DISTINCT a.class_id, a.teacher_id, a.subject_id, s.name AS subject_name
    FROM public.schoolnet_school_teacher_subject_assignments a
    JOIN official_classes c ON c.id=a.class_id AND c.school_year_id=a.school_year_id
    JOIN public.schoolnet_school_memberships m
      ON m.school_id=a.school_id AND m.user_id=a.teacher_id
      AND m.member_role='teacher' AND m.status='active'
    JOIN public.academic_subjects s ON s.id=a.subject_id AND s.is_active=true
    WHERE a.school_id=p_school_id AND a.status='active'
  ),
  class_summary AS (
    SELECT c.id,c.name,c.school_year,c.level_name,
      (SELECT count(*) FROM effective_students x WHERE x.class_id=c.id) AS students_assigned,
      (SELECT count(DISTINCT x.teacher_id) FROM effective_teachers x
        WHERE x.class_id=c.id) AS teachers_assigned,
      COALESCE((
        SELECT jsonb_agg(subject_name ORDER BY subject_name)
        FROM (
          SELECT DISTINCT subject_id, subject_name
          FROM effective_teachers x WHERE x.class_id=c.id
        ) names
      ),'[]'::jsonb) AS subjects
    FROM official_classes c
  )
  SELECT jsonb_build_object(
    'schoolId', p_school_id,
    'classCount', (SELECT count(*) FROM official_classes),
    'affiliatedStudentCount', (
      SELECT count(DISTINCT m.user_id)
      FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text='student'
      WHERE m.school_id=p_school_id AND m.member_role='student' AND m.status='active'
    ),
    'affiliatedTeacherCount', (
      SELECT count(DISTINCT m.user_id)
      FROM public.schoolnet_school_memberships m
      JOIN public.profiles p ON p.id=m.user_id AND p.role::text='teacher'
      WHERE m.school_id=p_school_id AND m.member_role='teacher' AND m.status='active'
    ),
    'assignedStudentCount', (SELECT count(DISTINCT student_id) FROM effective_students),
    'assignedTeacherCount', (SELECT count(DISTINCT teacher_id) FROM effective_teachers),
    'teachingAssignmentCount', (SELECT count(*) FROM effective_teachers),
    'classes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'schoolYear', c.school_year,
        'levelName', c.level_name,
        'studentsAssigned', c.students_assigned,
        'teachersAssigned', c.teachers_assigned,
        'subjects', c.subjects
      ) ORDER BY c.school_year DESC,c.name,c.id)
      FROM class_summary c
    ),'[]'::jsonb)
  ) INTO v_payload;

  RETURN v_payload;
END;
$summary_s4a$;

-- Facade appelable depuis PostgREST sans elevation automatique.
CREATE FUNCTION public.schoolnet_school_pedagogy_overview(p_school_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $public_s4a$
  SELECT schoolnet_private.local_school_pedagogy_overview(p_school_id);
$public_s4a$;

-- Privilèges explicites : anon et PUBLIC restent exclus, aucune table exposee.
REVOKE ALL ON FUNCTION schoolnet_private.local_school_pedagogy_overview(uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.schoolnet_school_pedagogy_overview(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION schoolnet_private.local_school_pedagogy_overview(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.schoolnet_school_pedagogy_overview(uuid)
  TO authenticated;

DO $verify_s4a$
BEGIN
  IF has_function_privilege('anon','public.schoolnet_school_pedagogy_overview(uuid)','EXECUTE')
     OR has_function_privilege('anon','schoolnet_private.local_school_pedagogy_overview(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.schoolnet_school_pedagogy_overview(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','schoolnet_private.local_school_pedagogy_overview(uuid)','EXECUTE')
     OR (SELECT prosecdef FROM pg_proc
         WHERE oid='public.schoolnet_school_pedagogy_overview(uuid)'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc
         WHERE oid='schoolnet_private.local_school_pedagogy_overview(uuid)'::regprocedure)
  THEN RAISE EXCEPTION 'S4-A : droits ou definer incoherents.'; END IF;
END;
$verify_s4a$;
