-- SCHOOLNET 5.C-B.2 / 2.D / Verifications READ ONLY
-- Sandbox: onqlsvphmrqhelislpry ; never production.

SELECT
 (SELECT count(*) FROM auth.users) AS auth_accounts,
 (SELECT count(*) FROM auth.users
    WHERE raw_app_meta_data->>'schoolnet_sandbox_student_b2b'='true') AS b2b_auth_accounts,
 (SELECT count(*) FROM schoolnet_student_private.identities) AS identity_rows,
 (SELECT count(*) FROM schoolnet_student_private.login_attempt_windows) AS rate_window_rows,
 (SELECT count(*) FROM schoolnet_student_private.login_audit_events) AS audit_rows,
 has_function_privilege(
   'anon','public.schoolnet_student_login_gate(text,text,text,text)','EXECUTE') AS anon_gate_exec,
 has_function_privilege(
   'authenticated','public.schoolnet_student_login_gate(text,text,text,text)','EXECUTE') AS auth_gate_exec,
 has_function_privilege(
   'service_role','public.schoolnet_student_login_gate(text,text,text,text)','EXECUTE') AS service_gate_exec,
 has_function_privilege(
   'anon','public.schoolnet_student_login_enabled(uuid,text,text)','EXECUTE') AS anon_status_exec,
 has_function_privilege(
   'anon','public.schoolnet_student_login_audit(text)','EXECUTE') AS anon_audit_exec,
 (SELECT count(*) FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'schoolnet_student_login_%'
     AND p.prosecdef) AS security_definer_login_rpcs;
