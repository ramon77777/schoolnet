import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
 isS4D3LLocalLab, isS4D3LLabRequested, isLabSchoolAdmin,
 S4D3L_SUPABASE_LOCAL_URL, S4D3L_SCHOOLS,
} from "../src/features/official-documents/lib/schoolBulletinLocalLabGuard.ts";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const ui=read("src/features/official-documents/pages/SchoolBulletinLocalLab.tsx");
const hub=read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
const api=read("src/features/official-documents/lib/schoolBulletinLocalLabApi.ts");
const sql=read("tests/s4d3l/disposable-case-read-and-login.sql");
const setup=read("scripts/schoolnet-s4d3l-local-setup.mjs");
const ci=read(".github/workflows/schoolnet-s4d3l-local-interactive-ci.yml");
const pkg=JSON.parse(read("package.json"));
const vercel=JSON.parse(read("vercel.json"));
const branch="feature/schoolnet-s4d3l-local-interactive-approval-20261127";

const correct={
 dev:true,explicitLabOptIn:"1",locationHostname:"localhost",
 supabaseUrl:"http://127.0.0.1:55421",
};
test("S4-D.3l: exact local development configuration is the only way to reach write UI",()=>{
 assert.equal(S4D3L_SUPABASE_LOCAL_URL,"http://127.0.0.1:55421");
 assert.equal(isS4D3LLocalLab(correct),true);
 assert.equal(isS4D3LLocalLab({...correct,locationHostname:"127.0.0.1"}),true);
 for(const bad of [
  {...correct,dev:false},
  {...correct,explicitLabOptIn:"0"},
  {...correct,explicitLabOptIn:undefined},
  {...correct,locationHostname:"schoolnet-snowy.vercel.app"},
  {...correct,supabaseUrl:"https://anttmbhaphkhmkoqsofd.supabase.co"},
  {...correct,supabaseUrl:"http://localhost:55421"},
  {...correct,supabaseUrl:"http://127.0.0.1:54321"},
 ]) assert.equal(isS4D3LLocalLab(bad),false);
 assert.equal(isS4D3LLabRequested(true,"?schoolnet_s4d3l_lab=1"),true);
 assert.equal(isS4D3LLabRequested(false,"?schoolnet_s4d3l_lab=1"),false);
 assert.equal(isS4D3LLabRequested(true,"?schoolnet_c3c4_demo=1"),false);
});
test("S4-D.3l: real assigned school admins only, not demo or platform admin",()=>{
 const id="00000000-0000-4000-8000-000000000101";
 assert.equal(isLabSchoolAdmin({id,role:"school_admin",isDemo:false}),true);
 assert.equal(isLabSchoolAdmin({id,role:"admin",isDemo:false}),false);
 assert.equal(isLabSchoolAdmin({id,role:"teacher",isDemo:false}),false);
 assert.equal(isLabSchoolAdmin({id,role:"school_admin",isDemo:true}),false);
 assert.equal(isLabSchoolAdmin({id:"demo",role:"school_admin",isDemo:false}),false);
 assert.equal(isLabSchoolAdmin(null),false);
});
test("S4-D.3l: scope labels correspond to established, separate A/B fictional fixtures",()=>{
 assert.equal(S4D3L_SCHOOLS.length,2);
 assert.notEqual(S4D3L_SCHOOLS[0].id,S4D3L_SCHOOLS[1].id);
 assert.equal(S4D3L_SCHOOLS[0].classId,"00000000-0000-4000-8000-000000000030");
 assert.equal(S4D3L_SCHOOLS[0].periodId,"00000000-0000-4000-8000-000000000040");
});
test("S4-D.3l: old bulletin hub unaffected except explicit lazy DEV lab detour",()=>{
 assert.match(hub,/isS4D3LLabRequested\(import\.meta\.env\.DEV/);
 assert.match(hub,/lazy\(\(\) => import\("\.\/SchoolBulletinLocalLab"\)\)/);
 assert.match(hub,/<SchoolOfficialBulletinWorkspace/);
 assert.match(hub,/<SchoolFictionalReportCardDemo/);
 assert.match(hub,/if \(labRequested\) return <Suspense/);
});
test("S4-D.3l: UI displays real action buttons, motives, status and persisted audit",()=>{
 for(const item of [
  "Ouvrir le dossier","Soumettre le bulletin","Approuver",
  "Demander une correction","Refuser avec motif",
  "Autoriser la publication","Historique PostgreSQL",
  "Changer de compte","Actualiser depuis PostgreSQL",
 ])assert.ok(ui.includes(item),item+" missing");
 assert.match(ui,/readOfficialGeneralPreview\(scope\)/);
 assert.match(ui,/readLabCase\(scope,selected\.studentId,viewer\)/);
 assert.match(ui,/openLabCase\(scope,selected\.studentId,viewer\)/);
 assert.match(ui,/transitionLabCase\(scope,selected\.studentId,viewer,row,action/);
 assert.match(ui,/row\.audit\.map/);
 assert.match(ui,/Aucun bulletin n'est publié/);
});
test("S4-D.3l: client checks live case version, capabilities and server result",()=>{
 assert.match(api,/isLabRuntime\(\)/);
 assert.match(api,/requireLocalLab\(viewer,scope,studentId\)/);
 assert.match(api,/schoolnet_bulletin_v2_prototype_case_for_student/);
 assert.match(api,/schoolnet_bulletin_v2_prototype_open_case/);
 assert.match(api,/schoolnet_bulletin_v2_prototype_transition/);
 assert.match(api,/crypto\.randomUUID\(\)/);
 assert.match(api,/p_expected_version:current\.version/);
 assert.match(api,/isLabCaseRead\(data,scope,studentId\)/);
 assert.doesNotMatch(api,/service_role|SERVICE_ROLE_KEY|localStorage|INSERT INTO|UPDATE schoolnet_private/);
});
test("S4-D.3l: disposable SQL read cannot reveal any case without school membership and grant",()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/m\.status='active'/);
 assert.match(sql,/m\.revoked_at IS NULL/);
 assert.match(sql,/p\.role::text='school_admin'/);
 assert.match(sql,/g\.mandate_verified/);
 assert.match(sql,/g\.revoked_at IS NULL/);
 assert.match(sql,/v_caps='\[\]'::jsonb/);
 assert.match(sql,/c\.school_id=p_school_id/);
 assert.match(sql,/c\.student_id=p_student_id/);
 assert.match(sql,/schoolnet_private\.school_bulletin_v2_events/);
 assert.doesNotMatch(sql,/INSERT INTO schoolnet_private\.school_bulletin_v2_events/);
 assert.doesNotMatch(sql,/GRANT SELECT ON schoolnet_private/);
});
test("S4-D.3l: own profile login is possible locally, other profiles invisible",()=>{
 assert.match(sql,/GRANT SELECT \(id,role,full_name\) ON public\.profiles TO authenticated/);
 assert.match(sql,/CREATE POLICY s4d3l_profile_self_only/);
 assert.match(sql,/USING \(id = \(SELECT auth\.uid\(\)\)\)/);
 assert.doesNotMatch(sql,/USING \(true\)/);
});
test("S4-D.3l: local fixture starter refuses existing database and never links hosted project",()=>{
 assert.match(setup,/API="http:\/\/127\.0\.0\.1:55421"/);
 assert.match(setup,/schoolnet_s4c3c35_full_auth_http_ci/);
 assert.match(setup,/NOT_PRISTINE/);
 assert.match(setup,/supabase_db_/);
 assert.match(setup,/SERVICE_ROLE_KEY/);
 assert.match(setup,/VITE_SUPABASE_ANON_KEY=/);
 assert.doesNotMatch(setup,/VITE_SUPABASE_SERVICE_ROLE|supabase db push|supabase link|SUPABASE_ACCESS_TOKEN|db reset/);
});
test("S4-D.3l: SQL stays only in disposable tests, no migration or V1 modification",()=>{
 assert.equal(readdirSync(new URL("../supabase/migrations/",import.meta.url))
   .filter(x=>/s4d3l/i.test(x)).length,0);
 assert.doesNotMatch(read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx"),
  /s4d3l|bulletin_v2_prototype/);
});
test("S4-D.3l: CI real local Auth and UI contract, no hosted deploy",()=>{
 assert.equal(vercel.git.deploymentEnabled[branch],false);
 assert.equal(pkg.scripts["qa:s4d3l"],
 "node --experimental-strip-types --test scripts/test-schoolnet-s4d3l-functional-lab.mjs");
 assert.equal(pkg.scripts["lab:s4d3l:setup"],
 "node scripts/schoolnet-s4d3l-local-setup.mjs");
 assert.match(ci,/supabase start/);
 assert.match(ci,/npm run lab:s4d3l:setup/);
 assert.match(ci,/npm run qa:s4d3l/);
 assert.match(ci,/supabase stop --no-backup/);
});
