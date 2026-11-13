-- SCHOOLNET / 5.C-B.2 / 2.C / Lecture seule.
-- CIBLE : sandbox onqlsvphmrqhelislpry, jamais production.
-- Les requetes suivantes ne contiennent ni secret, ni modification.

SELECT
  (SELECT count(*) FROM auth.users) AS auth_users,
  (SELECT count(*) FROM auth.users
    WHERE raw_app_meta_data->>'schoolnet_sandbox_student_b2b' = 'true') AS b2b_accounts,
  (SELECT count(*) FROM schoolnet_student_private.identities) AS student_identity_rows,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid='schoolnet_student_private.identities'::regclass) AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class
    WHERE oid='schoolnet_student_private.identities'::regclass) AS force_rls,
  has_schema_privilege('anon','schoolnet_student_private','USAGE') AS anon_schema_usage,
  has_schema_privilege('authenticated','schoolnet_student_private','USAGE') AS authenticated_schema_usage,
  has_schema_privilege('service_role','schoolnet_student_private','USAGE') AS service_schema_usage,
  has_table_privilege('anon','schoolnet_student_private.identities','SELECT') AS anon_can_select,
  has_table_privilege('authenticated','schoolnet_student_private.identities','SELECT') AS authenticated_can_select,
  has_table_privilege('service_role','schoolnet_student_private.identities','SELECT') AS service_can_select,
  has_table_privilege('service_role','schoolnet_student_private.identities','INSERT') AS service_can_insert,
  has_table_privilege('service_role','schoolnet_student_private.identities','UPDATE') AS service_can_update,
  has_table_privilege('service_role','schoolnet_student_private.identities','DELETE') AS service_can_delete,
  (SELECT count(*) FROM pg_policies WHERE schemaname='schoolnet_student_private') AS policy_count;
