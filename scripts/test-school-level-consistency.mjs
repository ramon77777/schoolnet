import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSchoolLevel, resolveSchoolLevelCatalog } from '../src/features/enrollments/lib/schoolLevelConsistency.ts';

const catalog = [
  {slug:'4e',name:'Quatrieme',short_label:'4e',is_visible:true},
  {slug:'6e',name:'Sixieme',short_label:'6e',is_visible:true},
  {slug:'1ere',name:'Premiere',short_label:'1re',is_visible:true},
  {slug:'terminale',name:'Terminale',short_label:'Tle',is_visible:true},
];
const academic = [{id:4,name:'6e'}];
const classes = [
  {id:'x',name:'6e A',level_id:4,school_year:'2025-2026'},
  {id:'y',name:'6e B',level_id:4,school_year:'2026-2027'},
];
function resolve(level, a=academic, c=classes, years=['2026-2027'], p=catalog) {
  return resolveSchoolLevelCatalog({requestedLevel:level,publicLevels:p,academicLevels:a,classes:c,currentYears:years});
}

test('4e is in public catalog but missing in academic levels', () => {
  const r=resolve('4e');
  assert.equal(r.state,'academic_catalog_missing');
  assert.equal(r.publicLevel?.slug,'4e');
  assert.equal(r.classes.length,0);
});
test('Quatrieme written in full resolves to the same 4e public entry',()=>{
  assert.equal(resolve('Quatrieme').state,'academic_catalog_missing');
});
test('6e existing academic level and current class is offered',()=>{
  const r=resolve('6e');
  assert.equal(r.state,'classes_available');
  assert.equal(r.currentClasses.length,1);
  assert.equal(r.currentClasses[0].name,'6e B');
});
test('after academic 4e sync, but before class opening, message is no class',()=>{
  const r=resolve('4e',[...academic,{id:15,name:'4e'}]);
  assert.equal(r.state,'classes_missing');
});
test('once 4e class is created for current year, it becomes available',()=>{
  const r=resolve('4e',[...academic,{id:15,name:'4e'}],
    [...classes,{id:'z',level_id:15,name:'4e A',school_year:'2026-2027'}]);
  assert.equal(r.state,'classes_available');
  assert.deepEqual(r.currentClasses.map(c=>c.name),['4e A']);
});
test('classes only from an old year must not be proposed as current',()=>{
  const r=resolve('4e',[...academic,{id:15,name:'4e'}],
    [...classes,{id:'z',level_id:15,name:'4e A',school_year:'2025-2026'}]);
  assert.equal(r.state,'classes_other_school_year');
  assert.equal(r.currentClasses.length,0);
  assert.equal(r.classes.length,1);
});
test('academic level not found in public catalog is flagged, not auto-added',()=>{
  const r=resolve('Unlisted',[...academic,{id:17,name:'Unlisted'}]);
  assert.equal(r.state,'public_catalog_missing_for_academic');
});
test('unknown level is not silently matched to an unrelated class',()=>{
  const r=resolve('CP3');
  assert.equal(r.state,'public_catalog_missing');
  assert.equal(r.classes.length,0);
});
test('unprovided level is not matched',()=>{
  assert.equal(resolve(null).state,'missing_request');
});
test('ambiguity in academic levels is detected',()=>{
  const r=resolve('4e',[...academic,{id:14,name:'4e'},{id:15,name:'Quatrieme'}]);
  assert.equal(r.state,'academic_catalog_ambiguous');
});
test('short labels and accented variants are normalized predictably',()=>{
  assert.equal(normalizeSchoolLevel('Quatrieme'),'4e');
  assert.equal(normalizeSchoolLevel('Quatri\u00e8me'),'4e');
  assert.equal(normalizeSchoolLevel('1\u00e8re'),'1ere');
  assert.equal(normalizeSchoolLevel('1re'),'1ere');
  assert.equal(normalizeSchoolLevel('Tle'),'terminale');
  assert.equal(normalizeSchoolLevel('2nde'),'2nde');
});
test('a public level never causes school records to be inserted',()=>{
  const before=JSON.stringify({catalog,academic,classes});
  resolve('4e'); resolve('6e');
  assert.equal(JSON.stringify({catalog,academic,classes}),before);
});