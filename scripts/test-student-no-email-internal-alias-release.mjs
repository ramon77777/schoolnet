// SCHOOLNET — test statique de verrouillage de l'identite interne, sans reseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const identity=file('supabase/functions/_shared/schoolnetStudentIdentity.ts');
const policy=file('supabase/functions/_shared/studentNoEmailPolicy.ts');
const core=file('supabase/functions/_shared/studentNoEmailLoginCore.ts');
const admin=file('supabase/functions/schoolnet-student-no-email-admin/index.ts');
const login=file('supabase/functions/schoolnet-student-login-release/index.ts');
const config=file('supabase/config.toml');
test('01 - domaine interne fixe et identique',()=>{
 assert.ok(identity.includes('SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN = "schoolnet.invalid"'));
 assert.ok(policy.includes('domain !== SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN'));
});
test('02 - identifiant unique derive du dossier, jamais du contact parent',()=>{
 assert.ok(policy.includes("requestId.replace(/-/g,'').toLowerCase()"));
 assert.ok(admin.includes('technicalSchoolnetAlias(requestId)'));
});
test('03 - aucune variable de domaine arbitraire sur les deux backends',()=>{
 for(const src of [admin,login,policy,core])assert.ok(!src.includes('SCHOOLNET_STUDENT_ALIAS_DOMAIN'));
});
test('04 - connexion limitee a cet unique domaine',()=>{
 assert.ok(core.includes('allowedDomain!==SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN'));
 assert.ok(login.includes('domain=SCHOOLNET_STUDENT_INTERNAL_ALIAS_DOMAIN'));
});
test('05 - creation et connexion demeurent explicitement verrouillees',()=>{
 assert.ok(admin.includes("SCHOOLNET_STUDENT_ACCOUNTS_ENABLED')!=='true'"));
 assert.ok(login.includes("SCHOOLNET_STUDENT_LOGIN_ENABLED')==='true'"));
 assert.ok(login.includes('SCHOOLNET_STUDENT_TRUSTED_IP_VERIFIED'));
 assert.ok(login.includes('SCHOOLNET_STUDENT_TURNSTILE_SECRET'));
});
test('06 - verify_jwt doit rester vrai dans les deux fonctions',()=>{
 assert.match(config,/\[functions\.schoolnet-student-no-email-admin\]\s*enabled = true\s*verify_jwt = true/);
 assert.match(config,/\[functions\.schoolnet-student-login-release\]\s*enabled = true\s*verify_jwt = true/);
});
