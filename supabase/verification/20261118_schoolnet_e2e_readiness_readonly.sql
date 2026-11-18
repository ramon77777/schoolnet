-- SCHOOLNET | Recette E2E S2-B -> S3-C | PREPARATION EN LECTURE SEULE
-- 18 novembre 2026. Aucun DDL, DML, creation de compte ni RPC de mutation.
-- Requete SELECT exclusivement ; agregats anonymes, aucun ID, email ou secret.
-- A executer uniquement pour un ETAT DES LIEUX, pas pour une recette ecriture.
-- Si les comptes ou le calendrier changent, valider a nouveau avant recette.
SELECT
  (SELECT count(*) FROM public.schoolnet_schools WHERE status='active') AS schools_active,
  (SELECT count(DISTINCT school_id) FROM public.schoolnet_school_memberships
    WHERE member_role='school_admin' AND status='active') AS schools_with_active_admin,
  (SELECT count(*) FROM public.schoolnet_school_memberships
    WHERE member_role='school_admin' AND status='active') AS school_admin_memberships,
  (SELECT count(*) FROM public.classes WHERE learning_context='school') AS official_classes,
  (SELECT count(*) FROM public.schoolnet_school_memberships
    WHERE member_role='student' AND status='active') AS school_student_memberships,
  (SELECT count(*) FROM public.schoolnet_school_memberships
    WHERE member_role='teacher' AND status='active') AS school_teacher_memberships,
  (SELECT count(*) FROM public.schoolnet_school_student_class_assignments) AS official_student_assignments,
  (SELECT count(*) FROM public.schoolnet_school_teacher_subject_assignments) AS official_teacher_assignments,
  (SELECT count(*) FROM public.schoolnet_school_assignment_events) AS assignment_events,
  (SELECT count(*) FROM public.academic_subjects WHERE is_active) AS active_subjects,
  (SELECT count(*) FROM public.levels) AS levels,
  (SELECT count(*) FROM public.school_years) AS school_years,
  (SELECT count(*) FROM public.school_years WHERE is_current) AS years_marked_current,
  (SELECT string_agg(name,', ' ORDER BY starts_on) FROM public.school_years
    WHERE is_current) AS school_year_marked_current,
  (SELECT count(*) FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE p.role::text='student'
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND NOT COALESCE(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<now())
      AND NOT EXISTS (
        SELECT 1 FROM public.schoolnet_student_no_email_requests r
        WHERE r.student_auth_user_id=p.id
      )) AS eligible_student_email_accounts,
  (SELECT count(*) FROM public.profiles p JOIN auth.users u ON u.id=p.id
    WHERE p.role::text='teacher'
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL AND NOT COALESCE(u.is_anonymous,false)
      AND (u.banned_until IS NULL OR u.banned_until<now())) AS eligible_teacher_email_accounts,
  (SELECT count(*) FROM public.schoolnet_student_no_email_requests) AS no_email_flow_requests,
  (SELECT count(*) FROM public.classes WHERE learning_context='legacy_unclassified') AS legacy_classes,
  (SELECT count(*) FROM public.class_students) AS legacy_class_students,
  (SELECT count(*) FROM public.class_teachers) AS legacy_class_teachers,
  (SELECT count(*) FROM public.student_enrollments) AS legacy_student_enrollments,
  (SELECT count(*) FROM public.schoolnet_school_audit) AS school_audit_rows,
  (SELECT count(*) FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261117150838','20261117155641','20261117162853','20261118083254')
  ) AS installed_flow_migrations,
  to_regprocedure('public.schoolnet_school_class_catalog(uuid)') IS NOT NULL AS class_catalog_rpc_installed,
  to_regprocedure('public.schoolnet_school_create_class(uuid,bigint,uuid,text)') IS NOT NULL AS class_create_rpc_installed,
  to_regprocedure('public.schoolnet_school_teacher_roster(uuid)') IS NOT NULL AS teacher_roster_rpc_installed,
  to_regprocedure('public.schoolnet_school_student_roster(uuid)') IS NOT NULL AS student_roster_rpc_installed,
  to_regprocedure('public.schoolnet_school_assignment_catalog(uuid)') IS NOT NULL AS assignment_catalog_rpc_installed,
  (SELECT count(*) FROM pg_class
    WHERE oid IN (
      'public.schoolnet_school_student_class_assignments'::regclass,
      'public.schoolnet_school_teacher_subject_assignments'::regclass,
      'public.schoolnet_school_assignment_events'::regclass
    ) AND relrowsecurity
  ) AS protected_s3c_tables,
  has_function_privilege('anon',
    'public.schoolnet_school_assignment_catalog(uuid)','EXECUTE') AS anon_assignment_rpc_execute,
  has_table_privilege('authenticated',
    'public.schoolnet_school_student_class_assignments','INSERT') AS client_can_insert_student_assignment,
  has_table_privilege('authenticated',
    'public.schoolnet_school_teacher_subject_assignments','INSERT') AS client_can_insert_teacher_assignment,
  has_table_privilege('authenticated',
    'public.schoolnet_school_assignment_events','INSERT') AS client_can_insert_assignment_events;
