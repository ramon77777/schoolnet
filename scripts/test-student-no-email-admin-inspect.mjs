import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const edge=readFileSync(new URL("../supabase/functions/schoolnet-student-no-email-admin/index.ts",import.meta.url),"utf8");
test("inspection Admin autorisée en lecture seule sans activation",()=>{
 const inspect=edge.indexOf("if(action==='inspect')");
 const writeGate=edge.indexOf("if(!creationEnabled)");
 const insert=edge.indexOf(".insert({");
 assert.ok(inspect>-1 && writeGate>inspect && insert>writeGate);
 assert.match(edge,/admin_enabled:creationEnabled/);
});
test("toutes les modifications exigent le drapeau serveur",()=>{
 assert.match(edge,/Deno\.env\.get\('SCHOOLNET_STUDENT_ACCOUNTS_ENABLED'\)==='true'/);
 assert.match(edge,/if\(!creationEnabled\)return deny\(origin,503/);
 assert.ok(edge.indexOf("if(!creationEnabled)")<edge.indexOf("const started=Date.now()"));
});
test("JWT et profil admin vérifiés avant lecture du dossier",()=>{
 assert.ok(edge.indexOf("service.auth.getUser(authorization.slice(7))") < edge.indexOf("service.from('public_enrollment_requests')"));
 assert.match(edge,/actorProfile\?\.role!=='admin'/);
 assert.match(edge,/origin!==PROD_ORIGIN/);
});
test("pas de création de comptes ou liens en mode inspect",()=>{
 const beforeInspect=edge.slice(0,edge.indexOf("if(action==='inspect')"));
 assert.doesNotMatch(beforeInspect,/\.insert\(|\.update\(|generateLink\(/);
});
