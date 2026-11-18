import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/proposals/20261116_schoolnet_no_email_auto_family_link_REVIEW_ONLY.sql',import.meta.url),'utf8');
test('01 - autolink is only on Auth activation status transition',()=>{
 assert.match(sql,/AFTER UPDATE OF status/);
 assert.match(sql,/NEW\.status='enabled'/);
 assert.match(sql,/OLD\.status IS DISTINCT FROM 'sent_declared'/);
});
test('02 - transaction and private function',()=>{
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
 assert.match(sql,/schoolnet_student_private\.link_verified_no_email_family_after_activation/);
 assert.match(sql,/SECURITY DEFINER\s+SET search_path TO 'pg_catalog'/);
});
test('03 - no direct execute grant for clients',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated/);
 assert.doesNotMatch(sql,/GRANT EXECUTE TO (?:anon|authenticated)/);
});
test('04 - parent identity must match activated invitation and Auth marker',()=>{
 assert.match(sql,/f\.status='activated'/);
 assert.match(sql,/f\.user_id=NEW\.parent_id/);
 assert.match(sql,/f\.expected_role='parent'/);
 assert.match(sql,/parent_auth\.raw_app_meta_data->>'schoolnet_family_invitation'='true'/);
 assert.match(sql,/r\.guardian_email IS NOT NULL/);
});
test('05 - student identity Auth must be unique and server-confirmed',()=>{
 assert.match(sql,/student_auth\.raw_app_meta_data->>'schoolnet_no_email_student'='true'/);
 assert.match(sql,/student_auth\.raw_app_meta_data->>'schoolnet_no_email_request_id'[\s\S]*?=NEW\.request_id::text/);
 assert.match(sql,/student_auth\.email=NEW\.technical_email/);
 assert.match(sql,/student_auth\.email_confirmed_at IS NOT NULL/);
});
test('06 - rejects other parent link and other parent child_ids',()=>{
 assert.match(sql,/SCHOOLNET_AUTOLINK_FAMILY_CONFLICT/);
 assert.match(sql,/l\.parent_id<>NEW\.parent_id/);
 assert.match(sql,/p\.id<>NEW\.parent_id/);
});
test('07 - single atomic idempotent link and child_ids append',()=>{
 assert.match(sql,/INSERT INTO public\.parent_links\(parent_id,student_id,relation_type\)/);
 assert.match(sql,/ON CONFLICT\(parent_id,student_id\) DO NOTHING/);
 assert.match(sql,/UPDATE public\.profiles p\s+SET child_ids=pg_catalog\.array_append/);
 assert.match(sql,/SCHOOLNET_AUTOLINK_INCOMPLETE/);
});
test('08 - does not tie link to school enrollment or rewrite existing families',()=>{
 assert.doesNotMatch(sql,/INSERT INTO public\.student_enrollments/i);
 assert.doesNotMatch(sql,/DELETE FROM public\.parent_links/i);
 assert.doesNotMatch(sql,/UPDATE public\.auth\.users/i);
});
