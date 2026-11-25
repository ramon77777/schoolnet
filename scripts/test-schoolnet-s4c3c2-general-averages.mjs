import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {computeSchoolOfficialGeneralPreview}
  from "../src/features/schools/lib/schoolOfficialGeneralAverageMath.ts";
import {computeOfficialAveragePreview}
  from "../src/features/schools/lib/schoolOfficialAverageMath.ts";

const scope=Object.freeze({
  schoolId:"ecole-A",schoolYearId:"2026-2027",classId:"6-A",
  periodId:"T1",studentId:"eleve-A",
});
const publishedAt="2026-11-25T12:00:00.000Z";
const subject=(subjectId,coefficient=1,extra={})=>({
  schoolId:scope.schoolId,schoolYearId:scope.schoolYearId,
  classId:scope.classId,periodId:scope.periodId,
  subjectId,coefficient,participation:"required",...extra,
});
const assessment=(assessmentId,subjectId,score=15,extra={})=>({
  ...scope,assessmentId,subjectId,coefficient:1,includeInAverage:true,
  status:"published",score,maxScore:20,publishedAt,...extra,
});
const input=(extra={})=>({
  scope:{...scope},curriculumApproved:true,enrollmentState:"active",
  expectedSubjects:[subject("math",2),subject("francais",1)],
  assessments:[assessment("math-1","math"),assessment("fr-1","francais",12)],
  ...extra,
});
const run=(extra={})=>computeSchoolOfficialGeneralPreview(input(extra));

test("C3-C.2: moyenne generale 2 matieres ponderees et non publiee",()=>{
  const p=run();
  assert.equal(p.state,"ready");
  assert.equal(p.averageOn20,14);
  assert.equal(p.expectedSubjects,2);
  assert.equal(p.readySubjects,2);
  assert.equal(p.previewOnly,true);
  assert.equal(Object.hasOwn(p,"studentId"),false);
  assert.equal(Object.hasOwn(p,"schoolId"),false);
});

test("C3-C.2: aucune erreur par arrondi intermediaire des matieres",()=>{
  const p=run({
    assessments:[
      assessment("math-fraction","math",2,{maxScore:3}),
      assessment("fr-decimal","francais",13.34),
    ],
  });
  assert.equal(p.subjects[0].averageOn20,13.33);
  assert.equal(p.averageOn20,13.34);
  // The incorrect two-step rounding would give 13.33, not 13.34.
  assert.notEqual(p.averageOn20,
    Math.round(((13.33*2+13.34)/3)*100)/100);
});

test("C3-C.2: zero publie vaut zero, pas une absence",()=>{
  const p=run({
    assessments:[assessment("m0","math",0),
      assessment("f0","francais",0)],
  });
  assert.equal(p.state,"ready");
  assert.equal(p.averageOn20,0);
});

test("C3-C.2: note manquante = incomplet, jamais un zero implicite",()=>{
  const p=run({assessments:[
    assessment("m1","math",20),
    assessment("m2","math",null,{
      status:"not_published",maxScore:null,publishedAt:null,
    }),
    assessment("f1","francais",10),
  ]});
  assert.equal(p.state,"incomplete");
  assert.equal(p.averageOn20,null);
  assert.equal(p.subjects[0].state,"incomplete");
  assert.equal(p.subjects[0].averageOn20,null);
  assert.equal(p.subjects[0].missingAssessments,1);
});

test("C3-C.2: un resultat publie pour une evaluation exclue n'intervient pas",()=>{
  const p=run({assessments:[
    assessment("m1","math",20),
    assessment("m-excluded","math",0,{includeInAverage:false}),
    assessment("f1","francais",11),
  ]});
  assert.equal(p.state,"ready");
  assert.equal(p.averageOn20,17);
  assert.equal(p.subjects[0].includedAssessments,1);
});

test("C3-C.2: catalogue non valide => aucune moyenne exposee",()=>{
  const p=run({curriculumApproved:false});
  assert.equal(p.state,"not_configured");
  assert.equal(p.averageOn20,null);
  assert.ok(p.subjects.every((s)=>s.averageOn20===null));
});

test("C3-C.2: catalogue vide => non parametre",()=>{
  const p=run({expectedSubjects:[],assessments:[]});
  assert.equal(p.state,"not_configured");
  assert.equal(p.averageOn20,null);
  assert.equal(p.expectedSubjects,0);
});

test("C3-C.2: matiere attendue sans coefficient => non parametre",()=>{
  const p=run({expectedSubjects:[
    subject("math",2),subject("francais",null),
  ]});
  assert.equal(p.state,"not_configured");
  assert.equal(p.averageOn20,null);
  assert.equal(p.subjects[1].state,"not_configured");
});

test("C3-C.2: matiere attendue sans evaluation => non parametre",()=>{
  const p=run({expectedSubjects:[
    subject("math",2),subject("francais",1),subject("histoire",3),
  ]});
  assert.equal(p.state,"not_configured");
  assert.equal(p.subjects[2].state,"not_configured");
  assert.equal(p.averageOn20,null);
});

test("C3-C.2: dispense en attente n'efface pas une matiere du denominateur",()=>{
  const p=run({expectedSubjects:[
    subject("math",2),subject("francais",1,{participation:"exemption_pending"}),
  ]});
  assert.equal(p.state,"incomplete");
  assert.equal(p.averageOn20,null);
  assert.equal(p.subjects[1].state,"exemption_pending");
  assert.equal(p.subjects[1].averageOn20,null);
});

test("C3-C.2: transfert en verification bloque la moyenne generale",()=>{
  const p=run({enrollmentState:"transfer_review"});
  assert.equal(p.state,"incomplete");
  assert.equal(p.averageOn20,null);
  assert.ok(p.subjects.every((r)=>r.averageOn20===null));
});

test("C3-C.2: refuse le melange d'etablissements A/B et matieres absentes",()=>{
  assert.throws(()=>run({expectedSubjects:[
    subject("math",2),subject("francais",1,{schoolId:"ecole-B"}),
  ]}),/FOREIGN_SCHOOL_CONTEXT/);
  assert.throws(()=>run({assessments:[
    assessment("m1","math",12,{schoolId:"ecole-B"}),
    assessment("f1","francais",10),
  ]}),/FOREIGN_SCHOOL_CONTEXT/);
  assert.throws(()=>run({assessments:[
    assessment("m1","math",12),
    assessment("f1","francais",10,{subjectId:"anglais"}),
  ]}),/UNEXPECTED_SUBJECT/);
});

test("C3-C.2: refuse toutes les incoherences ecole/annee/classe/periode/eleve",()=>{
  for (const key of ["schoolYearId","classId","periodId","studentId"]) {
    assert.throws(()=>run({assessments:[
      assessment("m1","math",10,{[key]:"foreign-"+key}),
      assessment("f1","francais",10),
    ]}),/FOREIGN_SCHOOL_CONTEXT|FOREIGN_STUDENT/);
  }
});

test("C3-C.2: refuse doublons matiere et evaluation",()=>{
  assert.throws(()=>run({expectedSubjects:[
    subject("math",2),subject("math",1),
  ]}),/DUPLICATE_SUBJECT/);
  assert.throws(()=>run({assessments:[
    assessment("dup","math",12),
    assessment("dup","francais",10),
  ]}),/DUPLICATE_ASSESSMENT/);
});

test("C3-C.2: barèmes et coefficients invalides restent refuses par B.1",()=>{
  for (const extra of [
    {score:-1},{score:21},{maxScore:0},{coefficient:0},
    {coefficient:20.001},{publishedAt:null},
  ]) {
    assert.throws(()=>run({assessments:[
      assessment("m1","math",12,extra),
      assessment("f1","francais",12),
    ]}));
  }
  assert.throws(()=>run({expectedSubjects:[
    subject("math",0),subject("francais",1),
  ]}));
});

test("C3-C.2: refuse scope incomplet et contrat incoherent",()=>{
  assert.throws(()=>run({scope:{...scope,schoolId:""}}),/INVALID_SCOPE/);
  assert.throws(()=>run({curriculumApproved:"yes"}),/INVALID_CONTRACT/);
  assert.throws(()=>run({enrollmentState:"inactive"}),/INVALID_CONTRACT/);
  assert.throws(()=>run({expectedSubjects:[
    subject("math",2,{participation:"approved_exemption"}),
    subject("francais",1),
  ]}),/INVALID_PARTICIPATION/);
  assert.throws(()=>run({expectedSubjects:[
    subject("math",2,{periodId:"T2"}),subject("francais",1),
  ]}),/FOREIGN_SCHOOL_CONTEXT/);
});

test("C3-C.2: aucune mutation des donnees et aucun etat prive dans le resultat",()=>{
  const i=input();
  Object.freeze(i.expectedSubjects[0]);
  Object.freeze(i.expectedSubjects[1]);
  Object.freeze(i.assessments[0]);
  Object.freeze(i.assessments[1]);
  Object.freeze(i.expectedSubjects);
  Object.freeze(i.assessments);
  Object.freeze(i.scope);
  Object.freeze(i);
  const p=computeSchoolOfficialGeneralPreview(i);
  assert.equal(p.state,"ready");
  assert.equal(Object.hasOwn(p,"scope"),false);
  assert.equal(Object.hasOwn(p,"studentId"),false);
  assert.equal(Object.hasOwn(p,"assessments"),false);
});

test("C3-C.2: pas de lecture Supabase, V1, bulletin ou publication",()=>{
  const path=new URL(
    "../src/features/schools/lib/schoolOfficialGeneralAverageMath.ts",
    import.meta.url);
  const src=readFileSync(path,"utf8");
  assert.doesNotMatch(src,/supabaseClient|service_role|\.rpc\s*\(|\.from\s*\(/);
  assert.doesNotMatch(src,/student_period_averages|generate_report_card|publish_admin_report_card/);
  assert.match(src,/computeOfficialAveragePreview/);
});

test("C3-C.2: temoin C.3-B.1 inchange",()=>{
  const r=computeOfficialAveragePreview(
    [{subjectId:"math",coefficient:2}],
    [{assessmentId:"a",subjectId:"math",coefficient:1,
      includeInAverage:true,status:"published",score:20,maxScore:20,
      publishedAt}],
  );
  assert.equal(r.averageOn20,20);
  assert.equal(r.previewOnly,true);
});
