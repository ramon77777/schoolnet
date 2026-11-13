// SCHOOLNET 5.C-B.2: pure static SQL regression tests, no network or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/proposals/20261113_student_no_email_release_REVIEW_ONLY.sql',import.meta.url),'utf8');

test('01 - migration reste volontaire, transactionnelle et limitee',()=>{
 assert.match(sql,/NEVER AUTO DEPLOY/);
 assert.match(sql,/BEGIN;[\s\S]*COMMIT;\s*$/);
 assert.match(sql,/SET LOCAL lock_timeout = '5s'/);
 assert.match(sql,/SET LOCAL statement_timeout = '30s'/);
});
test('02 - aucun ecrasement de comptes, classes ou inscriptions existantes',()=>{
 assert.doesNotMatch(sql,/\b(?:TRUNCATE|DROP TABLE|DELETE FROM|INSERT INTO|UPDATE)\s+(?:auth\.users|public\.parent_links|public\.student_enrollments)\b/i);
});
test('03 - permissions de mutation des profils retirees aux navigateurs',()=>{
 assert.match(sql,/REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON TABLE public\.profiles FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/GRANT UPDATE \(full_name, phone, avatar_url\) ON TABLE public\.profiles TO authenticated/);
});
test('04 - verification SQL refuse role et child_ids aux roles anon et authenticated',()=>{
 for (const role of ['anon','authenticated']) for (const col of ['role','child_ids']) {
  assert.ok(sql.includes("has_column_privilege('"+role+"','public.profiles','"+col+"','UPDATE')"));
 }
});
test('05 - nom, telephone et avatar autorises en auto-edition',()=>{
 for (const col of ['full_name','phone','avatar_url']) {
  assert.ok(sql.includes("NOT has_column_privilege('authenticated','public.profiles','"+col+"','UPDATE')"));
 }
});
test('06 - registre prive et donnees Auth non-confondus',()=>{
 assert.match(sql,/request_id UUID PRIMARY KEY REFERENCES public\.public_enrollment_requests\(id\)/);
 assert.match(sql,/student_auth_user_id UUID UNIQUE REFERENCES auth\.users\(id\)/);
 assert.match(sql,/student_code_hmac TEXT UNIQUE/);
 assert.match(sql,/schoolnet_student_no_email_requests FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE ON public\.schoolnet_student_no_email_requests TO service_role/);
});
test('07 - code remis et activation soumis aux preuves',()=>{
 assert.match(sql,/status NOT IN \('sent_declared','enabled'\) OR sent_at IS NOT NULL/);
 assert.match(sql,/status <> 'enabled' OR activated_at IS NOT NULL/);
 assert.match(sql,/OLD\.status='requires_review'/);
});
test('08 - finalisation protege demande, parent, enfant et activation',()=>{
 assert.match(sql,/schoolnet_student_no_email_resolution_guard/);
 assert.match(sql,/i\.request_id=NEW\.request_id OR i\.student_auth_user_id=NEW\.student_id/);
 assert.match(sql,/i\.parent_id IS DISTINCT FROM NEW\.parent_id/);
 assert.match(sql,/i\.status<>'enabled' OR i\.activated_at IS NULL/);
});
test('09 - mise a jour directe des parent_links protege aussi',()=>{
 assert.match(sql,/CREATE FUNCTION schoolnet_student_private\.guard_no_email_parent_links/);
 assert.match(sql,/BEFORE INSERT OR UPDATE ON public\.parent_links/);
});
test('10 - nouvelle entree child_ids bloquee avant activation',()=>{
 assert.match(sql,/CREATE FUNCTION schoolnet_student_private\.guard_no_email_child_ids/);
 assert.match(sql,/BEFORE UPDATE OF child_ids ON public\.profiles/);
 assert.match(sql,/ANY\(COALESCE\(OLD\.child_ids, ARRAY\[\]::uuid\[\]\)\)/);
});
test('11 - RPC login protege, compteurs atomiques et RLS',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.schoolnet_no_email_login_gate/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_no_email_login_gate\(TEXT,TEXT,TEXT,TEXT\) TO service_role/);
 assert.match(sql,/ON CONFLICT\(scope,subject_digest,window_started_at\)/);
 assert.match(sql,/login_attempt_windows FORCE ROW LEVEL SECURITY/);
});
test('12 - un apprenant ne peut interroger que le statut de sa session Auth',()=>{
 assert.match(sql,/CREATE FUNCTION public\.schoolnet_no_email_my_session_enabled\(\)/);
 assert.match(sql,/i\.student_auth_user_id=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.schoolnet_no_email_my_session_enabled\(\) TO authenticated/);
});
