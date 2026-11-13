// Pure source-inspection security tests. No secrets or network access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const edge=read('supabase/functions/schoolnet-student-login-release/index.ts');
const core=read('supabase/functions/_shared/studentNoEmailLoginCore.ts');
const client=read('src/lib/studentSchoolnetAuth.ts');
const config=read('supabase/config.toml');
test('01 - public form only on production project, not local preview',()=>{
 assert.match(client,/productionEnabled: import\.meta\.env\.PROD/);
 assert.match(client,/projectUrl: import\.meta\.env\.VITE_SUPABASE_URL/);
});
test('02 - production login keeps captcha mandatory',()=>{
 assert.match(client,/mode === 'production' && \(!captchaToken/);
 assert.match(edge,/TURNSTILE_SECRET_KEY/);
 assert.match(edge,/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
 assert.match(edge,/result\.hostname!==new URL\(ORIGIN\)\.hostname/);
});
test('03 - pilot UUID is required before any credential verification',()=>{
 assert.match(edge,/SCHOOLNET_STUDENT_PILOT_REQUEST_ID/);
 assert.match(edge,/!isUuid\(pilotId\)/);
 assert.match(edge,/record\.request_id\.toLowerCase\(\)===pilotId/);
 assert.ok(edge.indexOf('if(!enabled||url!==PROD') < edge.indexOf('const svc=createClient'));
});
test('04 - login will not be enabled by fabricated or malformed JWT',()=>{
 assert.match(config,/\[functions\.schoolnet-student-login-release\][\s\S]*?verify_jwt = false/);
 assert.match(core,/deps\.verifyAccess\(session\.accessToken\)/);
 assert.match(core,/deps\.activateAfterPassword/);
 assert.match(core,/deps\.isEnabled/);
});
test('05 - SQL rate gate remains enforced for all accounts',()=>{
 assert.match(core,/await deps\.gate\(/);
 assert.match(core,/await deps\.audit\('rate_limited'\)/);
 assert.match(edge,/schoolnet_no_email_login_gate/);
 assert.match(edge,/p_ip_bucket_hmac:ipHmac/);
});
test('06 - no browser credential API bypass or technical email leaks',()=>{
 assert.doesNotMatch(client,/@schoolnet\.invalid/);
 assert.doesNotMatch(client,/SCHOOLNET_STUDENT_CODE_PEPPER/);
 assert.match(edge,/getUserById/);
 assert.match(core,/account\.email\.endsWith/);
});
test('07 - force stop and strict origin supported',()=>{
 assert.match(edge,/SCHOOLNET_STUDENT_LOGIN_ENABLED'\)!=='false'/);
 assert.match(edge,/origin!==ORIGIN/);
 assert.match(edge,/max-age|cache-control/);
});
test('08 - untrusted IP cannot disable global and per-code limits',()=>{
 assert.match(edge,/cf-connecting-ip/);
 assert.match(edge,/x-real-ip/);
 assert.match(edge,/unknown-shared/);
 assert.match(core,/keyedLoginDigest\('phone'/);
 assert.match(core,/studentCodeLookupDigest/);
});
