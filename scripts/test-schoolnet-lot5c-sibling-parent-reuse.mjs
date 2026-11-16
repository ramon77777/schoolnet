import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/proposals/20261116_schoolnet_sibling_parent_reuse_SANDBOX_REVIEW_ONLY.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../docs/sandbox/lot5c/siblings/edge/index.ts',import.meta.url),'utf8');
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
test('6 - sandbox test creates only 3 synthetic Auth users',()=>{
 assert.match(edge,/const PROJECT="https:\/\/onqlsvphmrqhelislpry\.supabase\.co"/);
 assert.match(edge,/const R1="DEM-L5C-SIB-01",R2="DEM-L5C-SIB-02"/);
 assert.match(edge,/jwtVerify\(/);
 assert.match(edge,/schoolnet_lot5c_sibling_fixture:true/);
 assert.match(edge,/if\(users\.error\|\|users\.data\?\.users\.length!==19/);
});
test('7 - test refuses sibling without admin approval and verifies rollback',()=>{
 assert.match(edge,/block_second_child_without_per_request_approval/);
 assert.match(edge,/second_child_failed_activation_not_rolled_back/);
 assert.match(edge,/reject_unverified_approval_actor/);
});
test('8 - test verifies 2 links, unique invitation and actual parent JWT RLS',()=>{
 assert.match(edge,/duplicate_parent_invitation_blocked:true/);
 assert.match(edge,/parent_links_for_both_children:2/);
 assert.match(edge,/parent_jwt_reads_two_children:true/);
 assert.match(edge,/child_jwt_cannot_read_sibling:true/);
});
