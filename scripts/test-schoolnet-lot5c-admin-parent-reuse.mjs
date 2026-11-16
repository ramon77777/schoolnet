// Offline source assertions. No database, Auth users, production deployment or secrets.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const server=read('supabase/functions/schoolnet-student-no-email-admin/index.ts');
const api=read('src/features/enrollments/lib/adminStudentNoEmailApi.ts');
const panel=read('src/features/enrollments/components/AdminStudentNoEmailPanel.tsx');
const sql=read('supabase/proposals/20261116_schoolnet_sibling_parent_reuse_SANDBOX_REVIEW_ONLY.sql');

test('01 - admin JWT, admin role, strict origin and rollout guard remain mandatory',()=>{
 assert.match(server,/schoolnetStudentAllowedOrigin/);
 assert.match(server,/schoolnetStudentRolloutAllowed/);
 assert.match(server,/service\.auth\.getUser\(authorization\.slice\(7\)\)/);
 assert.match(server,/actorProfile\?\.role!=='admin'/);
 assert.match(server,/if\(!rolloutAllowed\)/);
});
test('02 - server never accepts parent IDs asserted by a browser',()=>{
 assert.doesNotMatch(server,/body\.(?:parent_id|parentId)/);
 assert.match(server,/\.eq\('email',email\)\.eq\('recipient','parent'\)/);
 assert.match(server,/previous\.status!=='activated'/);
 assert.match(server,/previous\.expected_role!=='parent'/);
 assert.match(server,/\.eq\('parent_id',previous\.user_id\)/);
 assert.match(server,/previousRequest\.data\.status==='rejected'/);
});
test('03 - sibling approval is read from DB and verified against the exact request',()=>{
 assert.match(server,/from\('schoolnet_sibling_parent_approvals'\)/);
 assert.match(server,/\.eq\('request_id',requestId\)/);
 assert.match(server,/approval\.data\?\.parent_id===previous\.user_id/);
 assert.match(server,/approval\.data\?\.guardian_relationship===request\.guardian_relationship/);
});
test("04 - second child's creation fails closed until approval exists",()=>{
 assert.match(server,/if\(parentReuseAvailable&&!parentReuseApproved\)/);
 assert.match(server,/Approbation familiale propre a cet enfant requise/);
 assert.match(server,/if\(record\)return deny/);
 assert.match(server,/status:'reserved'/);
});
test('05 - registering approval requires role, verified evidence, note and no existing student record',()=>{
 assert.match(server,/if\(body\.verified!==true\)/);
 assert.match(server,/validateAdminVerification\(body\.verification_note\)/);
 assert.match(server,/if\(!parentReuseAvailable\|\|parentReuseApproved\|\|record\)/);
 assert.match(server,/verified_by:actor,guardian_relationship:request\.guardian_relationship/);
 assert.match(sql,/admin\.role::text='admin'/);
 assert.match(sql,/SCHOOLNET_SIBLING_PROOF_IMMUTABLE/);
});
test('06 - inspection distinguishes eligible Parent reuse from approved request',()=>{
 assert.match(server,/if\(action==='inspect'\)/);
 assert.match(server,/parent_reuse_available:parentReuseAvailable,parent_reuse_approved:parentReuseApproved/);
 assert.match(api,/parent_reuse_available\?:boolean/);
 assert.match(api,/parent_reuse_approved\?:boolean/);
});
test('07 - Admin form requires manual verification and double confirmation',()=>{
 assert.match(panel,/action==='approve_parent_reuse'&&!window\.confirm/);
 assert.match(panel,/Approuver ce nouvel enfant pour le Parent existant/);
 assert.match(panel,/disabled=\{busy\|\|!verified\|\|note\.trim\(\)\.length<10\}/);
 assert.match(panel,/inspection\?\.parent_reuse_available&&!inspection\?\.parent_reuse_approved/);
});
test('08 - Vercel previews still cannot call the Admin API',()=>{
 assert.match(api,/!schoolnetAdminPreviewOnly/);
 assert.match(api,/input\.action==='inspect' \? !studentNoEmailAdminCanInspect : !studentNoEmailAdminEnabled/);
 assert.match(api,/import\.meta\.env\.VITE_SCHOOLNET_ADMIN_LOCAL_INSPECT === 'true'/);
 assert.match(server,/origin!==STUDENT_PRODUCTION_ORIGIN && action!=='inspect'/);
 assert.match(panel,/Prévisualisation en lecture seule/);
});
