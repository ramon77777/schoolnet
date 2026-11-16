// SCHOOLNET — audit source hors ligne du SQL principal Lot 5.C.
// Ne se connecte jamais a Supabase ; aucune mutation et aucun secret.
// Le succès de ces tests n'autorise PAS l'execution du SQL en production.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../supabase/proposals/20261116_schoolnet_lot5c_MAIN_INSTALL_REVIEW_ONLY.sql',
 import.meta.url,
),'utf8');

test('01 - proposition explicite, transactionnelle et jamais deployée automatiquement',()=>{
 assert.match(sql,/MAIN PROJECT INTEGRATION PROPOSAL \(REVIEW ONLY\)/);
 assert.match(sql,/^BEGIN;\s*$/m);
 assert.match(sql,/^COMMIT;\s*$/m);
 assert.match(sql,/SET LOCAL lock_timeout='5s'/);
 assert.match(sql,/SET LOCAL statement_timeout='90s'/);
 assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|SCHEMA|FUNCTION)\b/i);
 assert.doesNotMatch(sql,/\bTRUNCATE\b/i);
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\b/i);
});

test('02 - le précontrole utilise le vrai schéma principal, sans fixtures sandbox',()=>{
 assert.match(sql,/to_regnamespace\('schoolnet_student_private'\)/);
 assert.match(sql,/SCHOOLNET_LOT5C_MAIN_REQUIRED_SCHEMA_MISSING/);
 assert.match(sql,/SCHOOLNET_LOT5C_MAIN_ALREADY_APPLIED_OR_PARTIAL/);
 assert.match(sql,/SCHOOLNET_LOT5C_MAIN_EXISTING_GUARDS_MISSING/);
 assert.match(sql,/parent_links_unique/);
 assert.doesNotMatch(sql,/to_regclass\('schoolnet_student_private\.identities'\)/);
 assert.doesNotMatch(sql,/DEM-L5C|onqlsvphmrqhelislpry|auth\.users\)<>19/);
});

test('03 - les approbations individuelles sont privées et non modifiables',()=>{
 assert.match(sql,/CREATE TABLE public\.schoolnet_sibling_parent_approvals/);
 assert.match(sql,/request_id uuid PRIMARY KEY/);
 assert.match(sql,/verified_by uuid NOT NULL/);
 assert.match(sql,/admin\.role::text='admin'/);
 assert.match(sql,/SCHOOLNET_SIBLING_PROOF_IMMUTABLE/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/GRANT SELECT,INSERT ON public\.schoolnet_sibling_parent_approvals TO service_role/);
 assert.match(sql,/REVOKE ALL ON public\.schoolnet_sibling_parent_approvals/);
});

test('04 - le rattachement exige une identité Auth fiable et un Parent vérifié',()=>{
 assert.match(sql,/link_verified_no_email_family_after_activation/);
 assert.match(sql,/parent_auth\.raw_app_meta_data->>'schoolnet_family_invitation'='true'/);
 assert.match(sql,/student_auth\.raw_app_meta_data->>'schoolnet_no_email_student'='true'/);
 assert.match(sql,/student_auth\.raw_app_meta_data->>'schoolnet_no_email_request_id'/);
 assert.match(sql,/existing\.status='activated'/);
 assert.match(sql,/approval\.request_id=NEW\.request_id/);
 assert.match(sql,/prior_link\.parent_id=NEW\.parent_id/);
 assert.match(sql,/SCHOOLNET_AUTOLINK_FAMILY_CONFLICT/);
 assert.doesNotMatch(sql,/raw_user_meta_data\s*->/);
});

test('05 - un seul lien familial et un seul child_ids, transaction unique',()=>{
 assert.match(sql,/INSERT INTO public\.parent_links\(parent_id,student_id,relation_type\)/);
 assert.match(sql,/ON CONFLICT\(parent_id,student_id\) DO NOTHING/);
 assert.match(sql,/pg_catalog\.array_append\(/);
 assert.match(sql,/SCHOOLNET_AUTOLINK_INCOMPLETE/);
 assert.match(sql,/AFTER UPDATE OF status ON public\.schoolnet_student_no_email_requests/);
 assert.match(sql,/NEW\.status='enabled'/);
});

test('06 - preflight et post-install refusent les configurations inconnues',()=>{
 assert.match(sql,/SCHOOLNET_LOT5C_MAIN_POSTCHECK_FAILED/);
 assert.match(sql,/c\.relrowsecurity AND c\.relforcerowsecurity/);
 assert.match(sql,/has_table_privilege\(/);
 assert.match(sql,/service_role','public\.schoolnet_sibling_parent_approvals','INSERT'/);
 assert.match(sql,/schoolnet_sibling_approval_guard/);
 assert.match(sql,/schoolnet_student_no_email_autolink_family_after_activation/);
});
