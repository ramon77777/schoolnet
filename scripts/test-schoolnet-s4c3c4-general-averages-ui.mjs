import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isOfficialCurriculum, isOfficialGeneralPreview,
  summarizeGeneralStudents, filterGeneralStudents, displayGeneralAverage,
  GENERAL_PAGE_SIZE,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesModel.ts";
import {
  DEMO_SCHOOLS, makeDemoGradeConfig, makeDemoCurriculum,
  makeDemoGeneralPreview,
} from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const page = read("src/features/schools/pages/LocalSchoolOfficialGeneralAverages.tsx");
const api = read("src/features/schools/lib/schoolOfficialGeneralAveragesApi.ts");
const sql = read("supabase/proposals/s4c3c3_school_admin_official_general_averages_rpc.sql");
const routes = read("src/routes/router.tsx");
const nav = read("src/layouts/DashboardLayout.tsx");
const dashboard = read("src/features/schools/pages/LocalSchoolDashboard.tsx");
const vercel = JSON.parse(read("vercel.json"));
const pkg = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/schoolnet-s4c3c4-general-averages-ui-ci.yml");
const branch = "feature/schoolnet-s4c3c4-general-averages-ui-20261126";
const sampleConfig = makeDemoGradeConfig(DEMO_SCHOOLS[0].id);
const scope = {
  schoolId: DEMO_SCHOOLS[0].id,
  schoolYearId: sampleConfig.years[0].id,
  classId: sampleConfig.subjects[0].classId,
  periodId: sampleConfig.periods[0].id,
};

test("C.3-C.4: the school-approved curriculum validates exact shape, school and coefficient", () => {
  const curriculum = makeDemoCurriculum(scope);
  assert.equal(curriculum.status, "approved");
  assert.equal(curriculum.subjects.length, 3);
  assert.equal(isOfficialCurriculum(curriculum, scope), true);
  assert.equal(isOfficialCurriculum({ ...curriculum, schoolId: DEMO_SCHOOLS[1].id }, scope), false);
  assert.equal(isOfficialCurriculum({
    ...curriculum, subjects: [...curriculum.subjects, curriculum.subjects[0]],
  }, scope), false);
  assert.equal(isOfficialCurriculum({
    ...curriculum, subjects: [{ ...curriculum.subjects[0], coefficient: 42 }],
  }, scope), false);
  assert.equal(isOfficialCurriculum({ ...curriculum, rawGrades: [] }, scope), false);
});

test("C.3-C.4: unapproved, missing, and approved catalogues never invent results", () => {
  const draft = makeDemoCurriculum({ ...scope, classId: sampleConfig.subjects[3].classId });
  const missing = makeDemoCurriculum({ ...scope, periodId: sampleConfig.periods[1].id });
  assert.equal(draft.status, "draft");
  assert.equal(missing.status, "missing");
  assert.equal(isOfficialCurriculum(draft, { ...scope, classId: draft.classId }), true);
  assert.equal(isOfficialCurriculum(missing, { ...scope, periodId: missing.periodId }), true);
  assert.equal(missing.subjects.length, 0);
  const without = makeDemoGeneralPreview({ ...scope, periodId: missing.periodId });
  assert.equal(without.state, "not_configured");
  assert.equal(without.studentCount, 0);
  assert.equal(isOfficialGeneralPreview(without, { ...scope, periodId: missing.periodId }), true);
});

test("C.3-C.4: official previews permit a published zero and never display missing grades", () => {
  const preview = makeDemoGeneralPreview(scope);
  assert.equal(isOfficialGeneralPreview(preview, scope), true);
  const zero = preview.students.find((s) => s.averageOn20 === 0);
  assert.ok(zero);
  assert.equal(zero.state, "ready");
  assert.match(displayGeneralAverage(zero), /0,00/);
  for (const row of preview.students) {
    if (row.state !== "ready") {
      assert.equal(row.averageOn20, null);
      assert.equal(displayGeneralAverage(row), "—");
    }
  }
  const bad = structuredClone(preview);
  const incomplete = bad.students.find((student) => student.state === "incomplete");
  assert.ok(incomplete);
  incomplete.averageOn20 = 9.99;
  assert.equal(isOfficialGeneralPreview(bad, scope), false);
});

test("C.3-C.4: no cross-school / extra raw grade / wrong count / duplicate roster can pass", () => {
  const preview = makeDemoGeneralPreview(scope);
  assert.equal(isOfficialGeneralPreview({ ...preview, schoolId: DEMO_SCHOOLS[1].id }, scope), false);
  assert.equal(isOfficialGeneralPreview({ ...preview, unpublishedGrades: [] }, scope), false);
  assert.equal(isOfficialGeneralPreview({ ...preview, studentCount: 999 }, scope), false);
  assert.equal(isOfficialGeneralPreview({ ...preview, students: [
    ...preview.students, preview.students[0],
  ], studentCount: preview.studentCount + 1 }, scope), false);
  assert.equal(isOfficialGeneralPreview({ ...preview, students: preview.students.map((r) =>
    ({ ...r, subjectDetails: [] })) }, scope), false);
  assert.equal(isOfficialGeneralPreview(preview, { ...scope, periodId: "foreign" }), false);
});

test("C.3-C.4: a second fictional school is strictly isolated", () => {
  const configB = makeDemoGradeConfig(DEMO_SCHOOLS[1].id);
  const other = {
    schoolId: DEMO_SCHOOLS[1].id,
    schoolYearId: configB.years[0].id,
    classId: configB.subjects[0].classId,
    periodId: configB.periods[0].id,
  };
  const p = makeDemoGeneralPreview(other);
  assert.equal(isOfficialGeneralPreview(p, other), true);
  assert.equal(isOfficialGeneralPreview(p, scope), false);
  assert.ok(!p.students.some((r) =>
    makeDemoGeneralPreview(scope).students.some((s) => s.studentId === r.studentId)));
});

test("C.3-C.4: the filter is accent tolerant and counts agree", () => {
  const students = makeDemoGeneralPreview(scope).students;
  const totals = summarizeGeneralStudents(students);
  assert.equal(totals.total, students.length);
  assert.equal(totals.ready + totals.incomplete + totals.notConfigured, totals.total);
  assert.equal(filterGeneralStudents(students, "  éLÈVE  ", "all").length, totals.total);
  assert.equal(filterGeneralStudents(students, "", "incomplete").length, totals.incomplete);
  assert.equal(filterGeneralStudents(students, "", "not_configured").length, totals.notConfigured);
  assert.equal(filterGeneralStudents(students, "aucun faux élève", "all").length, 0);
  assert.equal(GENERAL_PAGE_SIZE, 20);
});

test("C.3-C.4: page is behind school-admin role and uses existing school configuration", () => {
  assert.match(routes, /import LocalSchoolOfficialGeneralAverages/);
  assert.match(routes, /path: "school\/official-general-averages", element: <LocalSchoolOfficialGeneralAverages/);
  assert.match(routes, /RoleGate allowed=\{\["school_admin"\]\}/);
  assert.match(nav, /to="\/app\/school\/official-general-averages"/);
  assert.match(dashboard, /to="\/app\/school\/official-general-averages"/);
  assert.match(page, /getAdminSchools\(\)/);
  assert.match(page, /getActiveSchoolAdmins\(\)/);
  assert.match(page, /filterSchoolsForLocalAdmin/);
  assert.match(page, /getSchoolGradeConfiguration/);
  assert.match(page, /role === "school_admin"/);
  assert.match(page, /!user\.isDemo/);
});

test("C.3-C.4: API RPC arguments match already-written C.3-C.3 SQL and validate scope", () => {
  assert.match(sql, /CREATE FUNCTION public\.schoolnet_school_official_curriculum\(/);
  assert.match(sql, /CREATE FUNCTION public\.schoolnet_school_official_general_averages\(/);
  assert.match(api, /supabase\.rpc\("schoolnet_school_official_curriculum"/);
  assert.match(api, /supabase\.rpc\("schoolnet_school_official_general_averages"/);
  for (const arg of ["p_school_id", "p_period_id", "p_class_id", "p_action", "p_subject_ids"]) {
    assert.match(api, new RegExp(arg + ":"));
  }
  assert.match(api, /isOfficialGeneralPreview\(data, scope\)/);
  assert.match(api, /isOfficialCurriculum\(result, scope\)/);
  assert.doesNotMatch(api, /\.from\(|service_role|auth\.admin|student_period_averages/);
  assert.doesNotMatch(page, /supabase\.rpc|\.from\(|student_period_averages|report_cards|publish_admin_report_card/);
});

test("C.3-C.4: explicit approval and locked period guard do not publish results", () => {
  assert.match(page, /window\.confirm\("Enregistrer cette liste/);
  assert.match(page, /window\.confirm\("Approuver les matières/);
  assert.match(page, /selectedPeriod\?\.isLocked/);
  assert.match(page, /currentCurriculum\.status === "draft"/);
  assert.match(api, /p_action: "set"/);
  assert.match(api, /p_action: "approve"/);
  assert.match(api, /p_action: "read"/);
  assert.doesNotMatch(api, /CREATE |DELETE |INSERT |UPDATE /);
  assert.doesNotMatch(page, /Exporter|Publier les|Télécharger/);
});

test("C.3-C.4: local demo is clearly marked and no hosted data replaces errors", () => {
  assert.match(page, /import\.meta\.env\.DEV/);
  assert.match(page, /schoolnet_c3c4_demo/);
  assert.match(page, /DONNÉES 100 % FICTIVES/);
  assert.match(page, /if \(localDemo\)/);
  assert.match(page, /localDemo \? makeDemoCurriculum\(scope\) : await readOfficialCurriculum\(scope\)/);
  assert.match(page, /localDemo \? makeDemoGeneralPreview\(scope\) : await readOfficialGeneralPreview\(scope\)/);
  assert.match(page, /Activation SQL en attente/);
  assert.match(page, /Aucune note fictive ne remplace les données réelles/);
  assert.match(page, /localDemo \|\| selectedPeriod\?\.isLocked/);
});

test("C.3-C.4: draft PR must remain isolated from main, Supabase and Vercel", () => {
  assert.equal(vercel.git.deploymentEnabled[branch], false);
  assert.equal(pkg.scripts["qa:s4c3c4"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4c3c4-general-averages-ui.mjs");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /feature\/schoolnet-s4c3c3533-backup-restore-gates-20261126/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow,
    /supabase (?:link|db push|db reset|migration repair)|secrets\.|SUPABASE_DB_URL|SUPABASE_ACCESS_TOKEN/);
});
