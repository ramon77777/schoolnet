import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {computeOfficialAveragePreview}
 from "../src/features/schools/lib/schoolOfficialAverageMath.ts";

const entry=(overrides={})=>({
 assessmentId:"quiz-1",subjectId:"math",coefficient:1,
 includeInAverage:true,status:"published",
 score:20,maxScore:20,publishedAt:"2026-11-23T14:47:58.035Z",
 ...overrides,
});
const subject=(overrides={})=>({subjectId:"math",coefficient:2,...overrides});

test("C3-B.1 — temoin publie 20/20, coeff matiere 2, evaluation 1",()=>{
 const r=computeOfficialAveragePreview([subject()],[entry()]);
 assert.deepEqual(r,{
  previewOnly:true,state:"ready",averageOn20:20,
  subjects:[{subjectId:"math",coefficient:2,averageOn20:20,
   includedAssessments:1,publishedAssessments:1,missingAssessments:0}],
 });
 assert.equal(Object.hasOwn(r,"studentId"),false);
 assert.equal(Object.hasOwn(r,"rank"),false);
});

test("C3-B.1 — evaluation et matiere ponderees sans arrondi intermediaire",()=>{
 const r=computeOfficialAveragePreview(
  [subject(),{subjectId:"french",coefficient:1}],
  [entry({assessmentId:"math-a",score:15,coefficient:2}),
   entry({assessmentId:"math-b",score:10,maxScore:10,coefficient:1}),
   entry({assessmentId:"french-a",subjectId:"french",score:12,coefficient:1})],
 );
 assert.equal(r.state,"ready");
 assert.equal(r.subjects[0].averageOn20,16.67);
 assert.equal(r.subjects[1].averageOn20,12);
 assert.equal(r.averageOn20,15.11);
});

test("C3-B.1 — unpublished/missing reste absent, jamais zero par defaut",()=>{
 const r=computeOfficialAveragePreview([subject()],[
  entry({assessmentId:"pub",score:12}),
  entry({assessmentId:"awaiting",status:"not_published",
   score:null,maxScore:null,publishedAt:null}),
 ]);
 assert.equal(r.state,"incomplete");
 assert.equal(r.subjects[0].averageOn20,12);
 assert.equal(r.subjects[0].missingAssessments,1);
 assert.equal(r.averageOn20,null);
});

test("C3-B.1 — zero est valide UNIQUEMENT quand explicitement publie",()=>{
 const r=computeOfficialAveragePreview([subject()],[entry({score:0})]);
 assert.equal(r.state,"ready");
 assert.equal(r.averageOn20,0);
 assert.throws(()=>computeOfficialAveragePreview([subject()],[entry({
   status:"not_published",score:0,maxScore:null,publishedAt:null,
 })]),/UNPUBLISHED_SCORE/);
 assert.throws(()=>computeOfficialAveragePreview([subject()],[entry({
   status:"not_published",score:null,maxScore:null,
 })]),/UNPUBLISHED_SCORE/);
});

test("C3-B.1 — non inclus, coefficient manquant et discipline sans notes",()=>{
 const excluded=computeOfficialAveragePreview([subject()],[
  entry({includeInAverage:false,score:0}),
  entry({assessmentId:"valid",score:18}),
 ]);
 assert.equal(excluded.averageOn20,18);
 assert.equal(excluded.subjects[0].includedAssessments,1);
 const noSubjectCoefficient=computeOfficialAveragePreview([subject({coefficient:null})],[entry()]);
 assert.equal(noSubjectCoefficient.state,"incomplete");
 assert.equal(noSubjectCoefficient.averageOn20,null);
 const noGrades=computeOfficialAveragePreview(
  [subject(),{subjectId:"history",coefficient:1}],[entry()]);
 assert.equal(noGrades.state,"incomplete");
 assert.equal(noGrades.averageOn20,null);
 assert.equal(noGrades.subjects[1].averageOn20,null);
 assert.equal(computeOfficialAveragePreview([],[]).state,"no_subjects");
});

test("C3-B.1 — refuse doublons, discipline et notes hors barème",()=>{
 for(const input of [
  [entry({score:-1})],
  [entry({score:21})],
  [entry({maxScore:0})],
  [entry({coefficient:0})],
  [entry({publishedAt:null})],
  [entry({subjectId:"foreign"})],
  [entry(),entry()],
 ])assert.throws(()=>computeOfficialAveragePreview([subject()],input));
 assert.throws(()=>computeOfficialAveragePreview([subject(),subject()],[entry()]));
});

test("C3-B.1 — aucun chemin de lecture V1 ni publication dans le moteur",()=>{
 const src=readFileSync(new URL(
  "../src/features/schools/lib/schoolOfficialAverageMath.ts",import.meta.url),"utf8");
 assert.doesNotMatch(src,/from\s+["']@\/lib\/supabaseClient/);
 assert.doesNotMatch(src,/\.rpc\s*\(/);
 assert.doesNotMatch(src,/\.from\s*\(/);
 assert.doesNotMatch(src,/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b/i);
 assert.doesNotMatch(src,/teacher_class_average_results|student_period_averages/);
});
