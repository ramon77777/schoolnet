// Static fail-closed audit of the not-yet-applied release artifacts; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=f('supabase/proposals/20261113_student_no_email_release_REVIEW_ONLY.sql');
const admin=f('supabase/functions/schoolnet-student-no-email-admin/index.ts');
const login=f('supabase/functions/schoolnet-student-login-release/index.ts');
const api=f('src/features/enrollments/lib/adminStudentNoEmailApi.ts');
test('SQL guarded, no production writes during local import',()=>{
 assert.match(sql,/NEVER AUTO DEPLOY/);
 assert.match(sql,/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON TABLE public\.profiles/);
 assert.match(sql,/has_column_privilege\('authenticated','public\.profiles','role','UPDATE'\)/);
 assert.match(sql,/has_column_privilege\('authenticated','public\.profiles','child_ids','UPDATE'\)/);
});
test('separate Auth IDs, uniqueness and private registry',()=>{
 assert.match(sql,/student_auth_user_id UUID UNIQUE REFERENCES auth\.users/);
 assert.match(sql,/student_code_hmac TEXT UNIQUE/);
 assert.match(sql,/family_phone_e164 TEXT NOT NULL/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/g);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE ON public\.schoolnet_student_no_email_requests TO service_role/);
});
test('no student/parent link until authenticated and correct child+parent',()=>{
 assert.match(sql,/require_activated_before_parent_link/);
 assert.match(sql,/student_auth_user_id IS DISTINCT FROM NEW\.student_id/);
 assert.match(sql,/parent_id IS DISTINCT FROM NEW\.parent_id/);
 assert.match(sql,/i\.status<>'enabled'/);
});
test('Admin backend checks role, parent and never sends an email',()=>{
 assert.match(admin,/actorProfile\?\.role!=='admin'/);
 assert.match(admin,/parentAuth\.data\.user\.app_metadata\?\.schoolnet_family_invitation!==true/);
 assert.match(admin,/generateLink\(/);
 assert.doesNotMatch(admin,/\bsignUp\(/);
 assert.match(admin,/SCHOOLNET_STUDENT_ACCOUNTS_ENABLED/);
 assert.match(admin,/schoolnet_student_no_email_requests/);
});
test('Login requires CAPTCHA, trusted IP, project and server secret',()=>{
 assert.match(login,/SCHOOLNET_STUDENT_TRUSTED_IP_VERIFIED/);
 assert.match(login,/SCHOOLNET_STUDENT_TURNSTILE_SECRET/);
 assert.match(login,/turnstile\/v0\/siteverify/);
 assert.match(login,/SCHOOLNET_STUDENT_LOGIN_ENABLED/);
 assert.match(login,/url!==PROD/);
 assert.match(login,/schoolnet_no_email_login_gate/);
 assert.match(login,/schoolnet_no_email_activate_after_password/);
});
test('UI never exposes service-role nor enabled production actions by default',()=>{
 assert.doesNotMatch(api,/SERVICE_ROLE_KEY|sb_secret_|service_role/);
 assert.match(api,/import\.meta\.env\.PROD/);
 assert.match(api,/VITE_SCHOOLNET_STUDENT_ACCOUNTS_ENABLED/);
 assert.match(api,/VITE_SUPABASE_URL === PROD/);
});