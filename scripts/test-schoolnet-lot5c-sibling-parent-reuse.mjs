import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/proposals/20261116_schoolnet_sibling_parent_reuse_SANDBOX_REVIEW_ONLY.sql',import.meta.url),'utf8');
const admin=readFileSync(new URL('../supabase/functions/schoolnet-student-no-email-admin/index.ts',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/features/enrollments/components/AdminStudentNoEmailPanel.tsx',import.meta.url),'utf8');
test('1 - schema is sandbox guarded and does not change invitations uniqueness',()=>{
 assert.match(sql,/SCHOOLNET_SIBLING_SANDBOX_ONLY_PREFLIGHT_FAILED/);
 assert.match(sql,/CREATE TABLE public\.schoolnet_sibling_parent_approvals/);
 assert.doesNotMatch(sql,/DROP INDEX|ALTER TABLE public\.schoolnet_family_invitation_records DROP/i);
});
test('2 - separate per-child approval must be admin-verified and immutable',()=>{
 assert.match(sql,/request_id uuid PRIMARY KEY/);
 assert.match(sql,/verified_by uuid NOT NULL/);
 assert.match(sql,/admin\.role::text='admin'/);
 assert.match(sql,/req\.guardian_relationship=NEW\.guardian_relationship/);
 assert.match(sql,/SCHOOLNET_SIBLING_PROOF_IMMUTABLE/);
});
test('3 - proof record may not be read or inserted by public clients',()=>{
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT SELECT,INSERT ON public\.schoolnet_sibling_parent_approvals TO service_role/);
 assert.match(sql,/REVOKE ALL ON public\.schoolnet_sibling_parent_approvals/);
});
test('4 - first child remains authorized by activated own invitation',()=>{
 assert.match(sql,/inv\.request_id=NEW\.request_id/);
 assert.match(sql,/inv\.status='activated'/);
});
test('5 - sibling needs an existing activated parent invitation and family link',()=>{
 assert.match(sql,/approval\.request_id=NEW\.request_id AND approval\.parent_id=NEW\.parent_id/);
 assert.match(sql,/old_request\.status<>'rejected'/);
 assert.match(sql,/prior_link\.parent_id=NEW\.parent_id/);
 assert.match(sql,/student_auth\.raw_app_meta_data->>'schoolnet_no_email_request_id'/);
});
test('6 - second child reuses verified Parent instead of duplicating invitation',()=>{
 assert.match(admin,/previous\.status!=='activated'/);
 assert.match(admin,/\.eq\('email',email\)\.eq\('recipient','parent'\)/);
 assert.match(admin,/\.eq\('parent_id',previous\.user_id\)/);
 assert.match(admin,/\.from\('schoolnet_sibling_parent_approvals'\)/);
 assert.doesNotMatch(admin,/\.insert\(\{.*recipient:'parent'/);
});
test('7 - second child is blocked until individual approval is recorded',()=>{
 assert.match(admin,/if\(parentReuseAvailable&&!parentReuseApproved\)/);
 assert.match(admin,/if\(action==='approve_parent_reuse'\)/);
 assert.match(admin,/verified_by:actor,guardian_relationship:request\.guardian_relationship/);
 assert.match(panel,/Approuver ce nouvel enfant pour le Parent existant/);
});
test('8 - non-production Admin UI remains read-only and approval is immutable',()=>{
 assert.match(panel,/Prévisualisation en lecture seule/);
 assert.match(sql,/SCHOOLNET_SIBLING_PROOF_IMMUTABLE/);
 assert.match(sql,/parent_links AS prior_link/);
});
