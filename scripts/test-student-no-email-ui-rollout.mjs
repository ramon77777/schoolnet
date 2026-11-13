// Tests purs : aucune connexion Supabase, aucun compte créé.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveStudentLoginFormMode,validateStudentLoginPreview} from '../src/lib/studentLoginPreviewValidation.ts';
const prod='https://anttmbhaphkhmkoqsofd.supabase.co';
const panel=readFileSync(new URL('../src/features/enrollments/components/AdminStudentNoEmailPanel.tsx',import.meta.url),'utf8');
const adminApi=readFileSync(new URL('../src/features/enrollments/lib/adminStudentNoEmailApi.ts',import.meta.url),'utf8');
const loginClient=readFileSync(new URL('../src/lib/studentSchoolnetAuth.ts',import.meta.url),'utf8');
test('01 - production : lecture dossier Admin autorisée sans Vite flag',()=>{
 assert.ok(adminApi.includes('import.meta.env.PROD && import.meta.env.VITE_SUPABASE_URL === PROD'));
 assert.ok(!adminApi.includes('VITE_SCHOOLNET_STUDENT_ACCOUNTS_ENABLED'));
 assert.ok(panel.includes("inspection?.admin_enabled === true"));
});
test('02 - création non proposée tant que le serveur ne la permet pas',()=>{
 assert.ok(panel.indexOf('inspection?.admin_enabled === true') < panel.indexOf("onClick={()=>void act('prepare')}"));
 assert.match(panel,/désactivée par le serveur/i);
});
test('03 - login scolaire caché en production sauf activation explicite',()=>{
 assert.equal(resolveStudentLoginFormMode({isDev:false,projectUrl:prod,sandboxEnabled:false}),'hidden');
 assert.equal(resolveStudentLoginFormMode({isDev:false,projectUrl:prod,sandboxEnabled:false,productionEnabled:true}),'production');
 assert.equal(resolveStudentLoginFormMode({isDev:false,projectUrl:'https://autre.supabase.co',sandboxEnabled:false,productionEnabled:true}),'hidden');
});
test('04 - développement local : prévisualisation sans requête Auth',()=>{
 assert.equal(resolveStudentLoginFormMode({isDev:true,projectUrl:prod,sandboxEnabled:false,productionEnabled:true}),'local-preview');
 assert.match(loginClient,/mode !== 'sandbox' && mode !== 'production'/);
});
test('05 - login réel exige CAPTCHA et endpoint distinct',()=>{
 assert.ok(loginClient.includes("mode === 'production' && (!captchaToken"));
 assert.ok(loginClient.includes('schoolnet-student-login-release'));
});
test('06 - téléphone familial partagé, identifiants individuels distincts',()=>{
 const a=validateStudentLoginPreview({phone:'07 12 34 56 78',studentCode:'SN-ABCD-EFGH-JKMN',password:'Test-personnel-2026'});
 const b=validateStudentLoginPreview({phone:'07 12 34 56 78',studentCode:'SN-ABCD-EFGH-JKMP',password:'Test-personnel-2026'});
 assert.equal(a.phoneE164,'+2250712345678');assert.equal(b.phoneE164,a.phoneE164);
 assert.notEqual(a.studentCode,b.studentCode);
});
