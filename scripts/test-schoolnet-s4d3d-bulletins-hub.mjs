import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig,
  makeDemoCurriculum, makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";
import {
  isOfficialCurriculum, isOfficialGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesModel.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");
const workspace = read("src/features/official-documents/pages/SchoolOfficialBulletinWorkspace.tsx");
const hub = read("src/features/official-documents/pages/SchoolOfficialDocumentsHub.tsx");
const averages = read("src/features/schools/pages/LocalSchoolOfficialGeneralAverages.tsx");
const card = read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const api = read("src/features/official-documents/lib/schoolAuthorizedReportCardApi.ts");
const vercel = JSON.parse(read("vercel.json"));
const pkg = JSON.parse(read("package.json"));
const branch = "feature/schoolnet-s4d3d-bulletins-hub-20261127";
const schoolA = DEMO_SCHOOLS[0];
const configA = makeDemoGradeConfig(schoolA.id);
const scopeA = {
  schoolId: schoolA.id,
  schoolYearId: configA.years[0].id,
  classId: configA.subjects[0].classId,
  periodId: configA.periods[0].id,
};
const curriculumA = makeDemoCurriculum(scopeA);
const generalA = makeDemoGeneralPreview(scopeA);

test("S4-D.3d: new bulletin workspace is mounted only for a genuine school admin", () => {
  assert.match(hub, /actor === "school_admin" && !demo/);
  assert.match(hub, /<SchoolOfficialBulletinWorkspace \/>/);
  assert.match(hub, /allowed && <div className="space-y-6">/);
  assert.match(workspace, /user\.role === "school_admin"/);
  assert.match(workspace, /!user\.isDemo/);
  assert.match(workspace, /viewer=\{viewer\}/);
  assert.match(workspace, /<SchoolAuthorizedStudentReportCard/);
});

test("S4-D.3d: existing S4-D.3a demonstration remains separate", () => {
  assert.match(hub, /schoolnet_s4d_demo/);
  assert.match(hub, /<SchoolFictionalReportCardDemo \/>/);
  assert.match(workspace, /import\.meta\.env\.DEV/);
  assert.match(workspace, /schoolnet_c3c4_demo/);
  assert.match(workspace, /localDemo\s*\?\s*makeDemoGradeConfig/);
  assert.match(workspace, /localDemo\s*\?\s*makeDemoCurriculum\(targetScope\)/);
  assert.match(workspace, /localDemo\s*\?\s*makeDemoGeneralPreview\(targetScope\)/);
  assert.match(averages, /schoolnet_c3c4_demo=1#schoolnet-v2-bulletins/);
});

test("S4-D.3d: live school selector reuses existing server-scoped permissions", () => {
  assert.match(workspace, /Promise\.all\(\[getAdminSchools\(\), getActiveSchoolAdmins\(\)\]\)/);
  assert.match(workspace, /filterSchoolsForLocalAdmin\(all, members, ownerKey\)/);
  assert.match(workspace, /getSchoolGradeConfiguration\(activeSchoolId\)/);
  assert.match(workspace, /readOfficialCurriculum\(targetScope\)/);
  assert.match(workspace, /readOfficialGeneralPreview\(targetScope\)/);
  assert.match(api, /schoolnet_school_report_card_preview/);
  assert.match(workspace, /isOfficialCurriculum\(curriculum, targetScope\)/);
  assert.match(workspace, /isOfficialGeneralPreview\(preview, targetScope\)/);
});

test("S4-D.3d: identity and school scope invalidate all old asynchronous responses", () => {
  assert.match(workspace, /ownerKey, scope\.schoolId, scope\.schoolYearId, scope\.classId/);
  assert.match(workspace, /scope\.periodId, revision/);
  assert.match(workspace, /rosterLoad\?\.key === scopeKey/);
  assert.match(workspace, /gradeLoad\?\.key === configKey/);
  assert.match(workspace, /let cancelled = false/);
  assert.match(workspace, /if \(!cancelled\) setRosterLoad/);
  assert.match(workspace, /return \(\) => \{ cancelled = true; \}/);
  assert.match(workspace, /setSchoolId\(event\.target\.value\)/);
  assert.match(workspace, /setYearId\(event\.target\.value\)/);
  assert.match(workspace, /setClassId\(event\.target\.value\)/);
  assert.match(workspace, /setPeriodId\(event\.target\.value\)/);
  assert.match(workspace, /resetStudent\(\)/);
});

test("S4-D.3d: only a student returned within the current authorized cohort is selectable", () => {
  assert.match(workspace, /preview\?\.students\.find\(student =>/);
  assert.match(workspace, /student\.studentId === studentId/);
  assert.match(workspace, /value=\{selectedStudent\?\.studentId \?\? ""\}/);
  assert.match(workspace, /selectedStudent && viewer && scope && curriculum/);
  assert.match(workspace, /studentId=\{selectedStudent\.studentId\}/);
  assert.match(workspace, /revisionKey=\{scopeKey\}/);
  assert.doesNotMatch(workspace, /searchParams\.get\("(?:school|student|grade|teacher)_id"\)/i);
});

test("S4-D.3d: fictive A cohort supports 16.67, real zero, incomplete and blocked contexts", () => {
  assert.ok(isOfficialCurriculum(curriculumA, scopeA));
  assert.equal(curriculumA.status, "approved");
  assert.ok(isOfficialGeneralPreview(generalA, scopeA));
  assert.equal(generalA.state, "preview");
  assert.equal(generalA.studentCount, 13);
  assert.equal(generalA.students[0].averageOn20, 16.67);
  assert.equal(generalA.students[1].averageOn20, 0);
  assert.equal(generalA.students[2].state, "incomplete");
  assert.equal(generalA.students[2].averageOn20, null);
  const blocked = { ...scopeA, periodId: configA.periods[1].id };
  assert.notEqual(makeDemoCurriculum(blocked).status, "approved");
  assert.equal(makeDemoGeneralPreview(blocked).state, "not_configured");
});

test("S4-D.3d: browser does not create grades, exports, school writes or bulletin publication", () => {
  assert.doesNotMatch(workspace, /[.]rpc[(]|[.]insert[(]|[.]update[(]|[.]upsert[(]|[.]delete[(]/);
  assert.doesNotMatch(workspace, /window[.]print|downloadFictionalSchoolExport|renderSyntheticPreviewPdf/i);
  assert.doesNotMatch(workspace, /Math[.]round|weightedSum|reduce[(]/);
  assert.match(workspace, /officialGeneralActivationPending\(error\)/);
  assert.match(workspace, /Aucune donnée fictive de secours/);
  assert.match(workspace, /Aucune création,/);
  assert.match(card, /isReportCardRpcPending\(error\)/);
  assert.match(card, /Activation SQL du bulletin V2 en attente/);
});

test("S4-D.3d: page navigation preserves local-only fixtures without leaking into production", () => {
  assert.match(workspace, /to=\{localDemo/);
  assert.match(workspace, /schoolnet_c3c4_demo=1/);
  assert.match(averages, /to=\{localDemo/);
  assert.match(averages, /Bulletins V2/);
  assert.match(hub, /Règles d'accès aux exports/);
  assert.match(hub, /Exporter PDF — bientôt/);
});

test("S4-D.3d: this branch has no Vercel preview and keeps its own targeted QA", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pkg.scripts["qa:s4d3d"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3d-bulletins-hub.mjs");
});
