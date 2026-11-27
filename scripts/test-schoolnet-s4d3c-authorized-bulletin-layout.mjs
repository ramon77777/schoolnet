import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeDemoCurriculum, makeDemoGeneralPreview, makeDemoGradeConfig, DEMO_SCHOOLS } from "../src/features/schools/lib/schoolOfficialGeneralAveragesDemo.ts";
import { validateAuthorizedReportCardPreview } from "../src/features/official-documents/lib/schoolAuthorizedReportCardModel.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const layout = read("src/features/official-documents/pages/SchoolAuthorizedReportCardLayout.tsx");
const wrapper = read("src/features/official-documents/pages/SchoolAuthorizedStudentReportCard.tsx");
const page = read("src/features/schools/pages/LocalSchoolOfficialGeneralAverages.tsx");
const vercel = JSON.parse(read("vercel.json"));
const pkg = JSON.parse(read("package.json"));
const branch = "feature/schoolnet-s4d3c-authorized-bulletin-layout-20261127";
const config = makeDemoGradeConfig(DEMO_SCHOOLS[0].id);
const scope = {
  schoolId: DEMO_SCHOOLS[0].id, schoolYearId: config.years[0].id,
  classId: config.subjects[0].classId, periodId: config.periods[0].id,
};
const curriculum = makeDemoCurriculum(scope);
const general = makeDemoGeneralPreview(scope);
const make = (student, scores, states) => ({
  projection: "schoolnet_v2_report_card_provisional_v1",
  ...scope, studentId: student.studentId, studentName: student.studentName,
  schoolAdminScoped: true, previewOnly: true, documentState: "provisional",
  state: student.state, averageOn20: student.averageOn20,
  expectedSubjects: student.expectedSubjects, readySubjects: student.readySubjects,
  subjects: curriculum.subjects.map((subject, i) => ({
    subjectId: subject.subjectId, subjectName: subject.subjectName,
    coefficient: subject.coefficient, state: states[i], averageOn20: scores[i],
    includedAssessments: states[i] === "not_configured" ? 0 : 1,
    publishedAssessments: states[i] === "ready" ? 1 : 0,
    missingAssessments: states[i] === "incomplete" ? 1 : 0,
  })),
});

test("S4-D.3c: layout accepts only an upstream validated V2 report-card model", () => {
  assert.match(wrapper, /validate|readAuthorizedStudentReportCard/);
  assert.match(wrapper, /SchoolAuthorizedReportCardLayout/);
  assert.match(wrapper, /report=\{report\}/);
  assert.match(wrapper, /const report=result\?\.key===key && state==="ready"/);
  assert.match(layout, /report: AuthorizedReportCardPreview/);
  assert.doesNotMatch(layout, /supabase|fetch\(|\.rpc\(/);
});
test("S4-D.3c: school scope displayed from the active admin selection", () => {
  for (const name of ["schoolName", "schoolYearName", "className", "periodName"]) {
    assert.match(wrapper, new RegExp(name + "=\\{" + name + "\\}"));
    assert.match(layout, new RegExp("label\\(" + name + "\\)"));
  }
  assert.match(page, /schoolName=\{selectedSchool\?\.name/);
  assert.match(page, /schoolYearName=\{currentConfig\?\.years\.find/);
  assert.match(page, /className=\{classes\.find/);
  assert.match(page, /periodName=\{selectedPeriod\?\.name/);
  assert.match(page, /selectedReview\?\.scopeKey === reviewKey/);
});
test("S4-D.3c: complete / zero / incomplete scores are accepted without re-computation", () => {
  const a=validateAuthorizedReportCardPreview(make(general.students[0],
    [17.17,16.42,15.92],["ready","ready","ready"]),scope,general.students[0].studentId,curriculum,general);
  const z=validateAuthorizedReportCardPreview(make(general.students[1],
    [0,0,0],["ready","ready","ready"]),scope,general.students[1].studentId,curriculum,general);
  const i=validateAuthorizedReportCardPreview(make(general.students[2],
    [11,12,null],["ready","ready","incomplete"]),scope,general.students[2].studentId,curriculum,general);
  assert.equal(a.averageOn20,16.67);
  assert.equal(z.averageOn20,0);
  assert.equal(i.averageOn20,null);
  assert.equal(i.subjects[2].averageOn20,null);
  assert.match(layout,/grade\(report.averageOn20\)/);
  assert.match(layout,/grade\(subject.averageOn20\)/);
  assert.doesNotMatch(layout,/\.reduce\(|weightedSum|Math\.round/);
});
test("S4-D.3c: incomplete report never masquerades as published", () => {
  assert.match(layout,/report.state !== "ready"/);
  assert.match(layout,/note absente n'est jamais remplacée par zéro/);
  assert.match(layout,/Document non valable/);
  assert.match(layout,/Non publié/);
  assert.match(layout,/Non disponible/);
  assert.match(layout,/Non renseignée/);
  assert.doesNotMatch(layout,/window\.print|download=|\.save\(|\.insert\(|\.update\(/i);
});
test("S4-D.3c: real RPC failure cannot mount a fictional bulletin", () => {
  assert.match(wrapper,/localDemo \? await import/);
  assert.match(wrapper,/isReportCardRpcPending/);
  assert.match(wrapper,/state==="pending"/);
  assert.match(wrapper,/state==="error"/);
  assert.match(wrapper,/\{report && <>/);
  assert.match(page,/import\.meta\.env\.DEV/);
  assert.match(layout,/fictional \? "Spécimen fictif"/);
});
test("S4-D.3c: zero deploy, one specialized QA command", () => {
  assert.equal(vercel.git.deploymentEnabled[branch],false);
  assert.equal(pkg.scripts["qa:s4d3c"],
    "node --experimental-strip-types --test scripts/test-schoolnet-s4d3c-authorized-bulletin-layout.mjs");
});
