import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {buildParentChildCards,linkedStudentIds} from
 '../src/features/parent/lib/parentChildViews.ts';

const parentPage=readFileSync(
 new URL('../src/features/parent/pages/ParentChildren.tsx',import.meta.url),'utf8');

function fixture(overrides={}){
 return {
  links:[{student_id:'enfant-a'},{student_id:'enfant-b'}],
  parentChildIds:['enfant-a','enfant-b'],
  profiles:[
   {id:'enfant-a',role:'student',full_name:'Aya'},
   {id:'enfant-b',role:'student',full_name:'Benoît'},
  ],
  classStudents:[],classes:[],classLookupUnavailable:false,
  ...overrides,
 };
}
test('01 - two children of one Parent remain visible without any class',()=>{
 const r=buildParentChildCards(fixture());
 assert.equal(r.children.length,2);
 assert.deepEqual(r.children.map(x=>x.name),['Aya','Benoît']);
 assert.deepEqual(r.children.map(x=>x.classState),['unassigned','unassigned']);
 assert.ok(r.children.every(x=>x.classLabel==='Affectation scolaire à venir'));
 assert.equal(r.linksMissingFromParentProfile,0);
});
test('02 - child_ids alone never authorizes additional child profiles',()=>{
 const r=buildParentChildCards(fixture({
  parentChildIds:['enfant-a','enfant-b','enfant-intrus'],
  profiles:[...fixture().profiles,
   {id:'enfant-intrus',role:'student',full_name:'Profil non autorisé'}]
 }));
 assert.deepEqual(r.children.map(x=>x.id),['enfant-a','enfant-b']);
 assert.ok(!r.children.some(x=>x.name.includes('autorisé')));
});
test('03 - duplicate links do not create duplicate cards',()=>{
 const rows=[{student_id:' enfant-a '},{student_id:'enfant-a'},
  {student_id:''},{student_id:'enfant-b'}];
 assert.deepEqual(linkedStudentIds(rows),['enfant-a','enfant-b']);
 const r=buildParentChildCards(fixture({links:rows}));
 assert.equal(r.children.length,2);
});
test('04 - latest recorded class is displayed without claiming current enrollment',()=>{
 const r=buildParentChildCards(fixture({
  classStudents:[
   {student_id:'enfant-a',class_id:'ancienne',created_at:'2025-11-01T00:00:00Z'},
   {student_id:'enfant-a',class_id:'nouvelle',created_at:'2026-11-01T00:00:00Z'},
  ],
  classes:[{id:'ancienne',name:'6e A'},{id:'nouvelle',name:'5e B'}],
 }));
 assert.equal(r.children[0].classState,'assigned');
 assert.equal(r.children[0].classLabel,'5e B');
 assert.equal(r.children[1].classState,'unassigned');
});
test('05 - school/class loading error cannot hide verified family links',()=>{
 const r=buildParentChildCards(fixture({
  classLookupUnavailable:true,
  classStudents:[],classes:[],
 }));
 assert.equal(r.children.length,2);
 assert.ok(r.children.every(x=>x.classState==='unavailable'));
 assert.ok(r.children.every(x=>x.classLabel==='Information de classe indisponible'));
});
test('06 - missing class metadata is unknown, not an unassigned child',()=>{
 const r=buildParentChildCards(fixture({
  classStudents:[{student_id:'enfant-a',class_id:'non-lisible',
   created_at:'2026-11-01T00:00:00Z'}],
 }));
 assert.equal(r.children[0].classState,'unavailable');
 assert.equal(r.children[1].classState,'unassigned');
});
test('07 - parent child_ids mismatch and missing linked profile are reported',()=>{
 const r=buildParentChildCards(fixture({
  parentChildIds:['enfant-a'],
  profiles:fixture().profiles.filter(x=>x.id==='enfant-a'),
 }));
 assert.equal(r.children.length,1);
 assert.equal(r.linksMissingFromParentProfile,1);
 assert.equal(r.linkedProfilesNotVisible,1);
});
test('08 - non-student and non-linked profiles never appear',()=>{
 const r=buildParentChildCards(fixture({
  profiles:[{id:'enfant-a',full_name:'Aya',role:'parent'},
   {id:'enfant-b',full_name:'Benoît',role:'student'},
   {id:'extra',full_name:'Extra',role:'student'}],
 }));
 assert.deepEqual(r.children.map(x=>x.id),['enfant-b']);
 assert.equal(r.linkedProfilesNotVisible,1);
});
test('09 - UI reads parent_links by user and profiles by those IDs only',()=>{
 assert.match(parentPage,/from\('parent_links'\)/);
 assert.match(parentPage,/\.eq\('parent_id',user\.id\)/);
 assert.match(parentPage,/\.in\('id',studentIds\)\.eq\('role','student'\)/);
 assert.match(parentPage,/buildParentChildCards\(/);
 assert.doesNotMatch(parentPage,/\.in\(['"]id['"],\s*parent\.child_ids/);
});
test('10 - class errors remain nonfatal, stale responses are ignored',()=>{
 assert.match(parentPage,/if\(studentsResponse\.error\)\{/);
 assert.match(parentPage,/setChildren\(result\.children\)/);
 assert.match(parentPage,/classLookupUnavailable/);
 assert.match(parentPage,/const run=\+\+generation\.current/);
 assert.match(parentPage,/generation\.current\+=1/);
});
